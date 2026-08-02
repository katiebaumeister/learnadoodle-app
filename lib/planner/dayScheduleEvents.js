/**
 * Shared day-schedule helpers so Home and Planner show the same events
 * for a given local YYYY-MM-DD.
 */
import { supabase } from '../supabase';
import { toLocalYmd } from '../subjectConfigureSchedule';

function isBreakRangeEvent(ev) {
  const type = String(ev?.event_type || ev?.type || '').toLowerCase();
  return type === 'break' || type === 'holiday' || type === 'day_off' || type === 'dayoff';
}

function localYmdFromValue(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  return toLocalYmd(d);
}

/** Expand Project/Break ranges the same way MonthGrid/TasksView do. */
export function expandRangeEventsLikePlanner(events = []) {
  const expanded = [];
  const seenIds = new Set();

  for (const ev of events) {
    if (!ev || !ev.id) continue;
    const baseId = String(ev._originalId || String(ev.id).replace(/-day-\d+$/, ''));
    if (seenIds.has(baseId)) continue;
    seenIds.add(baseId);

    const isRange =
      (ev.event_type === 'Project' || isBreakRangeEvent(ev)) &&
      (ev.start_ts || ev.start) &&
      (ev.end_ts || ev.end);

    if (isRange) {
      const startDate = new Date(ev.start_ts || ev.start);
      const endDate = new Date(ev.end_ts || ev.end);
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
        const daysDiff = Math.round((endDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff >= 0 && daysDiff <= 120) {
          for (let i = 0; i <= daysDiff; i += 1) {
            const dayDate = new Date(startDateOnly);
            dayDate.setDate(startDateOnly.getDate() + i);
            expanded.push({
              ...ev,
              id: `${baseId}-day-${i}`,
              _originalId: baseId,
              _dayIndex: i,
              date_local: toLocalYmd(dayDate),
            });
          }
          continue;
        }
      }
    }

    expanded.push({ ...ev, id: baseId, _originalId: baseId });
  }

  return expanded;
}

export function eventOccursOnYmd(event, ymd) {
  if (!event || !ymd) return false;
  if (event.date_local && String(event.date_local).slice(0, 10) === ymd) return true;
  const startYmd = localYmdFromValue(event.start_ts || event.start || event.start_local);
  const endYmd = localYmdFromValue(event.end_ts || event.end || event.end_local) || startYmd;
  if (!startYmd) return false;
  if (startYmd === endYmd) return startYmd === ymd;
  return startYmd <= ymd && ymd <= endYmd;
}

/** Normalize planner/month-view rows into Home TodayScheduleCard shape. */
export function normalizePlannerEventForHome(event) {
  if (!event) return null;
  const startLocal = event.start_local || event.start || null;
  const endLocal = event.end_local || event.end || null;
  const subject =
    event.subject_name ||
    event.subject ||
    event.title ||
    'Event';
  return {
    ...event,
    id: event._originalId || event.id,
    title: event.title || subject,
    subject,
    topic: event.title || subject,
    start: startLocal,
    start_local: startLocal,
    end: endLocal,
    end_local: endLocal,
    event_type: event.event_type || event.type || 'Other',
  };
}

function flattenEventsByDate(eventsByDate = {}) {
  const all = [];
  Object.values(eventsByDate || {}).forEach((day) => {
    const list = Array.isArray(day) ? day : (day?.events || []);
    if (Array.isArray(list)) all.push(...list);
  });
  return all;
}

/**
 * Pick the Home schedule for `ymd` from a planner events-by-date map
 * (same expansion rules as the month grid).
 */
export function scheduleEventsForYmdFromPlannerMap(eventsByDate, ymd) {
  if (!ymd) return [];
  const all = flattenEventsByDate(eventsByDate);
  const expanded = expandRangeEventsLikePlanner(all);
  const forDay = expanded.filter((event) => eventOccursOnYmd(event, ymd));
  // Deduplicate by original id (expanded Project instances share a day).
  const seen = new Set();
  const out = [];
  forDay.forEach((event) => {
    const key = String(event._originalId || event.id);
    if (!key || seen.has(key)) return;
    if (event.is_backlog === true) return;
    seen.add(key);
    const normalized = normalizePlannerEventForHome(event);
    if (normalized) out.push(normalized);
  });
  out.sort((a, b) => String(a.start_ts || a.start || '').localeCompare(String(b.start_ts || b.start || '')));
  return out;
}

/**
 * Fetch the day's schedule via get_month_view (Planner source of truth).
 * Also pulls adjacent months so multi-day Project/Break rows are not missed.
 */
export async function fetchPlannerAlignedDayEvents(familyId, dateInput) {
  if (!familyId) return { events: [], error: new Error('Missing family id') };
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return { events: [], error: new Error('Invalid date') };
  const ymd = toLocalYmd(date);

  const months = [
    new Date(date.getFullYear(), date.getMonth() - 1, 1),
    new Date(date.getFullYear(), date.getMonth(), 1),
    new Date(date.getFullYear(), date.getMonth() + 1, 1),
  ];

  try {
    const results = await Promise.all(
      months.map((monthDate) =>
        supabase.rpc('get_month_view', {
          _family_id: familyId,
          _year: monthDate.getFullYear(),
          _month: monthDate.getMonth() + 1,
          _child_ids: null,
        })
      )
    );

    const mergedByDate = {};
    let firstError = null;
    results.forEach(({ data, error }) => {
      if (error && !firstError) firstError = error;
      const byDate = data?.events_by_date || {};
      Object.entries(byDate).forEach(([key, day]) => {
        const list = Array.isArray(day) ? day : (day?.events || []);
        if (!mergedByDate[key]) mergedByDate[key] = [];
        mergedByDate[key].push(...(list || []));
      });
    });

    if (firstError && Object.keys(mergedByDate).length === 0) {
      return { events: [], error: firstError };
    }

    return { events: scheduleEventsForYmdFromPlannerMap(mergedByDate, ymd), error: null, ymd };
  } catch (error) {
    return { events: [], error };
  }
}
