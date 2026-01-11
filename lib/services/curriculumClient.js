/**
 * Curriculum Builder API Client
 * Handles curriculum building and committing API calls
 */

import { apiRequest } from '../apiClient';

/**
 * Build curriculum preview
 * @param {Object} params
 * @param {string} params.mode - Input mode: topic, syllabus, pdf, link, material
 * @param {string} [params.topic] - Topic prompt
 * @param {string} [params.syllabus_text] - Pasted syllabus text
 * @param {string} [params.source_url] - Source URL
 * @param {string} [params.source_file_id] - Source file ID
 * @param {string} [params.material_id] - Material ID
 * @param {string[]} params.student_ids - Student IDs
 * @param {Object} params.constraints - Constraints object
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function buildCurriculum(params) {
  try {
    return await apiRequest('/api/curriculum/build', {
      method: 'POST',
      body: JSON.stringify({
        mode: params.mode,
        topic: params.topic,
        syllabus_text: params.syllabus_text,
        source_url: params.source_url,
        source_file_id: params.source_file_id,
        material_id: params.material_id,
        student_ids: params.student_ids,
        constraints: params.constraints,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Commit curriculum to database and create calendar events
 * @param {Object} params
 * @param {Object} params.preview - Preview data from build
 * @param {boolean} params.create_calendar_events - Whether to create calendar events
 * @param {Object} params.placement - Placement options
 * @returns {Promise<{data?: any, error?: any}>}
 */
export async function commitCurriculum(params) {
  try {
    return await apiRequest('/api/curriculum/commit', {
      method: 'POST',
      body: JSON.stringify({
        preview: params.preview,
        create_calendar_events: params.create_calendar_events,
        placement: params.placement,
        add_to_backlog: params.add_to_backlog,
        lesson_backlog_map: params.lesson_backlog_map,
      }),
    });
  } catch (err) {
    return { data: null, error: err };
  }
}




