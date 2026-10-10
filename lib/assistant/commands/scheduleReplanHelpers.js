/**
 * Deterministic packing helpers for Doodle day/week replan (Phase 2).
 * No LLM — constraint-aware free-slot placement with confirmable moves.
 */

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 17;
const MORNING_END_HOUR = 12;
const DEFAULT_DURATION_MS = 45 * 60 * 1000;

export function toLocalYmd(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysYmd(ymd, delta) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return toLocalYmd(d);
}

export function startOfWeekMonday(from = new Date()) {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toLocalYmd(d);
}

export function parseClockToMinutes(raw) {
  const m = String(raw || '').match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mins = Number(m[2] || 0);
  const ap = String(m[3] || '').toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return h * 60 + mins;
}

/** Extract blocked windows from NL (“dentist at 11”, “from 2 to 3pm”). */
export function parseBlockedWindowsFromMessage(message, dayYmd) {
  const lower = String(message || '').toLowerCase();
  const windows = [];
  const range = lower.match(
    /\b(?:from|between)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s+(?:to|and|-|–)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i,
  );
  if (range) {
    const a = parseClockToMinutes(range[1]);
    const b = parseClockToMinutes(range[2]);
    if (a != null && b != null && b > a) {
      windows.push({
        startMin: a,
        endMin: b,
        label: 'Blocked time',
      });
    }
  }
  const atMatch = lower.match(
    /\b(?:dentist|doctor|appointment|orthodontist|therapy|lesson)\b[^.]*?\bat\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i,
  ) || lower.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\b[^.]*?\b(?:dentist|doctor|appointment)\b/i);
  if (atMatch) {
    const startMin = parseClockToMinutes(atMatch[1]);
    if (startMin != null) {
      windows.push({
        startMin,
        endMin: Math.min(startMin + 60, DAY_END_HOUR * 60),
        label: /dentist|doctor|orthodontist/i.test(lower) ? 'Appointment' : 'Blocked time',
      });
    }
  }
  return windows.map((w) => ({
    ...w,
    start: minutesToDate(dayYmd, w.startMin),
    end: minutesToDate(dayYmd, w.endMin),
  }));
}

export function parsePreferMorningSubjects(message, subjects = []) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(morning|am)\b/.test(lower) && !/\bkeep\b/.test(lower)) return [];
  const hits = [];
  for (const s of subjects) {
    const name = String(s.name || s.title || '').toLowerCase();
    if (!name) continue;
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower)) {
      hits.push(String(s.id));
    }
  }
  // Common shorthand
  if (/\bmath\b/.test(lower) && !hits.length) {
    const math = subjects.find((s) => /\bmath/i.test(String(s.name || s.title || '')));
    if (math) hits.push(String(math.id));
  }
  return [...new Set(hits)];
}

function minutesToDate(ymd, minutes) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

function eventDurationMs(ev) {
  if (!ev?.start_ts) return DEFAULT_DURATION_MS;
  const start = new Date(ev.start_ts);
  const end = ev.end_ts ? new Date(ev.end_ts) : null;
  if (end && !Number.isNaN(end.getTime()) && end > start) {
    return Math.max(15 * 60 * 1000, end.getTime() - start.getTime());
  }
  if (Number(ev.minutes) > 0) return Number(ev.minutes) * 60 * 1000;
  return DEFAULT_DURATION_MS;
}

function isAppointmentLike(ev) {
  const t = String(ev.title || '').toLowerCase();
  const type = String(ev.event_type || '').toLowerCase();
  return (
    /\b(dentist|doctor|appointment|orthodontist|therapy|checkup|field\s*trip)\b/.test(t)
    || type === 'appointment'
    || type === 'event'
  );
}

