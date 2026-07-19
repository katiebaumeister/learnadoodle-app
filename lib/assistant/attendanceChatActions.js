/**
 * Attendance via same RPCs as components/records/Attendance.js
 */

import { supabase } from '../supabase.js';

const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Next occurrence of named weekday from fromDate (local midnight base). */
export function parseWeekdayInMessage(userMessage, fromDate = new Date()) {
  const lower = userMessage.toLowerCase();
  let targetName = null;
  for (const name of Object.keys(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) {
      targetName = name;
      break;
    }
  }
  if (!targetName) return null;
  const targetDow = WEEKDAYS[targetName];
  const useNext = /\bnext\s+(?:week\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(userMessage);

  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const cur = start.getDay();
  let add = (targetDow - cur + 7) % 7;
  // "next Monday": skip the nearest occurrence unless today is that day (then following week).
  if (useNext) {
    add = add === 0 ? 7 : add + 7;
  }
  start.setDate(start.getDate() + add);
  return start;
}

/** YYYY-MM-DD for attendance RPC */
export function parseAttendanceDate(userMessage) {
  const iso = userMessage.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const lower = userMessage.toLowerCase();
  const d = new Date();
  if (/\byesterday\b/.test(lower)) {
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  if (/\btoday\b/.test(lower)) {
    return d.toISOString().split('T')[0];
  }

  const wd = parseWeekdayInMessage(userMessage, d);
  if (wd) return wd.toISOString().split('T')[0];

  return d.toISOString().split('T')[0];
}

/**
 * @param {string} messageLower
 * @param {{ id: string, first_name?: string, name?: string }[]} children
 */
export function pickChildFromMessage(messageLower, children) {
  if (!children?.length) return null;
  for (const c of children) {
    const n = (c.first_name || c.name || '').trim().toLowerCase();
    if (n.length >= 2 && messageLower.includes(n)) return c;
  }
  if (children.length === 1) return children[0];
  return null;
}

const MONTH_INDEX = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

function localYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ymd(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function addDaysYmd(ymd, delta) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + delta);
  return localYmd(d);
}

/** Monday-start week containing `ymd` — matches planner month grid leading days. */
function startOfWeekMonday(ymd) {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  const dow = d.getDay(); // 0 Sun … 6 Sat
  const back = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - back);
  return localYmd(d);
}

/** Local calendar day for an event (prefer date_local; else local timezone of start_ts). */
export function eventLocalDayKey(ev) {
  const fromLocal = String(ev?.date_local || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromLocal)) return fromLocal;
  if (!ev?.start_ts && !ev?.start) return null;
  const d = new Date(ev.start_ts || ev.start);
  if (Number.isNaN(d.getTime())) return null;
  return localYmd(d);
}

/**
 * Parse a date range for bulk attendance (“all July”, “this month”, “all learning days”).
 * End is capped at today (future days are never markable).
 * Named months include leading days shown on the month calendar (Mon-start grid).
 * @returns {{ startDate: string, endDate: string, label: string } | null}
 */
