/**
 * Plan Week API Client
 * Handles weekly planning API calls
 */

import { apiRequest } from '../apiClient';

/**
 * Generate a weekly plan
 * @param {Object} params
 * @param {string} params.family_id
 * @param {string} params.week_start - Week start date (YYYY-MM-DD, must be Monday)
 * @param {string[]} params.child_ids - Array of child IDs
 * @param {{focus?: string[], intensity?: string, max_daily_minutes_per_child?: number, weekend_mode?: string}} params.options
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function planWeek(params) {
  try {
    return await apiRequest('/api/planner/plan_week', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.family_id,
        week_start: params.week_start,
        child_ids: params.child_ids,
        options: params.options || {},
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Apply a weekly plan
 * @param {Object} params
 * @param {string} params.family_id
 * @param {string} params.run_id
 * @param {Object} params.patch - Patch object with create/move/update/delete arrays
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function applyPlanWeek(params) {
  try {
    return await apiRequest('/api/planner/plan_week/apply', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.family_id,
        run_id: params.run_id,
        patch: params.patch,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}





