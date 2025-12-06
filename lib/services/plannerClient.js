/**
 * Planner Client - API client for planner operations
 */
import { apiRequest } from '../apiClient';

/**
 * Auto-generate planner events from syllabus/course
 * @param {Object} params
 * @param {string} params.familyId
 * @param {string} params.courseId
 * @param {string[]} params.childIds
 * @param {string} params.startDate - ISO date string
 * @param {string} params.endDate - ISO date string
 * @param {string} params.strategy - 'even' | 'use_target_dates'
 * @returns {Promise<{data: any, error: any}>}
 */
export async function autoScheduleCourseFromSyllabus({
  familyId,
  courseId,
  childIds,
  startDate,
  endDate,
  strategy = 'even',
}) {
  try {
    const { data, error } = await apiRequest('/api/planner/auto_schedule_course', {
      method: 'POST',
      body: JSON.stringify({
        family_id: familyId,
        course_id: courseId,
        child_ids: childIds,
        start_date: startDate,
        end_date: endDate,
        strategy,
      }),
    });
    
    if (error) {
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

