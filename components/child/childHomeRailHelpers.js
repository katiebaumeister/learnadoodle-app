/**
 * Helpers for child home right rail (school-work filters, categorization).
 */

const NON_SCHOOL = new Set([
  'appointment',
  'trip',
  'holiday',
  'sport',
  'extracurricular',
  'birthday',
  'break',
]);

const SCHOOL_HINTS = [
  'assignment',
  'homework',
  'lesson',
  'project',
  'assessment',
  'exam',
  'test',
  'quiz',
  'study',
  'class',
  'activity',
];

/** Explicit schoolwork types (planner + rail); keep in sync with planner event pickers. */
const SCHOOLWORK_EXACT = new Set([
  'assignment',
  'homework',
  'lesson',
  'project',
  'assessment',
  'exam',
  'test',
  'quiz',
  'activity',
]);

/**
 * Event types where “Ask parent for help” / child rail tabs apply (schoolwork-shaped).
 * Covers lesson, project, exam, assignment activities, etc.
 */
export function isSchoolWorkEventType(eventType) {
  if (!eventType || typeof eventType !== 'string') return false;
  const x = eventType.trim().toLowerCase();
  if (NON_SCHOOL.has(x)) return false;
  if (SCHOOLWORK_EXACT.has(x)) return true;
  if (SCHOOL_HINTS.some((h) => x.includes(h))) return true;
  return false;
}

/**
 * Short label for planner event chips / rail rows (Lesson, Project, …).
 */
export function formatSchoolEventTypeLabel(eventType) {
  if (!eventType || typeof eventType !== 'string') return 'Schoolwork';
  const raw = eventType.trim();
  if (!raw) return 'Schoolwork';
  if (raw.length <= 22) return raw;
  return `${raw.slice(0, 20)}…`;
}

/**
 * UUIDs of planner events already backed by an assignment row (avoid duplicate rows in Help).
 */
export function linkedEventIdsFromAssignments(assignments) {
  const ids = new Set();
  for (const a of assignments || []) {
    const raw = a?.linked_event_ids;
    if (!raw) continue;
    const arr = Array.isArray(raw) ? raw : [];
    for (const id of arr) {
      if (id) ids.add(String(id));
    }
  }
  return ids;
}

/**
 * Planner events to show for “ask for help” when there is no assignment row yet.
 */
export function filterPlannerEventsForHelp(events, linkedEventIds, { search = '' } = {}) {
  const q = (search || '').trim().toLowerCase();
  const linked = linkedEventIds instanceof Set ? linkedEventIds : new Set(linkedEventIds || []);
  const list = (events || []).filter((e) => {
    if (!e?.id) return false;
    if (linked.has(String(e.id))) return false;
    if (!isSchoolWorkEventType(e.event_type)) return false;
    if (!q) return true;
    const t = (e.title || '').toLowerCase();
    const typ = (e.event_type || '').toLowerCase();
    const sn = (e.subject?.name || '').toLowerCase();
    return t.includes(q) || typ.includes(q) || sn.includes(q);
  });
  return list.sort(
    (a, b) => new Date(b.start_ts || 0).getTime() - new Date(a.start_ts || 0).getTime()
  );
}

function hasLinkedPlannerEvents(a) {
  const raw = a?.linked_event_ids;
  if (!raw) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === 'object') return Object.keys(raw).length > 0;
  return false;
}

/** Assignments created from the child “ask for help” flow — not “parent sent you work”. */
export function isChildHelpAssignment(a) {
  return (a?.title || '').trim().toLowerCase().startsWith('help:');
}

/**
 * Urgent Submissions rail + orange tab badge only:
 * - revision requested (needs_revision), or
 * - parent-assigned (assigned_by) and not started / in progress.
 * Planner-only links (linked_event_ids without assigned_by) stay in Help, not here — avoids
 * passive items inflating urgency.
 */
export function assignmentNeedsUrgentSubmissionsAttention(a) {
  if (!a?.id) return false;
  if (isChildHelpAssignment(a)) return false;
  const s = (a.status || '').toLowerCase();
  const rs = (a.review_status || '').toLowerCase();
  if (rs === 'needs_revision') return true;
  if (!['not_started', 'in_progress'].includes(s)) return false;
  if (!a.assigned_by) return false;
  return true;
}

/** Single primary label for the attention row (not stacked with competing badges). */
export function primaryAttentionStatusLabel(a) {
  const rs = (a.review_status || '').toLowerCase();
  if (rs === 'needs_revision') return 'Needs changes';
  return 'Action needed';
}

