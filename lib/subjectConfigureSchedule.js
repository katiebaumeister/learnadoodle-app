import { Platform } from 'react-native';
import { normalizeTimeValue, parseTimeString } from './create/eventTimeUtils';
import { applyToCalendar, getAcademicYear } from './services/academicYearClient';
import { getAcademicYearExclusions } from './services/plannerSettingsClient';
import { findAcademicYearPlanForSubject } from './subjectPlanSlotLines';
import { getSubjectPlanBlocksForSubject } from '../components/subjects/subjectScheduleOverview';
import { ATTENDANCE_MODES } from './attendanceMode';
import { supabase } from './supabase';

export const WEEKDAY_OPTIONS = [
  { num: 0, label: 'Sun' },
  { num: 1, label: 'Mon' },
  { num: 2, label: 'Tue' },
  { num: 3, label: 'Wed' },
  { num: 4, label: 'Thu' },
  { num: 5, label: 'Fri' },
  { num: 6, label: 'Sat' },
];

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const APPLY_SCOPE_FULL_YEAR = 'full_year';
export const APPLY_SCOPE_FORWARD = 'forward';

export function toLocalYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function resolveApplyFromDate(startYmd, endYmd) {
  const today = toLocalYmd(new Date());
  if (!DATE_KEY_RE.test(startYmd) || !DATE_KEY_RE.test(endYmd)) return today;
  if (today < startYmd) return startYmd;
  if (today > endYmd) return endYmd;
  return today;
}

function getClientTimezone() {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && typeof tz === 'string') return tz.trim();
    }
  } catch (_) {}
  return 'America/New_York';
}

