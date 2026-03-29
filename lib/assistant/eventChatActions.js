/**
 * Resolve calendar events from natural language and execute the same RPCs the planner UI uses.
 */

import { supabase } from '../supabase.js';
import { parseWeekdayInMessage } from './attendanceChatActions.js';

const STOP_WORDS = new Set([
  'delete',
  'remove',
  'cancel',
  'trash',
  'the',
  'a',
  'an',
  'event',
  'lesson',
  'class',
  'appointment',
  'please',
  'my',
  'our',
  'for',
  'on',
  'at',
  'to',
  'change',
  'move',
  'rename',
  'update',
  'from',
  'this',
  'that',
  'with',
  'and',
  'or',
  'into',
  'call',
  'it',
  'title',
  'type',
]);

/**
 * @param {string} familyId
 * @returns {Promise<{ events: object[], error: Error | null }>}
 */
export async function fetchResolvableEvents(familyId) {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 14);
  const to = new Date(now);
  to.setDate(to.getDate() + 90);

  const { data, error } = await supabase
    .from('events')
    .select('id,title,start_ts,end_ts,event_type,child_id,child_ids')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .gte('start_ts', from.toISOString())
    .lte('start_ts', to.toISOString())
    .order('start_ts', { ascending: true })
    .limit(250);

  return { events: data || [], error: error || null };
}

