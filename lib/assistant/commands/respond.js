import { DOODLE_COMMAND_TYPES, DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import './registerAll.js';
import { getCommand } from './registry.js';
import { trackDoodleEvent } from './analytics.js';
import { findSubjectMentionedInMessage, resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import {
  continueIntentClarification,
  prepareAttendanceMark,
  prepareAttendanceMarkRange,
  prepareChildCreate,
  prepareChildUpdate,
  prepareChildDelete,
  prepareChildInvite,
  isChildUpdateIntent,
  isChildDeleteIntent,
  isChildInviteIntent,
  prepareDayOffCreate,
  prepareDayOffDelete,
  prepareDayOffUpdate,
  isDayOffCreateIntent,
  isDayOffDeleteIntent,
  isDayOffUpdateIntent,
  prepareLearningDayCreate,
  prepareLearningDayDelete,
  prepareLearningDayUpdate,
  prepareEventDelete,
  prepareEventUpdate,
  prepareMaterialCreateLink,
  prepareMaterialCreateFile,
  prepareMaterialArchiveAll,
  isMaterialArchiveAllIntent,
  preparePlannerItemComplete,
  preparePlannerItemMove,
  prepareSchoolYearUpdate,
  prepareSubjectCreate,
  prepareSubjectUpdate,
  prepareSubjectDelete,
  isEventDeleteIntent,
  isEventUpdateIntent,
  isLearningDayDeleteIntent,
  isLearningDayUpdateIntent,
  isLearningDayCreateIntent,
  isPendingActionRefineIntent,
  refinePendingAction,
  isSchoolYearSettingsIntent,
  isSubjectDeleteIntent,
  isSubjectUpdateIntent,
  findRecentSubjectFromMessages,
  parseWeekdayNumsFromMessage,
  resolveFlexibleDay,
} from './intentPreparers.js';
import {
  isBulletinPostCreateIntent,
  isBulletinPostDeleteIntent,
  isBulletinPostUpdateIntent,
  prepareBulletinPostCreate,
  prepareBulletinPostDelete,
  prepareBulletinPostUpdate,
} from './bulletinIntentPreparers.js';
import {
  fetchSchoolYearAttendanceSummary,
  isAttendanceRangeMarkIntent,
  pickChildFromMessage,
} from '../attendanceChatActions.js';
import { filterSubjectsForSchoolYear } from './rosterHelpers.js';

export { resolveChildByName, resolveSubjectByName } from './entityResolve.js';

/** Status / totals questions — not “how do I mark attendance” or mark actions. */
export function isAttendanceStatusQuery(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(attend(ance|ed)?|present)\b/.test(lower)) return false;
  if (/\b(how (do|to|can)|where (do|can)|explain)\b/.test(lower)) return false;
  if (/\b(mark|log|logged)\b/.test(lower) && !/\b(rate|total|progress|how many)\b/.test(lower)) {
    return false;
  }
  return (
    /\b(rate|total|totals|progress|how many|percent|% )\b/.test(lower)
    || /\b(this\s+)?school\s*year\b/.test(lower)
    || /\bhow (is|are|was|were)\b/.test(lower)
  );
}

export function formatSchoolYearAttendanceAnswer(childName, summary) {
  const name = childName || 'This learner';
  const total = summary.daysAttended ?? 0;
  const lines = [
    `${name}’s attendance for the ${summary.schoolYearLabel || 'school year'} (${summary.rangeLabel || 'saved dates'}):`,
    '',
    `• Total attended: ${total} ${total === 1 ? 'day' : 'days'}`,
  ];
  if (summary.targetDays) {
    const pct = summary.percent != null ? ` (${summary.percent}% of goal)` : '';
    lines.push(`• Goal: ${summary.targetDays} days${pct}`);
  }
  const terms = (summary.terms || []).filter((t) => t.label !== 'Other' || t.count > 0);
  if (terms.length) {
    lines.push(
      `• By term: ${terms.map((t) => `${t.label} ${t.count}`).join(' · ')}`,
    );
  }
  lines.push('', 'Open Planner → Year → Attendance check for the full heatmap.');
  return lines.join('\n');
}

async function answerAttendanceStatusQuery(message, ctx, roster, overrides = {}) {
  const children = roster?.children || [];
  const lower = String(message || '').toLowerCase();
  let child = null;
  if (overrides.childId) {
    child = children.find((c) => String(c.id) === String(overrides.childId)) || null;
  }
  if (!child) child = pickChildFromMessage(lower, children);
  if (!child && ctx.selectedChildIds?.length === 1) {
    child = children.find((c) => String(c.id) === String(ctx.selectedChildIds[0]));
  }
  if (!child && children.length === 1) child = children[0];
  if (!child) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Whose attendance should I look up for this school year?',
      options: children.map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
      clarification: {
        intent: 'attendance.status',
        field: 'childId',
        originalMessage: message,
        draft: {},
      },
    });
  }

  const childName = child.first_name || child.name || 'Learner';
  const summary = await fetchSchoolYearAttendanceSummary({
    familyId: ctx.householdId,
    childId: String(child.id),
    schoolYearLabel: ctx.schoolYearLabel || null,
  });

  if (!summary.ok) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: `I couldn’t load ${childName}’s school-year attendance${summary.error ? `: ${summary.error}` : '.'}`,
      links: [
        { label: 'Open Planner (Year)', href: '/?view=year' },
      ],
    });
  }

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: formatSchoolYearAttendanceAnswer(childName, summary),
    links: [
      { label: 'Open Planner (Year)', href: '/?view=year' },
    ],
  });
}

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

