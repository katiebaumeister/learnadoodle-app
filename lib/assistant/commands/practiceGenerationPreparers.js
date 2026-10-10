/**
 * Phase 4 — generate quiz/worksheet from a curriculum lesson → confirmable assignment.create.
 */

import { DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';
import { ageBandFromChild, completeChatText } from './openaiChatHelper.js';
import {
  findNextUnscheduledLesson,
  findLessonsByQuery,
  loadSubjectCurriculumBundle,
} from './curriculumSequence.js';

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

/** “make a quiz / worksheet / practice questions …” (not “quiz me”). */
export function isPracticeGenerateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\bquiz\s+me\b/.test(lower)) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can)|explain)\b/.test(lower)) return false;
  const wantsArtifact = /\b(quiz|worksheet|practice\s+(questions?|sheet|set)|problem\s+set)\b/.test(lower);
  if (!wantsArtifact) return false;
  return /\b(make|create|generate|build|write|draft)\b/.test(lower);
}

function resolveSubject(message, roster, overrides = {}) {
  if (overrides.subjectId) {
    const s = (roster.subjects || []).find((row) => String(row.id) === String(overrides.subjectId));
    return { ok: true, subjectId: String(overrides.subjectId), subject: s || null };
  }
  const nextSub = message.match(/\bnext\s+([A-Za-z][A-Za-z0-9 &/-]{1,30}?)\s+lesson\b/i);
  const bare = message.match(/\b(history|math|science|reading|english|writing|art|music)\b/i);
  const inMatch = message.match(
    /\b(?:for|in|on)\s+([A-Za-z][A-Za-z0-9 &/-]{1,40}?)(?=\s+(?:for|lesson|quiz|worksheet|practice|due|tomorrow|today)\b|[.,?!]|$)/i,
  );
  const needle = nextSub?.[1] || bare?.[1] || inMatch?.[1];
  if (needle && !/^(a|an|the|me|us|today|tomorrow|quiz|worksheet|practice)$/i.test(needle.trim())) {
    const asChild = resolveChildByName(needle.trim(), roster.children || []);
    if (!asChild.ok) {
      const resolved = resolveSubjectByName(needle.trim(), roster.subjects || []);
      if (resolved.clarification) return { clarification: resolved.clarification };
      if (resolved.ok) {
        return { ok: true, subjectId: String(resolved.subject.id), subject: resolved.subject };
      }
    }
  }
  const subjects = roster.subjects || [];
  if (subjects.length === 1) {
    return { ok: true, subjectId: String(subjects[0].id), subject: subjects[0] };
  }
  return { ok: false };
}

