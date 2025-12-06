/**
 * AI Coach API Client
 */
import { apiRequest } from '../apiClient';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Send a message to the AI coach
 */
export async function coachConversation(message, sessionId = null, childId = null, sessionType = 'parent') {
  return apiRequest(`${API_BASE}/api/ai/coach/conversation`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      session_id: sessionId,
      child_id: childId,
      session_type: sessionType,
    }),
  });
}

/**
 * Get coach sessions
 */
export async function getCoachSessions(sessionType = null, childId = null) {
  const params = new URLSearchParams();
  if (sessionType) params.append('session_type', sessionType);
  if (childId) params.append('child_id', childId);
  
  return apiRequest(`${API_BASE}/api/ai/coach/sessions?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * Get a specific coach session
 */
export async function getCoachSession(sessionId) {
  return apiRequest(`${API_BASE}/api/ai/coach/sessions/${sessionId}`, {
    method: 'GET',
  });
}

/**
 * Get coach recommendations
 */
export async function getCoachRecommendations(sessionId = null, status = null) {
  const params = new URLSearchParams();
  if (sessionId) params.append('session_id', sessionId);
  if (status) params.append('status', status);
  
  return apiRequest(`${API_BASE}/api/ai/coach/recommendations?${params.toString()}`, {
    method: 'GET',
  });
}

/**
 * Accept a coach recommendation
 */
export async function acceptCoachRecommendation(recommendationId) {
  return apiRequest(`${API_BASE}/api/ai/coach/recommendations/${recommendationId}/accept`, {
    method: 'POST',
  });
}