export function schoolYearRangeFromLabel(schoolYearLabel) {
  const raw = String(schoolYearLabel || '').trim();
  if (!raw) return null;
  const m = raw.match(/(\d{4})\s*[/\-]\s*(\d{2,4})/);
  if (!m) return null;
  const startYear = Number(m[1]);
  let endYear = Number(m[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
  if (endYear < 100) endYear = Math.floor(startYear / 100) * 100 + endYear;
  return { start_date: `${startYear}-08-01`, end_date: `${endYear}-05-31` };
}

export function ymdToLocalDate(ymd) {
  const key = String(ymd || '').slice(0, 10);
  if (!DATE_KEY_RE.test(key)) return null;
  return new Date(`${key}T12:00:00`);
}

/** Resolve schedule start/end YMD for a subject school year + term, using planner settings when available. */
export function getSubjectTermDateRange(schoolYearLabel, schoolTermId, plannerSettings = null) {
  const range = schoolYearRangeFromLabel(schoolYearLabel) || defaultSchoolYearRange({ school_year: schoolYearLabel });
  const startYear = Number(String(range.start_date).slice(0, 4));
  const endYear = Number(String(range.end_date).slice(0, 4));

  const fallStart = String(plannerSettings?.default_fall_term_start_date || '').slice(0, 10)
    || (Number.isFinite(startYear) ? `${startYear}-08-01` : range.start_date);
  const fallEnd = String(plannerSettings?.default_fall_term_end_date || '').slice(0, 10)
    || (Number.isFinite(startYear) ? `${startYear}-12-31` : range.end_date);
  const springStart = String(plannerSettings?.default_spring_term_start_date || '').slice(0, 10)
    || (Number.isFinite(endYear) ? `${endYear}-01-01` : range.start_date);
  const springEnd = String(plannerSettings?.default_spring_term_end_date || '').slice(0, 10)
    || (Number.isFinite(endYear) ? `${endYear}-05-31` : range.end_date);
  const yearStart = String(plannerSettings?.default_year_start_date || '').slice(0, 10) || range.start_date;
  const yearEnd = String(plannerSettings?.default_year_end_date || '').slice(0, 10) || range.end_date;

  const term = String(schoolTermId || 'full_year');
  if (term === 'fall_term') return { start_date: fallStart, end_date: fallEnd };
  if (term === 'spring_term') return { start_date: springStart, end_date: springEnd };
  return { start_date: yearStart, end_date: yearEnd };
}

export function defaultSchoolYearRange(subject) {
  const fromLabel = schoolYearRangeFromLabel(subject?.school_year);
  if (fromLabel) return fromLabel;
  const now = new Date();
  const month = now.getMonth();
  const startYear = month >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const endYear = startYear + 1;
  return { start_date: `${startYear}-08-01`, end_date: `${endYear}-05-31` };
}

function parseWeekdaysFromBlock(block) {
  if (!Array.isArray(block?.weekdays)) return [];
  return block.weekdays
    .map((day) => parseInt(day, 10))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

/** Per-subject schedule window stored on a plan block (does not change family term defaults). */
export function getSubjectBlockScheduleDateRange(block, subject, plannerSettings = null) {
  const blockStart = String(block?.schedule_start_date || '').slice(0, 10);
  const blockEnd = String(block?.schedule_end_date || '').slice(0, 10);
  if (DATE_KEY_RE.test(blockStart) && DATE_KEY_RE.test(blockEnd)) {
    return { start_date: blockStart, end_date: blockEnd, isCustom: true };
  }
  const termRange = getSubjectTermDateRange(
    subject?.school_year,
    subject?.school_term || 'full_year',
    plannerSettings,
  );
  return { ...termRange, isCustom: false };
}

export function durationMinutesFromTimes(startTime, endTime) {
  const start = String(startTime || '').match(/^(\d{1,2}):(\d{2})/);
  const end = String(endTime || '').match(/^(\d{1,2}):(\d{2})/);
  if (!start || !end) return 60;
  const startMins = parseInt(start[1], 10) * 60 + parseInt(start[2], 10);
  const endMins = parseInt(end[1], 10) * 60 + parseInt(end[2], 10);
  const diff = endMins - startMins;
  return diff > 0 ? diff : 60;
}

export function endTimeFromStartAndDuration(startTime, durationMinutes) {
  const match = String(startTime || '').match(/^(\d{1,2}):(\d{2})/);
  const mins = Number(durationMinutes);
  if (!match || !Number.isFinite(mins) || mins <= 0) return '10:00';
  let total = parseInt(match[1], 10) * 60 + parseInt(match[2], 10) + Math.round(mins);
  total = Math.max(0, Math.min(total, 24 * 60 - 1));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function sanitizeTimeDraft(value) {
  return String(value || '').replace(/[^\d:]/g, '').slice(0, 5);
}

export function hmToMaskedTime(hm, fallback = '09:00 AM') {
  const normalized = normalizeHm(hm, '');
  if (!normalized) return fallback;
  const parsed = parseTimeString(normalized);
  if (!parsed) return fallback;
  let hour = parsed.hours;
  const minutes = String(parsed.minutes).padStart(2, '0');
  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return `${String(hour).padStart(2, '0')}:${minutes} ${period}`;
}

export function maskedTimeToHm(masked, fallback = '09:00') {
  const parsed = parseTimeString(normalizeTimeValue(masked));
  if (!parsed) return normalizeHm(masked, fallback);
  return `${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`;
}

export function normalizeHm(value, fallback = '09:00') {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function isScheduleFormConfigured({
  weekdays = [],
  startTime = '',
  durationMinutes = '',
  startDate = null,
  endDate = null,
} = {}) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) return false;
  if (!String(startTime || '').trim()) return false;
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return false;
  if (!startDate || !endDate) return false;
  return true;
}

export function buildInitialScheduleForm({ subject, planData, academicYearId, plannerSettings = null }) {
  const block = getSubjectPlanBlocksForSubject(planData, subject?.id)[0] || null;
  const weekdays = parseWeekdaysFromBlock(block);
  const blockStartTime = block?.start_time ? normalizeHm(block.start_time, '') : '';
  const durationMinutes = block
    ? durationMinutesFromTimes(blockStartTime || block.start_time, block?.end_time)
    : null;
  const dateRange = getSubjectBlockScheduleDateRange(block, subject, plannerSettings);

  return {
    weekdays: weekdays.length > 0 ? weekdays : [],
    startTime: blockStartTime,
    durationMinutes: durationMinutes != null && durationMinutes > 0 ? durationMinutes : '',
    startDate: DATE_KEY_RE.test(dateRange.start_date) ? new Date(`${dateRange.start_date}T12:00:00`) : null,
    endDate: DATE_KEY_RE.test(dateRange.end_date) ? new Date(`${dateRange.end_date}T12:00:00`) : null,
    academicYearId: academicYearId || null,
    hasExistingBlock: !!block,
    hasCustomScheduleDates: !!dateRange.isCustom,
  };
}

export async function countSubjectScheduleEvents({ familyId, subjectId, academicYearId = null }) {
  if (!familyId || !subjectId) return 0;
  let query = supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('family_id', familyId)
    .eq('subject_id', String(subjectId))
    .eq('generated_by', 'plan_year')
    .is('deleted_at', null);
  if (academicYearId) {
    query = query.eq('academic_year_id', String(academicYearId));
  }
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function clearSubjectPlanPlaceholders({ familyId, subjectId, academicYearId = null }) {
  const sid = String(subjectId);
  const now = new Date().toISOString();
  let query = supabase
    .from('events')
    .update({ deleted_at: now, status: 'canceled', updated_at: now })
    .eq('family_id', familyId)
    .eq('subject_id', sid)
    .eq('generated_by', 'plan_year')
    .is('deleted_at', null)
    .is('curriculum_lesson_id', null);
  if (academicYearId) {
    query = query.eq('academic_year_id', String(academicYearId));
  }
  const { error } = await query;
  if (error) throw error;
}

function resolveExistingSubjectBlock(planData, subjectId) {
  const blocks = Array.isArray(planData?.plan?.blocks) ? planData.plan.blocks : [];
  return blocks.find((block) => String(block?.subject_id ?? '') === String(subjectId)) || null;
}

async function removeSubjectBlockFromYearPlan(familyId, subjectId, academicYearId = null) {
  const sid = String(subjectId);
  const { data: rows, error } = await supabase
    .from('academic_year_plan')
    .select('id, blocks, academic_year_id')
    .eq('family_id', familyId);
  if (error) throw error;
  const nowIso = new Date().toISOString();
  for (const row of rows || []) {
    if (academicYearId && String(row.academic_year_id) !== String(academicYearId)) continue;
    const blocks = Array.isArray(row.blocks) ? row.blocks : [];
    const newBlocks = blocks.filter((b) => String(b?.subject_id || '') !== sid);
    if (newBlocks.length === blocks.length) continue;
    const { error: upErr } = await supabase
      .from('academic_year_plan')
      .update({ blocks: newBlocks, updated_at: nowIso })
      .eq('id', row.id);
    if (upErr) throw upErr;
  }
}

/** Soft-delete plan-generated calendar events for one subject and remove its schedule block. */
export async function removeSubjectScheduleFromCalendar({
  familyId,
  subjectId,
  academicYearId = null,
}) {
  if (!familyId || !subjectId) throw new Error('Missing subject context.');
  const sid = String(subjectId);
  const now = new Date().toISOString();

  let deleteQuery = supabase
    .from('events')
    .update({ deleted_at: now, status: 'canceled', updated_at: now })
    .eq('family_id', familyId)
    .eq('subject_id', sid)
    .eq('generated_by', 'plan_year')
    .is('deleted_at', null);
  if (academicYearId) {
    deleteQuery = deleteQuery.eq('academic_year_id', String(academicYearId));
  }
  const { error: delErr } = await deleteQuery;
  if (delErr) throw delErr;

  await removeSubjectBlockFromYearPlan(familyId, sid, academicYearId);
  dispatchScheduleRefreshEvents();
  return { ok: true };
}

function mergeBlocksForSubject(existingBlocks, subjectId, nextBlock) {
  const sid = String(subjectId);
  const rest = (existingBlocks || []).filter((block) => String(block?.subject_id ?? '') !== sid);
  return [...rest, nextBlock];
}

/** Merge a subject scheduling block into year plan data for cache/UI hydration. */
export function mergePlanDataWithSubjectBlock(yearDetail, subjectId, nextBlock) {
  if (!yearDetail) return null;
  const plan = yearDetail.plan || {};
  const existingBlocks = Array.isArray(plan.blocks) ? plan.blocks : [];
  return {
    ...yearDetail,
    plan: {
      ...plan,
      blocks: mergeBlocksForSubject(existingBlocks, subjectId, nextBlock),
    },
  };
}

async function resolvePlanDataAfterApply({
  yearDetail,
  subjectId,
  nextBlock,
  yearId,
  applyData,
}) {
  const sid = String(subjectId);
  const returnedBlockId = Array.isArray(applyData?.blocks) && applyData.blocks.length === 1
    ? applyData.blocks[0]?.block_id
    : null;
  const savedBlock = {
    ...nextBlock,
    block_id: returnedBlockId || nextBlock.block_id || undefined,
  };
  if (yearId) {
    try {
      const { data, error } = await getAcademicYear(yearId);
      if (!error && data?.plan) return data;
    } catch (_) {
      // Fall through to optimistic merge.
    }
  }
  return mergePlanDataWithSubjectBlock(yearDetail, sid, savedBlock);
}

function dispatchScheduleRefreshEvents() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('refreshSubjects', { detail: { skipSubjectDetailRefresh: false } }));
  window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
  window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
  window.dispatchEvent(new CustomEvent('planAppliedToCalendar'));
}

export async function applySubjectScheduleToCalendar({
  familyId,
  subject,
  assignedChildIds = [],
  allChildIds = [],
  weekdays,
  startTime,
  durationMinutes,
  startDate,
  endDate,
  academicYearId = null,
  planData = null,
  applyScope = APPLY_SCOPE_FULL_YEAR,
}) {
  if (!familyId || !subject?.id) throw new Error('Missing subject context.');
  const sid = String(subject.id);
  const startYmd = startDate instanceof Date ? toLocalYmd(startDate) : String(startDate || '').slice(0, 10);
  const endYmd = endDate instanceof Date ? toLocalYmd(endDate) : String(endDate || '').slice(0, 10);
  const applyFromDate = applyScope === APPLY_SCOPE_FORWARD
    ? resolveApplyFromDate(startYmd, endYmd)
    : null;
  if (!DATE_KEY_RE.test(startYmd) || !DATE_KEY_RE.test(endYmd)) {
    throw new Error('Pick valid start and end dates.');
  }
  if (startYmd > endYmd) throw new Error('End date must be on or after start date.');
  if (!Array.isArray(weekdays) || weekdays.length === 0) throw new Error('Select at least one day.');

  const normalizedStart = normalizeHm(startTime, '09:00');
  const normalizedEnd = endTimeFromStartAndDuration(normalizedStart, durationMinutes);
  const childIds = (assignedChildIds?.length ? assignedChildIds : allChildIds).filter(Boolean);

  let yearId = academicYearId ? String(academicYearId) : null;
  let yearDetail = planData;

  if (!yearId) {
    const fetched = await findAcademicYearPlanForSubject(familyId, sid);
    yearId = fetched?.academicYearId || null;
    yearDetail = fetched?.planData || yearDetail;
  }

  if (yearId && !yearDetail?.plan) {
    const { data, error } = await getAcademicYear(yearId);
    if (error) throw error;
    yearDetail = data;
  }

  const existingSubjectBlock = resolveExistingSubjectBlock(yearDetail, sid);
  const nextBlock = {
    block_id: existingSubjectBlock?.block_id || undefined,
    subject_id: sid,
    child_ids: childIds,
    weekdays: [...weekdays].sort((a, b) => a - b),
    start_time: normalizedStart,
    end_time: normalizedEnd,
    all_day: false,
    schedule_start_date: startYmd,
    schedule_end_date: endYmd,
  };

  await clearSubjectPlanPlaceholders({ familyId, subjectId: sid, academicYearId: yearId });

  if (yearId && yearDetail?.plan) {
    const plan = yearDetail.plan || {};
    const existingBlocks = Array.isArray(plan.blocks) ? plan.blocks : [];
    const blocks = mergeBlocksForSubject(
      existingBlocks.map((block) => ({
        block_id: block?.block_id || undefined,
        subject_id: block?.subject_id ?? null,
        placeholder_label: block?.placeholder_label || undefined,
        child_ids: Array.isArray(block?.child_ids) ? block.child_ids : [],
        weekdays: Array.isArray(block?.weekdays) ? block.weekdays : [],
        start_time: block?.start_time || '09:00',
        end_time: block?.end_time || '10:00',
        all_day: !!block?.all_day,
        schedule_start_date: block?.schedule_start_date || undefined,
        schedule_end_date: block?.schedule_end_date || undefined,
      })),
      sid,
      nextBlock
    );
    const holidaySettings = yearDetail?.holiday_settings || {};
    const holidayRegion = holidaySettings.holiday_region
      || (holidaySettings.holiday_country_code
        ? `${holidaySettings.holiday_country_code}${holidaySettings.holiday_region ? `:${holidaySettings.holiday_region}` : ''}`
        : 'US');
    const customHolidays = Array.isArray(yearDetail?.holidays)
      ? yearDetail.holidays
          .filter((h) => (h?.type || 'CUSTOM_HOLIDAY') === 'CUSTOM_HOLIDAY')
          .map((h) => ({
            date: typeof h?.date === 'string' ? h.date.slice(0, 10) : String(h?.date || '').slice(0, 10),
            name: h?.name || '',
            type: h?.type || 'CUSTOM_HOLIDAY',
          }))
      : [];
    const { data: exclusions } = await getAcademicYearExclusions(yearId);
    const customBreaks = Array.isArray(exclusions)
      ? exclusions
          .filter((entry) => entry?.exclusion_type === 'break')
          .map((entry) => ({
            start: typeof entry?.start_date === 'string' ? entry.start_date.slice(0, 10) : String(entry?.start_date || '').slice(0, 10),
            end: typeof entry?.end_date === 'string' ? entry.end_date.slice(0, 10) : String(entry?.end_date || '').slice(0, 10),
            name: entry?.label || 'Break',
          }))
      : [];

    const planStartYmd = String(plan?.start_date || yearDetail?.start_date || '').slice(0, 10);
    const planEndYmd = String(plan?.end_date || yearDetail?.end_date || '').slice(0, 10);
    const payload = {
      academic_year_id: yearId,
      family_id: familyId,
      start_date: DATE_KEY_RE.test(planStartYmd) ? planStartYmd : startYmd,
      end_date: DATE_KEY_RE.test(planEndYmd) ? planEndYmd : endYmd,
      follow_public_holidays: holidaySettings.follow_global_holidays !== false,
      holiday_region: holidayRegion,
      excluded_holiday_dates: holidaySettings.excluded_holiday_dates || [],
      custom_holidays: customHolidays,
      custom_breaks: customBreaks,
      target_instructional_days: (plan?.constraint_mode === 'days' ? plan?.target_days : null) ?? 180,
      subjects: [...new Set(blocks.map((b) => b?.subject_id).filter(Boolean))],
      constraint_mode: plan?.constraint_mode || 'none',
      target_days: plan?.target_days ?? null,
      target_hours: plan?.target_hours ?? null,
      replace_placeholders: true,
      create_calendar_events: true,
      blocks,
      attendance_tracking_mode: ATTENDANCE_MODES.SUBJECT,
      year_name: yearDetail?.year_name || undefined,
      timezone: getClientTimezone(),
    };
    if (applyFromDate) payload.apply_from_date = applyFromDate;
    payload.ignore_conflicts = true;
    const { data, error } = await applyToCalendar(payload);
    if (error) throw error;
    const refreshedPlanData = await resolvePlanDataAfterApply({
      yearDetail,
      subjectId: sid,
      nextBlock,
      yearId,
      applyData: data,
    });
    dispatchScheduleRefreshEvents();
    return { ...data, planData: refreshedPlanData, academicYearId: yearId };
  }

  const bootstrapPayload = {
    family_id: familyId,
    start_date: startYmd,
    end_date: endYmd,
    follow_public_holidays: true,
    holiday_region: 'US',
    subjects: [sid],
    replace_placeholders: true,
    create_calendar_events: true,
    blocks: [nextBlock],
    attendance_tracking_mode: ATTENDANCE_MODES.SUBJECT,
    run_scope_type: 'full_year',
    school_duration_scope: 'full_year',
    target_instructional_days: 180,
    use_defaults: false,
    timezone: getClientTimezone(),
    year_name: `${subject?.name || 'Subject'} schedule`,
  };
  if (applyFromDate) bootstrapPayload.apply_from_date = applyFromDate;
  bootstrapPayload.ignore_conflicts = true;
  const { data, error } = await applyToCalendar(bootstrapPayload);
  if (error) throw error;
  const newYearId = data?.academic_year_id ? String(data.academic_year_id) : null;
  const refreshedPlanData = await resolvePlanDataAfterApply({
    yearDetail: yearDetail || { plan: { blocks: [] } },
    subjectId: sid,
    nextBlock,
    yearId: newYearId,
    applyData: data,
  });
  dispatchScheduleRefreshEvents();
  return { ...data, planData: refreshedPlanData, academicYearId: newYearId };
}
