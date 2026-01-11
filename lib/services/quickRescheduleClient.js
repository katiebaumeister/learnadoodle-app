/**
 * Quick Reschedule API Client
 * Handles micro-rescheduler API calls
 */

import { apiRequest } from '../apiClient';

/**
 * Run quick reschedule to generate preview
 * @param {Object} params
 * @param {string} params.family_id
 * @param {string[]} params.children - Array of child IDs
 * @param {{start_date: string, end_date: string}} params.time_window
 * @param {{type: string, event_id?: string, new_start?: string, new_end?: string, child_unavailable?: boolean, notes?: string}} params.change
 * @param {{lock_fixed: boolean, only_flexible: boolean, max_moves: number, prefer_same_day: boolean}} params.constraints
 * @param {string} params.notes
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function runQuickReschedule(params) {
  try {
    return await apiRequest('/api/planner/quick_reschedule', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.family_id,
        children: params.children,
        time_window: params.time_window,
        change: params.change,
        constraints: params.constraints,
        notes: params.notes,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Apply quick reschedule changes
 * @param {Object} params
 * @param {string} params.family_id
 * @param {string} params.run_id
 * @param {Object[]} params.proposed_events_patch
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function applyQuickReschedule(params) {
  try {
    return await apiRequest('/api/planner/quick_reschedule/apply', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.family_id,
        run_id: params.run_id,
        proposed_events_patch: params.proposed_events_patch,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}





