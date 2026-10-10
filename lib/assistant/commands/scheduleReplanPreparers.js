/**
 * Phase 2 — Doodle day/week replan + bulk unfinished moves (confirmable batch).
 */

import { DOODLE_COMMAND_TYPES, DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { newIdempotencyKey } from './commandUtils.js';
import { resolveChildByName } from './entityResolve.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';
import {
  toLocalYmd,
  addDaysYmd,
  startOfWeekMonday,
  parseBlockedWindowsFromMessage,
  parsePreferMorningSubjects,
  packDaySchedule,
  proposeBulkMoveToNextWeek,
  formatMovePreviewLine,
  formatTimeLabel,
} from './scheduleReplanHelpers.js';

async function resolveDay(text, fromDate = new Date()) {
  const { resolveFlexibleDay } = await import('./intentPreparers.js');
  return resolveFlexibleDay(text, fromDate);
}

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

async function loadEventsForRange(familyId, fromYmd, toYmd) {
  if (!familyId) return [];
  try {
    const { supabase } = await import('../../supabase.js');
    const from = new Date(`${fromYmd}T00:00:00`);
    from.setHours(from.getHours() - 12);
    const to = new Date(`${toYmd}T23:59:59`);
    to.setHours(to.getHours() + 12);
    const { data, error } = await supabase
      .from('events')
      .select('id, title, start_ts, end_ts, child_id, child_ids, subject_id, is_flexible, is_backlog, all_day, status, event_type, minutes, counts_toward_plan, deleted_at')
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .gte('start_ts', from.toISOString())
      .lte('start_ts', to.toISOString())
      .order('start_ts', { ascending: true })
      .limit(250);
    if (error || !Array.isArray(data)) return [];
    return data.filter((ev) => String(ev.status || '') !== 'canceled');
  } catch (_) {
    return [];
  }
}

async function resolveTargetDay(message, overrides = {}) {
  if (overrides.date && /^\d{4}-\d{2}-\d{2}$/.test(String(overrides.date).slice(0, 10))) {
    return String(overrides.date).slice(0, 10);
  }
  const m = String(message || '').match(
    /\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+\w+)\b/i,
  );
  if (m) {
    const ymd = await resolveDay(m[1], new Date());
    if (ymd) return ymd;
  }
  return toLocalYmd(new Date());
}

function resolveChildIds(message, ctx, roster, overrides = {}) {
  if (overrides.childIds?.length) return overrides.childIds.map(String);
  if (ctx.selectedChildIds?.length) return ctx.selectedChildIds.map(String);
  const forMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if (forMatch) {
    const resolved = resolveChildByName(forMatch[1], roster.children || []);
    if (resolved.clarification) return { clarification: resolved.clarification };
    if (resolved.ok) return [String(resolved.child.id)];
  }
  // “Emma and Noah”
  const names = String(message || '').match(/\bfor\s+([A-Za-z][A-Za-z'-]*(?:\s+and\s+[A-Za-z][A-Za-z'-]*)+)/i);
  if (names) {
    const parts = names[1].split(/\s+and\s+/i);
    const ids = [];
    for (const part of parts) {
      const resolved = resolveChildByName(part.trim(), roster.children || []);
      if (resolved.ok) ids.push(String(resolved.child.id));
    }
    if (ids.length) return ids;
  }
  return (roster.children || []).map((c) => String(c.id));
}

function filterEventsForChildren(events, childIds) {
  if (!childIds?.length) return events;
  const set = new Set(childIds.map(String));
  return events.filter((ev) => {
    if (ev.child_id && set.has(String(ev.child_id))) return true;
    if (Array.isArray(ev.child_ids) && ev.child_ids.some((id) => set.has(String(id)))) return true;
    if (!ev.child_id && (!ev.child_ids || !ev.child_ids.length)) return true;
    return false;
  });
}

function buildBatchPreview(moves, message, warnings = []) {
  const commands = moves.map((m) => ({
    type: DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE,
    itemId: m.eventId,
    itemTitle: m.title,
    startAt: m.startAt,
    endAt: m.endAt,
    allDay: m.allDay === true,
    originalStartAt: m.originalStartAt || null,
    originalEndAt: m.originalEndAt || null,
    originalAllDay: false,
    durationMs: m.durationMs,
  }));

  const preview = moves.map((m, index) => ({
    title: m.title,
    description: formatMovePreviewLine(m),
    commandIndex: index,
  }));

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.BATCH_ACTION_PREVIEW,
    message,
    commands,
    preview,
    warnings: warnings.length ? warnings : undefined,
    confirmationLabel: moves.length === 1 ? 'Confirm change' : `Apply ${moves.length} changes`,
    idempotencyKey: newIdempotencyKey('replan'),
  });
}

