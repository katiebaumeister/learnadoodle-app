/**
 * Academic Year Planning API Client
 * Provides methods for academic year planning with constraint solver
 */

import { apiRequest } from '../apiClient';

// Get API base URL
const getAPIBase = () => {
  if (typeof window !== 'undefined') {
    return process.env.REACT_APP_API_URL || window.location.origin;
  }
  return process.env.REACT_APP_API_URL || '';
};

/**
 * Create default academic year (non-homeschool fast path)
 * @param {string} familyId - Family UUID
 * @returns {Promise<{data: {academic_year_id: string, status: string}|null, error: Error|null}>}
 */
export const createDefaultAcademicYear = async (familyId) => {
  const { data, error } = await apiRequest(
    `/api/academic_year/create_default?familyId=${familyId}`,
    {
      method: 'POST',
    }
  );
  
  if (error) {
    return { data: null, error };
  }
  
  return { data, error: null };
};

/**
 * Recalculate academic year (constraint solver preview)
 * @param {Object} input - RecalculateInput
 * @returns {Promise<{data: RecalculateOutput|null, error: Error|null}>}
 */
export const recalculateAcademicYear = async (input) => {
  const { data, error } = await apiRequest('/api/academic_year/recalculate', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  
  if (error) {
    return { data: null, error };
  }
  
  return { data, error: null };
};

/**
 * Save academic year configuration
 * @param {Object} input - RecalculateInput (same as recalculate)
 * @returns {Promise<{data: {academic_year_id: string, status: string}|null, error: Error|null}>}
 */
export const saveAcademicYear = async (input) => {
  const { data, error } = await apiRequest('/api/academic_year/save', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  
  if (error) {
    return { data: null, error };
  }
  
  return { data, error: null };
};

/**
 * Sync global holidays for an academic year
 * @param {string} academicYearId - Academic Year UUID
 * @returns {Promise<{data: {status: string}|null, error: Error|null}>}
 */
export const syncGlobalHolidays = async (academicYearId) => {
  const { data, error } = await apiRequest(
    `/api/academic_year/sync_global_holidays?academic_year_id=${academicYearId}`,
    {
      method: 'POST',
    }
  );
  
  if (error) {
    return { data: null, error };
  }
  
  return { data, error: null };
};

/**
 * Get academic year with settings and counts
 * @param {string} academicYearId - Academic Year UUID
 * @returns {Promise<{data: AcademicYearResponse|null, error: Error|null}>}
 */
export const getAcademicYear = async (academicYearId) => {
  // Use query-param URL to avoid path-with-UUID being replaced by tracking GIF (Safari/some clients)
  const doRequest = () =>
    apiRequest(`/api/academic_year/by_id?academic_year_id=${encodeURIComponent(academicYearId)}`, { method: 'GET' });

  let result = await doRequest();
  // If 401 (e.g. session not ready yet), retry once after a short delay
  if (result.error?.status === 401) {
    await new Promise((r) => setTimeout(r, 400));
    result = await doRequest();
  }

  if (result.error) {
    return { data: null, error: result.error };
  }
  return { data: result.data, error: null };
};

/**
 * Get holidays for a family in a date range (for planner month/week views).
 * Uses global holiday table + custom holidays from academic year settings.
 * On any failure (5xx, network, etc.) returns empty holidays so the planner never breaks.
 * @param {string} familyId - Family UUID
 * @param {string} start - Start date YYYY-MM-DD
 * @param {string} end - End date YYYY-MM-DD
 * @returns {Promise<{data: {holidays: Array<{date: string, name: string, type: string}>}|null, error: Error|null}>}
 */
export const getHolidaysForRange = async (familyId, start, end) => {
  try {
    const { data, error } = await apiRequest(
      `/api/academic_year/holidays_for_range?family_id=${encodeURIComponent(familyId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      { method: 'GET' }
    );
    if (error) return { data: { holidays: [] }, error: null };
    return { data: data || { holidays: [] }, error: null };
  } catch (_) {
    return { data: { holidays: [] }, error: null };
  }
};

/**
 * Get list of available countries for holiday selection
 * @returns {Promise<{data: {countries: Array, top: Array}|null, error: Error|null}>}
 */
export const getHolidayCountries = async () => {
  const { data, error } = await apiRequest('/api/holidays/countries', {
    method: 'GET',
  });
  
  if (error) {
    return { data: null, error };
  }
  
  return { data, error: null };
};

/**
 * Get subdivisions (states/provinces) for a country
 * @param {string} countryCode - Country code (e.g., 'US', 'CA')
 * @returns {Promise<{data: {subdivisions: Array}|null, error: Error|null}>}
 */
export const getHolidaySubdivisions = async (countryCode) => {
  const { data, error } = await apiRequest(
    `/api/holidays/subdivisions?country=${countryCode}`,
    {
      method: 'GET',
    }
  );
  
  if (error) {
    return { data: null, error };
  }
  
  return { data, error: null };
};

// Plan health cache: avoid 429 from Banner + Icon + preload all calling at once
const PLAN_HEALTH_CACHE_MS = 15000; // 15s
const planHealthCache = { data: null, familyId: null, academicYearId: null, at: 0 };
let planHealthInFlight = null;

/** Invalidate plan health cache so next getPlanHealth refetches (e.g. after Fix-It apply). */
export const invalidatePlanHealthCache = () => {
  planHealthCache.at = 0;
};

/**
 * Get plan health (actual compliance) from events in DB.
 * When academicYearId is provided, returns health for that plan only; otherwise most recently updated plan.
 * @param {string} familyId - Family UUID
 * @param {string|null|undefined} [academicYearId] - If provided, health for this plan only
 * @returns {Promise<{data: {plan_exists, academic_year_id?, planned_days?, ...}|null, error: Error|null}>}
 */
export const getPlanHealth = async (familyId, academicYearId = null) => {
  if (!familyId) return { data: null, error: null };
  const cacheKey = academicYearId || '';
  const now = Date.now();
  if (planHealthCache.familyId === familyId && planHealthCache.academicYearId === cacheKey && planHealthCache.at && now - planHealthCache.at < PLAN_HEALTH_CACHE_MS) {
    return { data: planHealthCache.data || { plan_exists: false }, error: null };
  }
  if (planHealthInFlight && planHealthInFlight.familyId === familyId && planHealthInFlight.academicYearId === cacheKey) {
    const result = await planHealthInFlight.promise;
    return result;
  }
  const url = `/api/academic_year/plan_health?family_id=${encodeURIComponent(familyId)}${academicYearId ? `&academic_year_id=${encodeURIComponent(academicYearId)}` : ''}`;
  const promise = (async () => {
    const { data, error } = await apiRequest(url, { method: 'GET' });
    if (!error && data != null) {
      planHealthCache.data = data;
      planHealthCache.familyId = familyId;
      planHealthCache.academicYearId = cacheKey;
      planHealthCache.at = Date.now();
    }
    return error ? { data: null, error } : { data: data || { plan_exists: false }, error: null };
  })();
  planHealthInFlight = { familyId, academicYearId: cacheKey, promise };
  try {
    return await promise;
  } finally {
    if (planHealthInFlight && planHealthInFlight.familyId === familyId && planHealthInFlight.academicYearId === cacheKey) planHealthInFlight = null;
  }
};

/**
 * Compute schedule potential from blocks (never queries events).
 * Returns projected days, projected hours, delta vs target when target_days/target_hours provided.
 * @param {Object} input - { family_id, start_date, end_date, blocks[], custom_holidays[], custom_breaks[], target_days?, target_hours? }
 * @returns {Promise<{data: {projected_days, projected_hours, target_days?, target_hours?, delta_days?, delta_hours?}|null, error: Error|null}>}
 */
export const computeSchedulePotential = async (input) => {
  const { data, error } = await apiRequest('/api/academic_year/schedule_potential', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (error) return { data: null, error };
  return { data, error: null };
};

/**
 * Apply plan year to calendar: compute eligible days and create lesson placeholders.
 * @param {Object} input - ApplyToCalendarInput
 * @returns {Promise<{data: {created: number, generation_batch_id: string, planned_days: number}|null, error: Error|null}>}
 */
export const applyToCalendar = async (input) => {
  const { data, error } = await apiRequest('/api/academic_year/apply_to_calendar', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  if (error) {
    return { data: null, error };
  }

  return { data, error: null };
};

/**
 * Apply a fix-it suggestion (Phase 6): extra_day_per_week, extend_end_date, or catch_up_week.
 * @param {Object} input - { family_id, suggestion_type, params?: { num_weeks?, extra_weeks?, week_start? } }
 * @returns {Promise<{data: {success, created?, planned_days?}|null, error: Error|null}>}
 */
export const applyFixSuggestion = async (input) => {
  const { data, error } = await apiRequest('/api/academic_year/apply_fix_suggestion', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (error) return { data: null, error };
  return { data, error: null };
};

/**
 * Remove Plan Year placeholder lessons. If academicYearId is provided, clears only that year's placeholders.
 * @param {string} familyId - Family UUID
 * @param {string} [academicYearId] - Optional: clear only this year's placeholders
 * @param {{ deletePlan?: boolean }} [options] - If deletePlan true and academicYearId set, backend also deletes the academic year record (full plan removal)
 * @returns {Promise<{data: {deleted: number, plan_deleted?: boolean}|null, error: Error|null}>}
 */
export const clearPlaceholders = async (familyId, academicYearId = null, options = {}) => {
  let url = `/api/academic_year/clear_placeholders?family_id=${encodeURIComponent(familyId)}`;
  if (academicYearId) {
    url += `&academic_year_id=${encodeURIComponent(academicYearId)}`;
  }
  if (options.deletePlan) {
    url += '&delete_plan=true';
  }
  const { data, error } = await apiRequest(url, { method: 'POST' });
  if (error) return { data: null, error };
  return { data: data || { deleted: 0, plan_deleted: false }, error: null };
};
