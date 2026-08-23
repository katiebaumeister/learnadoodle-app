import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import {
  formatMoveWhenLabel,
  isAllDayLike,
  requireString,
  toAllDayBounds,
} from './commandUtils.js';

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
    const allDay = command.allDay === true || isAllDayLike(command);
    const when = formatMoveWhenLabel(command.startAt, command.endAt, allDay);
    const fields = [
      { label: 'Item', value: command.itemTitle || command.itemId, fieldPath: 'itemId' },
      { label: 'When', value: when, fieldPath: 'startAt' },
    ];
    return fields;
  },

  async execute(command, ctx) {
    const { executeChatUpdateEvent } = await import('../eventChatActions.js');
    const { notifyEventPatched } = await import('./uiNotify.js');

    const allDay = command.allDay === true || isAllDayLike(command);
    let startIso = command.startAt;
    let endIso = command.endAt;
    if (allDay) {
      const bounds = toAllDayBounds(command.startAt);
      if (bounds) {
        startIso = bounds.startAt;
        endIso = bounds.endAt;
      }
    }
    const start = new Date(startIso);
    let end = endIso ? new Date(endIso) : null;
    if (!end || Number.isNaN(end.getTime())) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    const patch = {
      id: String(command.itemId),
      start_ts: start.toISOString(),
      end_ts: end.toISOString(),
      all_day: allDay,
      allDay,
    };

    // Optimistic planner move (same bus as drag/edit)
    notifyEventPatched(patch);

    let result = await executeChatUpdateEvent(
      command.itemId,
      {
        start_ts: patch.start_ts,
        end_ts: patch.end_ts,
        all_day: allDay,
      },
      false,
      ctx.householdId,
    );
    // Older schemas may lack all_day — retry times only.
    if (!result?.success && /all_day/i.test(String(result?.error || ''))) {
      result = await executeChatUpdateEvent(
        command.itemId,
        { start_ts: patch.start_ts, end_ts: patch.end_ts },
        false,
        ctx.householdId,
      );
    }
    if (!result?.success) {
      // Soft refresh to restore prior day from server
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipCacheClear: true } }));
      }
      return { ok: false, message: result?.error || 'Could not move that item.', error: 'execution' };
    }

    // Re-broadcast with persisted values (covers any server normalization)
    const persisted = result.data || {};
    notifyEventPatched({
      ...patch,
      ...(persisted.start_ts ? { start_ts: persisted.start_ts } : {}),
      ...(persisted.end_ts ? { end_ts: persisted.end_ts } : {}),
      ...(persisted.title ? { title: persisted.title } : {}),
    });

    const whenLabel = formatMoveWhenLabel(patch.start_ts, patch.end_ts, allDay);
    return {
      ok: true,
      message: `Moved “${command.itemTitle || 'planner item'}” to ${whenLabel}.`,
      affectedRecords: [{
        label: command.itemTitle || 'Open in Planner',
        href: `/?event=${command.itemId}`,
        entityType: 'event',
        entityId: String(command.itemId),
      }],
      resultData: { eventId: command.itemId, allDay },
      undoToken: `event:${command.itemId}`,
    };
  },
});
