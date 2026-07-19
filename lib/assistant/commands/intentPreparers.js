/**
 * Natural-language → action_preview / clarification for MVP Doodle intents.
 */
import { DOODLE_COMMAND_TYPES, DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { getCommand } from './registry.js';
import {
  formatDisplayDate,
  isAllDayLike,
  newIdempotencyKey,
  toAllDayBounds,
  toYmd,
} from './commandUtils.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';

function withClarificationMeta(response, meta) {
  if (response.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

function parseAttendanceStatus(message) {
  const lower = message.toLowerCase();
  if (/\babsent\b/.test(lower)) return 'absent';
  if (/\bpartial\b|\bhalf\b/.test(lower)) return 'partial';
  return 'present';
}

function resolveAttendanceChildIds(message, ctx, roster, overrides = {}) {
  let childIds = overrides.childIds || [];
  if (!childIds.length) {
    const nameMatch = message.match(/\b(?:for|mark)\s+([A-Za-z][A-Za-z'-]*)\b/i);
    if (nameMatch && !/^(mark|present|absent|attendance|attended|today|yesterday|all|every)$/i.test(nameMatch[1])) {
      const resolved = resolveChildByName(nameMatch[1], roster.children);
      if (resolved.clarification) {
        return {
          childIds: [],
          clarification: withClarificationMeta(assertDoodleResponse(resolved.clarification), {
            intent: overrides.rangeIntent || 'attendance.mark',
            field: 'childId',
            originalMessage: message,
            draft: { ...overrides },
          }),
        };
      }
      if (resolved.ok) childIds = [String(resolved.child.id)];
    }
  }
  if (!childIds.length && ctx.selectedChildIds?.length) childIds = [...ctx.selectedChildIds];
  if (!childIds.length && roster.children?.length === 1) childIds = [String(roster.children[0].id)];
  if (!childIds.length && roster.children?.length) {
    // Bulk “all …” without a name → every learner
    if (/\b(all|every|entire)\b/i.test(message)) {
      childIds = roster.children.map((c) => String(c.id));
    }
  }
  if (!childIds.length) {
    return {
      childIds: [],
      clarification: withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which student should I mark attendance for?',
        options: (roster.children || []).map((c) => ({
          id: String(c.id),
          label: c.first_name || c.name || 'Student',
          value: String(c.id),
          field: 'childId',
        })),
      }), {
        intent: overrides.rangeIntent || 'attendance.mark',
        field: 'childId',
        originalMessage: message,
        draft: { ...overrides },
      }),
    };
  }
  return { childIds, clarification: null };
}

export async function prepareAttendanceMarkRange(message, ctx, roster, overrides = {}) {
  const {
    parseAttendanceRange,
    fetchUnattendedLearningEventsInRange,
  } = await import('../attendanceChatActions.js');

  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('attendance')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Attendance tracking is not enabled for this household.',
      recoverable: false,
    });
  }

  const range = overrides.startDate && overrides.endDate
    ? {
      startDate: overrides.startDate,
      endDate: overrides.endDate,
      label: overrides.rangeLabel || `${overrides.startDate} → ${overrides.endDate}`,
    }
    : parseAttendanceRange(message);
  if (!range) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which days should I mark attended? Try “mark all July learning days as attended” or “mark this month’s lessons attended”.',
    });
  }

  const resolvedKids = resolveAttendanceChildIds(message, ctx, roster, {
    ...overrides,
    rangeIntent: 'attendance.mark_range',
    startDate: range.startDate,
    endDate: range.endDate,
    rangeLabel: range.label,
  });
  if (resolvedKids.clarification) return resolvedKids.clarification;
  const childIds = resolvedKids.childIds;

  const { events, error } = await fetchUnattendedLearningEventsInRange(ctx.householdId, {
    startDate: range.startDate,
    endDate: range.endDate,
    childIds,
  });
  if (error) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not load learning days: ${error}`,
      recoverable: true,
    });
  }

  const eventIds = events.map((e) => String(e.id));
  if (!eventIds.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: `No unattended learning days found for ${range.label} (through today). Everything in that range may already be marked, or nothing was scheduled.`,
      links: [{ label: 'Open Planner (Year)', href: '/planner?view=year' }],
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.ATTENDANCE_MARK_RANGE,
    householdId: ctx.householdId,
    childIds,
    startDate: range.startDate,
    endDate: range.endDate,
    rangeLabel: range.label,
    status: 'present',
    eventIds,
    eventCount: eventIds.length,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.ATTENDANCE_MARK_RANGE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: `Mark ${eventIds.length} learning day${eventIds.length === 1 ? '' : 's'} attended`,
    command,
    preview: handler.preview(command),
    warnings: ['Only past scheduled lessons / learning days are marked. Future days are skipped.'],
    confirmationLabel: 'Mark attended',
    idempotencyKey: newIdempotencyKey('attendance_range'),
  });
}

export function prepareAttendanceMark(message, ctx, roster, overrides = {}) {
  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('attendance')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Attendance tracking is not enabled for this household.',
      recoverable: false,
    });
  }

  const resolvedKids = resolveAttendanceChildIds(message, ctx, roster, overrides);
  if (resolvedKids.clarification) return resolvedKids.clarification;
  const childIds = resolvedKids.childIds;

  const status = overrides.status || parseAttendanceStatus(message);
  let dateISO = overrides.date;
  if (!dateISO) {
    // sync parse from attendance helpers without pulling supabase at import
    const iso = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (iso) dateISO = iso[1];
    else {
      const d = new Date();
      if (/\byesterday\b/i.test(message)) d.setDate(d.getDate() - 1);
      dateISO = toYmd(d);
    }
  }

  const child = (roster.children || []).find((c) => String(c.id) === String(childIds[0]));
  const command = {
    type: DOODLE_COMMAND_TYPES.ATTENDANCE_MARK,
    householdId: ctx.householdId,
    childIds,
    date: dateISO,
    status,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.ATTENDANCE_MARK);
  const preview = handler.preview(command).map((f) => (
    f.fieldPath === 'childIds' && child
      ? { ...f, value: child.first_name || child.name }
      : f
  ));

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Mark attendance',
    command,
    preview,
    confirmationLabel: 'Mark attendance',
    idempotencyKey: newIdempotencyKey('attendance'),
  });
}

export function prepareDayOffCreate(message, ctx, overrides = {}) {
  let title =
    overrides.title ||
    message.match(/\b(?:called|named|titled)\s+(.+)$/i)?.[1]?.replace(/[.?!].*$/, '').trim() ||
    (/\bholiday\b/i.test(message) ? 'Holiday' : null) ||
    'Day off';
  title = String(title)
    .replace(/\b(today|tomorrow|yesterday)\b/gi, '')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || 'Day off';

  let startDate = overrides.startDate;
  if (!startDate) {
    const iso = message.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (iso) startDate = iso[1];
    else {
      const d = new Date();
      if (/\btomorrow\b/i.test(message)) d.setDate(d.getDate() + 1);
      startDate = toYmd(d);
    }
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.DAY_OFF_CREATE,
    householdId: ctx.householdId,
    schoolYearLabel: ctx.schoolYearLabel,
    title: String(title).trim(),
    startDate,
    endDate: overrides.endDate || startDate,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.DAY_OFF_CREATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Add day off',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Add day off',
    idempotencyKey: newIdempotencyKey('dayoff'),
  });
}

export function prepareSchoolYearUpdate(message, ctx, overrides = {}) {
  const patch = { ...(overrides.patch || {}) };
  const hoursMatch =
    message.match(/\b(\d+(?:\.\d+)?)\s*hours?\s*(?:per\s*day|\/\s*day)?/i)
    || message.match(/\blearning\s*hours?\s*(?:to|at|=|:)?\s*(\d+(?:\.\d+)?)/i)
    || message.match(/\bhours?\s*(?:per\s*day|\/\s*day)?\s*(?:to|at|=|:)?\s*(\d+(?:\.\d+)?)/i);
  if (hoursMatch && patch.default_planned_hours_per_day == null) {
    patch.default_planned_hours_per_day = Number(hoursMatch[1]);
  }
  const daysMatch =
    message.match(/\b(\d+)\s*(?:target\s*)?days\b/i)
    || message.match(/\btarget\s*days?\s*(?:to|at|=|:)?\s*(\d+)/i);
  if (daysMatch && patch.default_target_days == null) {
    patch.default_target_days = Number(daysMatch[1]);
  }
  const weekdayMap = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
    friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  };
  if (/\blearning days?\b/i.test(message) || /\bweekdays?\b/i.test(message)) {
    const found = Object.keys(weekdayMap).filter((d) => new RegExp(`\\b${d}\\b`, 'i').test(message));
    if (found.length) patch.allowed_weekdays = found.map((d) => weekdayMap[d]);
  }

  if (!Object.keys(patch).length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What should I change in school year settings? Examples: “set learning hours to 4 per day” or “set target days to 180”.',
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.SCHOOL_YEAR_UPDATE,
    householdId: ctx.householdId,
    schoolYearLabel: ctx.schoolYearLabel,
    patch,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.SCHOOL_YEAR_UPDATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Update school year settings',
    command,
    preview: handler.preview(command),
    warnings: ['This updates household planning defaults used by Planner and Learning.'],
    confirmationLabel: 'Save school year settings',
    idempotencyKey: newIdempotencyKey('schoolyear'),
  });
}

export function prepareMaterialCreateLink(message, ctx, roster, overrides = {}) {
  const urlMatch = message.match(/https?:\/\/\S+/i);
  const url = overrides.providerUrl || (urlMatch ? urlMatch[0].replace(/[),.;]+$/, '') : null);
  if (!url) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What URL should I add to Materials?',
    }), {
      intent: 'material.create_link',
      field: 'providerUrl',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  let title = overrides.title || message.match(/\b(?:called|titled|named)\s+["']?([^"'\n]+)["']?/i)?.[1]?.trim();
  if (!title) {
    try {
      title = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      title = 'Link';
    }
  }
  let childIds = overrides.childIds || ctx.selectedChildIds || [];
  const nameMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if (!childIds.length && nameMatch) {
    const resolved = resolveChildByName(nameMatch[1], roster.children);
    if (resolved.ok) childIds = [String(resolved.child.id)];
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.MATERIAL_CREATE_LINK,
    householdId: ctx.householdId,
    title,
    providerUrl: url,
    childIds,
    subjectId: overrides.subjectId || ctx.selectedSubjectId || null,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.MATERIAL_CREATE_LINK);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Add material',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Add material',
    idempotencyKey: newIdempotencyKey('material'),
  });
}

export function prepareMaterialCreateFile(message, ctx, roster, attachments = [], overrides = {}) {
  const first = attachments[0] || overrides;
  if (!first?.attachmentId) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Attach a file with the + button (or drag one onto the composer), then send again.',
    });
  }

  let childIds = overrides.childIds || ctx.selectedChildIds || [];
  const nameMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if (!childIds.length && nameMatch) {
    const resolved = resolveChildByName(nameMatch[1], roster.children);
    if (resolved.ok) childIds = [String(resolved.child.id)];
  }

  const title =
    overrides.title
    || message.match(/\b(?:called|titled|named)\s+["']?([^"'\n]+)["']?/i)?.[1]?.trim()
    || first.fileName
    || 'Attachment';

  const command = {
    type: DOODLE_COMMAND_TYPES.MATERIAL_CREATE_FILE,
    householdId: ctx.householdId,
    attachmentId: first.attachmentId,
    title,
    fileName: first.fileName,
    mime: first.mime,
    mimeLabel: first.mimeLabel,
    bytes: first.bytes,
    childIds,
    subjectId: overrides.subjectId || ctx.selectedSubjectId || null,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.MATERIAL_CREATE_FILE);
  const extra = attachments.length > 1
    ? [`Only the first file (“${first.fileName}”) will be added. Remove extras or send them one at a time.`]
    : undefined;

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Add file to Materials',
    command,
    preview: handler.preview(command),
    warnings: extra,
    confirmationLabel: 'Add to Materials',
    idempotencyKey: newIdempotencyKey('materialfile'),
  });
}

export function prepareSubjectCreate(message, ctx, roster, overrides = {}) {
  let name = overrides.name
    || message.match(/\bsubject\s+(?:called|named|titled)\s+(.+)$/i)?.[1]?.replace(/[.?!].*$/, '').trim()
    || message.match(/\b(?:add|create)\s+(?:a\s+)?subject\s+(.+)$/i)?.[1]?.trim();
  name = name
    ?.replace(/\s+for\s+[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?$/i, '')
    .replace(/^(an?\s+|the\s+)/i, '')
    .trim();
  if (!name || name.length < 2) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What should the subject be named?',
    }), {
      intent: 'subject.create',
      field: 'title',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  let childId = overrides.childId || ctx.selectedChildIds?.[0] || null;
  const nameMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if (!childId && nameMatch) {
    const resolved = resolveChildByName(nameMatch[1], roster.children);
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'subject.create',
        field: 'childId',
        originalMessage: message,
        draft: { name, ...overrides },
      });
    }
    if (resolved.ok) childId = String(resolved.child.id);
  }
  if (!childId && roster.children?.length === 1) childId = String(roster.children[0].id);
  if (!childId) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student is this subject for?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'subject.create',
      field: 'childId',
      originalMessage: message,
      draft: { name, ...overrides },
    });
  }

  const child = (roster.children || []).find((c) => String(c.id) === String(childId));
  const command = {
    type: DOODLE_COMMAND_TYPES.SUBJECT_CREATE,
    householdId: ctx.householdId,
    name,
    childId,
    childName: child?.first_name || child?.name,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.SUBJECT_CREATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Create subject',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Add subject',
    idempotencyKey: newIdempotencyKey('subject'),
  });
}

export function prepareChildCreate(message, ctx, overrides = {}) {
  let name = overrides.name
    || message.match(/\b(?:child|learner|student)\s+(?:called|named)\s+(.+)$/i)?.[1]?.replace(/[.?!].*$/, '').trim()
    || message.match(/\b(?:add|create)\s+(?:a\s+)?(?:child|learner|student)\s+(.+)$/i)?.[1]?.trim();
  name = name?.replace(/^(an?\s+|the\s+)/i, '').trim();
  if (!name || name.length < 2) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What is the learner’s first name?',
    }), {
      intent: 'child.create',
      field: 'title',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  const command = {
    type: DOODLE_COMMAND_TYPES.CHILD_CREATE,
    householdId: ctx.householdId,
    name,
    gradeLabel: overrides.gradeLabel || null,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.CHILD_CREATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Add child',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Add child',
    idempotencyKey: newIdempotencyKey('child'),
  });
}

function attachmentDraftFrom(overrides = {}, attachments = []) {
  const first = attachments[0] || null;
  return {
    attachmentId: overrides.attachmentId || first?.attachmentId || null,
    fileName: overrides.fileName || first?.fileName || null,
    mime: overrides.mime || first?.mime || null,
    mimeLabel: overrides.mimeLabel || first?.mimeLabel || null,
    bytes: overrides.bytes || first?.bytes || null,
  };
}

function lessonTitleFromMessage(message, fileName) {
  const named = message.match(/\blesson\s+(?:called|named|titled)\s+["']?([^"'\n.]+)["']?/i)?.[1]?.trim();
  if (named) return named;
  if (fileName) {
    return String(fileName).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'New lesson';
  }
  return 'New lesson';
}

function hasExplicitDateHint(message) {
  return /\b(today|tomorrow|yesterday|next\s+week|in\s+a\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i.test(
    String(message || ''),
  );
}

/** Resolve a free-text day reply (Today, Saturday, next week, 2026-07-20, 7/20) → YYYY-MM-DD. */
export function resolveFlexibleDay(message, fromDate = new Date()) {
  const raw = String(message || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^today$/i.test(raw) || /\btoday\b/i.test(raw)) return toYmd(fromDate);
  if (/^tomorrow$/i.test(raw) || /\btomorrow\b/i.test(raw)) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() + 1);
    return toYmd(d);
  }
  if (/^yesterday$/i.test(raw) || /\byesterday\b/i.test(raw)) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() - 1);
    return toYmd(d);
  }
  const iso = raw.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const slash = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const base = fromDate instanceof Date && !Number.isNaN(fromDate.getTime())
      ? new Date(fromDate)
      : new Date();
    let year = slash[3] ? Number(slash[3]) : base.getFullYear();
    if (year < 100) year += 2000;
    const month = Number(slash[1]) - 1;
    const day = Number(slash[2]);
    const d = new Date(year, month, day);
    if (!Number.isNaN(d.getTime()) && d.getMonth() === month && d.getDate() === day) {
      return toYmd(d);
    }
  }
  const wd = parseMoveTargetDay(raw, fromDate);
  if (wd) return toYmd(wd);
  return null;
}

function resolveLearningDayDate(message, overrides = {}) {
  if (overrides.date) return toYmd(overrides.date);
  return resolveFlexibleDay(message, new Date());
}

function learningDayDateClarification(message, draft) {
  const today = toYmd(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = toYmd(tomorrowDate);
  return withClarificationMeta(assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
    message: 'Which day should this one-off learning event be on? Pick one, or type a day (e.g. Saturday, next Monday, next week).',
    options: [
      { id: 'today', label: 'Today', value: today, field: 'date' },
      { id: 'tomorrow', label: 'Tomorrow', value: tomorrow, field: 'date' },
    ],
  }), {
    intent: 'learning_day.create',
    field: 'date',
    originalMessage: message,
    draft,
  });
}

export function prepareLearningDayCreate(message, ctx, roster, overrides = {}) {
  const attachments = Array.isArray(overrides.attachments) ? overrides.attachments : [];
  const att = attachmentDraftFrom(overrides, attachments);
  const createLesson = overrides.createLesson === true || /\blesson\b/i.test(message);
  const draftBase = {
    ...overrides,
    ...att,
    createLesson,
    attachments: undefined,
  };

  let subjectId = overrides.subjectId || ctx.selectedSubjectId || null;
  const inSubject = message.match(/\b(?:for|in)\s+([A-Za-z][A-Za-z0-9 &/-]*)/i);
  if (!subjectId && inSubject) {
    const candidate = inSubject[1].trim();
    // Skip date words / “this” from “using this”
    if (!/^(today|tomorrow|this|that|me|us)$/i.test(candidate)) {
      const asSubject = resolveSubjectByName(candidate, roster.subjects);
      if (asSubject.ok) subjectId = String(asSubject.subject.id);
    }
  }
  if (!subjectId) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject should this lesson / learning day be for?',
      options: (roster.subjects || []).slice(0, 10).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'learning_day.create',
      field: 'subjectId',
      originalMessage: message,
      draft: draftBase,
    });
  }

  let childIds = overrides.childIds || ctx.selectedChildIds || [];
  if (!childIds.length && roster.children?.length === 1) childIds = [String(roster.children[0].id)];
  if (!childIds.length) {
    const subject = (roster.subjects || []).find((s) => String(s.id) === String(subjectId));
    if (subject?.child_id) childIds = [String(subject.child_id)];
    else if (subject?.assignedChildren?.[0]) childIds = [String(subject.assignedChildren[0])];
  }
  if (!childIds.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student is this for?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'learning_day.create',
      field: 'childId',
      originalMessage: message,
      draft: { ...draftBase, subjectId },
    });
  }

  let date = resolveLearningDayDate(message, overrides);
  if (!date && !hasExplicitDateHint(message)) {
    return learningDayDateClarification(message, { ...draftBase, subjectId, childIds });
  }
  if (!date) date = toYmd(new Date());

  const subject = (roster.subjects || []).find((s) => String(s.id) === String(subjectId));
  const lessonTitle = overrides.lessonTitle || lessonTitleFromMessage(message, att.fileName);
  const title = overrides.title
    || (createLesson ? lessonTitle : `${subject?.name || 'Subject'} learning day`);

  const command = {
    type: DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE,
    householdId: ctx.householdId,
    subjectId,
    subjectName: subject?.name || subject?.title,
    childIds,
    date,
    title,
    createLesson,
    lessonTitle,
    attachmentId: att.attachmentId || null,
    fileName: att.fileName || null,
    mime: att.mime || null,
    mimeLabel: att.mimeLabel || null,
    bytes: att.bytes || null,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: createLesson && att.attachmentId
      ? 'Create one-off learning event with lesson + material'
      : createLesson
        ? 'Create one-off learning event with new lesson'
        : 'Create one-off learning event',
    command,
    preview: handler.preview(command),
    confirmationLabel: att.attachmentId ? 'Create & attach' : 'Create learning day',
    idempotencyKey: newIdempotencyKey('learningday'),
  });
}

/**
 * Resolve the calendar day for “move … to Sunday / tomorrow / today”.
 * @param {string} message
 * @param {Date} [fromDate]
 * @returns {Date|null} local midnight of the target day
 */
export function parseMoveTargetDay(message, fromDate = new Date()) {
  const lower = String(message || '').toLowerCase();
  const base = fromDate instanceof Date && !Number.isNaN(fromDate.getTime())
    ? new Date(fromDate)
    : new Date();
  base.setHours(0, 0, 0, 0);

  if (/\btoday\b/.test(lower)) return base;
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(base);
    d.setDate(d.getDate() - 1);
    return d;
  }
  // “next week” / “in a week” → Monday of the following week
  if (/\bnext\s+week\b/.test(lower) || /\bin\s+a\s+week\b/.test(lower)) {
    const d = new Date(base);
    const cur = d.getDay();
    const add = (1 - cur + 7) % 7 || 7; // days until next Monday
    d.setDate(d.getDate() + add);
    return d;
  }

  // Lazy import avoided — weekday map is local so tests stay sync.
  const weekdays = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
    thursday: 4, friday: 5, saturday: 6,
  };
  let targetDow = null;
  let useNext = false;
  for (const [name, dow] of Object.entries(weekdays)) {
    if (new RegExp(`\\bnext\\s+${name}\\b`, 'i').test(message)) {
      targetDow = dow;
      useNext = true;
      break;
    }
    if (new RegExp(`\\b${name}\\b`, 'i').test(message)) {
      targetDow = dow;
      break;
    }
  }
  if (targetDow == null) return null;

  const cur = base.getDay();
  let add = (targetDow - cur + 7) % 7;
  // “next Sunday” skips the nearest occurrence (or jumps a week if already that day).
  if (useNext) add = add === 0 ? 7 : add + 7;
  const d = new Date(base);
  d.setDate(d.getDate() + add);
  return d;
}

/**
 * Async preparer: resolve event by title then preview a move.
 */
export async function preparePlannerItemMove(message, ctx, roster, overrides = {}) {
  let itemId = overrides.itemId || null;
  let itemTitle = overrides.itemTitle || null;
  let durationMs = overrides.durationMs || 60 * 60 * 1000;
  let originalStartAt = overrides.originalStartAt || null;
  let allDay = overrides.allDay === true;

  if (!itemId) {
    const { fetchResolvableEvents, resolveEventFromUserMessage } = await import('../eventChatActions.js');
    const { events } = await fetchResolvableEvents(ctx.householdId);
    const resolved = resolveEventFromUserMessage(message, events || [], {
      children: roster.children,
      selectedChildIds: ctx.selectedChildIds,
    });
    if (!resolved?.ok) {
      const candidates = resolved?.candidates || [];
      if (candidates.length) {
        return withClarificationMeta(assertDoodleResponse({
          type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
          message: 'Which planner item should I move?',
          options: candidates.slice(0, 8).map((ev) => ({
            id: String(ev.id),
            label: ev.title || 'Event',
            value: String(ev.id),
            field: 'itemId',
          })),
        }), {
          intent: 'planner.item.move',
          field: 'itemId',
          originalMessage: message,
          draft: { ...overrides },
        });
      }
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which event should I move? Include part of the title, like “move Field trip to tomorrow”.',
      });
    }
    itemId = String(resolved.event.id);
    itemTitle = resolved.event.title;
    originalStartAt = resolved.event.start_ts || null;
    allDay = isAllDayLike(resolved.event);
    if (resolved.event.start_ts && resolved.event.end_ts) {
      durationMs = Math.max(
        15 * 60 * 1000,
        new Date(resolved.event.end_ts) - new Date(resolved.event.start_ts),
      );
    }
  }

  let startAt = overrides.startAt;
  let endAt = overrides.endAt || null;

  // Prefer the same weekday/time parsing as the event editor (relative to the item’s current day).
  if (!startAt && originalStartAt) {
    const { parseEventUpdatesFromMessage } = await import('../eventChatActions.js');
    const parsed = parseEventUpdatesFromMessage(message, {
      start_ts: originalStartAt,
      end_ts: new Date(new Date(originalStartAt).getTime() + durationMs).toISOString(),
      all_day: allDay,
    });
    if (parsed?.updates?.start_ts) {
      startAt = parsed.updates.start_ts;
      if (parsed.updates.end_ts) endAt = parsed.updates.end_ts;
    }
  }

  if (!startAt) {
    const rawAnchor = ctx.visibleDateStart || null;
    const from = rawAnchor
      ? (/^\d{4}-\d{2}-\d{2}$/.test(String(rawAnchor))
        ? new Date(`${String(rawAnchor).slice(0, 10)}T12:00:00`)
        : new Date(rawAnchor))
      : new Date();
    const anchor = Number.isNaN(from.getTime()) ? new Date() : from;
    const targetDay = parseMoveTargetDay(message, anchor) || new Date();
    const d = new Date(targetDay);

    const timeMatch = message.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (timeMatch && !allDay) {
      let h = Number(timeMatch[1]);
      const m = Number(timeMatch[2] || 0);
      const ap = timeMatch[3].toLowerCase();
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      d.setHours(h, m, 0, 0);
      startAt = d.toISOString();
    } else if (allDay) {
      const bounds = toAllDayBounds(d);
      startAt = bounds.startAt;
      endAt = bounds.endAt;
    } else {
      d.setHours(9, 0, 0, 0);
      startAt = d.toISOString();
    }
  }

  if (allDay && startAt) {
    const bounds = toAllDayBounds(startAt);
    if (bounds) {
      startAt = bounds.startAt;
      endAt = bounds.endAt;
    }
  } else if (!endAt) {
    endAt = new Date(new Date(startAt).getTime() + durationMs).toISOString();
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE,
    itemId,
    itemTitle: itemTitle || 'Planner item',
    startAt,
    endAt,
    allDay,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.PLANNER_ITEM_MOVE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Move planner item',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Move item',
    idempotencyKey: newIdempotencyKey('move'),
  });
}

function eventOnYmd(ev, ymd) {
  if (!ev?.start_ts || !ymd) return false;
  return toYmd(ev.start_ts) === ymd;
}

export function scoreEventTitle(query, title) {
  const q = String(query || '').toLowerCase().trim();
  const t = String(title || '').toLowerCase().trim();
  if (!q || !t) return 0;
  if (t === q || t.includes(q) || q.includes(t)) return 100;
  const qWords = q.split(/\W+/).filter((w) => w.length > 2);
  let score = 0;
  for (const w of qWords) {
    if (t.includes(w)) score += w.length >= 4 ? 4 : 2;
    // read ↔ reading, assign ↔ assignment
    if (w.endsWith('ing') && t.includes(w.slice(0, -3))) score += 3;
    if (w.endsWith('ment') && t.includes(w.slice(0, -4))) score += 2;
    if ((w === 'reading' || w === 'read') && /\bread\b/.test(t)) score += 5;
    if ((w === 'assignment' || w === 'homework') && /\b(assign|homework|classwork|read)\b/.test(t)) score += 2;
  }
  return score;
}

export function extractCompleteQuery(message) {
  const m =
    message.match(/\b(?:mark|set|check)\s+(.+?)\s+as\s+(?:done|complete|completed|finished)\b/i)
    || message.match(/\b(?:mark|check)\s+(.+?)\s+(?:done|complete)\b/i)
    || message.match(/\b(?:complete|finish)\s+(.+)$/i);
  let q = (m?.[1] || message).trim();
  q = q
    .replace(/\b(today|tomorrow|yesterday)\b/gi, ' ')
    .replace(/\b(the|a|an|my|our)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return q;
}

/**
 * Async preparer: resolve planner item then preview mark-as-done.
 */
export async function preparePlannerItemComplete(message, ctx, roster, overrides = {}) {
  let itemId = overrides.itemId || null;
  let itemTitle = overrides.itemTitle || null;
  let whenLabel = overrides.whenLabel || null;

  if (!itemId) {
    const { fetchResolvableEvents } = await import('../eventChatActions.js');
    const { events } = await fetchResolvableEvents(ctx.householdId);
    let pool = events || [];

    const preferToday = /\btoday\b/i.test(message);
    const preferTomorrow = /\btomorrow\b/i.test(message);
    const targetYmd = preferToday
      ? toYmd(new Date())
      : preferTomorrow
        ? toYmd((() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; })())
        : null;
    if (targetYmd) {
      const dayPool = pool.filter((ev) => eventOnYmd(ev, targetYmd));
      if (dayPool.length) pool = dayPool;
      whenLabel = preferToday ? 'Today' : 'Tomorrow';
    }

    // Prefer not-already-done items when status is available
    const open = pool.filter((ev) => String(ev.status || '').toLowerCase() !== 'done');
    if (open.length) pool = open;

    const query = extractCompleteQuery(message);
    const scored = pool
      .map((ev) => ({ ev, score: scoreEventTitle(query, ev.title) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) {
      if (pool.length === 1) {
        itemId = String(pool[0].id);
        itemTitle = pool[0].title;
      } else if (pool.length > 1) {
        return withClarificationMeta(assertDoodleResponse({
          type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
          message: targetYmd
            ? 'Which item from that day should I mark done?'
            : 'Which planner item should I mark done?',
          options: pool.slice(0, 8).map((ev) => ({
            id: String(ev.id),
            label: ev.title || 'Item',
            value: String(ev.id),
            field: 'itemId',
          })),
        }), {
          intent: 'planner.item.complete',
          field: 'itemId',
          originalMessage: message,
          draft: { whenLabel, ...overrides },
        });
      } else {
        return assertDoodleResponse({
          type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
          message: 'I couldn’t find a matching planner item. Try “mark Read Chapter as done” with part of the title.',
        });
      }
    } else if (scored.length > 1 && scored[0].score === scored[1].score) {
      const tied = scored.filter((s) => s.score === scored[0].score).map((s) => s.ev);
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which item should I mark done?',
        options: tied.slice(0, 8).map((ev) => ({
          id: String(ev.id),
          label: ev.title || 'Item',
          value: String(ev.id),
          field: 'itemId',
        })),
      }), {
        intent: 'planner.item.complete',
        field: 'itemId',
        originalMessage: message,
        draft: { whenLabel, ...overrides },
      });
    } else {
      itemId = String(scored[0].ev.id);
      itemTitle = scored[0].ev.title;
      if (!whenLabel && scored[0].ev.start_ts) {
        whenLabel = formatDisplayDate(scored[0].ev.start_ts);
      }
    }
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.PLANNER_ITEM_COMPLETE,
    itemId,
    itemTitle: itemTitle || 'Planner item',
    whenLabel: whenLabel || undefined,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.PLANNER_ITEM_COMPLETE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Mark as done',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Mark done',
    idempotencyKey: newIdempotencyKey('complete'),
  });
}

export function continueIntentClarification(pendingClarification, message, option, ctx, roster) {
  if (!pendingClarification?.intent || !pendingClarification?.originalMessage) return null;
  const draft = { ...(pendingClarification.draft || {}) };
  const field = option?.field || pendingClarification.field;
  const value = option?.value || message;

  if (field === 'subjectId') {
    const resolved = resolveSubjectByName(option?.label || value, roster.subjects);
    if (resolved.ok) draft.subjectId = String(resolved.subject.id);
    else if (option?.value) draft.subjectId = String(option.value);
    else return null;
  } else if (field === 'childId') {
    const resolved = resolveChildByName(option?.label || value, roster.children);
    if (resolved.ok) {
      draft.childId = String(resolved.child.id);
      draft.childIds = [String(resolved.child.id)];
    } else if (option?.value) {
      draft.childId = String(option.value);
      draft.childIds = [String(option.value)];
    } else return null;
  } else if (field === 'title') {
    draft.title = String(value || '').trim();
    draft.name = draft.title;
  } else if (field === 'providerUrl') {
    draft.providerUrl = String(value || '').trim();
  } else if (field === 'itemId') {
    draft.itemId = String(option?.value || value);
    draft.itemTitle = option?.label || draft.itemTitle;
  } else if (field === 'date') {
    const raw = String(option?.value || value || '').trim();
    const parsed = resolveFlexibleDay(raw, new Date());
    if (parsed) {
      draft.date = parsed;
    } else if (pendingClarification.intent === 'learning_day.create') {
      return learningDayDateClarification(pendingClarification.originalMessage, draft);
    } else {
      draft.date = null;
    }
  }

  switch (pendingClarification.intent) {
    case 'attendance.mark':
      return prepareAttendanceMark(pendingClarification.originalMessage, ctx, roster, draft);
    case 'attendance.mark_range':
      return prepareAttendanceMarkRange(pendingClarification.originalMessage, ctx, roster, draft);
    case 'day_off.create':
      return prepareDayOffCreate(pendingClarification.originalMessage, ctx, draft);
    case 'material.create_link':
      return prepareMaterialCreateLink(pendingClarification.originalMessage, ctx, roster, draft);
    case 'subject.create':
      return prepareSubjectCreate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'child.create':
      return prepareChildCreate(pendingClarification.originalMessage, ctx, draft);
    case 'learning_day.create':
      return prepareLearningDayCreate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'planner.item.move':
      return preparePlannerItemMove(pendingClarification.originalMessage, ctx, roster, draft);
    case 'planner.item.complete':
      return preparePlannerItemComplete(pendingClarification.originalMessage, ctx, roster, draft);
    case 'school_year.update':
      return prepareSchoolYearUpdate(pendingClarification.originalMessage, ctx, draft);
    default:
      return null;
  }
}

void formatDisplayDate; // reserved for richer previews

