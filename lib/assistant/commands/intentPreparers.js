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
import {
  findSubjectMentionedInMessage,
  resolveChildByName,
  resolveSubjectByName,
} from './entityResolve.js';
import { continueBulletinClarification } from './bulletinIntentPreparers.js';

const WEEKDAY_NUM = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

export function parseWeekdayNumsFromMessage(message) {
  const lower = String(message || '').toLowerCase();
  const found = [];
  for (const [name, num] of Object.entries(WEEKDAY_NUM)) {
    if (new RegExp(`\\b${name}s?\\b`).test(lower) && !found.includes(num)) {
      found.push(num);
    }
  }
  return found.sort((a, b) => a - b);
}

export function mergeWeekdaysFromMessage(currentWeekdays, message) {
  const lower = String(message || '').toLowerCase();
  const mentioned = parseWeekdayNumsFromMessage(message);
  if (!mentioned.length) return null;
  const current = (Array.isArray(currentWeekdays) ? currentWeekdays : [])
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);

  if (/\b(remove|drop|without)\b/.test(lower)) {
    return current.filter((d) => !mentioned.includes(d));
  }
  if (/\b(only|just)\b/.test(lower)) {
    return mentioned;
  }
  // “too / also / add / include / to be on” → union with existing days
  if (
    /\b(too|also|as well|include|add)\b/.test(lower)
    || /\bto\s+be\s+on\b/.test(lower)
    || mentioned.length === 1
  ) {
    return [...new Set([...current, ...mentioned])].sort((a, b) => a - b);
  }
  return mentioned;
}

/** Subject settings modal actions via chat (schedule days/time, name, grade, students). */
export function isSubjectDeleteIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(delete|remove)\b/.test(lower)) return false;
  return /\bsubject\b/.test(lower);
}

/** Bump `2025/26` → `2026/27` (delta +1) or previous year (delta -1). */
export function bumpSchoolYearLabel(label, delta = 1) {
  const m = String(label || '').trim().match(/^(20\d{2})\s*\/\s*(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]) + Number(delta || 0);
  if (!Number.isFinite(start) || start < 2000 || start > 2100) return null;
  const endTwo = String((start + 1) % 100).padStart(2, '0');
  return `${start}/${endTwo}`;
}

/**
 * Resolve a school-year label from the message.
 * Supports explicit `2026/27`, plus “next year” / “last year” relative to `fallback`.
 */
export function parseSubjectSchoolYear(message, fallback = null) {
  const text = String(message || '');
  const explicit = text.match(/\b(20\d{2})\s*\/\s*(\d{2})\b/);
  if (explicit) return `${explicit[1]}/${explicit[2]}`;

  const lower = text.toLowerCase();
  const base = String(fallback || '').trim() || null;
  if (/\bnext\s+(?:school\s+)?year\b/.test(lower) || /\bfor\s+next\s+year\b/.test(lower)) {
    return bumpSchoolYearLabel(base, 1);
  }
  if (/\b(?:last|previous|prior)\s+(?:school\s+)?year\b/.test(lower)) {
    return bumpSchoolYearLabel(base, -1);
  }
  return base && /\b(?:this|current)\s+(?:school\s+)?year\b/.test(lower) ? base : null;
}

export function hasSubjectSchoolYearCue(message) {
  const lower = String(message || '').toLowerCase();
  return /\b(school\s*year|next\s+(?:school\s+)?year|last\s+(?:school\s+)?year|previous\s+(?:school\s+)?year|prior\s+(?:school\s+)?year|for\s+next\s+year|20\d{2}\s*\/\s*\d{2})\b/.test(lower);
}

/**
 * Pull the most recent subject entity from Doodle chat messages
 * (create/update result links or pending subject commands).
 */
export function findRecentSubjectFromMessages(messages = []) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const row = list[i];
    if (!row || row.role === 'user') continue;
    const structured = row.structured || row;
    const records = Array.isArray(structured?.affectedRecords) ? structured.affectedRecords : [];
    for (const link of records) {
      if (link?.entityType === 'subject' && link?.entityId) {
        return {
          subjectId: String(link.entityId),
          subjectName: link.label || null,
        };
      }
    }
    const command = structured?.command;
    if (command?.type === 'subject.update' && command.subjectId) {
      return {
        subjectId: String(command.subjectId),
        subjectName: command.subjectName || null,
      };
    }
    if (command?.type === 'subject.create' && command.name) {
      return {
        subjectId: command.subjectId ? String(command.subjectId) : null,
        subjectName: String(command.name),
      };
    }
    const resultId = structured?.resultData?.subjectId;
    if (resultId) {
      return { subjectId: String(resultId), subjectName: null };
    }
  }
  return null;
}

export function isSubjectUpdateIntent(message, roster = {}, options = {}) {
  const lower = String(message || '').toLowerCase();
  if (isSubjectDeleteIntent(message)) return false;
  // “add subject Biology” is create, not update — unless attaching syllabus/lesson plan.
  if (/\b(add|create|make)\b/.test(lower) && /\bsubject\b/.test(lower)
    && !/\b(syllabus|lesson\s*plan|grading|attach|link)\b/.test(lower)) {
    return false;
  }
  if (!/\b(change|update|edit|set|add|make|put|move|rename|assign|attach|link)\b/.test(lower)) {
    return false;
  }
  const mentioned = findSubjectMentionedInMessage(message, roster.subjects || []);
  const hasSubjectWord = /\bsubject\b/.test(lower);
  const recentSubjectId = options.recentSubjectId ? String(options.recentSubjectId) : null;
  const recentSubjectName = options.recentSubjectName
    ? String(options.recentSubjectName).trim()
    : null;
  const usesPronoun = /\b(it|this|that)\b/.test(lower);
  const hasRecentSubject = Boolean(recentSubjectId || recentSubjectName);
  if (!mentioned.ok && !hasSubjectWord && !(usesPronoun && hasRecentSubject)) return false;

  const hasDay = parseWeekdayNumsFromMessage(message).length > 0;
  const hasScheduleCue = hasDay
    || /\b(schedule|meet(?:s|ing)?|duration|minutes?)\b/.test(lower)
    || /\bat\s+\d/.test(lower);
  const hasDetailsCue = /\b(rename|grade|student|learner|child|grading|points|weighted|syllabus|lesson\s*plan|term|school\s*year)\b/.test(lower)
    || hasSubjectSchoolYearCue(message)
    || /\bname\b/.test(lower)
    || /\b(attach|link)\b/.test(lower);
  return hasScheduleCue || hasDetailsCue;
}

function parseSubjectGradingMethod(message) {
  const lower = String(message || '').toLowerCase();
  if (/\bno\s+overall\s+grade\b/.test(lower) || /\bwithout\s+(?:an?\s+)?overall\s+grade\b/.test(lower)) {
    return { method: 'none', label: 'No overall grade' };
  }
  if (/\btotal\s+points\b/.test(lower)) {
    return { method: 'total_points', label: 'Total points' };
  }
  if (/\bweighted\b/.test(lower) && /\b(categor(?:y|ies)|weight)\b/.test(lower)) {
    return { method: 'weighted_category', label: 'Weighted by category' };
  }
  return null;
}

function parseSubjectTerm(message) {
  const lower = String(message || '').toLowerCase();
  if (/\bfull\s+year\b/.test(lower)) return 'Full year';
  if (/\bfall\s+term\b/.test(lower) || /\bfall\b/.test(lower) && /\bterm\b/.test(lower)) return 'Fall term';
  if (/\bspring\s+term\b/.test(lower) || /\bspring\b/.test(lower) && /\bterm\b/.test(lower)) return 'Spring term';
  if (/\bsummer\s+term\b/.test(lower) || /\bsummer\b/.test(lower) && /\bterm\b/.test(lower)) return 'Summer term';
  return null;
}

function parseAttachmentTitleFromMessage(message) {
  const m = String(message || '').match(
    /\b(?:syllabus|lesson\s*plan)\s+(?:called|named|titled)\s+["']?([^"'\n]+?)["']?(?:\s+to|\s+on|\s+for|\s*$)/i,
  ) || String(message || '').match(
    /\b(?:attach|link|add)\s+(?:the\s+)?(?:syllabus|lesson\s*plan)\s+["']?([^"'\n]+?)["']?(?:\s+to|\s+on|\s+for|\s*$)/i,
  ) || String(message || '').match(
    /\b(?:with|using)\s+(?:syllabus|lesson\s*plan)\s+["']?([^"'\n]+?)["']?\s*$/i,
  );
  return m ? m[1].trim().replace(/[.?!]+$/, '') : null;
}

async function resolveSubjectAttachmentMaterial(familyId, message, overrides = {}) {
  if (overrides.syllabusMaterialId || overrides.lessonPlanMaterialId) {
    return {
      ok: true,
      syllabusMaterialId: overrides.syllabusMaterialId || null,
      lessonPlanMaterialId: overrides.lessonPlanMaterialId || null,
      title: overrides.syllabusTitle || overrides.lessonPlanTitle || null,
      role: overrides.attachmentRole || null,
    };
  }
  const wantsLessonPlan = /\blesson\s*plan\b/i.test(message);
  const wantsSyllabus = /\bsyllabus\b/i.test(message) || wantsLessonPlan
    || /\b(attach|link)\b/i.test(message);
  if (!wantsSyllabus && !overrides.attachmentTitle) {
    return { ok: true, syllabusMaterialId: undefined, lessonPlanMaterialId: undefined };
  }
  if (/\b(clear|remove|unlink)\b/i.test(message)
    && /\b(syllabus|lesson\s*plan|attachment)\b/i.test(message)) {
    return { ok: true, clearAttachments: true };
  }

  const titleHint = overrides.attachmentTitle || parseAttachmentTitleFromMessage(message);
  if (!titleHint) {
    return {
      ok: false,
      clarification: assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which syllabus or lesson plan should I attach? Name a material from Materials, or create one first.',
      }),
    };
  }

  const { supabase } = await import('../../supabase.js');
  const { deriveRoleFromTags, DOCUMENT_ROLES } = await import('../../docs/roles.js');
  const needle = titleHint.toLowerCase();
  const { data, error } = await supabase
    .from('materials')
    .select('id, title, name, tags')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .limit(200);
  if (error) {
    return {
      ok: false,
      response: assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: error.message || 'Could not load materials.',
        recoverable: true,
      }),
    };
  }
  const rows = (data || []).filter((row) => {
    const label = String(row.title || row.name || '').toLowerCase();
    return label.includes(needle);
  });
  const preferredRole = wantsLessonPlan ? DOCUMENT_ROLES.LESSON_PLAN : DOCUMENT_ROLES.SYLLABUS;
  const scored = rows.map((row) => {
    const role = deriveRoleFromTags(row.tags);
    const label = row.title || row.name || 'Material';
    let score = label.toLowerCase() === needle ? 4 : (label.toLowerCase().includes(needle) ? 2 : 1);
    if (role === preferredRole) score += 2;
    if (role == null || role === DOCUMENT_ROLES.SYLLABUS || role === DOCUMENT_ROLES.LESSON_PLAN) score += 1;
    return { row, role, label, score };
  }).sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return {
      ok: false,
      response: assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ANSWER,
        message: `I couldn’t find a material called “${titleHint}”. Add it in Materials first (as syllabus or lesson plan), then attach it here.`,
        links: [{ label: 'Open Materials', href: '/subjects?tab=materials' }],
      }),
    };
  }
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return {
      ok: false,
      clarification: assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which material should I attach?',
        options: scored.slice(0, 8).map((s) => ({
          id: String(s.row.id),
          label: s.label,
          value: String(s.row.id),
          field: 'syllabusMaterialId',
        })),
      }),
    };
  }

  const pick = scored[0];
  const isLesson = pick.role === DOCUMENT_ROLES.LESSON_PLAN || wantsLessonPlan;
  return {
    ok: true,
    syllabusMaterialId: isLesson ? null : String(pick.row.id),
    lessonPlanMaterialId: isLesson ? String(pick.row.id) : null,
    title: pick.label,
    role: isLesson ? 'lesson_plan' : 'syllabus',
  };
}

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

function bulkAttendanceTermClarification(message, overrides = {}) {
  return withClarificationMeta(assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
    message: 'Which term should I mark attended? (Same as Planner → Year → Attendance check.)',
    options: [
      { id: 'fall', label: 'Fall', value: 'fall', field: 'termKey' },
      { id: 'spring', label: 'Spring', value: 'spring', field: 'termKey' },
      { id: 'summer', label: 'Summer', value: 'summer', field: 'termKey' },
    ],
  }), {
    intent: 'attendance.mark_range',
    field: 'termKey',
    originalMessage: message,
    draft: { ...overrides },
  });
}

