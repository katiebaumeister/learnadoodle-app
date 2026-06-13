import { Platform } from 'react-native';
import { supabase } from './supabase';
import { sendNudgeForEvent } from './assignmentWorkflowClient';

async function resolveEventRow(eventId, initialEvent) {
  if (initialEvent && String(initialEvent.id || '') === String(eventId)) {
    return initialEvent;
  }
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Parent nudge for a specific planner event (no Event Details modal). */
export async function runSendNudgeForEvent({
  familyId,
  eventId,
  initialEvent = null,
  childIds = null,
  note = null,
}) {
  if (!familyId || !eventId) {
    throw new Error('Missing event');
  }
  const eventRow = await resolveEventRow(eventId, initialEvent);
  if (!eventRow) {
    throw new Error('Event not found');
  }
  return sendNudgeForEvent({
    familyId,
    event: eventRow,
    childIds,
    note,
  });
}

export function dispatchOpenNudgeForEvent(detail = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('openNudgeForEvent', { detail }));
}

export function dispatchOpenHelpForAssignment(assignment) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !assignment) return;
  window.dispatchEvent(new CustomEvent('openHelpForAssignment', { detail: { assignment } }));
}

export function dispatchOpenReviewForAssignment(assignment) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !assignment) return;
  window.dispatchEvent(new CustomEvent('openReviewForAssignment', { detail: { assignment } }));
}

/** Parent: open assignment edit modal (optionally submissions view). */
export function dispatchOpenEditAssignment({
  assignment = null,
  linkedEvent = null,
  eventId = null,
  view = 'edit',
} = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  if (!assignment && !linkedEvent && !eventId) return;
  window.dispatchEvent(
    new CustomEvent('openEditAssignment', {
      detail: { assignment, linkedEvent, eventId, view },
    }),
  );
}

/** Preferred entry for parent assignment clicks — edit modal first. */
export function openAssignmentForParent(assignment, options = {}) {
  dispatchOpenEditAssignment({
    assignment,
    linkedEvent: options.linkedEvent || null,
    eventId: options.eventId || null,
    view: options.view || 'edit',
  });
}
