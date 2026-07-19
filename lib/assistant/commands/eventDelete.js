import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { requireHouseholdMatch, requireString } from './commandUtils.js';

registerCommand({
  type: DOODLE_COMMAND_TYPES.EVENT_DELETE,
  auditLabel: 'Delete calendar event via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.EVENT_DELETE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    return requireString(command.eventId, 'Event');
  },

  authorize(command, ctx, caps = {}) {
    if (caps.canManageEvents === false && ctx.userRole !== 'parent') {
      return { ok: false, error: 'You do not have permission to delete events.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Event', value: command.eventTitle || command.eventId },
      { label: 'When', value: command.whenLabel || '—' },
      { label: 'Action', value: 'Delete from planner' },
    ];
  },

  async execute(command) {
    const { deleteCalendarEvent } = await import('../../create/calendarEventEditHelpers.js');
    try {
      await deleteCalendarEvent({
        eventId: command.eventId,
        familyId: command.householdId,
      });
    } catch (err) {
      return {
        ok: false,
        message: err?.message || 'Could not delete event.',
        error: 'execution',
      };
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
    }
    return {
      ok: true,
      message: `Deleted “${command.eventTitle || 'event'}”.`,
      affectedRecords: [{
        label: 'Open Planner',
        href: '/planner',
        entityType: 'event',
      }],
    };
  },
});
