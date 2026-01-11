/**
 * Planner Instrumentation Service
 * Tracks user actions and planner events for analytics and debugging
 */
import { supabase } from '../../lib/supabase.js';

export type PlannerActionType =
  | 'drag_drop'
  | 'add_event'
  | 'delete_event'
  | 'undo_reschedule'
  | 'apply_reschedule'
  | 'override_created'
  | 'blackout_created'
  | 'schedule_adjusted'
  | 'event_edited'
  | 'event_completed'
  | 'rebalance_requested';

export interface PlannerActionMetadata {
  event_id?: string;
  event_ids?: string[];
  date?: string;
  start_date?: string;
  end_date?: string;
  child_id?: string;
  subject_id?: string;
  adjustment_type?: string;
  reason?: string;
  [key: string]: any;
}

/**
 * Log a user action to the planner instrumentation system
 */
export async function logPlannerAction(
  actionType: PlannerActionType,
  metadata?: PlannerActionMetadata
): Promise<boolean> {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return false;
    }

    // Get family_id from user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('family_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.family_id) {
      return false;
    }

    // Extract child_id from metadata if present
    const childId = metadata?.child_id || null;

    // Call backend API to log action
    const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/log/planner_action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
      },
      body: JSON.stringify({
        family_id: profile.family_id,
        user_id: user.id,
        action_type: actionType,
        child_id: childId,
        metadata: metadata || {},
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Auto-log drag-drop event
 */
export function logDragDrop(
  eventId: string,
  fromDate: string,
  toDate: string,
  fromTime: string,
  toTime: string,
  childId?: string
): void {
  logPlannerAction('drag_drop', {
    event_id: eventId,
    from_date: fromDate,
    to_date: toDate,
    from_time: fromTime,
    to_time: toTime,
    child_id: childId,
  }).catch(() => {})
}

/**
 * Auto-log add event
 */
export function logAddEvent(
  eventId: string,
  date: string,
  childId?: string,
  subjectId?: string
): void {
  logPlannerAction('add_event', {
    event_id: eventId,
    date,
    child_id: childId,
    subject_id: subjectId,
  }).catch(() => {})
}

/**
 * Auto-log delete event
 */
export function logDeleteEvent(
  eventId: string,
  date: string,
  childId?: string
): void {
  logPlannerAction('delete_event', {
    event_id: eventId,
    date,
    child_id: childId,
  }).catch(() => {})
}

/**
 * Auto-log undo reschedule
 */
export function logUndoReschedule(eventIds?: string[]): void {
  logPlannerAction('undo_reschedule', {
    event_ids: eventIds,
  }).catch(() => {})
}

/**
 * Auto-log apply reschedule
 */
export function logApplyReschedule(
  eventIds: string[],
  diffCount?: number
): void {
  logPlannerAction('apply_reschedule', {
    event_ids: eventIds,
    diff_count: diffCount,
  }).catch(() => {})
}

/**
 * Auto-log override created
 */
export function logOverrideCreated(
  date: string,
  overrideKind: string,
  childId?: string
): void {
  logPlannerAction('override_created', {
    date,
    adjustment_type: overrideKind,
    child_id: childId,
  }).catch(() => {})
}

/**
 * Auto-log blackout created
 */
export function logBlackoutCreated(
  startDate: string,
  endDate: string,
  reason?: string,
  childId?: string
): void {
  logPlannerAction('blackout_created', {
    start_date: startDate,
    end_date: endDate,
    reason,
    child_id: childId,
  }).catch(() => {})
}

/**
 * Auto-log schedule adjusted
 */
export function logScheduleAdjusted(
  adjustmentType: string,
  startDate: string,
  endDate?: string,
  childId?: string
): void {
  logPlannerAction('schedule_adjusted', {
    adjustment_type: adjustmentType,
    start_date: startDate,
    end_date: endDate,
    child_id: childId,
  }).catch(() => {})
}

