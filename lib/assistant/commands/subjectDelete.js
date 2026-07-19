import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { requireHouseholdMatch, requireString } from './commandUtils.js';

registerCommand({
  type: DOODLE_COMMAND_TYPES.SUBJECT_DELETE,
  auditLabel: 'Delete subject via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.SUBJECT_DELETE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const id = requireString(command.subjectId, 'Subject');
    if (!id.ok) return id;
    return requireString(command.confirmName, 'Confirm name');
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showLearning === false) {
      return { ok: false, error: 'Learning areas are not enabled for this household.' };
    }
    if (ctx.userRole === 'child') {
      return { ok: false, error: 'You do not have permission to delete subjects.' };
    }
    if (caps.canManageSubjects === false && ctx.userRole !== 'parent') {
      return { ok: false, error: 'You do not have permission to delete subjects.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    const expected = String(command.subjectName || '').trim().toLowerCase();
    const got = String(command.confirmName || '').trim().toLowerCase();
    if (expected && got && expected !== got) {
      return { ok: false, error: 'Confirmation name must match the subject name exactly.' };
    }
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Subject', value: command.subjectName || 'Subject' },
      { label: 'Action', value: 'Delete subject' },
      { label: 'Confirm as', value: command.confirmName || '—' },
    ];
  },

  async execute(command) {
    const {
      deleteSubjectCascadeForFamily,
      dispatchSubjectDeletedSideEffects,
    } = await import('../../services/deleteSubjectCascade.js');
    const result = await deleteSubjectCascadeForFamily(
      command.householdId,
      command.subjectId,
      command.subjectName || command.confirmName,
    );
    if (!result?.ok) {
      return {
        ok: false,
        message: result?.error || 'Could not delete subject.',
        error: 'execution',
      };
    }
    dispatchSubjectDeletedSideEffects(command.householdId);
    return {
      ok: true,
      message: `Deleted subject “${result.deletedName || command.subjectName}”.`,
      affectedRecords: [{
        label: 'Open Learning',
        href: '/learning',
        entityType: 'subject',
      }],
    };
  },
});
