/**
 * Materials area: queries and archive path via materialsClient.
 * Pure parsing lives in materialParse.js (Node-testable).
 */

import { getMaterials, archiveMaterial, updateMaterial, createMaterial, linkMaterialToChild } from '../services/materialsClient.js';
import { supabase } from '../supabase.js';

export {
  summarizeMaterialLine,
  resolveMaterialFromUserMessage,
  stripMaterialForDisambiguation,
  parseRenameMaterialTitles,
  extractHttpUrl,
  parseAddMaterialLinkIntent,
} from './materialParse.js';

/**
 * @param {string} familyId
 * @returns {Promise<{ materials: object[], error: Error | null }>}
 */
export async function fetchMaterialsForChat(familyId) {
  try {
    const list = await getMaterials(familyId, {}, null);
    const materials = Array.isArray(list) ? list.slice(0, 200) : [];
    return { materials, error: null };
  } catch (e) {
    return { materials: [], error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/**
 * Soft-delete via materialsClient (RPC delete_material + fallback).
 */
export async function executeArchiveMaterialChat(familyId, materialId) {
  try {
    await archiveMaterial(materialId, familyId);
    return {
      success: true,
      userMessage: 'Removed from your materials. You can restore it from Materials > trash if needed.',
    };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}

export async function executeRenameMaterialChat(materialId, newTitle) {
  const title = String(newTitle || '').trim();
  if (!title) return { success: false, error: 'New title is empty.' };
  try {
    await updateMaterial(materialId, { title });
    return { success: true, userMessage: `Renamed to **${title}**.` };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}

/**
 * Insert a link-style material row and optionally link to a child.
 */
export async function executeCreateLinkMaterialChat(familyId, { title, providerUrl, childId, subjectId }) {
  const t = String(title || '').trim() || 'Link';
  const u = String(providerUrl || '').trim();
  if (!u) return { success: false, error: 'Missing link URL.' };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const materialData = {
      family_id: familyId,
      title: t,
      type: 'other',
      provider_url: u,
      created_by: user?.id || null,
      subject_id: subjectId || null,
    };
    const material = await createMaterial(materialData);
    if (childId && material?.id) {
      await linkMaterialToChild(material.id, childId, familyId, 'planned');
    }
    return {
      success: true,
      userMessage: `Added **${material.title || t}** to your materials.`,
      materialId: material?.id,
    };
  } catch (e) {
    return { success: false, error: e?.message || String(e) };
  }
}