function isMovableLearning(ev) {
  if (!ev || ev.deleted_at) return false;
  if (String(ev.status || '') === 'canceled' || String(ev.status || '') === 'done') return false;
  if (ev.is_backlog) return false;
  if (isAppointmentLike(ev)) return false;
  const type = String(ev.event_type || '').toLowerCase();
  if (type === 'day_off' || type === 'holiday' || type === 'break') return false;
  // Prefer subject-linked / learning-ish events
  if (ev.subject_id || ev.counts_toward_plan || type.includes('class') || type.includes('lesson') || type === 'learning') {
    return true;
  }
  // Timed non-flexible blocks on planner are movable if not appointments
  if (ev.is_flexible === false && ev.start_ts && ev.end_ts) return true;
  return Boolean(ev.subject_id);
}

/**
 * Pack movable events around fixed busy intervals for one local day.
 * @returns {{ moves: Array, kept: Array, blocked: Array, warnings: string[] }}
 */
export function packDaySchedule({
  dayYmd,
  events = [],
  blockedWindows = [],
  preferMorningSubjectIds = [],
  dayStartHour = DAY_START_HOUR,
  dayEndHour = DAY_END_HOUR,
  morningEndHour = MORNING_END_HOUR,
} = {}) {
  const warnings = [];
  const dayEvents = (events || []).filter((ev) => {
    if (!ev?.start_ts) return false;
    return toLocalYmd(new Date(ev.start_ts)) === dayYmd;
  });

  const fixed = [];
  const movable = [];
  for (const ev of dayEvents) {
    if (isAppointmentLike(ev) || blockedWindows.some((w) => overlapsEvent(ev, w))) {
      // Keep appointments fixed; still mark as busy
      if (isAppointmentLike(ev) || !isMovableLearning(ev)) {
        fixed.push(ev);
        continue;
      }
    }
    if (isMovableLearning(ev)) movable.push(ev);
    else fixed.push(ev);
  }

  // Busy from fixed timed events + explicit blocked windows
  const busy = [
    ...blockedWindows.map((w) => ({
      start: w.start.getTime(),
      end: w.end.getTime(),
      label: w.label,
    })),
    ...fixed
      .filter((ev) => ev.start_ts && ev.end_ts && !ev.is_flexible && !ev.all_day)
      .map((ev) => ({
        start: new Date(ev.start_ts).getTime(),
        end: new Date(ev.end_ts).getTime(),
        label: ev.title,
      })),
  ].sort((a, b) => a.start - b.start);

  const morningPreferred = movable.filter((ev) =>
    preferMorningSubjectIds.includes(String(ev.subject_id || '')));
  const rest = movable.filter((ev) =>
    !preferMorningSubjectIds.includes(String(ev.subject_id || '')));

  // Stable-ish order: original start time
  const byStart = (a, b) => new Date(a.start_ts) - new Date(b.start_ts);
  morningPreferred.sort(byStart);
  rest.sort(byStart);

  const moves = [];
  const kept = [];

  const place = (ev, windowStartHour, windowEndHour) => {
    const durationMs = eventDurationMs(ev);
    const from = minutesToDate(dayYmd, windowStartHour * 60);
    const boundary = minutesToDate(dayYmd, windowEndHour * 60);
    const slot = findFreeSlot(busy, from.getTime(), durationMs, boundary.getTime());
    if (!slot) return false;
    busy.push({ start: slot.start, end: slot.end, label: ev.title });
    busy.sort((a, b) => a.start - b.start);
    const newStart = new Date(slot.start);
    const newEnd = new Date(slot.end);
    const oldStart = new Date(ev.start_ts);
    const changed = Math.abs(newStart.getTime() - oldStart.getTime()) > 60 * 1000;
    if (changed) {
      moves.push({
        eventId: String(ev.id),
        title: ev.title || 'Lesson',
        subjectId: ev.subject_id || null,
        originalStartAt: ev.start_ts,
        originalEndAt: ev.end_ts || null,
        startAt: newStart.toISOString(),
        endAt: newEnd.toISOString(),
        durationMs,
        allDay: false,
      });
    } else {
      kept.push({ eventId: String(ev.id), title: ev.title || 'Lesson' });
    }
    return true;
  };

  for (const ev of morningPreferred) {
    if (!place(ev, dayStartHour, morningEndHour)) {
      if (!place(ev, morningEndHour, dayEndHour)) {
        warnings.push(`Could not fit “${ev.title || 'lesson'}” around constraints.`);
      } else {
        warnings.push(`“${ev.title || 'lesson'}” moved to afternoon (morning was full).`);
      }
    }
  }
  for (const ev of rest) {
    // Prefer afternoon after morning block if morning subjects exist; else full day
    const startH = morningPreferred.length ? morningEndHour : dayStartHour;
    if (!place(ev, startH, dayEndHour)) {
      if (startH !== dayStartHour && !place(ev, dayStartHour, dayEndHour)) {
        warnings.push(`Could not fit “${ev.title || 'lesson'}” today.`);
      } else if (startH === dayStartHour) {
        warnings.push(`Could not fit “${ev.title || 'lesson'}” today.`);
      }
    }
  }

  return {
    moves,
    kept,
    blocked: blockedWindows,
    fixed: fixed.map((ev) => ({ eventId: String(ev.id), title: ev.title || 'Event' })),
    warnings,
  };
}

