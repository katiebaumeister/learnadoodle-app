/**
 * Assignment find / move / update / delete for Doodle (Sprint A).
 * Disambiguates when multiple match, then ACTION_PREVIEW before mutate.
 */

import { DOODLE_COMMAND_TYPES, DOODLE_RESPONSE_TYPES, assertDoodleResponse } from './types.js';
import { getCommand } from './registry.js';
import { newIdempotencyKey, toYmd } from './commandUtils.js';
import { resolveChildByName, resolveSubjectByName } from './entityResolve.js';
import { fieldPromptFor, dateClarificationOptions } from './actionFieldSchemas.js';

/** Local title score — avoid circular import with intentPreparers. */
function scoreAssignmentTitle(query, title) {
  const q = String(query || '').toLowerCase().trim();
  const t = String(title || '').toLowerCase().trim();
  if (!q || !t) return 0;
  if (t === q || t.includes(q) || q.includes(t)) return 100;
  const qWords = q.split(/\W+/).filter((w) => w.length > 2);
  let score = 0;
  for (const w of qWords) {
    if (t.includes(w)) score += w.length >= 4 ? 4 : 2;
  }
  return score;
}

async function resolveDay(text, fromDate = new Date()) {
  const { resolveFlexibleDay } = await import('./intentPreparers.js');
  return resolveFlexibleDay(text, fromDate);
}

function withClarificationMeta(response, meta) {
  if (response?.type !== DOODLE_RESPONSE_TYPES.CLARIFICATION) return response;
  return { ...response, clarification: { ...(response.clarification || {}), ...meta } };
}