export async function prepareAttendanceMarkRange(message, ctx, roster, overrides = {}) {
  const {
    parseAttendanceRange,
    parseTermKeyFromMessage,
    isBulkAttendanceModalIntent,
    isSchoolYearAttendanceRangeIntent,
    resolveTermAttendanceRange,
    resolveSchoolYearAttendanceRange,
    fetchUnattendedLearningEventsInRange,
  } = await import('../attendanceChatActions.js');

  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('attendance')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Attendance tracking is not enabled for this household.',
      recoverable: false,
    });
  }

  if (ctx.userRole === 'child') {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: 'Only parents and tutors can mark a full attendance range. Ask a parent, or open Planner → Year → Attendance check.',
      links: [{ label: 'Open Planner (Year)', href: '/planner?view=year' }],
    });
  }

  let range = overrides.startDate && overrides.endDate
    ? {
      startDate: overrides.startDate,
      endDate: overrides.endDate,
      label: overrides.rangeLabel || `${overrides.startDate} → ${overrides.endDate}`,
      termKey: overrides.termKey || null,
      termLabel: overrides.termLabel || null,
    }
    : null;

  const termKey = overrides.termKey || parseTermKeyFromMessage(message);
  if (!range && termKey) {
    range = await resolveTermAttendanceRange({
      familyId: ctx.householdId,
      schoolYearLabel: ctx.schoolYearLabel || null,
      termKey,
    });
    if (!range) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: `${termKey.charAt(0).toUpperCase() + termKey.slice(1)} term dates are not configured yet. Open School Year Settings to set term dates, then try again.`,
        recoverable: true,
        links: [{ label: 'Open School Year Settings', href: '/settings' }],
      });
    }
  }

  if (!range) {
    range = parseAttendanceRange(message);
  }

  if (!range && isSchoolYearAttendanceRangeIntent(message)) {
    range = await resolveSchoolYearAttendanceRange({
      familyId: ctx.householdId,
      schoolYearLabel: ctx.schoolYearLabel || null,
    });
    if (!range) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: 'School year dates are not configured yet. Open School Year Settings to set term dates, then try again.',
        recoverable: true,
        links: [{ label: 'Open School Year Settings', href: '/settings' }],
      });
    }
  }

  if (!range && isBulkAttendanceModalIntent(message)) {
    return bulkAttendanceTermClarification(message, overrides);
  }

  if (!range) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which days should I mark attended? Pick a term, or try “mark all July learning days as attended” / “mark all attendance for the school year as done”.',
      options: [
        { id: 'fall', label: 'Fall term', value: 'fall', field: 'termKey' },
        { id: 'spring', label: 'Spring term', value: 'spring', field: 'termKey' },
        { id: 'summer', label: 'Summer term', value: 'summer', field: 'termKey' },
      ],
    }), {
      intent: 'attendance.mark_range',
      field: 'termKey',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const resolvedKids = resolveAttendanceChildIds(message, ctx, roster, {
    ...overrides,
    rangeIntent: 'attendance.mark_range',
    startDate: range.startDate,
    endDate: range.endDate,
    rangeLabel: range.label,
    termKey: range.termKey || termKey || null,
    termLabel: range.termLabel || null,
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
      message: `No unattended learning days found for ${range.label} (through today). Future days and days with no lessons are left untouched — everything in that range may already be marked, or nothing was scheduled.`,
      links: [{ label: 'Open Planner (Year)', href: '/planner?view=year' }],
    });
  }

  const childNames = childIds
    .map((id) => {
      const c = (roster.children || []).find((row) => String(row.id) === String(id));
      return c?.first_name || c?.name || null;
    })
    .filter(Boolean);

  const command = {
    type: DOODLE_COMMAND_TYPES.ATTENDANCE_MARK_RANGE,
    householdId: ctx.householdId,
    childIds,
    childNames,
    startDate: range.startDate,
    endDate: range.endDate,
    rangeLabel: range.label,
    termKey: range.termKey || termKey || null,
    termLabel: range.termLabel || null,
    status: 'present',
    eventIds,
    eventCount: eventIds.length,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.ATTENDANCE_MARK_RANGE);
  const throughToday = range.endDate;
  const studentLabel = childNames.length === 1
    ? childNames[0]
    : (childNames.length > 1 ? childNames.join(', ') : `${childIds.length} learners`);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: `Mark scheduled lessons attended from ${formatDisplayDate(range.startDate)} through ${formatDisplayDate(throughToday)} for ${studentLabel}. Future days and days with no lessons are left untouched.`,
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Confirm',
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

const MONTH_NAME_TO_INDEX = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
  august: 7, aug: 7, september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};

function parseNamedCalendarDate(raw, refDate = new Date()) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const flexible = resolveFlexibleDay(text, refDate);
  if (flexible) return flexible;
  const named = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/i,
  );
  if (!named) return null;
  const month = MONTH_NAME_TO_INDEX[named[1].toLowerCase()];
  const day = Number(named[2]);
  const year = named[3] ? Number(named[3]) : refDate.getFullYear();
  if (!Number.isInteger(month) || !Number.isFinite(day)) return null;
  const d = new Date(year, month, day);
  if (Number.isNaN(d.getTime()) || d.getMonth() !== month || d.getDate() !== day) return null;
  return toYmd(d);
}

function parseDateRangeFromMessage(message, refDate = new Date()) {
  const text = String(message || '');

  // Same-month shorthand: "July 27-29", "Jul 27–29, 2026", "July 27 to 29"
  const sameMonth = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})\s*(?:[–-]|(?:to|through|until))\s*(\d{1,2})(?!,?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))(?:,?\s*(\d{4}))?\b/i,
  );
  if (sameMonth) {
    const month = MONTH_NAME_TO_INDEX[sameMonth[1].toLowerCase()];
    const year = sameMonth[4] ? Number(sameMonth[4]) : refDate.getFullYear();
    const startDay = Number(sameMonth[2]);
    const endDay = Number(sameMonth[3]);
    if (Number.isInteger(month) && Number.isFinite(startDay) && Number.isFinite(endDay)) {
      const start = new Date(year, month, startDay);
      const end = new Date(year, month, endDay);
      if (
        !Number.isNaN(start.getTime())
        && !Number.isNaN(end.getTime())
        && start.getMonth() === month
        && end.getMonth() === month
        && endDay >= startDay
      ) {
        return { startDate: toYmd(start), endDate: toYmd(end) };
      }
    }
  }

  const range = text.match(
    /\b(?:from|between)\s+(.+?)\s+(?:to|through|until|–|-)\s+(.+?)(?:\.|$)/i,
  ) || text.match(
    /\b([A-Za-z]{3,9}\s+\d{1,2}(?:,?\s*\d{4})?)\s*[–-]\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,?\s*\d{4})?)/i,
  );
  if (!range) {
    const single = parseNamedCalendarDate(message, refDate) || resolveFlexibleDay(message, refDate);
    return single ? { startDate: single, endDate: single } : null;
  }
  const startDate = parseNamedCalendarDate(range[1], refDate) || resolveFlexibleDay(range[1], refDate);
  const endDate = parseNamedCalendarDate(range[2], refDate) || resolveFlexibleDay(range[2], refDate);
  if (!startDate) return null;
  return { startDate, endDate: endDate || startDate };
}

