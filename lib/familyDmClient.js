/**
 * Family direct-message participants, thread keys, and Supabase helpers.
 */

import {
  assignmentHasStreamActivity,
  buildAssignmentStreamTimeline,
  formatStreamMessageBody,
  isSubmittalRequestEntry,
} from './assignmentWorkflowClient';
import { supabase } from './supabase';

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
  if (participant.type === 'group' || participant.type === 'multicast') {
    return `${participant.type}:${participant.id}`;
  }
  return `${participant.type}:${participant.id}`;
}

export function getParticipantMembers(participant) {
  if (!participant) return [];
  if (participant.type === 'group' || participant.type === 'multicast') {
    return Array.isArray(participant.members) ? participant.members.filter(Boolean) : [];
  }
  return [participant];
}

/** Build a multi-recipient participant for group chat or separate fan-out. */
export function buildCompositeParticipant(members, deliveryMode = 'group') {
  const list = (Array.isArray(members) ? members : []).filter(Boolean);
  if (list.length === 0) return null;
  if (list.length === 1) return list[0];
  const names = list.map((p) => String(p.name || '').trim()).filter(Boolean);
  const label = names.length <= 2
    ? names.join(' & ')
    : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  const id = list.map((p) => `${p.type}:${p.id}`).sort().join('|');
  const mode = deliveryMode === 'separate' ? 'separate' : 'group';
  return {
    type: mode === 'separate' ? 'multicast' : 'group',
    id,
    threadKey: mode === 'separate' ? null : id,
    threadId: null,
    name: label,
    avatar: list[0]?.avatar || 'prof1',
    members: list,
    deliveryMode: mode,
  };
}

export function threadMembersToStorageIds(members = []) {
  const memberChildIds = [];
  const memberUserIds = [];
  (Array.isArray(members) ? members : []).forEach((member) => {
    if (!member?.id) return;
    if (member.type === 'child') {
      memberChildIds.push(String(member.id));
      return;
    }
    if (member.type === 'user') {
      memberUserIds.push(String(member.id));
    }
  });
  return {
    memberChildIds: [...new Set(memberChildIds)],
    memberUserIds: [...new Set(memberUserIds)],
  };
}

export function participantFromDmThread(thread, { children = [], members = [] } = {}) {
  if (!thread?.id) return null;
  const childIds = Array.isArray(thread.member_child_ids) ? thread.member_child_ids : [];
  const userIds = Array.isArray(thread.member_user_ids) ? thread.member_user_ids : [];
  const threadMembers = [];

  childIds.forEach((childId) => {
    const cid = String(childId);
    const child = (Array.isArray(children) ? children : []).find((c) => String(c?.id) === cid);
    threadMembers.push({
      type: 'child',
      id: cid,
      name: String(child?.first_name || child?.name || 'Child').trim(),
      avatar: child?.avatar || child?.avatar_url || 'prof1',
      roleLabel: 'child',
      linkedUserId: findChildLinkedUserId(cid, members),
    });
  });

  userIds.forEach((userId) => {
    const uid = String(userId);
    const member = (Array.isArray(members) ? members : []).find(
      (m) => m?.user_id && String(m.user_id) === uid,
    );
    threadMembers.push({
      type: 'user',
      id: uid,
      name: String(member?.display_name || member?.name || member?.email || 'Member').trim(),
      avatar: avatarKeyForUser(uid),
      roleLabel: normalizeRole(member?.member_role || member?.role) || 'user',
    });
  });

  const threadKey = String(thread.thread_key || '').trim();
  return {
    type: 'group',
    id: threadKey || String(thread.id),
    threadKey: threadKey || String(thread.id),
    threadId: String(thread.id),
    name: String(thread.display_name || 'Group').trim() || 'Group',
    avatar: threadMembers[0]?.avatar || 'prof1',
    members: threadMembers,
    deliveryMode: 'group',
  };
}

