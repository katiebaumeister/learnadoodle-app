/**
 * Planner Conflicts API Client
 * Handles conflict detection and resolution API calls
 */

import { apiRequest } from '../apiClient';

/**
 * Preview conflict resolution
 * @param {Object} params
 * @param {string} params.family_id
 * @param {string[]} params.child_ids
 * @param {{start: string, end: string}} params.range
 * @param {{hard_blocks?: boolean, keep_fixed?: boolean}} params.constraints
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function previewResolveConflicts(params) {
  try {
    return await apiRequest('/api/planner/resolve_conflicts/preview', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.family_id,
        child_ids: params.child_ids,
        range: params.range,
        constraints: params.constraints || {},
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Apply conflict resolution
 * @param {Object} params
 * @param {string} params.family_id
 * @param {string[]} params.child_ids
 * @param {{start: string, end: string}} params.range
 * @param {{hard_blocks?: boolean, keep_fixed?: boolean}} params.constraints
 * @param {Object[]} params.proposed_changes
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function applyResolveConflicts(params) {
  try {
    return await apiRequest('/api/planner/resolve_conflicts/apply', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.family_id,
        child_ids: params.child_ids,
        range: params.range,
        constraints: params.constraints || {},
        proposed_changes: params.proposed_changes,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}





