/**
 * Phase 3 — gather unfinished work, deadlines, recent struggles, and pace
 * for explainable “what should we work on” recommendations.
 */

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

function formatDue(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymd).slice(0, 10))) return null;
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function isOpenAssignment(row) {
  const st = String(row.status || row.assignment_status || '').toLowerCase();
  if (['done', 'completed', 'archived', 'deleted', 'canceled', 'cancelled'].includes(st)) {
    return false;
  }
  if (row.submitted_at || row.completed_at) return false;
  return true;
}

async function loadOpenAssignments(familyId, childId) {
  if (!familyId) return [];
  try {
    const { supabase } = await import('../../supabase.js');
    let query = supabase
      .from('assignments')
      .select('id, title, due_date, child_id, related_subject, status, need_help, description, updated_at, created_at')
      .eq('family_id', familyId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(80);
    if (childId) query = query.eq('child_id', childId);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) {
      // Fallback: RPC per child
      if (childId) {
        const { getAssignments } = await import('../../services/assignmentsClient.js');
        const { data: rpcData } = await getAssignments(childId);
        return (rpcData || []).filter(isOpenAssignment);
      }
      return [];
    }
    return data.filter(isOpenAssignment);
  } catch (_) {
    return [];
  }
}

async function loadRecentOutcomes(familyId, childId, { days = 21 } = {}) {
  if (!familyId) return [];
  try {
    const { supabase } = await import('../../supabase.js');
    const since = new Date();
    since.setDate(since.getDate() - days);
    let evQuery = supabase
      .from('events')
      .select('id, title, subject_id, start_ts, child_id, child_ids')
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .gte('start_ts', since.toISOString())
      .order('start_ts', { ascending: false })
      .limit(60);
    if (childId) {
      // Prefer child_id match; also include multi-child events client-side
      evQuery = evQuery.or(`child_id.eq.${childId},child_ids.cs.{${childId}}`);
    }
    const { data: events, error } = await evQuery;
    if (error || !Array.isArray(events) || !events.length) return [];

    const scoped = childId
      ? events.filter((ev) => {
        if (String(ev.child_id) === String(childId)) return true;
        if (Array.isArray(ev.child_ids) && ev.child_ids.map(String).includes(String(childId))) return true;
        return false;
      })
      : events;

    const ids = scoped.map((e) => e.id).filter(Boolean);
    if (!ids.length) return [];

    const { data: outcomes, error: oErr } = await supabase
      .from('event_outcomes')
      .select('id, event_id, rating, grade, note, strengths, struggles, created_at')
      .in('event_id', ids)
      .order('created_at', { ascending: false })
      .limit(40);
    if (oErr || !Array.isArray(outcomes)) return [];

    const byEvent = new Map(scoped.map((e) => [String(e.id), e]));
    return outcomes.map((o) => ({
      ...o,
      event: byEvent.get(String(o.event_id)) || null,
    }));
  } catch (_) {
    return [];
  }
}

async function loadUpcomingLearning(familyId, childId, { daysAhead = 5 } = {}) {
  if (!familyId) return [];
  try {
    const { supabase } = await import('../../supabase.js');
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + daysAhead);
    to.setHours(23, 59, 59, 999);
    const { data, error } = await supabase
      .from('events')
      .select('id, title, start_ts, end_ts, subject_id, child_id, child_ids, status, event_type, counts_toward_plan')
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .gte('start_ts', from.toISOString())
      .lte('start_ts', to.toISOString())
      .order('start_ts', { ascending: true })
      .limit(80);
    if (error || !Array.isArray(data)) return [];
    return data.filter((ev) => {
      if (String(ev.status || '') === 'canceled' || String(ev.status || '') === 'done') return false;
      if (childId) {
        const match = String(ev.child_id) === String(childId)
          || (Array.isArray(ev.child_ids) && ev.child_ids.map(String).includes(String(childId)));
        if (!match && ev.child_id) return false;
      }
      return Boolean(ev.subject_id || ev.counts_toward_plan);
    });
  } catch (_) {
    return [];
  }
}

