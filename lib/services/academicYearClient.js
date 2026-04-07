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

export const getAcademicYearPlanEvents = async (familyId, academicYearId) => {
  const result = await apiRequest(
    `/api/academic_year/plan_events?family_id=${encodeURIComponent(familyId)}&academic_year_id=${encodeURIComponent(academicYearId)}`,
    { method: 'GET' }
  );
  if (result.error) {
    return { data: null, error: result.error };
  }
  return { data: result.data, error: null };
};

// holidays_for_range: cache + per-key dedupe + per-family serial queue + 429 backoff.
// Many parallel callers use different date ranges (adjacent months, week view, etc.); dedupe alone
// does not stop the first burst — only one HTTP request per family runs at a time.
const HOLIDAYS_RANGE_CACHE_MS = 90_000;
const HOLIDAYS_RANGE_429_BACKOFF_MS = 60_000;
/** Small pause after each holidays request so the server’s rate limiter sees a steady trickle. */
const HOLIDAYS_RANGE_SERIAL_GAP_MS = 60;
/** @type {Map<string, { data: object, at: number }>} */
const holidaysRangeCache = new Map();
/** @type {Map<string, Promise<{ data: object, error: null }>>} */
const holidaysRangeInFlight = new Map();
/** @type {Map<string, number>} familyId -> last 429 timestamp */
const holidaysRange429At = new Map();
/** @type {Map<string, Promise<unknown>>} */
const holidaysRangeSerialTail = new Map();

function holidaysRangeKey(familyId, start, end) {
  return `${familyId}|${start}|${end}`;
}

/**
 * Run one holidays_for_range fetch at a time per family (queued FIFO). Prevents dozens of parallel
 * requests for different months from tripping 429.
 */
function queueHolidaysRangeFetch(familyId, task) {
  const prev = holidaysRangeSerialTail.get(familyId) || Promise.resolve();
  const next = prev.then(async () => {
    try {
      return await task();
    } finally {
      if (HOLIDAYS_RANGE_SERIAL_GAP_MS > 0) {
        await new Promise((r) => setTimeout(r, HOLIDAYS_RANGE_SERIAL_GAP_MS));
      }
    }
  });
  holidaysRangeSerialTail.set(familyId, next.catch(() => {}));
  return next;
}

/**
 * Drop cached holiday ranges for a family (or all). Resets 429 backoff for that family so the next fetch can retry.
 * Call when holiday settings change or on forced calendar refresh.
 * @param {string|null} [familyId] - If omitted, clears entire cache and all 429 backoffs.
 */
