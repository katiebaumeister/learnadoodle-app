/**
 * Phase 4 — Socratic tutoring turn in Doodle (ANSWER only; no mutations).
 * Age-banded prompts, no-direct-answers, parent-visible review footer.
 */

import { DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';
import { ageBandFromChild, completeChatText } from './openaiChatHelper.js';

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

/** Interactive help / “quiz me” / tutor — not “make a quiz” assignment generation. */
export function isSocraticTutorIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)\s+i\s+(mark|open|export|delete|create\s+an?\s+assignment))\b/.test(lower)) {
    return false;
  }
  // Product capability questions (“what can you help me with?”) are not tutoring.
  if (/\bwhat\s+can\s+you\s+help\b/.test(lower) || /\bwhat\s+do\s+you\s+(do|help)\b/.test(lower)) {
    return false;
  }
  // Assignment generation owns “make/create/generate a quiz|worksheet”
  if (/\b(make|create|generate|build)\b/.test(lower)
    && /\b(quiz|worksheet|practice\s+sheet)\b/.test(lower)
    && !/\bquiz\s+me\b/.test(lower)) {
    return false;
  }
  return (
    /\bquiz\s+me\b/.test(lower)
    || /\b(tutor|socratic)\b/.test(lower)
    || /\bhelp\s+(me|us|[A-Za-z][A-Za-z'-]*)\s+(understand|figure|think)\b/.test(lower)
    || /\bhelp\s+(me|us|[A-Za-z][A-Za-z'-]*)\s+with\s+(?!this\b)([A-Za-z][A-Za-z0-9 &/-]{1,40})\b/.test(lower)
    || /\bwalk\s+(me|us)\s+through\b/.test(lower)
    || /\b(help|guide)\s+(me|us)\s+(think|reason)\b/.test(lower)
    || /\bdon'?t\s+give\s+(me\s+)?(the\s+)?answer\b/.test(lower)
    || /\bask\s+me\s+(questions?|guiding)\b/.test(lower)
  );
}

function resolveChild(message, roster, overrides = {}) {
  if (overrides.childIds?.length === 1) {
    const c = (roster.children || []).find((row) => String(row.id) === String(overrides.childIds[0]));
    if (c) return { ok: true, child: c, childIds: [String(c.id)] };
  }
  const forMatch = message.match(/\b(?:for|with|help)\s+([A-Za-z][A-Za-z'-]*)\b/i);
  const needle = forMatch?.[1];
  if (needle && !/^(me|us|with|understand|figure|think|today)$/i.test(needle)) {
    const resolved = resolveChildByName(needle, roster.children || []);
    if (resolved.clarification) return { clarification: resolved.clarification };
    if (resolved.ok) return { ok: true, child: resolved.child, childIds: [String(resolved.child.id)] };
  }
  const kids = roster.children || [];
  if (kids.length === 1) return { ok: true, child: kids[0], childIds: [String(kids[0].id)] };
  if (overrides.childIds?.length) {
    const c = kids.find((row) => String(row.id) === String(overrides.childIds[0]));
    return { ok: true, child: c || null, childIds: overrides.childIds.map(String) };
  }
  return { ok: false };
}

function extractTopic(message, roster = {}) {
  const onMatch = message.match(
    /\b(?:on|about|with|through)\s+([A-Za-z0-9][A-Za-z0-9 &/-]{1,60}?)(?:\s+for\s+[A-Za-z]|\s*$|[.?!])/i,
  );
  if (onMatch) {
    const t = onMatch[1].trim();
    if (!/^(me|us|today|tomorrow)$/i.test(t)) return t;
  }
  const bare = message.match(/\b(history|math|science|reading|english|writing|fractions?|decimals?)\b/i);
  if (bare) {
    const asSubject = resolveSubjectByName(bare[1], roster.subjects || []);
    if (asSubject.ok) return asSubject.subject.name || asSubject.subject.title || bare[1];
    return bare[1];
  }
  return null;
}

function buildSocraticSystem({ childName, ageBand, topic, userRole }) {
  const audience = userRole === 'child'
    ? `You are tutoring ${childName || 'the learner'} directly (${ageBand.ageLabel}).`
    : `You are helping a parent/tutor coach ${childName || 'the learner'} (${ageBand.ageLabel}). Address the learner when useful.`;
  return [
    'You are a Socratic learning coach inside Learnadoodle’s Doodle assistant.',
    audience,
    'Rules (strict):',
    '1) Do NOT give the final answer, full solution, or worked steps that finish the problem.',
    '2) Ask 2–4 short guiding questions, one idea at a time.',
    '3) Use age-appropriate vocabulary and encouragement; no shame.',
    '4) Stay on the learning topic; refuse unsafe, medical, or adult content.',
    '5) If the learner is stuck, give a tiny hint (definition or strategy name) — never the answer.',
    '6) End with one concrete “try this next” prompt for the learner.',
    topic ? `Topic focus: ${topic}.` : 'Infer the topic from the user message.',
    'Keep the whole reply under ~180 words. Plain text only (no markdown headings).',
  ].join('\n');
}

/** Deterministic fallback when OpenAI is unavailable. */
export function buildSocraticFallback({ childName, topic, ageBand }) {
  const who = childName || 'you';
  const focus = topic || 'this';
  const lines = [
    `Let’s figure out ${focus} together — I’ll guide ${who} with questions (no final answer from me).`,
    '',
    '1) What do you already know about this?',
    '2) What is the question asking for in your own words?',
    ageBand.band === 'early' || ageBand.band === 'elementary'
      ? '3) Can you draw or say one small example?'
      : '3) Which strategy might help first (estimate, draw, break into parts)?',
    '4) What would you try next?',
    '',
    `Try this next: write one sentence about ${focus}, then tell me where you get stuck.`,
  ];
  return lines.join('\n');
}

function parentReviewFooter({ childName, topic, ageBand, conversationId }) {
  const who = childName || 'learner';
  const focus = topic || 'this topic';
  return [
    '',
    '—',
    `Parent review: Socratic help for ${who} (${ageBand.ageLabel}) on ${focus}.`,
    'No final answers were provided. This turn stays visible in this Doodle chat for parent/tutor review.',
    conversationId ? `Chat id: ${conversationId}` : null,
  ].filter(Boolean).join('\n');
}

/**
 * One Socratic tutoring turn.
 * @param {object} opts
 * @param {Function} [opts.completeChat] - inject LLM for tests
 */
export async function prepareSocraticTutorAnswer(
  message,
  ctx,
  roster = {},
  overrides = {},
  opts = {},
) {
  const childRes = resolveChild(message, roster, {
    childIds: overrides.childIds || ctx?.selectedChildIds || [],
  });
  if (childRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(childRes.clarification), {
      intent: 'tutor.socratic',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!childRes.ok && (roster.children || []).length > 1) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which learner should I tutor?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'tutor.socratic',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const child = childRes.child || null;
  const childName = child?.first_name || child?.name || null;
  const ageBand = ageBandFromChild(child || {});
  const topic = overrides.topic || extractTopic(message, roster) || 'the problem';

  const system = buildSocraticSystem({
    childName,
    ageBand,
    topic,
    userRole: ctx?.userRole || 'parent',
  });
  const user = String(message || '').trim();

  const complete = typeof opts.completeChat === 'function' ? opts.completeChat : completeChatText;
  let body = await complete({
    system,
    user,
    temperature: 0.4,
    maxTokens: 500,
  });
  if (!body) {
    body = buildSocraticFallback({ childName, topic, ageBand });
  }

  // Soft post-check: if model leaked “the answer is”, strip last answer-like sentence.
  if (/\b(the\s+answer\s+is|final\s+answer\s*:)\b/i.test(body)) {
    body = `${buildSocraticFallback({ childName, topic, ageBand })}\n\n(I rewrote that to stay Socratic — ask me a follow-up if you want another guiding question.)`;
  }

  meterDoodleAiUsage({
    familyId: ctx?.householdId,
    conversationId: opts.conversationId || null,
    actionType: 'chatbotSimple',
    idempotencyKey: `doodle-socratic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: {
      reason: 'socratic_tutor',
      childId: childRes.childIds?.[0] || null,
      topic,
      ageBand: ageBand.band,
      parentVisible: true,
    },
  }).catch(() => {});

  const footer = parentReviewFooter({
    childName,
    topic,
    ageBand,
    conversationId: opts.conversationId || null,
  });

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: `${body}${footer}`,
    links: [
      {
        label: 'Parent review (this chat)',
        href: '#doodle-parent-review',
      },
      topic && (roster.subjects || []).some((s) => {
        const n = String(s.name || s.title || '').toLowerCase();
        return n && String(topic).toLowerCase().includes(n.slice(0, 4));
      })
        ? {
          label: 'Open subject',
          href: `/learning?subject=${(roster.subjects || []).find((s) => {
            const n = String(s.name || s.title || '').toLowerCase();
            return n && String(topic).toLowerCase().includes(n.slice(0, 4));
          })?.id}`,
        }
        : { label: 'Open Planner', href: '/planner?view=board' },
    ].filter(Boolean),
  });
}
