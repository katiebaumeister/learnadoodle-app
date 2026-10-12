import { supabase } from './supabase';
import { isPersistedCurriculumId } from './curriculumIds';

const UNLINK_LESSON_FIELDS = {
  curriculum_lesson_id: null,
  curriculum_unit_title: null,
  unit: null,
  lesson: null,
};

function parseCurriculumMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
}

export async function persistEventUpdate(eventId, familyId, updates) {
  const { data, error } = await supabase
    .from('events')
    .update(updates)
    .eq('id', String(eventId))
    .eq('family_id', familyId)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('Event not found');
  return data;
}

async function fetchEventCurriculumMetadata(eventId, familyId) {
  const { data, error } = await supabase
    .from('events')
    .select('curriculum_metadata')
    .eq('id', String(eventId))
    .eq('family_id', familyId)
    .maybeSingle();
  if (error) throw error;
  return parseCurriculumMetadata(data?.curriculum_metadata);
}

export function eventHasLinkedLesson(event) {
  if (!event) return false;
  if (event.curriculum_lesson_id) return true;
  const lesson = String(event.lesson || '').trim();
  const meta = event?.curriculum_metadata && typeof event.curriculum_metadata === 'object'
    ? event.curriculum_metadata
    : {};
  return Boolean(lesson || String(meta?.lesson_label || '').trim());
}

/**
 * Classwork “no unit or lesson attached” rule: only a real curriculum_lessons FK counts.
 * Plan-year slots often have a leftover lesson title/label without a curriculum_lesson_id —
 * those must still be treated as open for Schedule all / With dates assign.
 */
export function eventHasCurriculumLessonAttached(event) {
  if (!event) return false;
  const lessonId = event?.curriculum_lesson_id != null
    ? String(event.curriculum_lesson_id).trim()
    : '';
  return Boolean(lessonId && isPersistedCurriculumId(lessonId));
}

export function getEventStartDate(event) {
  const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getUnlinkedUpcomingEvents(subjectEvents = [], {
  limit = 5,
  /** When false, include past unattached learning days (same pool Classwork lists). */
  upcomingOnly = true,
  /**
   * When true (default), only curriculum_lesson_id counts as linked — matches Classwork.
   * When false, also treat lesson title / lesson_label as linked (legacy chip behavior).
   */
  curriculumFkOnly = true,
} = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (subjectEvents || [])
    .filter((event) => event?.status !== 'canceled' && !event?.is_backlog)
    .filter((event) => (
      curriculumFkOnly
        ? !eventHasCurriculumLessonAttached(event)
        : !eventHasLinkedLesson(event)
    ))
    .map((event) => ({ event, date: getEventStartDate(event) }))
    .filter(({ date }) => date && (!upcomingOnly || date >= today))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, limit)
    .map(({ event, date }) => ({
      event,
      dateLabel: date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }),
    }));
}

export function flattenCurriculumLessons(units = []) {
  const rows = [];
  (units || []).forEach((unit) => {
    const unitTitle = String(unit?.title || '').trim();
    (unit?.lessons || []).forEach((lesson) => {
      const lessonId = lesson?.id != null ? String(lesson.id).trim() : '';
      const lessonTitle = String(lesson?.title || '').trim();
      if (!lessonId || !lessonTitle) return;
      rows.push({
        lessonId,
        lessonTitle,
        unitTitle,
        unitId: unit?.id != null ? String(unit.id) : null,
      });
    });
  });
  return rows;
}

export function getUnassignedLessons(units = [], subjectEvents = []) {
  const linkedIds = new Set(
    (subjectEvents || [])
      .map((event) => (event?.curriculum_lesson_id != null ? String(event.curriculum_lesson_id).trim() : ''))
      .filter(Boolean)
  );
  return flattenCurriculumLessons(units).filter((row) => !linkedIds.has(row.lessonId));
}

export async function linkLessonToEvent({
  eventId,
  familyId,
  lessonId,
  unitTitle,
  lessonTitle,
}) {
  if (!eventId || !familyId || !lessonId) {
    throw new Error('Missing event or lesson.');
  }
  if (!isPersistedCurriculumId(lessonId)) {
    throw new Error('This lesson is still saving. Wait a moment and try again.');
  }
  const unit = String(unitTitle || '').trim() || null;
  const lesson = String(lessonTitle || '').trim() || null;
  // Preserve subject_ids / plan metadata — replacing the whole JSON drops Classwork linkage.
  const prevMeta = await fetchEventCurriculumMetadata(eventId, familyId);
  const nextMeta = { ...prevMeta };
  if (lesson) nextMeta.lesson_label = lesson;
  else delete nextMeta.lesson_label;
  await persistEventUpdate(eventId, familyId, {
    curriculum_lesson_id: String(lessonId),
    curriculum_unit_title: unit,
    unit,
    lesson,
    curriculum_metadata: nextMeta,
  });
  return true;
}