function clockRawToSqlTime(raw) {
  const m = String(raw || '').match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const mins = Number(m[2] || 0);
  const ap = String(m[3] || '').toLowerCase().replace(/\./g, '');
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!Number.isFinite(h) || h < 0 || h > 23) return null;
  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}:00`;
}

function hoursBetweenSqlTimes(startSql, endSql) {
  const a = String(startSql || '').match(/^(\d{2}):(\d{2})/);
  const b = String(endSql || '').match(/^(\d{2}):(\d{2})/);
  if (!a || !b) return null;
  const startMin = Number(a[1]) * 60 + Number(a[2]);
  const endMin = Number(b[1]) * 60 + Number(b[2]);
  if (endMin <= startMin) return null;
  return Number(((endMin - startMin) / 60).toFixed(2));
}

/** School Year Settings modal surface via chat. */
export function isSchoolYearSettingsIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(set|update|change|edit|make|use)\b/.test(lower)) return false;
  return /\b(school\s*year|learning\s*hours|hours?\s*per\s*day|target\s*days|learning\s*days|weekdays?|term\s+dates?|fall\s+term|spring\s+term|summer\s+(?:term|range)|attendance\s*(?:goal|tracking|mode)|tracking\s*mode|total\s+class\s+days|per\s+subject|school\s*hours|default\s+learning|last\s+(?:day|semester|term))\b/.test(lower)
    || /\b(?:school\s*)?year\s+to\s+end\b/.test(lower)
    || /\bend(?:s|ing)?\s+(?:on\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/.test(lower)
      && /\b(school\s*year|year|semester|term)\b/.test(lower);
}

/** Prefer chronologically last configured term (summer when present, else spring, else fall). */
export function resolveLastConfiguredTermKey(settings = {}) {
  const ymd = (v) => {
    const s = String(v || '').trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };
  const candidates = [
    { key: 'fall', end: ymd(settings.default_fall_term_end_date), start: ymd(settings.default_fall_term_start_date) },
    { key: 'spring', end: ymd(settings.default_spring_term_end_date), start: ymd(settings.default_spring_term_start_date) },
    { key: 'summer', end: ymd(settings.default_summer_term_end_date), start: ymd(settings.default_summer_term_start_date) },
  ].filter((t) => t.end || t.start);
  if (!candidates.length) return null;
  candidates.sort((a, b) => String(b.end || b.start || '').localeCompare(String(a.end || a.start || '')));
  return candidates[0].key;
}

function schoolYearEndRefDate(schoolYearLabel, fallback = new Date()) {
  const m = String(schoolYearLabel || '').match(/^(20\d{2})\s*\/\s*(\d{2})\b/);
  if (!m) return fallback;
  const endYear = 2000 + Number(m[2]);
  // Mid summer of the label’s end year so “Aug 31” resolves into that school year.
  return new Date(endYear, 6, 1);
}

/** “change this school year to end Aug 31” / “last day of the year is Aug 31”. */
function parseSchoolYearEndDateOnly(message, schoolYearLabel, overrides = {}) {
  if (overrides.yearEndDate) return String(overrides.yearEndDate).slice(0, 10);
  const raw = String(message || '');
  const patterns = [
    /\b(?:change|set|update|make)\s+(?:this\s+|the\s+)?(?:school\s*)?year\s+to\s+end\s+(.+?)(?:\.|$)/i,
    /\b(?:school\s*)?year\s+(?:to\s+)?end(?:s|ing)?(?:\s+on)?\s+(.+?)(?:\.|$)/i,
    /\blast\s+day\s+(?:of\s+(?:the\s+)?(?:school\s*)?(?:year|semester|term)\s+)?(?:to\s+|as\s+|is\s+|on\s+)?(.+?)(?:\.|$)/i,
    /\bend(?:s|ing)?\s+(?:the\s+)?(?:school\s*)?year\s+(?:on\s+|to\s+)?(.+?)(?:\.|$)/i,
    /\b(?:school\s*)?year\s+end\s+(?:date\s+)?(?:to\s+|as\s+|on\s+)?(.+?)(?:\.|$)/i,
  ];
  const ref = schoolYearEndRefDate(schoolYearLabel, new Date());
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m?.[1]) continue;
    const chunk = String(m[1]).trim().replace(/\s+(for\s+.+)$/i, '');
    // Ignore range forms handled elsewhere (“from A to B”).
    if (/\bto\b|\bthrough\b|\buntil\b/.test(chunk) && !/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(chunk)) {
      continue;
    }
    const ymd = parseNamedCalendarDate(chunk, ref) || resolveFlexibleDay(chunk, ref);
    if (ymd) return ymd;
  }
  return null;
}

function cleanDayOffTitle(raw, fallback = 'Day off') {
  const cleaned = String(raw || '')
    .replace(/\b(today|tomorrow|yesterday|from|on|to|through|until|between)\b/gi, ' ')
    .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/gi, ' ')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    // Full same-month ranges first: "July 27-29" / "Jul 27 to 29, 2026"
    .replace(
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\s*(?:[–-]|(?:to|through|until))\s*\d{1,2}(?:,?\s*\d{4})?/gi,
      ' ',
    )
    .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,?\s*\d{4})?/gi, '')
    .replace(/\b\d{1,2}\s*[–-]\s*\d{1,2}\b/g, ' ')
    .replace(/^[–\-\s]+|[–\-]\s*\d{1,2}\b/g, ' ')
    .replace(/\b(?:at|@)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?/gi, ' ')
    .replace(/\b(?:location|notes?|repeat|repeating|recurring)\b.*$/i, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || fallback;
}

function defaultDayOffTitleFromMessage(message, overrides = {}) {
  if (/\bbreak\b/i.test(message) && !/\bday\s*off\b/i.test(message) && !/\bholiday\b/i.test(message)) {
    return 'Break';
  }
  if (/\bholiday\b/i.test(message) && !/\bday\s*off\b/i.test(message)) return 'Holiday';
  return overrides.editRow?.name || 'Day off';
}

function parseDayOffTitleFromMessage(message, overrides = {}) {
  if (overrides.title) return cleanDayOffTitle(overrides.title, defaultDayOffTitleFromMessage(message, overrides));
  const rename = message.match(
    /\b(?:rename|retitle)\s+(?:(?:the\s+)?(?:day\s*off|holiday|break)\s+)?(?:to|as)\s+["']?([^"'\n]+?)["']?\s*$/i,
  );
  if (rename) return cleanDayOffTitle(rename[1], defaultDayOffTitleFromMessage(message, overrides));
  const called = message.match(
    /\b(?:called|named|titled)\s+["']?([^"'\n]+?)["']?(?:\s+from|\s+on|\s+to|\s+through|\s+until|\s+at|\s+with|\s*$)/i,
  );
  if (called) return cleanDayOffTitle(called[1], defaultDayOffTitleFromMessage(message, overrides));
  const dayOffNamed = message.match(
    /\b(?:day\s*off|break|holiday)\s+(?:for\s+)?["']?([^"'\n]+?)["']?(?:\s+from|\s+on|\s+to|\s+through|\s+until|\s+at|\s+with|\s*$)/i,
  );
  if (dayOffNamed) {
    const fallback = defaultDayOffTitleFromMessage(message, overrides);
    const candidate = cleanDayOffTitle(dayOffNamed[1], '');
    if (candidate && !/^(add|create|schedule|make|edit|update|change|delete|remove)$/i.test(candidate)) {
      return candidate;
    }
    return fallback;
  }
  return defaultDayOffTitleFromMessage(message, overrides);
}

function dayOffRepeatBlockedMessage(message) {
  const lower = String(message || '').toLowerCase();
  if (/\bjust\s+once\b/.test(lower)) return null;
  if (/\b(repeat|repeating|recurring|every\s+(week|month|year)|weekly|monthly|yearly|annually)\b/.test(lower)) {
    return 'Repeating days off are not supported yet. Choose Just once or use a date range.';
  }
  return null;
}

function collectDayOffUnsupportedExtras(message) {
  const extras = [];
  const clocks = parseClockHmFromMessage(message);
  if (clocks.startRaw || clocks.endRaw) extras.push('start/end time');
  if (parseLocationFromMessage(message)) extras.push('location');
  if (parseNotesFromMessage(message)) extras.push('notes');
  return extras;
}

export function isDayOffUpdateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(day\s*off|holiday|break)\b/.test(lower)) return false;
  if (/\b(delete|remove)\b/.test(lower)) return false;
  if (/\b(add|create|schedule|make)\b/.test(lower) && !/\b(edit|update|change|rename|move|reschedule)\b/.test(lower)) {
    return false;
  }
  return /\b(edit|update|change|rename|move|reschedule)\b/.test(lower);
}

export function isDayOffDeleteIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(delete|remove)\b/.test(lower)) return false;
  return /\b(day\s*off|holiday|break)\b/.test(lower);
}

export function isDayOffCreateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(day\s*off|holiday|break)\b/.test(lower)) return false;
  if (isDayOffDeleteIntent(message) || isDayOffUpdateIntent(message)) return false;
  return /\b(add|create|schedule|make)\b/.test(lower);
}

function dayOffRoleDeniedResponse(ctx, action = 'manage') {
  if (ctx?.userRole !== 'child') return null;
  const verb = action === 'remove' ? 'remove' : action === 'update' ? 'update' : 'add';
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: `Only parents and tutors can ${verb} days off.`,
  });
}

export async function prepareDayOffCreate(message, ctx, overrides = {}) {
  const denied = dayOffRoleDeniedResponse(ctx, overrides.editRow?.id ? 'update' : 'add');
  if (denied) return denied;

  const repeatBlocked = dayOffRepeatBlockedMessage(message);
  if (repeatBlocked && !overrides.editRow) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: repeatBlocked,
    });
  }

  const title = parseDayOffTitleFromMessage(message, overrides);
  const range = overrides.startDate
    ? { startDate: overrides.startDate, endDate: overrides.endDate || overrides.startDate }
    : parseDateRangeFromMessage(message, new Date());
  let startDate = range?.startDate || overrides.editRow?.start || null;
  let endDate = range?.endDate || startDate || overrides.editRow?.end || null;
  if (!startDate) {
    const d = new Date();
    if (/\btomorrow\b/i.test(message)) d.setDate(d.getDate() + 1);
    else if (/\byesterday\b/i.test(message)) d.setDate(d.getDate() - 1);
    startDate = toYmd(d);
    endDate = startDate;
  }
  endDate = endDate || startDate;

  const unsupportedExtras = collectDayOffUnsupportedExtras(message);
  const isEdit = !!overrides.editRow?.id;

  // If learning is already scheduled on these dates, ask whether to move / delete it.
  let eventHandling = overrides.eventHandling || null;
  let conflictEvents = Array.isArray(overrides.conflictEvents) ? overrides.conflictEvents : null;
  if (!isEdit && eventHandling !== 'leave' && eventHandling !== 'move' && eventHandling !== 'delete') {
    conflictEvents = await loadLearningDaysInRange(ctx.householdId, startDate, endDate);
    if (conflictEvents.length > 0) {
      const isRange = startDate !== endDate;
      const whenLabel = isRange
        ? `${formatDisplayDate(startDate)} – ${formatDisplayDate(endDate)}`
        : formatDisplayDate(startDate);
      const offLabel = isRange || /\bbreak\b/i.test(message) ? 'break' : 'day off';
      const labels = [...new Set(conflictEvents.map((ev) => ev.title || 'Learning day'))].slice(0, 3);
      const n = conflictEvents.length;
      const listLabel = labels.length === 1 && n === 1
        ? `“${labels[0]}”`
        : `${n} learning day${n === 1 ? '' : 's'}${labels.length ? ` (${labels.join(', ')})` : ''}`;
      const them = n === 1 ? 'it' : 'them';
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: `${whenLabel} already has ${listLabel}. What should I do with ${them}?`,
        options: [
          {
            id: 'move',
            label: n === 1
              ? `Move learning day to the day after this ${offLabel}`
              : `Move learning days to the day after this ${offLabel}`,
            value: 'move',
            field: 'eventHandling',
          },
          {
            id: 'delete',
            label: n === 1
              ? 'Delete the learning day'
              : `Delete the ${n} learning days`,
            value: 'delete',
            field: 'eventHandling',
          },
          {
            id: 'leave',
            label: 'Leave learning as-is',
            value: 'leave',
            field: 'eventHandling',
          },
        ],
      }), {
        intent: 'day_off.create',
        field: 'eventHandling',
        originalMessage: message,
        draft: {
          ...overrides,
          title,
          startDate,
          endDate,
          schoolYearLabel: overrides.schoolYearLabel || ctx.schoolYearLabel,
          unsupportedExtras,
          conflictEvents: conflictEvents.map((ev) => ({
            id: String(ev.id),
            title: ev.title || 'Learning day',
            start_ts: ev.start_ts,
            end_ts: ev.end_ts,
          })),
        },
      });
    }
  } else if (!isEdit && !conflictEvents) {
    conflictEvents = await loadLearningDaysInRange(ctx.householdId, startDate, endDate);
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.DAY_OFF_CREATE,
    householdId: ctx.householdId,
    schoolYearLabel: overrides.schoolYearLabel || ctx.schoolYearLabel,
    title: String(title).trim() || 'Day off',
    startDate,
    endDate,
    editRow: overrides.editRow || null,
    unsupportedExtras,
    eventHandling: eventHandling || 'leave',
    conflictEventIds: (conflictEvents || []).map((ev) => String(ev.id)).filter(Boolean),
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.DAY_OFF_CREATE);
  const extrasNote = unsupportedExtras.length
    ? ` Note: ${unsupportedExtras.join(', ')} aren’t saved on days off yet (same as the Day off form) — use a calendar event if you need those.`
    : '';
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: (isEdit ? 'Update day off' : 'Add day off') + extrasNote,
    command,
    preview: handler.preview(command),
    confirmationLabel: isEdit ? 'Save day off' : 'Add day off',
    idempotencyKey: newIdempotencyKey(isEdit ? 'dayoff_upd' : 'dayoff'),
  });
}

async function loadLearningDaysInRange(familyId, startYmd, endYmd) {
  if (!familyId || !startYmd) return [];
  const start = String(startYmd);
  const end = String(endYmd || startYmd);
  try {
    const { supabase } = await import('../../supabase.js');
    // Pad ±1 day so UTC start_ts near midnight still lands in the local filter.
    const from = new Date(`${start}T00:00:00`);
    from.setDate(from.getDate() - 1);
    const to = new Date(`${end}T23:59:59`);
    to.setDate(to.getDate() + 1);
    const { data, error } = await supabase
      .from('events')
      .select('id,title,start_ts,end_ts,event_type,status,subject_id,counts_toward_plan,all_day,date_local')
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .gte('start_ts', from.toISOString())
      .lte('start_ts', to.toISOString())
      .limit(150);
    if (error) {
      // Fallback to the broader learning-day fetch used elsewhere in Doodle.
      const fallback = await fetchLearningDayEvents(familyId);
      if (fallback.error || !fallback.events?.length) return [];
      return fallback.events.filter((ev) => {
        const ymd = eventLocalYmd(ev);
        return ymd && ymd >= start && ymd <= end;
      });
    }
    return (data || []).filter((ev) => {
      if (!ev?.id) return false;
      const status = String(ev.status || '').toLowerCase();
      if (status === 'canceled' || status === 'cancelled') return false;
      const type = String(ev.event_type || '').toLowerCase();
      if (['holiday', 'break', 'day_off', 'dayoff', 'blackout'].includes(type)) return false;
      const ymd = (ev.date_local && String(ev.date_local).slice(0, 10)) || eventLocalYmd(ev);
      if (!ymd || ymd < start || ymd > end) return false;
      if (ev.subject_id || ev.counts_toward_plan === true) return true;
      return ['lesson', 'classwork', 'learning day', 'learning_day', 'class', 'session'].includes(type);
    });
  } catch {
    return [];
  }
}

async function loadFamilyDayOffs(ctx) {
  const { getFamilyExclusions } = await import('../../services/plannerSettingsClient.js');
  const { data, error } = await getFamilyExclusions(
    ctx.householdId,
    'family_default',
    ctx.schoolYearLabel || null,
  );
  if (error) {
    return {
      ok: false,
      response: assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: error.message || 'Could not load days off.',
        recoverable: true,
      }),
    };
  }
  return { ok: true, rows: (data || []).filter((row) => row?.id) };
}

function matchDayOffRows(rows, message) {
  const lower = String(message || '').toLowerCase();
  const matches = rows.filter((row) => {
    const label = String(row.label || '').toLowerCase();
    return label && lower.includes(label);
  });
  return matches.length ? matches : rows;
}

export async function prepareDayOffUpdate(message, ctx, overrides = {}) {
  const denied = dayOffRoleDeniedResponse(ctx, 'update');
  if (denied) return denied;

  const repeatBlocked = dayOffRepeatBlockedMessage(message);
  if (repeatBlocked) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: repeatBlocked,
    });
  }

  let editRow = overrides.editRow || null;
  if (!editRow?.id && overrides.exclusionId) {
    const loaded = await loadFamilyDayOffs(ctx);
    if (!loaded.ok) return loaded.response;
    const row = loaded.rows.find((r) => String(r.id) === String(overrides.exclusionId));
    if (!row) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: 'That day off could not be found.',
        recoverable: true,
      });
    }
    const { dayOffRowFromExclusion } = await import('../../create/saveDayOffHelpers.js');
    editRow = dayOffRowFromExclusion(row);
  }

  if (!editRow?.id) {
    try {
      const loaded = await loadFamilyDayOffs(ctx);
      if (!loaded.ok) return loaded.response;
      if (!loaded.rows.length) {
        return assertDoodleResponse({
          type: DOODLE_RESPONSE_TYPES.ANSWER,
          message: 'There are no days off saved for this school year yet.',
          links: [{ label: 'Open school year settings', href: '/settings' }],
        });
      }
      const pool = matchDayOffRows(loaded.rows, message);
      if (pool.length !== 1) {
        return withClarificationMeta(assertDoodleResponse({
          type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
          message: 'Which day off should I update?',
          options: pool.slice(0, 8).map((row) => ({
            id: String(row.id),
            label: `${row.label || 'Day off'} (${formatDisplayDate(row.start_date)}${row.end_date && toYmd(row.end_date) !== toYmd(row.start_date) ? ` – ${formatDisplayDate(row.end_date)}` : ''})`,
            value: String(row.id),
            field: 'exclusionId',
          })),
        }), {
          intent: 'day_off.update',
          field: 'exclusionId',
          originalMessage: message,
          draft: { ...overrides },
        });
      }
      const { dayOffRowFromExclusion } = await import('../../create/saveDayOffHelpers.js');
      editRow = dayOffRowFromExclusion(pool[0]);
    } catch (err) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: `Could not load days off: ${err?.message || String(err)}`,
        recoverable: true,
      });
    }
  }

  const renameOnly = message.match(
    /\b(?:rename|retitle)\s+(?:(?:the\s+)?(?:day\s*off|holiday|break)\s+)?(?:to|as)\s+["']?([^"'\n]+?)["']?\s*$/i,
  );
  const title = renameOnly
    ? cleanDayOffTitle(renameOnly[1], editRow.name || 'Day off')
    : (overrides.title
      ? cleanDayOffTitle(overrides.title, editRow.name || 'Day off')
      : parseDayOffTitleFromMessage(message, { ...overrides, editRow, title: null }));

  // Prefer an explicit new title when the message uses “called/named” after edit verbs
  let nextTitle = title;
  if (!renameOnly && !overrides.title) {
    const called = message.match(
      /\b(?:called|named|titled)\s+["']?([^"'\n]+?)["']?(?:\s+from|\s+on|\s+to|\s+through|\s+until|\s+at|\s+with|\s*$)/i,
    );
    if (called) nextTitle = cleanDayOffTitle(called[1], editRow.name || 'Day off');
    else if (nextTitle === 'Day off' || nextTitle === 'Holiday') nextTitle = editRow.name || nextTitle;
  }

  const range = overrides.startDate
    ? { startDate: overrides.startDate, endDate: overrides.endDate || overrides.startDate }
    : parseDateRangeFromMessage(message, new Date());
  const startDate = range?.startDate || editRow.start;
  const endDate = range?.endDate || (range?.startDate ? range.startDate : editRow.end) || startDate;

  return prepareDayOffCreate(message, ctx, {
    ...overrides,
    title: nextTitle,
    startDate,
    endDate,
    editRow,
  });
}

export async function prepareDayOffDelete(message, ctx, overrides = {}) {
  const denied = dayOffRoleDeniedResponse(ctx, 'remove');
  if (denied) return denied;

  if (overrides.exclusionId) {
    const command = {
      type: DOODLE_COMMAND_TYPES.DAY_OFF_DELETE,
      householdId: ctx.householdId,
      exclusionId: String(overrides.exclusionId),
      title: overrides.title || 'Day off',
      whenLabel: overrides.whenLabel || null,
    };
    const handler = getCommand(DOODLE_COMMAND_TYPES.DAY_OFF_DELETE);
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
      message: 'Remove day off',
      command,
      preview: handler.preview(command),
      confirmationLabel: 'Remove day off',
      idempotencyKey: newIdempotencyKey('dayoff_del'),
    });
  }

  try {
    const loaded = await loadFamilyDayOffs(ctx);
    if (!loaded.ok) return loaded.response;
    if (!loaded.rows.length) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ANSWER,
        message: 'There are no days off saved for this school year yet.',
        links: [{ label: 'Open school year settings', href: '/settings' }],
      });
    }

    const pool = matchDayOffRows(loaded.rows, message);
    if (pool.length === 1) {
      const row = pool[0];
      const start = toYmd(row.start_date);
      const end = toYmd(row.end_date) || start;
      return prepareDayOffDelete(message, ctx, {
        exclusionId: row.id,
        title: row.label || 'Day off',
        whenLabel: start === end
          ? formatDisplayDate(start)
          : `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`,
      });
    }
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which day off should I remove?',
      options: pool.slice(0, 8).map((row) => ({
        id: String(row.id),
        label: `${row.label || 'Day off'} (${formatDisplayDate(row.start_date)}${row.end_date && toYmd(row.end_date) !== toYmd(row.start_date) ? ` – ${formatDisplayDate(row.end_date)}` : ''})`,
        value: String(row.id),
        field: 'exclusionId',
      })),
    }), {
      intent: 'day_off.delete',
      field: 'exclusionId',
      originalMessage: message,
      draft: { ...overrides },
    });
  } catch (err) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not load days off: ${err?.message || String(err)}`,
      recoverable: true,
    });
  }
}

