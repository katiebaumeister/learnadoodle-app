/**
 * Assignment-specific comments — tied to work, separate from help thread and DMs.
 */

import { supabase } from '../supabase';
import { parseAssignmentCommentLog } from '../assignmentLifecycle';
import { recordAssignmentActivity } from './assignmentActivityClient';
import { ACTIVITY_TYPE } from '../assignmentLifecycle';

export async function appendAssignmentComment(assignmentId, body) {
  const trimmed = String(body || '').trim();
  if (!assignmentId || !trimmed) {
    return { data: null, error: new Error('Comment required') };
  }
  const { data, error } = await supabase.rpc('append_assignment_comment', {
    p_assignment_id: assignmentId,
    p_body: trimmed,
  });
  if (error) return { data: null, error };

  const senderRole = data?.sender_role || 'child';
  if (data?.success) {
    await logCommentActivity(assignmentId, senderRole);
  }

  return { data, error: null };
}

async function logCommentActivity(assignmentId, senderRole) {
  try {
    const { data: row } = await supabase
      .from('assignments')
      .select('id, family_id, child_id, title, related_subject, child:child_id(first_name, name)')
      .eq('id', assignmentId)
      .maybeSingle();
    if (!row?.family_id) return;

    const childName = row.child?.first_name || row.child?.name || 'Student';
    const activityType = senderRole === 'child' ? ACTIVITY_TYPE.QUESTION : ACTIVITY_TYPE.COMMENT;
    await recordAssignmentActivity({
      familyId: row.family_id,
      assignmentId: row.id,
      subjectId: row.related_subject || null,
      childId: row.child_id || null,
      activityType,
      childName,
      assignmentTitle: row.title,
      actorRole: senderRole,
    });
  } catch (_) {
    /* non-blocking */
  }
}

export async function markAssignmentCommentsRead(assignmentId) {
  if (!assignmentId) return { data: null, error: new Error('Missing assignment') };
  const { data, error } = await supabase.rpc('mark_assignment_comments_read', {
    p_assignment_id: assignmentId,
  });
  return { data, error };
}

export async function fetchAssignmentComments(assignmentId) {
  if (!assignmentId) return { data: [], error: new Error('Missing assignment') };
  const { data, error } = await supabase
    .from('assignments')
    .select('comment_log, comment_parent_last_read_at, comment_child_last_read_at')
    .eq('id', assignmentId)
    .maybeSingle();
  if (error) return { data: [], error };
  return {
    data: parseAssignmentCommentLog(data?.comment_log),
    meta: {
      parentLastReadAt: data?.comment_parent_last_read_at || null,
      childLastReadAt: data?.comment_child_last_read_at || null,
    },
    error: null,
  };
}