export async function unlinkLessonFromEvents({ familyId, lessonId, exceptEventId = null }) {
  if (!familyId || !lessonId) return;
  let selectQuery = supabase
    .from('events')
    .select('id, curriculum_metadata')
    .eq('family_id', familyId)
    .eq('curriculum_lesson_id', String(lessonId));
  if (exceptEventId) {
    selectQuery = selectQuery.neq('id', String(exceptEventId));
  }
  const { data: rows, error: selectError } = await selectQuery;
  if (selectError) throw selectError;
  await Promise.all((rows || []).map(async (row) => {
    const meta = parseCurriculumMetadata(row?.curriculum_metadata);
    delete meta.lesson_label;
    const { error } = await supabase
      .from('events')
      .update({
        ...UNLINK_LESSON_FIELDS,
        curriculum_metadata: meta,
      })
      .eq('id', String(row.id))
      .eq('family_id', familyId);
    if (error) throw error;
  }));
}

/** Attach a scheduled learning day to a curriculum lesson (same fields as Learning day modal). */
export async function attachLearningDayToLesson({
  eventId,
  familyId,
  lessonId,
  unitTitle,
  lessonTitle,
}) {
  if (!eventId || !familyId || !lessonId) {
    throw new Error('Missing event or lesson.');
  }
  if (!isPersistedCurriculumId(lessonId)) {
    throw new Error('This lesson is still saving. Wait a moment and try again.');
  }
  await unlinkLessonFromEvents({ familyId, lessonId, exceptEventId: eventId });
  return linkLessonToEvent({
    eventId,
    familyId,
    lessonId,
    unitTitle,
    lessonTitle,
  });
}

function pairLessonsWithUnlinkedEvents({
  subjectEvents = [],
  units = [],
  limit = 20,
}) {
  // Fill Classwork’s “no unit or lesson attached” pool in date order (including past days).
  const unlinked = getUnlinkedUpcomingEvents(subjectEvents, {
    limit,
    upcomingOnly: false,
    curriculumFkOnly: true,
  });
  const lessons = getUnassignedLessons(units, subjectEvents);
  const pairs = [];
  for (let i = 0; i < Math.min(unlinked.length, lessons.length); i += 1) {
    const { event, dateLabel } = unlinked[i];
    const lesson = lessons[i];
    if (!event?.id || !lesson?.lessonId) continue;
    pairs.push({
      lesson,
      event,
      dateLabel,
    });
  }
  return pairs;
}

export function buildLessonSchedulePreview({
  subjectEvents = [],
  units = [],
  limit = 20,
}) {
  return pairLessonsWithUnlinkedEvents({ subjectEvents, units, limit }).map(({ lesson, event, dateLabel }) => ({
    lessonId: lesson.lessonId,
    lessonTitle: lesson.lessonTitle,
    unitTitle: lesson.unitTitle,
    unitId: lesson.unitId,
    eventId: event.id,
    dateLabel,
  }));
}

export function formatLessonSchedulePreviewLine({
  lessonTitle,
  dateLabel,
  unitTitle = null,
}) {
  const lesson = String(lessonTitle || '').trim() || 'Lesson';
  const date = String(dateLabel || '').trim() || 'Upcoming session';
  if (unitTitle) {
    return `${unitTitle} · ${lesson} → ${date}`;
  }
  return `${lesson} → ${date}`;
}