export async function prepareSchoolYearUpdate(message, ctx, overrides = {}) {
  const patch = { ...(overrides.patch || {}) };
  const lower = String(message || '').toLowerCase();
  let schoolYearLabel = overrides.schoolYearLabel || ctx.schoolYearLabel || null;

  const yearLabel = message.match(/\b(20\d{2})\s*\/\s*(\d{2})\b/);
  if (yearLabel) {
    schoolYearLabel = `${yearLabel[1]}/${yearLabel[2]}`;
    patch.default_school_year = schoolYearLabel;
  }

  const hoursMatch =
    message.match(/\b(\d+(?:\.\d+)?)\s*hours?\s*(?:per\s*day|\/\s*day)\b/i)
    || message.match(/\blearning\s*hours?\s*(?:to|at|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:per\s*day)?/i);
  if (hoursMatch && patch.default_planned_hours_per_day == null) {
    patch.default_planned_hours_per_day = Number(hoursMatch[1]);
  }

  const windowMatch = message.match(
    /\b(?:from|between)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s+(?:to|and|–|-)\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i,
  ) || message.match(
    /\bschool\s*hours?\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s*(?:to|–|-)\s*(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i,
  );
  if (windowMatch) {
    const startSql = clockRawToSqlTime(windowMatch[1]);
    const endSql = clockRawToSqlTime(windowMatch[2]);
    if (startSql) patch.default_day_start_time = startSql;
    if (endSql) patch.default_day_end_time = endSql;
    const span = hoursBetweenSqlTimes(startSql, endSql);
    if (span != null) patch.default_planned_hours_per_day = span;
  }

  const goalHours = message.match(/\b(?:attendance\s*)?goal\s*(?:to|at|=|:)?\s*(\d+(?:\.\d+)?)\s*hours?\b/i)
    || message.match(/\b(\d+(?:\.\d+)?)\s*hours?\s+(?:attendance\s*)?goal\b/i);
  const goalDays = message.match(/\b(?:attendance\s*)?goal\s*(?:to|at|=|:)?\s*(\d+)\s*days?\b/i)
    || message.match(/\b(\d+)\s*(?:target\s*)?days\b/i)
    || message.match(/\btarget\s*days?\s*(?:to|at|=|:)?\s*(\d+)/i);
  if (goalHours && patch.default_target_hours == null) {
    patch.default_target_hours = Number(goalHours[1]);
    patch.default_constraint_mode = 'hours';
  } else if (goalDays && patch.default_target_days == null) {
    patch.default_target_days = Number(goalDays[1]);
    if (patch.default_constraint_mode == null) patch.default_constraint_mode = 'days';
  }

  if (/\b(total\s+class\s*days|class\s*day\s*mode|tracking\s*mode\s*(?:to\s*)?total)\b/.test(lower)
    || /\battendance\s*tracking\s*(?:to\s*)?(?:total\s+)?class\s*days?\b/.test(lower)) {
    patch.attendance_tracking_mode = 'class_day';
    patch.target_scope = 'overall';
  } else if (/\b(per\s+subject|subject\s*mode|tracking\s*mode\s*(?:to\s*)?per\s+subject)\b/.test(lower)
    || /\battendance\s*tracking\s*(?:to\s*)?per\s+subject\b/.test(lower)) {
    patch.attendance_tracking_mode = 'subject';
    patch.target_scope = 'per_subject';
  }

  const weekdayCue = /\b(learning\s*days?|school\s*days?|weekdays?|default\s+learning\s+days?)\b/.test(lower)
    || /\b(mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/.test(lower)
      && /\b(school\s*year|learning|default)\b/.test(lower);
  if (weekdayCue || /\ballowed\s+weekdays?\b/.test(lower)) {
    const days = parseWeekdayNumsFromMessage(message);
    if (days.length) patch.allowed_weekdays = days;
  }

  const termRef = schoolYearEndRefDate(schoolYearLabel, new Date());
  const parseTerm = (termKey, patterns) => {
    for (const re of patterns) {
      const m = message.match(re);
      if (!m) continue;
      const start = parseNamedCalendarDate(m[1], termRef) || resolveFlexibleDay(m[1], termRef);
      const end = parseNamedCalendarDate(m[2], termRef) || resolveFlexibleDay(m[2], termRef);
      if (start) patch[`default_${termKey}_term_start_date`] = start;
      if (end) patch[`default_${termKey}_term_end_date`] = end;
      return;
    }
  };
  parseTerm('fall', [
    /\bfall\s+term\s*(?:dates?\s*)?(?:from|to|:)?\s*(.+?)\s+(?:to|through|until|–|-)\s+(.+?)(?:\.|$)/i,
    /\bfall\s+term\s+start\s+(.+?)\s+(?:and\s+)?end\s+(.+?)(?:\.|$)/i,
  ]);
  parseTerm('spring', [
    /\bspring\s+term\s*(?:dates?\s*)?(?:from|to|:)?\s*(.+?)\s+(?:to|through|until|–|-)\s+(.+?)(?:\.|$)/i,
    /\bspring\s+term\s+start\s+(.+?)\s+(?:and\s+)?end\s+(.+?)(?:\.|$)/i,
  ]);
  parseTerm('summer', [
    /\bsummer\s+(?:term|range)\s*(?:dates?\s*)?(?:from|to|:)?\s*(.+?)\s+(?:to|through|until|–|-)\s+(.+?)(?:\.|$)/i,
    /\bsummer\s+(?:term|range)\s+start\s+(.+?)\s+(?:and\s+)?end\s+(.+?)(?:\.|$)/i,
  ]);

  // Single-sided term end: “end summer range Aug 31”
  const singleTermEnd = message.match(
    /\b(?:end|ending)\s+(fall|spring|summer)\s+(?:term|range)\s+(?:on\s+|to\s+)?(.+?)(?:\.|$)/i,
  ) || message.match(
    /\b(fall|spring|summer)\s+(?:term|range)\s+end(?:s|ing)?(?:\s+on)?\s+(.+?)(?:\.|$)/i,
  );
  if (singleTermEnd) {
    const termKey = String(singleTermEnd[1]).toLowerCase();
    const end = parseNamedCalendarDate(singleTermEnd[2], termRef) || resolveFlexibleDay(singleTermEnd[2], termRef);
    if (end) {
      patch[`default_${termKey}_term_end_date`] = end;
      patch.default_year_end_date = end;
    }
  }

  const yearRange = message.match(
    /\b(?:school\s*)?year\s+(?:dates?\s*)?(?:from|to|:)?\s*(.+?)\s+(?:to|through|until|–|-)\s+(.+?)(?:\.|$)/i,
  );
  if (yearRange && !/fall|spring|summer/.test(yearRange[0].toLowerCase())
    && !/\bto\s+end\b/i.test(yearRange[0])) {
    const start = parseNamedCalendarDate(yearRange[1], termRef) || resolveFlexibleDay(yearRange[1], termRef);
    const end = parseNamedCalendarDate(yearRange[2], termRef) || resolveFlexibleDay(yearRange[2], termRef);
    if (start) patch.default_year_start_date = start;
    if (end) patch.default_year_end_date = end;
  }

  // “change this school year to end Aug 31” → year end + last configured term/semester end
  const yearEndOnly = parseSchoolYearEndDateOnly(message, schoolYearLabel, overrides);
  if (yearEndOnly && patch.default_year_end_date == null) {
    patch.default_year_end_date = yearEndOnly;
  }
  if (yearEndOnly) {
    let lastTermKey = overrides.lastTermKey || null;
    if (!lastTermKey) {
      if (/\bsummer\b/.test(lower)) lastTermKey = 'summer';
      else if (/\bspring\b/.test(lower)) lastTermKey = 'spring';
      else if (/\bfall\b/.test(lower)) lastTermKey = 'fall';
    }
    if (!lastTermKey) {
      let settings = overrides.settings || null;
      if (!settings && ctx.householdId) {
        try {
          const { getFamilyPlannerSettings } = await import('../../services/plannerSettingsClient.js');
          const { data } = await getFamilyPlannerSettings(ctx.householdId, schoolYearLabel);
          settings = data || null;
        } catch {
          settings = null;
        }
      }
      lastTermKey = resolveLastConfiguredTermKey(settings || {});
    }
    if (!lastTermKey) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: `Which term should end on ${formatDisplayDate(yearEndOnly)}? (We’ll update the last semester for families that only use Fall/Spring.)`,
        options: [
          { id: 'fall', label: 'Fall term', value: 'fall', field: 'lastTermKey' },
          { id: 'spring', label: 'Spring term', value: 'spring', field: 'lastTermKey' },
          { id: 'summer', label: 'Summer range', value: 'summer', field: 'lastTermKey' },
        ],
      }), {
        intent: 'school_year.update',
        field: 'lastTermKey',
        originalMessage: message,
        draft: { ...overrides, schoolYearLabel, yearEndDate: yearEndOnly, patch },
      });
    }
    patch[`default_${lastTermKey}_term_end_date`] = yearEndOnly;
    patch.default_year_end_date = yearEndOnly;
  }

  if (!Object.keys(patch).length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What should I change in School Year Settings? Examples: “set learning days to Mon Tue Wed”, “set school hours from 9am to 3pm”, “set attendance goal to 80 days”, “change this school year to end Aug 31”, or “set fall term from Aug 7 to Dec 19”.',
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.SCHOOL_YEAR_UPDATE,
    householdId: ctx.householdId,
    schoolYearLabel,
    patch,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.SCHOOL_YEAR_UPDATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Update school year settings',
    command,
    preview: handler.preview(command),
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

function parseMaterialDocumentRole(message) {
  const lower = String(message || '').toLowerCase();
  if (/\blesson\s*plan\b/.test(lower)) return 'lesson_plan';
  if (/\bsyllabus\b/.test(lower)) return 'syllabus';
  return null;
}

/** “delete all attachments/materials” (tolerates common typos like attachemnts). */
export function isMaterialArchiveAllIntent(message) {
  const lower = String(message || '').toLowerCase().trim();
  if (!lower) return false;
  if (/\bhow\s+(do|to|can)\b/.test(lower)) return false;
  if (!/\b(delete|remove|clear|archive)\b/.test(lower)) return false;
  if (!/\ball\b/.test(lower)) return false;
  // attachments / attachemnts / materials / files in materials
  return (
    /\bmaterials?\b/.test(lower)
    || /\battach/.test(lower)
    || (/\bfiles?\b/.test(lower) && /\bmaterials?\b/.test(lower))
    || /\bfiles?\b/.test(lower)
  );
}

export async function prepareMaterialArchiveAll(message, ctx, overrides = {}) {
  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('materials')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Materials are not enabled for this household.',
      recoverable: false,
    });
  }

  let list = Array.isArray(overrides.materials) ? overrides.materials : null;
  if (!list) {
    const { fetchMaterialsForChat } = await import('../materialChatActions.js');
    const { materials, error } = await fetchMaterialsForChat(ctx.householdId);
    if (error) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: error.message || 'Could not load materials.',
        recoverable: true,
      });
    }
    list = Array.isArray(materials) ? materials : [];
  }

  if (!list.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: 'There are no materials to delete.',
      links: [{ label: 'Open Materials', href: '/subjects?tab=materials' }],
    });
  }

  const titles = list
    .map((m) => String(m.title || m.name || 'Untitled').trim())
    .filter(Boolean);
  const previewTitles = titles.slice(0, 5);
  const moreCount = Math.max(0, titles.length - previewTitles.length);

  const command = {
    type: DOODLE_COMMAND_TYPES.MATERIAL_ARCHIVE_ALL,
    householdId: ctx.householdId,
    materialIds: list.map((m) => String(m.id)).filter(Boolean),
    count: list.length,
    titles: previewTitles,
    moreCount,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.MATERIAL_ARCHIVE_ALL);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: list.length === 1 ? 'Delete material' : `Delete ${list.length} materials`,
    command,
    preview: handler.preview(command),
    confirmationLabel: list.length === 1 ? 'Delete material' : `Delete ${list.length} materials`,
    idempotencyKey: newIdempotencyKey('material_archive_all'),
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

  let subjectId = overrides.subjectId || ctx.selectedSubjectId || null;
  let subjectName = overrides.subjectName || null;
  if (!subjectId) {
    const mentioned = findSubjectMentionedInMessage(message, roster.subjects || []);
    if (mentioned.ok) {
      subjectId = String(mentioned.subject.id);
      subjectName = mentioned.subject.name || mentioned.subject.title || null;
    }
  }
  if (subjectId && !subjectName) {
    const match = (roster.subjects || []).find((s) => String(s.id) === String(subjectId));
    subjectName = match?.name || match?.title || null;
  }

  if ((!childIds || !childIds.length) && subjectId) {
    const subject = (roster.subjects || []).find((s) => String(s.id) === String(subjectId));
    if (subject) {
      const fromSubject = String(subject.child_id || '')
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (fromSubject.length) {
        childIds = fromSubject;
      } else if ((roster.children || []).length) {
        childIds = roster.children.map((c) => String(c.id));
      }
    }
  }

  const documentRole = overrides.documentRole || parseMaterialDocumentRole(message);
  // “attach … to Subject” without an explicit role still links the subject on Materials.
  const attachToSubject = Boolean(subjectId)
    && (
      Boolean(documentRole)
      || /\b(attach|link)\b/i.test(message)
      || /\b(?:to|on|for)\s+[A-Za-z]/.test(message)
    );

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
    subjectId: attachToSubject ? subjectId : (overrides.subjectId || ctx.selectedSubjectId || null),
    subjectName: attachToSubject ? subjectName : null,
    documentRole: documentRole || null,
    linkAsSubjectAttachment: Boolean(attachToSubject && documentRole),
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.MATERIAL_CREATE_FILE);
  const extra = attachments.length > 1
    ? [`Only the first file (“${first.fileName}”) will be added. Remove extras or send them one at a time.`]
    : undefined;

  const previewTitle = command.linkAsSubjectAttachment
    ? (documentRole === 'syllabus'
      ? `Add syllabus to ${subjectName || 'subject'}`
      : `Add lesson plan to ${subjectName || 'subject'}`)
    : (command.subjectId
      ? `Add file to Materials (${subjectName || 'subject'})`
      : 'Add file to Materials');

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: previewTitle,
    command,
    preview: handler.preview(command),
    warnings: extra,
    confirmationLabel: command.linkAsSubjectAttachment
      ? (documentRole === 'syllabus' ? 'Add syllabus' : 'Add lesson plan')
      : 'Add to Materials',
    idempotencyKey: newIdempotencyKey('materialfile'),
  });
}

