/**
 * Phase 3 — schedule next curriculum lesson / assign from curriculum (confirm-only).
 */

import { DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';
import { prepareLearningDayCreate } from './intentPreparers.js';
import {
  findNextUnscheduledLesson,
  findLessonsByQuery,
  loadSubjectCurriculumBundle,
} from './curriculumSequence.js';

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

function meter(ctx, conversationId, reason) {
  if (!ctx?.householdId) return;
  meterDoodleAiUsage({
    familyId: ctx.householdId,
    conversationId: conversationId || null,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-curr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: { reason },
  }).catch(() => {});
}

/** “create/schedule next Math lesson for Emma” */
export function isScheduleNextCurriculumLessonIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can)|explain)\b/.test(lower)) return false;
  if (!/\blesson\b/.test(lower)) return false;
  if (!/\bnext\b/.test(lower)) return false;
  return (
    /\b(create|add|schedule|make|plan|book)\b/.test(lower)
    || /\bschedule\s+(the\s+)?next\b/.test(lower)
    || /\bnext\s+\w+\s+lesson\b/.test(lower)
  );
}

/** “assign Emma fractions from curriculum” / “create assignment from next History lesson” */
export function isAssignFromCurriculumIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can)|explain)\b/.test(lower)) return false;
  if (/\b(from\s+(the\s+)?curriculum|curriculum\s+lesson|from\s+classwork)\b/.test(lower)) {
    return /\b(assign|assignment|practice|worksheet|homework)\b/.test(lower)
      || /\b(create|add|make)\b/.test(lower);
  }
  if (/\b(assign|create\s+assignment|give)\b/.test(lower) && /\bnext\b/.test(lower) && /\blesson\b/.test(lower)) {
    return true;
  }
  if (/\bassign\b/.test(lower) && /\b(practice|worksheet|homework)\b/.test(lower) && /\b(from|on)\b/.test(lower)) {
    return true;
  }
  return false;
}

function resolveSubject(message, roster, overrides = {}) {
  if (overrides.subjectId) {
    const s = (roster.subjects || []).find((row) => String(row.id) === String(overrides.subjectId));
    return { ok: true, subjectId: String(overrides.subjectId), subject: s || null };
  }
  const subjects = roster.subjects || [];
  const nextSub = message.match(/\bnext\s+([A-Za-z][A-Za-z0-9 &/-]{1,30}?)\s+lesson\b/i);
  const bare = message.match(/\b(history|math|science|reading|english|writing|art|music)\b/i);
  const inMatch = message.match(
    /\b(?:for|in|on)\s+([A-Za-z][A-Za-z0-9 &/-]{1,40}?)(?=\s+(?:for|today|tomorrow|next|lesson|from|practice|assignment|homework|worksheet)\b|[.,?!]|$)/i,
  );
  const needle = nextSub?.[1] || bare?.[1] || inMatch?.[1];
  if (needle && !/^(today|tomorrow|next|the|a|an|me|us|emma)$/i.test(needle.trim())) {
    // Avoid treating learner names as subjects when “for Emma” already matched
    const asChild = resolveChildByName(needle.trim(), roster.children || []);
    if (!asChild.ok) {
      const resolved = resolveSubjectByName(needle.trim(), subjects);
      if (resolved.clarification) return { clarification: resolved.clarification };
      if (resolved.ok) {
        return {
          ok: true,
          subjectId: String(resolved.subject.id),
          subject: resolved.subject,
        };
      }
    }
  }
  if (subjects.length === 1) {
    return { ok: true, subjectId: String(subjects[0].id), subject: subjects[0] };
  }
  return { ok: false };
}

