import { supabase } from '../supabase';
import { updateEvent } from './plannerClientWithOffline';

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
  if (lessonId && eventIds.length > 0) {
    await Promise.all(
      eventIds.map((eventId) =>
        updateEvent(eventId, {
          family_id: familyId,
          curriculum_lesson_id: String(lessonId),
          lesson: lessonTitle || null,
          unit: unitTitle || null,
        }),
      ),
    );
  } else if (!lessonId && eventIds.length > 0) {
    await Promise.all(
      eventIds.map((eventId) =>
        updateEvent(eventId, {
          family_id: familyId,
          curriculum_lesson_id: null,
        }),
      ),
    );
  }

  return { ok: true };
}
