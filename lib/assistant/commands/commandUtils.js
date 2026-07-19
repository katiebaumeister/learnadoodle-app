export function requireString(value, label) {
  const v = String(value || '').trim();
  if (!v) return { ok: false, error: `${label} is required` };
  return { ok: true, value: v };
}

export function requireHouseholdMatch(commandHouseholdId, ctx) {
  if (String(commandHouseholdId) !== String(ctx?.householdId)) {
    return { ok: false, error: 'Household mismatch.' };
  }
  return { ok: true };
}

export function newIdempotencyKey(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Parse YYYY-MM-DD as a local calendar day (avoids UTC midnight → previous-day display). */
export function parseLocalDateLike(dateLike) {
  if (!dateLike) return null;
  if (dateLike instanceof Date) {
    return Number.isNaN(dateLike.getTime()) ? null : new Date(dateLike);
  }
  const raw = String(dateLike).trim();
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toYmd(dateLike) {
  if (!dateLike) return null;
  if (typeof dateLike === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateLike)) return dateLike;
  const d = parseLocalDateLike(dateLike);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDisplayDate(dateLike) {
  const d = parseLocalDateLike(dateLike);
  if (!d) return String(dateLike || '—');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatDisplayDateTime(dateLike) {
  const d = parseLocalDateLike(dateLike);
  if (!d) return String(dateLike || '—');
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** True when the event (or move command) is an all-day span. */
export function isAllDayLike(value) {
  if (!value) return false;
  if (value === true) return true;
  if (value.allDay === true || value.all_day === true) return true;
  const start = value.startAt || value.start_ts || value.start;
  const end = value.endAt || value.end_ts || value.end;
  if (!start || !end) return false;
  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;
  const spanMs = e.getTime() - s.getTime();
  // ~full local day (planner all-day is 00:00 → 23:59:59.999)
  if (spanMs < 20 * 60 * 60 * 1000) return false;
  return s.getHours() === 0 && s.getMinutes() === 0;
}

/** Local midnight → end-of-day ISO pair for an all-day move onto `dateLike`'s calendar day. */
export function toAllDayBounds(dateLike) {
  const d = parseLocalDateLike(dateLike);
  if (!d) return null;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { startAt: start.toISOString(), endAt: end.toISOString() };
}

/** Chat-friendly when line: “Sat, Jul 19 · All day” or a timed datetime. */
export function formatMoveWhenLabel(startAt, endAt = null, allDay = false) {
  const useAllDay = allDay || isAllDayLike({ startAt, endAt, allDay });
  if (useAllDay) {
    return `${formatDisplayDate(startAt)} · All day`;
  }
  return formatDisplayDateTime(startAt);
}