/** One secondary line: source + due (lighter); optional subject if nothing else to show. */
export function secondaryAttentionContextLine(a, subjectFallback = '') {
  const parts = [];
  if (a.assigned_by) parts.push('From parent');
  const due = formatDueShortHuman(a);
  if (due) parts.push(due);
  const line = parts.filter(Boolean).join(' · ');
  if (line) return line;
  return (subjectFallback || '').trim() || '';
}

function formatDueShortHuman(a) {
  const due = parseDue(a);
  if (!due) return '';
  const today = startOfToday();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (due < today) {
    return `Overdue · ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  if (due.getTime() === today.getTime()) return 'Due today';
  if (due.getTime() === tomorrow.getTime()) return 'Due tomorrow';
  const weekday = due.toLocaleDateString('en-US', { weekday: 'long' });
  return `Due ${weekday}`;
}

/** Completed / history section — single status label. */
export function primaryCompletedStatusLabel(a) {
  const s = (a.status || '').toLowerCase();
  const rs = (a.review_status || '').toLowerCase();
  if (s === 'accepted' || rs === 'approved') return 'Reviewed';
  if (s === 'reviewed') return 'Reviewed';
  return 'Submitted';
}

/** Group Coming up rows: today | this_week (next 6 days) | later. */
export function bucketComingUpEvent(startTs) {
  if (!startTs) return 'later';
  const start = new Date(startTs);
  if (Number.isNaN(start.getTime())) return 'later';
  const today0 = startOfToday();
  const eventDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diffMs = eventDay.getTime() - today0.getTime();
  const dayDiff = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (dayDiff === 0) return 'today';
  if (dayDiff >= 1 && dayDiff <= 6) return 'this_week';
  return 'later';
}

export function partitionComingUpEvents(events) {
  const buckets = { today: [], this_week: [], later: [] };
  const sorted = [...(events || [])].sort(
    (a, b) => new Date(a.start_ts).getTime() - new Date(b.start_ts).getTime()
  );
  for (const e of sorted) {
    const k = bucketComingUpEvent(e.start_ts);
    buckets[k].push(e);
  }
  return buckets;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDue(a) {
  if (!a?.due_date) return null;
  const d = new Date(a.due_date);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Buckets for the Help tab (each assignment appears in at most one section).
 */
export function categorizeAssignmentsForChildHelp(assignments, { search = '' } = {}) {
  const q = (search || '').trim().toLowerCase();
  const list = (assignments || []).filter((a) => {
    if (!q) return true;
    const t = (a.title || '').toLowerCase();
    const sub = (a.subject?.name || '').toLowerCase();
    return t.includes(q) || sub.includes(q);
  });

  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  weekAhead.setHours(23, 59, 59, 999);

  const used = new Set();
  const take = (predicate, max) => {
    const out = [];
    for (const a of list) {
      if (!a?.id || used.has(a.id)) continue;
      if (!predicate(a)) continue;
      used.add(a.id);
      out.push(a);
      if (out.length >= max) break;
    }
    return out;
  };

  const upcomingWork = take((a) => {
    const s = (a.status || '').toLowerCase();
    if (['accepted', 'graded'].includes(s)) return false;
    const due = parseDue(a);
    if (!due) return true;
    return due.getTime() <= weekAhead.getTime();
  }, 8);

  const gradedQuestions = take((a) => {
    const s = (a.status || '').toLowerCase();
    const rs = (a.review_status || '').toLowerCase();
    return ['accepted', 'graded'].includes(s) || rs === 'needs_revision' || rs === 'reviewed';
  }, 8);

  const recentSorted = [...list]
    .filter((a) => a?.id && !used.has(a.id))
    .sort(
      (a, b) =>
        new Date(b.updated_at || b.created_at || 0).getTime() -
        new Date(a.updated_at || a.created_at || 0).getTime()
    )
    .slice(0, 8);

  return { upcomingWork, gradedQuestions, recent: recentSorted };
}

export function formatAssignmentDueLine(a) {
  const due = parseDue(a);
  if (!due) return 'No due date';
  const today = startOfToday();
  if (due < today) return `Overdue · ${due.toLocaleDateString()}`;
  if (due.getTime() === today.getTime()) return 'Due today';
  return `Due ${due.toLocaleDateString()}`;
}

export function formatAssignmentStatus(a) {
  const s = (a.status || '').replace(/_/g, ' ');
  if (!s) return '—';
  return s.charAt(0).toUpperCase() + s.slice(1);
}
