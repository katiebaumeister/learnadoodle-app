/**
 * LLM-first turn interpretation for Doodle.
 * Maps messy chat (+ history + roster) → preparerKey + slots → existing confirm pipeline.
 * Regex detectors remain the offline / low-confidence backup.
 */

import { meterDoodleAiUsage } from './meterAiUsage.js';
import { completeChatText } from './openaiChatHelper.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import { resolveFlexibleDay } from './intentPreparers.js';

/** Canonical preparer keys the model may return. */
export const DOODLE_PREPARER_KEYS = [
  'practice.generate',
  'practice.from_material',
  'practice.adaptive',
  'tutor.socratic',
  'portfolio.organize',
  'project.theme_week',
  'curriculum.from_material',
  'curriculum.lesson_from_link',
  'curriculum.schedule_next',
  'curriculum.assign',
  'learning.suggest',
  'learning.catch_up',
  'learning.classes_done',
  'learning.parent_summary',
  'learning.explain',
  'assignment.create',
  'assignment.move',
  'assignment.update',
  'assignment.delete',
  'learning_day.create',
  'event.create',
  'event.update',
  'event.delete',
  'day_off.create',
  'planner.day.replan',
  'planner.plan_week',
  'planner.bulk_reschedule',
  'planner.item.move',
  'attendance.mark',
  'attendance.status',
  'answer.schedule',
  'answer.help',
  'none',
];

const SYSTEM_PROMPT = `You are the intent layer for Learnadoodle Doodle — a family homeschool planner assistant.
Map the user's latest message (with chat history) to ONE preparer key and slots.

Rules:
- Fix typos/spelling and expand shorthand (e.g. "nxt fri" → next Friday, "mak a quizz" → make a quiz).
- Use chat history and roster names to resolve pronouns ("her", "that", "same subject").
- Prefer actionable tools when the user wants something done; prefer answer.* for questions.
- For make/create quiz/worksheet/practice from a curriculum lesson → practice.generate.
- For quiz/worksheet from a library doc/PDF/material → practice.from_material.
- For units/lessons/curriculum from a material/doc/syllabus → curriculum.from_material.
- For a lesson around a YouTube/video URL → curriculum.lesson_from_link.
- Always fill slots.title in Title Case when the artifact is clear (e.g. "Quiz: Math", "Worksheet").
- Never invent children/subjects not in the roster; leave those slots null if unclear.
- Mutating actions will still show a confirm preview — pick the right tool confidently.
- If truly unclear, use "none".

Preparer keys:
${DOODLE_PREPARER_KEYS.filter((k) => k !== 'none').join(', ')}

Return ONLY JSON:
{
  "preparerKey": "<key or none>",
  "confidence": 0.0-1.0,
  "normalizedMessage": "clean English rewrite the preparer can parse",
  "slots": {
    "childName": string|null,
    "subjectName": string|null,
    "title": string|null,
    "dueHint": string|null,
    "dateHint": string|null,
    "theme": string|null,
    "difficulty": "easier"|"harder"|"adaptive"|null,
    "topic": string|null
  }
}`;

function rosterDigest(roster = {}) {
  const children = (roster.children || [])
    .slice(0, 12)
    .map((c) => c.first_name || c.name || c.id)
    .filter(Boolean);
  const subjects = (roster.subjects || [])
    .slice(0, 16)
    .map((s) => s.name || s.title || s.id)
    .filter(Boolean);
  return { children, subjects };
}

function historyDigest(recentMessages = [], limit = 8) {
  const rows = Array.isArray(recentMessages) ? recentMessages.slice(-limit) : [];
  return rows
    .map((m) => {
      const role = m.role === 'user' ? 'User' : 'Doodle';
      const text = String(m.content || '').replace(/\s+/g, ' ').trim().slice(0, 220);
      return text ? `${role}: ${text}` : null;
    })
    .filter(Boolean)
    .join('\n');
}

