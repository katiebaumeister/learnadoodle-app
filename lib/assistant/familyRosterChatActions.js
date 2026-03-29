/**
 * Children + subjects: same tables/RPCs as Family settings and Edit Child.
 */

import { supabase } from '../supabase.js';
import { pickChildFromMessage } from './attendanceChatActions.js';

function displayChildName(c) {
  return (c?.first_name || c?.name || '').trim();
}

/**
 * @param {{ first_name?: string, name?: string, grade?: string, archived?: boolean }[]} children
 */
export function formatChildrenListLines(children) {
  const active = (children || []).filter((c) => !c.archived);
  if (!active.length) return ['No active children on file. Add one under **Family**.'];
  return active.map((c) => {
    const n = displayChildName(c) || 'Child';
    const g = c.grade != null && String(c.grade).trim() !== '' ? ` — grade ${c.grade}` : '';
    return `• ${n}${g}`;
  });
}

export async function fetchSubjectsForFamily(familyId) {
  const { data, error } = await supabase
    .from('subject')
    .select('id, name, child_id, student_id')
    .eq('family_id', familyId)
    .order('name', { ascending: true });
  return { subjects: data || [], error: error || null };
}

export function formatSubjectsListLines(subjects, childrenById) {
  if (!subjects?.length) return ['No subjects yet. Add them under **Subjects** or **Family**.'];
  return subjects.slice(0, 40).map((s) => {
    const name = (s.name || 'Untitled').trim();
    const cid = s.student_id || s.child_id;
    let who = '';
    if (cid && childrenById) {
      const idStr = String(cid).split(';')[0].trim();
      const ch = childrenById.get(idStr);
      if (ch) who = ` — ${displayChildName(ch)}`;
    }
    return `• ${name}${who}`;
  });
}

/**
 * @returns {{ child: object } | { error: string } | null}
 */
