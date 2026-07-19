import { DOODLE_COMMAND_TYPES } from './types.js';
import { registerCommand } from './registry.js';
import { formatDisplayDate, requireHouseholdMatch, requireString } from './commandUtils.js';

registerCommand({
  type: DOODLE_COMMAND_TYPES.ATTENDANCE_MARK,
  auditLabel: 'Mark attendance via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.ATTENDANCE_MARK) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const date = requireString(command.date, 'Date');
    if (!date.ok) return date;
    if (!Array.isArray(command.childIds) || command.childIds.length === 0) {
      return { ok: false, error: 'At least one student is required' };
    }
    if (!['present', 'absent', 'partial'].includes(command.status)) {
      return { ok: false, error: 'Status must be present, absent, or partial' };
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showAttendance === false) {
      return { ok: false, error: 'Attendance tracking is not enabled for this household.' };
    }
    if (caps.canManageEvents === false && ctx.userRole !== 'parent') {
      return { ok: false, error: 'You do not have permission to mark attendance.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(command.date)) {
      return { ok: false, error: 'Date must be YYYY-MM-DD.' };
    }
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Date', value: formatDisplayDate(command.date), fieldPath: 'date' },
      { label: 'Status', value: command.status, fieldPath: 'status' },
      { label: 'Students', value: `${command.childIds.length} selected`, fieldPath: 'childIds' },
    ];
  },

  async execute(command) {
    const { executeMarkAttendanceRpc } = await import('../attendanceChatActions.js');
    const results = [];
    for (const childId of command.childIds) {
      const uiStatus = command.status === 'partial' ? 'present' : command.status;
      const result = await executeMarkAttendanceRpc(
        command.householdId,
        childId,
        command.date,
        uiStatus,
      );
      if (!result.success) {
        return {
          ok: false,
          message: result.error || 'Could not mark attendance.',
          error: 'execution',
        };
      }
      results.push(childId);
    }
    return {
      ok: true,
      message: `Marked ${command.status} for ${results.length} learner${results.length === 1 ? '' : 's'} on ${formatDisplayDate(command.date)}.`,
      affectedRecords: [{
        label: 'Open attendance',
        href: '/planner?view=year',
        entityType: 'attendance',
      }],
      resultData: { childIds: results, date: command.date, status: command.status },
    };
  },
});

registerCommand({
  type: DOODLE_COMMAND_TYPES.ATTENDANCE_MARK_RANGE,
  auditLabel: 'Mark learning-day range attended via Doodle',

  schema(command) {
    if (command?.type !== DOODLE_COMMAND_TYPES.ATTENDANCE_MARK_RANGE) {
      return { ok: false, error: 'Wrong command type' };
    }
    const household = requireString(command.householdId, 'Household');
    if (!household.ok) return household;
    const start = requireString(command.startDate, 'Start date');
    if (!start.ok) return start;
    const end = requireString(command.endDate, 'End date');
    if (!end.ok) return end;
    if (!Array.isArray(command.eventIds) || command.eventIds.length === 0) {
      return { ok: false, error: 'No learning days to mark' };
    }
    return { ok: true };
  },

  authorize(command, ctx, caps = {}) {
    if (caps.showAttendance === false) {
      return { ok: false, error: 'Attendance tracking is not enabled for this household.' };
    }
    if (caps.canManageEvents === false && ctx.userRole !== 'parent') {
      return { ok: false, error: 'You do not have permission to mark attendance.' };
    }
    return requireHouseholdMatch(command.householdId, ctx);
  },

  async validate(command) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(command.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(command.endDate)) {
      return { ok: false, error: 'Dates must be YYYY-MM-DD.' };
    }
    if (command.startDate > command.endDate) {
      return { ok: false, error: 'Start date must be on or before end date.' };
    }
    return { ok: true };
  },

  preview(command) {
    return [
      { label: 'Range', value: command.rangeLabel || `${formatDisplayDate(command.startDate)} – ${formatDisplayDate(command.endDate)}` },
      { label: 'Learning days', value: String(command.eventCount || command.eventIds?.length || 0) },
      { label: 'Status', value: 'attended' },
      { label: 'Students', value: `${(command.childIds || []).length} selected` },
    ];
  },

  async execute(command) {
    const { completeEvent } = await import('../../services/attendanceClient.js');
    const { notifyEventAttendancePatched } = await import('./uiNotify.js');
    const ids = Array.isArray(command.eventIds) ? command.eventIds.map(String) : [];
    let succeeded = 0;
    let failed = 0;
    for (const eventId of ids) {
      const { error } = await completeEvent(eventId, null, { requirePersist: true });
      if (error) {
        failed += 1;
        continue;
      }
      succeeded += 1;
      notifyEventAttendancePatched(eventId, 'done', { refresh: false });
    }
    if (succeeded > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipCacheClear: true } }));
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
      window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
    }
    if (succeeded === 0) {
      return {
        ok: false,
        message: failed
          ? 'Could not mark those learning days attended. Try Planner → Year → Attendance check.'
          : 'No learning days were updated.',
        error: 'execution',
      };
    }
    return {
      ok: true,
      message: `Marked ${succeeded} learning day${succeeded === 1 ? '' : 's'} attended${failed ? ` (${failed} failed)` : ''}.`,
      affectedRecords: [{
        label: 'Open attendance',
        href: '/planner?view=year',
        entityType: 'attendance',
      }],
      resultData: {
        succeeded,
        failed,
        startDate: command.startDate,
        endDate: command.endDate,
      },
    };
  },
});
