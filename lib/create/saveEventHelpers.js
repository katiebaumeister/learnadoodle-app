/**
 * Shared create/save helpers for Calendar Event, Lesson, and Assignment modals.
 * Core objects: Subject → Units → Lessons, Material, Assignment, Event.
 */
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { ensureAssignmentsForEvent } from '../workAssignmentClient';
import { defaultWorkSpec, parseWorkSpec } from '../workEventHelpers';
import { computeEventTimes, toYmd } from './eventTimeUtils';

async function resolveFamilyId(familyId) {
  if (familyId) return familyId;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('User not authenticated');
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('family_id')
    .eq('id', user.id)
    .single();
  if (error || !profile?.family_id) throw new Error('Failed to fetch family information');
  return profile.family_id;
}

function childPayload(childIds) {
  const ids = (Array.isArray(childIds) ? childIds : []).filter(Boolean);
  return {
    childId: ids[0] || null,
    childIds: ids.length > 0 ? ids : null,
  };
}

async function invokeCreateTaskEvent(params) {
  const { data: rpcData, error: rpcError } = await supabase.rpc('create_task_event', params);
  if (rpcError || !rpcData?.ok) {
    throw new Error(rpcError?.message || rpcData?.error || 'Failed to create event');
  }
  const { data: eventData, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', rpcData.id)
    .single();
  if (fetchError) throw fetchError;
  return eventData;
}

function dispatchRefresh() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('refreshCalendar'));
  }
}