export async function prepareSubjectCreate(message, ctx, roster, overrides = {}) {
  let name = overrides.name
    || message.match(/\bsubject\s+(?:called|named|titled)\s+(.+)$/i)?.[1]?.replace(/[.?!].*$/, '').trim()
    || message.match(/\b(?:add|create)\s+(?:a\s+)?subject\s+(.+)$/i)?.[1]?.trim();
  name = name
    ?.replace(/\s+for\s+[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?$/i, '')
    .replace(/\b(?:grade|grading|syllabus|lesson\s*plan|term|school\s*year|with|using|at|on)\b.*$/i, ' ')
    .replace(/^(an?\s+|the\s+)/i, '')
    .replace(/\s{2,}/g, ' ')
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

  let childIds = Array.isArray(overrides.childIds) ? overrides.childIds.map(String) : null;
  let childId = overrides.childId || (childIds?.[0]) || ctx.selectedChildIds?.[0] || null;
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
  childIds = childIds?.length ? childIds : [String(childId)];

  const gradeMatch = message.match(/\bgrade\s*(?:level\s*)?(?:to|at|=|:)?\s*(k|\d{1,2})\b/i);
  const grade = overrides.grade
    || (gradeMatch
      ? (String(gradeMatch[1]).toUpperCase() === 'K' ? 'K' : String(gradeMatch[1]))
      : null);
  const grading = parseSubjectGradingMethod(message);
  const schoolYear = parseSubjectSchoolYear(message, overrides.schoolYear || ctx.schoolYearLabel || null);
  const schoolTerm = overrides.schoolTerm || parseSubjectTerm(message);

  const attach = await resolveSubjectAttachmentMaterial(ctx.householdId, message, overrides);
  if (attach.response) return attach.response;
  if (attach.clarification) {
    return withClarificationMeta(attach.clarification, {
      intent: 'subject.create',
      field: 'syllabusMaterialId',
      originalMessage: message,
      draft: {
        name,
        childId: childIds[0],
        childIds,
        grade,
        schoolYear,
        schoolTerm,
        gradingMethod: grading?.method,
        gradingLabel: grading?.label,
        ...overrides,
      },
    });
  }

  const childNames = childIds
    .map((id) => {
      const c = (roster.children || []).find((row) => String(row.id) === String(id));
      return c?.first_name || c?.name || null;
    })
    .filter(Boolean)
    .join(', ');

  const command = {
    type: DOODLE_COMMAND_TYPES.SUBJECT_CREATE,
    householdId: ctx.householdId,
    name,
    childId: childIds[0],
    childIds,
    childName: childNames.split(', ')[0] || null,
    childNames: childNames || null,
    grade,
    schoolYear,
    schoolTerm,
    gradingMethod: grading?.method || overrides.gradingMethod || null,
    gradingLabel: grading?.label || overrides.gradingLabel || null,
    syllabusMaterialId: attach.syllabusMaterialId || null,
    lessonPlanMaterialId: attach.lessonPlanMaterialId || null,
    syllabusTitle: attach.title || null,
    schedule: overrides.schedule || null,
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

/**
 * Update subject settings (schedule days/time/duration/dates, name, grade, students)
 * — same surface as Subject settings modal.
 */
export async function prepareSubjectUpdate(message, ctx, roster, overrides = {}) {
  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('learningAreas')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Learning areas are not enabled for this household.',
      recoverable: false,
    });
  }

  let subject = null;
  if (overrides.subjectId) {
    subject = (roster.subjects || []).find((s) => String(s.id) === String(overrides.subjectId)) || null;
  }
  if (!subject && overrides.subjectName) {
    const resolvedRecent = resolveSubjectByName(overrides.subjectName, roster.subjects);
    if (resolvedRecent.ok) subject = resolvedRecent.subject;
  }
  if (!subject) {
    const mentioned = findSubjectMentionedInMessage(message, roster.subjects || []);
    if (mentioned.ok) subject = mentioned.subject;
  }
  if (!subject) {
    const named = message.match(/\bsubject\s+["']?([A-Za-z0-9][^"'?\n]{1,80})["']?/i)?.[1]?.trim();
    if (named) {
      const resolved = resolveSubjectByName(named, roster.subjects);
      if (resolved.clarification) {
        return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
          intent: 'subject.update',
          field: 'subjectId',
          originalMessage: message,
          draft: { ...overrides },
        });
      }
      if (resolved.ok) subject = resolved.subject;
    }
  }
  // Pronoun follow-ups (“change it for next year”) after a create/update in this chat.
  if (!subject && overrides.subjectId) {
    subject = {
      id: String(overrides.subjectId),
      name: overrides.subjectName || 'Subject',
      school_year: overrides.schoolYear || ctx.schoolYearLabel || null,
    };
  }
  if (!subject) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject should I update?',
      options: (roster.subjects || []).slice(0, 10).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'subject.update',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const lower = String(message || '').toLowerCase();
  const patch = { ...(overrides.patch || {}) };
  const subjectName = String(subject.name || subject.title || overrides.subjectName || 'Subject');

  const renameMatch = message.match(
    /\brename\s+(?:subject\s+)?(?:to\s+)?["']?([^"'\n]{2,80})["']?/i,
  ) || message.match(
    /\b(?:change|set)\s+(?:the\s+)?name\s+(?:to|as)\s+["']?([^"'\n]{2,80})["']?/i,
  );
  if (renameMatch && !patch.name) {
    const next = renameMatch[1].trim().replace(/[.?!]+$/, '');
    if (next && next.toLowerCase() !== subjectName.toLowerCase()) patch.name = next;
  }

  const gradeMatch = message.match(/\bgrade\s*(?:level\s*)?(?:to|at|=|:)?\s*(k|\d{1,2})\b/i);
  if (gradeMatch && patch.grade == null && !/\bgrading\b/i.test(message)) {
    patch.grade = String(gradeMatch[1]).toUpperCase() === 'K' ? 'K' : String(gradeMatch[1]);
  }

  const grading = parseSubjectGradingMethod(message);
  if (grading && !patch.gradingMethod) {
    patch.gradingMethod = grading.method;
    patch.gradingLabel = grading.label;
  }

  const schoolYearBase = subject.school_year || ctx.schoolYearLabel || null;
  const schoolYear = parseSubjectSchoolYear(message, schoolYearBase);
  if (schoolYear && patch.schoolYear == null) patch.schoolYear = schoolYear;
  const schoolTerm = parseSubjectTerm(message);
  if (schoolTerm && patch.schoolTerm == null) patch.schoolTerm = schoolTerm;

  const splitChildIds = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return String(value).split(/[;,]/).map((s) => s.trim()).filter(Boolean);
  };

  let childIds = Array.isArray(overrides.childIds) ? overrides.childIds.map(String) : null;
  if (!childIds && /\b(student|learner|child|for)\b/.test(lower)) {
    const forMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
    const assignMatch = message.match(/\b(?:assign|add)\s+([A-Za-z][A-Za-z'-]*)\b/i);
    const childName = forMatch?.[1] || assignMatch?.[1];
    if (childName && !/^(grade|subject|thursday|monday|tuesday|wednesday|friday|saturday|sunday)$/i.test(childName)) {
      const resolved = resolveChildByName(childName, roster.children);
      if (resolved.clarification) {
        return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
          intent: 'subject.update',
          field: 'childId',
          originalMessage: message,
          draft: { subjectId: String(subject.id), patch, ...overrides },
        });
      }
      if (resolved.ok) {
        const existing = splitChildIds(subject.child_id);
        const nextId = String(resolved.child.id);
        childIds = /\b(add|assign|also|too)\b/.test(lower)
          ? [...new Set([...existing, nextId])]
          : [nextId];
      }
    }
  }
  if (childIds) patch.childIds = childIds;

  const attach = await resolveSubjectAttachmentMaterial(ctx.householdId, message, {
    ...overrides,
    attachmentTitle: overrides.attachmentTitle || parseAttachmentTitleFromMessage(message),
  });
  if (attach.response) return attach.response;
  if (attach.clarification) {
    return withClarificationMeta(attach.clarification, {
      intent: 'subject.update',
      field: 'syllabusMaterialId',
      originalMessage: message,
      draft: { subjectId: String(subject.id), patch, ...overrides },
    });
  }

  const wantsSchedule = parseWeekdayNumsFromMessage(message).length > 0
    || /\b(schedule|meet(?:s|ing)?|duration|minutes?)\b/.test(lower)
    || /\bat\s+\d/.test(lower)
    || overrides.schedule;

  let schedule = overrides.schedule || null;
  if (wantsSchedule && !schedule) {
    try {
      const {
        buildInitialScheduleForm,
        hmToMaskedTime,
        maskedTimeToHm,
        normalizeHm,
        toLocalYmd,
      } = await import('../../subjectConfigureSchedule.js');
      const { findAcademicYearPlanForSubject } = await import('../../subjectPlanSlotLines.js');
      const { getFamilyPlannerSettings } = await import('../../services/plannerSettingsClient.js');

      const schoolYearLabel = subject.school_year || ctx.schoolYearLabel || null;
      const [{ academicYearId, planData }, settingsResult] = await Promise.all([
        findAcademicYearPlanForSubject(ctx.householdId, subject.id),
        getFamilyPlannerSettings(ctx.householdId, schoolYearLabel),
      ]);
      const form = buildInitialScheduleForm({
        subject,
        planData,
        academicYearId,
        plannerSettings: settingsResult?.data || null,
      });

      const nextWeekdays = mergeWeekdaysFromMessage(form.weekdays, message);
      if (!nextWeekdays?.length && !overrides.weekdays?.length) {
        if (!Object.keys(patch).length) {
          return assertDoodleResponse({
            type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
            message: `Which days should ${subjectName} meet? Example: “change ${subjectName} to be on Thursdays too”.`,
          });
        }
      } else {
        const weekdays = overrides.weekdays || nextWeekdays || form.weekdays;
        if (!weekdays?.length) {
          return assertDoodleResponse({
            type: DOODLE_RESPONSE_TYPES.ERROR,
            message: `${subjectName} needs at least one meeting day.`,
            recoverable: true,
          });
        }

        let startTime = form.startTime || '09:00';
        const timeMatch = message.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
        if (timeMatch) {
          startTime = maskedTimeToHm(timeMatch[1], startTime);
        }
        startTime = normalizeHm(startTime, '09:00');

        let durationMinutes = Number(form.durationMinutes) > 0 ? Number(form.durationMinutes) : 60;
        const durationMatch = message.match(/\b(\d{1,3})\s*(?:min(?:ute)?s?)\b/i);
        if (durationMatch) durationMinutes = Number(durationMatch[1]);

        const startDate = form.startDate ? toLocalYmd(form.startDate) : null;
        const endDate = form.endDate ? toLocalYmd(form.endDate) : null;
        if (!startDate || !endDate) {
          return assertDoodleResponse({
            type: DOODLE_RESPONSE_TYPES.ERROR,
            message: `${subjectName} does not have schedule dates yet. Open Subject settings to set the term dates, then try again.`,
            recoverable: true,
            links: [{ label: 'Open Learning', href: '/learning' }],
          });
        }

        schedule = {
          weekdays: [...weekdays].sort((a, b) => a - b),
          startTime,
          startTimeLabel: hmToMaskedTime(startTime),
          durationMinutes,
          startDate,
          endDate,
          academicYearId: academicYearId || null,
          applyScope: /\b(from now|going forward|forward)\b/.test(lower) ? 'forward' : 'full_year',
        };
      }
    } catch (err) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ERROR,
        message: `Could not load ${subjectName} schedule: ${err?.message || String(err)}`,
        recoverable: true,
      });
    }
  }

  const hasAttach = attach.clearAttachments
    || attach.syllabusMaterialId
    || attach.lessonPlanMaterialId;

  if (!Object.keys(patch).length && !schedule && !hasAttach) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: `What should I change for ${subjectName}? Try schedule days, grade, grading method, term, students, or “attach syllabus World History Guide to ${subjectName}”.`,
    });
  }

  const childNames = Array.isArray(patch.childIds)
    ? patch.childIds
      .map((id) => {
        const c = (roster.children || []).find((row) => String(row.id) === String(id));
        return c?.first_name || c?.name || null;
      })
      .filter(Boolean)
      .join(', ')
    : null;

  const command = {
    type: DOODLE_COMMAND_TYPES.SUBJECT_UPDATE,
    householdId: ctx.householdId,
    subjectId: String(subject.id),
    subjectName,
    patch,
    schedule,
    childNames,
    clearAttachments: attach.clearAttachments || false,
    syllabusMaterialId: attach.clearAttachments ? null : (attach.syllabusMaterialId ?? undefined),
    lessonPlanMaterialId: attach.clearAttachments ? null : (attach.lessonPlanMaterialId ?? undefined),
    syllabusTitle: attach.title || null,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.SUBJECT_UPDATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: schedule
      ? `Update ${subjectName} schedule`
      : `Update ${subjectName}`,
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Save subject settings',
    idempotencyKey: newIdempotencyKey('subject_update'),
  });
}

export async function prepareSubjectDelete(message, ctx, roster, overrides = {}) {
  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('learningAreas')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Learning areas are not enabled for this household.',
      recoverable: false,
    });
  }

  let subject = null;
  if (overrides.subjectId) {
    subject = (roster.subjects || []).find((s) => String(s.id) === String(overrides.subjectId)) || null;
  }
  if (!subject) {
    const mentioned = findSubjectMentionedInMessage(message, roster.subjects || []);
    if (mentioned.ok) subject = mentioned.subject;
  }
  if (!subject) {
    const named = message.match(/\bsubject\s+["']?([A-Za-z0-9][^"'?\n]{1,80})["']?/i)?.[1]?.trim();
    if (named) {
      const resolved = resolveSubjectByName(named, roster.subjects);
      if (resolved.ok) subject = resolved.subject;
    }
  }
  if (!subject) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject should I delete?',
      options: (roster.subjects || []).slice(0, 10).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'subject.delete',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const subjectName = String(subject.name || subject.title || 'Subject');
  let confirmName = overrides.confirmName || null;
  if (!confirmName) {
    const typed = message.match(/\bconfirm(?:ed)?\s+(?:as\s+)?["']?([^"'\n]+?)["']?\s*$/i);
    if (typed) confirmName = typed[1].trim();
  }
  if (!confirmName) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: `Type “${subjectName}” to confirm deleting this subject (same as Delete subject in Subject settings).`,
    }), {
      intent: 'subject.delete',
      field: 'confirmName',
      originalMessage: message,
      draft: { ...overrides, subjectId: String(subject.id), subjectName },
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.SUBJECT_DELETE,
    householdId: ctx.householdId,
    subjectId: String(subject.id),
    subjectName,
    confirmName: String(confirmName).trim(),
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.SUBJECT_DELETE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: `Delete ${subjectName}`,
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Delete subject',
    idempotencyKey: newIdempotencyKey('subject_del'),
  });
}

function childRoleDenied(ctx, action = 'manage children') {
  if (ctx?.userRole === 'parent') return null;
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: `Only parents can ${action}.`,
  });
}

function parseChildAgeFromMessage(message) {
  const m = String(message || '').match(/\bage\s*(?:is|to|:)?\s*(\d{1,2})\b/i)
    || String(message || '').match(/\b(\d{1,2})\s*years?\s*old\b/i);
  if (!m) return null;
  const age = Number(m[1]);
  return Number.isInteger(age) ? age : null;
}

function parseChildGradeFromMessage(message) {
  const m = String(message || '').match(
    /\bgrade\s*(?:is|to|as|:)?\s*(pre-?k|k(?:indergarten)?|\d{1,2})\b/i,
  ) || String(message || '').match(
    /\bin\s+(pre-?k|k(?:indergarten)?|\d{1,2})(?:st|nd|rd|th)?\s*grade\b/i,
  );
  if (!m) return null;
  let g = String(m[1]).trim();
  if (/^k/i.test(g)) return 'K';
  if (/^pre/i.test(g)) return 'Pre-K';
  return g;
}

function parseChildEmailFromMessage(message) {
  return String(message || '').match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0] || null;
}

