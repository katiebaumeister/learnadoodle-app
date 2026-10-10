/**
 * Phase 4 — portfolio organization summary (read-only; navigate to Records).
 */

import { DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { resolveChildByName } from './entityResolve.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

export function isPortfolioOrganizeIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|delete|archive)\b/.test(lower)) return false;
  return (
    /\b(organize|group|sort|summarize|tidy)\b/.test(lower)
    && /\b(portfolio|evidence|artifacts?|uploads?)\b/.test(lower)
  ) || (
    /\bportfolio\b/.test(lower)
    && /\b(untagged|ungrouped|missing\s+subject|organize)\b/.test(lower)
  ) || /\bwhat(?:'s|\s+is)\s+in\s+(the\s+|my\s+|our\s+)?portfolio\b/.test(lower);
}

/**
 * Group evidence rows by subject (heuristic).
 */
export function groupEvidenceBySubject(items = [], roster = {}) {
  const subjects = roster.subjects || [];
  const groups = new Map();
  let untagged = 0;
  for (const item of items || []) {
    const sid = item.subject_id != null ? String(item.subject_id) : null;
    if (!sid) {
      untagged += 1;
      const prev = groups.get('_untagged') || { name: 'Untagged', count: 0, samples: [] };
      prev.count += 1;
      if (prev.samples.length < 3) {
        prev.samples.push(String(item.caption || item.title || 'Evidence').slice(0, 40));
      }
      groups.set('_untagged', prev);
      continue;
    }
    const sub = subjects.find((s) => String(s.id) === sid);
    const name = sub?.name || sub?.title || 'Subject';
    const prev = groups.get(sid) || { name, count: 0, samples: [] };
    prev.count += 1;
    if (prev.samples.length < 3) {
      prev.samples.push(String(item.caption || item.title || 'Evidence').slice(0, 40));
    }
    groups.set(sid, prev);
  }
  return {
    groups: [...groups.values()].sort((a, b) => b.count - a.count),
    untagged,
    total: (items || []).length,
  };
}

export async function preparePortfolioOrganize(
  message,
  ctx,
  roster = {},
  overrides = {},
  opts = {},
) {
  let childIds = overrides.childIds || ctx?.selectedChildIds || [];
  const forMatch = String(message || '').match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if ((!childIds || !childIds.length) && forMatch) {
    const resolved = resolveChildByName(forMatch[1], roster.children || []);
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'portfolio.organize',
        field: 'childId',
        originalMessage: message,
        draft: { ...overrides },
      });
    }
    if (resolved.ok) childIds = [String(resolved.child.id)];
  }
  if (!childIds.length && (roster.children || []).length === 1) {
    childIds = [String(roster.children[0].id)];
  }
  if (!childIds.length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: 'Which learner’s portfolio should I organize?',
      options: (roster.children || []).map((c) => ({
        id: String(c.id),
        label: c.first_name || c.name || 'Student',
        value: String(c.id),
        field: 'childId',
      })),
    }), {
      intent: 'portfolio.organize',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  const child = (roster.children || []).find((c) => String(c.id) === String(childIds[0]));
  const childName = child?.first_name || child?.name || 'Learner';

  let items = opts.evidenceItems || null;
  if (!items) {
    try {
      const { getEvidence } = await import('../../services/recordsClient.js');
      items = await getEvidence(ctx?.householdId, childIds, null, null);
    } catch (_) {
      items = [];
    }
  }
  if (!Array.isArray(items)) items = [];

  const { groups, untagged, total } = groupEvidenceBySubject(items, roster);
  meterDoodleAiUsage({
    familyId: ctx?.householdId,
    conversationId: opts.conversationId || null,
    actionType: 'chatbotSimple',
    idempotencyKey: `doodle-portfolio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: { reason: 'portfolio_organize', childId: childIds[0], total, untagged },
  }).catch(() => {});

  if (!total) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ANSWER,
      message: `No portfolio evidence yet for ${childName}. Upload photos or files in Records → Portfolio, then ask me to organize.`,
      links: [
        { label: 'Open Portfolio', href: `/records?tab=portfolio&child=${childIds[0]}` },
      ],
    });
  }

  const lines = groups.slice(0, 10).map((g) => {
    const samples = g.samples.length ? ` (${g.samples.join('; ')})` : '';
    return `• ${g.name}: ${g.count}${samples}`;
  });
  const tip = untagged > 0
    ? `\n\n${untagged} item${untagged === 1 ? '' : 's'} still untagged — open Portfolio to assign subjects. I won’t change tags from chat.`
    : '\n\nLooks tidy by subject. Open Portfolio to reorder or export.';

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: [
      `Portfolio snapshot for ${childName} (${total} item${total === 1 ? '' : 's'}):`,
      ...lines,
      tip,
    ].join('\n'),
    links: [
      { label: 'Open Portfolio', href: `/records?tab=portfolio&child=${childIds[0]}` },
      untagged > 0
        ? { label: 'Review untagged', href: `/records?tab=portfolio&child=${childIds[0]}&filter=untagged` }
        : null,
    ].filter(Boolean),
  });
}
