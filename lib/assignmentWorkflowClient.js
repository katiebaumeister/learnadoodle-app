import { supabase } from './supabase';
import { createAssignment, updateAssignment } from './services/assignmentsClient';
import { assignmentRowLinksEventId } from './assignmentLinkedEventUtils';

export function dispatchAssignmentRefreshEvents() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('childAssignmentsNeedRefresh'));
  window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
  window.dispatchEvent(new CustomEvent('refreshRightRail'));
  window.dispatchEvent(new CustomEvent('refreshCalendar'));
  window.dispatchEvent(new CustomEvent('refreshSubjects'));
}

export function getChildIdsFromEvent(event, fallbackChildIds = []) {
  const fromEvent = [];
  if (event?.child_id) fromEvent.push(String(event.child_id));
  if (Array.isArray(event?.child_ids)) {
    event.child_ids.forEach((id) => {
      if (id) fromEvent.push(String(id));
    });
  }
  const merged = [...new Set([...fromEvent, ...(fallbackChildIds || []).map(String)].filter(Boolean))];
  return merged;
}

export async function findLinkedAssignment({ familyId, childId, eventId }) {
  const { data: rows, error } = await supabase
    .from('assignments')
    .select('id, title, description, linked_event_ids, need_help, status, review_status, help_message_log, child_id, assigned_by, submitted_at, updated_at, created_at')
    .eq('family_id', familyId)
    .eq('child_id', childId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (rows || []).find((row) => assignmentRowLinksEventId(row, eventId)) || null;
}

export async function appendAssignmentMessage(assignmentId, body, reason = null) {
  const trimmed = String(body || '').trim();
  if (!trimmed) throw new Error('Message is required');
  const { error } = await supabase.rpc('append_assignment_help_message', {
    p_assignment_id: assignmentId,
    p_body: trimmed,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function ensureLinkedAssignment({
  familyId,
  event,
  childId,
  subjectId,
  userId,
  title,
  description = null,
  status = 'not_started',
}) {
  const eventIdStr = String(event?.id || '');
  if (!familyId || !eventIdStr || !childId) {
    throw new Error('Missing event or student');
  }
  const linked = await findLinkedAssignment({ familyId, childId, eventId: eventIdStr });
  const dueTs = event?.due_ts || event?.end_ts || event?.start_ts;
  const dueStr = dueTs ? new Date(dueTs).toISOString().split('T')[0] : null;
  const titleBase = String(title || event?.title || 'Schoolwork').trim().slice(0, 200);

  if (linked?.id) {
    const updates = {
      assigned_by: userId || linked.assigned_by,
      status,
    };
    if (description != null && String(description).trim()) {
      updates.description = String(description).trim();
    }
    const { error } = await updateAssignment(linked.id, updates);
    if (error) throw error;
    return linked.id;
  }

  const { data: created, error: insErr } = await createAssignment({
    family_id: familyId,
    child_id: childId,
    title: titleBase,
    description: description || null,
    assigned_by: userId || null,
    related_subject: subjectId || event?.subject_id || null,
    due_date: dueStr,
    status,
    linked_event_ids: [eventIdStr],
    need_help: false,
  });
  if (insErr) throw insErr;
  return created?.id || null;
}

export function formatAssignmentThreadLines(assignment, { childName = 'Student' } = {}) {
  const log = Array.isArray(assignment?.help_message_log) ? assignment.help_message_log : [];
  return log
    .map((entry, index) => {
      const role = String(entry?.sender_role || '').toLowerCase();
      const isChild = role === 'child' || role === 'student';
      const who = isChild ? childName : 'You';
      const ts = entry?.created_at ? new Date(entry.created_at) : null;
      const when = ts && !Number.isNaN(ts.getTime())
        ? ts.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : '';
      const body = String(entry?.body || '').trim();
      if (!body) return null;
      return `${who}${when ? ` · ${when}` : ''}: ${body}`;
    })
    .filter(Boolean);
}

export function parseAssignmentMessageLog(rawLog) {
  const rows = Array.isArray(rawLog) ? rawLog : [];
  return rows
    .filter((row) => row && typeof row === 'object')
    .map((row, index) => ({
      id: String(row.id || `msg-${index}`),
      senderRole: String(row.sender_role || '').trim().toLowerCase(),
      reason: String(row.reason || '').trim().toLowerCase(),
      body: String(row.body || '').trim(),
      createdAt: row.created_at || null,
    }))
    .filter((row) => row.body.length > 0);
}

export function isSubmittalRequestEntry(entry) {
  const reason = String(entry?.reason || '').trim().toLowerCase();
  const body = String(entry?.body || '').trim();
  return reason === 'submittal_request' || body.startsWith('[Submittal requested]');
}

export function formatStreamMessageBody(entry) {
  const reason = String(entry?.reason || '').trim().toLowerCase();
  const body = String(entry?.body || '').trim();
  if (isSubmittalRequestEntry(entry)) {
    const detail = body.replace(/^\[Submittal requested\]\s*/i, '').trim();
    const firstLine = detail.split('\n').map((line) => line.trim()).find(Boolean) || '';
    return firstLine ? `Submittal requested — ${firstLine}` : 'Submittal requested';
  }
  if (reason === 'sent_assignment') {
    return body || 'Reminder about this assignment';
  }
  if (body.includes('[Help from student')) {
    const stripped = body.replace(/^\[Help from student — [^\]]+\]\s*\n?/, '').trim();
    return stripped || 'Help requested';
  }
  const firstLine = body.split('\n').map((line) => line.trim()).find(Boolean) || body;
  return firstLine;
}

function resolveChildNameFromAssignment(assignment, children = []) {
  const childId = String(assignment?.child_id || '').trim();
  if (!childId) return 'Student';
  const match = (children || []).find((c) => String(c?.id) === childId);
  return String(match?.first_name || match?.name || 'Student').trim() || 'Student';
}

export function assignmentHasStreamActivity(assignment) {
  if (!assignment) return false;
  const messages = parseAssignmentMessageLog(assignment.help_message_log);
  if (messages.length > 0) return true;
  if (assignment.need_help === true) return true;
  const status = String(assignment?.status || '').trim().toLowerCase();
  if (status === 'submitted') return true;
  const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
  if (reviewStatus === 'needs_revision') return true;
  return false;
}

export function buildAssignmentStreamTimeline(assignment, { childName = 'Student' } = {}) {
  const messages = parseAssignmentMessageLog(assignment?.help_message_log).map((entry) => ({
    ...entry,
    displayBody: formatStreamMessageBody(entry),
    senderRole: entry.senderRole === 'parent' ? 'parent' : 'child',
  }));
  const syntheticMessages = [];
  const status = String(assignment?.status || '').trim().toLowerCase();
  const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
  if (status === 'submitted' && assignment?.submitted_at) {
    syntheticMessages.push({
      id: `submitted-${assignment.id}`,
      senderRole: 'child',
      reason: 'submission',
      body: 'Submitted for review.',
      displayBody: 'Submitted for review.',
      createdAt: assignment.submitted_at,
    });
  }
  if (reviewStatus === 'needs_revision') {
    syntheticMessages.push({
      id: `revision-${assignment.id}`,
      senderRole: 'parent',
      reason: 'needs_revision',
      body: 'Marked as needs revision.',
      displayBody: 'Marked as needs revision.',
      createdAt: assignment.updated_at,
    });
  }
  return [...syntheticMessages, ...messages].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return ta - tb;
  });
}

export function deriveAssignmentStreamMeta(assignment) {
  const messages = parseAssignmentMessageLog(assignment?.help_message_log);
  const status = String(assignment?.status || '').trim().toLowerCase();
  const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
  const hasSubmittalRequest = messages.some(isSubmittalRequestEntry);
  const hasNudge = messages.some((entry) => entry.reason === 'sent_assignment');
  const hasHelp = assignment?.need_help === true;
  const hasSubmission = status === 'submitted';
  const needsRevision = reviewStatus === 'needs_revision';
  const lastEntry = messages[messages.length - 1] || null;

  let typeLabel = 'Assignment message';
  if (needsRevision) typeLabel = 'Revision';
  else if (hasSubmission && !hasHelp) typeLabel = 'Submission';
  else if (hasHelp) typeLabel = 'Help';
  else if (lastEntry && isSubmittalRequestEntry(lastEntry)) typeLabel = 'Submittal request';
  else if (hasSubmittalRequest) typeLabel = 'Submittal request';
  else if (hasNudge) typeLabel = 'Reminder';

  return {
    hasSubmittalRequest,
    hasNudge,
    hasHelp,
    hasSubmission,
    needsRevision,
    typeLabel,
  };
}

export function getAssignmentThreadPreview(assignment, { isParentViewer = true, childName = 'Student', children = [] } = {}) {
  if (!assignment) {
    return { preview: null, kind: null, hasActivity: false, lastActivityAt: null };
  }
  const resolvedChildName = childName || resolveChildNameFromAssignment(assignment, children);
  const timeline = buildAssignmentStreamTimeline(assignment, { childName: resolvedChildName });
  const meta = deriveAssignmentStreamMeta(assignment);

  if (timeline.length === 0) {
    if (meta.hasHelp) {
      return {
        preview: `${resolvedChildName} asked for help`,
        kind: 'help',
        hasActivity: true,
        lastActivityAt: assignment.updated_at || null,
      };
    }
    return { preview: null, kind: null, hasActivity: false, lastActivityAt: null };
  }

  const last = timeline[timeline.length - 1];
  const isChildMsg = last.senderRole !== 'parent';
  const formatted = last.displayBody || formatStreamMessageBody(last);
  const who = isParentViewer
    ? (isChildMsg ? resolvedChildName : 'You')
    : (isChildMsg ? 'You' : 'Parent');

  let kind = 'message';
  if (last.reason === 'submission' || meta.hasSubmission) kind = 'submission';
  else if (isSubmittalRequestEntry(last) || meta.hasSubmittalRequest) kind = 'submittal';
  else if (last.reason === 'sent_assignment' || meta.hasNudge) kind = 'nudge';
  else if (meta.hasHelp && isChildMsg) kind = 'help';

  return {
    preview: `${who}: ${formatted}`,
    kind,
    hasActivity: true,
    lastActivityAt: last.createdAt || assignment.updated_at || null,
  };
}