export async function autoAssignLessonsToUnlinkedEvents({
  familyId,
  subjectId,
  subjectEvents = [],
  units = [],
  limit = 20,
}) {
  if (!familyId || !subjectId) return { assigned: 0, scheduled: [] };
  const pairs = pairLessonsWithUnlinkedEvents({ subjectEvents, units, limit });
  if (!pairs.length) return { assigned: 0, scheduled: [] };

  const results = await Promise.allSettled(
    pairs.map(async ({ lesson, event, dateLabel }) => {
      if (!event?.id) throw new Error('Missing event');
      await linkLessonToEvent({
        eventId: event.id,
        familyId,
        lessonId: lesson.lessonId,
        unitTitle: lesson.unitTitle,
        lessonTitle: lesson.lessonTitle,
      });
      return {
        lessonId: lesson.lessonId,
        lessonTitle: lesson.lessonTitle,
        unitTitle: lesson.unitTitle,
        dateLabel,
        eventId: event.id,
      };
    }),
  );

  const scheduled = results
    .filter((row) => row.status === 'fulfilled' && row.value)
    .map((row) => row.value);
  const failed = results.filter((row) => row.status === 'rejected');
  if (failed.length && typeof console !== 'undefined') {
    console.warn(
      '[autoAssignLessonsToUnlinkedEvents] link failures',
      failed.map((row) => row.reason?.message || row.reason),
    );
  }
  return { assigned: scheduled.length, scheduled };
}

export function formatUnlinkedSessionLine(entry) {
  if (!entry?.dateLabel) return 'Upcoming session';
  return entry.dateLabel;
}

/**
 * Load open learning-day rows for a subject (same pool Classwork shows).
 * Note: `start_local` is NOT an events column — never select it here.
 */
export async function loadSubjectLearningDayEvents({ familyId, subjectId }) {
  if (!familyId || subjectId == null || String(subjectId).trim() === '') return [];
  const sid = String(subjectId).trim();
  const selectCols = [
    'id',
    'subject_id',
    'event_type',
    'start_ts',
    'due_ts',
    'status',
    'is_backlog',
    'curriculum_lesson_id',
    'lesson',
    'curriculum_metadata',
    'generated_by',
    'academic_year_id',
  ].join(', ');

  const primaryQuery = supabase
    .from('events')
    .select(selectCols)
    .eq('family_id', familyId)
    .eq('subject_id', sid)
    .is('deleted_at', null)
    .is('canceled_at', null);

  const linkedQuery = supabase
    .from('events')
    .select(selectCols)
    .eq('family_id', familyId)
    .contains('curriculum_metadata', { subject_ids: [sid] })
    .is('deleted_at', null)
    .is('canceled_at', null);

  const [primaryResult, linkedResult] = await Promise.all([primaryQuery, linkedQuery]);
  if (primaryResult.error) throw primaryResult.error;

  const mergedById = new Map();
  [...(primaryResult.data || []), ...(linkedResult.data || [])].forEach((row) => {
    const id = row?.id != null ? String(row.id).trim() : '';
    if (!id || mergedById.has(id)) return;
    mergedById.set(id, row);
  });

  return Array.from(mergedById.values()).filter((ev) => {
    if (ev?.status === 'canceled' || ev?.is_backlog) return false;
    // Inline Learning-day check to avoid circular import with plannerLearningDayChip.
    const typeLower = String(ev?.event_type || '').trim().toLowerCase();
    const learningTypes = new Set([
      'lesson',
      'schedule block',
      'scheduled class day',
      'classday',
      'class day',
    ]);
    const generatedByPlan = String(ev?.generated_by || '').toLowerCase() === 'plan_year';
    const hasAcademicYear = !!ev?.academic_year_id;
    if (learningTypes.has(typeLower)) return true;
    if ((generatedByPlan || hasAcademicYear) && (!typeLower || learningTypes.has(typeLower))) {
      return true;
    }
    return false;
  });
}

/** Map commit-manual-draft response ids onto the draft unit/lesson tree for immediate assign. */
export function unitsFromManualCommitResponse(draft, commitData) {
  const lessonIds = Array.isArray(commitData?.lesson_ids) ? commitData.lesson_ids : [];
  const unitIds = Array.isArray(commitData?.unit_ids) ? commitData.unit_ids : [];
  let lessonIdx = 0;
  return (draft?.units || []).map((unit, ui) => ({
    id: unitIds[ui] != null ? String(unitIds[ui]) : unit?.id,
    title: String(unit?.title || '').trim() || `Unit ${ui + 1}`,
    lessons: (unit?.lessons || []).map((lesson, li) => {
      const id = lessonIds[lessonIdx];
      lessonIdx += 1;
      return {
        id: id != null ? String(id) : null,
        title: String(lesson?.title || '').trim() || `Lesson ${li + 1}`,
      };
    }).filter((row) => row.id && row.title),
  })).filter((unit) => (unit.lessons || []).length > 0);
}
