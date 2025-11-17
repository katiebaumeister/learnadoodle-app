/**
 * AI Assistant API Client
 * Part of Phase 2 - AI Parent Assistant + Daily Automation
 * Provides type-safe methods for AI features
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
 * Summarize progress for a date range
 * @param {string} rangeStart - Start date (YYYY-MM-DD)
 * @param {string} rangeEnd - End date (YYYY-MM-DD)
 * @returns {Promise<{data: {ok: boolean, summary: string, taskRunId?: string}|null, error: Error|null}>}
 */
export const summarizeProgress = async (rangeStart, rangeEnd) => {
  const { data, error } = await apiRequest('/api/ai/summarize_progress', {
    method: 'POST',
    body: JSON.stringify({
      rangeStart,
      rangeEnd,
    }),
  });
  
  if (error) {
    console.error('[aiClient] summarizeProgress error:', error);
    return { data: null, error };
  }
  
  return { data, error: null };
};

/**
 * Pack a week with optimal event placement
 * @param {string} weekStart - Week start date (YYYY-MM-DD, Monday)
 * @param {string[]} [childIds] - Optional array of child IDs to pack for
 * @returns {Promise<{data: {ok: boolean, events: Array, notes: string, taskRunId?: string}|null, error: Error|null}>}
 */
export const packWeek = async (weekStart, childIds = null) => {
  const { data, error } = await apiRequest('/api/ai/pack_week', {
    method: 'POST',
    body: JSON.stringify({
      weekStart,
      childIds: childIds || undefined,
    }),
  });
  
  if (error) {
    console.error('[aiClient] packWeek error:', error);
    return { data: null, error };
  }
  
  return { data, error: null };
};

/**
 * Catch up on missed events by rescheduling them
 * @param {string[]} missedEventIds - Array of event IDs that were missed
 * @returns {Promise<{data: {ok: boolean, rescheduled: Array, notes: string, taskRunId?: string}|null, error: Error|null}>}
 */
export const catchUp = async (missedEventIds) => {
  if (!missedEventIds || missedEventIds.length === 0) {
    return { data: null, error: new Error('missedEventIds cannot be empty') };
  }
  
  const { data, error } = await apiRequest('/api/ai/catch_up', {
    method: 'POST',
    body: JSON.stringify({
      missedEventIds,
    }),
  });
  
  if (error) {
    console.error('[aiClient] catchUp error:', error);
    return { data: null, error };
  }
  
  return { data, error: null };
};

