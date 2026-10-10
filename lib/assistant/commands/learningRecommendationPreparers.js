/**
 * Phase 3 — learning recommendations for Doodle.
 * Read-only answers + deep-links into planner Smart Actions; optional
 * confirmable learning-day chips. Never auto-applies pack/catch-up.
 */

import { DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import { meterDoodleAiUsage } from './meterAiUsage.js';

function toLocalYmd(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysYmd(ymd, delta) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return toLocalYmd(d);
}

function formatTimeLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function dayLabelFromMessage(message, anchor = new Date()) {
  const lower = String(message || '').toLowerCase();
  const today = toLocalYmd(anchor);
  if (/\btomorrow\b/.test(lower)) return { ymd: addDaysYmd(today, 1), label: 'Tomorrow' };
  if (/\byesterday\b/.test(lower)) return { ymd: addDaysYmd(today, -1), label: 'Yesterday' };
  return { ymd: today, label: 'Today' };
}

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

function smartActionLinks() {
  return [
    {
      label: 'Open Catch Up',
      href: '#planner-smart-action/catch-up',
    },
    {
      label: 'Pack this week',
      href: '#planner-smart-action/pack-week',
    },
    {
      label: 'Open Planner',
      href: '/planner?view=board',
    },
  ];
}

async function loadEventsForLocalDay(familyId, ymd) {
  if (!familyId || !ymd) return [];
  try {
    const { supabase } = await import('../../supabase.js');
    const dayStart = new Date(`${ymd}T00:00:00`);
    const dayEnd = new Date(`${ymd}T23:59:59.999`);
    // Pad for UTC start_ts near midnight.
    const from = new Date(dayStart.getTime() - 12 * 60 * 60 * 1000);
    const to = new Date(dayEnd.getTime() + 12 * 60 * 60 * 1000);
    const { data, error } = await supabase
      .from('events')
      .select('id, title, start_ts, end_ts, child_id, child_ids, subject_id, is_flexible, all_day, status, event_type')
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .gte('start_ts', from.toISOString())
      .lte('start_ts', to.toISOString())
      .order('start_ts', { ascending: true })
      .limit(80);
    if (error || !Array.isArray(data)) return [];
    return data
      .filter((ev) => String(ev.status || '') !== 'canceled')
      .filter((ev) => {
        if (!ev?.start_ts) return false;
        const local = toLocalYmd(new Date(ev.start_ts));
        return local === ymd;
      });
  } catch (_) {
    return [];
  }
}

function formatEventLine(ev, roster = {}) {
  const title = String(ev.title || 'Untitled').trim();
  let when = 'All day';
  if (!ev.all_day && !ev.is_flexible && ev.start_ts) {
    const start = new Date(ev.start_ts);
    when = formatTimeLabel(start) || when;
  } else if (ev.is_flexible) {
    when = 'Flexible';
  }
  const childIds = [];
  if (ev.child_id) childIds.push(String(ev.child_id));
  if (Array.isArray(ev.child_ids)) {
    for (const id of ev.child_ids) {
      if (id != null && id !== '') childIds.push(String(id));
    }
  }
  const names = [...new Set(childIds)]
    .map((id) => {
      const c = (roster.children || []).find((row) => String(row.id) === String(id));
      return c?.first_name || c?.name || null;
    })
    .filter(Boolean);
  const who = names.length ? ` · ${names.join(', ')}` : '';
  return `• ${when} — ${title}${who}`;
}

async function loadPlanHealthSummary(familyId, academicYearId = null) {
  if (!familyId) return null;
  try {
    const { getPlanHealth } = await import('../../services/academicYearClient.js');
    const { data, error } = await getPlanHealth(familyId, academicYearId);
    if (error || !data?.plan_exists) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function formatPlanHealthLine(health) {
  if (!health) return null;
  const mode = health.constraint_mode || 'days';
  if (mode === 'hours' && health.delta_hours != null && health.delta_hours < 0) {
    return `You're about ${Math.abs(Number(health.delta_hours)).toFixed(0)} hours under your ${health.target_hours}-hour goal.`;
  }
  if (mode === 'days' && health.delta_days != null && health.delta_days < 0) {
    return `You're about ${Math.abs(Number(health.delta_days))} days under your ${health.target_days}-day goal.`;
  }
  if (mode === 'hours' && health.delta_hours != null && health.delta_hours > 0) {
    return `You're ahead by about ${Number(health.delta_hours).toFixed(0)} hours.`;
  }
  if (mode === 'days' && health.delta_days != null && health.delta_days > 0) {
    return `You're ahead by about ${Number(health.delta_days)} days.`;
  }
  return 'Your plan looks on track for the year target.';
}

function isBehind(health) {
  if (!health) return false;
  if (health.constraint_mode === 'hours') return health.delta_hours != null && health.delta_hours < 0;
  return health.delta_days != null && health.delta_days < 0;
}

function meterPlannerAware(ctx, conversationId, reason) {
  if (!ctx?.householdId) return;
  meterDoodleAiUsage({
    familyId: ctx.householdId,
    conversationId: conversationId || null,
    actionType: 'chatbotPlannerAware',
    idempotencyKey: `doodle-rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    metadata: { reason },
  }).catch(() => {});
}

/** Read-only “what's on the calendar today/tomorrow”. */
export function isTodayScheduleIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(delete|remove|cancel|trash|add|create|book|mark|schedule\s+a)\b/.test(lower)) return false;
  if (isCatchUpRecommendIntent(message) && !/\b(schedule|calendar|today|tomorrow)\b/.test(lower)) {
    return false;
  }
  return (
    /\bwhat(?:'s|\s+is|\s+s)\s+on\s+(my\s+)?(calendar|schedule)\b/.test(lower)
    || /\bwhat\s+do\s+(i|we)\s+have\s+(today|tomorrow)\b/.test(lower)
    || /\b(show|list)\s+(me\s+)?(my\s+)?(today'?s?\s+)?(schedule|calendar|events?|lessons?)\b/.test(lower)
    || /\b(today'?s?\s+schedule|schedule\s+for\s+today|events?\s+today|lessons?\s+today)\b/.test(lower)
    || /\bwhat'?s?\s+happening\s+(today|tomorrow)\b/.test(lower)
    || /\bdo\s+(i|we)\s+have\s+(anything\s+)?(today|tomorrow)\b/.test(lower)
    || /\b(am\s+i\s+free|busy)\s+(today|tomorrow)\b/.test(lower)
    || /\bwhat'?s?\s+planned\s+(for\s+)?(today|tomorrow)\b/.test(lower)
  );
}

/** Catch-up / behind / make-up recommendations (not attendance mark). */
export function isCatchUpRecommendIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can)|explain|mark\s+.*attend)\b/.test(lower)) return false;
  if (/\b(catch\s*up|catching\s+up|make\s+up|behind|falling\s+behind)\b/.test(lower)) return true;
  if (/\b(gap|under\s+(on\s+)?(days?|hours?|target|goal))\b/.test(lower) && /\b(plan|school|year|subject|history|math|science)\b/.test(lower)) {
    return true;
  }
  return false;
}

/** “What should we/Emma do / suggest / recommend” learning ideas. */
export function isLearningSuggestIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can))\b/.test(lower)) return false;
  // “why did you recommend …” is explainability, not a fresh suggest.
  if (isExplainRecommendationIntent(message)) return false;
  if (isParentProgressSummaryIntent(message)) return false;
  return (
    /\bwhat\s+should\s+(we|i|they|[A-Za-z][A-Za-z'-]*)\s+(do|work\s+on|study|learn|teach)\b/.test(lower)
    || /\bwhat\s+should\s+[A-Za-z][A-Za-z'-]*\s+work\s+on\b/.test(lower)
    || /\b(suggest|recommend)\b/.test(lower) && /\b(today|learning|lesson|subject|activity|what)\b/.test(lower)
    || /\bideas?\s+for\s+(today|learning|school|this\s+week)\b/.test(lower)
    || /\bwhat\s+to\s+(do|work\s+on|study)\s+(today|now)\b/.test(lower)
  );
}

/** “Why fractions?” / “why did you recommend …” */
export function isExplainRecommendationIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  return (
    /\bwhy\s+(did\s+you\s+)?(recommend|suggest|pick|choose)\b/.test(lower)
    || /\bwhy\s+(that|this|fractions?|math|science|reading|history)\b/.test(lower)
    || /\bexplain\s+(your\s+)?(recommendation|suggestion|pick)\b/.test(lower)
  );
}

/** Weekly parent progress summary in Doodle. */
export function isParentProgressSummaryIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)\s+i)\b/.test(lower)) return false;
  return (
    /\b(weekly|week'?s?)\s+(progress|summary|recap|report)\b/.test(lower)
    || /\b(progress|learning)\s+(summary|recap|report)\b/.test(lower)
    || /\b(summarize|summary\s+of)\s+(this\s+)?(week|our\s+week|progress)\b/.test(lower)
    || /\bhow\s+did\s+(we|they|[A-Za-z][A-Za-z'-]*)\s+(do|progress)\s+(this\s+)?week\b/.test(lower)
    || /\bhow\s+(are|is)\s+(we|[A-Za-z][A-Za-z'-]*)\s+doing\s+(this\s+)?week\b/.test(lower)
  );
}

/** “What classes / lessons have I done so far?” */
export function isClassesDoneIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|mark|delete|create|add)\b/.test(lower)) return false;
  return (
    /\bwhat\s+(classes|lessons|subjects?|learning\s+days?)\s+have\s+(i|we|they|[A-Za-z][A-Za-z'-]*)\s+(done|completed|finished|attended)\b/.test(lower)
    || /\b(classes|lessons)\s+(done|completed|finished)\s+so\s+far\b/.test(lower)
    || /\bhow\s+many\s+(classes|lessons|learning\s+days?)\s+have\s+(i|we)\s+(done|completed|finished|attended)\b/.test(lower)
    || /\bwhat\s+have\s+(i|we)\s+(done|completed|finished)\s+(so\s+far|this\s+year|this\s+week)\b/.test(lower)
  );
}

async function loadCompletedLearningEvents(familyId, { childId = null, limit = 40 } = {}) {
  if (!familyId) return [];
  try {
    const { supabase } = await import('../../supabase.js');
    let query = supabase
      .from('events')
      .select('id, title, start_ts, subject_id, status, child_id, child_ids, counts_toward_plan, event_type')
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .eq('status', 'done')
      .order('start_ts', { ascending: false })
      .limit(limit);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return data.filter((ev) => {
      if (!(ev.subject_id || ev.counts_toward_plan)) return false;
      if (!childId) return true;
      if (String(ev.child_id) === String(childId)) return true;
      if (Array.isArray(ev.child_ids) && ev.child_ids.map(String).includes(String(childId))) return true;
      return !ev.child_id;
    });
  } catch (_) {
    return [];
  }
}

/**
 * Summarize completed / attended learning so far (read-only).
 */
export async function prepareClassesDoneAnswer(message, ctx, roster = {}, overrides = {}, opts = {}) {
  let childIds = overrides.childIds || ctx?.selectedChildIds || [];
  const forMatch = String(message || '').match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  const haveMatch = String(message || '').match(
    /\bhave\s+([A-Za-z][A-Za-z'-]*)\s+(done|completed|finished|attended)\b/i,
  );
  const needle = forMatch?.[1] || haveMatch?.[1];
  if ((!childIds || !childIds.length) && needle && !/^(i|we|they)$/i.test(needle)) {
    const resolved = resolveChildByName(needle, roster.children || []);
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'learning.classes_done',
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

  const childId = childIds[0] || null;
  const child = (roster.children || []).find((c) => String(c.id) === String(childId));
  const childName = child?.first_name || child?.name || null;

  const [events, health] = await Promise.all([
    loadCompletedLearningEvents(ctx?.householdId, { childId }),
    loadPlanHealthSummary(ctx?.householdId, ctx?.schoolYearId || null),
  ]);
  meterPlannerAware(ctx, opts.conversationId, 'classes_done');

  const bySubject = new Map();
  for (const ev of events) {
    const sid = ev.subject_id ? String(ev.subject_id) : '_other';
    const sub = (roster.subjects || []).find((s) => String(s.id) === sid);
    const name = sub?.name || sub?.title || (sid === '_other' ? 'Other' : 'Subject');
    const prev = bySubject.get(sid) || { name, count: 0, titles: [] };
    prev.count += 1;
    if (prev.titles.length < 3 && ev.title) prev.titles.push(String(ev.title).trim());
    bySubject.set(sid, prev);
  }

  const rows = [...bySubject.values()].sort((a, b) => b.count - a.count);
  const who = childName ? ` for ${childName}` : '';
  const pace = formatPlanHealthLine(health);
  let body;
  if (!rows.length) {
    body = `I don’t see completed learning days marked done${who} yet. Mark attendance on learning days in the Planner, then ask again.`;
  } else {
    const lines = rows.slice(0, 10).map((r) => {
      const samples = r.titles.length ? ` — e.g. ${r.titles.slice(0, 2).join('; ')}` : '';
      return `• ${r.name}: ${r.count} completed${samples}`;
    });
    body = [
      `Here’s what’s marked done so far${who} (${events.length} learning day${events.length === 1 ? '' : 's'}):`,
      ...lines,
      pace ? `\n${pace}` : null,
    ].filter(Boolean).join('\n');
  }

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: body,
    links: [
      { label: 'Open Planner', href: '/planner?view=board' },
      { label: 'Open Catch Up', href: '#planner-smart-action/catch-up' },
    ],
  });
}

function resolveChildFromMessage(message, roster, overrides = {}) {
  if (overrides.childIds?.length === 1) {
    const c = (roster.children || []).find((row) => String(row.id) === String(overrides.childIds[0]));
    if (c) return { ok: true, child: c, childIds: [String(c.id)] };
  }
  const nameMatch = String(message || '').match(
    /\b(?:for|with)\s+([A-Za-z][A-Za-z'-]*)\b|\bwhat\s+should\s+([A-Za-z][A-Za-z'-]*)\s+(?:do|work)/i,
  );
  const needle = nameMatch?.[1] || nameMatch?.[2];
  if (needle && !/^(we|i|they|today|tomorrow)$/i.test(needle)) {
    const resolved = resolveChildByName(needle, roster.children || []);
    if (resolved.clarification) return { clarification: resolved.clarification };
    if (resolved.ok) {
      return { ok: true, child: resolved.child, childIds: [String(resolved.child.id)] };
    }
  }
  const selected = overrides.childIds || [];
  if (selected.length === 1) {
    const c = (roster.children || []).find((row) => String(row.id) === String(selected[0]));
    if (c) return { ok: true, child: c, childIds: [String(c.id)] };
  }
  const kids = roster.children || [];
  if (kids.length === 1) {
    return { ok: true, child: kids[0], childIds: [String(kids[0].id)] };
  }
  return { ok: false, childIds: selected };
}

export async function prepareTodayScheduleAnswer(message, ctx, roster = {}, opts = {}) {
  const { ymd, label } = dayLabelFromMessage(message);
  const events = await loadEventsForLocalDay(ctx?.householdId, ymd);
  meterPlannerAware(ctx, opts.conversationId, 'today_schedule');

  const lines = events.slice(0, 12).map((ev) => formatEventLine(ev, roster));
  const more = events.length > 12 ? `\n(+${events.length - 12} more)` : '';
  const body = lines.length
    ? `${label}'s plan:\n${lines.join('\n')}${more}`
    : `${label} looks open — nothing timed on the calendar yet.`;

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: body,
    links: [
      { label: `Open Planner`, href: '/planner?view=board' },
      ...smartActionLinks().filter((l) => l.href.includes('catch-up') || l.href.includes('pack-week')),
    ],
  });
}

export async function prepareCatchUpSuggestion(message, ctx, roster = {}, overrides = {}, opts = {}) {
  const lower = String(message || '').toLowerCase();
  let subjectId = overrides.subjectId || null;
  let subjectName = overrides.subjectName || null;

  if (!subjectId) {
    const onMatch = message.match(/\b(?:on|in|for)\s+([A-Za-z][A-Za-z0-9 &/-]{1,40})/i);
    const bare = message.match(/\b(history|math|science|reading|english|writing|art|music)\b/i);
    const needle = onMatch?.[1] || bare?.[1];
    if (needle) {
      const resolved = resolveSubjectByName(needle.trim(), roster.subjects || []);
      if (resolved.clarification) {
        return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
          intent: 'learning.catch_up',
          field: 'subjectId',
          originalMessage: message,
          draft: { ...overrides },
        });
      }
      if (resolved.ok) {
        subjectId = String(resolved.subject.id);
        subjectName = resolved.subject.name || resolved.subject.title || needle;
      }
    }
  }

  let childIds = overrides.childIds || ctx?.selectedChildIds || [];
  const forMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i);
  if ((!childIds || !childIds.length) && forMatch) {
    const resolved = resolveChildByName(forMatch[1], roster.children || []);
    if (resolved.clarification) {
      return withClarificationMeta(assertDoodleResponse(resolved.clarification), {
        intent: 'learning.catch_up',
        field: 'childId',
        originalMessage: message,
        draft: { subjectId, subjectName, ...overrides },
      });
    }
    if (resolved.ok) childIds = [String(resolved.child.id)];
  }

  const health = await loadPlanHealthSummary(ctx?.householdId, ctx?.schoolYearId || null);
  meterPlannerAware(ctx, opts.conversationId, 'catch_up_suggest');

  const pace = formatPlanHealthLine(health);
  const subjectBit = subjectName ? ` for ${subjectName}` : '';
  const behind = isBehind(health);
  const wantsPack = /\bpack\b/.test(lower) && /\bweek\b/.test(lower);

  const parts = [
    behind
      ? `Looks like you're behind${subjectBit}. ${pace || ''}`.trim()
      : pace
        ? `${pace}${subjectBit ? ` (${subjectName})` : ''}`
        : `I can help you catch up${subjectBit} with the planner tools — nothing is applied until you confirm there.`,
    wantsPack
      ? 'Open Pack This Week to fill open slots, or Catch Up to close requirement gaps.'
      : 'Open Catch Up to review suggested moves, or Pack This Week to fill open slots. Nothing is applied from chat until you confirm in the tool.',
  ];

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: parts.filter(Boolean).join('\n\n'),
    links: smartActionLinks(),
  });
}