function resolveChild(message, roster, overrides = {}) {
  if (overrides.childIds?.length) {
    return { ok: true, childIds: overrides.childIds.map(String) };
  }
  const possessive = message.match(/\b([A-Za-z][A-Za-z'-]*)'s\s+next\b/i);
  const forMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  const needle = possessive?.[1] || forMatch?.[1];
  if (needle && !/^(today|tomorrow|this|that|me|us|math|history|science)\b/i.test(needle)) {
    const resolved = resolveChildByName(needle, roster.children || []);
    if (resolved.clarification) return { clarification: resolved.clarification };
    if (resolved.ok) return { ok: true, childIds: [String(resolved.child.id)] };
  }
  const kids = roster.children || [];
  if (kids.length === 1) return { ok: true, childIds: [String(kids[0].id)] };
  return { ok: false, childIds: [] };
}

function extractTopicQuery(message, roster = {}) {
  const lower = String(message || '');
  // “assign Emma fractions practice …” → topic = fractions when Emma is a child
  const assignTopic = lower.match(
    /\bassign\s+([A-Za-z][A-Za-z'-]*)\s+([A-Za-z][A-Za-z0-9 &/-]{1,40}?)\s+(?:practice|worksheet|homework)\b/i,
  );
  if (assignTopic) {
    const asChild = resolveChildByName(assignTopic[1], roster.children || []);
    if (asChild.ok || /^(me|us)$/i.test(assignTopic[1])) {
      return assignTopic[2].trim();
    }
  }
  const practice = lower.match(
    /\b(?:practice|worksheet|homework)\s+(?:on\s+|about\s+)?([A-Za-z][A-Za-z0-9 &/-]{1,40})/i,
  );
  const quoted = lower.match(/["']([^"']{2,60})["']/);
  if (quoted) return quoted[1].trim();
  if (practice) {
    const t = practice[1].trim();
    if (!/^(from|the|a|an)$/i.test(t)) return t;
  }
  const fromTopic = lower.match(
    /\b(?:on|about)\s+([A-Za-z][A-Za-z0-9 &/-]{1,40}?)(?:\s+from\s+(?:the\s+)?curriculum)?\b/i,
  );
  if (fromTopic) {
    const t = fromTopic[1].trim();
    if (!/^(the\s+)?curriculum|classwork|today|tomorrow$/i.test(t)) return t;
  }
  return null;
}

/**
 * Schedule the next unscheduled curriculum lesson as a learning day (preview).
 */
export async function prepareScheduleNextCurriculumLesson(
  message,
  ctx,
  roster = {},
  overrides = {},
  opts = {},
) {
  const subjectRes = resolveSubject(message, roster, overrides);
  if (subjectRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(subjectRes.clarification), {
      intent: 'curriculum.schedule_next',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!subjectRes.ok) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject’s next lesson should I schedule?',
      options: (roster.subjects || []).slice(0, 12).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'curriculum.schedule_next',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const childRes = resolveChild(message, roster, overrides);
  if (childRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(childRes.clarification), {
      intent: 'curriculum.schedule_next',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, subjectId: subjectRes.subjectId },
    });
  }
  if (!childRes.ok || !childRes.childIds?.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student is this next lesson for?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'curriculum.schedule_next',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, subjectId: subjectRes.subjectId },
    });
  }

  const { units, events } = await loadSubjectCurriculumBundle({
    familyId: ctx?.householdId,
    subjectId: subjectRes.subjectId,
    academicYearId: ctx?.schoolYearId || null,
  }, opts);

  meter(ctx, opts.conversationId, 'curriculum_schedule_next');

  const next = findNextUnscheduledLesson(units, events);
  const subjectName = subjectRes.subject?.name || subjectRes.subject?.title || 'Subject';

  if (!next) {
    if (!(units || []).length) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.ANSWER,
        message: `${subjectName} has no curriculum sequence yet. Add units in Classwork, or ask me to create a new lesson day (that can add Lesson 1).`,
        links: [
          { label: `Open ${subjectName}`, href: `/learning?subject=${subjectRes.subjectId}` },
          { label: 'Open Planner', href: '/planner?view=board' },
        ],
      });
    }
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: `Every lesson in ${subjectName} already has a planner link. Create a brand-new lesson day instead?`,
      options: [
        {
          id: 'create-new',
          label: 'Create new lesson day',
          value: 'create_new_lesson',
          field: 'recommendAction',
        },
      ],
    }), {
      intent: 'curriculum.schedule_next',
      field: 'recommendAction',
      originalMessage: message,
      draft: {
        subjectId: subjectRes.subjectId,
        childIds: childRes.childIds,
        createLesson: true,
        ...overrides,
      },
    });
  }

  const preview = prepareLearningDayCreate(message, ctx, roster, {
    ...overrides,
    subjectId: subjectRes.subjectId,
    childIds: childRes.childIds,
    createLesson: false,
    curriculumLessonId: next.lessonId,
    unitId: next.unitId,
    unitTitle: next.unitTitle,
    lessonTitle: next.lessonTitle,
    title: next.lessonTitle,
    durationMinutes: overrides.durationMinutes || next.minutes || null,
    description: overrides.description
      || (next.objective ? String(next.objective).slice(0, 400) : null),
  });

  if (preview?.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    return {
      ...preview,
      message: `Schedule next ${subjectName} lesson: “${next.lessonTitle}” (${next.unitTitle}). Confirm to add it to the planner — nothing is saved yet.`,
    };
  }
  // Date clarification etc. — keep curriculum draft fields
  if (preview?.clarification) {
    return {
      ...preview,
      clarification: {
        ...preview.clarification,
        intent: 'curriculum.schedule_next',
        draft: {
          ...(preview.clarification.draft || {}),
          subjectId: subjectRes.subjectId,
          childIds: childRes.childIds,
          createLesson: false,
          curriculumLessonId: next.lessonId,
          unitId: next.unitId,
          unitTitle: next.unitTitle,
          lessonTitle: next.lessonTitle,
          title: next.lessonTitle,
        },
      },
    };
  }
  return preview;
}

/**
 * Create an assignment linked to a curriculum lesson (preview).
 */
