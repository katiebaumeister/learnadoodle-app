import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';

function requireString(value, label) {
  const v = String(value || '').trim();
  if (!v) return { ok: false, error: `${label} is required` };
  return { ok: true, value: v };
}

registerCommand({
  type: DOODLE_COMMAND_TYPES.ASSIGNMENT_CREATE,
  auditLabel: 'Create assignment via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.ASSIGNMENT_CREATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    for (const [key, label] of [
      ['title', 'Title'],
      ['householdId', 'Household'],
      ['subjectId', 'Subject'],
    ]) {
      const check = requireString(command[key], label);
      if (!check.ok) return check;
    }
    if (!Array.isArray(command.childIds) || command.childIds.length === 0) {
      return { ok: false, error: 'At least one student is required' };
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showAssignments === false) {
      return { ok: false, error: 'Assignments are not enabled for this household.' };
    }
    if (caps.canManageEvents === false) {
      return { ok: false, error: 'You do not have permission to create assignments.' };
    }
    if (String(command.householdId) !== String(ctx.householdId)) {
      return { ok: false, error: 'Household mismatch.' };
    }
    return { ok: true };
  },

  async validate(command) {
    if (command.dueAt) {
      const due = new Date(command.dueAt);
      if (Number.isNaN(due.getTime())) {
        return { ok: false, error: 'Due date is invalid.' };
      }
    }
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Title', value: command.title, editable: true, fieldPath: 'title' },
      { label: 'Subject', value: command.subjectId, fieldPath: 'subjectId' },
      {
        label: 'Students',
        value: `${command.childIds.length} selected`,
        fieldPath: 'childIds',
      },
    ];
    if (command.dueAt) {
      const due = new Date(command.dueAt);
      fields.push({
        label: 'Due',
        value: Number.isNaN(due.getTime())
          ? command.dueAt
          : due.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }),
        editable: true,
        fieldPath: 'dueAt',
      });
    } else {
      fields.push({ label: 'Due', value: 'Not set', fieldPath: 'dueAt' });
    }
    if (command.pointsPossible != null) {
      fields.push({
        label: 'Points',
        value: String(command.pointsPossible),
        fieldPath: 'pointsPossible',
      });
    } else {
      fields.push({ label: 'Points', value: 'Not graded' });
    }
    if (command.instructions) {
      fields.push({ label: 'Instructions', value: command.instructions, fieldPath: 'instructions' });
    }
    return fields;
  },

  async execute(command) {
    const { saveAssignment } = await import('../../create/saveEventHelpers.js');
    const dueDate = command.dueAt ? new Date(command.dueAt) : null;
    const saved = await saveAssignment({
      familyId: command.householdId,
      title: command.title,
      childIds: command.childIds,
      subjectId: command.subjectId,
      instructions: command.instructions || '',
      dueDate,
      points: command.pointsPossible ?? null,
      gradingMode: command.pointsPossible != null ? 'points' : 'ungraded',
      saveMode: 'assign',
    });

    const id = saved?.assignment?.id || saved?.event?.id || saved?.id;
    return {
      ok: true,
      message: `Created assignment “${command.title}”.`,
      affectedRecords: id
        ? [{
          label: command.title,
          href: `/learning?assignment=${id}`,
          entityType: 'assignment',
          entityId: String(id),
        }]
        : [],
      resultData: { assignmentId: id || null, eventId: saved?.event?.id || null },
      undoToken: id ? `assignment:${id}` : undefined,
    };
  },
});