export function isDayReplanIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|explain)\b/.test(lower)) return false;
  if (/\bplan\s+(my\s+|our\s+|the\s+)?week\b/.test(lower)) return false;
  return (
    (/\b(move|replan|rearrange|reshuffle|shift)\b/.test(lower)
      && /\b(lesson|lessons|schedule|day|around|learning)\b/.test(lower))
    || (/\b(dentist|doctor|appointment)\b/.test(lower)
      && /\b(move|around|replan|reschedule|keep)\b/.test(lower))
    || /\breplan\s+(today|tomorrow|this\s+day)\b/.test(lower)
  );
}

export function isPlanWeekIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|explain)\b/.test(lower)) return false;
  // Themed project weeks are handled by themeProjectPreparers.
  if (/\b(project\s+week|themed\s+week|theme\s+week|cross[- ]subject|-themed)\b/.test(lower)) {
    return false;
  }
  return (
    /\bplan\s+(my\s+|our\s+|the\s+)?(next\s+)?week\b/.test(lower)
    || /\bhomeschool\s+schedule\b/.test(lower) && /\b(week|weekly)\b/.test(lower)
    || /\bpack\s+(this|my|our|the)\s+week\b/.test(lower)
  );
}

export function isBulkRescheduleIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  return (
    /\b(move|push|reschedule)\s+all\b/.test(lower)
    || (/\ball\b/.test(lower) && /\b(unfinished|incomplete|open)\b/.test(lower)
      && /\b(assignment|homework|lesson|math|history|science)\b/.test(lower))
  );
}

export async function prepareDayReplan(message, ctx, roster = {}, overrides = {}, opts = {}) {
  const dayYmd = await resolveTargetDay(message, overrides);
  const childIdsOrClar = resolveChildIds(message, ctx, roster, overrides);
  if (childIdsOrClar?.clarification) {
    return withClarificationMeta(assertDoodleResponse(childIdsOrClar.clarification), {
      intent: 'planner.day.replan',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, date: dayYmd },
    });
  }
  const childIds = childIdsOrClar;

  const events = await loadEventsForRange(ctx.householdId, dayYmd, dayYmd);
  const scoped = filterEventsForChildren(events, childIds);
  const blocked = parseBlockedWindowsFromMessage(message, dayYmd);
  const preferMorningSubjectIds = parsePreferMorningSubjects(message, roster.subjects || []);

  // Inject existing appointment-like events as blocked if message mentions dentist/doctor
  if (/\b(dentist|doctor|appointment)\b/i.test(message)) {
    for (const ev of scoped) {
      const t = String(ev.title || '').toLowerCase();
      if (/\b(dentist|doctor|appointment)\b/.test(t) && ev.start_ts && ev.end_ts) {
        blocked.push({
          start: new Date(ev.start_ts),
          end: new Date(ev.end_ts),
          startMin: 0,
          endMin: 0,
          label: ev.title || 'Appointment',
        });
      }
    }
  }

  const packed = packDaySchedule({
    dayYmd,
    events: scoped,
    blockedWindows: blocked,
    preferMorningSubjectIds,
  });

  meterDoodleAiUsage({
    familyId: ctx.householdId,
    conversationId: opts.conversationId || null,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-replan-${Date.now()}`,
    metadata: { reason: 'day_replan', moves: packed.moves.length },
  }).catch(() => {});

  if (!packed.moves.length) {
    const blockedNote = blocked.length
      ? ` Blocked: ${blocked.map((b) => `${b.label || 'time'} ${formatTimeLabel(b.start)}`).join(', ')}.`
      : '';
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: `No lesson moves needed for ${dayYmd}.${blockedNote} Everything already fits, or there were no movable lessons.`,
      links: [
        { label: 'Open Planner', href: '/planner?view=board' },
        { label: 'Open Catch Up', href: '#planner-smart-action/catch-up' },
      ],
    });
  }

  const header = [
    `Proposed schedule for ${dayYmd} (${packed.moves.length} move${packed.moves.length === 1 ? '' : 's'}):`,
    ...packed.moves.map((m) => `• ${formatMovePreviewLine(m)}`),
  ].join('\n');

  return buildBatchPreview(packed.moves, header, packed.warnings);
}

export async function preparePlanWeek(message, ctx, roster = {}, overrides = {}, opts = {}) {
  const childIdsOrClar = resolveChildIds(message, ctx, roster, overrides);
  if (childIdsOrClar?.clarification) {
    return withClarificationMeta(assertDoodleResponse(childIdsOrClar.clarification), {
      intent: 'planner.week.plan',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  const childIds = childIdsOrClar;
  const weekStart = /\bnext\s+week\b/i.test(message)
    ? addDaysYmd(startOfWeekMonday(new Date()), 7)
    : startOfWeekMonday(new Date());
  const weekEnd = addDaysYmd(weekStart, 4); // Mon–Fri

  const events = await loadEventsForRange(ctx.householdId, weekStart, weekEnd);
  const scoped = filterEventsForChildren(events, childIds);
  const preferMorningSubjectIds = parsePreferMorningSubjects(message, roster.subjects || []);

  const allMoves = [];
  const warnings = [];
  for (let i = 0; i < 5; i += 1) {
    const dayYmd = addDaysYmd(weekStart, i);
    const dayEvents = scoped.filter((ev) => toLocalYmd(new Date(ev.start_ts)) === dayYmd);
    if (!dayEvents.length) continue;
    const blocked = parseBlockedWindowsFromMessage(message, dayYmd);
    const packed = packDaySchedule({
      dayYmd,
      events: dayEvents,
      blockedWindows: blocked,
      preferMorningSubjectIds,
    });
    allMoves.push(...packed.moves);
    warnings.push(...packed.warnings);
  }

  meterDoodleAiUsage({
    familyId: ctx.householdId,
    conversationId: opts.conversationId || null,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-planweek-${Date.now()}`,
    metadata: { reason: 'plan_week', moves: allMoves.length, weekStart },
  }).catch(() => {});

  if (!allMoves.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: `I looked at ${weekStart}–${weekEnd}. No reschedule moves were needed. You can also open Pack This Week for AI suggestions.`,
      links: [
        { label: 'Pack this week', href: '#planner-smart-action/pack-week' },
        { label: 'Open Catch Up', href: '#planner-smart-action/catch-up' },
        { label: 'Open Planner', href: '/planner?view=board' },
      ],
    });
  }

  const header = [
    `Plan for week of ${weekStart} — ${allMoves.length} proposed move${allMoves.length === 1 ? '' : 's'}:`,
    ...allMoves.slice(0, 12).map((m) => `• ${formatMovePreviewLine(m)}`),
    allMoves.length > 12 ? `• …and ${allMoves.length - 12} more` : null,
  ].filter(Boolean).join('\n');

  return buildBatchPreview(allMoves, header, warnings);
}