export function parseRenameChild(userMessage, children) {
  const m =
    userMessage.match(/\brename\s+(\w+)\s+to\s+(\w+)\b/i) ||
    userMessage.match(/\bchange\s+(\w+)'?s?\s+name\s+to\s+(\w+)\b/i);
  if (!m) return null;
  const from = m[1].toLowerCase();
  const to = m[2].trim();
  if (to.length < 1) return { error: 'New name is too short.' };
  const child = (children || []).find((c) => displayChildName(c).toLowerCase() === from);
  if (!child) return { error: `I couldn't find a child named "${m[1]}".` };
  return { child, updates: { first_name: to.charAt(0).toUpperCase() + to.slice(1).toLowerCase() } };
}

/**
 * @returns {{ child: object, updates: object } | { error: string } | null}
 */
export function parseGradeChild(userMessage, children) {
  const m =
    userMessage.match(/\bset\s+(\w+)'?s?\s+grade\s+to\s+(.+)$/i) ||
    userMessage.match(/\bchange\s+(\w+)'?s?\s+grade\s+to\s+(.+)$/i);
  if (!m) return null;
  const from = m[1].toLowerCase();
  const grade = m[2].trim().replace(/[.,;]+$/, '');
  const child = (children || []).find((c) => displayChildName(c).toLowerCase() === from);
  if (!child) return { error: `I couldn't find a child named "${m[1]}".` };
  return { child, updates: { grade } };
}

export function resolveChildForRosterAction(userMessage, children) {
  const msgLower = userMessage.toLowerCase();
  const active = (children || []).filter((c) => !c.archived);
  const child = pickChildFromMessage(msgLower, active);
  if (child) return { child };
  if (active.length === 1) return { child: active[0] };
  return { error: `Which child? (${active.map((c) => displayChildName(c)).filter(Boolean).join(', ')})` };
}

/** Intent classifier gates archive vs delete; here we only resolve which child. */
export function parseArchiveChildIntent(userMessage, children) {
  const r = resolveChildForRosterAction(userMessage, children);
  if (r.error) return { error: r.error };
  return { child: r.child };
}

export function parseDeleteChildPermanentIntent(userMessage, children) {
  const r = resolveChildForRosterAction(userMessage, children);
  if (r.error) return { error: r.error };
  return { child: r.child };
}

/**
 * @returns {{ child: object, subjectName: string } | { error: string } | null}
 */
export function parseAddSubjectIntent(userMessage, children) {
  if (!/\b(add|create)\b/i.test(userMessage) || !/\b(subject|class|course)\b/i.test(userMessage)) return null;
  const quoted = userMessage.match(/["']([^"']{2,80})["']/);
  let subjectName = quoted ? quoted[1].trim() : null;
  if (!subjectName) {
    const m = userMessage.match(
      /\b(?:subject|class|course)\s+(?:called|named)?\s*([^,.!?\n]+?)(?:\s+for\s+\w+|\s*$)/i
    );
    if (m) subjectName = m[1].replace(/^(called|named)\s+/i, '').trim();
  }
  if (!subjectName || subjectName.length < 2) {
    return { error: 'Say a subject name, e.g. add subject Algebra for Emma.' };
  }
  subjectName = subjectName.replace(/\s+for\s+\w+$/i, '').trim();

  const active = (children || []).filter((c) => !c.archived);
  const msgLower = userMessage.toLowerCase();
  const forMatch = userMessage.match(/\bfor\s+(\w+)/i);
  if (forMatch) {
    const nm = forMatch[1].toLowerCase();
    const c = active.find(
      (x) =>
        displayChildName(x).toLowerCase() === nm ||
        displayChildName(x).toLowerCase().startsWith(nm)
    );
    if (c) return { child: c, subjectName };
  }
  const picked = pickChildFromMessage(msgLower, active);
  if (picked) return { child: picked, subjectName };
  if (active.length === 1) return { child: active[0], subjectName };
  return {
    error: `Which child is this for? (${active.map((c) => displayChildName(c)).filter(Boolean).join(', ')})`,
  };
}

export async function executeUpdateChildChat(familyId, childId, updates) {
  const allowed = {};
  if (updates.first_name != null) allowed.first_name = String(updates.first_name).trim();
  if (updates.grade != null) allowed.grade = String(updates.grade).trim();
  if (Object.keys(allowed).length === 0) return { success: false, error: 'No allowed fields to update.' };
  const { error } = await supabase.from('children').update(allowed).eq('id', childId).eq('family_id', familyId);
  if (error) return { success: false, error: error.message || String(error) };
  return { success: true, userMessage: 'Child profile updated.' };
}

export async function executeArchiveChildChat(familyId, childId) {
  const { error } = await supabase.from('children').update({ archived: true }).eq('id', childId).eq('family_id', familyId);
  if (error) return { success: false, error: error.message || String(error) };
  return { success: true, userMessage: 'Child archived. Restore them anytime from **Family**.' };
}

export async function executeDeleteChildPermanentChat(familyId, childId, confirmName) {
  const { data, error } = await supabase.rpc('delete_child_permanently', {
    _family: familyId,
    _child: childId,
    _confirm_name: confirmName,
  });
  if (error) return { success: false, error: error.message || String(error) };
  if (!data?.ok) {
    const reason = data?.reason || 'failed';
    if (reason === 'name_mismatch') return { success: false, error: 'Name did not match — no changes made.' };
    if (reason === 'forbidden') return { success: false, error: 'You do not have permission.' };
    return { success: false, error: reason };
  }
  return { success: true, userMessage: 'That learner was permanently removed from your family.' };
}

export async function executeAddSubjectChat(familyId, childId, subjectName) {
  const { data: ch, error: chErr } = await supabase
    .from('children')
    .select('id, grade')
    .eq('id', childId)
    .eq('family_id', familyId)
    .maybeSingle();
  if (chErr || !ch) return { success: false, error: 'Child not found for this family.' };
  const row = {
    family_id: familyId,
    name: subjectName.trim(),
    child_id: String(childId),
    grade: ch.grade ?? null,
    notes: null,
  };
  let { error } = await supabase.from('subject').insert(row);
  if (error && error.code === '42703') {
    const minimal = { family_id: familyId, name: row.name, child_id: row.child_id, notes: null };
    const retry = await supabase.from('subject').insert(minimal);
    error = retry.error;
  }
  if (error) return { success: false, error: error.message || String(error) };
  return { success: true, userMessage: `Added subject **${subjectName.trim()}**.` };
}

/**
 * Parse rename for planner subjects (word "subject" must appear).
 * @returns {{ oldHint: string, newName: string, forChild?: string } | null}
 */
export function parseRenameSubjectTitles(userMessage) {
  const msg = userMessage.trim();
  if (!/\bsubject\b/i.test(msg)) return null;

  const quotedPair =
    msg.match(/\brename\s+(?:the\s+)?subject\s+["']([^"']{2,120})["']\s+to\s+["']([^"']{2,120})["']/i) ||
    msg.match(/\brename\s+["']([^"']{2,120})["']\s+subject\s+to\s+["']([^"']{2,120})["']/i) ||
    msg.match(
      /\bchange\s+(?:the\s+)?(?:name|title)\s+(?:of|for)\s+(?:the\s+)?subject\s+["']([^"']{2,120})["']\s+to\s+["']([^"']{2,120})["']/i
    );
  if (quotedPair) {
    return { oldHint: quotedPair[1].trim(), newName: quotedPair[2].trim() };
  }

  let m = msg.match(/\brename\s+(?:the\s+)?subject\s+(.+?)\s+to\s+(.+?)(?:\s+for\s+(\w+))?\s*$/is);
  if (!m) m = msg.match(/\brename\s+(.+?)\s+subject\s+to\s+(.+?)(?:\s+for\s+(\w+))?\s*$/is);
  if (!m) {
    m = msg.match(
      /\bchange\s+(?:the\s+)?(?:name|title)\s+(?:of|for)\s+(?:the\s+)?subject\s+(.+?)\s+to\s+(.+?)(?:\s+for\s+(\w+))?\s*$/is
    );
  }
  if (!m) return null;
  const oldHint = m[1].trim().replace(/^["']|["']$/g, '');
  const newName = m[2].trim().replace(/^["']|["']$/g, '').replace(/[.!?]+$/g, '');
  const forChild = m[3] ? m[3].trim() : null;
  if (oldHint.length < 2 || newName.length < 1) return null;
  return forChild ? { oldHint, newName, forChild } : { oldHint, newName };
}

export async function executeUpdateSubjectChat(familyId, subjectId, newName) {
  const name = String(newName || '').trim();
  if (!name) return { success: false, error: 'Subject name is empty.' };
  const { error } = await supabase.from('subject').update({ name }).eq('id', subjectId).eq('family_id', familyId);
  if (error) return { success: false, error: error.message || String(error) };
  return { success: true, userMessage: `Renamed subject to **${name}**.` };
}

const SUBJECT_DELETE_STOP = new Set([
  'delete',
  'remove',
  'drop',
  'trash',
  'the',
  'a',
  'an',
  'subject',
  'subjects',
  'class',
  'course',
  'from',
  'my',
  'our',
  'please',
  'this',
  'that',
]);

function tokenizeSubjectDeleteQuery(msg) {
  return (msg || '')
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2 && !SUBJECT_DELETE_STOP.has(w));
}

/**
 * @param {Map<string, object>} childrenById
 */
export function summarizeSubjectLineForChat(s, childrenById) {
  const name = (s?.name || 'Untitled').trim();
  const cid = s.student_id || s.child_id;
  let who = '';
  if (cid && childrenById) {
    const idStr = String(cid).split(';')[0].trim();
    const ch = childrenById.get(idStr);
    if (ch) who = ` — ${displayChildName(ch)}`;
  }
  return `• ${name}${who}`;
}

/**
 * @param {object[]} children - for optional "for Emma" narrowing (same as add subject)
 * @returns {{ ok: true, subject: object } | { ok: false, candidates?: object[], reason?: string }}
 */
export function resolveSubjectFromUserMessage(userMessage, subjects, children) {
  const activeChildren = (children || []).filter((c) => !c.archived);
  let pool = subjects || [];

  const forMatch = userMessage.match(/\bfor\s+(\w+)/i);
  if (forMatch) {
    const nm = forMatch[1].toLowerCase();
    const c = activeChildren.find(
      (x) =>
        displayChildName(x).toLowerCase() === nm ||
        displayChildName(x).toLowerCase().startsWith(nm)
    );
    if (c) {
      const id = String(c.id);
      pool = pool.filter((s) => {
        const raw = String(s.student_id || s.child_id || '');
        return raw.split(/[;,]/).some((x) => x.trim() === id);
      });
    }
  }

  const quoted = userMessage.match(/["']([^"']{2,80})["']/);
  if (quoted) {
    const q = quoted[1].toLowerCase();
    const exact = pool.filter((s) => (s.name || '').toLowerCase().includes(q));
    if (exact.length === 1) return { ok: true, subject: exact[0] };
    if (exact.length > 1) return { ok: false, candidates: exact.slice(0, 8), reason: 'ambiguous' };
  }

  const words = tokenizeSubjectDeleteQuery(userMessage);
  if (words.length === 0) {
    return { ok: false, reason: 'no_query', candidates: pool.slice(0, 8) };
  }

  const scored = pool.map((s) => {
    const t = (s.name || '').toLowerCase();
    let score = 0;
    for (const w of words) {
      if (t.includes(w)) score += w.length >= 4 ? 3 : 2;
    }
    return { s, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score < 2) {
    return { ok: false, reason: 'no_match', candidates: pool.slice(0, 8) };
  }
  const second = scored[1];
  if (second && second.score === best.score && second.s.id !== best.s.id) {
    const tied = scored.filter((x) => x.score === best.score).map((x) => x.s);
    return { ok: false, candidates: tied.slice(0, 8), reason: 'ambiguous' };
  }
  return { ok: true, subject: best.s };
}

export function stripSubjectForDisambiguation(s) {
  if (!s) return null;
  return { id: s.id, name: s.name, child_id: s.child_id, student_id: s.student_id };
}
