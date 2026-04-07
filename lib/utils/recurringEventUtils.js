/**
 * Recurring / series detection and master id resolution (planner + EventDetails).
 */

export function isPartOfRecurringSeries(ev) {
  if (!ev) return false;
  return !!(ev.recurrence_rule || ev.recurrence_id || ev.parent_event_id);
}

/** UUID part only (month grid uses `${id}-day-${i}` for multi-day projects). */
export function cleanPlannerEventId(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  return raw.includes('-day-') ? raw.split('-day-')[0] : raw;
}

/**
 * Series master id for soft-deleting all rows in a recurring series.
 */
export function resolveSeriesMasterEventId(ev, cleanEventId) {
  let master = ev?.parent_event_id || ev?.recurrence_id;
  if (master && typeof master === 'string' && master.includes('-day-')) {
    master = master.split('-day-')[0];
  }
  if (ev?.recurrence_rule && !master) master = cleanEventId;
  if (!master) master = cleanEventId;
  return master;
}