/**
 * Suggest what to do today using unfinished work, struggles, schedule, and pace —
 * with explainable “why” lines and confirmable chips (never auto-applies).
 */
export async function prepareLearningSuggestAnswer(message, ctx, roster = {}, overrides = {}, opts = {}) {
  const { ymd, label } = dayLabelFromMessage(message);
  const childRes = resolveChildFromMessage(message, roster, {
    childIds: overrides.childIds || ctx?.selectedChildIds || [],
  });
  if (childRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(childRes.clarification), {
      intent: 'learning.suggest',
      field: 'childId',
      originalMessage: message,
      draft: { date: ymd, ...overrides },
    });
  }

  const childId = childRes.childIds?.[0] || null;
  const childName = childRes.child?.first_name || childRes.child?.name || null;

  const {
    gatherLearningContinuityContext,
    rankContinuityRecommendations,
    formatRecommendationDigest,
  } = await import('./learningContinuityContext.js');

  const [events, continuity] = await Promise.all([
    loadEventsForLocalDay(ctx?.householdId, ymd),
    gatherLearningContinuityContext({
      familyId: ctx?.householdId,
      childId,
      academicYearId: ctx?.schoolYearId || null,
    }),
  ]);
  meterPlannerAware(ctx, opts.conversationId, 'learning_suggest');

  const recs = rankContinuityRecommendations(continuity, roster);
  const digest = formatRecommendationDigest(recs, childName);
  const health = continuity.planHealth;
  const behind = isBehind(health);
  const eventLines = events.slice(0, 5).map((ev) => formatEventLine(ev, roster));
  const scheduleBlock = eventLines.length
    ? `${label}'s plan:\n${eventLines.join('\n')}`
    : `${label} looks open on the calendar.`;
  const pace = formatPlanHealthLine(health);
  const paceBlock = pace ? `\n\n${pace}` : '';

  const options = [];
  const seen = new Set();
  for (const r of recs.slice(0, 5)) {
    if (r.action === 'open_assignment' && r.assignmentId) {
      const key = `asg:${r.assignmentId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        id: `asg-${r.assignmentId}`,
        label: `Work on: ${r.title}`,
        value: `open_assignment:${r.assignmentId}`,
        field: 'recommendAction',
      });
    } else if (r.action === 'learning_day' && r.subjectId) {
      const key = `ld:${r.subjectId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        id: `ld-${r.subjectId}`,
        label: `Schedule ${r.subjectName || 'subject'} learning day`,
        value: `learning_day:${r.subjectId}`,
        field: 'recommendAction',
      });
    } else if (r.action === 'catch-up') {
      if (!seen.has('catch-up')) {
        seen.add('catch-up');
        options.push({
          id: 'open-catch-up',
          label: 'Open Catch Up',
          value: 'catch-up',
          field: 'recommendAction',
        });
      }
    }
  }

  // Fallback subject chips when continuity is thin
  if (options.filter((o) => String(o.value).startsWith('learning_day:')).length < 2) {
    for (const s of (roster.subjects || []).slice(0, 6)) {
      const key = `ld:${s.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        id: `ld-${s.id}`,
        label: `Schedule ${s.name || s.title || 'subject'} learning day`,
        value: `learning_day:${s.id}`,
        field: 'recommendAction',
      });
      if (options.filter((o) => String(o.value).startsWith('learning_day:')).length >= 3) break;
    }
  }

  if (behind && !seen.has('catch-up')) {
    options.push({
      id: 'open-catch-up',
      label: 'Open Catch Up',
      value: 'catch-up',
      field: 'recommendAction',
    });
  }
  options.push({
    id: 'open-pack-week',
    label: 'Pack this week',
    value: 'pack-week',
    field: 'recommendAction',
  });
  if (recs.length) {
    options.push({
      id: 'why-top',
      label: 'Why this recommendation?',
      value: 'explain_top',
      field: 'recommendAction',
    });
  }

  const coach = '\n\nPick a next step (preview before anything is saved), or ask why I recommended something.';

  return withClarificationMeta(assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
    message: `${digest.message}\n\n${scheduleBlock}${paceBlock}${coach}`,
    options: options.slice(0, 9),
  }), {
    intent: 'learning.suggest',
    field: 'recommendAction',
    originalMessage: message,
    draft: {
      date: ymd,
      childIds: childRes.childIds || overrides.childIds || ctx?.selectedChildIds || [],
      recommendations: recs.slice(0, 8).map((r) => ({
        id: r.id,
        title: r.title,
        why: r.why,
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        assignmentId: r.assignmentId || null,
        kind: r.kind,
        action: r.action,
      })),
      ...overrides,
    },
  });
}

/**
 * Explain the last continuity recommendation (from draft or fresh gather).
 */
export async function prepareExplainRecommendation(message, ctx, roster = {}, overrides = {}, opts = {}) {
  const {
    gatherLearningContinuityContext,
    rankContinuityRecommendations,
    explainRecommendation,
  } = await import('./learningContinuityContext.js');

  let recs = overrides.recommendations || opts.priorRecommendations || null;
  if (!Array.isArray(recs) || !recs.length) {
    const childRes = resolveChildFromMessage(message, roster, {
      childIds: overrides.childIds || ctx?.selectedChildIds || [],
    });
    const childId = childRes.childIds?.[0] || null;
    const continuity = await gatherLearningContinuityContext({
      familyId: ctx?.householdId,
      childId,
      academicYearId: ctx?.schoolYearId || null,
    });
    recs = rankContinuityRecommendations(continuity, roster);
  }
  meterPlannerAware(ctx, opts.conversationId, 'explain_recommendation');
  const line = explainRecommendation(recs, message)
    || 'I prioritize overdue/needs-help assignments, then today’s planned lessons, then recent struggles, then plan pace.';
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: line,
  });
}

/**
 * Weekly parent progress summary: unfinished, struggles, pace, upcoming.
 */
export async function prepareParentProgressSummary(message, ctx, roster = {}, overrides = {}, opts = {}) {
  const childRes = resolveChildFromMessage(message, roster, {
    childIds: overrides.childIds || ctx?.selectedChildIds || [],
  });
  if (childRes.clarification) {
    return withClarificationMeta(assertDoodleResponse(childRes.clarification), {
      intent: 'learning.parent_summary',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }

  // Multiple kids → brief per-child lines (cap 4)
  let childIds = childRes.childIds?.length
    ? childRes.childIds
    : (roster.children || []).slice(0, 4).map((c) => String(c.id));
  if (!childIds.length && ctx?.selectedChildIds?.length) {
    childIds = ctx.selectedChildIds.map(String);
  }

  const {
    gatherLearningContinuityContext,
    rankContinuityRecommendations,
  } = await import('./learningContinuityContext.js');

  const blocks = [];
  for (const id of childIds.slice(0, 4)) {
    const child = (roster.children || []).find((c) => String(c.id) === String(id));
    const name = child?.first_name || child?.name || 'Learner';
    const continuity = await gatherLearningContinuityContext({
      familyId: ctx?.householdId,
      childId: id,
      academicYearId: ctx?.schoolYearId || null,
    });
    const recs = rankContinuityRecommendations(continuity, roster).slice(0, 3);
    const openCount = (continuity.assignments || []).length;
    const overdue = (continuity.assignments || []).filter((a) => {
      const due = a.due_date ? String(a.due_date).slice(0, 10) : null;
      return due && due < toLocalYmd(new Date());
    }).length;
    const struggles = (continuity.outcomes || []).filter((o) => {
      const rating = Number(o.rating);
      return String(o.struggles || '').trim() || (Number.isFinite(rating) && rating > 0 && rating <= 2);
    }).length;
    const pace = formatPlanHealthLine(continuity.planHealth);
    const next = recs[0]
      ? `Next focus: ${recs[0].title} (${recs[0].why})`
      : 'Next focus: keep packing learning days or open Catch Up if behind.';
    blocks.push(
      [
        `**${name}**`,
        `• Open work: ${openCount}${overdue ? ` (${overdue} overdue)` : ''}`,
        `• Recent struggle signals: ${struggles}`,
        pace ? `• Pace: ${pace}` : null,
        `• ${next}`,
      ].filter(Boolean).join('\n'),
    );
  }

  meterPlannerAware(ctx, opts.conversationId, 'parent_progress_summary');

  const body = blocks.length
    ? `This week’s progress snapshot:\n\n${blocks.join('\n\n')}`
    : 'I don’t have enough learner context yet — add children and a few assignments or outcomes, then ask again.';

  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ANSWER,
    message: body.replace(/\*\*/g, ''),
    links: smartActionLinks(),
  });
}
