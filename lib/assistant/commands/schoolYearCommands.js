import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { formatDisplayDate, requireHouseholdMatch, requireString, toYmd } from './commandUtils.js';

registerCommand({
  type: DOODLE_COMMAND_TYPES.SCHOOL_YEAR_UPDATE,
  auditLabel: 'Update school year settings via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.SCHOOL_YEAR_UPDATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    if (!command.patch || typeof command.patch !== 'object') {
      return { ok: false, error: 'Settings patch is required' };
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (ctx.userRole === 'child' || ctx.userRole === 'tutor') {
      return { ok: false, error: 'Only parents can edit school year settings.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    const fields = [];
    const p = command.patch || {};
    if (p.default_year_start_date) {
      fields.push({ label: 'Year start', value: formatDisplayDate(p.default_year_start_date) });
    }
    if (p.default_year_end_date) {
      fields.push({ label: 'Year end', value: formatDisplayDate(p.default_year_end_date) });
    }
    if (p.default_target_days != null) {
      fields.push({ label: 'Target days', value: String(p.default_target_days) });
    }
    if (p.default_target_hours != null) {
      fields.push({ label: 'Target hours', value: String(p.default_target_hours) });
    }
    if (p.default_planned_hours_per_day != null) {
      fields.push({ label: 'Hours per learning day', value: String(p.default_planned_hours_per_day) });
    }
    if (Array.isArray(p.allowed_weekdays)) {
      fields.push({ label: 'Learning days', value: p.allowed_weekdays.join(', ') });
    }
    if (command.schoolYearLabel) {
      fields.push({ label: 'School year', value: command.schoolYearLabel });
    }
    if (!fields.length) {
      fields.push({ label: 'Changes', value: 'Custom school year update' });
    }
    return fields;
  },

  async execute(command) {
    const { saveFamilyPlannerSettings } = await import('../../services/plannerSettingsClient.js');
    const result = await saveFamilyPlannerSettings(
      command.householdId,
      command.patch,
      command.schoolYearLabel || null,
    );
    if (result?.error) {
      return {
        ok: false,
        message: result.error?.message || 'Could not update school year settings.',
        error: 'execution',
      };
    }
    return {
      ok: true,
      message: 'Updated school year settings.',
      affectedRecords: [{
        label: 'Open school year settings',
        href: '/settings',
        entityType: 'school_year',
      }],
      resultData: { patch: command.patch },
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.DAY_OFF_CREATE,
  auditLabel: 'Create day off via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.DAY_OFF_CREATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const start = requireString(command.startDate, 'Start date');
    if (!start.ok) return start;
    return { ok: true };
  },

  authorize(command, ctx) {
    if (ctx.userRole === 'child') {
      return { ok: false, error: 'You do not have permission to add days off.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    if (!toYmd(command.startDate)) return { ok: false, error: 'Invalid start date.' };
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Title', value: command.title || 'Day off' },
      { label: 'Start', value: formatDisplayDate(command.startDate) },
      { label: 'End', value: formatDisplayDate(command.endDate || command.startDate) },
      { label: 'School year', value: command.schoolYearLabel || 'Current' },
    ];
  },

  async execute(command) {
    const { saveDayOff } = await import('../../create/saveDayOffHelpers.js');
    try {
      await saveDayOff({
        familyId: command.householdId,
        schoolYearLabel: command.schoolYearLabel || null,
        title: command.title || 'Day off',
        startDate: command.startDate,
        endDate: command.endDate || command.startDate,
      });
    } catch (err) {
      return {
        ok: false,
        message: err?.message || 'Could not add day off.',
        error: 'execution',
      };
    }
    return {
      ok: true,
      message: `Added day off “${command.title || 'Day off'}” on ${formatDisplayDate(command.startDate)}.`,
      affectedRecords: [{
        label: 'Open school year settings',
        href: '/settings',
        entityType: 'day_off',
      }],
    };
  },
});
