import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { assignmentRowLinksEventId } from '../assignmentLinkedEventUtils';
import { deleteEvent, updateEvent } from '../services/plannerClientWithOffline';
import { ensureAssignmentsForEvent } from '../workAssignmentClient';
import { parseWorkSpec, normalizeWorkEventType } from '../workEventHelpers';
import { computeEventTimes } from './eventTimeUtils';
import { dispatchAssignmentRefreshEvents } from '../assignmentWorkflowClient';
import { updateAssignmentPlacement } from '../services/assignmentPlacementClient';

export function resolveLinkedEventIdFromAssignment(assignment) {
  const raw = assignment?.linked_event_ids;
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
    } catch (_) {
      /* ignore */
    }
  }
  return assignment?.linked_event_id || assignment?.event_id || null;
}

export async function fetchEventForAssignmentEdit(eventId) {
  if (!eventId) return null;
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function fetchAssignmentsForEvent({ familyId, eventId }) {
  if (!familyId || !eventId) return [];
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('family_id', familyId)
    .order('updated_at', { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data || []).filter((row) => assignmentRowLinksEventId(row, eventId));
}

export async function fetchPrimaryAssignmentForEvent({ familyId, eventId, childId = null }) {
  const rows = await fetchAssignmentsForEvent({ familyId, eventId });
  if (rows.length === 0) return null;
  if (childId) {
    return rows.find((row) => String(row.child_id) === String(childId)) || rows[0];
  }
  return rows[0];
}

export function assignmentEditFormFromEvent(event, assignment = null) {
  if (!event) {
    return {
      title: '',
      instructions: '',
      workSpec: parseWorkSpec(null, 'Assignment'),
      materialId: null,
      assigneeIds: [],
      subjectId: null,
      dueDate: null,
      points: '',
      rubricId: null,
      eventId: null,
      unitId: null,
      unitTitle: '',
      curriculumLessonId: null,
      lessonLabel: '',
    };
  }

  const workSpec = parseWorkSpec(event.work_spec, event.event_type || 'Assignment');
  const childIds = Array.isArray(event.child_ids) && event.child_ids.length > 0
    ? event.child_ids.map((id) => String(id))
    : (event.child_id ? [String(event.child_id)] : []);
  const materialIds = Array.isArray(event.materials_attachment_ids)
    ? event.materials_attachment_ids
    : [];
  const dueRaw = event.start_ts || event.date_local || event.start_local;
  const dueDate = dueRaw
    ? new Date(String(dueRaw).includes('T') ? dueRaw : `${String(dueRaw).slice(0, 10)}T12:00:00`)
    : null;
  const meta = event.curriculum_metadata && typeof event.curriculum_metadata === 'object'
    ? event.curriculum_metadata
    : {};

  return {
    title: String(event.title || ''),
    instructions: String(workSpec.instructions || event.description || ''),
    workSpec,
    materialId: materialIds[0] || event.material_id || null,
    assigneeIds: childIds,
    subjectId: event.subject_id || null,
    dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
    points: workSpec.points_possible != null && workSpec.points_possible !== ''
      ? String(workSpec.points_possible)
      : '',
    rubricId: workSpec.rubric_id || null,
    eventId: event.id,
    unitId: assignment?.related_syllabus_unit != null
      ? String(assignment.related_syllabus_unit)
      : null,
    unitTitle: String(event.curriculum_unit_title || event.unit || '').trim(),
    curriculumLessonId: event.curriculum_lesson_id != null ? String(event.curriculum_lesson_id) : null,
    lessonLabel: String(event.lesson || meta.lesson_label || '').trim(),
  };
}

function dispatchRefresh(subjectId) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('refreshCalendar'));
    window.dispatchEvent(new CustomEvent('refreshSubjects'));
    if (subjectId) {
      window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
    }
  }
  dispatchAssignmentRefreshEvents();
}

export async function updateAssignmentFromEditForm({
  eventId,
  familyId,
  title,
  childIds,
  subjectId,
  instructions = '',
  workSpecInput = null,
  dueDate = null,
  materialIds = [],
  points = null,
  rubricId = null,
  unitId = null,
  unitTitle = '',
  curriculumLessonId = null,
  lessonLabel = '',
  assignment = null,
}) {
  if (!eventId || !familyId) throw new Error('Missing assignment event');

  const workSpec = parseWorkSpec(
    {
      ...(workSpecInput || {}),
      instructions: instructions?.trim() || '',
      rubric_id: rubricId || workSpecInput?.rubric_id || null,
      points_possible: Number(points) || null,
    },
    'Assignment',
  );

  const scheduleDate = dueDate || new Date();
  const times = computeEventTimes({ date: scheduleDate, startTime: '', endTime: '', allDay: true });
  const startTs = times.start?.toISOString() || new Date().toISOString();
  const endTs = times.end?.toISOString() || startTs;
  const ids = (Array.isArray(childIds) ? childIds : []).filter(Boolean).map(String);

  const updates = {
    title: String(title || '').trim(),
    description: instructions?.trim() || null,
    child_id: ids[0] || null,
    child_ids: ids,
    subject_id: subjectId || null,
    start_ts: startTs,
    end_ts: endTs,
    date_local: String(startTs).slice(0, 10),
    materials_attachment_ids: materialIds.length > 0 ? materialIds : null,
    material_id: materialIds[0] || null,
    work_spec: workSpec,
    event_type: 'Assignment',
    is_flexible: false,
    all_day: true,
    curriculum_unit_title: unitTitle?.trim() || null,
    unit: unitTitle?.trim() || null,
    lesson: lessonLabel?.trim() || null,
    curriculum_lesson_id: curriculumLessonId || null,
    curriculum_metadata: lessonLabel?.trim() ? { lesson_label: lessonLabel.trim() } : {},
  };

  const { error } = await updateEvent(eventId, updates, familyId);
  if (error) throw error;

  const { data: updated, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (fetchError) throw fetchError;

  await ensureAssignmentsForEvent({
    familyId,
    event: updated,
    childIds: ids,
    workSpec,
  });

  const linkedAssignments = assignment?.id
    ? [assignment]
    : await fetchAssignmentsForEvent({ familyId, eventId });
  await Promise.all(
    (linkedAssignments || []).map((row) =>
      updateAssignmentPlacement({
        assignmentId: row.id,
        familyId,
        unitId: unitId || null,
        lessonId: curriculumLessonId || null,
        lessonTitle: lessonLabel || null,
        unitTitle: unitTitle || null,
        linkedEventIds: [eventId],
      }),
    ),
  );

  dispatchRefresh(subjectId);
  return updated;
}

export async function deleteAssignmentAndEvent({ eventId, familyId, subjectId = null }) {
  if (!eventId || !familyId) throw new Error('Missing assignment event');

  const linked = await fetchAssignmentsForEvent({ familyId, eventId });
  for (const row of linked) {
    if (!row?.id) continue;
    await supabase.from('assignments').delete().eq('id', row.id);
  }

  const { error } = await deleteEvent(eventId, familyId);
  if (error) throw error;

  dispatchRefresh(subjectId);
}

export function isAssignmentEventType(eventType) {
  return normalizeWorkEventType(eventType) === 'Assignment';
}

export function isWorkAssignmentEditEvent(eventType) {
  const type = normalizeWorkEventType(eventType);
  return type === 'Assignment' || type === 'Project' || type === 'Exam';
}