function localCalendarDay(base = new Date(), dayOffset = 0) {
  const d = base instanceof Date && !Number.isNaN(base.getTime()) ? new Date(base) : new Date();
  d.setHours(12, 0, 0, 0);
  if (dayOffset) d.setDate(d.getDate() + dayOffset);
  return d;
}

function parseDateHint(message, ctx) {
  const lower = String(message || '').toLowerCase();
  // “today” / “tomorrow” always mean the real calendar day — not the planner’s visible range.
  const realNow = new Date();
  if (/\btoday\b/.test(lower)) return localCalendarDay(realNow, 0);
  if (/\btomorrow\b/.test(lower)) return localCalendarDay(realNow, 1);
  if (/\byesterday\b/.test(lower)) return localCalendarDay(realNow, -1);

  const anchor = ctx.visibleDateStart ? new Date(ctx.visibleDateStart) : realNow;
  const base = Number.isNaN(anchor.getTime()) ? realNow : anchor;

  if (/\bfriday\b/.test(lower)) {
    const d = localCalendarDay(base, 0);
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
  return localCalendarDay(base, 0);
}

function parseOptionalDateHint(message, ctx) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return null;
  if (
    /\b(today|tomorrow|yesterday|friday|monday|tuesday|wednesday|thursday|saturday|sunday)\b/.test(lower)
    || /\b(20\d{2}-\d{2}-\d{2})\b/.test(message)
    || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}\b/i.test(message)
  ) {
    return parseDateHint(message, ctx);
  }
  return null;
}

function rosterWithSchoolYearSubjects(roster, ctx) {
  const subjects = filterSubjectsForSchoolYear(
    roster?.subjects || [],
    ctx?.schoolYearLabel,
  );
  return { ...(roster || {}), subjects };
}

export function buildAssignmentPreview(command, roster, ctx) {
  const handler = getCommand(DOODLE_COMMAND_TYPES.ASSIGNMENT_CREATE);
  const scopedRoster = rosterWithSchoolYearSubjects(roster, ctx);
  const subject = (scopedRoster.subjects || []).find((s) => String(s.id) === String(command.subjectId));
  const child = (scopedRoster.children || []).find((c) => String(c.id) === String(command.childIds?.[0]));
  return handler.preview(command).map((field) => {
    if (field.fieldPath === 'subjectId' && subject) {
      return { ...field, value: subject.name || subject.title || field.value };
    }
    if (field.fieldPath === 'childIds' && child) {
      return { ...field, value: child.first_name || child.name || field.value };
    }
    return field;
  });
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

/** “create new event today doctors for Lilly at 2” → Doctors */
function extractEventTitleFromMessage(message, children = []) {
  const quoted = extractQuotedTitle(message);
  if (quoted) return stripLearnerFromTitle(quoted, children);

  const called = extractTitleAfterCalled(message);
  if (called) return stripLearnerFromTitle(called, children);

  const afterEvent = message.match(
    /\b(?:create|add|schedule|make|book)\s+(?:an?\s+)?(?:new\s+)?(?:calendar\s+)?events?\s+(.+)$/i,
  );
  if (!afterEvent?.[1]) return null;

  let   rest = afterEvent[1].trim();
  rest = rest.replace(/^(?:today|tomorrow|yesterday)\s+/i, '');
  rest = rest.replace(/^(?:next\s+week|this\s+week)\s+/i, '');
  rest = rest.replace(
    /^(?:on\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\s+/i,
    '',
  );
  rest = rest.replace(/^(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+/i, '');
  rest = rest
    .replace(/\s+for\s+[A-Za-z][A-Za-z'-]*(?:\s+[A-Za-z][A-Za-z'-]*)?(?=\s+(?:at|from|until|location|notes?\b)|$)/i, '')
    .replace(/\s+at\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?.*$/i, '')
    .replace(/\s+from\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?.*$/i, '')
    .replace(/\s+until\s+.+$/i, '')
    .replace(/\s+location\s+.+$/i, '')
    .replace(/\s+with\s+notes?\s+.+$/i, '')
    .trim();

  rest = stripLearnerFromTitle(rest, children);
  if (!rest || rest.length < 2) return null;
  if (/^(today|tomorrow|yesterday|new|an?|the|event)$/i.test(rest)) return null;
  return rest;
}

function titleFromAttachmentFileName(fileName) {
  const name = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return name.length >= 2 ? name : null;
}

function isAssignmentCreateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (/\b(how (do|to|can)|what is|where (is|do|can)|explain)\b/.test(lower)) return false;
  if (
    (/\b(mark|set|check)\b/.test(lower) && /\b(done|complete|completed|finished)\b/.test(lower))
    || (/\b(complete|finish)\b/.test(lower) && /\bassignment\b/.test(lower))
  ) {
    return false;
  }
  return /\b(create|add|schedule|make|new)\b/.test(lower) && /\bassignment\b/.test(lower);
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
    // “export attendance” is a modal action, not mark-attendance help.
    test: /^(?!.*\bexport\b).*\battend(ance|ed)?\b/i,
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
      { label: 'Open Planner (Year)', href: '/?view=year' },
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
      { label: 'Open Planner', href: '/?view=month' },
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
    links: [{ label: 'Open Planner', href: '/?view=month' }],
  },
];