export function parseAttendanceRange(message, fromDate = new Date()) {
  const lower = String(message || '').toLowerCase();
  const now = fromDate instanceof Date && !Number.isNaN(fromDate.getTime())
    ? new Date(fromDate)
    : new Date();
  now.setHours(12, 0, 0, 0);
  const today = localYmd(now);
  const yearMatch = lower.match(/\b(20\d{2})\b/);
  const yearHint = yearMatch ? Number(yearMatch[1]) : null;

  for (const [name, monthIndex] of Object.entries(MONTH_INDEX)) {
    if (!new RegExp(`\\b${name}\\b`).test(lower)) continue;
    let year = yearHint != null ? yearHint : now.getFullYear();
    // If that month is still ahead this calendar year and no year was given, use last year.
    if (yearHint == null && monthIndex > now.getMonth()) year -= 1;
    const monthStart = new Date(year, monthIndex, 1);
    const endOfMonth = new Date(year, monthIndex + 1, 0);
    let endDate = localYmd(endOfMonth);
    if (endDate > today) endDate = today;
    const monthStartYmd = localYmd(monthStart);
    if (monthStartYmd > today) return null;
    // Include Mon–Sun overflow cells at the start of the month grid (e.g. Jun 29–30 in July).
    const startDate = startOfWeekMonday(monthStartYmd);
    return {
      startDate,
      endDate,
      label: monthStart.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
    };
  }

  if (
    /\bthis\s+month\b/.test(lower)
    || (/\b(all|every|entire)\b/.test(lower) && /\b(learning\s*days?|lessons?)\b/.test(lower))
  ) {
    const monthStartYmd = localYmd(new Date(now.getFullYear(), now.getMonth(), 1));
    return {
      startDate: startOfWeekMonday(monthStartYmd),
      endDate: today,
      label: now.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
    };
  }

  return null;
}

/** True when the message targets the saved school year (not a calendar month). */
export function isSchoolYearAttendanceRangeIntent(message) {
  const lower = String(message || '').toLowerCase();
  return /\b(school\s*year|this\s+school\s*year|entire\s+(?:school\s+)?year|whole\s+(?:school\s+)?year)\b/.test(lower);
}

/** Fall / Spring / Summer — same chips as Planner Year → Attendance check bulk modal. */
export function parseTermKeyFromMessage(message) {
  const lower = String(message || '').toLowerCase();
  if (/\b(fall|autumn)\b/.test(lower)) return 'fall';
  if (/\bspring\b/.test(lower)) return 'spring';
  if (/\bsummer\b/.test(lower)) return 'summer';
  return null;
}

/** Bulk Attendance modal phrasing, with or without an explicit term. */
export function isBulkAttendanceModalIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (/\bbulk\s+attendance\b/.test(lower)) return true;
  if (/\bmark\s+full\s+range\b/.test(lower)) return true;
  if (/\battendance\s+check\b/.test(lower) && /\b(mark|attend)/.test(lower)) return true;
  if (parseTermKeyFromMessage(message) && /\b(attend(?:ance|ed)?|present)\b/.test(lower)) {
    return /\b(mark|log|set|bulk)\b/.test(lower) || /\bterm\b/.test(lower);
  }
  return false;
}

/**
 * Resolve a school-year term range (Fall/Spring/Summer), end capped at today.
 * @returns {Promise<{ startDate: string, endDate: string, label: string, termKey: string } | null>}
 */