export function isDmThreadVisibleToViewer(thread, {
  viewerRole = 'parent',
  viewerChildId = null,
  currentUserId = null,
} = {}) {
  if (!thread) return false;
  const childIds = (Array.isArray(thread.member_child_ids) ? thread.member_child_ids : [])
    .map((id) => String(id));
  const userIds = (Array.isArray(thread.member_user_ids) ? thread.member_user_ids : [])
    .map((id) => String(id));
  const isChildViewer = viewerRole === 'child' || viewerRole === 'student';
  if (isChildViewer) {
    const viewerChild = viewerChildId ? String(viewerChildId) : null;
    if (viewerChild && childIds.includes(viewerChild)) return true;
    const me = currentUserId ? String(currentUserId) : '';
    return me ? userIds.includes(me) : false;
  }
  return true;
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

export function messageMatchesParticipant(message, participant, currentUserId, viewerChildId = null) {
  if (!message || !participant) return false;
  if (participant.type === 'multicast') return false;
  if (participant.type === 'group') {
    const messageThreadId = message.thread_id != null ? String(message.thread_id) : null;
    if (!messageThreadId) return false;
    const participantThreadId = participant.threadId != null
      ? String(participant.threadId)
      : null;
    return Boolean(participantThreadId && participantThreadId === messageThreadId);
  }
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
    if (recipientChild === childId && sender === linked && linked) return true;
    return false;
  }

  const userId = String(participant.id);
  const childScopeId = viewerChildId ? String(viewerChildId) : null;
  if (sender === me && recipientUser === userId) return true;
  if (sender === userId && recipientUser === me) return true;
  if (childScopeId && sender === userId && recipientChild === childScopeId) return true;
  if (childScopeId && sender === me && recipientUser === userId) return true;
  return false;
}

export function isDirectMessageRecipient(message, currentUserId, viewerChildId = null, participant = null) {
  if (!message) return false;
  if (message.thread_id != null) {
    if (participant?.type !== 'group') return false;
    if (String(message.thread_id) !== String(participant.threadId || '')) return false;
    return String(message.sender_user_id || '') !== String(currentUserId || '');
  }
  const me = String(currentUserId || '');
  const recipientUser = message.recipient_user_id != null
    ? String(message.recipient_user_id)
    : null;
  const recipientChild = message.recipient_child_id != null
    ? String(message.recipient_child_id)
    : null;
  if (recipientUser === me) return true;
  if (viewerChildId && recipientChild === String(viewerChildId)) return true;
  return false;
}

export async function markDirectMessagesRead(messageIds = []) {
  const ids = [...new Set(
    (Array.isArray(messageIds) ? messageIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];
  if (ids.length === 0) return 0;
  const { data, error } = await supabase.rpc('mark_family_direct_messages_read', {
    p_message_ids: ids,
  });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export function dispatchFamilyDirectMessagesUpdated() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('familyDirectMessagesUpdated'));
}

const FAMILY_DM_SELECT_BASE =
  'id, sender_user_id, recipient_child_id, recipient_user_id, thread_id, body, created_at, read_at';
const FAMILY_DM_SELECT_WITH_ATTACHMENTS =
  `${FAMILY_DM_SELECT_BASE}, linked_event_id, material_id`;

/** Cached after first query/insert — avoids repeated 400s when optional columns are missing. */
let familyDmAttachmentColumnsSupported = null;
let familyDmThreadColumnsSupported = null;

function isMissingFamilyDmColumnError(error, columnName) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  const column = String(columnName || '').toLowerCase();
  return Boolean(column) && message.includes('does not exist') && message.includes(column);
}

function isMissingFamilyDmAttachmentColumnsError(error) {
  return isMissingFamilyDmColumnError(error, 'linked_event_id')
    || isMissingFamilyDmColumnError(error, 'material_id');
}

function isMissingFamilyDmThreadColumnError(error) {
  return isMissingFamilyDmColumnError(error, 'thread_id');
}

export function familyDirectMessagesSupportAttachments() {
  return familyDmAttachmentColumnsSupported !== false;
}

