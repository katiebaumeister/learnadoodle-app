/**
 * API client for event completion and attendance tracking
 */
import { apiRequest } from '../apiClient';

/**
 * Mark an event as completed and create/update attendance record
 * @param {string} eventId - Event ID
 * @param {Object} options - Optional overrides
 * @param {number} options.minutes_override - Override calculated minutes
 * @param {string} options.note - Optional note about completion
 * @returns {Promise<{data: {event: Object, attendance: Object}|null, error: Error|null}>}
 */
export async function completeEvent(eventId, options = {}) {
  return await apiRequest(`/api/events/${eventId}/complete`, {
    method: 'POST',
    body: JSON.stringify({
      minutes_override: options.minutes_override,
      note: options.note,
    }),
  });
}

/**
 * Save or update an outcome report for a completed event
 * @param {string} eventId - Event ID
 * @param {Object} outcome - Outcome data
 * @param {number} outcome.rating - Rating 1-5 (optional)
 * @param {string} outcome.grade - Grade like 'A', 'B+' (optional)
 * @param {string} outcome.note - Freeform note (optional)
 * @param {string[]} outcome.strengths - Strengths chips (optional)
 * @param {string[]} outcome.struggles - Struggles chips (optional)
 * @returns {Promise<{data: Object|null, error: Error|null}>}
 */
export async function saveOutcome(eventId, outcome) {
  return await apiRequest(`/api/events/${eventId}/outcome`, {
    method: 'POST',
    body: JSON.stringify({
      rating: outcome.rating,
      grade: outcome.grade,
      note: outcome.note,
      strengths: outcome.strengths || [],
      struggles: outcome.struggles || [],
    }),
  });
}

/**
 * Get AI suggestions for strengths/struggles tags
 * @param {string} eventId - Event ID
 * @returns {Promise<{data: {suggested_strengths: string[], suggested_struggles: string[]}|null, error: Error|null}>}
 */
export async function getEventTags(eventId) {
  return await apiRequest('/api/ai/event_tags', {
    method: 'POST',
    body: JSON.stringify({
      event_id: eventId,
    }),
  });
}