export const invalidateHolidaysForRangeCache = (familyId = null) => {
  if (!familyId) {
    holidaysRangeCache.clear();
    holidaysRange429At.clear();
    return;
  }
  holidaysRange429At.delete(familyId);
  const prefix = `${familyId}|`;
  for (const k of holidaysRangeCache.keys()) {
    if (k.startsWith(prefix)) holidaysRangeCache.delete(k);
  }
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
  const empty = () => ({ data: { holidays: [] }, error: null });
  if (!familyId || !start || !end) return empty();

  const key = holidaysRangeKey(familyId, start, end);
  const now = Date.now();

  const last429 = holidaysRange429At.get(familyId) || 0;
  if (now - last429 < HOLIDAYS_RANGE_429_BACKOFF_MS) {
    const hit = holidaysRangeCache.get(key);
    if (hit?.data) return { data: hit.data, error: null };
    return empty();
  }

  const cached = holidaysRangeCache.get(key);
  if (cached && now - cached.at < HOLIDAYS_RANGE_CACHE_MS) {
    return { data: cached.data, error: null };
  }

  const existing = holidaysRangeInFlight.get(key);
  if (existing) return existing;

  const promise = queueHolidaysRangeFetch(familyId, async () => {
    try {
      const { data, error } = await apiRequest(
        `/api/academic_year/holidays_for_range?family_id=${encodeURIComponent(familyId)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { method: 'GET' }
      );
      if (error) {
        if (error.status === 429) {
          holidaysRange429At.set(familyId, Date.now());
        }
        const stale = holidaysRangeCache.get(key);
        if (stale?.data) return { data: stale.data, error: null };
        return empty();
      }
      const out = data || { holidays: [] };
      holidaysRangeCache.set(key, { data: out, at: Date.now() });
      return { data: out, error: null };
    } catch (_) {
      const stale = holidaysRangeCache.get(key);
      if (stale?.data) return { data: stale.data, error: null };
      return empty();
    } finally {
      holidaysRangeInFlight.delete(key);
    }
  });

  holidaysRangeInFlight.set(key, promise);
  return promise;
};

/**
 * Get public holidays for a date range (no academic year required). Used by Plan My Year holiday picker.
 * @param {string} country - Country code e.g. 'US'
 * @param {string} start - YYYY-MM-DD
 * @param {string} end - YYYY-MM-DD
 * @returns {Promise<{data: {holidays: Array<{date: string, name: string, type: string}>}|null, error: Error|null}>}
 */
export const getPublicHolidaysForRange = async (country, start, end) => {
  try {
    const { data, error } = await apiRequest(
      `/api/holidays/public?country=${encodeURIComponent(country)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
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
const PLAN_HEALTH_FAILURE_BACKOFF_MS = 12000; // after 5xx/network, avoid hammering the API
const planHealthCache = { data: null, familyId: null, academicYearId: null, at: 0 };
/** @type {{ key: string, at: number }} */
let planHealthLastFailure = { key: '', at: 0 };
let planHealthInFlight = null;

/** Invalidate plan health cache so next getPlanHealth refetches (e.g. after Fix-It apply). */
export const invalidatePlanHealthCache = () => {
  planHealthCache.at = 0;
  planHealthLastFailure = { key: '', at: 0 };
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
  const failKey = `${familyId}|${cacheKey}`;
  const now = Date.now();
  if (
    planHealthLastFailure.key === failKey &&
    now - planHealthLastFailure.at < PLAN_HEALTH_FAILURE_BACKOFF_MS
  ) {
    return { data: { plan_exists: false }, error: null };
  }
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
    if (error) {
      const status = error.status;
      const msg = (error.message || '').toLowerCase();
      const degradable =
        status >= 500 ||
        status === undefined ||
        msg.includes('failed to fetch') ||
        msg.includes('network') ||
        error.name === 'AbortError';
      if (degradable) {
        planHealthLastFailure = { key: failKey, at: Date.now() };
        if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
          console.warn('[getPlanHealth] server/network error; treating as no plan:', status ?? error.message);
        }
        return { data: { plan_exists: false }, error: null };
      }
      return { data: null, error };
    }
    if (data != null) {
      planHealthCache.data = data;
      planHealthCache.familyId = familyId;
      planHealthCache.academicYearId = cacheKey;
      planHealthCache.at = Date.now();
    }
    return { data: data || { plan_exists: false }, error: null };
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
  // Default apiRequest timeout is 30s; applying a plan can insert many placeholders and exceed that locally.
  const { data, error } = await apiRequest('/api/academic_year/apply_to_calendar', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 180000,
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

/**
 * Look up the calendar event for a plan event (plan summary "Dates with events" row).
 * Returns the event so the client can open the edit event modal.
 * @param {{ familyId: string, dateYmd: string, startLocal?: string, subjectId: string, academicYearId: string }} params
 * @returns {Promise<{data: { event: object|null }|null, error: Error|null}>}
 */
export const getEventForPlanSlot = async ({ familyId, dateYmd, startLocal, subjectId, academicYearId }) => {
  let url = `/api/academic_year/event_for_slot?family_id=${encodeURIComponent(familyId)}&date_ymd=${encodeURIComponent(dateYmd)}&subject_id=${encodeURIComponent(subjectId)}&academic_year_id=${encodeURIComponent(academicYearId)}`;
  if (startLocal != null && startLocal !== '') {
    url += `&start_local=${encodeURIComponent(startLocal)}`;
  }
  const { data, error } = await apiRequest(url, { method: 'GET' });
  if (error) return { data: null, error };
  return { data: data || { event: null }, error: null };
};
