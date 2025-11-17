/**
 * API client for analytics and recommendations
 */
import { apiRequest } from '../apiClient';

/**
 * Get subject performance analytics
 * @param {Object} options - Query options
 * @param {string} options.childId - Filter by child ID (optional)
 * @param {number} options.days - Number of days to look back (default: 90)
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export async function getSubjectPerformance(options = {}) {
  const params = new URLSearchParams();
  if (options.childId) params.append('childId', options.childId);
  if (options.days) params.append('days', options.days.toString());
  
  return await apiRequest(`/api/analytics/subject-performance?${params.toString()}`);
}

/**
 * Get rating trends over time by subject
 * @param {Object} options - Query options
 * @param {string} options.childId - Filter by child ID (optional)
 * @param {number} options.weeks - Number of weeks to look back (default: 12)
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export async function getTrends(options = {}) {
  const params = new URLSearchParams();
  if (options.childId) params.append('childId', options.childId);
  if (options.weeks) params.append('weeks', options.weeks.toString());
  
  return await apiRequest(`/api/analytics/trends?${params.toString()}`);
}

/**
 * Get AI-powered recommendations
 * @param {Object} options - Query options
 * @param {string} options.childId - Filter by child ID (optional)
 * @param {number} options.days - Number of days to analyze (default: 30)
 * @returns {Promise<{data: Array|null, error: Error|null}>}
 */
export async function getRecommendations(options = {}) {
  const params = new URLSearchParams();
  if (options.childId) params.append('childId', options.childId);
  if (options.days) params.append('days', options.days.toString());
  
  return await apiRequest(`/api/analytics/recommendations?${params.toString()}`);
}

/**
 * Get complete analytics overview
 * @param {Object} options - Query options
 * @param {string} options.childId - Filter by child ID (optional)
 * @param {number} options.days - Days for performance data (default: 90)
 * @param {number} options.weeks - Weeks for trends (default: 12)
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function getAnalyticsOverview(options = {}) {
  const params = new URLSearchParams();
  if (options.childId) params.append('childId', options.childId);
  if (options.days) params.append('days', options.days.toString());
  if (options.weeks) params.append('weeks', options.weeks.toString());
  
  return await apiRequest(`/api/analytics/overview?${params.toString()}`);
}

