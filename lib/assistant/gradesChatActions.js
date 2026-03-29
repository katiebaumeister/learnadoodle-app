/**
 * Grades: insert into public.grades (same RLS as Records / portfolio).
 */

import { supabase } from '../supabase.js';
import { pickChildFromMessage } from './attendanceChatActions.js';
import { resolveSubjectFromUserMessage } from './familyRosterChatActions.js';

function childLabel(c) {
  return (c?.first_name || c?.name || '').trim();
}

function filterSubjectsForChild(subjects, childId) {
  const id = String(childId);
  return (subjects || []).filter((s) => {
    const raw = String(s.student_id || s.child_id || '');
    return raw.split(/[;,]/).some((x) => x.trim() === id);
  });
}

function normalizeLetterGrade(s) {
  const t = String(s).trim();
  if (/^pass$/i.test(t)) return 'Pass';
  if (/^fail$/i.test(t)) return 'Fail';
  const m = t.match(/^([a-f])([+-]?)$/i);
  if (!m) return t;
  return m[1].toUpperCase() + (m[2] || '');
}

/**
 * Detect grade-logging requests and extract child, optional subject, letter and/or numeric grade.
 * @returns {null | { error: string } | { child: object, subjectId: string|null, subjectName: string|null, gradeLetter: string|null, score: number|null, possible: number|null }}
 */
export function parseLogGradeIntent(userMessage, children, subjects) {
  const msg = userMessage.trim();
  const msgLower = msg.toLowerCase();

  const looksLikeGrade =
    (/\b(log|record|add|enter)\b/i.test(msg) && (/\bgrade\b/i.test(msg) || /\bscore\b/i.test(msg))) ||
    /\bgave\s+\w+\s+(?:an?\s+)?[a-z][+-]?\b/i.test(msgLower) ||
    /\bgive\s+\w+\s+(?:an?\s+)?[a-z][+-]?\b/i.test(msgLower);

  if (!looksLikeGrade) return null;

  const active = (children || []).filter((c) => !c.archived);
  if (!active.length) return { error: 'Add a child first, then I can log grades.' };

  let resolvedChild = pickChildFromMessage(msgLower, active);
  if (!resolvedChild && active.length === 1) resolvedChild = active[0];

  const forMid = msg.match(/\bfor\s+(\w+)(?:\s+in\s|\s+on\s|\s*$)/i);
  if (!resolvedChild && forMid) {
    const nm = forMid[1].toLowerCase();
    resolvedChild = active.find(
      (c) =>
        childLabel(c).toLowerCase() === nm || childLabel(c).toLowerCase().startsWith(nm)
    );
  }

  const gaveMatch =
    msg.match(/\bgave\s+(\w+)\s+(?:an?\s+)?([a-f][+-]?)(?=\s|$|[,.!?])/i) ||
    msg.match(/\bgive\s+(\w+)\s+(?:an?\s+)?([a-f][+-]?)(?=\s|$|[,.!?])/i);
  if (!resolvedChild && gaveMatch) {
    const nm = gaveMatch[1].toLowerCase();
    resolvedChild = active.find(
      (c) =>
        childLabel(c).toLowerCase() === nm || childLabel(c).toLowerCase().startsWith(nm)
    );
  }

  if (!resolvedChild) {
    return {
      error: `Which child? (${active.map(childLabel).filter(Boolean).join(', ')}) Say e.g. log grade A for Emma in Algebra.`,
    };
  }

  let gradeLetter = null;
  const g1 = msg.match(/\bgrade\s+(?:of\s+)?([a-f][+-]?|pass|fail)(?=\s|$|[,.!?])/i);
  if (g1) gradeLetter = normalizeLetterGrade(g1[1]);
  if (!gradeLetter && gaveMatch) gradeLetter = normalizeLetterGrade(gaveMatch[2]);
  if (!gradeLetter) {
    const g2 = msg.match(/\b(?:an|a)\s+([a-f][+-]?)(?=\s|$|[,.!?])/i);
    if (g2) gradeLetter = normalizeLetterGrade(g2[1]);
  }

  let score = null;
  let possible = null;
  const s1 = msg.match(/\bscore\s+(?:of\s+)?(\d+(?:\.\d+)?)(?:\s*\/\s*(\d+(?:\.\d+)?))?\b/i);
  if (s1) {
    score = parseFloat(s1[1]);
    if (s1[2]) possible = parseFloat(s1[2]);
  }
  if ((score == null || Number.isNaN(score)) && !possible) {
    const s2 = msg.match(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+)\b/);
    if (s2) {
      score = parseFloat(s2[1]);
      possible = parseFloat(s2[2]);
    }
  }

  if (!gradeLetter && (score == null || Number.isNaN(score))) {
    return {
      error: 'Say a letter grade (e.g. **grade B+**) or a score (e.g. **score 92** or **18/20**).',
    };
  }

  let subjectHint = null;
  const subM =
    msg.match(/\b(?:in|on)\s+([^.!?\n]+?)(?:\s*$)/i) ||
    msg.match(/\b(?:in|on)\s+([^.!?\n,]+?)(?:\s+for\s|\s+and\s)/i);
  if (subM) subjectHint = subM[1].trim().replace(/\s+for\s+\w+$/i, '').trim();

  let subjectId = null;
  let subjectName = null;
  if (subjectHint && subjects?.length) {
    const pool = filterSubjectsForChild(subjects, resolvedChild.id);
    const r = resolveSubjectFromUserMessage(subjectHint, pool, [resolvedChild]);
    if (r.ok) {
      subjectId = r.subject.id;
      subjectName = (r.subject.name || '').trim() || null;
    }
  }

  return {
    child: resolvedChild,
    subjectId,
    subjectName,
    gradeLetter,
    score: score != null && !Number.isNaN(score) ? score : null,
    possible: possible != null && !Number.isNaN(possible) ? possible : null,
  };
}

