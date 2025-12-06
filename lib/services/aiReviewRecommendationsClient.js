/**
 * AI Review Recommendations API Client
 */
import { apiRequest } from '../apiClient';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Generate review recommendations
 */
export async function generateReviewRecommendations(childId, recommendationTypes = null) {
  const params = new URLSearchParams();
  params.append('child_id', childId);
  if (recommendationTypes) {
    recommendationTypes.forEach(type => params.append('recommendation_types', type));
  }
  
  return apiRequest(`${API_BASE}/api/ai/reviews/generate?${params.toString()}`, {
    method: 'POST',
  });
}

/**
 * Get review recommendations
 */
export async function getReviewRecommendations(childId, recommendationType = null, status = null, priorityMin = null, limit = 20) {
  const params = new URLSearchParams();
  params.append('child_id', childId);
  if (recommendationType) params.append('recommendation_type', recommendationType);
  if (status) params.append('status', status);
  if (priorityMin) params.append('priority_min', priorityMin.toString());
  params.append('limit', limit.toString());
  
  return apiRequest(`${API_BASE}/api/ai/reviews/?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * Schedule a review
 */
export async function scheduleReview(recommendationId, scheduledDate) {
  const params = new URLSearchParams();
  params.append('scheduled_date', scheduledDate);
  
  return apiRequest(`${API_BASE}/api/ai/reviews/${recommendationId}/schedule?${params.toString()}`, {
    method: 'POST',
  });
}

/**
 * Complete a review
 */
export async function completeReview(recommendationId, actualTimeMinutes = null, effectivenessRating = null, notes = null) {
  const params = new URLSearchParams();
  if (actualTimeMinutes) params.append('actual_time_minutes', actualTimeMinutes.toString());
  if (effectivenessRating) params.append('effectiveness_rating', effectivenessRating.toString());
  if (notes) params.append('notes', notes);
  
  return apiRequest(`${API_BASE}/api/ai/reviews/${recommendationId}/complete?${params.toString()}`, {
    method: 'POST',
  });
}

/**
 * Dismiss a review recommendation
 */
export async function dismissReview(recommendationId) {
  return apiRequest(`${API_BASE}/api/ai/reviews/${recommendationId}/dismiss`, {
    method: 'POST',
  });
}

