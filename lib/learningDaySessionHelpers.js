import { supabase } from './supabase';
import { assignmentRowLinksEventId } from './assignmentLinkedEventUtils';
import { dispatchAssignmentRefreshEvents } from './assignmentWorkflowClient';
import { updateAssignment } from './services/assignmentsClient';
import { rescheduleEvent, updateEvent } from './services/plannerClientWithOffline';
import { toYmd } from './create/eventTimeUtils';
import { normalizeHm } from './subjectConfigureSchedule';
import { getEventStartDate, eventHasLinkedLesson } from './subjectLessonLinking';
import { resolveLearningDayDurationMinutes } from './planner/learningDayModalNavigation';

const ASSIGNMENT_SELECT =
  'id, title, description, child_id, due_date, start_work_by, linked_event_ids, status, review_status, related_subject, updated_at';

export function parseLinkedEventIds(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch (_) {}
  }
  return [];
}

export async function fetchSubjectAssignmentsForLearningDay({ familyId, subjectId }) {
  if (!familyId || !subjectId) return [];
  const { data, error } = await supabase
    .from('assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('family_id', familyId)
    .eq('related_subject', String(subjectId))
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export function partitionAssignmentsForLearningDay({ assignments = [], event, eventId }) {
  const id = eventId || event?.id;
  const linked = [];
  const dueOnDay = [];
  const available = [];
  const sessionDate = getEventStartDate(event);
  const sessionYmd = sessionDate ? toYmd(sessionDate) : null;

  (assignments || []).forEach((row) => {
    if (!row?.id) return;
    if (assignmentRowLinksEventId(row, id)) {
      linked.push(row);
      return;
    }
    const dueYmd = row.due_date ? String(row.due_date).slice(0, 10) : null;
    if (sessionYmd && dueYmd === sessionYmd) {
      dueOnDay.push(row);
      return;
    }
    if (parseLinkedEventIds(row.linked_event_ids).length === 0) {
      available.push(row);
    }
  });

  return { linked, dueOnDay, available };
}

export function eventStartTimeHm(event) {
  const raw = event?.start_ts || event?.start || event?.start_local;
  if (!raw) return '09:00';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '09:00';
  return normalizeHm(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
}

export function isLearningDaySessionSkipped(event) {
  return String(event?.status || '').trim().toLowerCase() === 'canceled';
}

export async function applyLearningDayTimeOverride({
  eventId,
  familyId,
  event,
  startTimeHm,
  durationMinutes,
}) {
  if (!eventId || !familyId) throw new Error('Missing session');
  const sessionDate = getEventStartDate(event);
  if (!sessionDate) throw new Error('Missing session date');

  const hm = normalizeHm(startTimeHm);
  const [hours, minutes] = hm.split(':').map((part) => parseInt(part, 10));
  const newStart = new Date(sessionDate);
  newStart.setHours(hours, minutes, 0, 0);

  const mins = Math.max(
    15,
    Number(durationMinutes) || resolveLearningDayDurationMinutes(event) || 60,
  );
  const newEnd = new Date(newStart.getTime() + mins * 60000);

  const { data, error } = await rescheduleEvent(
    eventId,
    newStart.toISOString(),
    newEnd.toISOString(),
    'learning_day_modal',
    'Single session time change',
    familyId,
  );
  if (error) throw error;
  return {
    start_ts: newStart.toISOString(),
    end_ts: newEnd.toISOString(),
    minutes: mins,
    data,
  };
}

export async function skipLearningDaySession({ eventId, familyId, event = null }) {
  if (!eventId || !familyId) throw new Error('Missing session');
  const patch = {
    status: 'canceled',
    canceled_at: new Date().toISOString(),
  };
  if (eventHasLinkedLesson(event)) {
    Object.assign(patch, {
      curriculum_lesson_id: null,
      curriculum_unit_title: null,
      unit: null,
      lesson: null,
      curriculum_metadata: {},
    });
  }
  const { error } = await updateEvent(eventId, patch, familyId);
  if (error) throw error;
  return { unlinkedLesson: eventHasLinkedLesson(event) };
}

export async function restoreLearningDaySession({ eventId, familyId }) {
  if (!eventId || !familyId) throw new Error('Missing session');
  const { error } = await updateEvent(
    eventId,
    {
      status: 'scheduled',
      canceled_at: null,
    },
    familyId,
  );
  if (error) throw error;
  return true;
}

export async function linkAssignmentToLearningDay({
  assignment,
  eventId,
  event,
}) {
  if (!assignment?.id || !eventId) throw new Error('Missing assignment or session');
  const existing = parseLinkedEventIds(assignment.linked_event_ids);
  if (existing.includes(String(eventId))) return assignment;

  const sessionDate = getEventStartDate(event);
  const dueYmd = sessionDate ? toYmd(sessionDate) : null;
  const patch = {
    linked_event_ids: [...existing, String(eventId)],
  };
  if (dueYmd) patch.due_date = dueYmd;

  const { data, error } = await updateAssignment(assignment.id, patch);
  if (error) throw error;
  dispatchAssignmentRefreshEvents();
  return data;
}

export async function unlinkAssignmentFromLearningDay({ assignment, eventId }) {
  if (!assignment?.id || !eventId) throw new Error('Missing assignment or session');
  const nextIds = parseLinkedEventIds(assignment.linked_event_ids)
    .filter((id) => String(id) !== String(eventId));
  const { data, error } = await updateAssignment(assignment.id, {
    linked_event_ids: nextIds,
  });
  if (error) throw error;
  dispatchAssignmentRefreshEvents();
  return data;
}
