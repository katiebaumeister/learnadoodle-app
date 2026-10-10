/**
 * Build from material — units/lessons from docs, quiz from material, lesson from video/link.
 * Confirm-before-mutate: curriculum opens the import editor; practice returns assignment preview.
 */

import { DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import { resolveMaterialFromUserMessage, extractHttpUrl } from '../materialParse.js';
import { fetchMaterialsForChat } from '../materialChatActions.js';
import { ageBandFromChild, completeChatText } from './openaiChatHelper.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';
import { titleCaseWords } from './conversationalInterpret.js';
import {
  isCurriculumFromMaterialIntent,
  isPracticeFromMaterialIntent,
  isLessonFromLinkIntent,
} from './materialBuildIntents.js';

export {
  isCurriculumFromMaterialIntent,
  isPracticeFromMaterialIntent,
  isLessonFromLinkIntent,
};

async function loadCurriculumClient() {
  try {
    return await import('../../services/curriculumClient.js');
  } catch (_) {
    return null;
  }
}

function canDispatchUnitsEditor() {
  return typeof window !== 'undefined' && typeof window.dispatchEvent === 'function';
}

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

function isYoutubeUrl(url) {
  return /youtu\.?be|youtube\.com/i.test(String(url || ''));
}

function resolveSubject(message, roster, overrides = {}, ctx = {}) {
  if (overrides.subjectId) {
    const s = (roster.subjects || []).find((row) => String(row.id) === String(overrides.subjectId));
    return { ok: true, subjectId: String(overrides.subjectId), subject: s || null };
  }
  if (ctx.selectedSubjectId) {
    const s = (roster.subjects || []).find((row) => String(row.id) === String(ctx.selectedSubjectId));
    if (s) return { ok: true, subjectId: String(s.id), subject: s };
  }
  const bare = message.match(/\b(history|math|science|reading|english|writing|art|music)\b/i);
  const inMatch = message.match(
    /\b(?:for|in|on)\s+([A-Za-z][A-Za-z0-9 &/-]{1,40}?)(?=\s+(?:for|from|using|based|due|lesson|quiz|unit)\b|[.,?!]|$)/i,
  );
  const needle = bare?.[1] || inMatch?.[1];
  if (needle && !/^(a|an|the|me|this|that|material|doc|pdf|video)$/i.test(needle.trim())) {
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
  if (forMatch && !/^(today|tomorrow|math|history|science|this)$/i.test(forMatch[1])) {
    const resolved = resolveChildByName(forMatch[1], roster.children || []);
    if (resolved.clarification) return { clarification: resolved.clarification };
    if (resolved.ok) return { ok: true, childIds: [String(resolved.child.id)], child: resolved.child };
  }
  const kids = roster.children || [];
  if (kids.length === 1) return { ok: true, childIds: [String(kids[0].id)], child: kids[0] };
  return { ok: false, childIds: [] };
}

function materialOptions(materials) {
  return (materials || []).slice(0, 10).map((m) => ({
    id: String(m.id),
    label: m.title || 'Untitled',
    value: String(m.id),
    field: 'materialId',
  }));
}

async function loadAndResolveMaterial(message, familyId, overrides = {}) {
  if (overrides.materialId) {
    return { ok: true, material: { id: overrides.materialId, title: overrides.materialTitle || 'Material' } };
  }
  const { materials, error } = await fetchMaterialsForChat(familyId);
  if (error) return { ok: false, error: error.message || String(error) };
  if (!materials.length) {
    return { ok: false, empty: true };
  }
  const resolved = resolveMaterialFromUserMessage(message, materials);
  if (resolved.ok) return { ok: true, material: resolved.material, materials };
  if (resolved.candidates?.length) {
    return { ok: false, ambiguous: true, candidates: resolved.candidates, materials };
  }
  return { ok: false, needPick: true, materials };
}

async function openUnitsImport({ subjectId, subjectName, materialId, childIds, academicYearId, method = 'upload' }) {
  if (!canDispatchUnitsEditor()) return false;
  try {
    const { dispatchOpenSubjectUnitsEditor } = await import('../../subjectUnitsEditor.js');
    return dispatchOpenSubjectUnitsEditor({
      subjectId,
      subjectName,
      method,
      initialMaterialId: materialId || null,
      autoContinueOnOpen: Boolean(materialId),
      childIds: childIds || [],
      academicYearId: academicYearId || null,
    });
  } catch (_) {
    return false;
  }
}

/**
 * Open subject curriculum import (parse doc → units/lessons draft → edit → save).
 */
export async function prepareCurriculumFromMaterial(message, ctx, roster, overrides = {}) {
  const subjectRes = resolveSubject(message, roster, overrides, ctx);
  if (subjectRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(subjectRes.clarification), {
      intent: 'curriculum.from_material',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!subjectRes.ok) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject should these units belong to?',
      options: (roster.subjects || []).slice(0, 12).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'curriculum.from_material',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const matRes = await loadAndResolveMaterial(message, ctx.householdId, overrides);
  if (matRes.error) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: matRes.error,
      recoverable: true,
    });
  }
  if (matRes.empty) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: 'No materials in the library yet. Add a doc or PDF under Materials, then ask me again — or use Create from syllabus on Classwork to upload one.',
    });
  }
  if (matRes.ambiguous || matRes.needPick) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: matRes.ambiguous
        ? 'Which material should I build units from?'
        : 'Which material should I use to create units and lessons?',
      options: materialOptions(matRes.candidates || matRes.materials),
    }), {
      intent: 'curriculum.from_material',
      field: 'materialId',
      originalMessage: message,
      draft: {
        ...overrides,
        subjectId: subjectRes.subjectId,
      },
    });
  }

  const childRes = resolveChild(message, roster, overrides);
  const subjectName = subjectRes.subject?.name || subjectRes.subject?.title || 'Subject';
  const opened = await openUnitsImport({
    subjectId: subjectRes.subjectId,
    subjectName,
    materialId: matRes.material?.id,
    childIds: childRes.childIds || ctx.selectedChildIds || [],
    academicYearId: ctx.schoolYearId || null,
    method: 'upload',
  });

  meterDoodleAiUsage({
    familyId: ctx?.householdId,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-curriculum-material-${Date.now()}`,
    metadata: {
      reason: 'curriculum_from_material',
      subjectId: subjectRes.subjectId,
      materialId: matRes.material?.id || null,
    },
  }).catch(() => {});

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: opened
      ? `Opening the curriculum builder for ${subjectName}${matRes.material?.title ? ` using “${matRes.material.title}”` : ''}. Review the units and lessons, then save when ready.`
      : `I can build units from “${matRes.material?.title || 'that material'}” on web — open Learning → ${subjectName} → Classwork → Create from syllabus.`,
    links: [{
      label: subjectName,
      href: `/learning?subject=${subjectRes.subjectId}`,
      entityType: 'subject',
      entityId: String(subjectRes.subjectId),
    }],
  });
}

function kindFromMessage(message) {
  const lower = String(message || '').toLowerCase();
  if (/\bworksheet\b/.test(lower)) return 'worksheet';
  if (/\bpractice\b/.test(lower)) return 'practice';
  return 'quiz';
}

function excerptFromParseDraft(draft) {
  const units = draft?.units || draft?.unit ? [draft.unit || draft.units?.[0]].filter(Boolean) : (draft?.units || []);
  const list = Array.isArray(draft?.units) ? draft.units : units;
  const lines = [];
  for (const unit of list.slice(0, 6)) {
    const title = unit?.title || unit?.name;
    if (title) lines.push(`Unit: ${title}`);
    const lessons = unit?.lessons || [];
    for (const lesson of lessons.slice(0, 8)) {
      const lt = lesson?.title || lesson?.lessonTitle;
      if (lt) lines.push(`- ${lt}`);
      if (lesson?.objective) lines.push(`  objective: ${String(lesson.objective).slice(0, 160)}`);
    }
  }
  return lines.join('\n').slice(0, 3500);
}

/**
 * Quiz/worksheet from a library material → confirmable assignment.create.
 */
export async function preparePracticeFromMaterial(message, ctx, roster, overrides = {}, opts = {}) {
  const subjectRes = resolveSubject(message, roster, overrides, ctx);
  if (subjectRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(subjectRes.clarification), {
      intent: 'practice.from_material',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!subjectRes.ok) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject is this practice for?',
      options: (roster.subjects || []).slice(0, 12).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'practice.from_material',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const childRes = resolveChild(message, roster, overrides);
  if (childRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(childRes.clarification), {
      intent: 'practice.from_material',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, subjectId: subjectRes.subjectId },
    });
  }
  if (!childRes.ok || !childRes.childIds?.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student should this be for?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'practice.from_material',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, subjectId: subjectRes.subjectId },
    });
  }

  const matRes = await loadAndResolveMaterial(message, ctx.householdId, overrides);
  if (matRes.error) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: matRes.error,
      recoverable: true,
    });
  }
  if (matRes.empty) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: 'No materials found. Add a document under Materials first, then ask for a quiz based on it.',
    });
  }
  if (matRes.ambiguous || matRes.needPick) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which material should the quiz use?',
      options: materialOptions(matRes.candidates || matRes.materials),
    }), {
      intent: 'practice.from_material',
      field: 'materialId',
      originalMessage: message,
      draft: {
        ...overrides,
        subjectId: subjectRes.subjectId,
        childIds: childRes.childIds,
      },
    });
  }

  const kind = overrides.kind || kindFromMessage(message);
  const material = matRes.material;
  const subjectName = subjectRes.subject?.name || subjectRes.subject?.title || 'Subject';
  const child = (roster.children || []).find((c) => String(c.id) === String(childRes.childIds[0])) || {};
  const ageBand = ageBandFromChild(child);

  let sourceExcerpt = [
    material.title ? `Title: ${material.title}` : null,
    material.notes ? String(material.notes).slice(0, 2000) : null,
    material.description ? String(material.description).slice(0, 800) : null,
    material.provider_url || material.url || null,
  ].filter(Boolean).join('\n');

  try {
    const curriculumClient = await loadCurriculumClient();
    if (curriculumClient?.parsePlainText) {
      const { data } = await curriculumClient.parsePlainText({
        subject_id: subjectRes.subjectId,
        family_id: ctx.householdId,
        subject_name: subjectName,
        raw_text: '',
        material_id: material.id,
        source_title: material.title || `${subjectName} material`,
      });
      const excerpt = excerptFromParseDraft(data);
      if (excerpt) sourceExcerpt = `${sourceExcerpt}\n\nExtracted outline:\n${excerpt}`.slice(0, 4000);
    } else if (curriculumClient?.buildCurriculum) {
      const { data } = await curriculumClient.buildCurriculum({
        mode: 'material',
        material_id: material.id,
        student_ids: childRes.childIds,
        constraints: { subject_name: subjectName },
      });
      const excerpt = excerptFromParseDraft(data);
      if (excerpt) sourceExcerpt = `${sourceExcerpt}\n\n${excerpt}`.slice(0, 4000);
    }
  } catch (_) {
    /* use metadata only */
  }

  const system = [
    'You write short homeschool quizzes/worksheets for Learnadoodle from source material.',
    `Audience age: ${ageBand.ageLabel} (${ageBand.band}).`,
    'Output plain text only. No answer key. No markdown headings.',
    `Format: title line, then ${ageBand.band === 'early' ? 3 : 5} numbered questions grounded in the source.`,
    'Keep under 280 words.',
  ].join('\n');
  const user = [
    `Kind: ${kind}`,
    `Subject: ${subjectName}`,
    `Material: ${material.title || 'Untitled'}`,
    'Source:',
    sourceExcerpt || '(limited metadata — invent reasonable practice on the material topic)',
    'Generate the practice set now.',
  ].join('\n');

  const complete = typeof opts.completeChat === 'function' ? opts.completeChat : completeChatText;
  let instructions = await complete({ system, user, temperature: 0.45, maxTokens: 700 });
  if (!instructions) {
    const focus = material.title || subjectName;
    instructions = [
      `${kind === 'worksheet' ? 'Worksheet' : 'Quiz'}: ${focus}`,
      `Level: ${ageBand.ageLabel}.`,
      '',
      `1. In your own words, what is “${focus}” about?`,
      `2. List two important ideas from this material.`,
      `3. Give one example related to ${focus}.`,
      `4. What question would you ask to check understanding of ${focus}?`,
      `5. Teach someone else one idea from ${focus} in 2–3 sentences.`,
    ].join('\n');
  }

  meterDoodleAiUsage({
    familyId: ctx?.householdId,
    conversationId: opts.conversationId || null,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-practice-material-${Date.now()}`,
    metadata: {
      reason: 'practice_from_material',
      materialId: material.id,
      subjectId: subjectRes.subjectId,
      kind,
    },
  }).catch(() => {});

  const titlePrefix = kind === 'worksheet' ? 'Worksheet' : kind === 'practice' ? 'Practice' : 'Quiz';
  const title = overrides.title || titleCaseWords(`${titlePrefix}: ${material.title || subjectName}`);

  const { prepareAssignmentCreate } = await import('./respond.js');
  const preview = prepareAssignmentCreate(message, ctx, roster, {
    ...overrides,
    title,
    subjectId: subjectRes.subjectId,
    childIds: childRes.childIds,
    instructions,
    materialId: material.id,
  });

  if (preview?.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    return {
      ...preview,
      message: `Here’s a ${kind} based on “${material.title || 'your material'}”. Confirm to create the assignment.`,
    };
  }
  return preview;
}