function formatDueShort(dueYmd) {
  if (!dueYmd || !/^\d{4}-\d{2}-\d{2}$/.test(String(dueYmd).slice(0, 10))) return null;
  const d = new Date(`${String(dueYmd).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function linkedEventId(row) {
  const raw = row?.linked_event_ids;
  if (Array.isArray(raw) && raw[0]) return String(raw[0]);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed[0]) return String(parsed[0]);
    } catch (_) { /* ignore */ }
  }
  return row?.linked_event_id || row?.event_id || null;
}

export async function fetchFamilyAssignments(familyId) {
  if (!familyId) return { assignments: [], error: null };
  try {
    const { supabase } = await import('../../supabase.js');
    let query = supabase
      .from('assignments')
      .select('id, title, due_date, child_id, related_subject, status, linked_event_ids, description, created_at, updated_at')
      .eq('family_id', familyId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(150);
    const { data, error } = await query;
    if (error) return { assignments: [], error };
    const rows = (data || []).filter((r) => {
      const st = String(r.status || '').toLowerCase();
      return st !== 'deleted' && st !== 'archived' && st !== 'canceled';
    });
    return { assignments: rows, error: null };
  } catch (err) {
    return { assignments: [], error: err };
  }
}

function extractTitleNeedle(message) {
  const quoted = message.match(/[“"]([^”"]+)[”"]/) || message.match(/'([^']+)'/);
  if (quoted?.[1]) return quoted[1].trim();

  const called = message.match(/\b(?:called|titled|named)\s+["']?([^"'\n,]{2,80})["']?/i);
  if (called?.[1]) return called[1].trim();

  // “move … Fractions Worksheet to Friday” — take words before to/on after assignment/homework
  const afterKind = message.match(
    /\b(?:assignment|homework|classwork)\s+(?:called\s+)?["']?([A-Za-z][^,\n]{1,60}?)["']?\s+(?:to|on|for)\b/i,
  );
  if (afterKind?.[1] && !/^(for|to|on|the|my|our)$/i.test(afterKind[1].trim())) {
    return afterKind[1].trim();
  }

  // Strip verbs / stop words and score remaining tokens against titles later
  let q = String(message || '')
    .replace(/\b(move|reschedule|shift|push|postpone|update|edit|change|rename|delete|remove|set)\b/gi, ' ')
    .replace(/\b(assignment|homework|classwork|due|date|to|on|for|the|a|an|my|our)\b/gi, ' ')
    .replace(/\b(today|tomorrow|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+week)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Drop leading child/subject-like single tokens handled elsewhere
  return q.length >= 3 ? q : '';
}

async function parseTargetDueYmd(message, overrides = {}) {
  if (overrides.dueAt) {
    const d = new Date(overrides.dueAt);
    if (!Number.isNaN(d.getTime())) return toYmd(d);
  }
  if (overrides.date && /^\d{4}-\d{2}-\d{2}$/.test(String(overrides.date).slice(0, 10))) {
    return String(overrides.date).slice(0, 10);
  }
  const toMatch = message.match(
    /\b(?:to|until|by|on)\s+(today|tomorrow|yesterday|next\s+\w+|\w+day|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i,
  );
  if (toMatch) {
    return (await resolveDay(toMatch[1], new Date())) || null;
  }
  const dueMatch = message.match(/\bdue\s+(today|tomorrow|\w+day|\d{4}-\d{2}-\d{2})\b/i);
  if (dueMatch) {
    return (await resolveDay(dueMatch[1], new Date())) || null;
  }
  return null;
}

/**
 * Score and filter assignment rows for a user message.
 * @returns {{ ok: true, assignment: object } | { ok: false, candidates: object[], clarification?: object }}
 */
export function resolveAssignmentFromMessage(message, assignments, roster = {}, overrides = {}) {
  if (overrides.assignmentId) {
    const hit = (assignments || []).find((a) => String(a.id) === String(overrides.assignmentId));
    if (hit) return { ok: true, assignment: hit };
    // Trust override even if not in list (e.g. draft after chip pick)
    if (overrides.assignmentTitle || overrides.title) {
      return {
        ok: true,
        assignment: {
          id: overrides.assignmentId,
          title: overrides.assignmentTitle || overrides.title,
          due_date: overrides.due_date || overrides.originalDueYmd || null,
          child_id: overrides.childId || (overrides.childIds || [])[0] || null,
          related_subject: overrides.subjectId || null,
          linked_event_ids: overrides.eventId ? [overrides.eventId] : [],
        },
      };
    }
  }

  let pool = Array.isArray(assignments) ? [...assignments] : [];
  if (!pool.length) return { ok: false, candidates: [] };

  let childId = overrides.childId || (overrides.childIds || [])[0] || null;
  const forMatch = message.match(/\bfor\s+([A-Za-z][A-Za-z'-]*)\b/i)
    || message.match(/\b([A-Za-z][A-Za-z]+)'s\s+(?:math|history|science|reading|english|assignment|homework|worksheet)\b/i);
  if (!childId && forMatch) {
    const resolved = resolveChildByName(forMatch[1], roster.children || []);
    if (resolved.clarification) {
      return { ok: false, candidates: [], childClarification: resolved.clarification };
    }
    if (resolved.ok) childId = String(resolved.child.id);
  }
  if (childId) {
    pool = pool.filter((a) => !a.child_id || String(a.child_id) === String(childId));
  }

  let subjectId = overrides.subjectId || null;
  const inSubject = message.match(/\b(?:in|for)\s+([A-Za-z][A-Za-z0-9 &/-]{1,40})\s+assignment\b/i);
  const bareSubject = message.match(/\b(history|math|science|reading|english|writing|art|music)\b/i);
  const possessiveSubject = message.match(/\b(?:'s)\s+(history|math|science|reading|english)\b/i);
  const needleSub = inSubject?.[1] || possessiveSubject?.[1] || bareSubject?.[1];
  if (!subjectId && needleSub) {
    const resolved = resolveSubjectByName(needleSub.trim(), roster.subjects || []);
    if (resolved.ok) subjectId = String(resolved.subject.id);
  }
  if (subjectId) {
    const filtered = pool.filter((a) => String(a.related_subject || '') === String(subjectId));
    if (filtered.length) pool = filtered;
  }

  // Drop child/subject tokens from the title needle so “Emma's math …” doesn’t wipe matches.
  let titleNeedle = overrides.title || extractTitleNeedle(message);
  if (titleNeedle) {
    titleNeedle = titleNeedle
      .replace(/\b(emma|noah|lilly|max|math|history|science|reading|english)\b/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  const childNames = (roster.children || [])
    .map((c) => String(c.first_name || c.name || '').toLowerCase())
    .filter(Boolean);
  const subjectNames = (roster.subjects || [])
    .map((s) => String(s.name || s.title || '').toLowerCase())
    .filter(Boolean);
  if (titleNeedle) {
    for (const n of [...childNames, ...subjectNames]) {
      titleNeedle = titleNeedle.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), ' ');
    }
    titleNeedle = titleNeedle.replace(/\s{2,}/g, ' ').trim();
  }

  const scored = pool.map((row) => {
    let score = scoreAssignmentTitle(titleNeedle, row.title || '');
    if (childId && String(row.child_id) === String(childId)) score += 8;
    if (subjectId && String(row.related_subject) === String(subjectId)) score += 8;
    if (row.due_date) score += 1;
    return { row, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const titleHits = titleNeedle
    ? scored.filter((s) => scoreAssignmentTitle(titleNeedle, s.row.title || '') > 0)
    : [];

  // Prefer title hits; else child/subject-filtered pool; else full pool.
  let candidates = titleHits.length
    ? titleHits.map((s) => s.row)
    : ((childId || subjectId) ? pool : scored.map((s) => s.row));

  if (!candidates.length) candidates = pool.slice(0, 8);

  if (titleHits.length === 1) {
    return { ok: true, assignment: titleHits[0].row, childId, subjectId };
  }
  if (
    titleHits.length > 1
    && titleHits[0].score - titleHits[1].score >= 10
    && scoreAssignmentTitle(titleNeedle, titleHits[0].row.title || '') >= 20
  ) {
    return { ok: true, assignment: titleHits[0].row, childId, subjectId };
  }
  if (candidates.length === 1) {
    return { ok: true, assignment: candidates[0], childId, subjectId };
  }
  return {
    ok: false,
    candidates: candidates.slice(0, 8),
    childId,
    subjectId,
  };
}

function assignmentChoiceOptions(candidates, roster = {}) {
  return candidates.slice(0, 8).map((a) => {
    const due = formatDueShort(a.due_date);
    const child = (roster.children || []).find((c) => String(c.id) === String(a.child_id));
    const who = child?.first_name || child?.name || '';
    const bits = [a.title || 'Assignment'];
    if (due) bits.push(due);
    if (who) bits.push(who);
    return {
      id: String(a.id),
      label: bits.join(' — '),
      value: String(a.id),
      field: 'assignmentId',
    };
  });
}

function childNameFor(row, roster) {
  const c = (roster.children || []).find((x) => String(x.id) === String(row.child_id));
  return c?.first_name || c?.name || null;
}

function subjectNameFor(row, roster) {
  const s = (roster.subjects || []).find((x) => String(x.id) === String(row.related_subject));
  return s?.name || s?.title || null;
}

export function isAssignmentMoveIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!lower.trim()) return false;
  if (/\b(how\s+(do|to|can)|where\s+(do|can)|explain)\b/.test(lower)) return false;
  if (!/\b(move|reschedule|shift|push|postpone)\b/.test(lower)) return false;
  if (/\b(learning\s*day|day\s*off|appointment|dentist|doctor|field\s*trip)\b/.test(lower)) {
    return false;
  }
  return (
    /\b(assignment|homework|classwork)\b/.test(lower)
    || (/\b(math|history|science|reading|english)\b/.test(lower)
      && /\b(assignment|homework|worksheet|practice|essay)\b/.test(lower))
  );
}

export function isAssignmentDeleteIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (!/\b(delete|remove)\b/.test(lower)) return false;
  if (/\b(learning\s*day|day\s*off|event|material|subject|child)\b/.test(lower)) return false;
  return /\b(assignment|homework|classwork)\b/.test(lower);
}

export function isAssignmentUpdateIntent(message) {
  const lower = String(message || '').toLowerCase();
  if (isAssignmentDeleteIntent(message) || isAssignmentMoveIntent(message)) return false;
  if (/\b(how\s+(do|to|can)|create|add|new)\b/.test(lower)) return false;
  if (!/\b(assignment|homework|classwork)\b/.test(lower)) return false;
  return (
    /\b(update|edit|change|rename|set)\b/.test(lower)
    || /\b(instructions?|points?|title)\b/.test(lower)
  );
}

function assignmentPickClarification(message, intent, candidates, roster, draft) {
  const n = candidates.length;
  const lead = n > 1
    ? `I found ${n} matching assignments. Which one should I ${intent === 'assignment.delete' ? 'delete' : intent === 'assignment.move' ? 'move' : 'update'}?`
    : 'Which assignment did you mean?';
  return withClarificationMeta(assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
    message: lead,
    options: assignmentChoiceOptions(candidates, roster),
  }), {
    intent,
    field: 'assignmentId',
    originalMessage: message,
    draft: { ...draft },
  });
}

async function loadAssignments(ctx, overrides) {
  if (Array.isArray(overrides._assignments)) {
    return { assignments: overrides._assignments, error: null };
  }
  return fetchFamilyAssignments(ctx.householdId);
}

export async function prepareAssignmentMove(message, ctx, roster, overrides = {}) {
  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('assignments')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Assignments are not enabled for this household.',
      recoverable: false,
    });
  }

  const { assignments, error } = await loadAssignments(ctx, overrides);
  if (error && !assignments.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not load assignments: ${error.message || error}`,
      recoverable: true,
    });
  }

  const resolved = resolveAssignmentFromMessage(message, assignments, roster, overrides);
  if (resolved.childClarification) {
    return withClarificationMeta(assertDoodleResponse(resolved.childClarification), {
      intent: 'assignment.move',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!resolved.ok) {
    if (!resolved.candidates?.length) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which assignment should I move? Try “move Emma’s math Fractions Worksheet to Friday”.',
      });
    }
    return assignmentPickClarification(message, 'assignment.move', resolved.candidates, roster, {
      ...overrides,
      childId: resolved.childId,
      subjectId: resolved.subjectId,
    });
  }

  const row = resolved.assignment;
  const dueYmd = await parseTargetDueYmd(message, overrides);
  if (!dueYmd) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: fieldPromptFor('assignment.move', 'date') || 'Which day should I move it to?',
      options: dateClarificationOptions('date'),
    }), {
      intent: 'assignment.move',
      field: 'date',
      originalMessage: message,
      draft: {
        ...overrides,
        assignmentId: String(row.id),
        assignmentTitle: row.title,
        originalDueYmd: row.due_date || null,
        eventId: linkedEventId(row),
        childId: row.child_id,
        subjectId: row.related_subject,
      },
    });
  }

  const originalDueLabel = formatDueShort(row.due_date) || 'Not set';
  const newDueLabel = formatDueShort(dueYmd) || dueYmd;
  const student = childNameFor(row, roster);
  const subject = subjectNameFor(row, roster);

  const command = {
    type: DOODLE_COMMAND_TYPES.ASSIGNMENT_UPDATE,
    householdId: ctx.householdId,
    assignmentId: String(row.id),
    eventId: linkedEventId(row),
    title: row.title || 'Assignment',
    childIds: row.child_id ? [String(row.child_id)] : [],
    subjectId: row.related_subject || null,
    subjectName: subject,
    childNames: student,
    originalDueYmd: row.due_date ? String(row.due_date).slice(0, 10) : null,
    dueAt: new Date(`${dueYmd}T12:00:00`).toISOString(),
    dueYmd,
    originalDueLabel,
    newDueLabel,
    patch: { dueYmd },
    actionLabel: 'Move due date',
  };

  const handler = getCommand(DOODLE_COMMAND_TYPES.ASSIGNMENT_UPDATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Move assignment',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Confirm change',
    idempotencyKey: newIdempotencyKey('assign_move'),
  });
}