function overlapsEvent(ev, window) {
  if (!ev?.start_ts || !window?.start) return false;
  const start = new Date(ev.start_ts).getTime();
  const end = ev.end_ts ? new Date(ev.end_ts).getTime() : start + DEFAULT_DURATION_MS;
  return start < window.end.getTime() && window.start.getTime() < end;
}

function findFreeSlot(busy, fromMs, durationMs, limitMs) {
  if (!durationMs || durationMs <= 0) return null;
  let cursor = fromMs;
  const intervals = [...busy].sort((a, b) => a.start - b.start);
  for (const interval of intervals) {
    if (interval.end <= cursor) continue;
    if (interval.start - cursor >= durationMs) break;
    cursor = Math.max(cursor, interval.end);
  }
  if (cursor + durationMs > limitMs) return null;
  return { start: cursor, end: cursor + durationMs };
}

/** Spread items across next week's weekdays (Mon–Fri), preserving duration. */
export function proposeBulkMoveToNextWeek({
  items = [],
  fromWeekStartYmd,
  startHour = 9,
  slotMinutes = 60,
} = {}) {
  const weekStart = fromWeekStartYmd || startOfWeekMonday(new Date());
  const nextMonday = addDaysYmd(weekStart, 7);
  const moves = [];
  let dayOffset = 0;
  let slotIndex = 0;
  for (const item of items) {
    while (dayOffset < 5) {
      const ymd = addDaysYmd(nextMonday, dayOffset);
      const start = minutesToDate(ymd, startHour * 60 + slotIndex * slotMinutes);
      const durationMs = item.durationMs || DEFAULT_DURATION_MS;
      const end = new Date(start.getTime() + durationMs);
      if (end.getHours() < DAY_END_HOUR || (end.getHours() === DAY_END_HOUR && end.getMinutes() === 0)) {
        moves.push({
          eventId: String(item.eventId || item.id),
          title: item.title || 'Item',
          originalStartAt: item.start_ts || item.originalStartAt || null,
          originalEndAt: item.end_ts || item.originalEndAt || null,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          durationMs,
          allDay: item.allDay === true,
          dueYmd: ymd,
          assignmentId: item.assignmentId || null,
        });
        slotIndex += 1;
        if (slotIndex >= 4) {
          slotIndex = 0;
          dayOffset += 1;
        }
        break;
      }
      slotIndex = 0;
      dayOffset += 1;
    }
  }
  return { moves, nextMonday };
}

export function formatTimeLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatMovePreviewLine(move) {
  const from = move.originalStartAt ? formatTimeLabel(new Date(move.originalStartAt)) : '—';
  const to = move.startAt ? formatTimeLabel(new Date(move.startAt)) : '—';
  return `${move.title}: ${from} → ${to}`;
}
