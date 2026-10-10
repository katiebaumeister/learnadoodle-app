/**
 * Reverse a recent Doodle mutation using undoToken + undoPayload snapshot.
 * Deterministic domain tools only — never free-form DB writes from the model.
 */

import { DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { trackDoodleEvent } from './analytics.js';

/**
 * @param {{
 *   undoToken?: string,
 *   undoPayload?: object,
 *   context: import('./types.js').DoodleContext,
 *   capabilities?: object,
 *   conversationId?: string|null,
 * }} input
 */
export async function doodleUndo(input = {}) {
  const ctx = input.context;
  const token = String(input.undoToken || '').trim();
  const payload = input.undoPayload && typeof input.undoPayload === 'object'
    ? input.undoPayload
    : {};

  if (!ctx?.householdId || !ctx?.userId) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Missing household context for undo.',
      recoverable: true,
    });
  }
  if (!token) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Nothing to undo.',
      recoverable: true,
    });
  }
  if (input.capabilities?.canManageEvents === false && ctx.userRole !== 'parent') {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'You do not have permission to undo that change.',
      recoverable: false,
    });
  }

  trackDoodleEvent('doodle_undo_requested', { token: token.split(':')[0] });

  try {
    const [kind, id] = token.split(':');
    if (!id) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: 'Undo token is invalid.',
        recoverable: true,
      });
    }

    if (kind === 'event') {
      return await undoEvent(id, payload, ctx);
    }
    if (kind === 'assignment') {
      return await undoAssignment(id, payload, ctx);
    }
    if (kind === 'event-complete') {
      return await undoEventComplete(id, payload, ctx);
    }

    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Undo is not supported for that action yet.',
      recoverable: true,
    });
  } catch (err) {
    trackDoodleEvent('doodle_undo_failed', { error: 'exception' });
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: err?.message || 'Could not undo that change.',
      recoverable: true,
    });
  }
}

async function undoEvent(eventId, payload, ctx) {
  const kind = payload.kind || 'create';
  if (kind === 'create') {
    const { deleteCalendarEvent } = await import('../../create/calendarEventEditHelpers.js');
    await deleteCalendarEvent({ eventId, familyId: ctx.householdId });
    refreshCalendar();
    trackDoodleEvent('doodle_undo_completed', { kind: 'event_create' });
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.RESULT,
      message: 'Undone — event removed.',
      affectedRecords: [{ label: 'Open Planner', href: '/?view=month', entityType: 'event' }],
    });
  }
  if (kind === 'move' || kind === 'update') {
    const { executeChatUpdateEvent } = await import('../eventChatActions.js');
    const { notifyEventPatched } = await import('./uiNotify.js');
    if (!payload.start_ts) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: 'Missing prior schedule to restore.',
        recoverable: true,
      });
    }
    const patch = {
      start_ts: payload.start_ts,
      end_ts: payload.end_ts || null,
      all_day: payload.all_day === true,
    };
    notifyEventPatched({ id: eventId, ...patch, allDay: patch.all_day });
    const result = await executeChatUpdateEvent(eventId, patch, false, ctx.householdId);
    if (!result?.success) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: result?.error || 'Could not restore the previous time.',
        recoverable: true,
      });
    }
    refreshCalendar();
    trackDoodleEvent('doodle_undo_completed', { kind: 'event_move' });
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.RESULT,
      message: 'Undone — restored previous schedule.',
      affectedRecords: [{
        label: payload.title || 'Open event',
        href: `/?event=${eventId}`,
        entityType: 'event',
        entityId: String(eventId),
      }],
    });
  }
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ERROR,
    message: 'Undo is not supported for that event change.',
    recoverable: true,
  });
}

