import { supabase } from './supabase';
import { createAssignment, updateAssignment } from './services/assignmentsClient';
import { assignmentRowLinksEventId } from './assignmentLinkedEventUtils';
import { getChildIdsFromEvent, dispatchAssignmentRefreshEvents } from './assignmentWorkflowClient';
import {
  eventDueYmd,
  isWorkProducingEventType,
  normalizeWorkEventType,
} from './workEventHelpers';

async function findAssignmentForChild({ familyId, childId, eventId }) {
  const { data: rows, error } = await supabase
    .from('assignments')
    .select('id, title, linked_event_ids, child_id, status, review_status, progress_percent, grade_display, grade_value, submitted_at')
    .eq('family_id', familyId)
    .eq('child_id', childId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (rows || []).find((row) => assignmentRowLinksEventId(row, eventId)) || null;
}

/**
 * Create or update one assignment row per assigned child when a work-producing event is saved.
 * Event date is the due date (no separate submission due date).
 */
export async function ensureAssignmentsForEvent({
  familyId,
  event,
  childIds = null,
  workSpec = null,
  userId = null,
}) {
  if (!familyId || !event?.id) return { created: 0, updated: 0 };
  const eventType = normalizeWorkEventType(event.event_type);
  if (!isWorkProducingEventType(eventType)) return { created: 0, updated: 0 };

  const eventIdStr = String(event.id);
  const targetChildIds = (Array.isArray(childIds) && childIds.length > 0
    ? childIds
    : getChildIdsFromEvent(event)
  ).map(String).filter(Boolean);
  if (targetChildIds.length === 0) return { created: 0, updated: 0 };

  const dueYmd = eventDueYmd(event);
  const title = String(event.title || 'Schoolwork').trim().slice(0, 200);
  const instructions = String(workSpec?.instructions || event.description || '').trim() || null;
  const subjectId = event.subject_id || null;

  let uid = userId;
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data?.user?.id || null;
  }

  let created = 0;
  let updated = 0;

  for (const childId of targetChildIds) {
    const existing = await findAssignmentForChild({ familyId, childId, eventId: eventIdStr });
    if (existing?.id) {
      const patch = {
        title,
        due_date: dueYmd,
        related_subject: subjectId,
      };
      if (instructions != null) patch.description = instructions;
      const { error } = await updateAssignment(existing.id, patch);
      if (error) throw error;
      updated += 1;
      continue;
    }

    const { error: insErr } = await createAssignment({
      family_id: familyId,
      child_id: childId,
      title,
      description: instructions,
      assigned_by: uid,
      related_subject: subjectId,
      due_date: dueYmd,
      status: 'not_started',
      linked_event_ids: [eventIdStr],
      need_help: false,
    });
    if (insErr) throw insErr;
    created += 1;
  }

  if (created > 0 || updated > 0) {
    dispatchAssignmentRefreshEvents();
  }

  return { created, updated };
}

export async function fetchUpcomingWorkForChild({
  familyId,
  childId,
  horizonDays = 30,
  limit = 12,
}) {
  if (!familyId || !childId) return [];

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const horizon = new Date(dayStart);
  horizon.setDate(horizon.getDate() + horizonDays);
  horizon.setHours(23, 59, 59, 999);

  const childIdStr = String(childId);
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, title, start_ts, end_ts, date_local, event_type, subject_id, child_id, child_ids, work_spec, status')
    .eq('family_id', familyId)
    .or(`child_id.eq.${childIdStr},child_ids.cs.{${childIdStr}}`)
    .gte('start_ts', dayStart.toISOString())
    .lte('start_ts', horizon.toISOString())
    .neq('status', 'canceled')
    .is('canceled_at', null)
    .is('deleted_at', null)
    .order('start_ts', { ascending: true })
    .limit(80);

  if (eventsError) throw eventsError;

  const workEvents = (events || []).filter((row) => isWorkProducingEventType(row.event_type));
  if (workEvents.length === 0) return [];

  const { data: assignments, error: assignError } = await supabase
    .from('assignments')
    .select('id, child_id, status, review_status, submitted_at, progress_percent, grade_display, grade_value, linked_event_ids, need_help, due_date, title')
    .eq('family_id', familyId)
    .eq('child_id', childIdStr)
    .order('updated_at', { ascending: false })
    .limit(300);

  if (assignError) throw assignError;

  const assignmentByEventId = new Map();
  (assignments || []).forEach((row) => {
    const raw = row?.linked_event_ids;
    const ids = Array.isArray(raw) ? raw : [];
    ids.forEach((id) => {
      const key = String(id);
      if (!assignmentByEventId.has(key)) assignmentByEventId.set(key, row);
    });
  });

  const needsRevision = [];
  const upcoming = [];

  workEvents.forEach((eventRow) => {
    const assignment = assignmentByEventId.get(String(eventRow.id)) || null;
    const item = { event: eventRow, assignment, workSpec: eventRow.work_spec || {} };
    const review = String(assignment?.review_status || '').toLowerCase();
    if (review === 'needs_revision' || review === 'rejected') {
      needsRevision.push(item);
    } else {
      upcoming.push(item);
    }
  });

  const combined = [...needsRevision, ...upcoming];
  return combined.slice(0, limit);
}

export async function updateAssignmentProgress(assignmentId, progressPercent) {
  const value = Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0)));
  const status = value > 0 ? 'in_progress' : 'not_started';
  const { error } = await updateAssignment(assignmentId, {
    progress_percent: value,
    status,
  });
  if (error) throw error;
  dispatchAssignmentRefreshEvents();
}

export async function reviewAssignmentWork({
  assignmentId,
  action,
  feedback = '',
  gradeDisplay = null,
  gradeValue = null,
  reviewerId = null,
}) {
  if (!assignmentId) throw new Error('Missing assignment');
  const patch = {
    review_feedback: feedback?.trim() || null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: reviewerId || null,
  };

  if (action === 'approve') {
    patch.review_status = 'approved';
    patch.status = 'reviewed';
  } else if (action === 'send_back') {
    patch.review_status = 'needs_revision';
    patch.status = 'in_progress';
  } else if (action === 'grade') {
    patch.review_status = 'approved';
    patch.status = 'reviewed';
    if (gradeDisplay != null) patch.grade_display = String(gradeDisplay);
    if (gradeValue != null && Number.isFinite(Number(gradeValue))) {
      patch.grade_value = Number(gradeValue);
    }
  }

  const { error } = await updateAssignment(assignmentId, patch);
  if (error) throw error;
  dispatchAssignmentRefreshEvents();
}
