import { getEventStartDate } from './subjectLessonLinking';
import { isPlannerLearningDayEvent } from './planner/plannerLearningDayChip';
import { isPersistedCurriculumId } from './curriculumIds';

function parseLinkedEventIds(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (_) {}
  }
  return [];
}

/** One classwork row per assignment id and per primary linked event (avoids duplicate cards). */
function dedupeAssignmentsForClasswork(assignments = []) {
  const seenIds = new Set();
  const byPrimaryEventId = new Map();
  const withoutLinkedEvent = [];

  (assignments || []).forEach((assignment) => {
    if (!assignment?.id) return;
    const assignmentId = String(assignment.id);
    if (seenIds.has(assignmentId)) return;
    seenIds.add(assignmentId);

    const linkedIds = parseLinkedEventIds(assignment.linked_event_ids);
    const primaryEventId = linkedIds[0] || null;
    if (!primaryEventId) {
      withoutLinkedEvent.push(assignment);
      return;
    }

    const existing = byPrimaryEventId.get(primaryEventId);
    if (!existing) {
      byPrimaryEventId.set(primaryEventId, assignment);
      return;
    }

    const existingTs = Date.parse(existing.updated_at || existing.created_at || '') || 0;
    const nextTs = Date.parse(assignment.updated_at || assignment.created_at || '') || 0;
    if (nextTs >= existingTs) {
      byPrimaryEventId.set(primaryEventId, assignment);
    }
  });

  return [...withoutLinkedEvent, ...byPrimaryEventId.values()];
}

