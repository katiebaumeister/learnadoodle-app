import { searchLocalAppGuide } from '../../appGuide/localGuideSearch.js';
import { DOODLE_COMMAND_TYPES, DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import './registerAll.js';
import { getCommand } from './registry.js';
import { trackDoodleEvent } from './analytics.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import {
  continueIntentClarification,
  prepareAttendanceMark,
  prepareChildCreate,
  prepareDayOffCreate,
  prepareLearningDayCreate,
  prepareMaterialCreateLink,
  prepareMaterialCreateFile,
  preparePlannerItemComplete,
  preparePlannerItemMove,
  prepareSchoolYearUpdate,
  prepareSubjectCreate,
} from './intentPreparers.js';

export { resolveChildByName, resolveSubjectByName } from './entityResolve.js';

function newIdempotencyKey(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Strip markdown headings / emphasis noise from guide chunks for chat display. */
export function cleanGuideText(raw) {
  return String(raw || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseDateHint(message, ctx) {
  const lower = message.toLowerCase();
  const now = ctx.visibleDateStart ? new Date(ctx.visibleDateStart) : new Date();
  if (Number.isNaN(now.getTime())) now.setTime(Date.now());

  if (/\btoday\b/.test(lower)) return now;
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (/\bfriday\b/.test(lower)) {
    const d = new Date(now);
    const day = d.getDay();
    const delta = (5 - day + 7) % 7 || 7;
    d.setDate(d.getDate() + delta);
    return d;
  }
  const iso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) {
    const d = new Date(`${iso[1]}T12:00:00`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return now;
}

function extractQuotedTitle(message) {
  const m = message.match(/[“"]([^”"]+)[”"]/) || message.match(/'([^']+)'/);
  return m?.[1]?.trim() || null;
}

function extractTitleAfterCalled(message) {
  const m = message.match(/\b(?:called|titled|named)\s+(.+)$/i);
  if (!m) return null;
  let title = m[1].trim();
  // Drop trailing "for <Name>" learner clause from the title
  title = title.replace(/\s+for\s+[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?$/i, '').trim();
  title = title.replace(/[.?!].*$/, '').trim();
  return title || null;
}

function stripLearnerFromTitle(title, children = []) {
  let next = String(title || '').trim();
  for (const child of children || []) {
    const name = String(child.first_name || child.name || '').trim();
    if (!name) continue;
    const re = new RegExp(`\\s+for\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    next = next.replace(re, '').trim();
  }
  return next;
}

const CURATED_HOW_TOS = [
  {
    test: /\battend(ance|ed)?\b/i,
    message: [
      'Here’s how to mark attendance in Learnadoodle:',
      '',
      '1. Household / day attendance',
      '• Open Planner in the left sidebar',
      '• Switch the top view to Year',
      '• In the top-left controls, switch to Attendance check',
      '• Mark days or instructional events for each learner',
      '',
      '2. Subject-based attendance',
      '• Open Learning in the left sidebar',
      '• Open the subject',
      '• Go to the Attendance tab and mark from there',
      '',
      'Tip: attendance records what actually happened; editing a single planner event only changes that dated item, not the subject’s recurring schedule.',
    ].join('\n'),
    links: [
      { label: 'Open Planner (Year)', href: '/planner?view=year' },
      { label: 'Open Learning', href: '/learning' },
    ],
  },
  {
    test: /\b(assignment|classwork)\b/i,
    message: [
      'To create an assignment manually:',
      '• Open Planner → Create → Assignment, or',
      '• Open Learning → open a subject → Classwork / Assign',
      '',
      'Or tell me: “Create an assignment called Read Chapter 4 for Lilly in History.” I’ll show a preview to confirm before saving.',
    ].join('\n'),
    links: [
      { label: 'Open Planner', href: '/planner' },
      { label: 'Open Learning', href: '/learning' },
    ],
  },
  {
    test: /\b(event|calendar|schedule something)\b/i,
    message: [
      'To add a calendar event:',
      '• Open Planner → Create → Event',
      '• Or ask me: “Create an event tomorrow called Field trip for Lilly”',
      '',
      'I’ll show a confirmable preview before anything is saved.',
    ].join('\n'),
    links: [{ label: 'Open Planner', href: '/planner' }],
  },
];

function howToAnswer(message) {
  for (const entry of CURATED_HOW_TOS) {
    if (entry.test.test(message)) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ANSWER,
        message: entry.message,
        links: entry.links || [],
      });
    }
  }

  const hits = searchLocalAppGuide(message, { limit: 3 }) || [];
  if (Array.isArray(hits) && hits.length > 0) {
    const top = hits[0];
    const cleaned = cleanGuideText(top.content || top.text || top.chunk || String(top));
    // Prefer a short, actionable slice — first 2 non-empty paragraphs
    const paragraphs = cleaned.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    const messageText = paragraphs.slice(0, 2).join('\n\n');
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: messageText || cleaned,
      links: [],
    });
  }
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message:
      'I can help you find records, explain exact steps in Learnadoodle, and draft creates/edits for confirmation. Try “how do I mark attendance?” or “create an assignment called Read Chapter 4 for Lilly in History.”',
  });
}

function navigateAnswer(message) {
  const lower = message.toLowerCase();
  const map = [
    { test: /planner|calendar/, href: '/planner', label: 'Open Planner' },
    { test: /learning|subject/, href: '/learning', label: 'Open Learning' },
    { test: /material/, href: '/subjects?tab=materials', label: 'Open Materials' },
    { test: /setting|school year/, href: '/settings', label: 'Open Settings' },
    { test: /message/, href: '/', label: 'Open Messages' },
    { test: /home/, href: '/', label: 'Open Home' },
  ];
  const hit = map.find((m) => m.test.test(lower));
  if (!hit) return null;
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.NAVIGATION,
    message: `Open ${hit.label.replace(/^Open /, '')} from here:`,
    destination: { label: hit.label, href: hit.href },
  });
}

function withClarificationMeta(response, meta) {
  if (response.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return {
    ...response,
    clarification: {
      ...(response.clarification || {}),
      ...meta,
    },
  };
}

function prepareEventCreate(message, ctx, roster, overrides = {}) {
  let title =
    overrides.title ||
    extractQuotedTitle(message) ||
    extractTitleAfterCalled(message);

  if (title) title = stripLearnerFromTitle(title, roster.children);

  if (!title || title.length < 2) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What should I call this event?',
      options: [],
    }), {
      intent: 'event.create',
      field: 'title',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  let childIds = overrides.childIds || ctx.selectedChildIds || [];
  const nameMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if ((!childIds || !childIds.length) && nameMatch) {
    const resolved = resolveChildByName(nameMatch[1], roster.children);
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'event.create',
        field: 'childId',
        originalMessage: message,
        draft: { title, ...overrides },
      });
    }
    if (resolved.ok) childIds = [String(resolved.child.id)];
  }

  if (!childIds.length && roster.children?.length === 1) {
    childIds = [String(roster.children[0].id)];
  }
  if (!childIds.length && (roster.children?.length || 0) > 1) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student should this event be for?',
      options: roster.children.map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'event.create',
      field: 'childId',
      originalMessage: message,
      draft: { title, ...overrides },
    });
  }

  const start = overrides.startAt ? new Date(overrides.startAt) : parseDateHint(message, ctx);
  /** @type {import('./types.js').DoodleCommand} */
  const command = {
    type: DOODLE_COMMAND_TYPES.EVENT_CREATE,
    householdId: ctx.householdId,
    title: title.replace(/^(an?\s+|the\s+)/i, '').trim(),
    startAt: start.toISOString(),
    childIds,
  };

  const handler = getCommand(DOODLE_COMMAND_TYPES.EVENT_CREATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Create event',
    command,
    preview: handler.preview(command, ctx),
    warnings: childIds.length ? undefined : ['No learner selected — event may be household-wide.'],
    confirmationLabel: 'Create event',
    idempotencyKey: newIdempotencyKey('event'),
  });
}

function prepareAssignmentCreate(message, ctx, roster, overrides = {}) {
  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('assignments')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Assignments are not enabled for this household.',
      recoverable: false,
    });
  }

  let title =
    overrides.title ||
    extractQuotedTitle(message) ||
    extractTitleAfterCalled(message);

  if (title) title = stripLearnerFromTitle(title, roster.children);

  if (!title || title.length < 2) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What should the assignment be titled?',
    }), {
      intent: 'assignment.create',
      field: 'title',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  let subjectId = overrides.subjectId || ctx.selectedSubjectId || null;
  // Prefer "in History" for subject; avoid treating "for Lilly" as a subject
  const inSubjectMatch = message.match(/\bin\s+([A-Za-z][A-Za-z0-9 &/-]*)/i);
  if (!subjectId && inSubjectMatch) {
    const resolved = resolveSubjectByName(inSubjectMatch[1].trim(), roster.subjects);
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'assignment.create',
        field: 'subjectId',
        originalMessage: message,
        draft: { title, childIds: overrides.childIds, ...overrides },
      });
    }
    if (resolved.ok) subjectId = String(resolved.subject.id);
  }
  if (!subjectId) {
    const named = message.match(/\b(history|math|science|reading|english|writing)\b/i);
    if (named) {
      const resolved = resolveSubjectByName(named[1], roster.subjects);
      if (resolved.ok) subjectId = String(resolved.subject.id);
    }
  }
  if (!subjectId) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject should this assignment belong to?',
      options: (roster.subjects || []).slice(0, 10).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'assignment.create',
      field: 'subjectId',
      originalMessage: message,
      draft: { title, childIds: overrides.childIds, ...overrides },
    });
  }

  let childIds = overrides.childIds || ctx.selectedChildIds || [];
  const nameMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if ((!childIds || !childIds.length) && nameMatch) {
    const resolved = resolveChildByName(nameMatch[1], roster.children);
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'assignment.create',
        field: 'childId',
        originalMessage: message,
        draft: { title, subjectId, ...overrides },
      });
    }
    if (resolved.ok) childIds = [String(resolved.child.id)];
  }
  if (!childIds.length && roster.children?.length === 1) {
    childIds = [String(roster.children[0].id)];
  }
  if (!childIds.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student should this assignment be for?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'assignment.create',
      field: 'childId',
      originalMessage: message,
      draft: { title, subjectId, ...overrides },
    });
  }

  const due = overrides.dueAt ? new Date(overrides.dueAt) : parseDateHint(message, ctx);
  const subject = (roster.subjects || []).find((s) => String(s.id) === String(subjectId));
  const child = (roster.children || []).find((c) => String(c.id) === String(childIds[0]));

  /** @type {import('./types.js').DoodleCommand} */
  const command = {
    type: DOODLE_COMMAND_TYPES.ASSIGNMENT_CREATE,
    householdId: ctx.householdId,
    schoolYearId: ctx.schoolYearId,
    subjectId,
    childIds,
    title: title.replace(/^(an?\s+|the\s+)/i, '').trim(),
    dueAt: due.toISOString(),
  };

  const handler = getCommand(DOODLE_COMMAND_TYPES.ASSIGNMENT_CREATE);
  const preview = handler.preview(command, ctx).map((field) => {
    if (field.fieldPath === 'subjectId' && subject) {
      return { ...field, value: subject.name || subject.title || field.value };
    }
    if (field.fieldPath === 'childIds' && child) {
      return { ...field, value: child.first_name || child.name || field.value };
    }
    return field;
  });

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Create assignment',
    command,
    preview,
    confirmationLabel: 'Create assignment',
    idempotencyKey: newIdempotencyKey('assignment'),
  });
}

function findRosterAnswer(message, roster) {
  const lower = message.toLowerCase();
  if (/\b(find|show|list|where)\b/.test(lower) && /\bsubjects?\b/.test(lower)) {
    const items = (roster.subjects || []).slice(0, 12);
    if (!items.length) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ANSWER,
        message: 'No subjects found for this household yet.',
      });
    }
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: `Here are subjects I can see:\n${items.map((s) => `• ${s.name || s.title}`).join('\n')}`,
      links: items.map((s) => ({
        label: s.name || s.title || 'Subject',
        href: `/learning?subject=${s.id}`,
        entityType: 'subject',
        entityId: String(s.id),
      })),
    });
  }
  if (/\b(find|show|list)\b/.test(lower) && /\b(child|children|learner|student)s?\b/.test(lower)) {
    const items = roster.children || [];
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: items.length
        ? `Learners:\n${items.map((c) => `• ${c.first_name || c.name}`).join('\n')}`
        : 'No learners found.',
      links: items.map((c) => ({
        label: c.first_name || c.name || 'Learner',
        href: `/?child=${c.id}`,
        entityType: 'child',
        entityId: String(c.id),
      })),
    });
  }
  return null;
}

/**
 * Continue a clarification turn using the saved draft + user reply / option.
 */
function continueFromClarification(pendingClarification, message, option, ctx, roster) {
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
  }

  if (pendingClarification.intent === 'assignment.create') {
    return prepareAssignmentCreate(pendingClarification.originalMessage, ctx, roster, draft);
  }
  if (pendingClarification.intent === 'event.create') {
    return prepareEventCreate(pendingClarification.originalMessage, ctx, roster, draft);
  }

  return continueIntentClarification(pendingClarification, message, option, ctx, roster);
}

function trackPreview(response) {
  if (response?.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    trackDoodleEvent('doodle_action_previewed', { commandType: response.command?.type });
  }
  return response;
}

/**
 * Client-side /respond equivalent.
 * Mutations never execute here — only action_preview / clarification / answer / navigation.
 *
 * @param {{
 *   message: string,
 *   context: import('./types.js').DoodleContext,
 *   roster?: { children?: any[], subjects?: any[] },
 *   conversationId?: string,
 *   pendingClarification?: object,
 *   clarificationOption?: object,
 *   attachments?: Array<{ attachmentId: string, fileName?: string, mime?: string, mimeLabel?: string, bytes?: number, previewUrl?: string }>,
 * }} input
 */
export async function doodleRespond(input) {
  const message = String(input?.message || '').trim();
  const ctx = input?.context;
  const roster = input?.roster || { children: [], subjects: [] };
  const pendingClarification = input?.pendingClarification || null;
  const clarificationOption = input?.clarificationOption || null;
  const attachments = Array.isArray(input?.attachments) ? input.attachments : [];

  trackDoodleEvent('doodle_message_submitted', {
    area: ctx?.currentArea,
    role: ctx?.userRole,
  });

  if (!message && !attachments.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Type a request to continue.',
      recoverable: true,
    });
  }
  if (!ctx?.householdId || !ctx?.userId) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Missing household context. Refresh and try again.',
      recoverable: true,
    });
  }

  // Resume draft when clarifying (e.g. user taps History or types "History")
  if (pendingClarification?.intent) {
    const continued = continueFromClarification(
      pendingClarification,
      message || attachments[0]?.fileName || 'ok',
      clarificationOption,
      ctx,
      roster,
    );
    if (continued) return trackPreview(continued);
  }

  const lower = (message || '').toLowerCase();
  const isHowTo = /\b(how (do|to|can)|what is|where (is|do|can)|explain)\b/.test(lower);

  // Attached files → confirmable Materials upload (unless asking how-to)
  if (attachments.length && !isHowTo) {
    return trackPreview(prepareMaterialCreateFile(
      message || `Add ${attachments[0].fileName || 'file'} to Materials`,
      ctx,
      roster,
      attachments,
    ));
  }

  if (isHowTo) {
    return howToAnswer(message);
  }

  const nav = navigateAnswer(message);
  if (/\b(open|go to|take me|navigate)\b/.test(lower) && nav) return nav;

  const find = findRosterAnswer(message, roster);
  if (find) return find;

  // Mark attendance (action) — not “how do I mark attendance”
  if (
    /\b(mark|logged|log)\b/.test(lower)
    && /\b(attend|attendance|present|absent|partial)\b/.test(lower)
  ) {
    return trackPreview(prepareAttendanceMark(message, ctx, roster));
  }

  // Mark planner item / assignment done
  if (
    (/\b(mark|set|check)\b/.test(lower) && /\b(done|complete|completed|finished)\b/.test(lower))
    || (/\b(complete|finish)\b/.test(lower) && /\b(assignment|event|lesson|item|homework|classwork)\b/.test(lower))
  ) {
    return trackPreview(await preparePlannerItemComplete(message, ctx, roster));
  }

  if (/\b(move|reschedule|shift)\b/.test(lower) && /\b(event|lesson|item|appointment|to\s+(today|tomorrow))\b/.test(lower)) {
    return trackPreview(await preparePlannerItemMove(message, ctx, roster));
  }
  if (/\bmove\b/.test(lower) && /\bto\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday)\b/.test(lower)) {
    return trackPreview(await preparePlannerItemMove(message, ctx, roster));
  }

  if (
    /\b(set|update|change|edit)\b/.test(lower)
    && /\b(school\s*year|learning\s*hours|hours?\s*per\s*day|target\s*days|learning\s*days|weekdays?)\b/.test(lower)
  ) {
    return trackPreview(prepareSchoolYearUpdate(message, ctx));
  }

  if (/\b(day\s*off|holiday|break)\b/.test(lower) && /\b(add|create|schedule|make)\b/.test(lower)) {
    return trackPreview(prepareDayOffCreate(message, ctx));
  }

  if (
    /\b(add|create|save)\b/.test(lower)
    && (/\bmaterial\b/.test(lower) || /\blink\b/.test(lower) || /https?:\/\//i.test(message))
  ) {
    return trackPreview(prepareMaterialCreateLink(message, ctx, roster));
  }

  if (/\b(create|add|make)\b/.test(lower) && /\bsubject\b/.test(lower)) {
    return trackPreview(prepareSubjectCreate(message, ctx, roster));
  }

  if (/\b(create|add|make)\b/.test(lower) && /\b(child|learner|student)\b/.test(lower)) {
    return trackPreview(prepareChildCreate(message, ctx));
  }

  if (/\b(create|add|schedule|make)\b/.test(lower) && /\blearning\s*day\b/.test(lower)) {
    return trackPreview(prepareLearningDayCreate(message, ctx, roster));
  }

  if (/\b(create|add|schedule|make)\b/.test(lower) && /\bassignment\b/.test(lower)) {
    return trackPreview(prepareAssignmentCreate(message, ctx, roster));
  }

  if (
    /\b(create|add|schedule|book|make)\b/.test(lower) &&
    /\b(event|appointment|field trip)\b/.test(lower)
  ) {
    return trackPreview(prepareEventCreate(message, ctx, roster));
  }

  if (nav) return nav;
  return howToAnswer(message);
}
