/**
 * AI Recommendations API Client
 */
import { apiRequest } from '../apiClient';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Get AI recommendations for a child
 */
export async function getRecommendations(childId, recommendationType = null) {
  const url = `${API_BASE}/api/ai/recommendations/${childId}${recommendationType ? `?recommendation_type=${recommendationType}` : ''}`;
  return apiRequest(url);
}

/**
 * Accept a recommendation
 */
export async function acceptRecommendation(recommendationId) {
  return apiRequest(`${API_BASE}/api/ai/recommendations/${recommendationId}/accept`, {
    method: 'POST',
  });
}

/**
 * Dismiss a recommendation
 */
export async function dismissRecommendation(recommendationId) {
  return apiRequest(`${API_BASE}/api/ai/recommendations/${recommendationId}/dismiss`, {
    method: 'POST',
  });
}