export async function queryFamilyDirectMessages(client, {
  familyId,
  limit = 300,
  ascending = false,
} = {}) {
  if (!familyId) {
    return { data: [], error: null, attachmentsSupported: false, threadsSupported: false };
  }

  const supabaseClient = client || supabase;
  const runQuery = (select) => supabaseClient
    .from('family_direct_messages')
    .select(select)
    .eq('family_id', familyId)
    .order('created_at', { ascending })
    .limit(limit);

  const selectWithOptionalColumns = () => {
    if (familyDmAttachmentColumnsSupported === false && familyDmThreadColumnsSupported === false) {
      return FAMILY_DM_SELECT_BASE.replace(', thread_id', '');
    }
    if (familyDmAttachmentColumnsSupported === false) {
      return FAMILY_DM_SELECT_BASE;
    }
    if (familyDmThreadColumnsSupported === false) {
      return FAMILY_DM_SELECT_WITH_ATTACHMENTS.replace(', thread_id', '');
    }
    return FAMILY_DM_SELECT_WITH_ATTACHMENTS;
  };

  const select = selectWithOptionalColumns();
  const result = await runQuery(select);
  if (!result.error) {
    if (select.includes('linked_event_id')) familyDmAttachmentColumnsSupported = true;
    if (select.includes('thread_id')) familyDmThreadColumnsSupported = true;
    return {
      ...result,
      attachmentsSupported: select.includes('linked_event_id'),
      threadsSupported: select.includes('thread_id'),
    };
  }

  if (isMissingFamilyDmThreadColumnError(result.error)) {
    familyDmThreadColumnsSupported = false;
    const retry = await runQuery(
      familyDmAttachmentColumnsSupported === false
        ? FAMILY_DM_SELECT_BASE.replace(', thread_id', '')
        : FAMILY_DM_SELECT_WITH_ATTACHMENTS.replace(', thread_id', ''),
    );
    return {
      ...retry,
      attachmentsSupported: familyDmAttachmentColumnsSupported !== false,
      threadsSupported: false,
    };
  }

  if (isMissingFamilyDmAttachmentColumnsError(result.error)) {
    familyDmAttachmentColumnsSupported = false;
    const retry = await runQuery(FAMILY_DM_SELECT_BASE);
    return { ...retry, attachmentsSupported: false, threadsSupported: familyDmThreadColumnsSupported !== false };
  }

  return { ...result, attachmentsSupported: false, threadsSupported: false };
}

export async function queryFamilyDmThreads(client, { familyId, limit = 50 } = {}) {
  if (!familyId) return { data: [], error: null };
  const supabaseClient = client || supabase;
  const { data, error } = await supabaseClient
    .from('family_dm_threads')
    .select('id, family_id, thread_key, display_name, member_child_ids, member_user_ids, created_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error && isMissingFamilyDmColumnError(error, 'family_dm_threads')) {
    return { data: [], error: null };
  }
  return { data: Array.isArray(data) ? data : [], error };
}

export async function upsertFamilyDmThread(client, {
  familyId,
  threadKey,
  displayName,
  memberChildIds = [],
  memberUserIds = [],
}) {
  const supabaseClient = client || supabase;
  const { data, error } = await supabaseClient.rpc('upsert_family_dm_thread', {
    p_family_id: familyId,
    p_thread_key: threadKey,
    p_display_name: displayName,
    p_member_child_ids: memberChildIds,
    p_member_user_ids: memberUserIds,
  });
  return { threadId: data ? String(data) : null, error };
}

export async function resolveGroupThreadParticipant(client, {
  familyId,
  participant,
  children = [],
  members = [],
}) {
  if (participant?.type !== 'group' || participant?.threadId) {
    return participant;
  }
  const threadKey = String(participant.threadKey || participant.id || '').trim();
  if (!threadKey || !familyId) return participant;

  const { data, error } = await (client || supabase)
    .from('family_dm_threads')
    .select('id, family_id, thread_key, display_name, member_child_ids, member_user_ids, created_at')
    .eq('family_id', familyId)
    .eq('thread_key', threadKey)
    .maybeSingle();

  if (error || !data?.id) {
    return participant;
  }
  return participantFromDmThread(data, { children, members }) || participant;
}

