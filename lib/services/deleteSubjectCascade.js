/**
 * Full subject delete (same steps as AddSubjectModal performDeleteSubject).
 * Keeps planner, events, materials, syllabi, and curriculum_units consistent.
 */

import { supabase } from '../supabase.js';
import { invalidatePlanHealthCache } from './academicYearClient';
import { dropAllPlanYearCachesForFamily } from '../planEditListCache';
import { prefetchPlanEditListForFamily } from './plannerPrefetch';

/** Remove instructional blocks and per-subject targets that reference a deleted subject. */
export async function removeSubjectFromFamilyPlanRows(supabaseClient, familyId, subjectId) {
  const sid = String(subjectId);
  const { data: rows, error } = await supabaseClient
    .from('academic_year_plan')
    .select('id, blocks, subject_targets')
    .eq('family_id', familyId);
  if (error) {
    console.warn('[deleteSubjectCascade] academic_year_plan cleanup:', error.message || error);
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) return;
  const nowIso = new Date().toISOString();
  for (const row of rows) {
    const blocks = Array.isArray(row.blocks) ? row.blocks : [];
    const newBlocks = blocks.filter((b) => String(b?.subject_id || '') !== sid);
    const st =
      row.subject_targets && typeof row.subject_targets === 'object' ? { ...row.subject_targets } : null;
    const hadTarget = st && Object.prototype.hasOwnProperty.call(st, sid);
    if (hadTarget) delete st[sid];
    const blocksChanged = newBlocks.length !== blocks.length;
    const targetsChanged = Boolean(hadTarget);
    if (!blocksChanged && !targetsChanged) continue;
    const patch = { updated_at: nowIso };
    if (blocksChanged) patch.blocks = newBlocks;
    if (targetsChanged) patch.subject_targets = st && Object.keys(st).length > 0 ? st : {};
    const { error: upErr } = await supabaseClient.from('academic_year_plan').update(patch).eq('id', row.id);
    if (upErr) {
      console.warn('[deleteSubjectCascade] academic_year_plan row update:', upErr.message || upErr);
    }
  }
}

/** Best-effort: remove imported curriculum rows tagged with this subject name. */
export async function deleteCurriculumUnitsForSubjectTag(supabaseClient, familyId, subjectName) {
  const name = (subjectName || '').trim();
  if (!name) return;
  try {
    const { data: units, error } = await supabaseClient
      .from('curriculum_units')
      .select('id')
      .eq('family_id', familyId)
      .contains('subject_tags', [name]);
    if (error || !units?.length) return;
    const unitIds = units.map((u) => u.id).filter(Boolean);
    if (unitIds.length === 0) return;
    await supabaseClient.from('curriculum_lessons').delete().in('unit_id', unitIds);
    try {
      await supabaseClient.from('curriculum_pacing').delete().in('unit_id', unitIds);
    } catch (_) {
      /* optional */
    }
    await supabaseClient.from('curriculum_units').delete().in('id', unitIds);
  } catch (e) {
    console.warn('[deleteSubjectCascade] curriculum cleanup:', e?.message || e);
  }
}

export async function deleteSubjectAuxiliaryRows(supabaseClient, subjectId) {
  const sid = String(subjectId);
  for (const tbl of ['subject_track', 'subject_goals']) {
    try {
      await supabaseClient.from(tbl).delete().eq('subject_id', sid);
    } catch (_) {
      /* optional tables */
    }
  }
}

/** Prevent FK violations when deleting a subject referenced by outcomes. */
export async function clearEventOutcomeSubjectReferences(supabaseClient, subjectId) {
  const sid = String(subjectId || '').trim();
  if (!sid) return;
  try {
    const { error } = await supabaseClient
      .from('event_outcomes')
      .update({ subject_id: null })
      .eq('subject_id', sid);
    if (error) {
      console.warn('[deleteSubjectCascade] event_outcomes subject_id cleanup:', error.message || error);
    }
  } catch (err) {
    console.warn('[deleteSubjectCascade] event_outcomes subject_id cleanup exception:', err?.message || err);
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ ok: true, deletedName: string } | { ok: false, error: string }>}
 */
export async function deleteSubjectCascade(supabaseClient, familyId, subjectId, subjectDisplayName) {
  const deletedName = (subjectDisplayName || 'Subject').trim();
  try {
    await removeSubjectFromFamilyPlanRows(supabaseClient, familyId, subjectId);
    await deleteSubjectAuxiliaryRows(supabaseClient, subjectId);
    await clearEventOutcomeSubjectReferences(supabaseClient, subjectId);
    const deletedAt = new Date().toISOString();
    const { error: evErr } = await supabaseClient
      .from('events')
      .update({ deleted_at: deletedAt })
      .eq('subject_id', subjectId)
      .eq('family_id', familyId)
      .is('deleted_at', null);
    if (evErr) throw evErr;
    await supabaseClient.from('materials').delete().eq('subject_id', subjectId);
    const { data: syllabi } = await supabaseClient.from('syllabi').select('id').eq('subject_id', subjectId);
    if (syllabi && syllabi.length > 0) {
      const syllabusIds = syllabi.map((s) => s.id);
      await supabaseClient.from('syllabus_sections').delete().in('syllabus_id', syllabusIds);
      await supabaseClient.from('syllabi').delete().eq('subject_id', subjectId);
    }
    await deleteCurriculumUnitsForSubjectTag(supabaseClient, familyId, deletedName);
    const { error } = await supabaseClient.from('subject').delete().eq('id', subjectId).eq('family_id', familyId);
    if (error) throw error;
    return { ok: true, deletedName };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Plan cache + web refresh events (call after successful delete). */
export function dispatchSubjectDeletedSideEffects(familyId) {
  invalidatePlanHealthCache();
  dropAllPlanYearCachesForFamily(familyId);
  prefetchPlanEditListForFamily(familyId).catch(() => {});
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('refreshSubjects'));
  window.dispatchEvent(
    new CustomEvent('refreshCalendar', {
      detail: { forceInvalidate: true, skipHomeRefresh: false },
    })
  );
  window.dispatchEvent(new CustomEvent('refreshEvents'));
  if (familyId) {
    window.dispatchEvent(new CustomEvent('refreshMaterials', { detail: { familyId } }));
  }
  window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
  window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('planAppliedToCalendar'));
  }, 200);
}

/** Default client convenience for chat / scripts. */
export async function deleteSubjectCascadeForFamily(familyId, subjectId, subjectDisplayName) {
  return deleteSubjectCascade(supabase, familyId, subjectId, subjectDisplayName);
}
