import { Platform } from 'react-native';
import { supabase } from './supabase';
import { getChildIdsFromEvent, dispatchAssignmentRefreshEvents } from './assignmentWorkflowClient';
import { ensureAssignmentsForEvent } from './workAssignmentClient';
import {
  isWorkProducingEventType,
  parseWorkSpec,
  showsLearningGradingSwitches,
} from './workEventHelpers';

export function filterAssignWorkEligibleEvents(events = []) {
  return (events || []).filter((event) => {
    if (!event?.id) return false;
    if (event.is_backlog === true) return false;
    if (event.deleted || event.deleted_at) return false;
    if (String(event?.status || '').toLowerCase() === 'canceled') return false;
    return showsLearningGradingSwitches(event.event_type);
  });
}

export function buildWorkSpecForAssignment(rawWorkSpec, eventType, submissionMethods) {
  const spec = parseWorkSpec(rawWorkSpec, eventType);
  const methods = submissionMethods && typeof submissionMethods === 'object'
    ? submissionMethods
    : {};
  const hasAnyMethod = Object.values(methods).some(Boolean);
  return {
    ...spec,
    require_final_deliverable: hasAnyMethod,
    submission_methods: {
      ...spec.submission_methods,
      ...methods,
    },
  };
}

export function notifyWorkAssignmentRefresh(subjectIds = []) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('refreshCalendar', {
    detail: { forceInvalidate: true, skipHomeRefresh: false },
  }));
  window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
  window.dispatchEvent(new CustomEvent('refreshSubjects'));
  (Array.isArray(subjectIds) ? subjectIds : []).forEach((subjectId) => {
    if (subjectId) {
      window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
    }
  });
  dispatchAssignmentRefreshEvents();
}

/**
 * Bulk-apply submission methods the same way EventDetails / TaskCreateModal persist work_spec.
 */
export async function applyWorkAssignmentToEvents({
  familyId,
  events = [],
  submissionMethods = null,
  userId = null,
}) {
  if (!familyId) throw new Error('Missing family');
  const methods = submissionMethods && typeof submissionMethods === 'object'
    ? submissionMethods
    : {};
  if (!Object.values(methods).some(Boolean)) {
    throw new Error('Select at least one submission method.');
  }

  let uid = userId;
  if (!uid) {
    const { data } = await supabase.auth.getUser();
    uid = data?.user?.id || null;
  }

  let updated = 0;
  let failed = 0;
  const subjectIds = new Set();

  for (const event of events) {
    const eventId = String(event?.id || '').trim();
    if (!eventId || !showsLearningGradingSwitches(event.event_type)) continue;

    const work_spec = buildWorkSpecForAssignment(event.work_spec, event.event_type, methods);
    const { error } = await supabase
      .from('events')
      .update({ work_spec })
      .eq('id', eventId)
      .eq('family_id', familyId);

    if (error) {
      failed += 1;
      continue;
    }

    updated += 1;
    const subjectId = event.subject_id || event.subjectId;
    if (subjectId) subjectIds.add(String(subjectId));

    if (isWorkProducingEventType(event.event_type)) {
      try {
        await ensureAssignmentsForEvent({
          familyId,
          event: { ...event, work_spec },
          childIds: getChildIdsFromEvent(event),
          workSpec: work_spec,
          userId: uid,
        });
      } catch (assignErr) {
        console.warn('[assignWorkClient] ensureAssignmentsForEvent:', assignErr);
      }
    }
  }

  if (updated > 0) {
    notifyWorkAssignmentRefresh([...subjectIds]);
  }

  return { updated, failed };
}
