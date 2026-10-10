/**
 * Build school-year / subject schedule context for Create from syllabus & generate.
 * Used so draft unit/lesson counts and minutes match saved lesson days/times.
 */

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function getSubjectPlanBlocksForSubject(planData, subjectId) {
  if (!planData?.plan || !subjectId) return [];
  const sid = String(subjectId);
  const blocks = Array.isArray(planData.plan.blocks) ? planData.plan.blocks : [];
  return blocks.filter((b) => String(b?.subject_id || '') === sid);
}

function parseWeekdays(block) {
  if (!Array.isArray(block?.weekdays)) return [];
  return block.weekdays
    .map((d) => parseInt(d, 10))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
}

function normalizeHm(value, fallback = '09:00') {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const h = Math.min(23, Math.max(0, parseInt(match[1], 10)));
  const m = Math.min(59, Math.max(0, parseInt(match[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function durationMinutesFromTimes(startTime, endTime) {
  const start = String(startTime || '').match(/^(\d{1,2}):(\d{2})/);
  const end = String(endTime || '').match(/^(\d{1,2}):(\d{2})/);
  if (!start || !end) return 60;
  const startMins = parseInt(start[1], 10) * 60 + parseInt(start[2], 10);
  const endMins = parseInt(end[1], 10) * 60 + parseInt(end[2], 10);
  const diff = endMins - startMins;
  return diff > 0 ? diff : 60;
}

function schoolYearRangeFromLabel(schoolYearLabel) {
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

function getSubjectBlockScheduleDateRange(block, subject, plannerSettings = null) {
  const blockStart = String(block?.schedule_start_date || '').slice(0, 10);
  const blockEnd = String(block?.schedule_end_date || '').slice(0, 10);
  if (DATE_KEY_RE.test(blockStart) && DATE_KEY_RE.test(blockEnd)) {
    return { start_date: blockStart, end_date: blockEnd };
  }
  const range = schoolYearRangeFromLabel(subject?.school_year)
    || { start_date: '2025-08-01', end_date: '2026-05-31' };
  const yearStart = String(plannerSettings?.default_year_start_date || '').slice(0, 10) || range.start_date;
  const yearEnd = String(plannerSettings?.default_year_end_date || '').slice(0, 10) || range.end_date;
  return {
    start_date: DATE_KEY_RE.test(yearStart) ? yearStart : range.start_date,
    end_date: DATE_KEY_RE.test(yearEnd) ? yearEnd : range.end_date,
  };
}

function countOccurrencesInRange(startYmd, endYmd, weekdays = []) {
  if (!DATE_KEY_RE.test(startYmd) || !DATE_KEY_RE.test(endYmd) || !weekdays.length) return 0;
  const target = new Set(weekdays.map(Number));
  const start = new Date(`${startYmd}T12:00:00`);
  const end = new Date(`${endYmd}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (target.has(cur.getDay())) count += 1;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function formatWeekdays(weekdays) {
  return weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d] || String(d))
    .join(', ');
}

/**
 * @returns {Promise<{
 *   planning_context: string|null,
 *   lesson_count_target: number|null,
 *   typical_lesson_minutes: number|null,
 *   duration_mode: string,
 *   special_instructions: string|null,
 *   scheduleSummary: string|null,
 * }>}
 */
export async function buildSubjectCurriculumPlanningContext({
  familyId,
  subject,
  academicYearId = null,
  planData: planDataIn = null,
} = {}) {
  const subjectId = subject?.id != null ? String(subject.id) : null;
  if (!familyId || !subjectId) {
    return {
      planning_context: null,
      lesson_count_target: null,
      typical_lesson_minutes: null,
      duration_mode: 'multi_unit_course',
      special_instructions: null,
      scheduleSummary: null,
    };
  }

  let planData = planDataIn;
  let yearId = academicYearId != null ? String(academicYearId) : null;

  if (!planData) {
    try {
      const { getSubjectProgressCache } = await import('./subjectProgressPlanCache.js');
      const cached = getSubjectProgressCache(familyId, subjectId);
      if (cached?.planData) planData = cached.planData;
      if (!yearId && cached?.academicYearId) yearId = String(cached.academicYearId);
    } catch (_) {
      /* optional in tests */
    }
  }

  if (!planData) {
    try {
      const { findAcademicYearPlanForSubject } = await import('./subjectPlanSlotLines.js');
      const found = await findAcademicYearPlanForSubject(familyId, subjectId);
      if (found?.planData) planData = found.planData;
      if (!yearId && found?.academicYearId) yearId = String(found.academicYearId);
    } catch (_) {
      /* optional */
    }
  }

  const blocks = getSubjectPlanBlocksForSubject(planData, subjectId);
  const block = blocks[0] || null;
  const weekdays = parseWeekdays(block);
  const startHm = block?.start_time ? normalizeHm(block.start_time, '09:00') : '09:00';
  const endHm = block?.end_time ? normalizeHm(block.end_time, '10:00') : '10:00';
  const minutes = block
    ? durationMinutesFromTimes(startHm, endHm)
    : 60;
  const typical = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;

  const dateRange = getSubjectBlockScheduleDateRange(block, subject, planData?.settings || null);
  const startYmd = DATE_KEY_RE.test(dateRange.start_date) ? dateRange.start_date : null;
  const endYmd = DATE_KEY_RE.test(dateRange.end_date) ? dateRange.end_date : null;

  let slotCount = weekdays.length && startYmd && endYmd
    ? countOccurrencesInRange(startYmd, endYmd, weekdays)
    : 0;

  if (slotCount > 200) slotCount = 200;

  const dayLabel = weekdays.length ? formatWeekdays(weekdays) : 'not set';
  const subjectName = subject?.name || subject?.title || 'Subject';
  const lines = [
    `Subject: ${subjectName}`,
    yearId ? `Academic year id: ${yearId}` : null,
    subject?.school_year ? `School year label: ${subject.school_year}` : null,
    subject?.school_term ? `Term: ${subject.school_term}` : null,
    startYmd && endYmd ? `Instructional date range: ${startYmd} → ${endYmd}` : null,
    `Scheduled lesson days: ${dayLabel}`,
    `Lesson time window: ${startHm}–${endHm}`,
    `Typical lesson length: ${typical} minutes`,
    slotCount > 0
      ? `Instructional slot count (approx. meetings in range on those weekdays): ${slotCount}`
      : 'Instructional slot count: unknown (no weekdays/dates configured — invent a reasonable multi-unit course)',
    'Align total lessons to the slot count (±15%) when expanding goals or generating.',
    'Each lesson should use the typical lesson length unless the source specifies otherwise.',
    'Prefer multiple titled units with nested lessons (not one flat imported list).',
  ].filter(Boolean);

  const planning_context = lines.join('\n');
  const scheduleSummary = slotCount > 0
    ? `${slotCount} lessons · ${dayLabel} · ${typical} min · ${startYmd || '?'}–${endYmd || '?'}`
    : `Schedule incomplete — draft will still use multi-unit structure (${typical} min lessons)`;

  const special_instructions = [
    'Create a reviewable unit/lesson draft for this subject.',
    'If the source lists units and lessons explicitly, preserve that hierarchy.',
    'If the source is goals/topics/themes without a lesson list, invent a clear multi-unit outline that covers those goals and fits the planning context slot count.',
    'Never dump everything into a single “Imported lessons” unit when multiple themes exist.',
    slotCount > 0
      ? `Target about ${slotCount} lessons total (±15%), each ~${typical} minutes.`
      : `Use sensible pacing with ~${typical}-minute lessons.`,
  ].join(' ');

  let duration_mode = 'multi_unit_course';
  if (slotCount >= 120) duration_mode = 'full_year';
  else if (slotCount >= 60) duration_mode = 'semester';

  return {
    planning_context,
    lesson_count_target: slotCount > 0 ? slotCount : null,
    typical_lesson_minutes: typical,
    duration_mode,
    special_instructions,
    scheduleSummary,
  };
}