export async function prepareAssignmentUpdate(message, ctx, roster, overrides = {}) {
  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('assignments')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Assignments are not enabled for this household.',
      recoverable: false,
    });
  }

  const { assignments, error } = await loadAssignments(ctx, overrides);
  if (error && !assignments.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not load assignments: ${error.message || error}`,
      recoverable: true,
    });
  }

  const resolved = resolveAssignmentFromMessage(message, assignments, roster, overrides);
  if (resolved.childClarification) {
    return withClarificationMeta(assertDoodleResponse(resolved.childClarification), {
      intent: 'assignment.update',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!resolved.ok) {
    if (!resolved.candidates?.length) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which assignment should I update? Include part of the title, like “rename Fractions Worksheet to Fraction Practice”.',
      });
    }
    return assignmentPickClarification(message, 'assignment.update', resolved.candidates, roster, {
      ...overrides,
      childId: resolved.childId,
      subjectId: resolved.subjectId,
    });
  }

  const row = resolved.assignment;
  const patch = { ...(overrides.patch || {}) };
  const lower = String(message || '').toLowerCase();

  const rename = message.match(/\brename\s+(?:(?:the|this)\s+)?(?:assignment\s+)?(?:to\s+)?["']?([^"'\n]{2,120})["']?/i)
    || message.match(/\b(?:change|set)\s+(?:the\s+)?title\s+(?:to|as)\s+["']?([^"'\n]{2,120})["']?/i);
  if (rename && !patch.title) patch.title = rename[1].trim().replace(/[.?!]+$/, '');

  let dueYmd = await parseTargetDueYmd(message, overrides);
  if (dueYmd) patch.dueYmd = dueYmd;

  const instr = message.match(/\b(?:instructions?|directions?)\s*(?:to|as|:)\s+["']?([^"'\n]{2,400})["']?/i);
  if (instr && patch.instructions === undefined) patch.instructions = instr[1].trim();

  const points = message.match(/\b(\d{1,4})\s*points?\b/i);
  if (points && patch.pointsPossible == null) patch.pointsPossible = Number(points[1]);

  // Free-text follow-up after “what should I change?”
  if (overrides.patchDetailMessage) {
    const follow = String(overrides.patchDetailMessage);
    const followDue = await parseTargetDueYmd(follow, {});
    if (followDue) patch.dueYmd = followDue;
    const followRename = follow.match(/\b(?:to|as|rename)\s+["']?([^"'\n]{2,120})["']?/i);
    if (followRename && !patch.title && !/\b(friday|monday|tuesday|wednesday|thursday|saturday|sunday|today|tomorrow)\b/i.test(followRename[1])) {
      patch.title = followRename[1].trim();
    }
  }

  if (!Object.keys(patch).length) {
    return withClarificationMeta(assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
      message: `What should I change on “${row.title || 'this assignment'}”? Try due date, title, instructions, or points.`,
    }), {
      intent: 'assignment.update',
      field: 'patchDetail',
      originalMessage: message,
      draft: {
        assignmentId: String(row.id),
        assignmentTitle: row.title,
        eventId: linkedEventId(row),
        childId: row.child_id,
        subjectId: row.related_subject,
        originalDueYmd: row.due_date || null,
      },
    });
  }

  void lower;

  const command = {
    type: DOODLE_COMMAND_TYPES.ASSIGNMENT_UPDATE,
    householdId: ctx.householdId,
    assignmentId: String(row.id),
    eventId: linkedEventId(row),
    title: patch.title || row.title || 'Assignment',
    childIds: row.child_id ? [String(row.child_id)] : [],
    subjectId: row.related_subject || null,
    subjectName: subjectNameFor(row, roster),
    childNames: childNameFor(row, roster),
    originalDueYmd: row.due_date ? String(row.due_date).slice(0, 10) : null,
    dueAt: patch.dueYmd ? new Date(`${patch.dueYmd}T12:00:00`).toISOString() : undefined,
    dueYmd: patch.dueYmd || undefined,
    originalDueLabel: formatDueShort(row.due_date),
    newDueLabel: patch.dueYmd ? formatDueShort(patch.dueYmd) : null,
    instructions: patch.instructions,
    pointsPossible: patch.pointsPossible,
    patch,
    actionLabel: patch.dueYmd && !patch.title ? 'Move due date' : 'Update assignment',
  };

  const handler = getCommand(DOODLE_COMMAND_TYPES.ASSIGNMENT_UPDATE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: command.actionLabel,
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Confirm change',
    idempotencyKey: newIdempotencyKey('assign_upd'),
  });
}

export async function prepareAssignmentDelete(message, ctx, roster, overrides = {}) {
  if (ctx.enabledFeatures?.length && !ctx.enabledFeatures.includes('assignments')) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: 'Assignments are not enabled for this household.',
      recoverable: false,
    });
  }

  const { assignments, error } = await loadAssignments(ctx, overrides);
  if (error && !assignments.length) {
    return assertDoodleResponse({
      type: DOODLE_RESPONSE_TYPES.ERROR,
      message: `Could not load assignments: ${error.message || error}`,
      recoverable: true,
    });
  }

  const resolved = resolveAssignmentFromMessage(message, assignments, roster, overrides);
  if (resolved.childClarification) {
    return withClarificationMeta(assertDoodleResponse(resolved.childClarification), {
      intent: 'assignment.delete',
      field: 'childId',
      originalMessage: message,
      draft: { ...overrides },
    });
  }
  if (!resolved.ok) {
    if (!resolved.candidates?.length) {
      return assertDoodleResponse({
        type: DOODLE_RESPONSE_TYPES.CLARIFICATION,
        message: 'Which assignment should I delete? Try “delete Fractions Worksheet assignment”.',
      });
    }
    return assignmentPickClarification(message, 'assignment.delete', resolved.candidates, roster, {
      ...overrides,
      childId: resolved.childId,
      subjectId: resolved.subjectId,
    });
  }

  const row = resolved.assignment;
  const command = {
    type: DOODLE_COMMAND_TYPES.ASSIGNMENT_DELETE,
    householdId: ctx.householdId,
    assignmentId: String(row.id),
    eventId: linkedEventId(row),
    title: row.title || 'Assignment',
    dueLabel: formatDueShort(row.due_date) || '—',
    subjectId: row.related_subject || null,
  };
  const handler = getCommand(DOODLE_COMMAND_TYPES.ASSIGNMENT_DELETE);
  return assertDoodleResponse({
    type: DOODLE_RESPONSE_TYPES.ACTION_PREVIEW,
    message: 'Delete assignment',
    command,
    preview: handler.preview(command),
    confirmationLabel: 'Delete assignment',
    idempotencyKey: newIdempotencyKey('assign_del'),
  });
}
