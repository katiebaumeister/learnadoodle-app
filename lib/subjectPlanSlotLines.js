/**
 * Build "Dates with events" slot lines for one subject — same rules as PlanYearModal plan summary,
 * scoped to blocks for that subject only.
 */
import { supabase } from './supabase';
import { getAcademicYear } from './services/academicYearClient';
import { formatTimeRange } from './planEditListCache';

function dateStringToDate(ymd) {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

function toLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function getBlockOccurrenceDates(block, startDateYmd, endDateYmd, exclusionRanges) {
  if (!startDateYmd || !endDateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(startDateYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endDateYmd)) {
    return [];
  }
  const weekdays = (block.weekdays || []).map((w) => (w != null ? parseInt(w, 10) : null)).filter((w) => Number.isInteger(w));
  if (weekdays.length === 0) return [];
  const start = dateStringToDate(startDateYmd);
  const end = dateStringToDate(endDateYmd);
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    const ymd = toLocalYYYYMMDD(cur);
    const dayOfWeek = cur.getDay();
    if (!weekdays.includes(dayOfWeek)) {
      cur.setDate(cur.getDate() + 1);
      continue;
    }
    const inExclusion = (exclusionRanges || []).some(([s, e]) => ymd >= s && ymd <= e);
    if (!inExclusion) out.push(ymd);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function formatDateDisplayYmd(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || '';
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function eventExistsKey(ymd, sid, startLocal) {
  const s = startLocal == null ? '' : String(startLocal).trim().replace(/^(\d):/, '0$1:');
  return `${ymd}|${String(sid)}|${s}`;
}

function addOneDayYmd(ymd) {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function normalizeHmFromStartLocal(startLocal) {
  if (startLocal == null || String(startLocal).trim() === '') return null;
  const parts = String(startLocal).trim().split(':');
  if (parts.length >= 2) {
    const h = parseInt(parts[0], 10);
    const min = parseInt((parts[1] || '0').replace(/\D/g, '').slice(0, 2) || '0', 10);
    if (Number.isFinite(h)) return h * 60 + (Number.isFinite(min) ? min : 0);
  }
  return null;
}

/**
 * Client fallback when `/event_for_slot` returns nothing (e.g. event missing academic_year_id).
 * RLS must allow the signed-in user to read family events.
 */
export async function findEventIdForPlanSlotSupabase({ familyId, dateYmd, subjectId, startLocal }) {
  if (!familyId || !dateYmd || !subjectId) return null;
  const endUpper = addOneDayYmd(dateYmd);
  const { data: rows, error } = await supabase
    .from('events')
    .select('id, start_ts')
    .eq('family_id', familyId)
    .eq('subject_id', String(subjectId))
    .is('deleted_at', null)
    .gte('start_ts', `${dateYmd}T00:00:00`)
    .lt('start_ts', `${endUpper}T00:00:00`);
  if (error || !rows?.length) return null;
  const targetMin = normalizeHmFromStartLocal(startLocal);
  if (targetMin != null) {
    for (const ev of rows) {
      if (!ev.start_ts) continue;
      const d = new Date(ev.start_ts);
      if (Number.isNaN(d.getTime())) continue;
      const evMin = d.getHours() * 60 + d.getMinutes();
      if (evMin === targetMin) return ev.id;
    }
  }
  if (rows.length === 1) return rows[0].id;
  return null;
}

const AVAILABLE_SLOT_LABEL = 'Available instructional slot';

/**
 * @returns {Array<{date, dateLabel, timeLabel, subjectName, subjectId, startLocal, unitTopic?, lessonTitle?, eventId?, academicYearId?, hasAttachment?: boolean}>}
 */
export function buildSubjectPlanSlotLines(academicYearId, data, subjectId, subjectNameFallback = 'Subject') {
  if (!data?.plan || !subjectId || !academicYearId) return [];
  const planStart = data.plan?.start_date || data.start_date || '';
  const planEnd = data.plan?.end_date || data.end_date || '';
  const blocks = (data.plan?.blocks || []).filter((b) => String(b.subject_id) === String(subjectId));
  if (!planStart || !planEnd || blocks.length === 0) return [];
  const planSlotLabels = Array.isArray(data.plan?.plan_slot_labels) ? data.plan.plan_slot_labels : [];
  const planEventDates = Array.isArray(data.plan?.plan_event_dates)
    ? data.plan.plan_event_dates
    : Array.isArray(data.plan?.plan_slot_dates)
      ? data.plan.plan_slot_dates
      : [];
  const exclusionRanges = [];
  const existingEventKeys = new Set(
    planEventDates.map((e) => eventExistsKey(e.date_ymd, e.subject_id, e.start_local || ''))
  );
  const lines = [];
  blocks.forEach((block) => {
    const timeLabel = block.all_day ? 'All day' : formatTimeRange(block.start_time, block.end_time);
    const startLocal = block.all_day ? null : (block.start_time || '09:00');
    const dates = getBlockOccurrenceDates(block, planStart, planEnd, exclusionRanges);
    dates.forEach((ymd) => {
      const key = eventExistsKey(ymd, block.subject_id, startLocal);
      if (existingEventKeys.size > 0 && !existingEventKeys.has(key)) return;
      const line = {
        date: ymd,
        dateLabel: formatDateDisplayYmd(ymd),
        timeLabel,
        subjectName: subjectNameFallback,
        subjectId: block.subject_id,
        startLocal,
        academicYearId,
      };
      const label = planSlotLabels.find(
        (l) =>
          l.date_ymd === ymd &&
          String(l.subject_id) === String(block.subject_id) &&
          (startLocal == null
            ? l.start_local == null
            : l.start_local === startLocal ||
              (l.start_local && startLocal && l.start_local.replace(/^0/, '') === startLocal.replace(/^0/, '')))
      );
      if (label) {
        if ((label.unit || '').trim()) line.unitTopic = (label.unit || '').trim();
        if ((label.lesson || '').trim()) line.lessonTitle = (label.lesson || '').trim();
        if (label.open_plan_slot) line.lessonTitle = AVAILABLE_SLOT_LABEL;
      }
      const matchingEvent = planEventDates.find((e) => eventExistsKey(e.date_ymd, e.subject_id, e.start_local) === key);
      if (matchingEvent?.has_attachment) line.hasAttachment = true;
      const evId = matchingEvent?.event_id ?? matchingEvent?.id;
      if (evId) line.eventId = evId;
      lines.push(line);
    });
  });
  lines.sort((a, b) => a.date.localeCompare(b.date) || (a.timeLabel || '').localeCompare(b.timeLabel || ''));
  return lines;
}

/**
 * Find the most recent academic year whose plan includes a scheduling block for this subject.
 */
export async function findAcademicYearPlanForSubject(familyId, subjectId) {
  if (!familyId || !subjectId) return { academicYearId: null, planData: null };
  const { data: years, error } = await supabase
    .from('academic_years')
    .select('id')
    .eq('family_id', familyId)
    .order('start_date', { ascending: false });
  if (error || !years?.length) return { academicYearId: null, planData: null };
  for (const row of years) {
    const { data, error: ge } = await getAcademicYear(row.id);
    if (ge || !data?.plan?.blocks?.length) continue;
    const has = data.plan.blocks.some((b) => String(b.subject_id) === String(subjectId));
    if (has) return { academicYearId: row.id, planData: data };
  }
  return { academicYearId: null, planData: null };
}