const UNRESOLVED_CHAT_MESSAGE =
  "I can't do that function via chat yet. Please submit a request in Settings → Feedback for new functions.";

function unresolvedChatAnswer() {
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: UNRESOLVED_CHAT_MESSAGE,
    links: [{ label: 'Open Feedback', href: '/settings?section=feedback' }],
  });
}

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
  return unresolvedChatAnswer();
}

export function isAttendanceMarkIntent(message) {
  const lower = String(message || '').toLowerCase();
  // Bulk Attendance modal phrasing (term / full range).
  if (/\bbulk\s+attendance\b/.test(lower) || /\bmark\s+full\s+range\b/.test(lower)) {
    return true;
  }
  if (!/\b(mark|log|logged|set)\b/.test(lower)) return false;
  // School Year Settings / status questions — not a mark action.
  if (/\b(goal|target|rate|total|progress|how many|percent|tracking\s*mode)\b/.test(lower)) {
    return false;
  }
  // “attended” must match — \\battend\\b does not.
  return /\b(attend(?:ance|ed)?|present|absent|partial)\b/.test(lower);
}

/**
 * Account Settings (Profile / Preferences / Notifications).
 * Household items (School Year, Family, Subjects) are handled by other intents.
 */
export function resolveAccountSettingsDestination(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return null;

  // Leave household / planner settings to existing chat flows.
  if (
    /\b(school\s*year|day\s*off|learning\s*hours|target\s*days|term\s+dates?|edit\s+family|family\s+members?|add\s+(?:a\s+)?(?:child|learner|student)|subject\s+settings|planner\s+settings|planning\s+preferences)\b/.test(lower)
  ) {
    return null;
  }

  if (
    /\b(notifications?|email\s+(?:alerts?|notifications?|preferences?|updates?)|unsubscribe)\b/.test(lower)
    || (/\bemail\b/.test(lower) && /\b(off|on|disable|enable|turn)\b/.test(lower) && /\b(alert|notif)/.test(lower))
  ) {
    return {
      href: '/settings?section=notifications',
      label: 'Open Notifications',
      sectionLabel: 'Notifications',
    };
  }

  if (
    /\b(app\s+preferences?|feature\s+toggles?|workspace\s+features?)\b/.test(lower)
    || (/\bpreferences?\b/.test(lower) && !/\b(planning|planner|school\s*year)\b/.test(lower))
    || (
      /\b(learning\s+areas?|assignments?|materials?|attendance|grades?|compliance)\b/.test(lower)
      && /\b(turn\s+(?:on|off)|enable|disable|toggle|settings?)\b/.test(lower)
    )
  ) {
    return {
      href: '/settings?section=preferences',
      label: 'Open Preferences',
      sectionLabel: 'Preferences',
    };
  }

  if (
    /\b(profile|password|log\s*out|sign\s*out|reset\s+password|account\s+(?:email|management|security)|danger\s+zone|delete\s+(?:my\s+)?account)\b/.test(lower)
  ) {
    return {
      href: '/settings?section=profile',
      label: 'Open Profile',
      sectionLabel: 'Profile',
    };
  }

  // Generic “settings” / “account settings” → Profile (default account page).
  if (
    /\b(settings?|account\s+settings?)\b/.test(lower)
    && !/\b(school\s*year|subject|family|planner|attendance|assignment|material|learning|calendar|event)\b/.test(lower)
  ) {
    return {
      href: '/settings?section=profile',
      label: 'Open Settings',
      sectionLabel: 'Settings',
    };
  }

  return null;
}

