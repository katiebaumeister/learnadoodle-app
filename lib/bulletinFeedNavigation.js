/**
 * Open assignment / discussion targets from bulletin stream activity cards.
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';
import { ACTIVITY_TYPE } from './assignmentLifecycle';
import {
  dispatchOpenHelpForAssignment,
  openAssignmentForParent,
} from './openAssignmentWorkflow';

export async function fetchAssignment(assignmentId) {
  if (!assignmentId) return null;
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', assignmentId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/** Open the assignment workflow modal without changing the current page. */
export async function openBulletinActivityItem(item) {
  if (!item?.assignmentId) return;

  const assignment = await fetchAssignment(item.assignmentId);
  if (!assignment) return;

  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const type = String(item.activityType || '').toLowerCase();
  if (type === ACTIVITY_TYPE.QUESTION) {
    dispatchOpenHelpForAssignment(assignment);
    return;
  }
  openAssignmentForParent(assignment);
}
