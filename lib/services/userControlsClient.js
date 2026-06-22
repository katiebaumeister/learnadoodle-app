/**
 * Parent-configured permissions for child/tutor accounts (family_user_controls).
 */

import { supabase } from '../supabase';
import { apiRequest } from '../apiClient';

/** UI flag keys → DB columns */
export const USER_CONTROL_KEYS = {
  events: 'can_add_edit_events',
  subjects: 'can_add_edit_subjects',
  child_profile: 'can_add_edit_child_profile',
  materials: 'can_add_edit_materials',
  plans: 'can_add_edit_plans',
  planning_preferences: 'can_change_planning_preferences',
};

export function rowToFlagMap(row) {
  const base = {
    // Children/tutors cannot add or edit calendar events unless a parent explicitly
    // turns this on. Other capabilities remain enabled by default.
    events: false,
    subjects: true,
    child_profile: true,
    materials: true,
    plans: true,
    planning_preferences: true,
  };
  if (!row) return base;
  for (const [uiKey, col] of Object.entries(USER_CONTROL_KEYS)) {
    if (typeof row[col] === 'boolean') base[uiKey] = row[col];
  }
  return base;
}

export function flagMapToRow(flags) {
  const out = {};
  for (const [uiKey, col] of Object.entries(USER_CONTROL_KEYS)) {
    if (typeof flags[uiKey] === 'boolean') out[col] = flags[uiKey];
  }
  return out;
}

export async function getFamilyUserControls(familyId) {
  if (!familyId) return { data: null, error: null };
  const { data, error } = await supabase
    .from('family_user_controls')
    .select('*')
    .eq('family_id', familyId)
    .maybeSingle();
  if (error) return { data: null, error };
  return { data: data || null, error: null };
}

export async function saveFamilyUserControls(familyId, flags) {
  if (!familyId) return { error: new Error('familyId required') };
  const payload = { family_id: familyId, ...flagMapToRow(flags) };
  const { error } = await supabase.from('family_user_controls').upsert(payload, { onConflict: 'family_id' });
  return { error: error || null };
}

export async function getFamilyUserControlsSettings() {
  return apiRequest('/api/family/user-controls', { method: 'GET' });
}

export async function updateFamilyUserControlsSettings(payload) {
  return apiRequest('/api/family/user-controls', {
    method: 'PATCH',
    body: JSON.stringify(payload || {}),
  });
}