/**
 * Lesson / learning day around a YouTube (or other) link — confirmable learning_day.create.
 */
export async function prepareLessonFromLink(message, ctx, roster, overrides = {}) {
  const url = overrides.providerUrl || extractHttpUrl(message);
  if (!url) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Paste the video or page URL to build a lesson around.',
    }), {
      intent: 'curriculum.lesson_from_link',
      field: 'providerUrl',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const subjectRes = resolveSubject(message, roster, overrides, ctx);
  if (subjectRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(subjectRes.clarification), {
      intent: 'curriculum.lesson_from_link',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides, providerUrl: url },
    });
  }
  if (!subjectRes.ok) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which subject should this lesson belong to?',
      options: (roster.subjects || []).slice(0, 12).map((s) => ({
        id: String(s.id),
        label: s.name || s.title || 'Subject',
        value: String(s.id),
        field: 'subjectId',
      })),
    }), {
      intent: 'curriculum.lesson_from_link',
      field: 'subjectId',
      originalMessage: message,
      draft: { ...overrides, providerUrl: url },
    });
  }

  const childRes = resolveChild(message, roster, overrides);
  if (!childRes.ok || !childRes.childIds?.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which student is this lesson for?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'curriculum.lesson_from_link',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides, providerUrl: url, subjectId: subjectRes.subjectId },
    });
  }

  const subjectName = subjectRes.subject?.name || subjectRes.subject?.title || 'Subject';
  const kindLabel = isYoutubeUrl(url) ? 'YouTube' : 'video';
  let title = overrides.title;
  if (!title) {
    const about = message.match(/\b(?:around|about|on|from)\s+(.+?)(?:\s+https?:\/\/|\s+for\s+[A-Z]|$)/i);
    const topic = about?.[1]?.replace(/\b(this|the|a|an|youtube|video|link|url)\b/gi, '').trim();
    title = topic && topic.length > 2
      ? titleCaseWords(topic.slice(0, 80))
      : `${kindLabel} lesson — ${subjectName}`;
  } else {
    title = titleCaseWords(title);
  }

  const description = [
    `Watch and discuss: ${url}`,
    '',
    'Suggested flow:',
    '1. Preview the video together (or independently).',
    '2. Note 2–3 key ideas.',
    '3. Discuss or journal one takeaway.',
    '4. Optional: short oral or written check for understanding.',
  ].join('\n');

  // Prefer opening curriculum generate with video context when user asked for units/lessons plural.
  if (/\b(units?|curriculum|course)\b/i.test(message)) {
    const opened = await openUnitsImport({
      subjectId: subjectRes.subjectId,
      subjectName,
      childIds: childRes.childIds,
      academicYearId: ctx.schoolYearId || null,
      method: 'generate',
    });
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: opened
        ? `Opening curriculum generate for ${subjectName}. Paste this link into the description: ${url}`
        : `Add a lesson around ${url} under Learning → ${subjectName}.`,
    });
  }

  const { prepareLearningDayCreate } = await import('./intentPreparers.js');
  const preview = prepareLearningDayCreate(message, ctx, roster, {
    ...overrides,
    title,
    subjectId: subjectRes.subjectId,
    childIds: childRes.childIds,
    description,
    createLesson: true,
    providerUrl: url,
  });

  if (preview?.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) {
    return {
      ...preview,
      message: `Here’s a learning day built around that ${kindLabel} link. Confirm to add it.`,
      warnings: [...(preview.warnings || []), `Resource: ${url}`],
    };
  }
  return preview;
}