/**
 * @param {string|null|undefined} profileId - auth user id for created_by
 */
export async function executeLogGradeChat(familyId, profileId, payload) {
  const {
    childId,
    subjectId,
    gradeLetter,
    score,
    possible,
    notes,
  } = payload || {};
  if (!childId) return { success: false, error: 'Missing child.' };
  const grade = gradeLetter != null && String(gradeLetter).trim() !== '' ? String(gradeLetter).trim() : null;
  const sc = score != null && !Number.isNaN(Number(score)) ? Number(score) : null;
  const pos = possible != null && !Number.isNaN(Number(possible)) ? Number(possible) : null;
  if (!grade && sc == null) return { success: false, error: 'Need a letter grade or numeric score.' };

  const row = {
    family_id: familyId,
    child_id: childId,
    subject_id: subjectId || null,
    term_label: null,
    score: sc,
    grade,
    possible: pos,
    credits: 0,
    rubric: null,
    notes: notes || null,
    created_by: profileId || null,
  };

  const { data, error } = await supabase.from('grades').insert(row).select('id').maybeSingle();
  if (error) return { success: false, error: error.message || String(error) };
  return {
    success: true,
    userMessage: 'Grade saved to **Records**.',
    data: data || null,
  };
}

/**
 * Recent grades for Doodle (read-only). Optional childId filters to one learner.
 */
export async function fetchGradesForChat(familyId, childId = null, limit = 30) {
  let q = supabase
    .from('grades')
    .select('id, child_id, subject_id, grade, score, possible, term_label, notes, created_at')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (childId) q = q.eq('child_id', childId);
  const { data, error } = await q;
  return { grades: Array.isArray(data) ? data : [], error: error || null };
}

/**
 * @param {Map<string, object>} childrenById
 * @param {Map<string, { name?: string }>} subjectsById
 */
export function formatGradesListLines(grades, childrenById, subjectsById) {
  if (!grades?.length) {
    return ['No grades on file yet. Ask me to **log a grade** or add them under **Records**.'];
  }
  return grades.map((g) => {
    const ch = g.child_id && childrenById?.get(String(g.child_id));
    const who = ch ? childLabel(ch) : 'Student';
    let sub = '';
    if (g.subject_id && subjectsById?.has(String(g.subject_id))) {
      sub = (subjectsById.get(String(g.subject_id))?.name || '').trim();
    }
    const parts = [];
    if (g.grade) parts.push(String(g.grade).trim());
    if (g.score != null && g.score !== '') {
      const sc = Number(g.score);
      const den = g.possible != null && g.possible !== '' ? `/${g.possible}` : '';
      if (!Number.isNaN(sc)) parts.push(`${sc}${den}`);
    }
    const val = parts.length ? parts.join(' · ') : '—';
    let when = '';
    try {
      if (g.created_at) {
        when = new Date(g.created_at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }
    } catch {
      when = '';
    }
    const subPart = sub ? ` · ${sub}` : '';
    return `• **${who}**${subPart} — ${val}${when ? ` (${when})` : ''}`;
  });
}
