/**
 * Family direct-message participants, thread keys, and Supabase helpers.
 */

import {
  assignmentHasStreamActivity,
  buildAssignmentStreamTimeline,
  formatStreamMessageBody,
  isSubmittalRequestEntry,
} from './assignmentWorkflowClient';

export function formatDmRelativeTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const deltaMs = Date.now() - d.getTime();
  const mins = Math.floor(deltaMs / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks}w`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

export function participantKey(participant) {
  if (!participant) return '';
  return `${participant.type}:${participant.id}`;
}

export function findChildLinkedUserId(childId, members = []) {
  const cid = String(childId || '');
  if (!cid) return null;
  for (const member of members) {
    const role = normalizeRole(member?.member_role || member?.role);
    if (role !== 'child' && role !== 'student') continue;
    const uid = member?.user_id ? String(member.user_id) : '';
    if (!uid) continue;
    if (member?.child_id != null && String(member.child_id) === cid) return uid;
    const scope = Array.isArray(member?.child_scope) ? member.child_scope : [];
    if (scope.some((id) => String(id) === cid)) return uid;
  }
  return null;
}

function avatarKeyForUser(userId) {
  const raw = String(userId || '');
  if (!raw) return 'prof1';
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash + raw.charCodeAt(i)) % 10;
  }
  return `prof${hash + 1}`;
}

/**
 * Build DM rows for the signed-in user (excludes self).
 */
export function buildFamilyDmParticipants({
  children = [],
  members = [],
  currentUserId = null,
  viewerRole = 'parent',
  viewerChildId = null,
}) {
  const me = currentUserId ? String(currentUserId) : '';
  const isChildViewer = viewerRole === 'child' || viewerRole === 'student';
  const isTutorViewer = viewerRole === 'tutor';
  const viewerChild = viewerChildId ? String(viewerChildId) : null;
  const selfMember = (Array.isArray(members) ? members : []).find(
    (m) => m?.user_id && String(m.user_id) === me
  );
  const tutorScope = isTutorViewer && Array.isArray(selfMember?.child_scope)
    ? selfMember.child_scope.map((id) => String(id))
    : [];
  const byKey = new Map();

  const addParticipant = (participant) => {
    const key = participantKey(participant);
    if (!key || byKey.has(key)) return;
    byKey.set(key, participant);
  };

  const activeChildren = (Array.isArray(children) ? children : [])
    .filter((c) => c && c.archived !== true);

  if (isChildViewer) {
    for (const member of members) {
      const role = normalizeRole(member?.member_role || member?.role);
      const uid = member?.user_id ? String(member.user_id) : '';
      if (!uid || uid === me) continue;
      if (role === 'parent') {
        addParticipant({
          type: 'user',
          id: uid,
          name: String(member.display_name || member.name || member.email || 'Parent').trim(),
          avatar: avatarKeyForUser(uid),
          roleLabel: 'parent',
        });
      }
      if (role === 'tutor') {
        const scope = Array.isArray(member.child_scope) ? member.child_scope : [];
        if (viewerChild && scope.length > 0 && !scope.some((id) => String(id) === viewerChild)) {
          continue;
        }
        addParticipant({
          type: 'user',
          id: uid,
          name: String(member.display_name || member.name || member.email || 'Tutor').trim(),
          avatar: avatarKeyForUser(uid),
          roleLabel: 'tutor',
        });
      }
    }
    return Array.from(byKey.values());
  }

  for (const child of activeChildren) {
    const childId = String(child?.id || '');
    if (!childId) continue;
    if (isTutorViewer && tutorScope.length > 0 && !tutorScope.includes(childId)) {
      continue;
    }
    const name = String(child.first_name || child.name || 'Child').trim();
    const avatar = child.avatar || child.avatar_url || 'prof1';
    addParticipant({
      type: 'child',
      id: childId,
      name,
      avatar,
      roleLabel: 'child',
      linkedUserId: findChildLinkedUserId(childId, members),
    });
  }

  for (const member of members) {
    const role = normalizeRole(member?.member_role || member?.role);
    const uid = member?.user_id ? String(member.user_id) : '';
    if (!uid || uid === me) continue;

    if (role === 'child' || role === 'student') {
      const linkedChildId = member.child_id != null
        ? String(member.child_id)
        : (Array.isArray(member.child_scope) && member.child_scope[0]
          ? String(member.child_scope[0])
          : null);
      if (linkedChildId && activeChildren.some((c) => String(c.id) === linkedChildId)) {
        continue;
      }
      addParticipant({
        type: 'user',
        id: uid,
        name: String(member.display_name || member.name || member.email || 'Student').trim(),
        avatar: avatarKeyForUser(uid),
        roleLabel: 'child',
      });
      continue;
    }

    if (role === 'parent') {
      addParticipant({
        type: 'user',
        id: uid,
        name: String(member.display_name || member.name || member.email || 'Parent').trim(),
        avatar: avatarKeyForUser(uid),
        roleLabel: role,
      });
      continue;
    }

    if (role === 'tutor' && !isTutorViewer) {
      addParticipant({
        type: 'user',
        id: uid,
        name: String(member.display_name || member.name || member.email || 'Tutor').trim(),
        avatar: avatarKeyForUser(uid),
        roleLabel: role,
      });
    }
  }

  return Array.from(byKey.values());
}

export function messageMatchesParticipant(message, participant, currentUserId) {
  if (!message || !participant) return false;
  const me = String(currentUserId || '');
  const sender = String(message.sender_user_id || '');
  const recipientChild = message.recipient_child_id != null
    ? String(message.recipient_child_id)
    : null;
  const recipientUser = message.recipient_user_id != null
    ? String(message.recipient_user_id)
    : null;

  if (participant.type === 'child') {
    const childId = String(participant.id);
    const linked = participant.linkedUserId ? String(participant.linkedUserId) : null;
    if (sender === me && recipientChild === childId) return true;
    if (linked && sender === me && recipientUser === linked) return true;
    if (linked && sender === linked && recipientUser === me) return true;
    return false;
  }

  const userId = String(participant.id);
  return (sender === me && recipientUser === userId)
    || (sender === userId && recipientUser === me);
}

export function buildPreviewMap(messages = [], participants = [], currentUserId) {
  const previews = new Map();
  for (const participant of participants) {
    const key = participantKey(participant);
    previews.set(key, { preview: '', lastActivityAt: null });
  }

  const sorted = [...(Array.isArray(messages) ? messages : [])].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return tb - ta;
  });

  for (const message of sorted) {
    for (const participant of participants) {
      const key = participantKey(participant);
      if (!key || previews.get(key)?.preview) continue;
      if (!messageMatchesParticipant(message, participant, currentUserId)) continue;
      const body = String(message.body || '').trim();
      const fromMe = String(message.sender_user_id) === String(currentUserId);
      previews.set(key, {
        preview: fromMe ? `You: ${body}` : body,
        lastActivityAt: message.created_at || null,
      });
    }
  }

  return previews;
}

export function sortParticipantsByActivity(participants = [], previewMap) {
  return [...participants].sort((a, b) => {
    const ta = new Date(previewMap.get(participantKey(a))?.lastActivityAt || 0).getTime();
    const tb = new Date(previewMap.get(participantKey(b))?.lastActivityAt || 0).getTime();
    if (tb !== ta) return tb - ta;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

export const ASSIGNMENT_SELECT = `
  id,
  title,
  status,
  need_help,
  submitted_at,
  review_status,
  updated_at,
  help_message_log,
  child_id,
  linked_event_ids,
  related_subject