function accountSettingsAnswer(message) {
  const dest = resolveAccountSettingsDestination(message);
  if (!dest) return null;
  const topic = dest.sectionLabel === 'Settings'
    ? 'account settings'
    : dest.sectionLabel.toLowerCase();
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.NAVIGATION,
    message: `You can manage ${topic} in Settings:`,
    destination: { label: dest.label, href: dest.href },
  });
}

/** “export planner” / “export calendar” / bare “export” → same modal as Planner Smart Actions. */
export function isPlannerExportIntent(message) {
  const lower = String(message || '').toLowerCase().trim();
  if (!lower) return false;
  if (/\bhow\s+(do|to|can)\b/.test(lower)) return false;
  if (isAttendanceExportIntent(message)) return false;
  if (lower === 'export' || lower === 'export csv') return true;
  if (/\bexport\b/.test(lower) && /\b(planner|calendar|schedule|csv)\b/.test(lower)) return true;
  return false;
}

/** “export attendance” → same modal as Planner → Year → Export Attendance. */
export function isAttendanceExportIntent(message) {
  const lower = String(message || '').toLowerCase().trim();
  if (!lower) return false;
  if (/\bhow\s+(do|to|can)\b/.test(lower)) return false;
  return /\bexport\b/.test(lower) && /\battend(?:ance|ed)?\b/.test(lower);
}

function openPlannerExportFromChat(detail = {}) {
  if (typeof window === 'undefined') return false;
  try {
    window.dispatchEvent(new CustomEvent('openExportPlannerModal', { detail: detail || {} }));
    return true;
  } catch {
    return false;
  }
}

function openAttendanceExportFromChat() {
  if (typeof window === 'undefined') return false;
  try {
    window.dispatchEvent(new CustomEvent('openAttendanceExportModal'));
    return true;
  } catch {
    return false;
  }
}

function plannerExportAnswer(message, roster = {}, recentSubject = null) {
  if (!isPlannerExportIntent(message)) return null;
  const mentioned = findSubjectMentionedInMessage(message, roster.subjects || []);
  const detail = {};
  if (mentioned.ok) {
    detail.subjectId = String(mentioned.subject.id);
    detail.subjectName = mentioned.subject.name || mentioned.subject.title || null;
  } else if (recentSubject?.subjectId && /\b(it|this|that)\b/i.test(message)) {
    detail.subjectId = String(recentSubject.subjectId);
    detail.subjectName = recentSubject.subjectName || null;
  }
  openPlannerExportFromChat(detail);
  const subjectLabel = detail.subjectName ? ` for ${detail.subjectName}` : '';
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.NAVIGATION,
    message: `Export planner${subjectLabel} is ready — choose the date range and optional columns, then Export.`,
    destination: {
      label: detail.subjectName ? `Open export — ${detail.subjectName}` : 'Open export',
      href: '#export-planner',
      subjectId: detail.subjectId || null,
      subjectName: detail.subjectName || null,
    },
  });
}

function attendanceExportAnswer(message) {
  if (!isAttendanceExportIntent(message)) return null;
  openAttendanceExportFromChat();
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.NAVIGATION,
    message: 'Export attendance is ready — pick the learner and date range, then Export.',
    destination: {
      label: 'Open attendance export',
      href: '#export-attendance',
    },
  });
}

