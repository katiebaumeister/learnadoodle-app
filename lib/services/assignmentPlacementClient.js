import { supabase } from '../supabase';
import { persistEventUpdate } from '../subjectLessonLinking';

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

function buildLessonLinkEventPatch({ lessonId, lessonTitle, unitTitle }) {
  const unit = String(unitTitle || '').trim() || null;
  const lesson = String(lessonTitle || '').trim() || null;
  return {
    curriculum_lesson_id: String(lessonId),
    curriculum_unit_title: unit,
    unit,
    lesson,
    curriculum_metadata: lesson ? { lesson_label: lesson } : {},
  };
}

function buildUnitOnlyEventPatch({ unitTitle }) {
  const unit = String(unitTitle || '').trim() || null;
  return {
    curriculum_lesson_id: null,
    curriculum_unit_title: unit,
    unit,
    lesson: null,
    curriculum_metadata: {},
  };
}

/**
 * Attach assignment to unit (related_syllabus_unit) and optionally lesson (via linked event curriculum_lesson_id).
 */
export async function updateAssignmentPlacement({
  assignmentId,
  familyId,
  unitId = null,
  lessonId = null,
  lessonTitle = null,
  unitTitle = null,
  linkedEventIds = [],
}) {
  if (!assignmentId) throw new Error('Missing assignment');

  const { error: assignError } = await supabase
    .from('assignments')
    .update({
      related_syllabus_unit: unitId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignmentId);

  if (assignError) throw assignError;

  const eventIds = parseLinkedEventIds(linkedEventIds);
  if (!familyId || eventIds.length === 0) return { ok: true };

  if (lessonId) {
    const patch = buildLessonLinkEventPatch({ lessonId, lessonTitle, unitTitle });
    await Promise.all(
      eventIds.map((eventId) => persistEventUpdate(eventId, familyId, patch)),
    );
  } else {
    const patch = buildUnitOnlyEventPatch({ unitTitle });
    await Promise.all(
      eventIds.map((eventId) => persistEventUpdate(eventId, familyId, patch)),
    );
  }

  return { ok: true };
}
