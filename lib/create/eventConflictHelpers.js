/**
 * Helpers for surfacing scheduling conflicts inline in the create/edit event modals.
 *
 * The database enforces overlap rules with a trigger that only blocks *timed*
 * events (is_flexible = false, is_backlog = false) that share a child and
 * overlap in time. When a save is rejected for that reason, we look up the
 * conflicting event(s) and suggest the next free slot so the user can fix it
 * without leaving the modal.
 */
import { supabase } from '../supabase';

const DAY_END_HOUR = 21; // Stop suggesting slots after 9:00 PM.

export function isOverlapError(error) {
  const message = typeof error === 'string' ? error : (error?.message || '');
  return /overlap|overlaps with/i.test(message);
}

export function formatTimeForInput(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function formatTimeLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function collectChildIds(event) {
  const ids = [];
  if (event.child_id) ids.push(String(event.child_id));
  if (Array.isArray(event.child_ids)) {
    for (const id of event.child_ids) {
      if (id != null && id !== '') ids.push(String(id));
    }
  }
  return Array.from(new Set(ids));
}

function eventMatchesChild(event, childIds) {
  if (!Array.isArray(childIds) || childIds.length === 0) return true;
  const ids = childIds.map((id) => String(id));
  if (event.child_id && ids.includes(String(event.child_id))) return true;
  if (Array.isArray(event.child_ids) && event.child_ids.some((id) => ids.includes(String(id)))) {
    return true;
  }
  // Whole-family events (no child set) conflict with anyone.
  if (!event.child_id && (!Array.isArray(event.child_ids) || event.child_ids.length === 0)) {
    return true;
  }
  return false;
}

/**
 * Look up the timed events that overlap the requested window and, when found,
 * compute the earliest free slot of the same duration later that day.
 *
 * Returns null when there is no real conflict (e.g. the failure was unrelated).
 */
export async function findEventConflict({
  familyId,
  childIds = [],
  startTs,
  endTs,
  excludeEventId = null,
}) {
  if (!familyId || !startTs || !endTs) return null;

  const start = new Date(startTs);
  const end = new Date(endTs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const dayStart = new Date(start);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(start);
  dayEnd.setHours(23, 59, 59, 999);

  let query = supabase
    .from('events')
    .select('id, title, start_ts, end_ts, child_id, child_ids, is_flexible, is_backlog, status, deleted_at')
    .eq('family_id', familyId)
    .eq('is_flexible', false)
    .eq('is_backlog', false)
    .is('deleted_at', null)
    .lt('start_ts', dayEnd.toISOString())
    .gt('end_ts', dayStart.toISOString());
  if (excludeEventId) query = query.neq('id', excludeEventId);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return null;

  const dayEvents = data
    .filter((event) => String(event.status || '') !== 'canceled')
    .filter((event) => eventMatchesChild(event, childIds))
    .map((event) => ({
      id: event.id,
      title: String(event.title || 'Untitled event'),
      start: new Date(event.start_ts),
      end: new Date(event.end_ts),
      childIds: collectChildIds(event),
    }))
    .filter((event) => !Number.isNaN(event.start.getTime()) && !Number.isNaN(event.end.getTime()))
    .sort((a, b) => a.start - b.start);

  const conflicts = dayEvents.filter((event) => start < event.end && event.start < end);
  if (conflicts.length === 0) return null;

  const suggestion = suggestFreeSlot({
    dayEvents,
    from: start,
    durationMs: Math.max(end.getTime() - start.getTime(), 0),
    dayBoundary: (() => {
      const boundary = new Date(start);
      boundary.setHours(DAY_END_HOUR, 0, 0, 0);
      return boundary;
    })(),
  });

  return { conflicts, suggestion };
}

function suggestFreeSlot({ dayEvents, from, durationMs, dayBoundary }) {
  if (!durationMs || durationMs <= 0) return null;
  const busy = dayEvents
    .map((event) => ({ start: event.start.getTime(), end: event.end.getTime() }))
    .sort((a, b) => a.start - b.start);

  let cursor = from.getTime();
  const limit = dayBoundary.getTime();

  for (const interval of busy) {
    if (interval.end <= cursor) continue;
    if (interval.start - cursor >= durationMs) {
      break;
    }
    cursor = Math.max(cursor, interval.end);
  }

  if (cursor + durationMs > limit) return null;
  return { start: new Date(cursor), end: new Date(cursor + durationMs) };
}
