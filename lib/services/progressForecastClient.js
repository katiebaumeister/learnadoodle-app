/**
 * Progress Forecast API Client
 * Handles progress forecasting API calls
 */

import { apiRequest } from '../apiClient';

/**
 * Forecast progress for children
 * @param {Object} params
 * @param {string} params.family_id
 * @param {string[]} params.child_ids
 * @param {{start: string, end: string}} params.range
 * @param {string} [params.timezone] - Timezone (default: America/New_York)
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function forecastProgress(params) {
  try {
    return await apiRequest('/api/progress/forecast', {
      method: 'POST',
      body: JSON.stringify({
        family_id: params.family_id,
        child_ids: params.child_ids,
        range: params.range,
        timezone: params.timezone || 'America/New_York',
        subject_id: params.subject_id || null,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}