function dispatchSubjectRefresh(subjectId) {
  if (!subjectId || Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
}

export async function saveCalendarEvent({
  familyId,
  title,
  childIds,
  date,
  startTime = '',
  endTime = '',
  allDay = false,
  endDate = null,
  location = '',
  notes = '',
  materialIds = [],
  subjectId = null,
  countsTowardPlan = false,
  recurrenceRule = null,
  isBacklog = false,
}) {
  const userFamilyId = await resolveFamilyId(familyId);
  const { childId, childIds: payloadChildIds } = childPayload(childIds);

  let startTs;
  let endTs;
  let minutes = null;

  if (isBacklog) {
    const base = date instanceof Date ? date : new Date();
    base.setHours(12, 0, 0, 0);
    startTs = base.toISOString();
    endTs = new Date(base.getTime() + 30 * 60 * 1000).toISOString();
  } else {
    const times = computeEventTimes({ date, startTime, endTime, allDay });
    if (!times.start || !times.end) {
      throw new Error('Invalid date or time');
    }
    startTs = times.start.toISOString();
    endTs = times.end.toISOString();
    minutes = times.minutes;
  }

  const event = await invokeCreateTaskEvent({
    _family_id: userFamilyId,
    _child_id: childId,
    _child_ids: payloadChildIds,
    _title: String(title || '').trim(),
    _start_ts: startTs,
    _end_ts: endTs,
    _description: notes?.trim() || null,
    _status: 'scheduled',
    _source: 'manual',
    _tags: null,
    _is_flexible: false,
    _is_backlog: !!isBacklog,
    _event_type: 'Other',
    _subject_id: subjectId || null,
    _unit: null,
    _grade: null,
    _percent_of_total_grade: null,
    _location: location?.trim() || null,
    _mode: null,
    _instructor: null,
    _goal_link: null,
    _minutes: minutes,
    _materials_attachment_ids: materialIds?.length ? materialIds : null,
    _recurrence_rule: recurrenceRule ? JSON.stringify(recurrenceRule) : null,
  });

  const patch = {
    counts_toward_plan: countsTowardPlan !== false,
    subject_id: subjectId || null,
  };
  if (endDate && date) {
    patch.date_local = toYmd(date);
  }

  const { data: updated, error: patchError } = await supabase
    .from('events')
    .update(patch)
    .eq('id', event.id)
    .select('*')
    .single();
  if (patchError) throw patchError;

  if (!isBacklog) dispatchRefresh();
  return updated || { ...event, ...patch };
}

export async function saveLesson({
  familyId,
  title,
  childIds,
  subjectId,
  unitTitle = '',
  curriculumLessonId = null,
  lessonLabel = '',
  description = '',
  materialIds = [],
  durationMinutes = 60,
  objectives = '',
  delivery = '',
  scheduleMode = 'schedule_now',
  date = new Date(),
  startTime = '',
  endTime = '',
  sendToStudent = true,
}) {
  const userFamilyId = await resolveFamilyId(familyId);
  const { childId, childIds: payloadChildIds } = childPayload(childIds);
  const isBacklog = scheduleMode === 'backlog';
  const isUnscheduled = scheduleMode === 'unscheduled';

  let startTs;
  let endTs;
  let minutes = Number(durationMinutes) || 60;

  if (isUnscheduled || isBacklog) {
    const base = date instanceof Date ? date : new Date();
    base.setHours(12, 0, 0, 0);
    startTs = base.toISOString();
    endTs = new Date(base.getTime() + minutes * 60 * 1000).toISOString();
  } else {
    const times = computeEventTimes({ date, startTime, endTime, durationMinutes: minutes });
    if (!times.start || !times.end) throw new Error('Choose a date and valid times to schedule this lesson');
    startTs = times.start.toISOString();
    endTs = times.end.toISOString();
    minutes = times.minutes || minutes;
  }

  const curriculumMetadata = {
    objectives: objectives?.trim() || null,
    delivery: delivery?.trim() || null,
    send_to_student: sendToStudent !== false,
    lesson_label: lessonLabel?.trim() || title?.trim() || null,
  };

  const event = await invokeCreateTaskEvent({
    _family_id: userFamilyId,
    _child_id: childId,
    _child_ids: payloadChildIds,
    _title: String(title || '').trim(),
    _start_ts: startTs,
    _end_ts: endTs,
    _description: description?.trim() || null,
    _status: 'scheduled',
    _source: 'manual',
    _tags: null,
    _is_flexible: isUnscheduled,
    _is_backlog: isBacklog,
    _event_type: 'Lesson',
    _subject_id: subjectId || null,
    _unit: unitTitle?.trim() || null,
    _grade: null,
    _percent_of_total_grade: null,
    _location: null,
    _mode: delivery?.trim() || null,
    _instructor: null,
    _goal_link: null,
    _minutes: minutes,
    _materials_attachment_ids: materialIds?.length ? materialIds : null,
    _recurrence_rule: null,
  });

  const patch = {
    curriculum_metadata: curriculumMetadata,
    curriculum_unit_title: unitTitle?.trim() || null,
    lesson: lessonLabel?.trim() || title?.trim() || null,
    curriculum_lesson_id: curriculumLessonId || null,
    subject_id: subjectId || null,
    counts_toward_plan: true,
  };

  const { data: updated, error: patchError } = await supabase
    .from('events')
    .update(patch)
    .eq('id', event.id)
    .select('*')
    .single();
  if (patchError) throw patchError;

  if (scheduleMode === 'schedule_now') dispatchRefresh();
  return updated || { ...event, ...patch };
}

const ASSIGNMENT_TYPE_TO_EVENT = {
  Project: 'Project',
  Exam: 'Exam',
};

export async function saveAssignment({
  familyId,
  title,
  childIds,
  subjectId,
  instructions = '',
  assignmentType = 'Assignment',
  workSpecInput = null,
  availableDate = null,
  dueDate = null,
  gradingMode = 'ungraded',
  materialIds = [],
  allowResubmission = false,
  requireParentApproval = false,
  unitTitle = '',
  curriculumLessonId = null,
  lessonLabel = '',
  rubricId = null,
  points = null,
  milestoneDueDate = null,
  saveMode = 'assign',
  releaseDate = null,
}) {
  const userFamilyId = await resolveFamilyId(familyId);
  const { childId, childIds: payloadChildIds } = childPayload(childIds);
  const mode = String(saveMode || 'assign').trim().toLowerCase();
  const isDraft = mode === 'draft';
  const isScheduled = mode === 'schedule';
  const effectiveReleaseDate = isScheduled ? (releaseDate || availableDate) : availableDate;

  const eventType = ASSIGNMENT_TYPE_TO_EVENT[assignmentType] || 'Assignment';
  const baseSpec = defaultWorkSpec(eventType);
  const workSpec = parseWorkSpec(
    {
      ...baseSpec,
      ...(workSpecInput || {}),
      instructions: instructions?.trim() || '',
      graded: gradingMode !== 'ungraded',
      assignment_type: assignmentType,
      allow_resubmission: !!allowResubmission,
      require_parent_approval: !!requireParentApproval,
      grading_mode: gradingMode,
      suggested_start_mode: effectiveReleaseDate ? 'custom' : 'auto',
      suggested_start_date: effectiveReleaseDate ? toYmd(effectiveReleaseDate) : null,
      rubric_id: rubricId || workSpecInput?.rubric_id || null,
      points_possible: points || workSpecInput?.points_possible || null,
      milestone_due_date: milestoneDueDate ? toYmd(milestoneDueDate) : null,
    },
    eventType,
  );

  let startTs;
  let endTs;
  if (isDraft) {
    const placeholder = new Date();
    placeholder.setHours(12, 0, 0, 0);
    startTs = placeholder.toISOString();
    endTs = new Date(placeholder.getTime() + 30 * 60 * 1000).toISOString();
  } else {
    const scheduleDate = dueDate || effectiveReleaseDate || new Date();
    const times = computeEventTimes({ date: scheduleDate, startTime: '', endTime: '', allDay: true });
    startTs = times.start?.toISOString() || new Date().toISOString();
    endTs = times.end?.toISOString() || startTs;
  }

  const event = await invokeCreateTaskEvent({
    _family_id: userFamilyId,
    _child_id: childId,
    _child_ids: payloadChildIds,
    _title: String(title || '').trim(),
    _start_ts: startTs,
    _end_ts: endTs,
    _description: instructions?.trim() || null,
    _status: 'scheduled',
    _source: 'manual',
    _tags: null,
    _is_flexible: isDraft,
    _is_backlog: isDraft,
    _event_type: eventType,
    _subject_id: subjectId || null,
    _unit: unitTitle?.trim() || null,
    _grade: gradingMode === 'points' && points ? String(points) : null,
    _percent_of_total_grade: gradingMode === 'percentage' ? 100 : null,
    _location: null,
    _mode: null,
    _instructor: null,
    _goal_link: null,
    _minutes: workSpec.estimated_effort_minutes || 30,
    _materials_attachment_ids: materialIds?.length ? materialIds : null,
    _recurrence_rule: null,
  });

  const patch = {
    work_spec: workSpec,
    subject_id: subjectId || null,
    requires_submission_home: !!requireParentApproval,
    curriculum_unit_title: unitTitle?.trim() || null,
    lesson: lessonLabel?.trim() || null,
    curriculum_lesson_id: curriculumLessonId || null,
  };

  const { data: updated, error: patchError } = await supabase
    .from('events')
    .update(patch)
    .eq('id', event.id)
    .select('*')
    .single();
  if (patchError) throw patchError;

  const finalEvent = updated || { ...event, ...patch };

  if (!isDraft) {
    const { data: { user } } = await supabase.auth.getUser();
    await ensureAssignmentsForEvent({
      familyId: userFamilyId,
      event: finalEvent,
      childIds,
      workSpec,
      userId: user?.id || null,
    });
  }

  dispatchRefresh();
  dispatchSubjectRefresh(subjectId);
  return finalEvent;
}

export const RECURRENCE_WEEKDAY_OPTIONS = [
  { value: 0, label: 'Sun', rrule: 'SU' },
  { value: 1, label: 'Mon', rrule: 'MO' },
  { value: 2, label: 'Tue', rrule: 'TU' },
  { value: 3, label: 'Wed', rrule: 'WE' },
  { value: 4, label: 'Thu', rrule: 'TH' },
  { value: 5, label: 'Fri', rrule: 'FR' },
  { value: 6, label: 'Sat', rrule: 'SA' },
];

export function buildEventRecurrenceRule({
  recurrenceType = 'weekly',
  recurrenceWeekdays = [],
  recurrenceEndType = 'never',
  recurrenceEndAfter = null,
  recurrenceEndDate = null,
  startDate = null,
  interval = 1,
}) {
  const type = String(recurrenceType || 'weekly').toLowerCase();
  const rule = {
    frequency: type.toUpperCase(),
    interval: Math.max(1, Number(interval) || 1),
  };

  if (type === 'weekly') {
    const fallbackWeekday = startDate instanceof Date ? startDate.getDay() : new Date().getDay();
    const days = Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.length > 0
      ? recurrenceWeekdays
      : [fallbackWeekday];
    rule.byweekday = days
      .map((day) => RECURRENCE_WEEKDAY_OPTIONS.find((opt) => opt.value === Number(day))?.rrule)
      .filter(Boolean);
  }

  if (recurrenceEndType === 'after') {
    const count = Number(recurrenceEndAfter);
    if (Number.isFinite(count) && count > 0) rule.count = count;
  } else if (recurrenceEndType === 'on' && recurrenceEndDate) {
    rule.until = toYmd(recurrenceEndDate);
  }

  return rule;
}

export function buildWeeklyRecurrenceRule(date, interval = 1) {
  if (!(date instanceof Date)) return null;
  return buildEventRecurrenceRule({
    recurrenceType: 'weekly',
    recurrenceWeekdays: [date.getDay()],
    recurrenceEndType: 'never',
    startDate: date,
    interval,
  });
}
