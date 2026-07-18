import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';

function requireString(value, label) {
  const v = String(value || '').trim();
  if (!v) return { ok: false, error: `${label} is required` };
  return { ok: true, value: v };
}

registerCommand({
  type: DOODLE_COMMAND_TYPES.EVENT_CREATE,
  auditLabel: 'Create calendar event via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.EVENT_CREATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const title = requireString(command.title, 'Title');
    if (!title.ok) return title;
    const householdId = requireString(command.householdId, 'Household');
    if (!householdId.ok) return householdId;
    const startAt = requireString(command.startAt, 'Start date/time');
    if (!startAt.ok) return startAt;
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.canManageEvents === false) {
      return { ok: false, error: 'You do not have permission to create events.' };
    }
    if (ctx?.userRole === 'child' && caps.canManageEvents !== true) {
      return { ok: false, error: 'Creating events is not enabled for this account.' };
    }
    if (String(command.householdId) !== String(ctx.householdId)) {
      return { ok: false, error: 'Household mismatch.' };
    }
    return { ok: true };
  },

  async validate(command) {
    const start = new Date(command.startAt);
    if (Number.isNaN(start.getTime())) {
      return { ok: false, error: 'Start date is invalid.' };
    }
    if (command.endAt) {
      const end = new Date(command.endAt);
      if (Number.isNaN(end.getTime())) {
        return { ok: false, error: 'End date is invalid.' };
      }
      if (end.getTime() < start.getTime()) {
        return { ok: false, error: 'End must be after start.' };
      }
    }
    return { ok: true };
  },

  preview(command, ctx) {
    const start = new Date(command.startAt);
    const fields = [
      { label: 'Title', value: command.title, editable: true, fieldPath: 'title' },
      {
        label: 'When',
        value: Number.isNaN(start.getTime())
          ? command.startAt
          : start.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
        editable: true,
        fieldPath: 'startAt',
      },
    ];
    if (command.childIds?.length) {
      fields.push({
        label: 'Learners',
        value: `${command.childIds.length} selected`,
        fieldPath: 'childIds',
      });
    } else if (ctx.selectedChildIds?.length) {
      fields.push({
        label: 'Learners',
        value: 'From current context',
        fieldPath: 'childIds',
      });
    }
    if (command.description) {
      fields.push({ label: 'Notes', value: command.description, fieldPath: 'description' });
    }
    return fields;
  },

  async execute(command, ctx) {
    const { saveCalendarEvent } = await import('../../create/saveEventHelpers.js');
    const start = new Date(command.startAt);
    const childIds = command.childIds?.length
      ? command.childIds
      : (ctx.selectedChildIds || []);

    const event = await saveCalendarEvent({
      familyId: command.householdId,
      title: command.title,
      childIds,
      date: start,
      startTime: '',
      endTime: '',
      allDay: true,
      notes: command.description || '',
      subjectId: command.subjectId || null,
    });

    const id = event?.id || event?.event_id;
    return {
      ok: true,
      message: `Created “${command.title}”.`,
      affectedRecords: id
        ? [{ label: command.title, href: `/planner?event=${id}`, entityType: 'event', entityId: String(id) }]
        : [],
      resultData: { eventId: id || null },
      undoToken: id ? `event:${id}` : undefined,
    };
  },
});