export async function prepareBulkReschedule(message, ctx, roster = {}, overrides = {}, opts = {}) {
  const childIdsOrClar = resolveChildIds(message, ctx, roster, overrides);
  if (childIdsOrClar?.clarification) {
    return withClarificationMeta(assertDoodleResponse(childIdsOrClar.clarification), {
      intent: 'planner.bulk.move',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  const childIds = childIdsOrClar;
  const weekStart = startOfWeekMonday(new Date());
  const from = addDaysYmd(weekStart, -7);
  const to = addDaysYmd(weekStart, 6);
  const events = await loadEventsForRange(ctx.householdId, from, to);
  let scoped = filterEventsForChildren(events, childIds);

  // Subject filter
  const subjectHit = (roster.subjects || []).find((s) => {
    const name = String(s.name || s.title || '').toLowerCase();
    return name && new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message);
  });
  if (subjectHit) {
    scoped = scoped.filter((ev) => String(ev.subject_id) === String(subjectHit.id));
  } else if (/\bmath\b/i.test(message)) {
    const math = (roster.subjects || []).find((s) => /\bmath/i.test(String(s.name || '')));
    if (math) scoped = scoped.filter((ev) => String(ev.subject_id) === String(math.id));
  }

  // Unfinished only
  if (/\b(unfinished|incomplete|open|not\s+done)\b/i.test(message)) {
    scoped = scoped.filter((ev) => String(ev.status || '') !== 'done' && String(ev.status || '') !== 'completed');
  }

  // Prefer assignment-like / learning
  scoped = scoped.filter((ev) => {
    const type = String(ev.event_type || '').toLowerCase();
    return ev.subject_id || type.includes('assign') || type.includes('lesson') || type.includes('class');
  });

  if (!scoped.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: 'I couldn’t find unfinished items matching that request to move.',
      links: [{ label: 'Open Planner', href: '/planner?view=board' }],
    });
  }

  const items = scoped.slice(0, 20).map((ev) => ({
    id: ev.id,
    eventId: ev.id,
    title: ev.title,
    start_ts: ev.start_ts,
    end_ts: ev.end_ts,
    durationMs: ev.start_ts && ev.end_ts
      ? Math.max(15 * 60 * 1000, new Date(ev.end_ts) - new Date(ev.start_ts))
      : 45 * 60 * 1000,
  }));

  const { moves, nextMonday } = proposeBulkMoveToNextWeek({
    items,
    fromWeekStartYmd: weekStart,
  });

  meterDoodleAiUsage({
    familyId: ctx.householdId,
    conversationId: opts.conversationId || null,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-bulk-${Date.now()}`,
    metadata: { reason: 'bulk_reschedule', moves: moves.length },
  }).catch(() => {});

  if (!moves.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: 'Could not place those items into next week’s mornings.',
    });
  }

  const header = [
    `Move ${moves.length} item${moves.length === 1 ? '' : 's'} into the week of ${nextMonday}:`,
    ...moves.slice(0, 10).map((m) => `• ${m.title} → ${m.dueYmd} ${formatTimeLabel(new Date(m.startAt))}`),
  ].join('\n');

  return buildBatchPreview(moves, header);
}