export async function prepareAssignFromCurriculum(
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
      intent: 'curriculum.assign',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!subjectRes.ok) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject should this curriculum assignment come from?',
      options: (roster.subjects || []).slice(0, 12).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'curriculum.assign',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const childRes = resolveChild(message, roster, overrides);
  if (childRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(childRes.clarification), {
      intent: 'curriculum.assign',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, subjectId: subjectRes.subjectId },
    });
  }
  if (!childRes.ok || !childRes.childIds?.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student should get this assignment?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'curriculum.assign',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, subjectId: subjectRes.subjectId },
    });
  }

  const { units, events } = await loadSubjectCurriculumBundle({
    familyId: ctx?.householdId,
    subjectId: subjectRes.subjectId,
    academicYearId: ctx?.schoolYearId || null,
  }, opts);

  meter(ctx, opts.conversationId, 'curriculum_assign');

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

  const topic = overrides.topicQuery || extractTopicQuery(message, roster);
  const wantsNext = /\bnext\b/.test(String(message || '').toLowerCase()) && !topic;
  if (!lesson && wantsNext) {
    lesson = findNextUnscheduledLesson(units, events);
  }

  if (!lesson && topic) {
    const matches = findLessonsByQuery(units, topic);
    if (matches.length === 1) {
      lesson = matches[0];
    } else if (matches.length > 1) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: `Which lesson matches “${topic}”?`,
        options: matches.slice(0, 8).map((m) => ({
          id: m.lessonId,
          label: `${m.lessonTitle} — ${m.unitTitle}`,
          value: m.lessonId,
          field: 'curriculumLessonId',
        })),
      }), {
        intent: 'curriculum.assign',
        field: 'curriculumLessonId',
        originalMessage: message,
        draft: {
          ...overrides,
          subjectId: subjectRes.subjectId,
          childIds: childRes.childIds,
          topicQuery: topic,
        },
      });
    }
  }

  if (!lesson) {
    const next = findNextUnscheduledLesson(units, events);
    const lessonOptions = [];
    if (next) {
      lessonOptions.push({
        id: next.lessonId,
        label: `Next: ${next.lessonTitle}`,
        value: next.lessonId,
        field: 'curriculumLessonId',
      });
    }
    for (const u of units || []) {
      for (const l of (u.lessons || []).slice(0, 4)) {
        if (!l?.id || lessonOptions.some((o) => o.value === String(l.id))) continue;
        lessonOptions.push({
          id: String(l.id),
          label: `${l.title} — ${u.title || 'Unit'}`,
          value: String(l.id),
          field: 'curriculumLessonId',
        });
        if (lessonOptions.length >= 8) break;
      }
      if (lessonOptions.length >= 8) break;
    }
    if (lessonOptions.length) {
      return withClarificationMeta(assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which curriculum lesson should become an assignment?',
        options: lessonOptions,
      }), {
        intent: 'curriculum.assign',
        field: 'curriculumLessonId',
        originalMessage: message,
        draft: {
          ...overrides,
          subjectId: subjectRes.subjectId,
          childIds: childRes.childIds,
        },
      });
    }
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: 'I couldn’t find a matching curriculum lesson. Add units in Classwork, or create a regular assignment by title.',
      links: [
        { label: 'Open subject', href: `/learning?subject=${subjectRes.subjectId}` },
      ],
    });
  }

  const preview = prepareAssignmentCreate(message, ctx, roster, {
    ...overrides,
    title: overrides.title || lesson.lessonTitle,
    subjectId: subjectRes.subjectId,
    childIds: childRes.childIds,
    unitId: lesson.unitId,
    unitTitle: lesson.unitTitle,
    curriculumLessonId: lesson.lessonId,
    lessonLabel: lesson.lessonTitle,
    instructions: overrides.instructions
      || (lesson.objective ? String(lesson.objective).slice(0, 800) : ''),
  });

  if (preview?.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    return {
      ...preview,
      message: `Assign “${lesson.lessonTitle}” from ${lesson.unitTitle}. Confirm to create — nothing is saved yet.`,
    };
  }
  if (preview?.clarification) {
    return {
      ...preview,
      clarification: {
        ...preview.clarification,
        intent: preview.clarification.intent === 'assignment.create'
          ? 'curriculum.assign'
          : preview.clarification.intent,
        draft: {
          ...(preview.clarification.draft || {}),
          subjectId: subjectRes.subjectId,
          childIds: childRes.childIds,
          unitId: lesson.unitId,
          unitTitle: lesson.unitTitle,
          curriculumLessonId: lesson.lessonId,
          lessonLabel: lesson.lessonTitle,
          title: overrides.title || lesson.lessonTitle,
          instructions: overrides.instructions
            || (lesson.objective ? String(lesson.objective).slice(0, 800) : ''),
        },
      },
    };
  }
  return preview;
}
