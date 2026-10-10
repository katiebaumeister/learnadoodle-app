import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { authorizePlannerWrite, requireString } from './commandUtils.js';

function authorizeAssignmentWrite(command, ctx, caps = {}) {
  if (caps.showAssignments === false) {
    return { ok: false, error: 'Assignments are not enabled for this household.' };
  }
  return authorizePlannerWrite(command, ctx, caps, 'change assignments');
}

registerCommand({
  type: DOODLE_COMMAND_TYPES.ASSIGNMENT_UPDATE,
  auditLabel: 'Update assignment via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.ASSIGNMENT_UPDATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    return requireString(command.assignmentId, 'Assignment');
  },

  authorize: authorizeAssignmentWrite,

  async validate(command) {
    if (command.dueAt || command.dueYmd) {
      const due = command.dueAt
        ? new Date(command.dueAt)
        : new Date(`${command.dueYmd}T12:00:00`);
      if (Number.isNaN(due.getTime())) {
        return { ok: false, error: 'Due date is invalid.' };
      }
    }
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Assignment', value: command.title || command.assignmentId },
    ];
    if (command.childNames) {
      fields.push({ label: 'Student', value: command.childNames });
    }
    if (command.subjectName) {
      fields.push({ label: 'Subject', value: command.subjectName });
    }
    if (command.originalDueLabel || command.newDueLabel) {
      fields.push({
        label: 'Due',
        value: command.newDueLabel
          ? `${command.originalDueLabel || 'Not set'} → ${command.newDueLabel}`
          : (command.originalDueLabel || '—'),
      });
    }
    if (command.patch?.title && command.patch.title !== command.title) {
      fields.push({ label: 'New title', value: command.patch.title });
    } else if (command.patch?.title) {
      fields.push({ label: 'Title', value: command.patch.title });
    }
    if (command.instructions != null) {
      fields.push({ label: 'Instructions', value: command.instructions });
    }
    if (command.pointsPossible != null) {
      fields.push({ label: 'Points', value: String(command.pointsPossible) });
    }
    fields.push({ label: 'Action', value: command.actionLabel || 'Update assignment' });
    return fields;
  },

  async execute(command) {
    const {
      updateAssignmentFromEditForm,
      createPlannerEventForAssignment,
      resolveLinkedEventIdFromAssignment,
      fetchPrimaryAssignmentForEvent,
    } = await import('../../create/assignmentEditHelpers.js');
    const { updateAssignment } = await import('../../services/assignmentsClient.js');
    const { supabase } = await import('../../supabase.js');

    const assignmentId = String(command.assignmentId);
    const { data: row, error: loadErr } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .maybeSingle();
    if (loadErr || !row) {
      return {
        ok: false,
        message: loadErr?.message || 'Assignment not found.',
        error: 'execution',
      };
    }

    const patch = command.patch || {};
    const nextTitle = patch.title || command.title || row.title;
    const dueYmd = patch.dueYmd || command.dueYmd || null;
    const dueDate = dueYmd
      ? new Date(`${dueYmd}T12:00:00`)
      : (command.dueAt ? new Date(command.dueAt) : null);
    const instructions = patch.instructions != null
      ? patch.instructions
      : (command.instructions != null ? command.instructions : (row.description || ''));
    const points = patch.pointsPossible != null
      ? patch.pointsPossible
      : command.pointsPossible;
    const childIds = (command.childIds?.length
      ? command.childIds
      : (row.child_id ? [String(row.child_id)] : [])).map(String);
    const subjectId = command.subjectId || row.related_subject || null;

    let eventId = command.eventId || resolveLinkedEventIdFromAssignment(row);

    try {
      if (eventId) {
        await updateAssignmentFromEditForm({
          eventId,
          familyId: command.householdId,
          title: nextTitle,
          childIds,
          subjectId,
          instructions,
          dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
          points: points != null ? points : null,
          assignment: row,
        });
      } else if (dueDate && !Number.isNaN(dueDate.getTime())) {
        await createPlannerEventForAssignment({
          familyId: command.householdId,
          assignment: row,
          title: nextTitle,
          childIds,
          subjectId,
          instructions,
          dueDate,
        });
      } else {
        const updates = {
          title: nextTitle,
          updated_at: new Date().toISOString(),
        };
        if (dueYmd) updates.due_date = dueYmd;
        if (patch.instructions != null) updates.description = instructions;
        if (subjectId) updates.related_subject = subjectId;
        const { error: updErr } = await updateAssignment(assignmentId, updates);
        if (updErr) throw updErr;
      }
    } catch (err) {
      return {
        ok: false,
        message: err?.message || 'Could not update assignment.',
        error: 'execution',
      };
    }

    // Re-fetch for undo snapshot token
    void fetchPrimaryAssignmentForEvent;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
    }

    const label = nextTitle || 'assignment';
    return {
      ok: true,
      message: dueYmd
        ? `Moved “${label}” to ${command.newDueLabel || dueYmd}.`
        : `Updated “${label}”.`,
      affectedRecords: [{
        label,
        href: `/learning?assignment=${assignmentId}`,
        entityType: 'assignment',
        entityId: assignmentId,
      }],
      resultData: { assignmentId, eventId: eventId || null },
      undoToken: `assignment:${assignmentId}`,
      undoPayload: {
        kind: command.dueYmd || patch.dueYmd ? 'move' : 'update',
        title: row.title,
        dueYmd: command.originalDueYmd || (row.due_date ? String(row.due_date).slice(0, 10) : null),
        instructions: row.description || '',
        subjectId: row.related_subject || null,
        childIds: row.child_id ? [String(row.child_id)] : [],
        eventId: eventId || null,
      },
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.ASSIGNMENT_DELETE,
  auditLabel: 'Delete assignment via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.ASSIGNMENT_DELETE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    return requireString(command.assignmentId, 'Assignment');
  },

  authorize: authorizeAssignmentWrite,

  async validate() {
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Assignment', value: command.title || command.assignmentId },
      { label: 'Due', value: command.dueLabel || '—' },
      { label: 'Action', value: 'Delete assignment' },
    ];
  },

  async execute(command) {
    const {
      deleteAssignmentAndEvent,
      resolveLinkedEventIdFromAssignment,
    } = await import('../../create/assignmentEditHelpers.js');
    const { supabase } = await import('../../supabase.js');

    const assignmentId = String(command.assignmentId);
    const { data: row, error: loadErr } = await supabase
      .from('assignments')
      .select('*')
      .eq('id', assignmentId)
      .maybeSingle();
    if (loadErr || !row) {
      return {
        ok: false,
        message: loadErr?.message || 'Assignment not found.',
        error: 'execution',
      };
    }

    const eventId = command.eventId || resolveLinkedEventIdFromAssignment(row);
    try {
      if (eventId) {
        await deleteAssignmentAndEvent({
          eventId,
          familyId: command.householdId,
          subjectId: command.subjectId || row.related_subject || null,
        });
      } else {
        const { error } = await supabase.from('assignments').delete().eq('id', assignmentId);
        if (error) throw error;
      }
    } catch (err) {
      return {
        ok: false,
        message: err?.message || 'Could not delete assignment.',
        error: 'execution',
      };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
    }

    return {
      ok: true,
      message: `Deleted “${command.title || 'assignment'}”.`,
      affectedRecords: [{
        label: 'Open Learning',
        href: '/learning',
        entityType: 'assignment',
      }],
      resultData: { assignmentId, deleted: true },
    };
  },
});
