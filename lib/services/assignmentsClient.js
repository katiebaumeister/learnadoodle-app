/**
 * Assignments API Client
 * Functions for interacting with assignments via Supabase RPCs
 */
import { supabase } from '../supabase';
import { shouldSuppressError } from '../apiClient';

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const needle = String(columnName || '').toLowerCase();
  if (!msg || !needle) return false;
  return msg.includes(needle) && (msg.includes('could not find') || msg.includes('column'));
}

/**
 * Get all assignments for a child
 * @param {string} childId - Child ID
 * @returns {Promise<{data: Array, error: Error|null}>}
 */
export async function getAssignments(childId) {
  try {
    const { data, error } = await supabase.rpc('get_assignments', {
      p_child_id: childId,
    });

    if (error) {
      // Suppress expected errors from console logging
      if (!shouldSuppressError(error)) {
      }
      return { data: null, error };
    }

    return { data: data || [], error: null };
  } catch (err) {
    // Suppress expected errors from console logging
    if (!shouldSuppressError(err)) {
    }
    return { data: null, error: err };
  }
}

/**
 * Submit an assignment with evidence
 * @param {string} assignmentId - Assignment ID
 * @param {string} evidenceId - Evidence/Upload ID
 * @param {string} notes - Optional notes
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function submitAssignment(assignmentId, evidenceId, notes = null) {
  try {
    const { data, error } = await supabase.rpc('submit_assignment', {
      p_assignment_id: assignmentId,
      p_evidence_id: evidenceId,
      p_notes: notes,
    });

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Review an assignment
 * @param {string} assignmentId - Assignment ID
 * @param {number} rating - Rating 1-5 (optional)
 * @param {string} feedback - Feedback text (optional)
 * @param {boolean} accepted - Whether assignment is accepted
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function reviewAssignment(assignmentId, rating = null, feedback = null, accepted = false) {
  try {
    const { data, error } = await supabase.rpc('review_assignment', {
      p_assignment_id: assignmentId,
      p_rating: rating,
      p_feedback: feedback,
      p_accepted: accepted,
    });

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Toggle need_help flag on an assignment
 * @param {string} assignmentId - Assignment ID
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function toggleNeedHelp(assignmentId) {
  try {
    const { data, error } = await supabase.rpc('toggle_need_help', {
      p_assignment_id: assignmentId,
    });

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Create a new assignment
 * @param {Object} assignmentData - Assignment data
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function createAssignment(assignmentData) {
  try {
    const payload = {
      family_id: assignmentData.family_id,
      child_id: assignmentData.child_id,
      title: assignmentData.title,
      description: assignmentData.description || null,
      assigned_by: assignmentData.assigned_by || null,
      related_subject: assignmentData.related_subject || null,
      related_syllabus_unit: assignmentData.related_syllabus_unit || null,
      due_date: assignmentData.due_date || null,
      status: assignmentData.status || 'not_started',
      submitted_at: assignmentData.submitted_at || null,
      review_status: assignmentData.review_status || null,
      linked_event_ids: assignmentData.linked_event_ids || [],
      linked_evidence_ids: assignmentData.linked_evidence_ids || [],
      need_help: assignmentData.need_help || false,
    };

    let { data, error } = await supabase
      .from('assignments')
      .insert(payload)
      .select()
      .single();

    if (error && isMissingColumnError(error, 'submitted_at')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.submitted_at;
      ({ data, error } = await supabase
        .from('assignments')
        .insert(fallbackPayload)
        .select()
        .single());
    }

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Update an assignment
 * @param {string} assignmentId - Assignment ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<{data: Object, error: Error|null}>}
 */
export async function updateAssignment(assignmentId, updates) {
  try {
    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    let { data, error } = await supabase
      .from('assignments')
      .update(payload)
      .eq('id', assignmentId)
      .select()
      .single();

    if (error && payload.submitted_at !== undefined && isMissingColumnError(error, 'submitted_at')) {
      const fallbackPayload = { ...payload };
      delete fallbackPayload.submitted_at;
      ({ data, error } = await supabase
        .from('assignments')
        .update(fallbackPayload)
        .eq('id', assignmentId)
        .select()
        .single());
    }

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

