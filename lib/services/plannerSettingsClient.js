/**
 * Family planner settings & exclusions.
 * Uses family_planner_settings and planner_exclusions tables.
 */

import { supabase } from '../supabase';

// ---------- family_planner_settings ----------

const resolveSchoolYearLabel = (input = null, refDate = new Date()) => {
  const raw = String(input || '').trim();
  if (/^\d{4}\/\d{2}$/.test(raw)) return raw;
  const month = refDate.getMonth() + 1;
  const startYear = month >= 8 ? refDate.getFullYear() : refDate.getFullYear() - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
};

const deriveRangeDefaultsFromSchoolYearLabel = (schoolYearLabel) => {
  const label = String(schoolYearLabel || '').trim();
  const match = label.match(/^(\d{4})\/(\d{2})$/);
  if (!match) {
    return {
      default_year_start_date: null,
      default_year_end_date: null,
      default_fall_term_start_date: null,
      default_fall_term_end_date: null,
      default_spring_term_start_date: null,
      default_spring_term_end_date: null,
    };
  }
  const startYear = Number(match[1]);
  const endYear = 2000 + Number(match[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    return {
      default_year_start_date: null,
      default_year_end_date: null,
      default_fall_term_start_date: null,
      default_fall_term_end_date: null,
      default_spring_term_start_date: null,
      default_spring_term_end_date: null,
    };
  }
  return {
    default_year_start_date: `${startYear}-08-01`,
    default_year_end_date: `${endYear}-05-31`,
    default_fall_term_start_date: `${startYear}-08-01`,
    default_fall_term_end_date: `${startYear}-12-31`,
    default_spring_term_start_date: `${endYear}-01-01`,
    default_spring_term_end_date: `${endYear}-05-01`,
  };
};

const coerceRangeDefaultsToRequestedSchoolYear = (settings, schoolYearLabel) => {
  const normalized = String(schoolYearLabel || '').trim();
  const match = normalized.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return settings || null;
  const startYear = Number(match[1]);
  const endYear = 2000 + Number(match[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return settings || null;
  const defaults = deriveRangeDefaultsFromSchoolYearLabel(normalized);
  const next = { ...(settings || {}) };

  const keepIfYearMatches = (value, expectedYear, fallbackValue) => {
    const raw = String(value || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallbackValue;
    const year = Number(raw.slice(0, 4));
    return year === expectedYear ? raw : fallbackValue;
  };

  next.default_year_start_date = keepIfYearMatches(
    settings?.default_year_start_date,
    startYear,
    defaults.default_year_start_date
  );
  next.default_year_end_date = keepIfYearMatches(
    settings?.default_year_end_date,
    endYear,
    defaults.default_year_end_date
  );
  next.default_fall_term_start_date = keepIfYearMatches(
    settings?.default_fall_term_start_date,
    startYear,
    defaults.default_fall_term_start_date
  );
  next.default_fall_term_end_date = keepIfYearMatches(
    settings?.default_fall_term_end_date,
    startYear,
    defaults.default_fall_term_end_date
  );
  next.default_spring_term_start_date = keepIfYearMatches(
    settings?.default_spring_term_start_date,
    endYear,
    defaults.default_spring_term_start_date
  );
  next.default_spring_term_end_date = keepIfYearMatches(
    settings?.default_spring_term_end_date,
    endYear,
    defaults.default_spring_term_end_date
  );

  return next;
};

const RANGE_DEFAULT_COLUMNS = [
  'default_year_start_date',
  'default_year_end_date',
  'default_fall_term_start_date',
  'default_fall_term_end_date',
  'default_spring_term_start_date',
  'default_spring_term_end_date',
];
const OPTIONAL_SETTINGS_COLUMNS = [
  'attendance_tracking_mode',
];
const COMPAT_OPTIONAL_COLUMNS = [...RANGE_DEFAULT_COLUMNS, ...OPTIONAL_SETTINGS_COLUMNS];

const stripRangeDefaultColumns = (payload = {}) => {
  const next = { ...payload };
  COMPAT_OPTIONAL_COLUMNS.forEach((key) => {
    if (key in next) delete next[key];
  });
  return next;
};

const isMissingCompatColumnError = (error) => {
  const msg = String(error?.message || error?.details || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('family_planner_settings')
    && msg.includes('column')
    && COMPAT_OPTIONAL_COLUMNS.some((col) => msg.includes(col))
  );
};

const isLegacySchoolYearSchemaError = (error) => {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  if (!msg) return false;
  return (
    msg.includes('school_year_label')
    || (msg.includes('on conflict') && msg.includes('family_id'))
    || msg.includes('no unique or exclusion constraint matching the on conflict specification')
  );
};

const plannerSettingsCompatLog = (phase, payload = {}) => {
  try {
    // Helps verify whether modern or legacy schema path is active in a given environment.
    // eslint-disable-next-line no-console
    console.log('[PlannerSettingsCompat]', phase, payload);
  } catch (_) {
    // no-op
  }
};

export const getFamilyPlannerSettings = async (familyId, schoolYearLabel = null) => {
  if (!familyId) return { data: null, error: null };
  const effectiveSchoolYear = resolveSchoolYearLabel(schoolYearLabel);
  const rangeDefaults = deriveRangeDefaultsFromSchoolYearLabel(effectiveSchoolYear);
  const { data, error } = await supabase
    .from('family_planner_settings')
    .select('*')
    .eq('family_id', familyId)
    .eq('school_year_label', effectiveSchoolYear)
    .maybeSingle();
  if (error && isLegacySchoolYearSchemaError(error)) {
    plannerSettingsCompatLog('read:legacy_fallback', {
      familyId,
      schoolYearLabel: effectiveSchoolYear,
      reason: String(error?.message || error?.details || '').slice(0, 240),
    });
    const { data: legacyData, error: legacyError } = await supabase
      .from('family_planner_settings')
      .select('*')
      .eq('family_id', familyId)
      .maybeSingle();
    if (legacyError) return { data: null, error: legacyError };
    return {
      data: legacyData || {
        family_id: familyId,
        school_year_label: effectiveSchoolYear,
        target_scope: 'overall',
        attendance_tracking_mode: 'class_day',
        default_school_year: effectiveSchoolYear,
        default_constraint_mode: 'days',
        default_target_days: 180,
        default_target_hours: null,
        default_planned_hours_per_day: null,
        follow_public_holidays: true,
        holiday_country: 'US',
        holiday_region: null,
        allowed_weekdays: [1, 2, 3, 4, 5],
        default_day_start_time: '08:00:00',
        default_day_end_time: '15:00:00',
        ...rangeDefaults,
      },
      error: null,
    };
  }
  if (error) return { data: null, error };
  const sanitizedData = data
    ? coerceRangeDefaultsToRequestedSchoolYear(data, effectiveSchoolYear)
    : null;
  return {
    data: sanitizedData || {
      family_id: familyId,
      school_year_label: effectiveSchoolYear,
      target_scope: 'overall',
      attendance_tracking_mode: 'class_day',
      default_school_year: effectiveSchoolYear,
      default_constraint_mode: 'days',
      default_target_days: 180,
      default_target_hours: null,
      default_planned_hours_per_day: null,
      follow_public_holidays: true,
      holiday_country: 'US',
      holiday_region: null,
      allowed_weekdays: [1, 2, 3, 4, 5],
      default_day_start_time: '08:00:00',
      default_day_end_time: '15:00:00',
      ...rangeDefaults,
    },
    error: null,
  };
};

export const saveFamilyPlannerSettings = async (familyId, payload, schoolYearLabel = null) => {
  if (!familyId) return { error: new Error('familyId required') };
  const effectiveSchoolYear = resolveSchoolYearLabel(
    schoolYearLabel || payload?.school_year_label || payload?.default_school_year
  );
  const writePayload = {
    family_id: familyId,
    school_year_label: effectiveSchoolYear,
    default_school_year: payload?.default_school_year || effectiveSchoolYear,
    ...payload,
  };
  const { error } = await supabase
    .from('family_planner_settings')
    .upsert(
      writePayload,
      { onConflict: 'family_id,school_year_label' }
    );
  if (!error) return { error: null };
  // Backward compatibility: some deployed DBs may not yet have plan-range default columns.
  if (isMissingCompatColumnError(error)) {
    plannerSettingsCompatLog('write:missing_range_columns_retry', {
      familyId,
      schoolYearLabel: effectiveSchoolYear,
      reason: String(error?.message || error?.details || '').slice(0, 240),
    });
    const fallbackPayload = stripRangeDefaultColumns(writePayload);
    const { error: retryError } = await supabase
      .from('family_planner_settings')
      .upsert(
        fallbackPayload,
        { onConflict: 'family_id,school_year_label' }
      );
    if (!retryError) return { error: null };
    if (isLegacySchoolYearSchemaError(retryError)) {
      plannerSettingsCompatLog('write:legacy_fallback_after_range_retry', {
        familyId,
        schoolYearLabel: effectiveSchoolYear,
        reason: String(retryError?.message || retryError?.details || '').slice(0, 240),
      });
      const legacyPayload = {
        ...stripRangeDefaultColumns(fallbackPayload),
      };
      delete legacyPayload.school_year_label;
      const { error: legacyRetryError } = await supabase
        .from('family_planner_settings')
        .upsert(
          legacyPayload,
          { onConflict: 'family_id' }
        );
      return { error: legacyRetryError || null };
    }
    return { error: retryError };
  }
  if (isLegacySchoolYearSchemaError(error)) {
    plannerSettingsCompatLog('write:legacy_fallback', {
      familyId,
      schoolYearLabel: effectiveSchoolYear,
      reason: String(error?.message || error?.details || '').slice(0, 240),
    });
    const legacyPayload = {
      ...stripRangeDefaultColumns(writePayload),
    };
    delete legacyPayload.school_year_label;
    const { error: legacyRetryError } = await supabase
      .from('family_planner_settings')
      .upsert(
        legacyPayload,
        { onConflict: 'family_id' }
      );
    return { error: legacyRetryError || null };
  }
  return { error };
};

// ---------- planner_exclusions ----------

export const getFamilyExclusions = async (familyId, scopeType = 'family_default', schoolYearLabel = null) => {
  if (!familyId) return { data: [], error: null };
  const effectiveSchoolYear = resolveSchoolYearLabel(schoolYearLabel);
  let query = supabase
    .from('planner_exclusions')
    .select('*')
    .eq('family_id', familyId)
    .eq('scope_type', scopeType)
    .eq('is_active', true)
    .order('start_date', { ascending: true });
  if (scopeType === 'family_default') {
    query = query.eq('school_year_label', effectiveSchoolYear);
  }
  const { data, error } = await query;
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

const sliceIsoDate = (v) =>
  typeof v === 'string' ? v.slice(0, 10) : (v?.isoformat?.() || String(v || '').slice(0, 10));

/**
 * Map API planner_exclusions rows to UI rows for custom days off + date ranges off.
 */
export function mapPlannerExclusionsToHolidayBreakUi(exclusions) {
  const list = exclusions || [];
  const customHolidays = list
    .filter((e) => e.exclusion_type === 'holiday')
    .map((e) => ({
      id: e.id,
      date: sliceIsoDate(e.start_date),
      name: e.label || '',
    }));
  const customBreaks = list
    .filter((e) => e.exclusion_type === 'break')
    .map((e) => ({
      id: e.id,
      start: sliceIsoDate(e.start_date),
      end: sliceIsoDate(e.end_date),
      name: e.label || '',
    }));
  return { customHolidays, customBreaks };
}

/**
 * Sync family_default holiday + break exclusions to match Planning Preferences UI state.
 * Same behavior as PlannerSettingsContent persist (keeps Family screen + planner popover in sync).
 */
export async function syncFamilyHolidayBreakExclusions(familyId, customHolidays, customBreaks, schoolYearLabel = null) {
  if (!familyId) return { error: new Error('familyId required') };
  const effectiveSchoolYear = resolveSchoolYearLabel(schoolYearLabel);
  const { data: existingExclusions } = await getFamilyExclusions(familyId, 'family_default', effectiveSchoolYear);
  const existingIds = new Set((existingExclusions || []).map((e) => e.id));
  const currentHolidayIds = new Set((customHolidays || []).filter((h) => h.id).map((h) => h.id));
  const currentBreakIds = new Set((customBreaks || []).filter((b) => b.id).map((b) => b.id));
  for (const id of existingIds) {
    const ex = (existingExclusions || []).find((e) => e.id === id);
    if (ex?.exclusion_type === 'excluded_date') continue;
    const isHoliday = ex?.exclusion_type === 'holiday';
    const keep = isHoliday ? currentHolidayIds.has(id) : currentBreakIds.has(id);
    if (!keep) {
      const { error } = await deleteExclusion(id);
      if (error) return { error };
    }
  }
  for (const h of customHolidays || []) {
    if (h.id) {
      const { error } = await updateExclusion(h.id, { start_date: h.date, end_date: h.date, label: h.name });
      if (error) return { error };
    } else {
      const { error } = await addExclusion({
        family_id: familyId,
        scope_type: 'family_default',
        school_year_label: effectiveSchoolYear,
        exclusion_type: 'holiday',
        start_date: h.date,
        end_date: h.date,
        label: h.name,
        source: 'settings',
      });
      if (error) return { error };
    }
  }
  for (const b of customBreaks || []) {
    if (b.id) {
      const { error } = await updateExclusion(b.id, { start_date: b.start, end_date: b.end, label: b.name });
      if (error) return { error };
    } else {
      const { error } = await addExclusion({
        family_id: familyId,
        scope_type: 'family_default',
        school_year_label: effectiveSchoolYear,
        exclusion_type: 'break',
        start_date: b.start,
        end_date: b.end,
        label: b.name,
        source: 'settings',
      });
      if (error) return { error };
    }
  }
  return { error: null };
}

/**
 * Get merged plan defaults for Plan My Year: family settings + family exclusions.
 * Hierarchy: subject > plan > family. Caller combines with subject/plan data.
 */
export const getPlanDefaultsFromSettings = async (familyId, schoolYearLabel = null) => {
  if (!familyId) return { settings: null, exclusions: [], excluded_holiday_dates: [], error: null };
  const effectiveSchoolYear = resolveSchoolYearLabel(schoolYearLabel);
  const [settingsRes, exclusionsRes] = await Promise.all([
    getFamilyPlannerSettings(familyId, effectiveSchoolYear),
    getFamilyExclusions(familyId, 'family_default', effectiveSchoolYear),
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
export const saveExcludedPublicHolidayDates = async (familyId, datesWithNames, schoolYearLabel = null) => {
  if (!familyId) return { error: new Error('familyId required') };
  const effectiveSchoolYear = resolveSchoolYearLabel(schoolYearLabel);
  const { error: delError } = await supabase
    .from('planner_exclusions')
    .delete()
    .eq('family_id', familyId)
    .eq('scope_type', 'family_default')
    .eq('school_year_label', effectiveSchoolYear)
    .eq('exclusion_type', 'excluded_date');
  if (delError) return { error: delError };
  for (const { date, name } of datesWithNames || []) {
    if (!date) continue;
    const d = typeof date === 'string' ? date.slice(0, 10) : date;
    const { error: addErr } = await addExclusion({
      family_id: familyId,
      scope_type: 'family_default',
      school_year_label: effectiveSchoolYear,
      exclusion_type: 'excluded_date',
      start_date: d,
      end_date: d,
      label: name || 'Holiday',
    });
    if (addErr) return { error: addErr };
  }
  return { error: null };
};
