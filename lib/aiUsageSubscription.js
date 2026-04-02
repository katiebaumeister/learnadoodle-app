import { supabase } from './supabase';

/**
 * @param {string} familyId
 * @returns {Promise<number|null>}
 */
export async function fetchFamilyAiUnitsUsedThisMonth(familyId) {
  if (!familyId) return null;
  const { data, error } = await supabase.rpc('get_family_ai_units_used_this_month', {
    p_family_id: familyId,
  });
  if (error) return null;
  return typeof data === 'number' ? data : null;
}