/**
 * Continue clarification for material-build intents.
 */
export async function continueMaterialBuildClarification(pending, message, option, ctx, roster) {
  if (!pending?.intent) return null;
  const draft = { ...(pending.draft || {}) };
  const field = option?.field || pending.field;
  const value = option?.value || message;

  if (field === 'subjectId') {
    const resolved = resolveSubjectByName(option?.label || value, roster.subjects || []);
    if (resolved.ok) draft.subjectId = String(resolved.subject.id);
    else if (option?.value) draft.subjectId = String(option.value);
    else return null;
  } else if (field === 'childId') {
    const resolved = resolveChildByName(option?.label || value, roster.children || []);
    if (resolved.ok) {
      draft.childId = String(resolved.child.id);
      draft.childIds = [String(resolved.child.id)];
    } else if (option?.value) {
      draft.childId = String(option.value);
      draft.childIds = [String(option.value)];
    } else return null;
  } else if (field === 'materialId') {
    draft.materialId = String(option?.value || value || '').trim();
    draft.materialTitle = option?.label || draft.materialTitle;
  } else if (field === 'providerUrl') {
    const url = extractHttpUrl(String(value || '')) || String(value || '').trim();
    if (!/^https?:\/\//i.test(url)) return null;
    draft.providerUrl = url;
  } else {
    return null;
  }

  const original = pending.originalMessage || message;
  if (pending.intent === 'curriculum.from_material') {
    return prepareCurriculumFromMaterial(original, ctx, roster, draft);
  }
  if (pending.intent === 'practice.from_material') {
    return preparePracticeFromMaterial(original, ctx, roster, draft);
  }
  if (pending.intent === 'curriculum.lesson_from_link') {
    return prepareLessonFromLink(original, ctx, roster, draft);
  }
  return null;
}
