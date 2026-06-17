import { supabase } from './supabase';
import { updateEvent } from './services/plannerClientWithOffline';

export function eventHasLinkedLesson(event) {
  if (!event) return false;
  if (event.curriculum_lesson_id) return true;
  const lesson = String(event.lesson || '').trim();
  const meta = event?.curriculum_metadata && typeof event.curriculum_metadata === 'object'
    ? event.curriculum_metadata
    : {};
  return Boolean(lesson || String(meta?.lesson_label || '').trim());
}

export function getEventStartDate(event) {
  const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function getUnlinkedUpcomingEvents(subjectEvents = [], { limit = 5 } = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (subjectEvents || [])
    .filter((event) => event?.status !== 'canceled' && !event?.is_backlog)
    .filter((event) => !eventHasLinkedLesson(event))
    .map((event) => ({ event, date: getEventStartDate(event) }))
    .filter(({ date }) => date && date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, limit)
    .map(({ event, date }) => ({
      event,
      dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
  const unit = String(unitTitle || '').trim() || null;
  const lesson = String(lessonTitle || '').trim() || null;
  const { error } = await updateEvent(
    eventId,
    {
      curriculum_lesson_id: String(lessonId),
      curriculum_unit_title: unit,
      unit,
      lesson,
      curriculum_metadata: lesson ? { lesson_label: lesson } : {},
    },
    familyId
  );
  if (error) throw error;
  return true;
}

export async function unlinkLessonFromEvents({ familyId, lessonId, exceptEventId = null }) {
  if (!familyId || !lessonId) return;
  const { data: events, error } = await supabase
    .from('events')
    .select('id')
    .eq('family_id', familyId)
    .eq('curriculum_lesson_id', String(lessonId));
  if (error || !events?.length) return;
  await Promise.all(
    events
      .filter((row) => !exceptEventId || String(row.id) !== String(exceptEventId))
      .map((row) => updateEvent(
        row.id,
        {
          curriculum_lesson_id: null,
          curriculum_unit_title: null,
          unit: null,
          lesson: null,
          curriculum_metadata: {},
        },
        familyId,
      )),
  );
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
  const unlinked = getUnlinkedUpcomingEvents(subjectEvents, { limit });
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
  const scheduled = [];
  let assigned = 0;
  for (const { lesson, event, dateLabel } of pairs) {
    if (!event?.id) continue;
    try {
      await linkLessonToEvent({
        eventId: event.id,
        familyId,
        lessonId: lesson.lessonId,
        unitTitle: lesson.unitTitle,
        lessonTitle: lesson.lessonTitle,
      });
      assigned += 1;
      scheduled.push({
        lessonId: lesson.lessonId,
        lessonTitle: lesson.lessonTitle,
        unitTitle: lesson.unitTitle,
        dateLabel,
        eventId: event.id,
      });
    } catch (_) {}
  }
  return { assigned, scheduled };
}

export function formatUnlinkedSessionLine(entry) {
  if (!entry?.dateLabel) return 'Upcoming session';
  return entry.dateLabel;
}