export function buildThreadMessagePayload(
  familyId,
  threadId,
  body,
  currentUserId,
  { linkedEventId = null, materialId = null } = {},
) {
  const trimmed = String(body || '').trim();
  const linked = linkedEventId ? String(linkedEventId) : null;
  const material = materialId ? String(materialId) : null;
  const hasContent = trimmed || linked || material;
  if (!hasContent || !familyId || !currentUserId || !threadId) return null;
  return {
    family_id: familyId,
    sender_user_id: currentUserId,
    thread_id: threadId,
    body: trimmed,
    linked_event_id: linked,
    material_id: material,
    recipient_child_id: null,
    recipient_user_id: null,
  };
}

export async function sendGroupDirectMessage(client, {
  familyId,
  participant,
  body,
  currentUserId,
  linkedEventId = null,
  materialId = null,
}) {
  const members = getParticipantMembers(participant);
  const { memberChildIds, memberUserIds } = threadMembersToStorageIds(members);
  const threadKey = String(participant?.threadKey || participant?.id || '').trim();
  const displayName = String(participant?.name || 'Group').trim() || 'Group';
  if (!threadKey) {
    return { data: null, error: { message: 'Missing group thread key' } };
  }

  const { threadId, error: threadError } = await upsertFamilyDmThread(client, {
    familyId,
    threadKey,
    displayName,
    memberChildIds,
    memberUserIds,
  });
  if (threadError) return { data: null, error: threadError, threadId: null };

  const payload = buildThreadMessagePayload(
    familyId,
    threadId,
    body,
    currentUserId,
    { linkedEventId, materialId },
  );
  if (!payload) {
    return { data: null, error: { message: 'Could not build group message' }, threadId };
  }

  const insertResult = await insertFamilyDirectMessage(client, payload);
  return { ...insertResult, threadId };
}

export function mergeGroupThreadParticipants({
  directParticipants = [],
  threads = [],
  children = [],
  members = [],
  viewerRole = 'parent',
  viewerChildId = null,
  currentUserId = null,
}) {
  const byKey = new Map(
    (Array.isArray(directParticipants) ? directParticipants : []).map((p) => [participantKey(p), p]),
  );

  (Array.isArray(threads) ? threads : []).forEach((thread) => {
    if (!isDmThreadVisibleToViewer(thread, { viewerRole, viewerChildId, currentUserId })) {
      return;
    }
    const participant = participantFromDmThread(thread, { children, members });
    if (!participant) return;
    byKey.set(participantKey(participant), participant);
  });

  return Array.from(byKey.values());
}