function navigateAnswer(message) {
  const lower = message.toLowerCase();
  // Attendance rate/total questions mention “school year” but should not jump to Settings.
  if (isAttendanceStatusQuery(message)) return null;
  // “mark … learning days attended” is an action, not Learning navigation.
  if (isAttendanceMarkIntent(message) || isAttendanceRangeMarkIntent(message)) return null;
  // “add learning days fri and sat” creates calendar days — not Open Learning.
  if (isLearningDayCreateIntent(message)) return null;
  // Export opens a modal — don’t treat “export planner/attendance” as plain nav.
  if (isPlannerExportIntent(message) || isAttendanceExportIntent(message)) return null;
  if (isMaterialArchiveAllIntent(message)) return null;

  const accountSettings = resolveAccountSettingsDestination(message);
  if (accountSettings && (/\bsettings?\b/.test(lower) || /\b(notification|preference|profile|password)\b/.test(lower))) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.NAVIGATION,
      message: `Open ${accountSettings.sectionLabel} from here:`,
      destination: { label: accountSettings.label, href: accountSettings.href },
    });
  }

  // Household School Year settings (not Profile/Preferences/Notifications).
  if (/\bschool\s*year\b/.test(lower) && /\bsettings?\b/.test(lower)) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.NAVIGATION,
      message: 'Open School Year settings from here:',
      destination: { label: 'Open School Year', href: '/settings?section=planner-settings' },
    });
  }

  const map = [
    { test: /planner|calendar/, href: '/?view=month', label: 'Open Planner' },
    { test: /learning|subject/, href: '/learning', label: 'Open Learning' },
    { test: /material/, href: '/subjects?tab=materials', label: 'Open Materials' },
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
    overrides.title
    || extractEventTitleFromMessage(message, roster.children);

  if (title) title = stripLearnerFromTitle(title, roster.children);
  if (title && /^(today|tomorrow|yesterday|new)$/i.test(title)) title = null;

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
  const lower = String(message || '').toLowerCase();

  let endAt = overrides.endAt || null;
  const untilMatch = message.match(/\buntil\s+(today|tomorrow|\w+day|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i);
  if (!endAt && untilMatch) {
    const ymd = resolveFlexibleDay(untilMatch[1], start);
    if (ymd) endAt = new Date(`${ymd}T12:00:00`).toISOString();
  }

  let startTimeHm = overrides.startTimeHm || null;
  let endTimeHm = overrides.endTimeHm || null;
  const range = message.match(
    /\bfrom\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)\s+to\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i,
  );
  const atTime = message.match(/\bat\s+(\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)?)/i);
  const toHm = (raw) => {
    const m = String(raw || '').match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const mins = Number(m[2] || 0);
    const ap = String(m[3] || '').toLowerCase().replace(/\./g, '');
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };
  if (range) {
    startTimeHm = toHm(range[1]);
    endTimeHm = toHm(range[2]);
  } else if (atTime) {
    startTimeHm = toHm(atTime[1]);
  }

  let location = overrides.location || null;
  const locMatch = message.match(/\blocation\s*(?:to|as|:)?\s+["']?([^"'\n]+?)["']?\s*$/i)
    || message.match(/\b(?:at|@)\s+the\s+([A-Za-z][^,.\n]{1,80})/i);
  if (!location && locMatch && !/^\d/.test(locMatch[1].trim())) {
    location = locMatch[1].trim().replace(/[.?!]+$/, '');
  }

  let description = overrides.description || null;
  const notesMatch = message.match(/\b(?:additional\s*)?notes?\s*(?:that|:)?\s+["']?(.+?)["']?\s*$/i)
    || message.match(/\bwith\s+notes?\s+["']?(.+?)["']?\s*$/i);
  if (!description && notesMatch) description = notesMatch[1].trim();

  let recurrenceRule = overrides.recurrenceRule || null;
  let recurrenceLabel = 'Just once';
  if (/\b(repeat|every\s+week|weekly|every\s+day|daily)\b/.test(lower)) {
    // Lazy import kept inside execute; preparer stores a simple weekly/daily flag shape.
    const days = parseWeekdayNumsFromMessage(message);
    if (/\bdaily|every\s+day\b/.test(lower)) {
      recurrenceRule = { frequency: 'DAILY', interval: 1 };
      recurrenceLabel = 'Daily';
    } else {
      recurrenceRule = {
        frequency: 'WEEKLY',
        interval: 1,
        byweekday: (days.length ? days : [start.getDay()]).map((d) => (
          ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'][d]
        )),
      };
      recurrenceLabel = 'Weekly';
    }
  }

  const attachments = Array.isArray(overrides.attachments) ? overrides.attachments : [];
  const att = attachments[0] || {};

  const childNames = childIds
    .map((id) => {
      const c = (roster.children || []).find((row) => String(row.id) === String(id));
      return c?.first_name || c?.name || null;
    })
    .filter(Boolean)
    .join(', ');

  /** @type {import('./types.js').DoodleCommand} */
  const command = {
    type: DOODLE_COMMAND_TYPES.EVENT_CREATE,
    householdId: ctx.householdId,
    title: title.replace(/^(an?\s+|the\s+)/i, '').trim(),
    startAt: start.toISOString(),
    endAt,
    startTimeHm,
    endTimeHm,
    allDay: false,
    location,
    description,
    recurrenceRule,
    recurrenceLabel,
    childIds,
    childNames,
    dateLabel: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    endDateLabel: endAt
      ? new Date(endAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : null,
    attachmentId: overrides.attachmentId || att.attachmentId || null,
    fileName: overrides.fileName || att.fileName || null,
    mime: overrides.mime || att.mime || null,
    bytes: overrides.bytes || att.bytes || null,
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

  const scopedRoster = rosterWithSchoolYearSubjects(roster, ctx);
  const subjects = scopedRoster.subjects || [];

  const attachments = Array.isArray(overrides.attachments) ? overrides.attachments : [];
  const att = attachments[0] || {};

  let title =
    overrides.title ||
    extractQuotedTitle(message) ||
    extractTitleAfterCalled(message);

  if (title) title = stripLearnerFromTitle(title, roster.children);
  // Ignore leftover date/noise words mistaken for a title (“tomorrow”, lone “w”).
  if (title && (
    /^(today|tomorrow|yesterday|new)$/i.test(title)
    || title.length < 2
  )) {
    title = null;
  }
  if ((!title || title.length < 2) && (overrides.fileName || att.fileName)) {
    title = titleFromAttachmentFileName(overrides.fileName || att.fileName);
  }

  if (!title || title.length < 2) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'What should the assignment be titled?',
    }), {
      intent: 'assignment.create',
      field: 'title',
      originalMessage: message,
      draft: { ...overrides, attachments },
    });
  }

  let subjectId = overrides.subjectId || ctx.selectedSubjectId || null;
  // Prefer "in History" for subject; avoid treating "for Lilly" as a subject
  const inSubjectMatch = message.match(/\bin\s+([A-Za-z][A-Za-z0-9 &/-]*)/i);
  if (!subjectId && inSubjectMatch) {
    const resolved = resolveSubjectByName(inSubjectMatch[1].trim(), subjects);
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'assignment.create',
        field: 'subjectId',
        originalMessage: message,
        draft: { title, childIds: overrides.childIds, attachments, ...overrides },
      });
    }
    if (resolved.ok) subjectId = String(resolved.subject.id);
  }
  if (!subjectId) {
    const named = message.match(/\b(history|math|science|reading|english|writing)\b/i);
    if (named) {
      const resolved = resolveSubjectByName(named[1], subjects);
      if (resolved.ok) subjectId = String(resolved.subject.id);
    }
  }
  if (!subjectId) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject should this assignment belong to?',
      options: subjects.slice(0, 12).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'assignment.create',
      field: 'subjectId',
      originalMessage: message,
      draft: { title, childIds: overrides.childIds, attachments, ...overrides },
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
        draft: { title, subjectId, attachments, ...overrides },
      });
    }
    if (resolved.ok) childIds = [String(resolved.child.id)];
  }
  if (!childIds.length && scopedRoster.children?.length === 1) {
    childIds = [String(scopedRoster.children[0].id)];
  }
  if (!childIds.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student should this assignment be for?',
      options: (scopedRoster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'assignment.create',
      field: 'childId',
      originalMessage: message,
      draft: { title, subjectId, attachments, ...overrides },
    });
  }

  let dueAt = overrides.dueAt || null;
  if (!dueAt) {
    const hinted = parseOptionalDateHint(message, ctx);
    if (hinted) dueAt = hinted.toISOString();
  }
  if (!dueAt) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'When is this assignment due?',
    }), {
      intent: 'assignment.create',
      field: 'dueAt',
      originalMessage: message,
      draft: { title, subjectId, childIds, attachments, ...overrides },
    });
  }

  const subject = subjects.find((s) => String(s.id) === String(subjectId));

  /** @type {import('./types.js').DoodleCommand} */
  const command = {
    type: DOODLE_COMMAND_TYPES.ASSIGNMENT_CREATE,
    householdId: ctx.householdId,
    schoolYearId: ctx.schoolYearId,
    subjectId,
    childIds,
    title: title.replace(/^(an?\s+|the\s+)/i, '').trim(),
    dueAt,
    attachmentId: overrides.attachmentId || att.attachmentId || null,
    fileName: overrides.fileName || att.fileName || null,
    mime: overrides.mime || att.mime || null,
    mimeLabel: overrides.mimeLabel || att.mimeLabel || null,
    bytes: overrides.bytes || att.bytes || null,
  };

  const preview = buildAssignmentPreview(command, roster, ctx);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: command.attachmentId ? 'Create assignment with attachment' : 'Create assignment',
    command,
    preview,
    confirmationLabel: command.attachmentId ? 'Create & attach' : 'Create assignment',
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
  } else if (field === 'dueAt') {
    const parsed = parseDateHint(value, ctx);
    if (Number.isNaN(parsed.getTime())) return null;
    draft.dueAt = parsed.toISOString();
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
 *   recentMessages?: Array<object>,
 *   pendingClarification?: object,
 *   clarificationOption?: object,
 *   pendingAction?: object,
 *   attachments?: Array<{ attachmentId: string, fileName?: string, mime?: string, mimeLabel?: string, bytes?: number, previewUrl?: string }>,
 * }} input
 */
