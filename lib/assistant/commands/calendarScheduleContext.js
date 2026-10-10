/**
 * Phase 2 — calendar-aware Doodle scheduling.
 * Lazy-loads short-horizon events / subject class windows, conflict-checks
 * timed create/move previews, and offers free-slot clarification chips.
 */

import { DOODLE_COMMAND_TYPES, DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { getCommand } from './registry.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';

const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const HORIZON_DAYS_BEHIND = 1;
const HORIZON_DAYS_AHEAD = 14;

const CALENDAR_AWARE_TYPES = new Set([
  DOODLE_COMMAND_TYPES.EVENT_CREATE,
  DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE,
  DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE,
  DOODLE_COMMAND_TYPES.LEARNING_DAY_UPDATE,
]);

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

function formatTimeLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function toYmd(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) {
    return value.slice(0, 10);
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function applyHmToDate(base, hm) {
  const d = base instanceof Date ? new Date(base.getTime()) : new Date(base);
  if (Number.isNaN(d.getTime())) return null;
  const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d;
}

/**
 * Load events in a short horizon for optional context / diagnostics.
 * Conflict checks use findEventConflict (day-scoped) separately.
 */
export async function loadShortHorizonEvents(familyId, {
  daysBehind = HORIZON_DAYS_BEHIND,
  daysAhead = HORIZON_DAYS_AHEAD,
} = {}) {
  if (!familyId) return [];
  const { supabase } = await import('../../supabase.js');
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - daysBehind);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  to.setDate(to.getDate() + daysAhead);

  const { data, error } = await supabase
    .from('events')
    .select('id, title, start_ts, end_ts, child_id, child_ids, subject_id, is_flexible, is_backlog, all_day, status, event_type')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .gte('start_ts', from.toISOString())
    .lte('start_ts', to.toISOString())
    .order('start_ts', { ascending: true })
    .limit(200);

  if (error || !Array.isArray(data)) return [];
  return data.filter((ev) => String(ev.status || '') !== 'canceled');
}

/**
 * Resolve the subject's usual class-meeting window from plan blocks.
 * @returns {Promise<null|{ weekdays: number[], startTimeHm: string, durationMinutes: number }>}
 */
export async function loadSubjectClassWindow(familyId, subjectId) {
  if (!familyId || !subjectId) return null;
  try {
    const { findAcademicYearPlanForSubject } = await import('../../subjectPlanSlotLines.js');
    const { buildInitialScheduleForm } = await import('../../subjectConfigureSchedule.js');
    const { academicYearId, planData } = await findAcademicYearPlanForSubject(familyId, subjectId);
    if (!planData) return null;
    const form = buildInitialScheduleForm({
      subject: { id: subjectId },
      planData,
      academicYearId,
      plannerSettings: null,
    });
    const startTimeHm = String(form.startTime || '').slice(0, 5);
    if (!startTimeHm || !/^\d{2}:\d{2}$/.test(startTimeHm)) return null;
    const weekdays = Array.isArray(form.weekdays) ? form.weekdays.map(Number).filter(Number.isFinite) : [];
    if (!weekdays.length) return null;
    const durationMinutes = Number(form.durationMinutes) > 0 ? Number(form.durationMinutes) : 60;
    return { weekdays, startTimeHm, durationMinutes };
  } catch (_) {
    return null;
  }
}

/** If dateYmd falls on a class weekday, return that day's meeting time. */
export function classWindowForDate(classWindow, dateYmd) {
  if (!classWindow?.startTimeHm || !dateYmd) return null;
  const d = new Date(`${String(dateYmd).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const dow = d.getDay();
  if (!Array.isArray(classWindow.weekdays) || !classWindow.weekdays.map(Number).includes(dow)) {
    return null;
  }
  return {
    startTimeHm: classWindow.startTimeHm,
    durationMinutes: classWindow.durationMinutes || 60,
  };
}

/**
 * Extract a timed window from an ACTION_PREVIEW command, or null when untimed/all-day.
 */
export function timedWindowFromPreviewCommand(command) {
  if (!command?.type) return null;

  if (command.type === DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE) {
    if (command.allDay || !command.startAt) return null;
    const start = new Date(command.startAt);
    const end = command.endAt
      ? new Date(command.endAt)
      : new Date(start.getTime() + DEFAULT_DURATION_MS);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return {
      startTs: start.toISOString(),
      endTs: end.toISOString(),
      childIds: command.childIds || [],
      excludeEventId: command.itemId || null,
      durationMs: Math.max(end.getTime() - start.getTime(), 15 * 60 * 1000),
    };
  }

  if (command.type === DOODLE_COMMAND_TYPES.EVENT_CREATE) {
    if (command.allDay === true || !command.startTimeHm) return null;
    const base = command.startAt
      ? new Date(command.startAt)
      : (command.date ? new Date(`${String(command.date).slice(0, 10)}T12:00:00`) : null);
    if (!base || Number.isNaN(base.getTime())) return null;
    const start = applyHmToDate(base, command.startTimeHm);
    if (!start) return null;
    let end;
    if (command.endTimeHm) {
      end = applyHmToDate(base, command.endTimeHm);
      if (end && end <= start) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
    }
    if (!end) {
      const mins = command.durationMinutes || 60;
      end = new Date(start.getTime() + mins * 60 * 1000);
    }
    return {
      startTs: start.toISOString(),
      endTs: end.toISOString(),
      childIds: command.childIds || [],
      excludeEventId: null,
      durationMs: Math.max(end.getTime() - start.getTime(), 15 * 60 * 1000),
    };
  }

  if (
    command.type === DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE
    || command.type === DOODLE_COMMAND_TYPES.LEARNING_DAY_UPDATE
  ) {
    const patch = command.patch || {};
    const startTimeHm = command.startTimeHm || patch.startTimeHm || null;
    if (!startTimeHm) return null;
    const dateYmd = command.date || patch.date || toYmd(command.startAt);
    if (!dateYmd) return null;
    const start = applyHmToDate(new Date(`${dateYmd}T12:00:00`), startTimeHm);
    if (!start) return null;
    const durationMinutes = command.durationMinutes || patch.durationMinutes || 60;
    const end = new Date(start.getTime() + Number(durationMinutes) * 60 * 1000);
    return {
      startTs: start.toISOString(),
      endTs: end.toISOString(),
      childIds: command.childIds || [],
      excludeEventId: command.eventId || command.itemId || null,
      durationMs: Math.max(end.getTime() - start.getTime(), 15 * 60 * 1000),
    };
  }

  return null;
}

function intentForCommandType(type) {
  if (type === DOODLE_COMMAND_TYPES.EVENT_CREATE) return 'event.create';
  if (type === DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE) return 'planner.item.move';
  if (type === DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE) return 'learning_day.create';
  if (type === DOODLE_COMMAND_TYPES.LEARNING_DAY_UPDATE) return 'learning_day.update';
  return type;
}

function draftFromCommand(command, window) {
  const dateYmd = toYmd(window?.startTs || command.startAt || command.date);
  const base = {
    skipConflictCheck: false,
    date: dateYmd,
    childIds: command.childIds || undefined,
    title: command.title || undefined,
    subjectId: command.subjectId || undefined,
    durationMinutes: command.durationMinutes || undefined,
    durationMs: window?.durationMs || undefined,
  };

  if (command.type === DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE) {
    return {
      ...base,
      itemId: command.itemId,
      itemTitle: command.itemTitle,
      originalStartAt: command.startAt,
      allDay: command.allDay === true,
      startAt: command.startAt,
      endAt: command.endAt,
    };
  }
  if (command.type === DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE) {
    return {
      ...base,
      subjectId: command.subjectId,
      childIds: command.childIds,
      dates: command.dates,
      createLesson: command.createLesson,
      lessonTitle: command.lessonTitle,
      startTimeHm: command.startTimeHm,
      durationMinutes: command.durationMinutes,
      title: command.title,
      description: command.description,
      attachmentId: command.attachmentId,
      fileName: command.fileName,
      mime: command.mime,
      bytes: command.bytes,
    };
  }
  if (command.type === DOODLE_COMMAND_TYPES.LEARNING_DAY_UPDATE) {
    return {
      ...base,
      eventId: command.eventId || command.itemId,
      itemId: command.eventId || command.itemId,
      eventTitle: command.eventTitle || command.itemTitle,
      patch: {
        ...(command.patch || {}),
        startTimeHm: command.patch?.startTimeHm || command.startTimeHm,
        date: command.patch?.date || dateYmd,
      },
    };
  }
  return {
    ...base,
    title: command.title,
    startAt: command.startAt,
    endAt: command.endAt,
    startTimeHm: command.startTimeHm,
    endTimeHm: command.endTimeHm,
    location: command.location,
    description: command.description,
    recurrenceRule: command.recurrenceRule,
    attachmentId: command.attachmentId,
    fileName: command.fileName,
    mime: command.mime,
    bytes: command.bytes,
  };
}

export function buildConflictClarification({
  conflict,
  command,
  originalMessage,
  window,
}) {
  const titles = (conflict.conflicts || []).map((c) => c.title).filter(Boolean);
  const overlapLabel = titles.length
    ? titles.slice(0, 2).join(' and ')
    : 'another timed event';
  const options = [];

  if (conflict.suggestion?.start) {
    const hm = `${String(conflict.suggestion.start.getHours()).padStart(2, '0')}:${String(conflict.suggestion.start.getMinutes()).padStart(2, '0')}`;
    options.push({
      id: 'free-slot',
      label: formatTimeLabel(conflict.suggestion.start) || hm,
      value: hm,
      field: 'time',
    });
    const later = new Date(conflict.suggestion.start.getTime() + 60 * 60 * 1000);
    if (later.getHours() < 21) {
      const hm2 = `${String(later.getHours()).padStart(2, '0')}:${String(later.getMinutes()).padStart(2, '0')}`;
      options.push({
        id: 'free-slot-later',
        label: formatTimeLabel(later) || hm2,
        value: hm2,
        field: 'time',
      });
    }
  }

  options.push({
    id: 'keep-time',
    label: 'Keep this time',
    value: 'keep',
    field: 'conflictResolution',
  });

  const suggestionNote = conflict.suggestion?.start
    ? ` Next free slot: ${formatTimeLabel(conflict.suggestion.start)}.`
    : ' No free slot later today — try another day or keep this time.';

  return withClarificationMeta(assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
    message: `That time overlaps ${overlapLabel}.${suggestionNote}`,
    options,
  }), {
    intent: intentForCommandType(command.type),
    field: conflict.suggestion?.start ? 'time' : 'conflictResolution',
    originalMessage,
    draft: draftFromCommand(command, window),
    fromConflict: true,
  });
}

async function preferClassWindowOnLearningDay(response, familyId) {
  const command = response?.command;
  if (!command || command.type !== DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE) {
    return { response, usedSchedule: false };
  }
  if (command.startTimeHm) return { response, usedSchedule: false };

  const classWindow = await loadSubjectClassWindow(familyId, command.subjectId);
  if (!classWindow) return { response, usedSchedule: false };

  const dates = Array.isArray(command.dates) && command.dates.length
    ? command.dates
    : (command.date ? [command.date] : []);
  const primary = dates[0] || command.date;
  const match = classWindowForDate(classWindow, primary);
  if (!match) return { response, usedSchedule: false };

  const nextCommand = {
    ...command,
    startTimeHm: match.startTimeHm,
    durationMinutes: command.durationMinutes || match.durationMinutes,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE);
  const warnings = [
    ...(Array.isArray(response.warnings) ? response.warnings : []),
    `Using usual class time (${match.startTimeHm}).`,
  ];
  return {
    response: {
      ...response,
      command: nextCommand,
      preview: handler.preview(nextCommand),
      warnings,
    },
    usedSchedule: true,
  };
}

/**
 * Enrich ACTION_PREVIEW with class-window defaults + conflict clarification.
 * Best-effort: on fetch failure, returns the original preview.
 */
export async function enrichWithCalendarAwareness(response, {
  ctx,
  originalMessage,
  conversationId = null,
  skipConflictCheck = false,
} = {}) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) return response;
  const command = response.command;
  if (!command || !CALENDAR_AWARE_TYPES.has(command.type)) return response;
  if (!ctx?.householdId) return response;

  const draftSkip = skipConflictCheck
    || response?.command?.skipConflictCheck === true
    || false;

  let next = response;
  let usedCalendar = false;

  try {
    if (command.type === DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE && !command.startTimeHm) {
      const applied = await preferClassWindowOnLearningDay(next, ctx.householdId);
      next = applied.response;
      usedCalendar = usedCalendar || applied.usedSchedule;
    }

    if (!draftSkip) {
      const window = timedWindowFromPreviewCommand(next.command);
      if (window) {
        usedCalendar = true;
        const { findEventConflict } = await import('../../create/eventConflictHelpers.js');
        const conflict = await findEventConflict({
          familyId: ctx.householdId,
          childIds: window.childIds,
          startTs: window.startTs,
          endTs: window.endTs,
          excludeEventId: window.excludeEventId,
        });
        if (conflict) {
          meterDoodleAiUsage({
            familyId: ctx.householdId,
            conversationId,
            actionType: 'chatbotPlannerAware',
            idempotencyKey: `doodle-cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            metadata: {
              reason: 'conflict_check',
              commandType: next.command.type,
              conflictCount: conflict.conflicts?.length || 0,
            },
          }).catch(() => {});
          return buildConflictClarification({
            conflict,
            command: next.command,
            originalMessage: originalMessage || '',
            window,
          });
        }
      }
    }
  } catch (_) {
    return response;
  }

  if (usedCalendar) {
    meterDoodleAiUsage({
      familyId: ctx.householdId,
      conversationId,
      actionType: 'chatbotPlannerAware',
      idempotencyKey: `doodle-cal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      metadata: {
        reason: 'schedule_context',
        commandType: next.command?.type,
      },
    }).catch(() => {});
    next = { ...next, calendarAware: true };
  }

  return next;
}