function parseChildInterestsFromMessage(message) {
  const m = String(message || '').match(/\binterests?\s*(?:are|:)?\s+["']?([^"'\n.]+)/i);
  if (!m) return null;
  return m[1].split(/[,&]/).map((s) => s.trim()).filter(Boolean);
}

function parseChildAvatarFromMessage(message) {
  const m = String(message || '').match(/\bavatar\s*(?:to|as|:)?\s*(prof\d+|poodle\d+|\w+)\b/i);
  return m ? m[1] : null;
}

function parseChildNotesFromMessage(message) {
  const m = String(message || '').match(/\b(?:additional\s*)?notes?\s*(?:that|:)?\s+["']?(.+?)["']?\s*$/i)
    || String(message || '').match(/\bwith\s+notes?\s+["']?(.+?)["']?\s*$/i);
  return m ? m[1].trim() : null;
}

function cleanChildNameCandidate(raw) {
  return String(raw || '')
    .replace(/\b(age|grade|avatar|notes?|interests?|years?\s*old)\b.*$/i, ' ')
    .replace(/\b\d{1,2}\b/g, ' ')
    .replace(/^(an?\s+|the\s+)/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function resolveRosterChild(message, roster, overrides = {}) {
  if (overrides.childId) {
    const child = (roster.children || []).find((c) => String(c.id) === String(overrides.childId));
    if (child) return { ok: true, child };
  }
  const named = message.match(
    /\b(?:child|learner|student)\s+(?:called|named)?\s*["']?([A-Za-z][\w'-]*)/i,
  ) || message.match(
    /\b(?:edit|update|change|rename|delete|remove|invite)\s+["']?([A-Za-z][\w'-]*)/i,
  ) || message.match(
    /\b([A-Za-z][\w'-]*)(?:'s)?\s+(?:age|grade|avatar|notes?|interests?|profile)\b/i,
  );
  if (named) {
    const resolved = resolveChildByName(named[1], roster.children);
    if (resolved.ok) return { ok: true, child: resolved.child };
    if (resolved.clarification) return { ok: false, clarification: resolved.clarification };
  }
  for (const c of roster.children || []) {
    const n = String(c.first_name || c.name || '').trim().toLowerCase();
    if (n.length >= 2 && String(message || '').toLowerCase().includes(n)) {
      return { ok: true, child: c };
    }
  }
  if ((roster.children || []).length === 1) {
    return { ok: true, child: roster.children[0] };
  }
  return { ok: false };
}

export function isChildUpdateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (/\b(delete|remove|invite)\b/.test(lower)) return false;
  if (/\b(add|create)\b/.test(lower) && /\b(child|learner|student)\b/.test(lower)) return false;
  if (/\b(rename)\b/.test(lower) && /\b(child|learner|student)\b/.test(lower)) return true;
  if (/\b(edit|update|change|set)\b/.test(lower) && /\b(child|learner|student|age|grade|avatar|notes?|interests?)\b/.test(lower)) {
    return true;
  }
  return /\b\w+'s\s+(age|grade|avatar|notes?|interests?|name)\b/.test(lower)
    && /\b(to|as|:|=)\b/.test(lower);
}

export function isChildDeleteIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(delete|remove)\b/.test(lower)) return false;
  return /\b(child|learner|student)\b/.test(lower);
}

export function isChildInviteIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\binvite\b/.test(lower)) return false;
  return /\b(child|learner|student)\b/.test(lower) || !!parseChildEmailFromMessage(message);
}

export function prepareChildCreate(message, ctx, overrides = {}) {
  const denied = childRoleDenied(ctx, 'add children');
  if (denied) return denied;

  let name = overrides.name
    || message.match(/\b(?:child|learner|student)\s+(?:called|named)\s+(.+)$/i)?.[1]?.replace(/[.?!].*$/, '').trim()
    || message.match(/\b(?:add|create)\s+(?:a\s+)?(?:child|learner|student)\s+(.+)$/i)?.[1]?.trim();
  name = cleanChildNameCandidate(name);
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

  const age = overrides.age != null ? Number(overrides.age) : parseChildAgeFromMessage(message);
  const gradeLabel = overrides.gradeLabel || parseChildGradeFromMessage(message);
  const avatar = overrides.avatar || parseChildAvatarFromMessage(message);
  const interests = overrides.interests || parseChildInterestsFromMessage(message);
  const notes = overrides.notes || parseChildNotesFromMessage(message);

  if ((age == null || !Number.isFinite(age)) && !gradeLabel) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: `What is ${name}’s age or grade? (Age 3–20, or grade Pre-K through 12.)`,
    }), {
      intent: 'child.create',
      field: 'ageOrGrade',
      originalMessage: message,
      draft: { ...overrides, name, avatar, interests, notes },
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.CHILD_CREATE,
    householdId: ctx.householdId,
    name,
    age: Number.isFinite(age) ? age : null,
    gradeLabel: gradeLabel || null,
    avatar: avatar || null,
    interests: interests || null,
    notes: notes || null,
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

export async function prepareChildUpdate(message, ctx, roster, overrides = {}) {
  const denied = childRoleDenied(ctx, 'edit children');
  if (denied) return denied;

  const resolved = resolveRosterChild(message, roster, overrides);
  if (!resolved.ok) {
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'child.update',
        field: 'childId',
        originalMessage: message,
        draft: { ...overrides },
      });
    }
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which child should I update?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Child',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'child.update',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const child = resolved.child;
  const childName = child.first_name || child.name || 'Learner';
  const patch = { ...(overrides.patch || {}) };
  const lower = String(message || '').toLowerCase();

  const rename = message.match(/\brename\s+(?:(?:child|learner|student)\s+)?(?:to\s+)?["']?([A-Za-z][\w'-]*)/i)
    || message.match(/\b(?:change|set|update)\s+(?:(?:their|the)\s+)?name\s+to\s+["']?([A-Za-z][\w'-]*)/i)
    || message.match(/\bname\s+to\s+["']?([A-Za-z][\w'-]*)/i);
  if (rename && !patch.first_name) patch.first_name = rename[1];

  const age = parseChildAgeFromMessage(message);
  if (age != null && patch.age == null) patch.age = age;
  const grade = parseChildGradeFromMessage(message);
  if (grade && patch.grade == null) patch.grade = grade;
  const avatar = parseChildAvatarFromMessage(message);
  if (avatar && patch.avatar == null) patch.avatar = avatar;
  const interests = parseChildInterestsFromMessage(message);
  if (interests && patch.interests == null) patch.interests = interests;
  const notes = parseChildNotesFromMessage(message);
  if (notes && patch.notes == null) patch.notes = notes;
  if (/\b(clear|remove)\s+(additional\s*)?notes?\b/.test(lower)) patch.notes = '';

  if (!Object.keys(patch).length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: `What should I change for ${childName}? Examples: age, grade, name, interests, notes, or avatar.`,
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.CHILD_UPDATE,
    householdId: ctx.householdId,
    childId: String(child.id),
    childName,
    patch,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.CHILD_UPDATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: `Update ${childName}`,
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Save changes',
    idempotencyKey: newIdempotencyKey('child_upd'),
  });
}

export async function prepareChildDelete(message, ctx, roster, overrides = {}) {
  const denied = childRoleDenied(ctx, 'delete children');
  if (denied) return denied;

  const resolved = resolveRosterChild(message, roster, overrides);
  if (!resolved.ok) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which child should I permanently delete?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Child',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'child.delete',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const child = resolved.child;
  const childName = child.first_name || child.name || 'Learner';
  let confirmName = overrides.confirmName || null;
  if (!confirmName) {
    const typed = message.match(/\bconfirm(?:ed)?\s+(?:as\s+)?["']?([A-Za-z][\w'-]*)/i);
    if (typed) confirmName = typed[1];
  }
  if (!confirmName) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: `Type “${childName}” to confirm permanently deleting this student (same as Delete Student in Edit Family).`,
    }), {
      intent: 'child.delete',
      field: 'confirmName',
      originalMessage: message,
      draft: { ...overrides, childId: String(child.id), childName },
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.CHILD_DELETE,
    householdId: ctx.householdId,
    childId: String(child.id),
    childName,
    confirmName: String(confirmName).trim(),
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.CHILD_DELETE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: `Delete ${childName}`,
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Delete student',
    idempotencyKey: newIdempotencyKey('child_del'),
  });
}

export async function prepareChildInvite(message, ctx, roster, overrides = {}) {
  const denied = childRoleDenied(ctx, 'invite children');
  if (denied) return denied;

  const resolved = resolveRosterChild(message, roster, overrides);
  if (!resolved.ok) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which child should I invite?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Child',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'child.invite',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const child = resolved.child;
  const childName = child.first_name || child.name || 'Learner';
  const email = overrides.email || parseChildEmailFromMessage(message);
  if (!email) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: `What email should I use to invite ${childName}?`,
    }), {
      intent: 'child.invite',
      field: 'email',
      originalMessage: message,
      draft: { ...overrides, childId: String(child.id), childName },
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.CHILD_INVITE,
    householdId: ctx.householdId,
    childId: String(child.id),
    childName,
    email: String(email).trim(),
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.CHILD_INVITE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: `Invite ${childName}`,
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Send invite',
    idempotencyKey: newIdempotencyKey('child_invite'),
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
  return /\b(today|tomorrow|yesterday|next\s+week|in\s+a\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i.test(
    String(message || ''),
  );
}

/** Upcoming calendar dates for every weekday named in the message (e.g. “fri and sat”). */
export function parseWeekdayDatesFromMessage(message, fromDate = new Date()) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return [];
  const entries = [
    ['sunday', 0], ['monday', 1], ['tuesday', 2], ['wednesday', 3],
    ['thursday', 4], ['friday', 5], ['saturday', 6],
    ['tues', 2], ['thurs', 4], ['thur', 4],
    ['sun', 0], ['mon', 1], ['tue', 2], ['wed', 3],
    ['thu', 4], ['fri', 5], ['sat', 6],
  ].sort((a, b) => b[0].length - a[0].length);

  const matches = [];
  for (const [name, dow] of entries) {
    const re = new RegExp(`\\b${name}\\b`, 'gi');
    let m;
    while ((m = re.exec(lower)) !== null) {
      matches.push({ index: m.index, dow, len: m[0].length });
    }
  }
  matches.sort((a, b) => a.index - b.index || b.len - a.len);
  const picked = [];
  const seenDow = new Set();
  let lastEnd = -1;
  for (const m of matches) {
    if (m.index < lastEnd) continue;
    if (seenDow.has(m.dow)) continue;
    seenDow.add(m.dow);
    picked.push(m);
    lastEnd = m.index + m.len;
  }

  const base = fromDate instanceof Date && !Number.isNaN(fromDate.getTime())
    ? new Date(fromDate)
    : new Date();
  base.setHours(0, 0, 0, 0);
  return picked
    .map(({ dow }) => {
      const d = new Date(base);
      const add = (dow - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + add);
      return toYmd(d);
    })
    .filter(Boolean)
    .sort();
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

  let dates = Array.isArray(overrides.dates)
    ? overrides.dates.map((d) => toYmd(d)).filter(Boolean)
    : [];
  if (!dates.length) {
    dates = parseWeekdayDatesFromMessage(message);
  }
  let date = resolveLearningDayDate(message, overrides);
  if (!date && dates.length) date = dates[0];
  if (!date && !hasExplicitDateHint(message)) {
    return learningDayDateClarification(message, { ...draftBase, subjectId, childIds });
  }
  if (!date) date = toYmd(new Date());
  if (!dates.length) dates = [date];
  // Keep a stable primary date for single-day callers / session helpers.
  date = dates[0];

  const subject = (roster.subjects || []).find((s) => String(s.id) === String(subjectId));
  const lessonTitle = overrides.lessonTitle || lessonTitleFromMessage(message, att.fileName);
  const title = overrides.title
    || (createLesson ? lessonTitle : `${subject?.name || 'Subject'} learning day`);

  let startTimeHm = overrides.startTimeHm || null;
  const timeMatchCreate = message.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  if (!startTimeHm && timeMatchCreate) {
    // Keep raw; execute/create path may normalize later — store HH:mm when possible.
    const raw = timeMatchCreate[1].trim();
    const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
    if (m) {
      let h = Number(m[1]);
      const mins = Number(m[2] || 0);
      const ap = String(m[3] || '').toLowerCase().replace(/\./g, '');
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      startTimeHm = `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    }
  }
  let durationMinutes = overrides.durationMinutes || null;
  const durationMatchCreate = message.match(/\b(\d{1,3})\s*(?:min(?:ute)?s?)\b/i);
  if (!durationMinutes && durationMatchCreate) durationMinutes = Number(durationMatchCreate[1]);
  const notesMatch = message.match(/\b(?:notes?|note)\s*(?:that|:)?\s+["']?(.+?)["']?\s*$/i);
  const description = overrides.description
    || (notesMatch ? notesMatch[1].trim() : null);

  const command = {
    type: DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE,
    householdId: ctx.householdId,
    subjectId,
    subjectName: subject?.name || subject?.title,
    childIds,
    date,
    dates,
    title,
    createLesson,
    lessonTitle,
    startTimeHm,
    durationMinutes,
    description,
    attachmentId: att.attachmentId || null,
    fileName: att.fileName || null,
    mime: att.mime || null,
    mimeLabel: att.mimeLabel || null,
    bytes: att.bytes || null,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.LEARNING_DAY_CREATE);
  const multi = dates.length > 1;
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: createLesson && att.attachmentId
      ? (multi ? `Create ${dates.length} learning days with lesson + material` : 'Create one-off learning event with lesson + material')
      : createLesson
        ? (multi ? `Create ${dates.length} learning days with new lesson` : 'Create one-off learning event with new lesson')
        : (multi ? `Create ${dates.length} learning days` : 'Create one-off learning event'),
    command,
    preview: handler.preview(command),
    confirmationLabel: att.attachmentId
      ? (multi ? 'Create & attach' : 'Create & attach')
      : (multi ? `Create ${dates.length} learning days` : 'Create learning day'),
    idempotencyKey: newIdempotencyKey('learningday'),
  });
}

export function isLearningDayCreateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (/\blesson\s*plan\b/.test(lower) && /\b(attach|link|add)\b/.test(lower)) return false;
  if (/\b(how (do|to|can)|what is|where (is|do|can)|explain)\b/.test(lower)) return false;
  return (
    (/\b(create|add|schedule|make)\b/.test(lower)
      && /\b(lesson|learning\s*days?)\b/.test(lower)
      && !/\blesson\s*plan\b/.test(lower))
    || /\bnew\s+lesson\b/.test(lower)
  );
}

export function isLearningDayDeleteIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(delete|remove)\b/.test(lower)) return false;
  if (/\bsubject\b/.test(lower) && !/\blearning\s*day\b/.test(lower)) return false;
  return /\blearning\s*day\b/.test(lower)
    || (/\blesson\b/.test(lower) && /\b(delete|remove)\b/.test(lower) && /\b(on|for|from)\b/.test(lower));
}

export function isLearningDayUpdateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (isLearningDayDeleteIntent(message)) return false;
  if (/\blearning\s*day\b/.test(lower)) {
    return /\b(update|edit|change|set|move|reschedule|attach|unlink|note|notes|duration|minutes?)\b/.test(lower)
      || /\bat\s+\d/.test(lower)
      || parseWeekdayNumsFromMessage(message).length > 0;
  }
  // “set History on July 8 to 45 minutes” / “add notes to Friday’s History”
  if (
    /\b(session\s*notes?|add\s+notes?|notes?\s+that)\b/.test(lower)
    || (/\b(\d{1,3})\s*min(?:ute)?s?\b/.test(lower) && /\b(set|change|update|make)\b/.test(lower))
  ) {
    return true;
  }
  return false;
}

async function fetchLearningDayEvents(familyId) {
  const { supabase } = await import('../../supabase.js');
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 60);
  const to = new Date(now);
  to.setDate(to.getDate() + 120);
  const { data, error } = await supabase
    .from('events')
    .select('id,title,start_ts,end_ts,event_type,status,child_id,child_ids,all_day,subject_id,description,material_id,curriculum_lesson_id,unit,lesson,minutes,counts_toward_plan,is_flexible')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .gte('start_ts', from.toISOString())
    .lte('start_ts', to.toISOString())
    .order('start_ts', { ascending: true })
    .limit(300);
  if (error) return { events: [], error };
  const events = (data || []).filter((ev) => {
    if (!ev?.id) return false;
    const status = String(ev.status || '').toLowerCase();
    if (status === 'canceled' || status === 'cancelled') return false;
    if (ev.subject_id || ev.counts_toward_plan === true) return true;
    const type = String(ev.event_type || '').toLowerCase();
    return ['lesson', 'classwork', 'learning day', 'learning_day'].includes(type);
  });
  return { events, error: null };
}

function eventLocalYmd(ev) {
  if (!ev?.start_ts) return null;
  const d = new Date(ev.start_ts);
  if (Number.isNaN(d.getTime())) return null;
  return toYmd(d);
}

function formatWhenShort(ev) {
  const ymd = eventLocalYmd(ev);
  if (!ymd) return '';
  try {
    return formatDisplayDate(ymd);
  } catch {
    return ymd;
  }
}

async function resolveLearningDayTarget(message, ctx, roster, overrides = {}) {
  if (overrides.eventId || overrides.itemId) {
    return {
      ok: true,
      event: {
        id: overrides.eventId || overrides.itemId,
        title: overrides.eventTitle || overrides.itemTitle || 'Learning day',
        start_ts: overrides.originalStartAt || null,
      },
    };
  }

  try {
    const { events, error } = await fetchLearningDayEvents(ctx.householdId);
    if (error) {
      return { ok: false, error: error.message || String(error) };
    }
    let pool = events;
    const mentioned = findSubjectMentionedInMessage(message, roster.subjects || []);
    if (mentioned.ok) {
      const sid = String(mentioned.subject.id);
      const bySubject = pool.filter((ev) => String(ev.subject_id || '') === sid
        || String(ev.title || '').toLowerCase().includes(String(mentioned.subject.name || '').toLowerCase()));
      if (bySubject.length) pool = bySubject;
    }
    const dateYmd = resolveFlexibleDay(message, new Date());
    if (dateYmd) {
      const onDay = pool.filter((ev) => eventLocalYmd(ev) === dateYmd);
      if (onDay.length) pool = onDay;
    }

    const { resolveEventFromUserMessage } = await import('../eventChatActions.js');
    const resolved = resolveEventFromUserMessage(message, pool, {
      children: roster.children,
      selectedChildIds: ctx.selectedChildIds,
    });
    if (resolved?.ok) return { ok: true, event: resolved.event };
    const candidates = resolved?.candidates?.length ? resolved.candidates : pool.slice(0, 8);
    return { ok: false, candidates, reason: resolved?.reason || 'no_match' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function prepareLearningDayDelete(message, ctx, roster, overrides = {}) {
  const resolved = await resolveLearningDayTarget(message, ctx, roster, overrides);
  if (resolved.error && !resolved.candidates) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not load learning days: ${resolved.error}`,
      recoverable: true,
    });
  }
  if (!resolved.ok) {
    const candidates = resolved.candidates || [];
    if (candidates.length) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which learning day should I delete?',
        options: candidates.slice(0, 8).map((ev) => ({
          id: String(ev.id),
          label: `${ev.title || 'Learning day'}${formatWhenShort(ev) ? ` · ${formatWhenShort(ev)}` : ''}`,
          value: String(ev.id),
          field: 'itemId',
        })),
      }), {
        intent: 'learning_day.delete',
        field: 'itemId',
        originalMessage: message,
        draft: { ...overrides },
      });
    }
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which learning day should I delete? Try “delete History learning day on July 8”.',
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.LEARNING_DAY_DELETE,
    householdId: ctx.householdId,
    eventId: String(resolved.event.id),
    eventTitle: resolved.event.title || 'Learning day',
    whenLabel: formatWhenShort(resolved.event),
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.LEARNING_DAY_DELETE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Delete learning day',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Delete learning day',
    idempotencyKey: newIdempotencyKey('learningday_del'),
  });
}

export async function prepareLearningDayUpdate(message, ctx, roster, overrides = {}) {
  const attachments = Array.isArray(overrides.attachments) ? overrides.attachments : [];
  const att = attachmentDraftFrom(overrides, attachments);
  const resolved = await resolveLearningDayTarget(message, ctx, roster, overrides);
  if (resolved.error && !resolved.candidates) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not load learning days: ${resolved.error}`,
      recoverable: true,
    });
  }
  if (!resolved.ok) {
    const candidates = resolved.candidates || [];
    if (candidates.length) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which learning day should I update?',
        options: candidates.slice(0, 8).map((ev) => ({
          id: String(ev.id),
          label: `${ev.title || 'Learning day'}${formatWhenShort(ev) ? ` · ${formatWhenShort(ev)}` : ''}`,
          value: String(ev.id),
          field: 'itemId',
        })),
      }), {
        intent: 'learning_day.update',
        field: 'itemId',
        originalMessage: message,
        draft: { ...overrides, ...att, attachments: undefined },
      });
    }
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which learning day? Try “change History learning day on July 8 to 45 minutes”.',
    });
  }

  const lower = String(message || '').toLowerCase();
  const patch = { ...(overrides.patch || {}) };

  // Target date for the session (move) — prefer explicit “to Friday” over “on Friday” identity.
  const toDateMatch = message.match(/\bto\s+(today|tomorrow|yesterday|next\s+\w+|\w+day|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
  if (!patch.date && toDateMatch) {
    const parsed = resolveFlexibleDay(toDateMatch[1], new Date());
    if (parsed) patch.date = parsed;
  }
  const timeMatch = message.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  if (!patch.startTimeHm && timeMatch) {
    try {
      const { maskedTimeToHm, hmToMaskedTime } = await import('../../subjectConfigureSchedule.js');
      patch.startTimeHm = maskedTimeToHm(timeMatch[1], '09:00');
      patch.startTimeLabel = hmToMaskedTime(patch.startTimeHm);
    } catch {
      patch.startTimeHm = timeMatch[1];
    }
  }
  const durationMatch = message.match(/\b(\d{1,3})\s*(?:min(?:ute)?s?)\b/i);
  if (patch.durationMinutes == null && durationMatch) {
    patch.durationMinutes = Number(durationMatch[1]);
  }

  const notesMatch = message.match(/\b(?:session\s*)?notes?\s*(?:that|:)?\s+["']?(.+?)["']?\s*$/i)
    || message.match(/\badd\s+notes?\s+["']?(.+?)["']?\s*$/i);
  if (patch.description === undefined && notesMatch) {
    patch.description = notesMatch[1].trim();
  }
  if (/\b(clear|remove)\s+(session\s*)?notes?\b/.test(lower)) {
    patch.description = '';
  }

  if (/\b(unlink|remove)\s+(the\s+)?lesson\b/.test(lower) || /\bclear\s+lesson\b/.test(lower)) {
    patch.unlinkLesson = true;
  }
  const lessonTitleMatch = message.match(/\b(?:lesson|title)\s*(?:to|as|:)\s+["']?([^"'\n]{2,120})["']?/i);
  if (!patch.unlinkLesson && lessonTitleMatch && !patch.lessonTitle) {
    patch.lessonTitle = lessonTitleMatch[1].trim();
  }
  const unitMatch = message.match(/\bunit\s*(?:to|as|:)\s+["']?([^"'\n]{2,120})["']?/i);
  if (unitMatch && !patch.unitTitle) patch.unitTitle = unitMatch[1].trim();

  if (/\b(remove|clear)\s+(the\s+)?(attachment|material)\b/.test(lower)) {
    patch.clearMaterial = true;
  }
  if (att.attachmentId) {
    patch.attachmentId = att.attachmentId;
    patch.fileName = att.fileName;
    patch.mime = att.mime;
    patch.bytes = att.bytes;
  }

  // Optional: link curriculum lesson by title when subject is known
  const linkLessonMatch = message.match(/\b(?:link|attach)\s+lesson\s+["']?([^"'\n]{2,120})["']?/i);
  if (linkLessonMatch && !patch.curriculumLessonId && !patch.unlinkLesson) {
    const lessonNeedle = linkLessonMatch[1].trim();
    patch.lessonTitle = patch.lessonTitle || lessonNeedle;
    try {
      const { supabase } = await import('../../supabase.js');
      const subjectId = resolved.event.subject_id
        || findSubjectMentionedInMessage(message, roster.subjects || []).subject?.id;
      if (subjectId) {
        const { data: units } = await supabase
          .from('curriculum_units')
          .select('id, title')
          .eq('subject_id', String(subjectId))
          .limit(50);
        const unitIds = (units || []).map((u) => u.id).filter(Boolean);
        if (unitIds.length) {
          const { data: lessons } = await supabase
            .from('curriculum_lessons')
            .select('id, title, unit_id')
            .in('unit_id', unitIds)
            .ilike('title', `%${lessonNeedle}%`)
            .limit(8);
          if (lessons?.length === 1) {
            patch.curriculumLessonId = String(lessons[0].id);
            patch.lessonTitle = lessons[0].title || lessonNeedle;
            const unit = (units || []).find((u) => String(u.id) === String(lessons[0].unit_id));
            if (unit?.title) patch.unitTitle = unit.title;
          } else if (lessons?.length > 1) {
            return withClarificationMeta(assertDoodleResponse({
              type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
              message: 'Which lesson should I link?',
              options: lessons.slice(0, 8).map((les) => ({
                id: String(les.id),
                label: les.title || 'Lesson',
                value: String(les.id),
                field: 'curriculumLessonId',
              })),
            }), {
              intent: 'learning_day.update',
              field: 'curriculumLessonId',
              originalMessage: message,
              draft: {
                ...overrides,
                eventId: String(resolved.event.id),
                eventTitle: resolved.event.title,
                patch,
              },
            });
          }
        }
      }
    } catch {
      // keep lessonTitle label-only update
    }
  }

  if (overrides.curriculumLessonId) {
    patch.curriculumLessonId = String(overrides.curriculumLessonId);
  }

  if (!Object.keys(patch).length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What should I change on this learning day? Examples: date/time, duration, session notes, lesson, or attachment.',
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.LEARNING_DAY_UPDATE,
    householdId: ctx.householdId,
    eventId: String(resolved.event.id),
    eventTitle: resolved.event.title || 'Learning day',
    patch,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.LEARNING_DAY_UPDATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Update learning day',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Save learning day',
    idempotencyKey: newIdempotencyKey('learningday_upd'),
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
  } else if (field === 'ageOrGrade') {
    const raw = String(value || '').trim();
    const age = parseChildAgeFromMessage(raw) || (/^\d{1,2}$/.test(raw) ? Number(raw) : null);
    const grade = parseChildGradeFromMessage(raw)
      || (/^(pre-?k|k(?:indergarten)?|\d{1,2})$/i.test(raw)
        ? (/^k/i.test(raw) ? 'K' : /^pre/i.test(raw) ? 'Pre-K' : raw)
        : null);
    if (age != null) draft.age = age;
    if (grade) draft.gradeLabel = grade;
  } else if (field === 'confirmName') {
    draft.confirmName = String(value || '').trim();
  } else if (field === 'email') {
    draft.email = parseChildEmailFromMessage(String(value || '')) || String(value || '').trim();
  } else if (field === 'syllabusMaterialId') {
    draft.syllabusMaterialId = String(option?.value || value || '').trim();
    draft.syllabusTitle = option?.label || draft.syllabusTitle;
  } else if (field === 'providerUrl') {
    draft.providerUrl = String(value || '').trim();
  } else if (field === 'itemId') {
    draft.itemId = String(option?.value || value);
    draft.eventId = draft.itemId;
    draft.itemTitle = option?.label || draft.itemTitle;
    draft.eventTitle = draft.itemTitle;
  } else if (field === 'curriculumLessonId') {
    draft.curriculumLessonId = String(option?.value || value);
    draft.patch = { ...(draft.patch || {}), curriculumLessonId: draft.curriculumLessonId };
  } else if (field === 'exclusionId') {
    draft.exclusionId = String(option?.value || value);
    draft.title = option?.label || draft.title;
  } else if (field === 'eventHandling') {
    const raw = String(option?.value || value || '').trim().toLowerCase();
    if (raw === 'move' || raw === 'leave' || raw === 'delete') {
      draft.eventHandling = raw;
    } else {
      return null;
    }
  } else if (field === 'termKey') {
    const raw = String(option?.value || value || '').trim().toLowerCase();
    if (['fall', 'spring', 'summer'].includes(raw)) {
      draft.termKey = raw;
      draft.termLabel = raw.charAt(0).toUpperCase() + raw.slice(1);
    } else {
      return bulkAttendanceTermClarification(pendingClarification.originalMessage, draft);
    }
  } else if (field === 'lastTermKey') {
    const raw = String(option?.value || value || '').trim().toLowerCase();
    if (['fall', 'spring', 'summer'].includes(raw)) {
      draft.lastTermKey = raw;
    } else {
      return null;
    }
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
    case 'day_off.update':
      return prepareDayOffUpdate(pendingClarification.originalMessage, ctx, draft);
    case 'day_off.delete':
      return prepareDayOffDelete(pendingClarification.originalMessage, ctx, draft);
    case 'material.create_link':
      return prepareMaterialCreateLink(pendingClarification.originalMessage, ctx, roster, draft);
    case 'subject.create':
      return prepareSubjectCreate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'subject.update':
      return prepareSubjectUpdate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'subject.delete':
      return prepareSubjectDelete(pendingClarification.originalMessage, ctx, roster, draft);
    case 'child.create':
      return prepareChildCreate(pendingClarification.originalMessage, ctx, draft);
    case 'child.update':
      return prepareChildUpdate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'child.delete':
      return prepareChildDelete(pendingClarification.originalMessage, ctx, roster, draft);
    case 'child.invite':
      return prepareChildInvite(pendingClarification.originalMessage, ctx, roster, draft);
    case 'learning_day.create':
      return prepareLearningDayCreate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'learning_day.update':
      return prepareLearningDayUpdate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'learning_day.delete':
      return prepareLearningDayDelete(pendingClarification.originalMessage, ctx, roster, draft);
    case 'event.update':
      return prepareEventUpdate(pendingClarification.originalMessage, ctx, roster, draft);
    case 'event.delete':
      return prepareEventDelete(pendingClarification.originalMessage, ctx, roster, draft);
    case 'planner.item.move':
      return preparePlannerItemMove(pendingClarification.originalMessage, ctx, roster, draft);
    case 'planner.item.complete':
      return preparePlannerItemComplete(pendingClarification.originalMessage, ctx, roster, draft);
    case 'school_year.update':
      return prepareSchoolYearUpdate(pendingClarification.originalMessage, ctx, draft);
    case 'bulletin.post.create':
    case 'bulletin.post.update':
    case 'bulletin.post.delete':
      return continueBulletinClarification(pendingClarification, message, option, ctx, roster);
    default:
      return null;
  }
}

function parseClockHmFromMessage(message) {
  const range = String(message || '').match(
    /\bfrom\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i,
  );
  if (range) return { startRaw: range[1], endRaw: range[2] };
  const at = String(message || '').match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  if (at) return { startRaw: at[1], endRaw: null };
  return { startRaw: null, endRaw: null };
}

function parseLocationFromMessage(message) {
  const lower = String(message || '').toLowerCase();
  const loc = message.match(/\blocation\s*(?:to|as|:)?\s+["']?([^"'\n]+?)["']?\s*$/i)
    || message.match(/\b(?:at|@)\s+the\s+([A-Za-z][^,.\n]{1,80})/i);
  if (!loc) return null;
  // Avoid treating “at 3pm” as a location
  if (/^\d/.test(String(loc[1]).trim())) return null;
  if (/\b(am|pm)\b/i.test(loc[1]) && loc[1].trim().length < 12) return null;
  void lower;
  return String(loc[1]).trim().replace(/[.?!]+$/, '');
}

function parseNotesFromMessage(message) {
  const m = message.match(/\b(?:additional\s*)?notes?\s*(?:that|:)?\s+["']?(.+?)["']?\s*$/i)
    || message.match(/\bwith\s+notes?\s+["']?(.+?)["']?\s*$/i);
  return m ? m[1].trim() : null;
}

export function isEventDeleteIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(delete|remove|cancel)\b/.test(lower)) return false;
  if (/\blearning\s*day\b/.test(lower)) return false;
  if (/\bsubject\b/.test(lower)) return false;
  return /\b(event|appointment|field\s*trip|calendar)\b/.test(lower)
    || (/\b(delete|remove)\b/.test(lower) && /\b(from\s+(the\s+)?calendar|from\s+planner)\b/.test(lower));
}

export function isEventUpdateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (isEventDeleteIntent(message) || isLearningDayUpdateIntent(message) || isLearningDayDeleteIntent(message)) {
    return false;
  }
  if (/\blearning\s*day\b/.test(lower) || /\bsubject\b/.test(lower)) return false;
  if (/\b(rename|retitle)\b/.test(lower) && /\b(event|appointment|field\s*trip)\b/.test(lower)) return true;
  if (
    /\b(update|edit|change|set)\b/.test(lower)
    && /\b(event|appointment|field\s*trip|location|notes?)\b/.test(lower)
  ) {
    return true;
  }
  if (/\blocation\s+(to|as|:)\b/.test(lower)) return true;
  if (/\b(repeat|every\s+week|weekly)\b/.test(lower) && /\b(event|appointment|field\s*trip)\b/.test(lower)) {
    return true;
  }
  return false;
}

async function fetchCalendarEventCandidates(familyId) {
  const { supabase } = await import('../../supabase.js');
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 60);
  const to = new Date(now);
  to.setDate(to.getDate() + 180);
  const { data, error } = await supabase
    .from('events')
    .select('id,title,start_ts,end_ts,event_type,status,child_id,child_ids,all_day,subject_id,location,description,material_id,materials_attachment_ids,recurrence_rule,is_flexible,counts_toward_plan')
    .eq('family_id', familyId)
    .is('deleted_at', null)
    .gte('start_ts', from.toISOString())
    .lte('start_ts', to.toISOString())
    .order('start_ts', { ascending: true })
    .limit(300);
  if (error) return { events: [], error };
  const events = (data || []).filter((ev) => {
    if (!ev?.id) return false;
    const status = String(ev.status || '').toLowerCase();
    if (status === 'canceled' || status === 'cancelled') return false;
    const type = String(ev.event_type || '').toLowerCase();
    if (['lesson', 'classwork', 'assignment', 'learning day', 'learning_day'].includes(type)) return false;
    if (ev.subject_id && ev.counts_toward_plan === true) return false;
    return true;
  });
  return { events, error: null };
}

async function resolveCalendarEventTarget(message, ctx, roster, overrides = {}) {
  if (overrides.eventId || overrides.itemId) {
    return {
      ok: true,
      event: {
        id: overrides.eventId || overrides.itemId,
        title: overrides.eventTitle || overrides.itemTitle || 'Event',
        start_ts: overrides.originalStartAt || null,
      },
    };
  }
  try {
    const { events, error } = await fetchCalendarEventCandidates(ctx.householdId);
    if (error) return { ok: false, error: error.message || String(error) };
    const dateYmd = resolveFlexibleDay(message, new Date());
    let pool = events;
    if (dateYmd) {
      const onDay = pool.filter((ev) => eventLocalYmd(ev) === dateYmd);
      if (onDay.length) pool = onDay;
    }
    const { resolveEventFromUserMessage } = await import('../eventChatActions.js');
    const resolved = resolveEventFromUserMessage(message, pool, {
      children: roster.children,
      selectedChildIds: ctx.selectedChildIds,
    });
    if (resolved?.ok) return { ok: true, event: resolved.event };
    return {
      ok: false,
      candidates: resolved?.candidates?.length ? resolved.candidates : pool.slice(0, 8),
      reason: resolved?.reason || 'no_match',
    };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function prepareEventDelete(message, ctx, roster, overrides = {}) {
  const resolved = await resolveCalendarEventTarget(message, ctx, roster, overrides);
  if (resolved.error && !resolved.candidates) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not load events: ${resolved.error}`,
      recoverable: true,
    });
  }
  if (!resolved.ok) {
    const candidates = resolved.candidates || [];
    if (candidates.length) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which calendar event should I delete?',
        options: candidates.slice(0, 8).map((ev) => ({
          id: String(ev.id),
          label: `${ev.title || 'Event'}${formatWhenShort(ev) ? ` · ${formatWhenShort(ev)}` : ''}`,
          value: String(ev.id),
          field: 'itemId',
        })),
      }), {
        intent: 'event.delete',
        field: 'itemId',
        originalMessage: message,
        draft: { ...overrides },
      });
    }
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which event should I delete? Try “delete field trip event” or “remove Dentist from the calendar”.',
    });
  }

  const command = {
    type: DOODLE_COMMAND_TYPES.EVENT_DELETE,
    householdId: ctx.householdId,
    eventId: String(resolved.event.id),
    eventTitle: resolved.event.title || 'Event',
    whenLabel: formatWhenShort(resolved.event),
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.EVENT_DELETE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Delete calendar event',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Delete event',
    idempotencyKey: newIdempotencyKey('event_del'),
  });
}

