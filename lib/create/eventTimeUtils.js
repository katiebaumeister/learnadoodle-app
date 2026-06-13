export const DEFAULT_DURATION_MINUTES = 30;

export function toYmd(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10) || null;
}

export function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

export function fmtDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const normalized = String(timeStr).replace(/_/g, '').trim();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3] ? match[3].toUpperCase() : null;

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  if (period) {
    if (hours < 1 || hours > 12) return null;
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return { hours, minutes };
}

export function applyTimeToDate(date, timeStr) {
  const parts = parseTimeString(timeStr);
  if (!parts || !(date instanceof Date)) return null;
  const result = new Date(date);
  result.setHours(parts.hours, parts.minutes, 0, 0);
  return result;
}

export function computeEventTimes({
  date,
  startTime,
  endTime,
  allDay = false,
  durationMinutes = DEFAULT_DURATION_MINUTES,
}) {
  const baseDate = date instanceof Date ? new Date(date) : new Date();
  baseDate.setHours(0, 0, 0, 0);

  if (allDay) {
    const start = new Date(baseDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(baseDate);
    end.setHours(23, 59, 59, 999);
    return { start, end, minutes: 24 * 60 };
  }

  const start = applyTimeToDate(baseDate, startTime);
  if (!start) {
    return { start: null, end: null, minutes: null };
  }

  let end = applyTimeToDate(baseDate, endTime);
  if (!end || end <= start) {
    end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  }

  const minutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
  return { start, end, minutes };
}
