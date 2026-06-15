/**
 * Assignment activity feed for subject bulletin boards.
 */

import { supabase } from '../supabase';
import { buildActivitySummary, ACTIVITY_TYPE } from '../assignmentLifecycle';

export { ACTIVITY_TYPE };

export async function recordAssignmentActivity({
  familyId,
  assignmentId = null,
  subjectId = null,
  childId = null,
  activityType,
  summary = null,
  childName = null,
  assignmentTitle = null,
  actorRole = 'system',
  actorUserId = null,
}) {
  if (!familyId || !activityType) {
    return { data: null, error: new Error('Missing activity context') };
  }

  const text = summary || buildActivitySummary({
    activityType,
    childName,
    assignmentTitle,
  });

  const { data, error } = await supabase.rpc('record_assignment_activity', {
    p_family_id: familyId,
    p_assignment_id: assignmentId,
    p_subject_id: subjectId,
    p_child_id: childId,
    p_activity_type: activityType,
    p_summary: text,
    p_actor_role: actorRole,
    p_actor_user_id: actorUserId,
  });

  return { data, error };
}

export async function fetchAssignmentActivityForSubject(familyId, subjectId, limit = 30) {
  if (!familyId) return { data: [], error: new Error('Missing family id') };
  const { data, error } = await supabase.rpc('get_assignment_activity_for_subject', {
    p_family_id: familyId,
    p_subject_id: subjectId || null,
    p_limit: limit,
  });
  if (error) return { data: [], error };
  return {
    data: (data || []).map((row) => ({
      id: row.id,
      assignmentId: row.assignment_id,
      subjectId: row.subject_id,
      childId: row.child_id,
      activityType: row.activity_type,
      summary: row.summary,
      actorRole: row.actor_role,
      actorUserId: row.actor_user_id,
      createdAt: row.created_at,
      childFirstName: row.child_first_name,
      assignmentTitle: row.assignment_title,
    })),
    error: null,
  };
}

/** Log activity from an assignment row after submit/review/assign. */
export async function logActivityFromAssignment(assignment, activityType, { childName } = {}) {
  if (!assignment?.family_id || !activityType) return;
  let name = childName;
  if (!name && assignment.child_id) {
    const { data, error } = await supabase
      .from('children')
      .select('first_name')
      .eq('id', assignment.child_id)
      .maybeSingle();
    if (error) {
      console.warn('[assignmentActivityClient] child lookup failed:', error.message);
    }
    name = data?.first_name || 'Student';
  }
  await recordAssignmentActivity({
    familyId: assignment.family_id,
    assignmentId: assignment.id || null,
    subjectId: assignment.related_subject || null,
    childId: assignment.child_id || null,
    activityType,
    childName: name,
    assignmentTitle: assignment.title,
    actorRole: activityType === ACTIVITY_TYPE.SUBMITTED ? 'child' : 'parent',
  });
}