export async function prepareEventUpdate(message, ctx, roster, overrides = {}) {
  const attachments = Array.isArray(overrides.attachments) ? overrides.attachments : [];
  const att = attachmentDraftFrom(overrides, attachments);
  const resolved = await resolveCalendarEventTarget(message, ctx, roster, overrides);
  if (resolved.error && !resolved.candidates) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not load events: ${resolved.error}`,
      recoverable: true,
    });
  }
  if (!resolved.ok) {
    const candidates = resolved.candidates || [];
    if (candidates.length) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which calendar event should I update?',
        options: candidates.slice(0, 8).map((ev) => ({
          id: String(ev.id),
          label: `${ev.title || 'Event'}${formatWhenShort(ev) ? ` · ${formatWhenShort(ev)}` : ''}`,
          value: String(ev.id),
          field: 'itemId',
        })),
      }), {
        intent: 'event.update',
        field: 'itemId',
        originalMessage: message,
        draft: { ...overrides, ...att, attachments: undefined },
      });
    }
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which event? Try “update field trip location to Museum” or “rename Dentist event to Checkup”.',
    });
  }

  let row = resolved.event;
  try {
    const { fetchCalendarEventForEdit, calendarEventFormFromEvent } = await import('../../create/calendarEventEditHelpers.js');
    const { buildEventRecurrenceRule, buildWeeklyRecurrenceRule } = await import('../../create/saveEventHelpers.js');
    const { maskedTimeToHm, hmToMaskedTime } = await import('../../subjectConfigureSchedule.js');

    const full = await fetchCalendarEventForEdit(resolved.event.id);
    if (full) row = full;
    const hydrated = calendarEventFormFromEvent(row);
    const lower = String(message || '').toLowerCase();

    let title = hydrated.title;
    const rename = message.match(/\brename\s+(?:(?:the|this)\s+)?(?:event\s+)?(?:to\s+)?["']?([^"'\n]{2,120})["']?/i)
      || message.match(/\b(?:change|set)\s+(?:the\s+)?title\s+(?:to|as)\s+["']?([^"'\n]{2,120})["']?/i)
      || message.match(/\btitled?\s+["']([^"']{2,120})["']/i);
    if (rename) title = rename[1].trim().replace(/[.?!]+$/, '');

    let date = hydrated.startDate;
    const toDateMatch = message.match(/\bto\s+(today|tomorrow|yesterday|next\s+\w+|\w+day|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
    if (toDateMatch) {
      const ymd = resolveFlexibleDay(toDateMatch[1], new Date());
      if (ymd) date = new Date(`${ymd}T12:00:00`);
    }

    let endDate = hydrated.endDate;
    const untilMatch = message.match(/\buntil\s+(today|tomorrow|\w+day|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
    if (untilMatch) {
      const ymd = resolveFlexibleDay(untilMatch[1], date || new Date());
      if (ymd) endDate = new Date(`${ymd}T12:00:00`);
    }

    let startTimeHm = hydrated.startTime ? maskedTimeToHm(hydrated.startTime, '') : '';
    let endTimeHm = hydrated.endTime ? maskedTimeToHm(hydrated.endTime, '') : '';
    const clocks = parseClockHmFromMessage(message);
    if (clocks.startRaw) startTimeHm = maskedTimeToHm(clocks.startRaw, startTimeHm || '09:00');
    if (clocks.endRaw) endTimeHm = maskedTimeToHm(clocks.endRaw, endTimeHm || '10:00');

    let location = hydrated.location;
    const nextLoc = parseLocationFromMessage(message);
    if (nextLoc) location = nextLoc;
    if (/\b(clear|remove)\s+location\b/.test(lower)) location = '';

    let notes = hydrated.notes;
    const nextNotes = parseNotesFromMessage(message);
    if (nextNotes) notes = nextNotes;
    if (/\b(clear|remove)\s+(additional\s*)?notes?\b/.test(lower)) notes = '';

    let childIds = hydrated.assigneeIds.map(String);
    const forMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
    if (forMatch) {
      const resolvedChild = resolveChildByName(forMatch[1], roster.children);
      if (resolvedChild.clarification) {
        return withClarificationMeta(assertDoodleResponse(resolvedChild.clarification), {
          intent: 'event.update',
          field: 'childId',
          originalMessage: message,
          draft: { eventId: String(row.id), eventTitle: title, ...overrides },
        });
      }
      if (resolvedChild.ok) {
        const id = String(resolvedChild.child.id);
        childIds = /\b(add|also|too)\b/.test(lower) ? [...new Set([...childIds, id])] : [id];
      }
    }

    let recurrenceRule = null;
    let recurrenceLabel = hydrated.isRepeating ? 'Repeats' : 'Just once';
    if (/\b(just\s+once|does\s+not\s+repeat|stop\s+repeating|no\s+repeat)\b/.test(lower)) {
      recurrenceRule = null;
      recurrenceLabel = 'Just once';
    } else if (/\b(repeat|every\s+week|weekly|every\s+day|daily)\b/.test(lower)) {
      if (/\bdaily|every\s+day\b/.test(lower)) {
        recurrenceRule = buildEventRecurrenceRule({
          recurrenceType: 'daily',
          recurrenceEndType: 'never',
          startDate: date,
        });
        recurrenceLabel = 'Daily';
      } else {
        const days = parseWeekdayNumsFromMessage(message);
        recurrenceRule = days.length
          ? buildEventRecurrenceRule({
            recurrenceType: 'weekly',
            recurrenceWeekdays: days,
            recurrenceEndType: 'never',
            startDate: date,
          })
          : buildWeeklyRecurrenceRule(date instanceof Date ? date : new Date());
        recurrenceLabel = days.length
          ? `Weekly (${days.map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')})`
          : 'Weekly';
      }
    } else if (hydrated.isRepeating) {
      recurrenceRule = buildEventRecurrenceRule({
        recurrenceType: hydrated.recurrenceType,
        recurrenceWeekdays: hydrated.recurrenceWeekdays,
        recurrenceEndType: hydrated.recurrenceEndType,
        recurrenceEndAfter: hydrated.recurrenceEndAfterText,
        recurrenceEndDate: hydrated.recurrenceEndDate,
        startDate: date,
      });
    }

    const materialIds = hydrated.materialId ? [String(hydrated.materialId)] : [];
    const form = {
      title,
      childIds,
      childNames: childIds
        .map((id) => {
          const c = (roster.children || []).find((row) => String(row.id) === String(id));
          return c?.first_name || c?.name || null;
        })
        .filter(Boolean)
        .join(', '),
      date,
      dateLabel: formatDisplayDate(toYmd(date)),
      endDate,
      endDateLabel: endDate ? formatDisplayDate(toYmd(endDate)) : null,
      startTimeHm: startTimeHm || '',
      endTimeHm: endTimeHm || '',
      startTimeLabel: startTimeHm ? hmToMaskedTime(startTimeHm) : '',
      endTimeLabel: endTimeHm ? hmToMaskedTime(endTimeHm) : '',
      location,
      notes,
      materialIds,
      recurrenceRule,
      recurrenceLabel,
      clearMaterial: /\b(remove|clear)\s+(the\s+)?(attachment|material)\b/.test(lower),
      attachmentId: att.attachmentId || null,
      fileName: att.fileName || null,
      mime: att.mime || null,
      bytes: att.bytes || null,
    };

    const command = {
      type: DOODLE_COMMAND_TYPES.EVENT_UPDATE,
      householdId: ctx.householdId,
      eventId: String(row.id),
      eventTitle: title || row.title || 'Event',
      editScope: /\b(series|all\s+occurrences|every\s+occurrence)\b/.test(lower) ? 'series' : 'single',
      form,
    };
    const handler = getCommand(DOODLE_COMMAND_TYPES.EVENT_UPDATE);
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
      message: 'Update calendar event',
      command,
      preview: handler.preview(command),
      confirmationLabel: 'Save changes',
      idempotencyKey: newIdempotencyKey('event_upd'),
    });
  } catch (err) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not prepare event update: ${err?.message || String(err)}`,
      recoverable: true,
    });
  }
}

void formatDisplayDate; // reserved for richer previews

