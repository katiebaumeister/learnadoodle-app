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
  const { data, error } = await apiRequest(
    `/api/academic_year/${academicYearId}`,
    {
      method: 'GET',
    }
  );
  
  if (error) {
    return { data: null, error };
  }
  
  return { data, error: null };
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
