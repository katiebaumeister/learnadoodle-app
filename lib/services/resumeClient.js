/**
 * Resume Client
 * Functions for managing resume positions in content
 */
import { supabase } from '../supabase';

/**
 * Update resume position for an event
 * @param {string} eventId
 * @param {string} position - Position string (e.g., "12:34" or "Chapter 3, Lesson 2" or "754" for seconds)
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export async function updateResumePosition(eventId, position) {
  try {
    const { data, error } = await supabase
      .from('events')
      .update({ resume_position: position })
      .eq('id', eventId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('[resumeClient] Error updating resume position:', err);
    return { data: null, error: err };
  }
}

/**
 * Mark event as complete and clear resume position
 * @param {string} eventId
 * @returns {Promise<{data: any, error: Error|null}>}
 */
export async function markComplete(eventId) {
  try {
    const { data, error } = await supabase
      .from('events')
      .update({ 
        status: 'done',
        resume_position: null 
      })
      .eq('id', eventId)
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error('[resumeClient] Error marking complete:', err);
    return { data: null, error: err };
  }
}

/**
 * Get resumable events for a child or family
 * @param {Object} params - { childId?, familyId, limit? }
 * @returns {Promise<{data: any[], error: Error|null}>}
 */
export async function getResumableEvents({ childId, familyId, limit = 10 }) {
  try {
    let query = supabase
      .from('events')
      .select('id, title, source_link, resume_position, start_ts, status, subject_id')
      .eq('family_id', familyId)
      .not('source_link', 'is', null)
      .not('resume_position', 'is', null)
      .in('status', ['scheduled', 'in_progress'])
      .order('start_ts', { ascending: true })
      .limit(limit);

    if (childId) {
      query = query.eq('child_id', childId);
    }

    const { data, error } = await query;

    if (error) throw error;

    // Filter to only incomplete events
    const filtered = (data || []).filter(e => 
      e.resume_position && 
      e.source_link && 
      e.status !== 'done' &&
      e.status !== 'canceled'
    );

    return { data: filtered, error: null };
  } catch (err) {
    console.error('[resumeClient] Error getting resumable events:', err);
    return { data: null, error: err };
  }
}