async function undoAssignment(assignmentId, payload, ctx) {
  const kind = payload.kind || 'create';
  const {
    deleteAssignmentAndEvent,
    updateAssignmentFromEditForm,
    resolveLinkedEventIdFromAssignment,
    createPlannerEventForAssignment,
  } = await import('../../create/assignmentEditHelpers.js');
  const { supabase } = await import('../../supabase.js');

  const { data: row, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('id', assignmentId)
    .maybeSingle();

  if (kind === 'create') {
    if (error || !row) {
      // Already gone
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.RESULT,
        message: 'Undone — assignment already removed.',
      });
    }
    const eventId = payload.eventId || resolveLinkedEventIdFromAssignment(row);
    if (eventId) {
      await deleteAssignmentAndEvent({
        eventId,
        familyId: ctx.householdId,
        subjectId: row.related_subject || null,
      });
    } else {
      await supabase.from('assignments').delete().eq('id', assignmentId);
    }
    refreshCalendar();
    trackDoodleEvent('doodle_undo_completed', { kind: 'assignment_create' });
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.RESULT,
      message: 'Undone — assignment removed.',
      affectedRecords: [{ label: 'Open Learning', href: '/learning', entityType: 'assignment' }],
    });
  }

  if (kind === 'update' || kind === 'move') {
    if (error || !row) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: 'Assignment no longer exists — cannot undo.',
        recoverable: true,
      });
    }
    const eventId = payload.eventId || resolveLinkedEventIdFromAssignment(row);
    const dueYmd = payload.dueYmd || null;
    const dueDate = dueYmd ? new Date(`${dueYmd}T12:00:00`) : null;
    const title = payload.title || row.title;
    const childIds = payload.childIds?.length
      ? payload.childIds.map(String)
      : (row.child_id ? [String(row.child_id)] : []);
    const subjectId = payload.subjectId || row.related_subject || null;
    const instructions = payload.instructions != null ? payload.instructions : (row.description || '');

    if (eventId) {
      await updateAssignmentFromEditForm({
        eventId,
        familyId: ctx.householdId,
        title,
        childIds,
        subjectId,
        instructions,
        dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
        assignment: row,
      });
    } else if (dueDate && !Number.isNaN(dueDate.getTime())) {
      await createPlannerEventForAssignment({
        familyId: ctx.householdId,
        assignment: row,
        title,
        childIds,
        subjectId,
        instructions,
        dueDate,
      });
    } else {
      const updates = { title, updated_at: new Date().toISOString() };
      if (dueYmd) updates.due_date = dueYmd;
      await supabase.from('assignments').update(updates).eq('id', assignmentId);
    }
    refreshCalendar();
    trackDoodleEvent('doodle_undo_completed', { kind: 'assignment_update' });
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.RESULT,
      message: 'Undone — restored previous assignment details.',
      affectedRecords: [{
        label: title || 'Assignment',
        href: `/learning?assignment=${assignmentId}`,
        entityType: 'assignment',
        entityId: String(assignmentId),
      }],
    });
  }

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ERROR,
    message: 'Undo is not supported for that assignment change.',
    recoverable: true,
  });
}

async function undoEventComplete(eventId, payload, ctx) {
  // Restore prior status when available; otherwise leave incomplete.
  const { executeChatUpdateEvent } = await import('../eventChatActions.js');
  const status = payload.priorStatus || 'scheduled';
  const result = await executeChatUpdateEvent(
    eventId,
    { status },
    false,
    ctx.householdId,
  );
  if (!result?.success) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: result?.error || 'Could not restore completion status.',
      recoverable: true,
    });
  }
  refreshCalendar();
  trackDoodleEvent('doodle_undo_completed', { kind: 'event_complete' });
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.RESULT,
    message: 'Undone — marked incomplete again.',
    affectedRecords: [{
      label: payload.title || 'Open event',
      href: `/?event=${eventId}`,
      entityType: 'event',
      entityId: String(eventId),
    }],
  });
}

function refreshCalendar() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
    window.dispatchEvent(new CustomEvent('refreshSubjects'));
  }
}
