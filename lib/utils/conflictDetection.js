/**
 * Conflict detection for calendar events (drag-drop, modals).
 * Aligns with DB overlap rules: same assignee (child_id or child_ids), local same-day,
 * time overlap; skips backlog/flexible rows and canceled/deleted.
 */

function getAssigneeIds(ev) {
  if (!ev) return [];
  const ids = [];
  if (ev.child_id) ids.push(ev.child_id);
  if (Array.isArray(ev.child_ids)) {
    ev.child_ids.forEach((c) => {
      if (c && !ids.includes(c)) ids.push(c);
    });
  }
  return ids;
}

function sameLocalCalendarDay(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (isNaN(da.getTime()) || isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function isSkippedForOverlapRow(ev) {
  if (!ev) return true;
  if (ev.status === 'canceled' || ev.canceled_at || ev.deleted_at) return true;
  if (ev.is_backlog) return true;
  if (ev.is_flexible) return true;
  if (ev.recurrence_rule) return true;
  return false;
}

/**
 * Detect conflicts for a moved or draft event
 * @param {Object} movedEvent - The event being placed
 * @param {Array} allEvents - Other events (same family scope as caller)
 * @returns {number} - Count of conflicting events
 */
export function detectConflicts(movedEvent, allEvents) {
  if (!movedEvent || !allEvents || !Array.isArray(allEvents)) {
    return 0;
  }
  if (movedEvent.is_flexible) return 0;

  const movedStart = new Date(movedEvent.start_ts || movedEvent.start);
  const movedEnd = new Date(movedEvent.end_ts || movedEvent.end);
  const movedId = movedEvent.id;
  const movedIds = getAssigneeIds(movedEvent);

  if (!movedStart || !movedEnd || isNaN(movedStart.getTime()) || isNaN(movedEnd.getTime())) {
    return 0;
  }
  if (movedIds.length === 0) return 0;

  let conflictCount = 0;
  for (const ev of allEvents) {
    if (!ev || ev.id === movedId) continue;
    if (isSkippedForOverlapRow(ev)) continue;

    const oIds = getAssigneeIds(ev);
    if (!oIds.some((id) => movedIds.includes(id))) continue;

    const eventStart = new Date(ev.start_ts || ev.start);
    const eventEnd = new Date(ev.end_ts || ev.end);
    if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) continue;

    if (!sameLocalCalendarDay(movedStart, eventStart)) continue;

    if (movedStart < eventEnd && eventStart < movedEnd) {
      conflictCount++;
    }
  }

  return conflictCount;
}

/**
 * First overlapping event for banners / messaging (same rules as detectConflicts).
 */
export function findFirstConflictEvent(movedEvent, allEvents, options = {}) {
  const excludeId = options.excludeEventId;
  if (!movedEvent || !allEvents || !Array.isArray(allEvents)) {
    return null;
  }
  if (movedEvent.is_flexible) return null;

  const movedStart = new Date(movedEvent.start_ts || movedEvent.start);
  const movedEnd = new Date(movedEvent.end_ts || movedEvent.end);
  const movedId = movedEvent.id;
  const movedIds = getAssigneeIds(movedEvent);

  if (!movedStart || !movedEnd || isNaN(movedStart.getTime()) || isNaN(movedEnd.getTime())) {
    return null;
  }
  if (movedIds.length === 0) return null;

  for (const ev of allEvents) {
    if (!ev || ev.id === movedId) continue;
    if (excludeId != null && ev.id === excludeId) continue;
    if (isSkippedForOverlapRow(ev)) continue;

    const oIds = getAssigneeIds(ev);
    if (!oIds.some((id) => movedIds.includes(id))) continue;

    const eventStart = new Date(ev.start_ts || ev.start);
    const eventEnd = new Date(ev.end_ts || ev.end);
    if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) continue;

    if (!sameLocalCalendarDay(movedStart, eventStart)) continue;

    if (movedStart < eventEnd && eventStart < movedEnd) {
      return ev;
    }
  }
  return null;
}