export async function insertFamilyDirectMessage(client, payload) {
  const supabaseClient = client || supabase;
  if (!payload) return { data: null, error: { message: 'Missing message payload' } };

  const stripAttachmentFields = (body) => {
    const { linked_event_id: _linked, material_id: _material, ...rest } = body;
    return rest;
  };

  const attachmentOnlyPayload = Boolean(
    (payload.linked_event_id || payload.material_id)
    && !String(payload.body || '').trim()
  );

  if (familyDmAttachmentColumnsSupported === false) {
    if (attachmentOnlyPayload) {
      return {
        data: null,
        error: {
          message: 'Event and file attachments are not available until the latest database update is applied.',
        },
      };
    }
    return supabaseClient.from('family_direct_messages').insert(stripAttachmentFields(payload));
  }

  const result = await supabaseClient.from('family_direct_messages').insert(payload);
  if (!result.error) {
    familyDmAttachmentColumnsSupported = true;
    return result;
  }

  if (!isMissingFamilyDmAttachmentColumnsError(result.error)) {
    return result;
  }

  familyDmAttachmentColumnsSupported = false;
  if (attachmentOnlyPayload) {
    return {
      data: null,
      error: {
        message: 'Event and file attachments are not available until the latest database update is applied.',
      },
    };
  }
  return supabaseClient.from('family_direct_messages').insert(stripAttachmentFields(payload));
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
  related_subject,
  due_date
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

function formatOrdinalDay(day) {
  if (day >= 11 && day <= 13) return `${day}th`;
  switch (day % 10) {
    case 1: return `${day}st`;
    case 2: return `${day}nd`;
    case 3: return `${day}rd`;
    default: return `${day}th`;
  }
}

export function formatChatEventDateLabel(dateValue) {
  if (!dateValue) return null;
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return null;
  const month = parsed.toLocaleDateString('en-US', { month: 'long' });
  return `${month} ${formatOrdinalDay(parsed.getDate())}`;
}

export function formatAssignmentStreamTitle(assignment, eventStartTs = null) {
  const title = String(assignment?.title || 'Assignment').trim() || 'Assignment';
  const dateSource = eventStartTs || assignment?.due_date || null;
  const dateLabel = formatChatEventDateLabel(dateSource);
  if (!dateLabel) return title;
  return `${title} ${dateLabel}`;
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
  if (reason === 'sent_assignment') return 'Nudged';
  if (reason === 'submission') return 'Submission';
  if (reason === 'needs_revision') return 'Revision';
  if (reason === 'help' || String(entry.body || '').includes('[Help from student')) return 'Help';
  return null;
}

export function isBoilerplateStreamBody(entry) {
  const body = String(entry?.displayBody || entry?.body || '').trim();
  const reason = String(entry?.reason || '').trim().toLowerCase();
  if (reason === 'submission' && body === 'Submitted for review.') return true;
  if (reason === 'needs_revision' && body === 'Marked as needs revision.') return true;
  return false;
}

export function streamActionLink(entry, assignment, eventStartTs = null) {
  if (!entry || !assignment) return null;
  const reason = String(entry.reason || '').trim().toLowerCase();
  const body = String(entry.body || '');
  const linkedEventId = resolveLinkedEventId(assignment);
  const assignmentId = assignment.id;
  const eventLabel = formatAssignmentStreamTitle(assignment, eventStartTs);
  const withEvent = (action) => (eventLabel ? `${action} · ${eventLabel}` : action);
  const base = { assignmentId, linkedEventId, assignment, eventLabel };

  if (reason === 'submission') {
    return { ...base, label: withEvent('Submitted'), kind: 'submission' };
  }
  if (reason === 'needs_revision') {
    return { ...base, label: withEvent('Needs revision'), kind: 'submission' };
  }
  if (reason === 'sent_assignment') {
    return { ...base, label: withEvent('Nudged'), kind: 'nudge' };
  }
  if (isSubmittalRequestEntry(entry)) {
    return { ...base, label: withEvent('Submittal requested'), kind: 'event' };
  }
  if (reason === 'help' || body.includes('[Help from student')) {
    return { ...base, label: withEvent('Help requested'), kind: 'help' };
  }
  return null;
}

export function flattenAssignmentStreamEntries(assignments = [], childName = 'Student', eventDatesById = null) {
  const dates = eventDatesById instanceof Map ? eventDatesById : null;
  const entries = [];
  for (const assignment of assignments) {
    if (!assignmentHasStreamActivity(assignment)) continue;
    const linkedEventId = resolveLinkedEventId(assignment);
    const eventStartTs = linkedEventId && dates ? dates.get(linkedEventId) : null;
    const title = formatAssignmentStreamTitle(assignment, eventStartTs);
    const timeline = buildAssignmentStreamTimeline(assignment, { childName });
    for (const row of timeline) {
      const displayBody = row.displayBody || formatStreamMessageBody(row);
      entries.push({
        id: `asgn:${assignment.id}:${row.id}`,
        source: 'assignment',
        createdAt: row.createdAt || assignment.updated_at || null,
        body: row.body,
        displayBody: isBoilerplateStreamBody({ ...row, displayBody }) ? '' : displayBody,
        senderRole: row.senderRole,
        reason: row.reason,
        assignmentId: assignment.id,
        assignmentTitle: title,
        isSystemNotice: isAssignmentSystemNotice(row),
        kindLabel: streamKindLabel(row),
        actionLink: streamActionLink(row, assignment, eventStartTs),
      });
    }
  }
  return entries;
}

export function normalizeDirectMessageRow(row) {
  return {
    id: `dm:${row.id}`,
    dmId: row.id,
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
    actionLink: null,
    linkedEventId: row.linked_event_id ? String(row.linked_event_id) : null,
    materialId: row.material_id ? String(row.material_id) : null,
    readAt: row.read_at || null,
    threadId: row.thread_id ? String(row.thread_id) : null,
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
  eventDatesById = null,
}) {
  const dmSource = Array.isArray(directMessages) ? directMessages : [];
  const dmRows = participant?.type === 'group'
    ? dmSource
      .filter((row) => messageMatchesParticipant(row, participant, currentUserId, viewerChildId))
      .map(normalizeDirectMessageRow)
    : dmSource
      .filter((row) => messageMatchesParticipant(row, participant, currentUserId, viewerChildId))
      .map(normalizeDirectMessageRow);

  let assignmentEntries = [];
  if (participant?.type !== 'group') {
    const childCtx = resolveAssignmentChildContext(participant, viewerRole, viewerChildId);
    if (childCtx?.childId) {
      const childAssignments = (Array.isArray(assignments) ? assignments : [])
        .filter((a) => String(a?.child_id) === childCtx.childId);
      assignmentEntries = flattenAssignmentStreamEntries(
        childAssignments,
        childCtx.childName,
        eventDatesById,
      );
    }
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
  const fromMe = isUnifiedMessageMine(last, viewerRole, currentUserId);
  const childName = participant?.name || 'Student';
  const who = fromMe
    ? 'You'
    : (participant?.type === 'child'
      ? childName
      : (participant?.name || 'Them'));
  let text = last.displayBody || last.body || '';
  if (!text && last.actionLink?.label) {
    text = last.actionLink.label;
  } else if (!text && last.linkedEventId) {
    text = 'Shared an event';
  } else if (!text && last.materialId) {
    text = 'Shared an attachment';
  }
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

export function buildSendPayloads(
  familyId,
  participant,
  body,
  currentUserId,
  extras = {},
) {
  if (participant?.type === 'group') return [];
  return getParticipantMembers(participant)
    .map((member) => buildSendPayload(familyId, member, body, currentUserId, extras))
    .filter(Boolean);
}

export function buildSendPayload(
  familyId,
  participant,
  body,
  currentUserId,
  { linkedEventId = null, materialId = null } = {},
) {
  if (participant?.type === 'group' || participant?.type === 'multicast') {
    return null;
  }
  const trimmed = String(body || '').trim();
  const linked = linkedEventId ? String(linkedEventId) : null;
  const material = materialId ? String(materialId) : null;
  const hasContent = trimmed || linked || material;
  if (!hasContent || !familyId || !currentUserId || !participant) return null;

  const base = {
    family_id: familyId,
    sender_user_id: currentUserId,
    body: trimmed,
    linked_event_id: linked,
    material_id: material,
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

// ---------------------------------------------------------------------------
// Session caches — survive Messages pane remounts / Create·Doodle swaps so
// open + thread switches paint instantly (refresh stays silent in background).
// ---------------------------------------------------------------------------

const familyDmInboxCache = new Map();
const familyDmThreadCache = new Map();

function familyDmThreadCacheKey(familyId, participant) {
  if (!familyId || !participant) return '';
  const pKey = participantKey(participant);
  return pKey ? `${String(familyId)}:${pKey}` : '';
}

/** @returns {{ participants: any[], previewEntries: Array<[string, any]>, familyMembers: any[], doodlePreview?: string, doodleLastActivityAt?: string | null, ts: number } | null} */
export function getCachedFamilyDmInbox(familyId) {
  if (!familyId) return null;
  return familyDmInboxCache.get(String(familyId)) || null;
}

export function setCachedFamilyDmInbox(familyId, {
  participants = undefined,
  previewMap = undefined,
  familyMembers = undefined,
  doodlePreview = undefined,
  doodleLastActivityAt = undefined,
} = {}) {
  if (!familyId) return;
  const prev = familyDmInboxCache.get(String(familyId)) || {};
  familyDmInboxCache.set(String(familyId), {
    participants: participants !== undefined
      ? (Array.isArray(participants) ? participants : [])
      : (prev.participants || []),
    previewEntries: previewMap !== undefined
      ? (previewMap instanceof Map ? [...previewMap.entries()] : [])
      : (prev.previewEntries || []),
    familyMembers: familyMembers !== undefined
      ? (Array.isArray(familyMembers) ? familyMembers : [])
      : (prev.familyMembers || []),
    doodlePreview: doodlePreview !== undefined ? doodlePreview : (prev.doodlePreview || ''),
    doodleLastActivityAt: doodleLastActivityAt !== undefined
      ? doodleLastActivityAt
      : (prev.doodleLastActivityAt ?? null),
    ts: Date.now(),
  });
}

/** @returns {{ messages: any[], ts: number } | null} */
export function getCachedFamilyDmThread(familyId, participant) {
  const key = familyDmThreadCacheKey(familyId, participant);
  if (!key) return null;
  return familyDmThreadCache.get(key) || null;
}

export function setCachedFamilyDmThread(familyId, participant, messages = []) {
  const key = familyDmThreadCacheKey(familyId, participant);
  if (!key) return;
  familyDmThreadCache.set(key, {
    messages: Array.isArray(messages) ? messages : [],
    ts: Date.now(),
  });
}

/** Drop inbox/thread caches after Settings → Chats clears history. */
export function clearFamilyDmCaches(familyId = null) {
  if (!familyId) {
    familyDmInboxCache.clear();
    familyDmThreadCache.clear();
    return;
  }
  const fid = String(familyId);
  familyDmInboxCache.delete(fid);
  for (const key of [...familyDmThreadCache.keys()]) {
    if (key.startsWith(`${fid}:`)) familyDmThreadCache.delete(key);
  }
}

/**
 * Parent-only clear via backend (service role). Falls back from missing RPC.
 * @param {{ familyId: string, clearAll?: boolean, messageIds?: string[] }} opts
 */
export async function clearFamilyDirectMessages({
  familyId,
  clearAll = false,
  messageIds = [],
} = {}) {
  if (!familyId) return { deleted: 0, error: new Error('Missing family id') };
  const ids = [...new Set(
    (Array.isArray(messageIds) ? messageIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  )];
  if (!clearAll && ids.length === 0) {
    return { deleted: 0, error: null };
  }

  try {
    const { apiRequest } = await import('./apiClient.js');
    const { data, error } = await apiRequest('/api/family/clear_messages', {
      method: 'POST',
      body: JSON.stringify({
        family_id: familyId,
        clear_all: Boolean(clearAll),
        message_ids: clearAll ? [] : ids,
      }),
    });
    if (error) {
      return {
        deleted: 0,
        error: error instanceof Error
          ? error
          : new Error(error?.message || error?.detail || 'Could not clear messages'),
      };
    }
    clearFamilyDmCaches(familyId);
    dispatchFamilyDirectMessagesUpdated();
    return { deleted: typeof data?.deleted === 'number' ? data.deleted : 0, error: null };
  } catch (err) {
    return {
      deleted: 0,
      error: err instanceof Error ? err : new Error(String(err?.message || err)),
    };
  }
}

/** Collect DM message ids that belong to the given participants (chains). */
export function collectMessageIdsForParticipants(
  messages = [],
  participants = [],
  currentUserId = null,
) {
  const list = Array.isArray(participants) ? participants : [];
  if (!list.length) return [];
  const ids = [];
  for (const message of (Array.isArray(messages) ? messages : [])) {
    const mid = message?.id ? String(message.id) : '';
    if (!mid) continue;
    if (list.some((p) => messageMatchesParticipant(message, p, currentUserId))) {
      ids.push(mid);
    }
  }
  return [...new Set(ids)];
}

