/**
 * Reminders API Client
 */
import { apiRequest } from '../apiClient';
import { supabase } from '../supabase';

const API_BASE = process.env.REACT_APP_API_URL || '';

/**
 * Get reminders for a child or family
 */
export async function getReminders(childId = null, familyId = null, status = 'pending') {
  try {
    let query = supabase
      .from('reminders')
      .select('*')
      .eq('status', status)
      .order('scheduled_for', { ascending: true });

    if (childId) {
      query = query.eq('child_id', childId);
    }
    if (familyId) {
      query = query.eq('family_id', familyId);
    }

    const { data, error } = await query;

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Create a reminder
 */
export async function createReminder(reminderData) {
  try {
    const { data, error } = await supabase
      .from('reminders')
      .insert(reminderData)
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Update reminder status
 */
export async function updateReminderStatus(reminderId, status) {
  try {
    const { data, error } = await supabase
      .from('reminders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', reminderId)
      .select()
      .single();

    if (error) {
      return { data: null, error };
    }

    return { data, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Delete a reminder
 */
export async function deleteReminder(reminderId) {
  try {
    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', reminderId);

    if (error) {
      return { data: null, error };
    }

    return { data: { success: true }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Create reminder for assignment due date
 */
export async function createAssignmentReminder(assignmentId, childId, familyId, scheduledFor, message = null) {
  try {
    // Get assignment details
    const { data: assignment, error: assignError } = await supabase
      .from('assignments')
      .select('title, due_date')
      .eq('id', assignmentId)
      .single();

    if (assignError) {
      return { data: null, error: assignError };
    }

    const reminderData = {
      family_id: familyId,
      child_id: childId,
      reminder_type: 'assignment_due',
      title: `Assignment Due: ${assignment.title}`,
      message: message || `Time to finish: ${assignment.title}`,
      scheduled_for: scheduledFor,
      linked_assignment_id: assignmentId,
      status: 'pending',
    };

    return await createReminder(reminderData);
  } catch (err) {
    return { data: null, error: err };
  }
}

