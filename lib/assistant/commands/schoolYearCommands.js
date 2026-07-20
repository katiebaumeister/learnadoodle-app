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
    const isRange = command.endDate && command.endDate !== command.startDate;
    const rows = [
      { label: 'Title', value: command.title || (isRange ? 'Break' : 'Day off') },
      { label: 'Start', value: formatDisplayDate(command.startDate) },
      { label: 'End', value: formatDisplayDate(command.endDate || command.startDate) },
      { label: 'Type', value: isRange ? 'Break (date range)' : 'Day off' },
      { label: 'School year', value: command.schoolYearLabel || 'Current' },
    ];
    if (command.editRow?.id) {
      rows.unshift({ label: 'Action', value: 'Update day off' });
    }
    if (command.eventHandling === 'move' && (command.conflictEventIds || []).length) {
      const n = command.conflictEventIds.length;
      rows.push({
        label: 'Learning',
        value: n === 1
          ? 'Move learning day to the day after'
          : `Move ${n} learning days to the day after`,
      });
    } else if (command.eventHandling === 'delete' && (command.conflictEventIds || []).length) {
      const n = command.conflictEventIds.length;
      rows.push({
        label: 'Learning',
        value: n === 1
          ? 'Delete the learning day'
          : `Delete ${n} learning days`,
      });
    } else if ((command.conflictEventIds || []).length) {
      rows.push({
        label: 'Learning',
        value: 'Leave scheduled learning as-is',
      });
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
    const isRange = command.endDate && command.endDate !== command.startDate;
    try {
      await saveDayOff({
        familyId: command.householdId,
        schoolYearLabel: command.schoolYearLabel || null,
        title: command.title || (isRange ? 'Break' : 'Day off'),
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

    let movedCount = 0;
    let deletedCount = 0;
    if (!isEdit && (command.conflictEventIds || []).length) {
      if (command.eventHandling === 'move') {
        movedCount = await moveLearningDaysAfterDayOff(
          command.conflictEventIds,
          command.endDate || command.startDate,
          command.householdId,
        );
      } else if (command.eventHandling === 'delete') {
        deletedCount = await deleteLearningDaysForDayOff(
          command.conflictEventIds,
          command.householdId,
        );
      }
    }

    if (typeof window !== 'undefined') {
      // Match DayOffCreateModal: exclusions cache (week “Day off” chips) + month refetch.
      window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
      window.dispatchEvent(new CustomEvent('refreshCalendar', {
        detail: { forceInvalidate: true },
      }));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
    }

    const when = `${formatDisplayDate(command.startDate)}${isRange ? ` – ${formatDisplayDate(command.endDate)}` : ''}`;
    const noun = isRange || /\bbreak\b/i.test(command.title || '') ? 'break' : 'day off';
    let message = isEdit
      ? `Updated ${noun} “${command.title || (isRange ? 'Break' : 'Day off')}” (${when}).`
      : `Added ${noun} “${command.title || (isRange ? 'Break' : 'Day off')}” (${when}).`;
    if (movedCount > 0) {
      message += movedCount === 1
        ? ' Moved the learning day to the day after.'
        : ` Moved ${movedCount} learning days to the day after.`;
    } else if (deletedCount > 0) {
      message += deletedCount === 1
        ? ' Deleted the learning day.'
        : ` Deleted ${deletedCount} learning days.`;
    }
    return {
      ok: true,
      message,
      affectedRecords: [{
        label: 'Open school year settings',
        href: '/settings',
        entityType: 'day_off',
      }],
    };
  },
});

async function moveLearningDaysAfterDayOff(eventIds, dayOffEndYmd, familyId) {
  const { executeChatUpdateEvent } = await import('../eventChatActions.js');
  const { supabase } = await import('../../supabase.js');
  const ids = [...new Set((eventIds || []).map(String).filter(Boolean))];
  if (!ids.length || !dayOffEndYmd) return 0;

  const { data: rows } = await supabase
    .from('events')
    .select('id,start_ts,end_ts,all_day')
    .in('id', ids)
    .eq('family_id', familyId)
    .is('deleted_at', null);

  const targetBase = new Date(`${dayOffEndYmd}T12:00:00`);
  targetBase.setDate(targetBase.getDate() + 1);
  let moved = 0;
  for (const row of (rows || [])) {
    if (!row?.start_ts) continue;
    const start = new Date(row.start_ts);
    const end = new Date(row.end_ts || row.start_ts);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    const durationMs = Math.max(end.getTime() - start.getTime(), 60 * 60 * 1000);
    const nextStart = new Date(targetBase);
    nextStart.setHours(
      start.getHours(),
      start.getMinutes(),
      start.getSeconds(),
      start.getMilliseconds(),
    );
    const nextEnd = new Date(nextStart.getTime() + durationMs);
    const result = await executeChatUpdateEvent(
      row.id,
      {
        start_ts: nextStart.toISOString(),
        end_ts: nextEnd.toISOString(),
        all_day: row.all_day === true,
      },
      true,
      familyId,
    );
    if (result?.success) moved += 1;
  }
  return moved;
}

async function deleteLearningDaysForDayOff(eventIds, familyId) {
  const { executeChatDeleteEvent } = await import('../eventChatActions.js');
  const ids = [...new Set((eventIds || []).map(String).filter(Boolean))];
  if (!ids.length || !familyId) return 0;
  let deleted = 0;
  for (const id of ids) {
    const result = await executeChatDeleteEvent(familyId, id);
    if (result?.success) deleted += 1;
  }
  return deleted;
}
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
      window.dispatchEvent(new CustomEvent('refreshCalendar', {
        detail: { forceInvalidate: true },
      }));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
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