function tokenize(msg) {
  return (msg || '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function childIdsForName(context, messageLower) {
  const children = context?.children || [];
  const ids = [];
  for (const c of children) {
    const name = (c.first_name || c.name || '').trim().toLowerCase();
    if (name.length >= 2 && messageLower.includes(name)) ids.push(c.id);
  }
  return ids;
}

function eventMatchesChild(ev, childIds) {
  if (!childIds.length) return true;
  if (ev.child_id && childIds.includes(ev.child_id)) return true;
  const arr = ev.child_ids;
  if (Array.isArray(arr) && arr.some((id) => childIds.includes(id))) return true;
  return false;
}

/**
 * @returns {{ ok: boolean, event?: object, candidates?: object[], reason?: string }}
 */
export function resolveEventFromUserMessage(userMessage, events, context) {
  const msgLower = (userMessage || '').toLowerCase();
  const quoted = userMessage.match(/["']([^"']{2,120})["']/);
  const childIds = childIdsForName(context, msgLower);

  let pool = events;
  if (childIds.length) {
    pool = events.filter((e) => eventMatchesChild(e, childIds));
  }

  if (quoted) {
    const q = quoted[1].toLowerCase();
    const exact = pool.filter((e) => (e.title || '').toLowerCase().includes(q));
    if (exact.length === 1) return { ok: true, event: exact[0] };
    if (exact.length > 1) return { ok: false, candidates: exact.slice(0, 8), reason: 'ambiguous' };
  }

  const words = tokenize(userMessage);
  if (words.length === 0) {
    return { ok: false, reason: 'no_query', candidates: pool.slice(0, 8) };
  }

  const scored = pool.map((ev) => {
    const t = (ev.title || '').toLowerCase();
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score += w.length >= 4 ? 3 : 2;
    }
    return { ev, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 2) {
    return { ok: false, reason: 'no_match', candidates: pool.slice(0, 8) };
  }
  const second = scored[1];
  if (second && second.score === best.score && second.ev.id !== best.ev.id) {
    const tied = scored.filter((s) => s.score === best.score).map((s) => s.ev);
    return { ok: false, candidates: tied.slice(0, 8), reason: 'ambiguous' };
  }
  return { ok: true, event: best.ev };
}

function formatWhen(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function summarizeEventForChat(ev) {
  if (!ev) return '';
  const when = formatWhen(ev.start_ts);
  const type = ev.event_type || 'Event';
  const title = (ev.title || 'Untitled').trim();
  return `• ${title} (${type})\n• ${when || 'Time TBD'}`;
}

/**
 * Parse limited updates: title, start/end (preserve duration), event_type.
 * @returns {{ updates: Record<string, unknown>, summaryLines: string[] } | { error: string }}
 */
export function parseEventUpdatesFromMessage(userMessage, event) {
  const updates = {};
  const summaryLines = [];
  const renameMatch =
    userMessage.match(/\b(?:rename|retitle)\s+(?:it\s+)?to\s+["']?([^\n"']{1,120})/i) ||
    userMessage.match(/\bchange\s+(?:the\s+)?title\s+to\s+["']?([^\n"']{1,120})/i) ||
    userMessage.match(/\bcall\s+it\s+["']?([^\n"']{1,120})/i);
  if (renameMatch) {
    const newTitle = renameMatch[1].trim().replace(/[.,;]+$/, '');
    if (newTitle.length >= 1) {
      updates.title = newTitle;
      summaryLines.push(`• New title: ${newTitle}`);
    }
  }

  const explicitType = userMessage.match(
    /\b(?:change|set)\s+(?:the\s+)?(?:event\s+)?type\s+to\s+(Lesson|Project|Exam|Assignment|Activity|Appointment)\b/i
  );
  if (explicitType) {
    updates.event_type = explicitType[1];
    summaryLines.push(`• Type: ${updates.event_type}`);
  } else {
    const typeTo = userMessage.match(
      /\b(?:to|as)\s+(Lesson|Project|Exam|Assignment|Activity|Appointment)\b/i
    );
    if (typeTo) {
      updates.event_type = typeTo[1];
      summaryLines.push(`• Type: ${updates.event_type}`);
    }
  }

  const iso = userMessage.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  let day = null;
  if (iso) {
    const [y, mo, d] = iso[1].split('-').map((n) => parseInt(n, 10));
    day = new Date(y, mo - 1, d);
  } else if (/\btomorrow\b/i.test(userMessage)) {
    day = new Date();
    day.setDate(day.getDate() + 1);
  } else if (/\btoday\b/i.test(userMessage)) {
    day = new Date();
  } else {
    const wd = parseWeekdayInMessage(userMessage);
    if (wd) day = wd;
  }

  let hour24 = null;
  let min = 0;
  const timeMatch =
    userMessage.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) ||
    userMessage.match(/\b(?:at\s+)?(\d{1,2}):(\d{2})\b/);
  if (timeMatch) {
    hour24 = parseInt(timeMatch[1], 10);
    min = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = (timeMatch[3] || '').toLowerCase();
    if (ampm === 'pm' && hour24 !== 12) hour24 += 12;
    if (ampm === 'am' && hour24 === 12) hour24 = 0;
  }

  if (day || hour24 != null) {
    const oldStart = new Date(event.start_ts);
    const oldEnd = new Date(event.end_ts || event.start_ts);
    const durationMs = Math.max(oldEnd.getTime() - oldStart.getTime(), 30 * 60 * 1000);

    const newStart = new Date(oldStart);
    if (day) {
      newStart.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    }
    if (hour24 != null) {
      newStart.setHours(hour24, min, 0, 0);
    }

    const newEnd = new Date(newStart.getTime() + durationMs);
    updates.start_ts = newStart.toISOString();
    updates.end_ts = newEnd.toISOString();
    summaryLines.push(`• New time: ${formatWhen(updates.start_ts)}`);
  }

  if (Object.keys(updates).length === 0) {
    return {
      error:
        'Say what to change, e.g. rename to …, change type to Lesson, move to tomorrow at 3pm, or include a date like 2026-04-01.',
    };
  }
  return { updates, summaryLines };
}

/**
 * @returns {Promise<{ success: boolean, data?: object, userMessage?: string, error?: string }>}
 */
export async function executeChatDeleteEvent(familyId, eventId) {
  const { data, error } = await supabase.rpc('delete_event', {
    _event_id: eventId,
    _family_id: familyId,
  });
  if (error) {
    return { success: false, error: error.message || String(error) };
  }
  if (data && data.success === false) {
    return { success: false, error: data.error || 'Delete failed' };
  }
  return { success: true, data, userMessage: 'That event was removed from your calendar.' };
}

/**
 * @param {boolean} allowOverlaps
 */
/** Minimal event fields for disambiguation follow-up + apply */
export function stripEventForDisambiguation(ev) {
  if (!ev) return null;
  return {
    id: ev.id,
    title: ev.title,
    start_ts: ev.start_ts,
    end_ts: ev.end_ts,
    event_type: ev.event_type,
    child_id: ev.child_id,
    child_ids: ev.child_ids,
  };
}

/**
 * When the user replies with a list index after a disambiguation prompt.
 * @param {string} userMessage
 * @param {Array<{ role: string, content?: string, disambiguation?: { intent: string, candidates: object[], priorUserMessage?: string, newTitle?: string, newSubjectName?: string } }>} recentMessages
 * @returns {{ intent: string, event: object, priorUserMessage: string, newTitle?: string, newSubjectName?: string } | null}
 */
export function resolveDisambiguationReply(userMessage, recentMessages) {
  const trim = userMessage.trim();
  const num = trim.match(/^\s*(\d{1,2})\s*$/);
  if (!num) return null;
  const idx = parseInt(num[1], 10) - 1;
  if (idx < 0) return null;

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    if (msg.role !== 'assistant') continue;
    const d = msg.disambiguation;
    if (!d?.candidates?.length || !d.intent) continue;
    const ev = d.candidates[idx];
    if (!ev) return null;
    const base = {
      intent: d.intent,
      event: ev,
      priorUserMessage: typeof d.priorUserMessage === 'string' ? d.priorUserMessage : '',
    };
    const extra = {};
    if (typeof d.newTitle === 'string' && d.newTitle.trim()) extra.newTitle = d.newTitle.trim();
    if (typeof d.newSubjectName === 'string' && d.newSubjectName.trim()) extra.newSubjectName = d.newSubjectName.trim();
    return Object.keys(extra).length ? { ...base, ...extra } : base;
  }
  return null;
}

export async function executeChatUpdateEvent(eventId, updates, allowOverlaps = false) {
  const { data, error } = await supabase.rpc('update_event_with_overlap_handling', {
    _event_id: eventId,
    _updates: updates,
    _allow_overlaps: allowOverlaps,
  });
  if (error) {
    return { success: false, error: error.message || String(error) };
  }
  if (data && data.ok === false) {
    return { success: false, error: data.error || 'Update failed' };
  }
  return { success: true, data, userMessage: 'Event updated.' };
}