`;

function firstUuidInText(value) {
  const text = String(value || '');
  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return match ? String(match[0]) : null;
}

export function resolveLinkedEventId(assignment) {
  const raw = assignment?.linked_event_ids;
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
      if (parsed && typeof parsed === 'object' && parsed.id) return String(parsed.id);
    } catch (_) {
      const extracted = firstUuidInText(raw);
      if (extracted) return extracted;
    }
  }
  if (raw && typeof raw === 'object' && raw.id) return String(raw.id);
  if (assignment?.linked_event_id) return String(assignment.linked_event_id);
  if (assignment?.event_id) return String(assignment.event_id);
  return null;
}

export function isSubmissionAwaitingReview(assignment) {
  if (!assignment) return false;
  const status = String(assignment.status || '').trim().toLowerCase();
  const reviewStatus = String(assignment.review_status || '').trim().toLowerCase();
  const isReviewed = reviewStatus === 'reviewed'
    || reviewStatus === 'approved'
    || status === 'reviewed'
    || status === 'accepted';
  return status === 'submitted' && !isReviewed;
}

export function deriveDmWorkflowActions(assignments = [], { viewerRole = 'parent' } = {}) {
  const isParentViewer = viewerRole === 'parent' || viewerRole === 'tutor';
  if (!isParentViewer) {
    return {
      respondHelp: null,
      gradeSubmittal: null,
      showNudge: false,
      showRequestSubmit: false,
      primaryAssignment: null,
    };
  }

  const sorted = [...(Array.isArray(assignments) ? assignments : [])].sort((a, b) => {
    const ta = new Date(a?.updated_at || 0).getTime();
    const tb = new Date(b?.updated_at || 0).getTime();
    return tb - ta;
  });

  const respondHelp = sorted.find((row) => row?.need_help === true) || null;
  const gradeSubmittal = sorted.find((row) => isSubmissionAwaitingReview(row)) || null;
  const primaryAssignment = respondHelp
    || gradeSubmittal
    || sorted.find((row) => assignmentHasStreamActivity(row))
    || sorted[0]
    || null;

  return {
    respondHelp,
    gradeSubmittal,
    showNudge: true,
    showRequestSubmit: true,
    primaryAssignment,
  };
}

export function isAssignmentSystemNotice(entry) {
  const reason = String(entry?.reason || '').trim().toLowerCase();
  return reason === 'submission'
    || reason === 'needs_revision'
    || reason === 'sent_assignment'
    || isSubmittalRequestEntry(entry);
}

export function streamKindLabel(entry) {
  if (!entry) return null;
  if (isSubmittalRequestEntry(entry)) return 'Submittal request';
  const reason = String(entry.reason || '').trim().toLowerCase();
  if (reason === 'sent_assignment') return 'Sent to student';
  if (reason === 'submission') return 'Submission';
  if (reason === 'needs_revision') return 'Revision';
  if (reason === 'help' || String(entry.body || '').includes('[Help from student')) return 'Help';
  return null;
}

export function flattenAssignmentStreamEntries(assignments = [], childName = 'Student') {
  const entries = [];
  for (const assignment of assignments) {
    if (!assignmentHasStreamActivity(assignment)) continue;
    const title = String(assignment.title || 'Assignment').trim();
    const timeline = buildAssignmentStreamTimeline(assignment, { childName });
    for (const row of timeline) {
      entries.push({
        id: `asgn:${assignment.id}:${row.id}`,
        source: 'assignment',
        createdAt: row.createdAt || assignment.updated_at || null,
        body: row.body,
        displayBody: row.displayBody || formatStreamMessageBody(row),
        senderRole: row.senderRole,
        reason: row.reason,
        assignmentId: assignment.id,
        assignmentTitle: title,
        isSystemNotice: isAssignmentSystemNotice(row),
        kindLabel: streamKindLabel(row),
      });
    }
  }
  return entries;
}

export function normalizeDirectMessageRow(row) {
  return {
    id: `dm:${row.id}`,
    source: 'dm',
    createdAt: row.created_at || null,
    body: String(row.body || '').trim(),
    displayBody: String(row.body || '').trim(),
    senderUserId: row.sender_user_id || null,
    senderRole: null,
    reason: 'message',
    assignmentId: null,
    assignmentTitle: null,
    isSystemNotice: false,
    kindLabel: null,
  };
}

export function isUnifiedMessageMine(message, viewerRole, currentUserId) {
  if (!message) return false;
  const isParentViewer = viewerRole === 'parent' || viewerRole === 'tutor';
  if (message.source === 'dm') {
    return String(message.senderUserId) === String(currentUserId);
  }
  return isParentViewer
    ? message.senderRole === 'parent'
    : message.senderRole !== 'parent';
}

export function resolveAssignmentChildContext(participant, viewerRole, viewerChildId) {
  if (participant?.type === 'child') {
    return {
      childId: String(participant.id),
      childName: participant.name || 'Student',
    };
  }
  const isChildViewer = viewerRole === 'child' || viewerRole === 'student';
  if (isChildViewer && viewerChildId && participant?.type === 'user') {
    return {
      childId: String(viewerChildId),
      childName: 'You',
    };
  }
  return null;
}

export function mergeUnifiedStream({
  directMessages = [],
  assignments = [],
  participant,
  currentUserId,
  viewerRole = 'parent',
  viewerChildId = null,
}) {
  const dmRows = (Array.isArray(directMessages) ? directMessages : [])
    .filter((row) => messageMatchesParticipant(row, participant, currentUserId))
    .map(normalizeDirectMessageRow);

  let assignmentEntries = [];
  const childCtx = resolveAssignmentChildContext(participant, viewerRole, viewerChildId);
  if (childCtx?.childId) {
    const childAssignments = (Array.isArray(assignments) ? assignments : [])
      .filter((a) => String(a?.child_id) === childCtx.childId);
    assignmentEntries = flattenAssignmentStreamEntries(
      childAssignments,
      childCtx.childName
    );
  }

  return [...dmRows, ...assignmentEntries].sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return ta - tb;
  });
}

export function latestUnifiedPreview({
  directMessages = [],
  assignments = [],
  participant,
  currentUserId,
  viewerRole = 'parent',
  viewerChildId = null,
}) {
  const stream = mergeUnifiedStream({
    directMessages,
    assignments,
    participant,
    currentUserId,
    viewerRole,
    viewerChildId,
  });
  if (stream.length === 0) {
    return { preview: '', lastActivityAt: null };
  }
  const last = stream[stream.length - 1];
  const isParentViewer = viewerRole === 'parent' || viewerRole === 'tutor';
  const fromMe = isUnifiedMessageMine(last, viewerRole, currentUserId);
  const childName = participant?.name || 'Student';
  const who = fromMe
    ? 'You'
    : (participant?.type === 'child'
      ? childName
      : (participant?.name || 'Them'));
  const text = last.displayBody || last.body || '';
  return {
    preview: text ? `${who}: ${text}` : '',
    lastActivityAt: last.createdAt || null,
  };
}

export function buildPreviewMapFromUnified({
  directMessages = [],
  assignments = [],
  participants = [],
  currentUserId,
  viewerRole = 'parent',
  viewerChildId = null,
}) {
  const previews = new Map();
  for (const participant of participants) {
    const key = participantKey(participant);
    const meta = latestUnifiedPreview({
      directMessages,
      assignments,
      participant,
      currentUserId,
      viewerRole,
      viewerChildId,
    });
    previews.set(key, meta);
  }
  return previews;
}

export function buildSendPayload(familyId, participant, body, currentUserId) {
  const trimmed = String(body || '').trim();
  if (!trimmed || !familyId || !currentUserId || !participant) return null;

  const base = {
    family_id: familyId,
    sender_user_id: currentUserId,
    body: trimmed,
    recipient_child_id: null,
    recipient_user_id: null,
  };

  if (participant.type === 'child') {
    const linked = participant.linkedUserId ? String(participant.linkedUserId) : null;
    if (linked) {
      return { ...base, recipient_user_id: linked };
    }
    return { ...base, recipient_child_id: String(participant.id) };
  }

  return { ...base, recipient_user_id: String(participant.id) };
}

