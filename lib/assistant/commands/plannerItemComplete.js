import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { requireString } from './commandUtils.js';

registerCommand({
  type: DOODLE_COMMAND_TYPES.PLANNER_ITEM_COMPLETE,
  auditLabel: 'Mark planner item done via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.PLANNER_ITEM_COMPLETE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const item = requireString(command.itemId, 'Item');
    if (!item.ok) return item;
    return { ok: true };
  },

  authorize(_command, ctx, caps = {}) {
    if (ctx.userRole === 'tutor') {
      return { ok: false, error: 'Tutors cannot mark planner items done.' };
    }
    if (caps.canMarkComplete === false) {
      return { ok: false, error: 'You do not have permission to mark items done.' };
    }
    return { ok: true };
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Item', value: command.itemTitle || command.itemId, fieldPath: 'itemId' },
      { label: 'Action', value: 'Mark as done' },
    ];
    if (command.whenLabel) {
      fields.push({ label: 'When', value: command.whenLabel });
    }
    return fields;
  },

  async execute(command) {
    const { completeEvent } = await import('../../services/attendanceClient.js');
    const { cleanPlannerEventId } = await import('../../utils/recurringEventUtils.js');
    const { notifyEventAttendancePatched } = await import('./uiNotify.js');
    const eventId = cleanPlannerEventId(String(command.itemId || '')) || String(command.itemId);

    // Optimistic checkmark everywhere (same bus as planner/home toggle)
    notifyEventAttendancePatched(eventId, 'done', { refresh: false });

    const result = await completeEvent(eventId, null, { requirePersist: true });
    if (result?.error) {
      notifyEventAttendancePatched(eventId, 'scheduled', { refresh: false });
      return {
        ok: false,
        message: result.error?.message || result.error || 'Could not mark that item done.',
        error: 'execution',
      };
    }

    // Soft refresh after persist (skipCacheClear keeps optimistic status)
    notifyEventAttendancePatched(eventId, 'done', { refresh: true });

    return {
      ok: true,
      message: `Marked “${command.itemTitle || 'planner item'}” as done.`,
      affectedRecords: [{
        label: command.itemTitle || 'Open in Planner',
        href: `/?event=${eventId}`,
        entityType: 'event',
        entityId: String(eventId),
      }],
      resultData: { eventId, status: 'done' },
      undoToken: `event-complete:${eventId}`,
    };
  },
});