function parseJsonObject(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

/** Lightweight typo / shorthand cleanup before date + entity parsers. */
export function normalizeCasualText(message) {
  let t = String(message || '').trim();
  if (!t) return t;
  t = t
    .replace(/\bnxt\b/gi, 'next')
    .replace(/\btmrw\b/gi, 'tomorrow')
    .replace(/\btomorow\b/gi, 'tomorrow')
    .replace(/\btodayy\b/gi, 'today')
    .replace(/\bfri\b/gi, 'friday')
    .replace(/\bmon\b/gi, 'monday')
    .replace(/\btue\b/gi, 'tuesday')
    .replace(/\bwed\b/gi, 'wednesday')
    .replace(/\bthu\b/gi, 'thursday')
    .replace(/\bsat\b/gi, 'saturday')
    .replace(/\bsun\b/gi, 'sunday')
    .replace(/\bquizz\b/gi, 'quiz')
    .replace(/\bassingment\b/gi, 'assignment')
    .replace(/\bpracitce\b/gi, 'practice')
    .replace(/\bmak\b/gi, 'make')
    .replace(/\bscheduel\b/gi, 'schedule');
  return t;
}

/** Title-case short labels (assignment titles, themes). */
export function titleCaseWords(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const small = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with']);
  return raw.split(' ').map((word, index) => {
    if (!word) return word;
    if (/^[A-Z0-9]{2,}(?:'[A-Z]+)?$/.test(word) && word === word.toUpperCase()) return word;
    const lower = word.toLowerCase();
    if (index > 0 && small.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }).join(' ');
}

/** Infer a sensible assignment title from casual “make a quiz…” wording. */
export function inferAssignmentTitleFromMessage(message) {
  const text = normalizeCasualText(message);
  const lower = text.toLowerCase();
  let kind = null;
  if (/\bquiz\b/.test(lower)) kind = 'Quiz';
  else if (/\bworksheet\b/.test(lower)) kind = 'Worksheet';
  else if (/\bpractice\b/.test(lower)) kind = 'Practice';
  else if (/\bhomework\b/.test(lower)) kind = 'Homework';
  if (!kind) return null;
  const topic = text.match(
    /\bon\s+([A-Za-z][A-Za-z0-9 &/-]{1,40}?)(?=\s+(?:for|due|next|tomorrow|today|this|by)\b|[.,?!]|$)/i,
  );
  const topicRaw = topic?.[1]?.trim();
  if (topicRaw && !/^(a|an|the|me|us)$/i.test(topicRaw)) {
    return `${kind}: ${titleCaseWords(topicRaw)}`;
  }
  return kind;
}

/**
 * Resolve name slots against roster + date hints → preparer overrides.
 */
export function resolveInterpretedSlots(slots = {}, roster = {}) {
  const overrides = {};
  if (slots.childName) {
    const resolved = resolveChildByName(String(slots.childName), roster.children || []);
    if (resolved.ok) {
      overrides.childIds = [String(resolved.child.id)];
      overrides.childId = String(resolved.child.id);
    }
  }
  if (slots.subjectName) {
    const resolved = resolveSubjectByName(String(slots.subjectName), roster.subjects || []);
    if (resolved.ok) {
      overrides.subjectId = String(resolved.subject.id);
      overrides.subjectName = resolved.subject.name || resolved.subject.title || slots.subjectName;
    }
  }
  if (slots.title) overrides.title = titleCaseWords(String(slots.title).trim());
  if (slots.theme) overrides.theme = titleCaseWords(String(slots.theme).trim());
  if (slots.difficulty) overrides.difficulty = String(slots.difficulty).trim();
  if (slots.topic) overrides.topicQuery = String(slots.topic).trim();

  const dueHint = slots.dueHint || slots.dateHint || null;
  if (dueHint) {
    const ymd = resolveFlexibleDay(String(dueHint), new Date());
    if (ymd) {
      overrides.dueAt = new Date(`${ymd}T12:00:00`).toISOString();
      overrides.date = ymd;
    }
  }
  return overrides;
}

/**
 * Interpret one user turn with optional injectable LLM (tests).
 * @returns {Promise<null|{ preparerKey: string, confidence: number, normalizedMessage: string, slots: object, overrides: object, usedLlm: boolean }>}
 */
export async function interpretDoodleTurn({
  message,
  recentMessages = [],
  roster = {},
  ctx = {},
  conversationId = null,
  pendingClarification = null,
  completeChat = completeChatText,
} = {}) {
  const text = normalizeCasualText(message);
  if (!text) return null;

  const digest = rosterDigest(roster);
  const history = historyDigest(recentMessages);
  const pending = pendingClarification
    ? `Pending clarification: intent=${pendingClarification.intent}, field=${pendingClarification.field}, draft=${JSON.stringify(pendingClarification.draft || {}).slice(0, 400)}`
    : 'No pending clarification.';

  const user = [
    `Roster children: ${digest.children.join(', ') || '(none)'}`,
    `Roster subjects: ${digest.subjects.join(', ') || '(none)'}`,
    pending,
    history ? `Recent chat:\n${history}` : 'Recent chat: (none)',
    `Latest user message: ${text}`,
  ].join('\n\n');

  const raw = await completeChat({
    system: SYSTEM_PROMPT,
    user,
    temperature: 0.1,
    maxTokens: 350,
  });
  if (!raw) return null;

  const parsed = parseJsonObject(raw);
  if (!parsed) return null;

  let preparerKey = String(parsed.preparerKey || 'none').trim();
  if (!DOODLE_PREPARER_KEYS.includes(preparerKey)) preparerKey = 'none';
  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0;
  const normalizedMessage = String(parsed.normalizedMessage || text).trim() || text;
  const slots = parsed.slots && typeof parsed.slots === 'object' ? parsed.slots : {};
  const overrides = resolveInterpretedSlots(slots, roster);

  if (ctx?.householdId) {
    meterDoodleAiUsage({
      familyId: ctx.householdId,
      conversationId: conversationId || null,
      actionType: 'chatbotSimple',
      idempotencyKey: `doodle-interpret-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      metadata: { preparerKey, confidence, reason: 'conversational_interpret' },
    }).catch(() => {});
  }

  return {
    preparerKey,
    confidence,
    normalizedMessage,
    slots,
    overrides,
    usedLlm: true,
  };
}

/**
 * Interpret a free-text clarification reply (typos for due dates, names, etc.).
 */
export async function interpretClarificationValue({
  message,
  pendingClarification,
  roster = {},
  completeChat = completeChatText,
} = {}) {
  if (!pendingClarification?.field) return null;
  const field = pendingClarification.field;
  const text = normalizeCasualText(message);
  if (!text) return null;

  // Offline heuristics first (fast, works without API key).
  if (field === 'dueAt' || field === 'date' || field === 'startAt') {
    const ymd = resolveFlexibleDay(text, new Date());
    if (ymd) return { value: ymd, confidence: 0.8, usedLlm: false };
  }
  if (field === 'childId') {
    const resolved = resolveChildByName(text, roster.children || []);
    if (resolved.ok) return { value: String(resolved.child.id), confidence: 0.8, usedLlm: false };
  }
  if (field === 'subjectId') {
    const resolved = resolveSubjectByName(text, roster.subjects || []);
    if (resolved.ok) return { value: String(resolved.subject.id), confidence: 0.8, usedLlm: false };
  }
  if (field === 'theme' || field === 'title') {
    return { value: titleCaseWords(text), confidence: 0.7, usedLlm: false };
  }

  const digest = rosterDigest(roster);
  const system = `You extract a clarification field value for a homeschool planner.
Return ONLY JSON: { "value": "<string>", "confidence": 0-1 }
Field "${field}" meanings:
- dueAt/date/startAt: ISO date YYYY-MM-DD or phrases like "next week Friday" (prefer YYYY-MM-DD when sure)
- childId: exact child first name from roster
- subjectId: exact subject name from roster
- title/theme/topic: short cleaned text
- curriculumLessonId: leave as typed id if looks like an id, else null
If unsure, confidence < 0.5 and value null.`;

  const user = [
    `Children: ${digest.children.join(', ') || '(none)'}`,
    `Subjects: ${digest.subjects.join(', ') || '(none)'}`,
    `Field: ${field}`,
    `User reply: ${text}`,
  ].join('\n');

  const raw = await completeChat({ system, user, temperature: 0, maxTokens: 120 });
  if (!raw) {
    return null;
  }

  const parsed = parseJsonObject(raw);
  if (!parsed || parsed.value == null || parsed.value === '') return null;
  const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
  if (confidence < 0.45) return null;

  let value = String(parsed.value).trim();
  if (field === 'title' || field === 'theme') {
    value = titleCaseWords(value);
  }
  if (field === 'dueAt' || field === 'date' || field === 'startAt') {
    const ymd = resolveFlexibleDay(value, new Date()) || (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
    if (!ymd) return null;
    value = ymd;
  } else if (field === 'childId') {
    const resolved = resolveChildByName(value, roster.children || []);
    if (resolved.ok) value = String(resolved.child.id);
    else return null;
  } else if (field === 'subjectId') {
    const resolved = resolveSubjectByName(value, roster.subjects || []);
    if (resolved.ok) value = String(resolved.subject.id);
    else return null;
  }

  return { value, confidence, usedLlm: true };
}

/**
 * Dispatch an interpreted turn to the matching preparer.
 */
export async function dispatchInterpretedTurn(interpreted, helpers = {}) {
  if (!interpreted || interpreted.preparerKey === 'none') return null;
  if (interpreted.confidence < 0.55) return null;

  const message = interpreted.normalizedMessage || helpers.message;
  const ctx = helpers.ctx;
  const roster = helpers.roster || {};
  const overrides = { ...(interpreted.overrides || {}), ...(helpers.attachments ? { attachments: helpers.attachments } : {}) };
  const opts = { conversationId: helpers.conversationId || null };
  const track = typeof helpers.trackPreview === 'function'
    ? helpers.trackPreview
    : (x) => x;

  const call = async (fn, ...args) => {
    if (typeof fn !== 'function') return null;
    return track(await fn(...args));
  };

  switch (interpreted.preparerKey) {
    case 'practice.generate':
      return call(helpers.preparePracticeGeneration, message, ctx, roster, overrides, opts);
    case 'practice.from_material':
      return call(helpers.preparePracticeFromMaterial, message, ctx, roster, overrides, opts);
    case 'practice.adaptive':
      return call(helpers.prepareAdaptivePractice, message, ctx, roster, overrides, opts);
    case 'tutor.socratic':
      return call(helpers.prepareSocraticTutorAnswer, message, ctx, roster, overrides, opts);
    case 'portfolio.organize':
      return call(helpers.preparePortfolioOrganize, message, ctx, roster, overrides, opts);
    case 'project.theme_week':
      return call(helpers.prepareThemeProjectWeek, message, ctx, roster, overrides, opts);
    case 'curriculum.from_material':
      return call(helpers.prepareCurriculumFromMaterial, message, ctx, roster, overrides);
    case 'curriculum.lesson_from_link':
      return call(helpers.prepareLessonFromLink, message, ctx, roster, overrides);
    case 'curriculum.schedule_next':
      return call(helpers.prepareScheduleNextCurriculumLesson, message, ctx, roster, overrides, opts);
    case 'curriculum.assign':
      return call(helpers.prepareAssignFromCurriculum, message, ctx, roster, overrides, opts);
    case 'learning.suggest':
      return call(helpers.prepareLearningSuggestAnswer, message, ctx, roster, overrides, opts);
    case 'learning.catch_up':
      return call(helpers.prepareCatchUpSuggestion, message, ctx, roster, overrides, opts);
    case 'learning.classes_done':
      return call(helpers.prepareClassesDoneAnswer, message, ctx, roster, overrides, opts);
    case 'learning.parent_summary':
      return call(helpers.prepareParentProgressSummary, message, ctx, roster, overrides, opts);
    case 'learning.explain':
      return call(helpers.prepareExplainRecommendation, message, ctx, roster, overrides, opts);
    case 'assignment.create':
      return call(helpers.prepareAssignmentCreate, message, ctx, roster, overrides);
    case 'assignment.move':
      return call(helpers.prepareAssignmentMove, message, ctx, roster, overrides);
    case 'assignment.update':
      return call(helpers.prepareAssignmentUpdate, message, ctx, roster, overrides);
    case 'assignment.delete':
      return call(helpers.prepareAssignmentDelete, message, ctx, roster, overrides);
    case 'learning_day.create':
      return call(helpers.prepareLearningDayCreate, message, ctx, roster, {
        ...overrides,
        createLesson: true,
      });
    case 'event.create':
      return call(helpers.prepareEventCreate, message, ctx, roster, overrides);
    case 'event.update':
      return call(helpers.prepareEventUpdate, message, ctx, roster, overrides);
    case 'event.delete':
      return call(helpers.prepareEventDelete, message, ctx, roster);
    case 'day_off.create':
      return call(helpers.prepareDayOffCreate, message, ctx, overrides);
    case 'planner.day.replan':
      return call(helpers.prepareDayReplan, message, ctx, roster, overrides, opts);
    case 'planner.plan_week':
      return call(helpers.preparePlanWeek, message, ctx, roster, overrides, opts);
    case 'planner.bulk_reschedule':
      return call(helpers.prepareBulkReschedule, message, ctx, roster, overrides, opts);
    case 'planner.item.move':
      return call(helpers.preparePlannerItemMove, message, ctx, roster, overrides);
    case 'attendance.mark':
      return call(helpers.prepareAttendanceMark, message, ctx, roster, overrides);
    case 'attendance.status':
      return call(helpers.answerAttendanceStatusQuery, message, ctx, roster);
    case 'answer.schedule':
      return call(helpers.prepareTodayScheduleAnswer, message, ctx, roster, opts);
    case 'answer.help':
      return call(helpers.groundedDirectAnswer, message, ctx, roster);
    default:
      return null;
  }
}
