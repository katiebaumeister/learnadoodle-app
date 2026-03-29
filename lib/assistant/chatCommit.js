/**
 * Chatbot commits: review-before-apply + consistent audit payloads for ai_actions.
 * Extend CHAT_COMMIT_KINDS as new flows (materials, grades, etc.) are added.
 */

import { summarizeEventForChat } from './eventChatActions.js';

export const CHAT_COMMIT_KINDS = Object.freeze({
  CREATE_EVENT: 'chatbot.create_event',
  ADD_ACTIVITY: 'chatbot.add_activity',
  QUEUE_RESCHEDULE: 'chatbot.queue_reschedule',
  DELETE_EVENT: 'chatbot.delete_event',
  UPDATE_EVENT: 'chatbot.update_event',
  MARK_ATTENDANCE: 'chatbot.mark_attendance',
  DELETE_MATERIAL: 'chatbot.delete_material',
  UPDATE_MATERIAL: 'chatbot.update_material',
  UPDATE_CHILD: 'chatbot.update_child',
  ARCHIVE_CHILD: 'chatbot.archive_child',
  DELETE_CHILD_PERMANENT: 'chatbot.delete_child_permanent',
  ADD_SUBJECT: 'chatbot.add_subject',
  DELETE_SUBJECT: 'chatbot.delete_subject',
  UPDATE_SUBJECT: 'chatbot.update_subject',
  LOG_GRADE: 'chatbot.log_grade',
  ADD_MATERIAL_LINK: 'chatbot.add_material_link',
});

/** Kinds that use the review bar + executeTool / RPC on confirm */
export const PENDING_COMMIT_KINDS = new Set(Object.values(CHAT_COMMIT_KINDS));

/** @param {object | null} response - assistant response from processDoodleMessage */
export function getPendingCommit(response) {
  return response?.pendingCommit ?? null;
}

/**
 * Payload stored in ai_actions.action_data for every user-confirmed chatbot commit.
 * Query: action_type LIKE 'chatbot.%' OR action_data->>'chatbot' = 'true'
 */
export function buildChatbotAuditPayload(kind, proposal, result, extra = {}) {
  return {
    chatbot: true,
    source_channel: 'doodle_chat',
    action_kind: kind,
    committed_at: new Date().toISOString(),
    proposal,
    result,
    ...extra,
  };
}

export function summarizeAddActivityCommit(params) {
  const name = (params?.name || 'Activity').trim();
  const type = (params?.activity_type || 'homework').trim();
  return `• Activity: ${name}\n• Type: ${type}`;
}

export function summarizeQueueRescheduleCommit(params) {
  const d = params?.calendar_date || '—';
  const note = (params?.note || '').trim();
  const noteShort = note.length > 140 ? `${note.slice(0, 137)}…` : note;
  return `• Queue date: ${d}\n• Note: ${noteShort || '(your request)'}`;
}

/** @param {{ title?: string, start_ts?: string, event_type?: string }} snapshot */
export function summarizeDeleteEventProposal(snapshot) {
  return summarizeEventForChat({
    title: snapshot?.title,
    start_ts: snapshot?.start_ts,
    event_type: snapshot?.event_type || 'Event',
  });
}

/** @param {{ title?: string, start_ts?: string, event_type?: string }} eventSnapshot */
export function summarizeUpdateEventProposal(eventSnapshot, changeLines) {
  const base = summarizeEventForChat(eventSnapshot);
  const lines = Array.isArray(changeLines) ? changeLines.join('\n') : String(changeLines || '');
  return `${base}\n${lines}`.trim();
}

/** @param {{ childName?: string, dateISO?: string, uiStatus?: string }} p */
export function summarizeMarkAttendanceProposal(p) {
  const who = (p?.childName || 'Student').trim();
  const day = p?.dateISO || '—';
  const st = (p?.uiStatus || 'present').trim();
  return `• ${who}\n• ${day}\n• ${st}`;
}

/** @param {{ title?: string, type?: string }} m */
export function summarizeDeleteMaterialProposal(m) {
  const title = (m?.title || 'Item').trim();
  const type = (m?.type || 'material').trim();
  return `• ${title} (${type})`;
}