async function loadChildInterests(childId) {
  if (!childId) return [];
  try {
    const { supabase } = await import('../../supabase.js');
    const { data, error } = await supabase
      .from('children')
      .select('id, first_name, interests, learning_styles, grade_label')
      .eq('id', childId)
      .maybeSingle();
    if (error || !data) return [];
    const raw = data.interests;
    if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      } catch (_) {
        return raw.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
      }
    }
    return [];
  } catch (_) {
    return [];
  }
}

/**
 * @returns {Promise<{
 *   childId: string|null,
 *   assignments: object[],
 *   outcomes: object[],
 *   upcoming: object[],
 *   interests: string[],
 *   planHealth: object|null,
 * }>}
 */
export async function gatherLearningContinuityContext({
  familyId,
  childId = null,
  academicYearId = null,
} = {}) {
  const [assignments, outcomes, upcoming, interests, planHealth] = await Promise.all([
    loadOpenAssignments(familyId, childId),
    loadRecentOutcomes(familyId, childId),
    loadUpcomingLearning(familyId, childId),
    loadChildInterests(childId),
    (async () => {
      try {
        const { getPlanHealth } = await import('../../services/academicYearClient.js');
        const { data } = await getPlanHealth(familyId, academicYearId);
        return data?.plan_exists ? data : null;
      } catch (_) {
        return null;
      }
    })(),
  ]);

  return {
    childId: childId || null,
    assignments,
    outcomes,
    upcoming,
    interests,
    planHealth,
  };
}

/**
 * Rank recommendable work items with evidence-based why strings.
 * @returns {Array<{
 *   id: string,
 *   kind: 'assignment'|'review'|'upcoming'|'pace'|'interest',
 *   title: string,
 *   subjectId: string|null,
 *   assignmentId?: string,
 *   eventId?: string,
 *   score: number,
 *   why: string,
 *   action: 'learning_day'|'open_assignment'|'catch-up'|'pack-week',
 * }>}
 */
