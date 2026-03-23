/**
 * Family planner settings & exclusions.
 * Uses family_planner_settings and planner_exclusions tables.
 */

import { supabase } from '../supabase';

// ---------- family_planner_settings ----------

export const getFamilyPlannerSettings = async (familyId) => {
  if (!familyId) return { data: null, error: null };
  const { data, error } = await supabase
    .from('family_planner_settings')
    .select('*')
    .eq('family_id', familyId)
    .maybeSingle();
  if (error) return { data: null, error };
  return {
    data: data || {
      family_id: familyId,
      target_scope: 'overall',
      default_school_year: null,
      default_constraint_mode: 'none',
      default_target_days: null,
      default_target_hours: null,
      default_planned_hours_per_day: null,
      follow_public_holidays: true,
      holiday_country: 'US',
      holiday_region: null,
      allowed_weekdays: [1, 2, 3, 4, 5],
      default_day_start_time: null,
      default_day_end_time: null,
    },
    error: null,
  };
};

export const saveFamilyPlannerSettings = async (familyId, payload) => {
  if (!familyId) return { error: new Error('familyId required') };
  const { error } = await supabase
    .from('family_planner_settings')
    .upsert(
      { family_id: familyId, ...payload },
      { onConflict: 'family_id' }
    );
  return { error: error || null };
};

// ---------- planner_exclusions ----------

export const getFamilyExclusions = async (familyId, scopeType = 'family_default') => {
  if (!familyId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('planner_exclusions')
    .select('*')
    .eq('family_id', familyId)
    .eq('scope_type', scopeType)
    .eq('is_active', true)
    .order('start_date', { ascending: true });
  if (error) return { data: [], error };
  return { data: data || [], error: null };
};

export const getAcademicYearExclusions = async (academicYearId) => {
  if (!academicYearId) return { data: [], error: null };
  const { data, error } = await supabase
    .from('planner_exclusions')
    .select('*')
    .eq('academic_year_id', academicYearId)
    .eq('scope_type', 'academic_year')
    .eq('is_active', true)
    .order('start_date', { ascending: true });
  if (error) return { data: [], error };
  return { data: data || [], error: null };
};

export const addExclusion = async (payload) => {
  const { data, error } = await supabase
    .from('planner_exclusions')
    .insert(payload)
    .select('*')
    .single();
  if (error) return { data: null, error };
  return { data, error: null };
};

export const updateExclusion = async (id, updates) => {
  const { data, error } = await supabase
    .from('planner_exclusions')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return { data: null, error };
  return { data, error: null };
};

export const deleteExclusion = async (id) => {
  const { error } = await supabase.from('planner_exclusions').delete().eq('id', id);
  return { error: error || null };
};

/**
 * Get merged plan defaults for Plan My Year: family settings + family exclusions.
 * Hierarchy: subject > plan > family. Caller combines with subject/plan data.
 */
export const getPlanDefaultsFromSettings = async (familyId) => {
  if (!familyId) return { settings: null, exclusions: [], excluded_holiday_dates: [], error: null };
  const [settingsRes, exclusionsRes] = await Promise.all([
    getFamilyPlannerSettings(familyId),
    getFamilyExclusions(familyId, 'family_default'),
  ]);
  if (settingsRes.error) return { settings: null, exclusions: [], excluded_holiday_dates: [], error: settingsRes.error };
  if (exclusionsRes.error) return { settings: settingsRes.data, exclusions: [], excluded_holiday_dates: [], error: exclusionsRes.error };
  const allExclusions = exclusionsRes.data || [];
  const holidaysAndBreaks = allExclusions.filter((e) => e.exclusion_type === 'holiday' || e.exclusion_type === 'break');
  const excludedHolidayDates = allExclusions
    .filter((e) => e.exclusion_type === 'excluded_date')
    .map((e) => (typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : e.start_date));
  return {
    settings: settingsRes.data,
    exclusions: holidaysAndBreaks,
    excluded_holiday_dates: excludedHolidayDates,
    error: null,
  };
};

/**
 * Save excluded public holiday dates (unchecked in U.S. public holidays picker).
 * Replaces all family_default excluded_date rows. Syncs between PlanYearModal and Planning Preferences.
 */
export const saveExcludedPublicHolidayDates = async (familyId, datesWithNames) => {
  if (!familyId) return { error: new Error('familyId required') };
  const { error: delError } = await supabase
    .from('planner_exclusions')
    .delete()
    .eq('family_id', familyId)
    .eq('scope_type', 'family_default')
    .eq('exclusion_type', 'excluded_date');
  if (delError) return { error: delError };
  for (const { date, name } of datesWithNames || []) {
    if (!date) continue;
    const d = typeof date === 'string' ? date.slice(0, 10) : date;
    const { error: addErr } = await addExclusion({
      family_id: familyId,
      scope_type: 'family_default',
      exclusion_type: 'excluded_date',
      start_date: d,
      end_date: d,
      label: name || 'Holiday',
    });
    if (addErr) return { error: addErr };
  }
  return { error: null };
};