function resolveChild(message, roster, overrides = {}) {
  if (overrides.childIds?.length) {
    return { ok: true, childIds: overrides.childIds.map(String) };
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

function extractTopic(message) {
  const onMatch = message.match(
    /\b(?:on|about|for)\s+([A-Za-z][A-Za-z0-9 &/-]{1,40}?)(?:\s+from\s|\s+for\s+[A-Za-z]|\s+due\b|\s*$)/i,
  );
  if (onMatch) {
    const t = onMatch[1].trim();
    if (!/^(a|an|the|quiz|worksheet|practice|me|us)$/i.test(t)) return t;
  }
  return null;
}

function kindFromMessage(message) {
  const lower = String(message || '').toLowerCase();
  if (/\bworksheet\b/.test(lower)) return 'worksheet';
  if (/\bpractice\b/.test(lower)) return 'practice';
  return 'quiz';
}

/** Deterministic practice body when LLM unavailable. */
export function buildPracticeFallback({ kind, lessonTitle, unitTitle, topic, ageBand }) {
  const focus = lessonTitle || topic || 'this lesson';
  const unit = unitTitle ? ` (${unitTitle})` : '';
  const n = ageBand.band === 'early' ? 3 : 5;
  const lines = [
    `${kind === 'worksheet' ? 'Worksheet' : kind === 'practice' ? 'Practice' : 'Quiz'}: ${focus}${unit}`,
    `Level: ${ageBand.ageLabel}. Answer on paper or in the assignment submission.`,
    '',
  ];
  for (let i = 1; i <= n; i += 1) {
    if (i === 1) lines.push(`${i}. In your own words, what is “${focus}” about?`);
    else if (i === 2) lines.push(`${i}. Give one example related to ${focus}.`);
    else if (i === 3) lines.push(`${i}. What is one common mistake to watch for with ${focus}?`);
    else if (i === 4) lines.push(`${i}. Solve or explain a short problem using ${focus}.`);
    else lines.push(`${i}. Teach someone else one idea from ${focus} in 2–3 sentences.`);
  }
  lines.push('', 'Parent/tutor: review responses before marking complete.');
  return lines.join('\n');
}

async function generatePracticeInstructions({
  kind,
  lesson,
  topic,
  ageBand,
  completeChat,
}) {
  const focus = lesson?.lessonTitle || topic || 'the lesson';
  const system = [
    'You write short homeschool quizzes/worksheets for Learnadoodle.',
    `Audience age: ${ageBand.ageLabel} (${ageBand.band}).`,
    'Output plain text only. No answer key. No markdown headings.',
    `Format: title line, then ${ageBand.band === 'early' ? 3 : 5} numbered questions.`,
    'Questions should check understanding, not require special materials.',
    'Keep under 250 words.',
  ].join('\n');
  const user = [
    `Kind: ${kind}`,
    `Topic/lesson: ${focus}`,
    lesson?.unitTitle ? `Unit: ${lesson.unitTitle}` : null,
    lesson?.objective ? `Objective: ${String(lesson.objective).slice(0, 300)}` : null,
    'Generate the practice set now.',
  ].filter(Boolean).join('\n');

  const complete = typeof completeChat === 'function' ? completeChat : completeChatText;
  const text = await complete({ system, user, temperature: 0.5, maxTokens: 600 });
  if (text) return text;
  return buildPracticeFallback({
    kind,
    lessonTitle: lesson?.lessonTitle,
    unitTitle: lesson?.unitTitle,
    topic,
    ageBand,
  });
}

/**
 * Generate quiz/worksheet → assignment.create ACTION_PREVIEW (confirm-only).
 */
export async function preparePracticeGeneration(
  message,
  ctx,
  roster = {},
  overrides = {},
  opts = {},
) {
  const { prepareAssignmentCreate } = await import('./respond.js');

  const subjectRes = resolveSubject(message, roster, overrides);
  if (subjectRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(subjectRes.clarification), {
      intent: 'practice.generate',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!subjectRes.ok) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject is this quiz/worksheet for?',
      options: (roster.subjects || []).slice(0, 12).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'practice.generate',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const childRes = resolveChild(message, roster, overrides);
  if (childRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(childRes.clarification), {
      intent: 'practice.generate',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, subjectId: subjectRes.subjectId },
    });
  }
  if (!childRes.ok || !childRes.childIds?.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student should get this practice?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'practice.generate',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, subjectId: subjectRes.subjectId },
    });
  }

  const child = childRes.child
    || (roster.children || []).find((c) => String(c.id) === String(childRes.childIds[0]));
  const ageBand = ageBandFromChild(child || {});
  const kind = overrides.kind || kindFromMessage(message);
  const topic = overrides.topicQuery || extractTopic(message);

  const { units, events } = await loadSubjectCurriculumBundle({
    familyId: ctx?.householdId,
    subjectId: subjectRes.subjectId,
    academicYearId: ctx?.schoolYearId || null,
  }, opts);

  let lesson = null;
  if (overrides.curriculumLessonId) {
    for (const unit of units || []) {
      const hit = (unit.lessons || []).find((l) => String(l.id) === String(overrides.curriculumLessonId));
      if (hit) {
        lesson = {
          unitId: String(unit.id),
          unitTitle: unit.title || unit.name || 'Unit',
          lessonId: String(hit.id),
          lessonTitle: hit.title,
          objective: hit.objective || hit.description || null,
        };
        break;
      }
    }
  }

  const wantsNext = /\bnext\b/.test(String(message || '').toLowerCase());
  if (!lesson && wantsNext) {
    lesson = findNextUnscheduledLesson(units, events);
  }
  if (!lesson && topic) {
    const matches = findLessonsByQuery(units, topic);
    if (matches.length === 1) lesson = matches[0];
    else if (matches.length > 1) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: `Which lesson should this ${kind} use?`,
        options: matches.slice(0, 8).map((m) => ({
          id: m.lessonId,
          label: `${m.lessonTitle} — ${m.unitTitle}`,
          value: m.lessonId,
          field: 'curriculumLessonId',
        })),
      }), {
        intent: 'practice.generate',
        field: 'curriculumLessonId',
        originalMessage: message,
        draft: {
          ...overrides,
          subjectId: subjectRes.subjectId,
          childIds: childRes.childIds,
          topicQuery: topic,
          kind,
        },
      });
    }
  }
  if (!lesson) {
    lesson = findNextUnscheduledLesson(units, events);
  }

  const instructions = await generatePracticeInstructions({
    kind,
    lesson,
    topic: topic || lesson?.lessonTitle,
    ageBand,
    completeChat: opts.completeChat,
  });

  meterDoodleAiUsage({
    familyId: ctx?.householdId,
    conversationId: opts.conversationId || null,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-practice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: {
      reason: 'practice_generate',
      kind,
      childId: childRes.childIds[0],
      curriculumLessonId: lesson?.lessonId || null,
    },
  }).catch(() => {});

  const titlePrefix = kind === 'worksheet' ? 'Worksheet' : kind === 'practice' ? 'Practice' : 'Quiz';
  const title = overrides.title
    || `${titlePrefix}: ${lesson?.lessonTitle || topic || 'Practice'}`;

  const preview = prepareAssignmentCreate(message, ctx, roster, {
    ...overrides,
    title,
    subjectId: subjectRes.subjectId,
    childIds: childRes.childIds,
    instructions,
    unitId: lesson?.unitId || null,
    unitTitle: lesson?.unitTitle || null,
    curriculumLessonId: lesson?.lessonId || null,
    lessonLabel: lesson?.lessonTitle || null,
  });

  if (preview?.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    return {
      ...preview,
      message: lesson
        ? `Here’s a ${kind} from “${lesson.lessonTitle}”. Confirm to create the assignment — nothing is saved yet.`
        : `Here’s a ${kind} for ${topic || 'practice'}. Confirm to create the assignment — nothing is saved yet.`,
    };
  }
  if (preview?.clarification) {
    return {
      ...preview,
      clarification: {
        ...preview.clarification,
        intent: 'practice.generate',
        draft: {
          ...(preview.clarification.draft || {}),
          subjectId: subjectRes.subjectId,
          childIds: childRes.childIds,
          title,
          instructions,
          kind,
          unitId: lesson?.unitId || null,
          unitTitle: lesson?.unitTitle || null,
          curriculumLessonId: lesson?.lessonId || null,
          lessonLabel: lesson?.lessonTitle || null,
        },
      },
    };
  }
  return preview;
}