export function rankContinuityRecommendations(ctxBundle, roster = {}) {
  const today = toLocalYmd(new Date());
  const soon = addDaysYmd(today, 3);
  const subjects = roster.subjects || [];
  const subjectName = (id) => {
    const s = subjects.find((row) => String(row.id) === String(id));
    return s?.name || s?.title || null;
  };

  const recs = [];

  for (const a of ctxBundle.assignments || []) {
    const due = a.due_date ? String(a.due_date).slice(0, 10) : null;
    let score = 40;
    const reasons = [];
    if (due && due < today) {
      score += 50;
      reasons.push(`overdue since ${formatDue(due)}`);
    } else if (due && due <= soon) {
      score += 30;
      reasons.push(`due ${formatDue(due)}`);
    } else if (due) {
      score += 10;
      reasons.push(`due ${formatDue(due)}`);
    } else {
      reasons.push('open assignment with no due date');
    }
    if (a.need_help) {
      score += 25;
      reasons.push('marked needs help');
    }
    const subj = subjectName(a.related_subject);
    recs.push({
      id: `asg-${a.id}`,
      kind: 'assignment',
      title: a.title || 'Assignment',
      subjectId: a.related_subject || null,
      subjectName: subj,
      assignmentId: String(a.id),
      score,
      why: reasons.join('; '),
      action: 'open_assignment',
    });
  }

  // Recent struggles → review recommendation
  const struggleSubjects = new Map();
  for (const o of ctxBundle.outcomes || []) {
    const struggles = String(o.struggles || o.note || '').trim();
    const rating = Number(o.rating);
    const subjectId = o.event?.subject_id || null;
    if (!subjectId) continue;
    if (struggles || (Number.isFinite(rating) && rating > 0 && rating <= 2)) {
      const prev = struggleSubjects.get(String(subjectId)) || { count: 0, sample: struggles };
      prev.count += 1;
      if (struggles && !prev.sample) prev.sample = struggles;
      struggleSubjects.set(String(subjectId), prev);
    }
  }
  for (const [subjectId, info] of struggleSubjects.entries()) {
    const name = subjectName(subjectId) || 'Subject';
    const sample = info.sample ? String(info.sample).slice(0, 80) : null;
    recs.push({
      id: `rev-${subjectId}`,
      kind: 'review',
      title: `Review ${name}`,
      subjectId,
      subjectName: name,
      score: 55 + Math.min(20, info.count * 5),
      why: sample
        ? `recent struggle noted: “${sample}”`
        : `low ratings on ${info.count} recent ${name} session${info.count === 1 ? '' : 's'}`,
      action: 'learning_day',
    });
  }

  // Upcoming scheduled learning (continuity — finish what’s planned)
  for (const ev of (ctxBundle.upcoming || []).slice(0, 8)) {
    const ymd = ev.start_ts ? toLocalYmd(new Date(ev.start_ts)) : null;
    if (!ymd) continue;
    const isToday = ymd === today;
    recs.push({
      id: `up-${ev.id}`,
      kind: 'upcoming',
      title: ev.title || 'Scheduled lesson',
      subjectId: ev.subject_id || null,
      subjectName: subjectName(ev.subject_id),
      eventId: String(ev.id),
      score: isToday ? 70 : 35,
      why: isToday
        ? 'already on today’s planner'
        : `scheduled ${formatDue(ymd)}`,
      action: 'learning_day',
    });
  }

  // Pace / behind
  const health = ctxBundle.planHealth;
  if (health) {
    const behindDays = health.constraint_mode === 'days' && health.delta_days != null && health.delta_days < 0;
    const behindHours = health.constraint_mode === 'hours' && health.delta_hours != null && health.delta_hours < 0;
    if (behindDays || behindHours) {
      const why = behindDays
        ? `about ${Math.abs(Number(health.delta_days))} days under the year target`
        : `about ${Math.abs(Number(health.delta_hours)).toFixed(0)} hours under the year target`;
      recs.push({
        id: 'pace-catch-up',
        kind: 'pace',
        title: 'Catch up on plan hours/days',
        subjectId: null,
        score: 45,
        why,
        action: 'catch-up',
      });
    }
  }

  // Interest nudge (low weight — only if little else)
  for (const interest of (ctxBundle.interests || []).slice(0, 2)) {
    const matchSub = subjects.find((s) => {
      const n = String(s.name || s.title || '').toLowerCase();
      return n && String(interest).toLowerCase().includes(n.slice(0, 4));
    });
    if (matchSub) {
      recs.push({
        id: `int-${matchSub.id}`,
        kind: 'interest',
        title: `${matchSub.name || matchSub.title} (interest)`,
        subjectId: String(matchSub.id),
        subjectName: matchSub.name || matchSub.title,
        score: 20,
        why: `matches interest in ${interest}`,
        action: 'learning_day',
      });
    }
  }

  // Dedupe by title+subject, keep highest score
  const byKey = new Map();
  for (const r of recs) {
    const key = `${r.kind}:${r.assignmentId || r.eventId || r.subjectId || r.id}`;
    const prev = byKey.get(key);
    if (!prev || r.score > prev.score) byKey.set(key, r);
  }

  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

export function formatRecommendationDigest(recs, childName = null) {
  const who = childName ? `${childName} ` : '';
  if (!recs.length) {
    return {
      message: `I don’t see overdue work or recent struggles for ${who || 'this learner'}yet. You can schedule a learning day or open Pack This Week.`,
      top: null,
    };
  }
  const top = recs.slice(0, 3);
  const lines = [
    `Here’s what I’d prioritize${childName ? ` for ${childName}` : ''} today:`,
    ...top.map((r, i) => `${i + 1}. ${r.title}${r.subjectName && r.kind !== 'review' ? ` (${r.subjectName})` : ''} — ${r.why}`),
  ];
  return { message: lines.join('\n'), top: top[0], topList: top };
}

/** Answer “why did you recommend X?” from a stored recommendation list. */
export function explainRecommendation(recs, message) {
  const lower = String(message || '').toLowerCase();
  if (!Array.isArray(recs) || !recs.length) return null;
  const hit = recs.find((r) => {
    const title = String(r.title || '').toLowerCase();
    const sub = String(r.subjectName || '').toLowerCase();
    return (title && lower.includes(title.slice(0, Math.min(12, title.length))))
      || (sub && lower.includes(sub));
  }) || recs[0];
  return `I recommended “${hit.title}” because ${hit.why}.`;
}
