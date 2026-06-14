import { getEventStartDate } from './subjectLessonLinking';

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

function formatScheduleLabel(event) {
  const date = getEventStartDate(event);
  if (!date) return null;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
        dateLabel: formatScheduleLabel(event),
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
  const lessonScheduleById = buildLessonScheduleMap(events);
  const eventById = buildEventById(events);
  const lessonToUnitId = new Map();
  const unitIdSet = new Set();

  const unitSections = (units || []).map((unit, index) => {
    const unitId = unit?.id != null ? String(unit.id) : `idx-${index}`;
    unitIdSet.add(unitId);
    const lessons = (unit?.lessons || []).map((lesson, li) => {
      const lessonId = lesson?.id != null ? String(lesson.id).trim() : `u${index}-l${li}`;
      if (lesson?.id != null) lessonToUnitId.set(String(lesson.id).trim(), unitId);
      const schedule = lessonScheduleById.get(String(lesson.id).trim()) || null;
      return {
        lessonId: lesson?.id != null ? String(lesson.id) : null,
        title: String(lesson?.title || '').trim() || `Lesson ${li + 1}`,
        schedule,
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

  (assignments || []).forEach((assignment) => {
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
    unscheduledLessonCount: unitSections.reduce(
      (sum, unit) => sum + unit.lessons.filter((l) => l.lessonId && !l.schedule).length,
      0,
    ),
  };
}

/** Flat peer list: each lesson followed by its attached assignments, then unit-level assignments. */
export function buildUnitPeerItems(unit, eventById = null) {
  const items = [];
  (unit?.lessons || []).forEach((lesson) => {
    items.push({ kind: 'lesson', lesson });
    (lesson.assignments || []).forEach((assignment) => {
      items.push({
        kind: 'assignment',
        assignment,
        attachedLessonTitle: lesson.title,
        attachedLessonId: lesson.lessonId,
        learningDay: eventById ? resolveAssignmentLearningDay(assignment, eventById) : null,
      });
    });
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