export async function doodleRespond(input) {
  const message = String(input?.message || '').trim();
  const ctx = input?.context;
  const roster = input?.roster || { children: [], subjects: [] };
  const pendingClarification = input?.pendingClarification || null;
  const clarificationOption = input?.clarificationOption || null;
  const pendingAction = input?.pendingAction || null;
  const attachments = Array.isArray(input?.attachments) ? input.attachments : [];
  const recentSubject = findRecentSubjectFromMessages(input?.recentMessages);

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
  if (pendingClarification?.intent === 'attendance.status') {
    const childId = clarificationOption?.value
      || resolveChildByName(message, roster.children).child?.id
      || null;
    return answerAttendanceStatusQuery(
      pendingClarification.originalMessage || message,
      ctx,
      roster,
      childId ? { childId: String(childId) } : {},
    );
  }
  if (pendingClarification?.intent) {
    const continued = await Promise.resolve(continueFromClarification(
      pendingClarification,
      message || attachments[0]?.fileName || 'ok',
      clarificationOption,
      ctx,
      roster,
    ));
    if (continued) return trackPreview(continued);
  }

  // Amend the confirmable preview still on screen (e.g. “and lesson 1”)
  if (pendingAction?.command && isPendingActionRefineIntent(message, pendingAction)) {
    const refined = await refinePendingAction(message, pendingAction, ctx, roster);
    if (refined) return trackPreview(refined);
  }

  const lower = (message || '').toLowerCase();
  const isHowTo = /\b(how (do|to|can)|what is|where (is|do|can)|explain)\b/.test(lower);
  const isLessonOrLearningDayCreate = isLearningDayCreateIntent(message);

  // Attachment + “create lesson / learning day …” → one-off learning day with material
  // (must run before the Materials-only shortcut).
  if (attachments.length && !isHowTo && isLessonOrLearningDayCreate) {
    return trackPreview(prepareLearningDayCreate(message, ctx, roster, {
      attachments,
      createLesson: true,
    }));
  }

  // Attachment + “add assignment …” → assignment create (ask subject), not Materials-only.
  if (attachments.length && !isHowTo && isAssignmentCreateIntent(message)) {
    return trackPreview(prepareAssignmentCreate(message, ctx, roster, { attachments }));
  }

  // Attachment + “create new post / announcement …” → bulletin post with file, not Materials-only.
  if (attachments.length && !isHowTo && isBulletinPostCreateIntent(message)) {
    return trackPreview(await prepareBulletinPostCreate(message, ctx, roster, { attachments }));
  }

  // Attached files alone → confirmable Materials upload (unless asking how-to)
  // Includes “add to History lesson plan” / “attach to cinematography syllabus”.
  if (attachments.length && !isHowTo) {
    return trackPreview(prepareMaterialCreateFile(
      message || `Add ${attachments[0].fileName || 'file'} to Materials`,
      ctx,
      roster,
      attachments,
    ));
  }

  // Account Settings (Profile / Preferences / Notifications) — before guide how-tos
  // so “change notifications…” is not answered with unrelated Planner copy.
  const settingsNav = accountSettingsAnswer(message);
  if (settingsNav) return settingsNav;

  // Same Export planner / attendance modals as Planner Smart Actions.
  const exportNav = plannerExportAnswer(message, roster, recentSubject);
  if (exportNav) return exportNav;
  const attendanceExportNav = attendanceExportAnswer(message);
  if (attendanceExportNav) return attendanceExportNav;

  if (isHowTo) {
    return howToAnswer(message);
  }

  const nav = navigateAnswer(message);
  if (/\b(open|go to|take me|navigate)\b/.test(lower) && nav) return nav;

  const find = findRosterAnswer(message, roster);
  if (find) return find;

  // School-year attendance total / rate (e.g. “how is Lilly’s attendance rate this school year”)
  if (isAttendanceStatusQuery(message)) {
    return answerAttendanceStatusQuery(message, ctx, roster);
  }

  // Mark attendance (action) — not “how do I mark attendance”
  // Include “attended” (\\battend\\b alone does not match).
  if (isAttendanceMarkIntent(message)) {
    if (isAttendanceRangeMarkIntent(message)) {
      return trackPreview(await prepareAttendanceMarkRange(message, ctx, roster));
    }
    return trackPreview(prepareAttendanceMark(message, ctx, roster));
  }

  // Mark planner item / assignment done
  if (
    (/\b(mark|set|check)\b/.test(lower) && /\b(done|complete|completed|finished)\b/.test(lower))
    || (/\b(complete|finish)\b/.test(lower) && /\b(assignment|event|lesson|item|homework|classwork)\b/.test(lower))
  ) {
    return trackPreview(await preparePlannerItemComplete(message, ctx, roster));
  }

  // Learning day modal parity (update/delete) — before generic move / subject schedule
  if (isLearningDayDeleteIntent(message)) {
    return trackPreview(await prepareLearningDayDelete(message, ctx, roster));
  }
  if (isLearningDayUpdateIntent(message)) {
    return trackPreview(await prepareLearningDayUpdate(message, ctx, roster, { attachments }));
  }

  // Day off / break / holiday removals (before generic calendar event delete)
  if (isDayOffDeleteIntent(message)) {
    return trackPreview(await prepareDayOffDelete(message, ctx));
  }
  if (isDayOffUpdateIntent(message)) {
    return trackPreview(await prepareDayOffUpdate(message, ctx));
  }
  if (isDayOffCreateIntent(message)) {
    return trackPreview(await prepareDayOffCreate(message, ctx));
  }

  // Calendar Event modal parity
  if (isEventDeleteIntent(message, roster)) {
    return trackPreview(await prepareEventDelete(message, ctx, roster));
  }
  if (isEventUpdateIntent(message, roster)) {
    return trackPreview(await prepareEventUpdate(message, ctx, roster, { attachments }));
  }

  // “move field trip to sunday” / “reschedule lesson to tomorrow”
  if (
    /\b(move|reschedule|shift)\b/.test(lower)
    && (
      /\b(event|lesson|item|appointment|trip|learning\s*day)\b/.test(lower)
      || /\bto\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)
    )
  ) {
    return trackPreview(await preparePlannerItemMove(message, ctx, roster));
  }

  if (isSubjectDeleteIntent(message, roster)) {
    return trackPreview(await prepareSubjectDelete(message, ctx, roster));
  }

  // Subject settings (schedule, grade, grading, syllabus, students) — before household school-year defaults
  // Pronoun follow-ups (“change it for next year”) use the last subject from this chat.
  if (isSubjectUpdateIntent(message, roster, {
    recentSubjectId: recentSubject?.subjectId,
    recentSubjectName: recentSubject?.subjectName,
  })) {
    const mentionedSubject = findSubjectMentionedInMessage(message, roster.subjects || []);
    const updateOverrides = {};
    if (!mentionedSubject.ok && recentSubject) {
      if (recentSubject.subjectId) updateOverrides.subjectId = recentSubject.subjectId;
      if (recentSubject.subjectName) updateOverrides.subjectName = recentSubject.subjectName;
    }
    return trackPreview(await prepareSubjectUpdate(message, ctx, roster, updateOverrides));
  }

  if (isSchoolYearSettingsIntent(message)) {
    return trackPreview(await prepareSchoolYearUpdate(message, ctx));
  }

  // Bulletin announcements (home / subject board) — before generic “post” phrasing elsewhere
  if (isBulletinPostDeleteIntent(message)) {
    return trackPreview(await prepareBulletinPostDelete(message, ctx, roster));
  }
  if (isBulletinPostUpdateIntent(message)) {
    return trackPreview(await prepareBulletinPostUpdate(message, ctx, roster));
  }
  if (isBulletinPostCreateIntent(message)) {
    return trackPreview(await prepareBulletinPostCreate(message, ctx, roster, { attachments }));
  }

  // Delete / clear all Materials library items
  if (isMaterialArchiveAllIntent(message)) {
    return trackPreview(await prepareMaterialArchiveAll(message, ctx));
  }

  if (
    /\b(add|create|save)\b/.test(lower)
    && (/\bmaterial\b/.test(lower) || /\blink\b/.test(lower) || /https?:\/\//i.test(message))
    && !/\bsubject\b/.test(lower)
  ) {
    return trackPreview(prepareMaterialCreateLink(message, ctx, roster));
  }

  if (/\b(create|add|make)\b/.test(lower) && /\bsubject\b/.test(lower)) {
    return trackPreview(await prepareSubjectCreate(message, ctx, roster));
  }

  if (isChildDeleteIntent(message, roster)) {
    return trackPreview(await prepareChildDelete(message, ctx, roster));
  }

  if (isChildInviteIntent(message)) {
    return trackPreview(await prepareChildInvite(message, ctx, roster));
  }

  if (isChildUpdateIntent(message)) {
    return trackPreview(await prepareChildUpdate(message, ctx, roster));
  }

  if (/\b(create|add|make)\b/.test(lower) && /\b(child|learner|student)\b/.test(lower)) {
    return trackPreview(prepareChildCreate(message, ctx));
  }

  if (isLearningDayCreateIntent(message)) {
    return trackPreview(prepareLearningDayCreate(message, ctx, roster, {
      attachments,
      createLesson: /\blesson\b/.test(lower) && !/\blearning\s*days?\b/.test(lower),
    }));
  }

  if (isAssignmentCreateIntent(message)) {
    return trackPreview(prepareAssignmentCreate(message, ctx, roster, { attachments }));
  }

  if (
    /\b(create|add|schedule|book|make)\b/.test(lower) &&
    /\b(event|appointment|field trip)\b/.test(lower)
  ) {
    return trackPreview(prepareEventCreate(message, ctx, roster, { attachments }));
  }

  if (nav) return nav;
  return unresolvedChatAnswer();
}