export async function resolveTermAttendanceRange({
  familyId,
  schoolYearLabel = null,
  termKey = null,
  fromDate = new Date(),
} = {}) {
  const key = String(termKey || '').toLowerCase();
  if (!familyId || !['fall', 'spring', 'summer'].includes(key)) return null;

  const now = fromDate instanceof Date && !Number.isNaN(fromDate.getTime())
    ? new Date(fromDate)
    : new Date();
  now.setHours(12, 0, 0, 0);
  const today = localYmd(now);

  try {
    const { getFamilyPlannerSettings } = await import('../services/plannerSettingsClient.js');
    const { data: settings, error } = await getFamilyPlannerSettings(familyId, schoolYearLabel);
    if (error || !settings) return null;

    const startField = {
      fall: 'default_fall_term_start_date',
      spring: 'default_spring_term_start_date',
      summer: 'default_summer_term_start_date',
    }[key];
    const endField = {
      fall: 'default_fall_term_end_date',
      spring: 'default_spring_term_end_date',
      summer: 'default_summer_term_end_date',
    }[key];

    const startDate = ymd(settings?.[startField]);
    let endDate = ymd(settings?.[endField]);
    if (!startDate || !endDate || endDate < startDate) return null;
    if (startDate > today) return null;
    if (endDate > today) endDate = today;

    const termLabel = key.charAt(0).toUpperCase() + key.slice(1);
    return {
      startDate,
      endDate,
      label: `${termLabel} term`,
      termKey: key,
      termLabel,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve the saved school-year attendance range from planner settings.
 * End is capped at today (future days are never markable).
 * @returns {Promise<{ startDate: string, endDate: string, label: string } | null>}
 */
export async function resolveSchoolYearAttendanceRange({
  familyId,
  schoolYearLabel = null,
  fromDate = new Date(),
} = {}) {
  if (!familyId) return null;
  const now = fromDate instanceof Date && !Number.isNaN(fromDate.getTime())
    ? new Date(fromDate)
    : new Date();
  now.setHours(12, 0, 0, 0);
  const today = localYmd(now);

  try {
    const { getFamilyPlannerSettings } = await import('../services/plannerSettingsClient.js');
    const { data: settings, error } = await getFamilyPlannerSettings(familyId, schoolYearLabel);
    if (error || !settings) return null;

    const label = String(
      schoolYearLabel
      || settings?.school_year_label
      || settings?.default_school_year
      || '',
    ).trim() || 'Current school year';

    const fallStart = ymd(settings?.default_fall_term_start_date)
      || ymd(settings?.default_year_start_date);
    const summerEnd = ymd(settings?.default_summer_term_end_date)
      || ymd(settings?.default_year_end_date)
      || ymd(settings?.default_spring_term_end_date);

    let rangeStart = fallStart;
    let rangeEnd = summerEnd;
    if (!rangeStart || !rangeEnd) {
      const m = label.match(/^(20\d{2})\s*\/\s*(\d{2})$/);
      if (m) {
        const y0 = Number(m[1]);
        const y1 = 2000 + Number(m[2]);
        rangeStart = rangeStart || `${y0}-08-01`;
        rangeEnd = rangeEnd || `${y1}-07-31`;
      }
    }
    if (!rangeStart || !rangeEnd || rangeEnd < rangeStart) return null;
    if (rangeStart > today) return null;
    if (rangeEnd > today) rangeEnd = today;

    return {
      startDate: rangeStart,
      endDate: rangeEnd,
      label: /school\s*year/i.test(label) ? label : `${label} school year`,
    };
  } catch {
    return null;
  }
}

/** True when the message is a bulk “mark … days/lessons attended” request. */
export function isAttendanceRangeMarkIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (isBulkAttendanceModalIntent(message)) return true;
  if (!/\b(mark|log|logged|set)\b/.test(lower)) return false;
  if (!/\b(attend(?:ance|ed)?|present)\b/.test(lower)) return false;
  if (parseAttendanceRange(message)) return true;
  if (isSchoolYearAttendanceRangeIntent(message)) return true;
  if (parseTermKeyFromMessage(message)) return true;
  return /\b(all|every|entire)\b/.test(lower)
    && /\b(learning\s*days?|lessons?|days?)\b/.test(lower);
}

/**
 * Fetch past unattended instructional/learning events in a date range.
 * Matches by local calendar day (date_local / local start_ts) so UTC-midnight
 * slots are not dropped at US timezones.
 */
export async function fetchUnattendedLearningEventsInRange(familyId, {
  startDate,
  endDate,
  childIds = null,
} = {}) {
  if (!familyId || !startDate || !endDate) {
    return { events: [], error: 'Missing family or date range' };
  }
  // Pad UTC query window so local-midnight / UTC-midnight slots are not missed.
  const queryStart = addDaysYmd(startDate, -1);
  const queryEnd = addDaysYmd(endDate, 1);
  const { data, error } = await supabase
    .from('events')
    .select('id,title,start_ts,end_ts,event_type,status,child_id,child_ids,subject_id,counts_toward_plan,is_backlog')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .gte('start_ts', `${queryStart}T00:00:00.000Z`)
    .lte('start_ts', `${queryEnd}T23:59:59.999Z`)
    .limit(2000);

  if (error) return { events: [], error: error.message || String(error) };

  const childSet = Array.isArray(childIds) && childIds.length
    ? new Set(childIds.map((id) => String(id)))
    : null;

  const events = (data || []).filter((ev) => {
    if (!ev?.id) return false;
    if (ev.is_backlog) return false;
    const dayKey = eventLocalDayKey(ev);
    if (!dayKey || dayKey < startDate || dayKey > endDate) return false;
    const status = String(ev.status || '').toLowerCase();
    if (status === 'done' || status === 'completed' || status === 'canceled' || status === 'cancelled') {
      return false;
    }
    const type = String(ev.event_type || '').toLowerCase();
    if (['holiday', 'day off', 'day_off', 'break', 'vacation', 'blackout', 'field trip'].includes(type)) {
      return false;
    }
    const looksLearning = Boolean(ev.subject_id)
      || ev.counts_toward_plan === true
      || ['lesson', 'assignment', 'classwork', 'project', 'exam', 'quiz'].includes(type);
    if (!looksLearning) return false;
    if (childSet) {
      const ids = [];
      if (ev.child_id) ids.push(String(ev.child_id));
      if (Array.isArray(ev.child_ids)) ev.child_ids.forEach((id) => ids.push(String(id)));
      if (ids.length && !ids.some((id) => childSet.has(id))) return false;
    }
    return true;
  });

  return { events, error: null };
}

/**
 * UI present/absent → RPC params (matches Attendance.js setQuick)
 */
export async function executeMarkAttendanceRpc(familyId, childId, dateISO, uiStatus) {
  let mappedStatus = uiStatus === 'absent' ? 'absent' : 'excused';
  let minutes = uiStatus === 'absent' ? 0 : 300;

  const { data, error } = await supabase.rpc('upsert_attendance_exception', {
    p_family_id: familyId,
    p_child_id: childId,
    p_date: dateISO,
    p_status: mappedStatus,
    p_minutes_present: minutes,
    p_notes: null,
  });

  if (error) return { success: false, error: error.message || String(error) };
  return { success: true, data, userMessage: `Saved ${uiStatus} for ${dateISO}.` };
}

/**
 * @returns {Promise<{ lines: string[], error?: string }>}
 */
export async function fetchAttendanceSummaryForChild(childId, familyId) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const rangeFrom = from.toISOString().split('T')[0];
  const rangeTo = to.toISOString().split('T')[0];

  const { data: att, error } = await supabase.rpc('get_child_attendance', {
    p_child_id: childId,
    p_start_date: rangeFrom,
    p_end_date: rangeTo,
  });

  if (error) return { lines: [], error: error.message || String(error) };

  const arr = Array.isArray(att) ? att : [];
  if (arr.length === 0) {
    return { lines: [`No attendance rows yet for ${rangeFrom} → ${rangeTo}.`] };
  }

  const byStatus = {};
  for (const row of arr) {
    const st = row.status || 'unknown';
    byStatus[st] = (byStatus[st] || 0) + 1;
  }
  const summary = Object.entries(byStatus)
    .map(([k, v]) => `${k}: ${v} day(s)`)
    .join(', ');
  const sample = arr
    .slice(-8)
    .map((r) => `• ${r.date}: ${r.status}${r.minutes_present != null ? ` (${r.minutes_present} min)` : ''}`)
    .join('\n');

  return { lines: [`This month (${rangeFrom} → ${rangeTo}): ${summary}`, sample] };
}

function formatShortDate(ymdStr) {
  if (!ymdStr) return '—';
  const d = new Date(`${ymdStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymdStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * School-year attendance totals (unique present days), matching Planner Year term counts.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   error?: string,
 *   schoolYearLabel?: string,
 *   rangeStart?: string,
 *   rangeEnd?: string,
 *   daysAttended?: number,
 *   targetDays?: number|null,
 *   percent?: number|null,
 *   terms?: Array<{ label: string, start: string|null, end: string|null, count: number }>,
 * }>}
 */
export async function fetchSchoolYearAttendanceSummary({
  familyId,
  childId,
  schoolYearLabel = null,
}) {
  if (!familyId || !childId) {
    return { ok: false, error: 'Missing family or learner.' };
  }

  try {
    const { getFamilyPlannerSettings } = await import('../services/plannerSettingsClient.js');
    const { getAttendanceLogs } = await import('../services/recordsClient.js');

    const { data: settings, error: settingsError } = await getFamilyPlannerSettings(
      familyId,
      schoolYearLabel,
    );
    if (settingsError) {
      return { ok: false, error: settingsError.message || String(settingsError) };
    }

    const label = String(
      schoolYearLabel
      || settings?.school_year_label
      || settings?.default_school_year
      || '',
    ).trim() || 'Current school year';

    const fallStart = ymd(settings?.default_fall_term_start_date)
      || ymd(settings?.default_year_start_date);
    const summerEnd = ymd(settings?.default_summer_term_end_date)
      || ymd(settings?.default_year_end_date)
      || ymd(settings?.default_spring_term_end_date);

    let rangeStart = fallStart;
    let rangeEnd = summerEnd;
    if (!rangeStart || !rangeEnd) {
      const m = label.match(/^(20\d{2})\s*\/\s*(\d{2})$/);
      if (m) {
        const y0 = Number(m[1]);
        const y1 = 2000 + Number(m[2]);
        rangeStart = rangeStart || `${y0}-08-01`;
        rangeEnd = rangeEnd || `${y1}-07-31`;
      }
    }
    if (!rangeStart || !rangeEnd) {
      return { ok: false, error: 'School year dates are not configured yet.' };
    }
    if (rangeEnd < rangeStart) {
      return { ok: false, error: 'School year date range looks invalid.' };
    }

    const terms = [
      {
        label: 'Fall',
        start: ymd(settings?.default_fall_term_start_date),
        end: ymd(settings?.default_fall_term_end_date),
      },
      {
        label: 'Spring',
        start: ymd(settings?.default_spring_term_start_date),
        end: ymd(settings?.default_spring_term_end_date),
      },
      {
        label: 'Summer',
        start: ymd(settings?.default_summer_term_start_date),
        end: ymd(settings?.default_summer_term_end_date),
      },
    ].filter((t) => t.start && t.end);

    const logs = await getAttendanceLogs(familyId, [childId], {
      start: rangeStart,
      end: rangeEnd,
    }) || [];

    const presentDays = new Set();
    (logs || []).forEach((row) => {
      if (String(row?.status || '').toLowerCase() !== 'present') return;
      if (String(row?.child_id) !== String(childId)) return;
      const day = ymd(row.day_date);
      if (day && day >= rangeStart && day <= rangeEnd) presentDays.add(day);
    });

    const termCounts = terms.map((term) => {
      let count = 0;
      presentDays.forEach((day) => {
        if (day >= term.start && day <= term.end) count += 1;
      });
      return { ...term, count };
    });

    let otherCount = 0;
    presentDays.forEach((day) => {
      const inTerm = terms.some((t) => day >= t.start && day <= t.end);
      if (!inTerm) otherCount += 1;
    });
    if (otherCount > 0 || terms.length) {
      termCounts.push({ label: 'Other', start: null, end: null, count: otherCount });
    }

    const daysAttended = presentDays.size;
    const targetRaw = settings?.default_target_days;
    const targetDays = targetRaw != null && Number(targetRaw) > 0 ? Number(targetRaw) : null;
    const percent = targetDays
      ? Math.round((daysAttended / targetDays) * 100)
      : null;

    return {
      ok: true,
      schoolYearLabel: label,
      rangeStart,
      rangeEnd,
      rangeLabel: `${formatShortDate(rangeStart)} – ${formatShortDate(rangeEnd)}`,
      daysAttended,
      targetDays,
      percent,
      terms: termCounts,
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}
