import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { formatDisplayDateTime, requireString } from './commandUtils.js';

registerCommand({
  type: DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE,
  auditLabel: 'Move planner item via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const item = requireString(command.itemId, 'Item');
    if (!item.ok) return item;
    const start = requireString(command.startAt, 'Start');
    if (!start.ok) return start;
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.canManageEvents === false) {
      return { ok: false, error: 'You do not have permission to move planner items.' };
    }
    return { ok: true };
  },

  async validate(command) {
    const start = new Date(command.startAt);
    if (Number.isNaN(start.getTime())) return { ok: false, error: 'Invalid start time.' };
    if (command.endAt) {
      const end = new Date(command.endAt);
      if (Number.isNaN(end.getTime()) || end <= start) {
        return { ok: false, error: 'End must be after start.' };
      }
    }
    return { ok: true };
  },

  preview(command) {
    const fields = [
      { label: 'Item', value: command.itemTitle || command.itemId, fieldPath: 'itemId' },
      { label: 'New start', value: formatDisplayDateTime(command.startAt), fieldPath: 'startAt' },
    ];
    if (command.endAt) {
      fields.push({ label: 'New end', value: formatDisplayDateTime(command.endAt), fieldPath: 'endAt' });
    }
    return fields;
  },

  async execute(command, ctx) {
    const { executeChatUpdateEvent } = await import('../eventChatActions.js');
    const start = new Date(command.startAt);
    let end = command.endAt ? new Date(command.endAt) : null;
    if (!end || Number.isNaN(end.getTime())) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }
    const result = await executeChatUpdateEvent(
      command.itemId,
      { start_ts: start.toISOString(), end_ts: end.toISOString() },
      false,
      ctx.householdId,
    );
    if (!result?.success) {
      return { ok: false, message: result?.error || 'Could not move that item.', error: 'execution' };
    }
    return {
      ok: true,
      message: `Moved “${command.itemTitle || 'planner item'}” to ${formatDisplayDateTime(start)}.`,
      affectedRecords: [{
        label: command.itemTitle || 'Open in Planner',
        href: `/planner?event=${command.itemId}`,
        entityType: 'event',
        entityId: String(command.itemId),
      }],
      resultData: { eventId: command.itemId },
      undoToken: `event:${command.itemId}`,
    };
  },
});
