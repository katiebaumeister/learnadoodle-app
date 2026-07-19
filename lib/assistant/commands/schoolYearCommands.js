import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import {
  authorizeDayOffMutation,
  formatDisplayDate,
  requireHouseholdMatch,
  requireString,
  toYmd,
} from './commandUtils.js';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatSqlTimeLabel(sqlTime) {
  const raw = String(sqlTime || '').slice(0, 5);
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return String(sqlTime || '');
  let h = Number(m[1]);
  const mins = m[2];
  const ap = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return `${h}:${mins} ${ap}`;
}

registerCommand({
  type: DOODLE_COMMAND_TYPES.SCHOOL_YEAR_UPDATE,
  auditLabel: 'Update school year settings via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.SCHOOL_YEAR_UPDATE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    if (!command.patch || typeof command.patch !== 'object' || !Object.keys(command.patch).length) {
      return { ok: false, error: 'Settings patch is required' };
    }
    return { ok: true };
  },

  authorize(command, ctx) {
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
    if (command.schoolYearLabel || p.default_school_year) {
      fields.push({ label: 'School year', value: command.schoolYearLabel || p.default_school_year });
    }
    if (p.default_fall_term_start_date || p.default_fall_term_end_date) {
      fields.push({
        label: 'Fall term',
        value: `${formatDisplayDate(p.default_fall_term_start_date)} – ${formatDisplayDate(p.default_fall_term_end_date)}`,
      });
    }
    if (p.default_spring_term_start_date || p.default_spring_term_end_date) {
      fields.push({
        label: 'Spring term',
        value: `${formatDisplayDate(p.default_spring_term_start_date)} – ${formatDisplayDate(p.default_spring_term_end_date)}`,
      });
    }
    if (p.default_summer_term_start_date || p.default_summer_term_end_date) {
      fields.push({
        label: 'Summer range',
        value: `${formatDisplayDate(p.default_summer_term_start_date)} – ${formatDisplayDate(p.default_summer_term_end_date)}`,
      });
    }
    if (p.default_year_start_date || p.default_year_end_date) {
      fields.push({
        label: 'Year dates',
        value: `${formatDisplayDate(p.default_year_start_date)} – ${formatDisplayDate(p.default_year_end_date)}`,
      });
    }
    if (Array.isArray(p.allowed_weekdays)) {
      const labels = p.allowed_weekdays.map((d) => (
        typeof d === 'number' ? WEEKDAY_LABELS[d] : d
      ));
      fields.push({ label: 'Learning days', value: labels.join(', ') });
    }
    if (p.default_day_start_time || p.default_day_end_time) {
      fields.push({
        label: 'Learning hours',
        value: `${formatSqlTimeLabel(p.default_day_start_time)} – ${formatSqlTimeLabel(p.default_day_end_time)}`,
      });
    }
    if (p.default_planned_hours_per_day != null) {
      fields.push({ label: 'Hours per learning day', value: String(p.default_planned_hours_per_day) });
    }
    if (p.attendance_tracking_mode) {
      fields.push({
        label: 'Tracking mode',
        value: p.attendance_tracking_mode === 'subject' ? 'Per subject' : 'Total class days',
      });
    }
    if (p.default_constraint_mode === 'hours' && p.default_target_hours != null) {
      fields.push({ label: 'Attendance goal', value: `${p.default_target_hours} hours` });
    } else if (p.default_target_days != null) {
      fields.push({ label: 'Attendance goal', value: `${p.default_target_days} days` });
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
      command.schoolYearLabel || command.patch?.default_school_year || null,
    );
    if (result?.error) {
      return {
        ok: false,
        message: result.error?.message || 'Could not update school year settings.',
        error: 'execution',
      };
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
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
    return authorizeDayOffMutation(
      command,
      ctx,
      command?.editRow?.id ? 'update' : 'add',
    );
  },

  async validate(command) {
    if (!toYmd(command.startDate)) return { ok: false, error: 'Invalid start date.' };
    return { ok: true };
  },

  preview(command) {
    const rows = [
      { label: 'Title', value: command.title || 'Day off' },
      { label: 'Start', value: formatDisplayDate(command.startDate) },
      { label: 'End', value: formatDisplayDate(command.endDate || command.startDate) },
      { label: 'Repeat', value: 'Just once' },
      { label: 'School year', value: command.schoolYearLabel || 'Current' },
    ];
    if (command.editRow?.id) {
      rows.unshift({ label: 'Action', value: 'Update day off' });
    }
    if (Array.isArray(command.unsupportedExtras) && command.unsupportedExtras.length) {
      rows.push({
        label: 'Not saved',
        value: command.unsupportedExtras.join(', '),
      });
    }
    return rows;
  },

  async execute(command) {
    const { saveDayOff } = await import('../../create/saveDayOffHelpers.js');
    const isEdit = !!command.editRow?.id;
    try {
      await saveDayOff({
        familyId: command.householdId,
        schoolYearLabel: command.schoolYearLabel || null,
        title: command.title || 'Day off',
        startDate: command.startDate,
        endDate: command.endDate || command.startDate,
        editRow: command.editRow || null,
      });
    } catch (err) {
      return {
        ok: false,
        message: err?.message || `Could not ${isEdit ? 'update' : 'add'} day off.`,
        error: 'execution',
      };
    }
    const when = `${formatDisplayDate(command.startDate)}${command.endDate && command.endDate !== command.startDate ? ` – ${formatDisplayDate(command.endDate)}` : ''}`;
    return {
      ok: true,
      message: isEdit
        ? `Updated day off “${command.title || 'Day off'}” (${when}).`
        : `Added day off “${command.title || 'Day off'}” (${when}).`,
      affectedRecords: [{
        label: 'Open school year settings',
        href: '/settings',
        entityType: 'day_off',
      }],
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.DAY_OFF_DELETE,
  auditLabel: 'Delete day off via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.DAY_OFF_DELETE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    return requireString(command.exclusionId, 'Day off');
  },

  authorize(command, ctx) {
    return authorizeDayOffMutation(command, ctx, 'remove');
  },

  async validate() {
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Day off', value: command.title || 'Day off' },
      { label: 'Dates', value: command.whenLabel || '—' },
      { label: 'Action', value: 'Remove from school year' },
    ];
  },

  async execute(command) {
    const { deleteDayOff } = await import('../../create/saveDayOffHelpers.js');
    try {
      await deleteDayOff({ id: command.exclusionId });
    } catch (err) {
      return {
        ok: false,
        message: err?.message || 'Could not remove day off.',
        error: 'execution',
      };
    }
    return {
      ok: true,
      message: `Removed day off “${command.title || 'Day off'}”.`,
      affectedRecords: [{
        label: 'Open school year settings',
        href: '/settings',
        entityType: 'day_off',
      }],
    };
  },
});
