/**
 * Phase 4 — adaptive practice from struggles / unfinished work → confirmable assignment.
 */

import { DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';
import { ageBandFromChild } from './openaiChatHelper.js';
import { gatherLearningContinuityContext, rankContinuityRecommendations } from './learningContinuityContext.js';
import { buildPracticeFallback } from './practiceGenerationPreparers.js';
import { completeChatText } from './openaiChatHelper.js';

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

/** “adaptive / easier / harder practice …” */
export function isAdaptivePracticeIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can)|explain)\b/.test(lower)) return false;
  if (/\bquiz\s+me\b/.test(lower)) return false;
  if (/\b(make|create|generate)\s+(a\s+)?(quiz|worksheet)\b/.test(lower) && !/\b(adaptive|easier|harder)\b/.test(lower)) {
    return false;
  }
  return (
    /\badaptive\s+practice\b/.test(lower)
    || /\b(easier|harder|review)\s+practice\b/.test(lower)
    || (/\bpractice\b/.test(lower) && /\b(based\s+on|from)\s+(struggles?|mistakes?|gaps?|performance)\b/.test(lower))
    || (/\b(easier|harder)\b/.test(lower) && /\b(practice|problems?|questions?)\b/.test(lower))
  );
}

function difficultyFromMessage(message) {
  const lower = String(message || '').toLowerCase();
  if (/\bharder|challenge|stretch\b/.test(lower)) return 'harder';
  if (/\beasier|simpler|scaffold|review\b/.test(lower)) return 'easier';
  return 'adaptive';
}

function resolveChild(message, roster, overrides = {}) {
  if (overrides.childIds?.length) {
    const c = (roster.children || []).find((row) => String(row.id) === String(overrides.childIds[0]));
    return { ok: true, childIds: overrides.childIds.map(String), child: c || null };
  }
  const forMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if (forMatch && !/^(today|tomorrow|math|history|science)$/i.test(forMatch[1])) {
    const resolved = resolveChildByName(forMatch[1], roster.children || []);
    if (resolved.clarification) return { clarification: resolved.clarification };
    if (resolved.ok) return { ok: true, childIds: [String(resolved.child.id)], child: resolved.child };
  }
  const kids = roster.children || [];
  if (kids.length === 1) return { ok: true, childIds: [String(kids[0].id)], child: kids[0] };
  return { ok: false, childIds: [] };
}

/**
 * Adaptive practice using continuity signals → assignment.create preview.
 */
export async function prepareAdaptivePractice(
  message,
  ctx,
  roster = {},
  overrides = {},
  opts = {},
) {
  const { prepareAssignmentCreate } = await import('./respond.js');

  const childRes = resolveChild(message, roster, overrides);
  if (childRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(childRes.clarification), {
      intent: 'practice.adaptive',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!childRes.ok || !childRes.childIds?.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student should get adaptive practice?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'practice.adaptive',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  let subjectId = overrides.subjectId || null;
  const bare = message.match(/\b(history|math|science|reading|english|writing)\b/i);
  const onMatch = message.match(/\bon\s+([A-Za-z][A-Za-z0-9 &/-]{1,40})/i);
  const needle = onMatch?.[1] || bare?.[1];
  if (!subjectId && needle) {
    const resolved = resolveSubjectByName(needle.trim(), roster.subjects || []);
    if (resolved.ok) subjectId = String(resolved.subject.id);
  }

  const continuity = opts.continuityBundle || await gatherLearningContinuityContext({
    familyId: ctx?.householdId,
    childId: childRes.childIds[0],
    academicYearId: ctx?.schoolYearId || null,
  });
  const recs = rankContinuityRecommendations(continuity, roster);
  const top = recs.find((r) => r.kind === 'review' || r.kind === 'assignment') || recs[0] || null;

  if (!subjectId && top?.subjectId) subjectId = String(top.subjectId);
  if (!subjectId && (roster.subjects || []).length === 1) {
    subjectId = String(roster.subjects[0].id);
  }
  if (!subjectId) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject should adaptive practice focus on?',
      options: (roster.subjects || []).slice(0, 12).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'practice.adaptive',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides, childIds: childRes.childIds },
    });
  }

  const subject = (roster.subjects || []).find((s) => String(s.id) === String(subjectId));
  const subjectName = subject?.name || subject?.title || 'Subject';
  let difficulty = overrides.difficulty || difficultyFromMessage(message);
  if (difficulty === 'adaptive') {
    // Default: easier when struggles/needs-help; harder when ahead/on track with no struggles
    const struggle = recs.some((r) => r.kind === 'review' || /needs help|overdue|struggle/i.test(r.why || ''));
    difficulty = struggle ? 'easier' : 'harder';
  }

  const topic = top?.title || subjectName;
  const why = top?.why || `focus on ${subjectName}`;
  const ageBand = ageBandFromChild(childRes.child || {});

  const system = [
    'You write short adaptive practice sets for homeschool.',
    `Difficulty: ${difficulty}. Age: ${ageBand.ageLabel}.`,
    'Plain text only. No answer key. 4–5 numbered questions.',
    difficulty === 'easier'
      ? 'Scaffold: start concrete, use hints in parentheses, smaller steps.'
      : 'Stretch: multi-step, explain-why, connect ideas.',
    'Under 220 words.',
  ].join('\n');
  const user = `Topic: ${topic}\nWhy: ${why}\nSubject: ${subjectName}\nGenerate the practice set.`;

  const complete = typeof opts.completeChat === 'function' ? opts.completeChat : completeChatText;
  let instructions = await complete({ system, user, temperature: 0.45, maxTokens: 550 });
  if (!instructions) {
    instructions = [
      buildPracticeFallback({
        kind: 'practice',
        lessonTitle: topic,
        unitTitle: subjectName,
        topic,
        ageBand,
      }),
      '',
      `Adaptive note: ${difficulty} set because ${why}.`,
    ].join('\n');
  } else {
    instructions = `${instructions}\n\nAdaptive note: ${difficulty} practice — ${why}.`;
  }

  meterDoodleAiUsage({
    familyId: ctx?.householdId,
    conversationId: opts.conversationId || null,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-adaptive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: { reason: 'adaptive_practice', difficulty, subjectId, why },
  }).catch(() => {});

  const title = overrides.title
    || `Practice (${difficulty}): ${String(topic).slice(0, 48)}`;

  const preview = prepareAssignmentCreate(message, ctx, roster, {
    ...overrides,
    title,
    subjectId,
    childIds: childRes.childIds,
    instructions,
    curriculumLessonId: top?.assignmentId ? null : overrides.curriculumLessonId || null,
    lessonLabel: topic,
  });

  if (preview?.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    return {
      ...preview,
      message: `Adaptive ${difficulty} practice for ${subjectName} — ${why}. Confirm to create — nothing is saved yet.`,
    };
  }
  if (preview?.clarification) {
    return {
      ...preview,
      clarification: {
        ...preview.clarification,
        intent: 'practice.adaptive',
        draft: {
          ...(preview.clarification.draft || {}),
          subjectId,
          childIds: childRes.childIds,
          title,
          instructions,
          difficulty,
        },
      },
    };
  }
  return preview;
}
