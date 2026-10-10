/**
 * LLM classify + extract fallthrough for doodleRespond.
 * Maps to preparers only — never executes mutations.
 */

import { classifyIntentLLM, triageIntentKeyword } from '../intentClassifier.js';
import { assertDoodleResponse, DOODLE_RESPONSE_TYPES } from './types.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';

const API_KEY = typeof process !== 'undefined' ? (process.env.OPENAI_API_KEY || '') : '';

function createOpenAIClient(baseUrl = 'https://api.openai.com/v1') {
  return {
    chat: {
      completions: {
        create: async (params) => {
          if (!API_KEY || /your-openai-key|replace-me|placeholder|sk-your/i.test(API_KEY)) {
            throw new Error('Client LLM unavailable');
          }
          const response = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${API_KEY}`,
            },
            body: JSON.stringify(params),
          });
          if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
          return response.json();
        },
      },
    },
  };
}

/** Map legacy classifier intents → command preparer keys. */
const INTENT_TO_PREPARER = {
  add_appointment: 'event.create',
  add_activity: 'assignment.create',
  // Soft keywords for assignment edits land here when classifier is uncertain.
  update_assignment: 'assignment.update',
  delete_assignment: 'assignment.delete',
  move_assignment: 'assignment.move',
  delete_event: 'event.delete',
  update_event: 'event.update',
  mark_attendance: 'attendance.mark',
  check_attendance: 'attendance.status',
  add_material: 'material.create_link',
  list_materials: 'answer.list_materials',
  list_children: 'answer.list_children',
  list_subjects: 'answer.list_subjects',
  update_child: 'child.update',
  archive_child: 'child.delete',
  delete_child_permanent: 'child.delete',
  add_subject: 'subject.create',
  delete_subject: 'subject.delete',
  rename_subject: 'subject.update',
  queue_reschedule: 'planner.item.move',
  todays_schedule: 'answer.schedule',
  direct_answer: 'answer.direct',
  progress_summary: 'answer.direct',
  navigate: 'answer.direct',
  suggest_subjects: 'answer.direct',
  suggest_courses: 'answer.direct',
  log_grade: 'answer.direct',
  list_grades: 'answer.direct',
  rename_material: 'answer.direct',
  delete_material: 'answer.direct',
};

const ACTIONABLE_MIN_CONFIDENCE = 0.55;
const ANSWER_MIN_CONFIDENCE = 0.45;

/**
 * Lightweight slot extraction from the user message (no second LLM call).
 * @param {string} message
 * @param {object} roster
 */
export function extractSlotsFromMessage(message, roster = {}) {
  const slots = {};
  const quoted = message.match(/[“"]([^”"]+)[”"]/) || message.match(/'([^']+)'/);
  if (quoted?.[1]) slots.title = quoted[1].trim();

  const forName = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if (forName?.[1] && Array.isArray(roster.children)) {
    const name = forName[1].toLowerCase();
    const child = roster.children.find((c) => {
      const fn = String(c.first_name || c.name || '').toLowerCase();
      return fn === name || fn.startsWith(name);
    });
    if (child) {
      slots.childId = String(child.id);
      slots.childIds = [String(child.id)];
    }
  }

  const inSubject = message.match(/\bin\s+([A-Za-z][A-Za-z0-9 &/-]{1,40})/i);
  if (inSubject?.[1] && Array.isArray(roster.subjects)) {
    const needle = inSubject[1].trim().toLowerCase();
    const subject = roster.subjects.find((s) => {
      const n = String(s.name || s.title || '').toLowerCase();
      return n === needle || n.includes(needle) || needle.includes(n);
    });
    if (subject) slots.subjectId = String(subject.id);
  }

  return slots;
}

/**
 * @param {{
 *   message: string,
 *   context: object,
 *   roster?: object,
 *   conversationId?: string|null,
 * }} input
 * @returns {Promise<{ intent: string|null, preparerKey: string|null, slots: object, confidence: number, usedLlm: boolean }>}
 */
export async function classifyAndExtractForCommands(input) {
  const message = String(input?.message || '').trim();
  const roster = input?.roster || {};
  const ctx = input?.context || {};
  const keyword = triageIntentKeyword(message, { children: roster.children || [] });

  let classified = keyword;
  let usedLlm = false;
  if (keyword.confidence < 0.78 && API_KEY) {
    try {
      const before = `${keyword.intent}:${keyword.confidence}`;
      classified = await classifyIntentLLM(message, { children: roster.children || [] }, createOpenAIClient);
      usedLlm = `${classified?.intent}:${classified?.confidence}` !== before
        || (classified?.intent && classified.intent !== keyword.intent);
      // Count an LLM round-trip whenever we attempted classify beyond keyword skip.
      if (keyword.confidence < 0.78) usedLlm = true;
    } catch (_) {
      classified = keyword;
      usedLlm = false;
    }
  }

  if (usedLlm && ctx.householdId) {
    meterDoodleAiUsage({
      familyId: ctx.householdId,
      conversationId: input?.conversationId || null,
      actionType: 'chatbotSimple',
      idempotencyKey: `doodle-classify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      metadata: { intent: classified.intent, confidence: classified.confidence },
    }).catch(() => {});
  }

  const preparerKey = INTENT_TO_PREPARER[classified.intent] || null;
  const slots = extractSlotsFromMessage(message, roster);
  return {
    intent: classified.intent || null,
    preparerKey,
    slots,
    confidence: typeof classified.confidence === 'number' ? classified.confidence : 0,
    usedLlm,
  };
}

/**
 * Route a classified fallthrough into preparers / answers.
 * Returns null when confidence is too low to act.
 */
export async function applyClassifiedFallthrough(classification, helpers) {
  const {
    message,
    ctx,
    roster,
    attachments = [],
    prepareAssignmentCreate,
    prepareAssignmentMove,
    prepareAssignmentUpdate,
    prepareAssignmentDelete,
    prepareEventCreate,
    prepareLearningDayCreate,
    prepareDayOffCreate,
    preparePlannerItemMove,
    prepareEventUpdate,
    prepareEventDelete,
    prepareAttendanceMark,
    prepareMaterialCreateLink,
    prepareSubjectCreate,
    prepareSubjectUpdate,
    prepareSubjectDelete,
    prepareChildUpdate,
    prepareChildDelete,
    findRosterAnswer,
    answerAttendanceStatusQuery,
    groundedDirectAnswer: groundedFn,
    trackPreview,
  } = helpers;

  if (!classification?.preparerKey) return null;
  const { preparerKey, slots, confidence } = classification;

  if (confidence < ANSWER_MIN_CONFIDENCE) return null;

  if (preparerKey.startsWith('answer.') || confidence < ACTIONABLE_MIN_CONFIDENCE) {
    if (preparerKey === 'attendance.status' && typeof answerAttendanceStatusQuery === 'function') {
      return answerAttendanceStatusQuery(message, ctx, roster);
    }
    if (preparerKey === 'answer.schedule' && typeof helpers.prepareTodayScheduleAnswer === 'function') {
      return helpers.prepareTodayScheduleAnswer(message, ctx, roster, {
        conversationId: helpers.conversationId || null,
      });
    }
    if (
      typeof helpers.prepareCatchUpSuggestion === 'function'
      && /\b(catch\s*up|catching\s+up|make\s+up|falling\s+behind|\bbehind\b)/i.test(message)
    ) {
      return helpers.prepareCatchUpSuggestion(message, ctx, roster, {}, {
        conversationId: helpers.conversationId || null,
      });
    }
    if (
      typeof helpers.prepareParentProgressSummary === 'function'
      && /\b(weekly|progress)\s+(summary|recap|report)|how\s+did\s+.+\s+do\s+this\s+week\b/i.test(message)
    ) {
      return helpers.prepareParentProgressSummary(message, ctx, roster, {}, {
        conversationId: helpers.conversationId || null,
      });
    }
    if (
      typeof helpers.prepareExplainRecommendation === 'function'
      && /\bwhy\s+(did\s+you\s+)?(recommend|suggest)|explain\s+(your\s+)?(recommendation|suggestion)\b/i.test(message)
    ) {
      return helpers.prepareExplainRecommendation(message, ctx, roster, {}, {
        conversationId: helpers.conversationId || null,
      });
    }
    if (
      (preparerKey === 'answer.direct' || preparerKey === 'answer.schedule')
      && typeof helpers.prepareLearningSuggestAnswer === 'function'
      && /\b(what\s+should|suggest|recommend)\b/i.test(message)
    ) {
      return helpers.prepareLearningSuggestAnswer(message, ctx, roster, {}, {
        conversationId: helpers.conversationId || null,
      });
    }
    const find = typeof findRosterAnswer === 'function' ? findRosterAnswer(message, roster) : null;
    if (find) return find;
    if (typeof groundedFn === 'function') {
      const ans = await groundedFn(message, ctx, roster);
      if (ans) return ans;
    }
    return groundedDirectAnswer(message, ctx, roster);
  }

  const overrides = { ...slots, attachments };

  switch (preparerKey) {
    case 'assignment.create':
      if (
        typeof helpers.prepareAssignFromCurriculum === 'function'
        && /\b(from\s+(the\s+)?curriculum|curriculum\s+lesson|next\s+\w+\s+lesson)\b/i.test(message)
      ) {
        return trackPreview(await helpers.prepareAssignFromCurriculum(message, ctx, roster, overrides, {
          conversationId: helpers.conversationId || null,
        }));
      }
      return trackPreview(prepareAssignmentCreate(message, ctx, roster, overrides));
    case 'assignment.move':
      return trackPreview(typeof prepareAssignmentMove === 'function'
        ? await prepareAssignmentMove(message, ctx, roster, overrides)
        : null);
    case 'assignment.update':
      return trackPreview(typeof prepareAssignmentUpdate === 'function'
        ? await prepareAssignmentUpdate(message, ctx, roster, overrides)
        : null);
    case 'assignment.delete':
      return trackPreview(typeof prepareAssignmentDelete === 'function'
        ? await prepareAssignmentDelete(message, ctx, roster, overrides)
        : null);
    case 'event.create':
      return trackPreview(prepareEventCreate(message, ctx, roster, overrides));
    case 'learning_day.create':
      if (
        typeof helpers.prepareScheduleNextCurriculumLesson === 'function'
        && /\bnext\b/i.test(message)
        && /\blesson\b/i.test(message)
      ) {
        return trackPreview(await helpers.prepareScheduleNextCurriculumLesson(message, ctx, roster, overrides, {
          conversationId: helpers.conversationId || null,
        }));
      }
      return trackPreview(prepareLearningDayCreate(message, ctx, roster, {
        ...overrides,
        createLesson: /\blesson\b/i.test(message) && !/\blearning\s*days?\b/i.test(message),
      }));
    case 'day_off.create':
      return trackPreview(await prepareDayOffCreate(message, ctx, overrides));
    case 'planner.item.move':
      return trackPreview(await preparePlannerItemMove(message, ctx, roster, overrides));
    case 'event.update':
      return trackPreview(await prepareEventUpdate(message, ctx, roster, overrides));
    case 'event.delete':
      return trackPreview(await prepareEventDelete(message, ctx, roster));
    case 'attendance.mark':
      return trackPreview(prepareAttendanceMark(message, ctx, roster, overrides));
    case 'material.create_link':
      return trackPreview(prepareMaterialCreateLink(message, ctx, roster, overrides));
    case 'subject.create':
      return trackPreview(await prepareSubjectCreate(message, ctx, roster, overrides));
    case 'subject.update':
      return trackPreview(await prepareSubjectUpdate(message, ctx, roster, overrides));
    case 'subject.delete':
      return trackPreview(await prepareSubjectDelete(message, ctx, roster, overrides));
    case 'child.update':
      return trackPreview(await prepareChildUpdate(message, ctx, roster, overrides));
    case 'child.delete':
      return trackPreview(await prepareChildDelete(message, ctx, roster, overrides));
    default:
      return null;
  }
}

/** Short grounded answer when we cannot map to a mutation. */
export async function groundedDirectAnswer(message) {
  const lower = String(message || '').toLowerCase();
  if (/\b(help|how|what can you|what do you)\b/.test(lower)) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: [
        'I can help with your family’s plan. Try things like:',
        '• “Add homework called Essay in History for Lilly due Friday”',
        '• “Schedule a dentist appointment tomorrow at 2pm for Max”',
        '• “Move History to Thursday”',
        '• “Make Friday a day off”',
        '• “How is Lilly’s attendance this school year?”',
        '• “What should we do today?” or “Catch up on History”',
        '• “Dentist at 11 — move lessons around, keep math in the morning”',
        '• “Plan next week” or “Move all unfinished math to next week”',
        '',
        'I’ll ask for any missing details, then show a preview before saving.',
      ].join('\n'),
    });
  }
  return null;
}