function formatScheduleLabel(event) {
  const date = getEventStartDate(event);
  if (!date) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatLearningDayBucketLabel(event) {
  const date = getEventStartDate(event);
  if (!date) return null;
  const datePart = date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const raw = event?.start_ts || event?.start || event?.start_local;
  if (!raw) return datePart;
  const timeDate = new Date(raw);
  if (Number.isNaN(timeDate.getTime())) return datePart;
  const timePart = timeDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} · ${timePart}`;
}

function buildUnlinkedLearningDays(events = [], { upcomingOnly = true } = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = (events || [])
    .filter((event) => {
      if (!isPlannerLearningDayEvent(event)) return false;
      // Only a real curriculum lesson FK counts as “linked”. Lesson title / lesson_label
      // alone (e.g. Doodle “cinematography learning day”) must still appear as empty slots.
      const lessonId = event?.curriculum_lesson_id != null
        ? String(event.curriculum_lesson_id).trim()
        : '';
      if (lessonId && isPersistedCurriculumId(lessonId)) return false;
      if (event?.status === 'canceled' || event?.is_backlog) return false;
      return true;
    })
    .map((event) => {
      const date = getEventStartDate(event);
      return {
        event,
        eventId: event.id,
        date,
        dateLabel: formatLearningDayBucketLabel(event),
      };
    })
    .filter(({ date }) => date)
    .filter(({ date }) => !upcomingOnly || date >= today);

  return rows.sort((a, b) => {
    const aTime = a.date.getTime();
    const bTime = b.date.getTime();
    const aPast = aTime < today.getTime();
    const bPast = bTime < today.getTime();
    if (aPast !== bPast) return aPast ? 1 : -1;
    if (aPast) return bTime - aTime;
    return aTime - bTime;
  });
}

export function resolveAssignmentLearningDay(assignment, eventById) {
  const linkedIds = parseLinkedEventIds(assignment?.linked_event_ids);
  for (const eid of linkedIds) {
    const event = eventById?.get?.(String(eid));
    if (!event || event.status === 'canceled' || event.is_backlog) continue;
    const dateLabel = formatScheduleLabel(event);
    if (dateLabel) {
      return { event, eventId: event.id, dateLabel };
    }
  }
  return null;
}

function buildLessonLearningDaysMap(events = []) {
  const map = new Map();
  (events || []).forEach((event) => {
    if (!event || event.status === 'canceled' || event.is_backlog) return;
    if (!isPlannerLearningDayEvent(event)) return;
    const lessonId = event.curriculum_lesson_id != null ? String(event.curriculum_lesson_id).trim() : '';
    if (!lessonId) return;
    const date = getEventStartDate(event);
    const row = {
      event,
      eventId: event.id,
      date,
      dateLabel: formatLearningDayBucketLabel(event) || formatScheduleLabel(event),
    };
    if (!map.has(lessonId)) map.set(lessonId, []);
    map.get(lessonId).push(row);
  });
  map.forEach((rows) => {
    rows.sort((a, b) => {
      const aTime = a.date?.getTime?.() ?? 0;
      const bTime = b.date?.getTime?.() ?? 0;
      return aTime - bTime;
    });
  });
  return map;
}

function buildLessonScheduleMap(events = []) {
  const map = new Map();
  (events || []).forEach((event) => {
    if (!event || event.status === 'canceled' || event.is_backlog) return;
    const lessonId = event.curriculum_lesson_id != null ? String(event.curriculum_lesson_id).trim() : '';
    if (!lessonId) return;
    const existing = map.get(lessonId);
    const date = getEventStartDate(event);
    if (!existing || (date && !getEventStartDate(existing.event))) {
      map.set(lessonId, {
        event,
        eventId: event.id,
        dateLabel: formatLearningDayBucketLabel(event) || formatScheduleLabel(event),
      });
    }
  });
  return map;
}

function buildEventById(events = []) {
  const map = new Map();
  (events || []).forEach((event) => {
    if (event?.id) map.set(String(event.id), event);
  });
  return map;
}

function resolveAssignmentPlacement(assignment, { eventById, lessonToUnitId, unitIdSet }) {
  const linkedIds = parseLinkedEventIds(assignment?.linked_event_ids);
  for (const eid of linkedIds) {
    const event = eventById.get(String(eid));
    const lessonId = event?.curriculum_lesson_id != null ? String(event.curriculum_lesson_id).trim() : '';
    if (lessonId && lessonToUnitId.has(lessonId)) {
      return { unitId: lessonToUnitId.get(lessonId), lessonId, via: 'event' };
    }
  }
  const unitId = assignment?.related_syllabus_unit != null ? String(assignment.related_syllabus_unit).trim() : '';
  if (unitId && unitIdSet.has(unitId)) {
    return { unitId, lessonId: null, via: 'unit' };
  }
  return { unitId: null, lessonId: null, via: 'none' };
}

/**
 * Google Classroom–style classwork tree for a subject.
 */
export function buildSubjectClassworkModel({ units = [], assignments = [], events = [] }) {
  const normalizedAssignments = dedupeAssignmentsForClasswork(assignments);
  const lessonScheduleById = buildLessonScheduleMap(events);
  const lessonLearningDaysById = buildLessonLearningDaysMap(events);
  const eventById = buildEventById(events);
  const lessonToUnitId = new Map();
  const unitIdSet = new Set();

  const unitSections = (units || []).map((unit, index) => {
    const unitId = unit?.id != null ? String(unit.id) : `idx-${index}`;
    unitIdSet.add(unitId);
    const lessons = (unit?.lessons || []).map((lesson, li) => {
      const rawLessonId = lesson?.id != null ? String(lesson.id).trim() : '';
      const lessonId = isPersistedCurriculumId(rawLessonId) ? rawLessonId : null;
      if (lessonId) lessonToUnitId.set(lessonId, unitId);
      const schedule = lessonId ? (lessonScheduleById.get(lessonId) || null) : null;
      const learningDays = lessonId
        ? (lessonLearningDaysById.get(lessonId) || [])
        : [];
      return {
        lessonId,
        title: String(lesson?.title || '').trim() || `Lesson ${li + 1}`,
        schedule,
        learningDays,
        assignments: [],
      };
    });
    return {
      unitId,
      title: String(unit?.title || '').trim() || `Unit ${index + 1}`,
      lessons,
      unitAssignments: [],
    };
  });

  const lessonRowById = new Map();
  unitSections.forEach((unit) => {
    unit.lessons.forEach((lesson) => {
      if (lesson.lessonId) lessonRowById.set(lesson.lessonId, lesson);
    });
  });

  const unitRowById = new Map(unitSections.map((u) => [u.unitId, u]));
  const noUnitAssignments = [];
  const placedIds = new Set();

  normalizedAssignments.forEach((assignment) => {
    if (!assignment?.id) return;
    const placement = resolveAssignmentPlacement(assignment, { eventById, lessonToUnitId, unitIdSet });
    if (placement.lessonId && lessonRowById.has(placement.lessonId)) {
      lessonRowById.get(placement.lessonId).assignments.push(assignment);
      placedIds.add(String(assignment.id));
      return;
    }
    if (placement.unitId && unitRowById.has(placement.unitId)) {
      unitRowById.get(placement.unitId).unitAssignments.push(assignment);
      placedIds.add(String(assignment.id));
      return;
    }
    noUnitAssignments.push(assignment);
  });

  return {
    noUnitAssignments,
    units: unitSections,
    lessonScheduleById,
    eventById,
    unlinkedLearningDays: buildUnlinkedLearningDays(events, { upcomingOnly: false }),
    unscheduledLessonCount: unitSections.reduce(
      (sum, unit) => sum + unit.lessons.filter((l) => l.lessonId && !l.schedule).length,
      0,
    ),
  };
}

/** Flat peer list: each lesson (with nested items rendered in UI), then unit-level assignments. */
export function buildUnitPeerItems(unit, eventById = null) {
  const items = [];
  (unit?.lessons || []).forEach((lesson) => {
    items.push({ kind: 'lesson', lesson });
  });
  (unit?.unitAssignments || []).forEach((assignment) => {
    items.push({
      kind: 'assignment',
      assignment,
      attachedLessonTitle: null,
      attachedLessonId: null,
      learningDay: eventById ? resolveAssignmentLearningDay(assignment, eventById) : null,
    });
  });
  return items;
}

export function buildNoUnitPeerItems(noUnitAssignments = [], eventById = null) {
  return (noUnitAssignments || []).map((assignment) => ({
    kind: 'assignment',
    assignment,
    attachedLessonTitle: null,
    attachedLessonId: null,
    learningDay: eventById ? resolveAssignmentLearningDay(assignment, eventById) : null,
  }));
}

export function flattenClassworkPlacementOptions(units = []) {
  const options = [{ key: 'none', label: 'No lesson', unitId: null, lessonId: null }];
  (units || []).forEach((unit, ui) => {
    const unitId = unit?.id != null ? String(unit.id) : null;
    const unitTitle = String(unit?.title || '').trim() || `Unit ${ui + 1}`;
    if (unitId) {
      options.push({ key: `unit-${unitId}`, label: unitTitle, unitId, lessonId: null });
    }
    (unit?.lessons || []).forEach((lesson, li) => {
      const lessonId = lesson?.id != null ? String(lesson.id).trim() : null;
      if (!lessonId) return;
      const lessonTitle = String(lesson?.title || '').trim() || `Lesson ${li + 1}`;
      options.push({
        key: `lesson-${lessonId}`,
        label: lessonTitle,
        unitId,
        lessonId,
      });
    });
  });
  return options;
}