/** @param {{ title?: string, type?: string }} snapshot */
export function summarizeUpdateMaterialProposal(snapshot, newTitle) {
  const cur = (snapshot?.title || 'Item').trim();
  const type = (snapshot?.type || 'material').trim();
  const next = (newTitle || '').trim();
  return `• ${cur} (${type})\n• New title: ${next || '—'}`;
}

/** @param {{ title?: string, providerUrl?: string, childName?: string, subjectName?: string }} p */
export function summarizeAddMaterialLinkProposal(p) {
  const t = (p?.title || 'Link').trim();
  const u = (p?.providerUrl || '').trim();
  const who = (p?.childName || '').trim();
  const sub = (p?.subjectName || '').trim();
  const lines = [`• ${t}`, `• ${u || '—'}`];
  if (who) lines.push(`• For: ${who}`);
  if (sub) lines.push(`• Subject: ${sub}`);
  return lines.join('\n');
}

export function summarizeUpdateChildProposal(displayName, updates) {
  const n = (displayName || 'Child').trim();
  const lines = [];
  if (updates?.first_name) lines.push(`• Name → ${updates.first_name}`);
  if (updates?.grade != null && String(updates.grade).trim() !== '') lines.push(`• Grade → ${updates.grade}`);
  return lines.length ? `${lines.join('\n')}\n• Learner: ${n}` : `• ${n}`;
}

export function summarizeArchiveChildProposal(name) {
  return `• ${(name || 'Child').trim()}\n• Hides them from planners until you restore in **Family**.`;
}

export function summarizeDeleteChildPermanentProposal(name) {
  return `• ${(name || 'Child').trim()}\n• **Permanent** — removes their profile. This cannot be undone.`;
}

export function summarizeAddSubjectProposal(childName, subjectName) {
  return `• ${(subjectName || 'Subject').trim()}\n• For: ${(childName || 'Child').trim()}`;
}

/** @param {{ name?: string }} snapshot */
export function summarizeDeleteSubjectProposal(snapshot) {
  const n = (snapshot?.name || 'Subject').trim();
  return `• ${n}\n• Permanently removes this subject and related planner blocks, events, materials, and syllabi. This cannot be undone.`;
}

/** @param {{ name?: string }} snapshot */
export function summarizeUpdateSubjectProposal(snapshot, newName, learnerLabel) {
  const cur = (snapshot?.name || 'Subject').trim();
  const next = (newName || '').trim();
  const who = (learnerLabel || '').trim();
  const line = who ? `\n• Learner: ${who}` : '';
  return `• Current: ${cur}\n• New name: ${next || '—'}${line}`;
}

/** @param {{ childName?: string, subjectName?: string|null, gradeLetter?: string|null, score?: number|null, possible?: number|null }} p */
export function summarizeLogGradeProposal(p) {
  const who = (p?.childName || 'Student').trim();
  const sub = (p?.subjectName || '').trim();
  const lines = [`• ${who}`];
  if (sub) lines.push(`• Subject: ${sub}`);
  if (p?.gradeLetter) lines.push(`• Letter grade: ${p.gradeLetter}`);
  if (p?.score != null && !Number.isNaN(p.score)) {
    const frac =
      p?.possible != null && !Number.isNaN(p.possible) ? `${p.score}/${p.possible}` : String(p.score);
    lines.push(`• Score: ${frac}`);
  }
  return lines.join('\n');
}

/** Human-readable summary lines for a proposed calendar event. */
export function summarizeCreateEventCommit(eventData, childLabels = []) {
  const title = (eventData?.title || 'Event').trim();
  const type = (eventData?.event_type || 'Event').trim();
  let when = '';
  try {
    const s = eventData?.start_ts ? new Date(eventData.start_ts) : null;
    if (s && !Number.isNaN(s.getTime())) {
      when = s.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  } catch {
    when = '';
  }
  const who = childLabels.length ? childLabels.join(', ') : 'Assignee TBD';
  return `• ${title} (${type})\n• ${when || 'Time TBD'}\n• For: ${who}`;
}
