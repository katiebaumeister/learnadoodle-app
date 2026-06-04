/** Work-producing planner event types and shared helpers. */

export const WORK_PRODUCING_EVENT_TYPES = ['Assignment', 'Project', 'Exam'];

export const EFFORT_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hr', minutes: 60 },
  { label: '1.5 hr', minutes: 90 },
  { label: '2 hr', minutes: 120 },
  { label: '3 hr', minutes: 180 },
  { label: '5 hr', minutes: 300 },
];

export const DEFAULT_SUBMISSION_METHODS = {
  text: true,
  file: true,
  photo: false,
  link: false,
  parent_checkoff: false,
};

export const DEFAULT_EXAM_MODES = {
  parent_score: true,
  question_answer: false,
  file_upload: true,
};

export function normalizeWorkEventType(eventType) {
  const raw = String(eventType || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower === 'assignment') return 'Assignment';
  if (lower === 'project') return 'Project';
  if (lower === 'exam') return 'Exam';
  return raw;
}

export function isWorkProducingEventType(eventType) {
  return WORK_PRODUCING_EVENT_TYPES.includes(normalizeWorkEventType(eventType));
}

export function defaultWorkSpec(eventType) {
  const type = normalizeWorkEventType(eventType);
  return {
    instructions: '',
    submission_methods: { ...DEFAULT_SUBMISSION_METHODS },
    estimated_effort_minutes: 30,
    suggested_start_mode: 'auto',
    suggested_start_date: null,
    graded: type === 'Exam' ? true : true,
    allow_progress_updates: type === 'Project',
    require_final_deliverable: type === 'Project',
    exam_modes: { ...DEFAULT_EXAM_MODES },
  };
}

export function parseWorkSpec(raw, eventType = 'Assignment') {
  const base = defaultWorkSpec(eventType);
  if (!raw || typeof raw !== 'object') return base;
  return {
    ...base,
    ...raw,
    submission_methods: {
      ...base.submission_methods,
      ...(raw.submission_methods && typeof raw.submission_methods === 'object' ? raw.submission_methods : {}),
    },
    exam_modes: {
      ...base.exam_modes,
      ...(raw.exam_modes && typeof raw.exam_modes === 'object' ? raw.exam_modes : {}),
    },
  };
}

export function eventDueYmd(event) {
  const raw = event?.date_local
    || event?.start_ts
    || event?.start_local
    || event?.due_ts
    || event?.end_ts;
  if (!raw) return null;
  const ymd = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export function computeSuggestedStartDate(event, workSpec) {
  const dueYmd = eventDueYmd(event);
  if (!dueYmd) return null;
  if (workSpec?.suggested_start_mode === 'custom' && workSpec?.suggested_start_date) {
    return String(workSpec.suggested_start_date).slice(0, 10);
  }
  const due = new Date(`${dueYmd}T12:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const effortMinutes = Number(workSpec?.estimated_effort_minutes) || 30;
  const daysBack = Math.max(1, Math.ceil(effortMinutes / 60));
  const start = new Date(due);
  start.setDate(start.getDate() - daysBack);
  return start.toISOString().slice(0, 10);
}

export function formatDueLabel(event) {
  const ymd = eventDueYmd(event);
  if (!ymd) return '';
  const due = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(due.getTime())) return ymd;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays === -1) return 'Due yesterday';
  if (diffDays > 1 && diffDays <= 7) {
    return `Due ${due.toLocaleDateString('en-US', { weekday: 'long' })}`;
  }
  return `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function getWorkStatusLabel(assignment) {
  if (!assignment) return 'Not Started';
  const review = String(assignment.review_status || '').trim().toLowerCase();
  const status = String(assignment.status || '').trim().toLowerCase();
  if (review === 'needs_revision' || review === 'rejected') return 'Needs Revision';
  if (assignment.grade_display || assignment.grade_value != null) return 'Graded';
  if (review === 'approved' || status === 'accepted' || status === 'reviewed') return 'Approved';
  if (status === 'submitted' || assignment.submitted_at) return 'Submitted';
  if (status === 'in_progress') return 'In Progress';
  if (Number(assignment.progress_percent) > 0) return 'In Progress';
  return 'Not Started';
}

export function getSubmissionColumnLabel(assignment, event = null) {
  if (event) {
    const label = getAllEventsSubmissionLabel(event, assignment);
    return label || '—';
  }
  const label = getWorkStatusLabel(assignment);
  if (label === 'Submitted' || label === 'Needs Revision' || label === 'Approved' || label === 'Graded') {
    return label;
  }
  return '—';
}

/** All Events submission column: Requested | Submitted | Sent Back | Graded | Missing */
export function getAllEventsSubmissionLabel(event, assignment) {
  if (!isWorkProducingEventType(event?.event_type)) return null;

  const review = String(assignment?.review_status || '').trim().toLowerCase();
  const status = String(assignment?.status || '').trim().toLowerCase();

  if (assignment?.grade_display || assignment?.grade_value != null) return 'Graded';
  if (review === 'needs_revision' || review === 'rejected') return 'Sent Back';
  if (status === 'submitted' || assignment?.submitted_at) return 'Submitted';

  const dueYmd = eventDueYmd(event)
    || (assignment?.due_date ? String(assignment.due_date).slice(0, 10) : null);
  if (dueYmd) {
    const dueDay = new Date(`${dueYmd}T12:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dueDay.setHours(0, 0, 0, 0);
    if (dueDay < today) return 'Missing';
  }

  if (assignment) return 'Requested';
  return 'Requested';
}

export function getGradeColumnLabel(assignment, workSpec) {
  if (assignment?.grade_display) return String(assignment.grade_display);
  if (assignment?.grade_value != null && workSpec?.graded !== false) {
    const n = Number(assignment.grade_value);
    if (Number.isFinite(n)) return `${Math.round(n)}%`;
  }
  if (getWorkStatusLabel(assignment) === 'Graded') return '—';
  return '—';
}

export function primaryAssignmentForEvent(assignmentsByEventId, eventId, childIds = null) {
  const rows = assignmentsByEventId?.[String(eventId)] || assignmentsByEventId?.[eventId] || [];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  if (childIds && childIds.length > 0) {
    const wanted = new Set(childIds.map(String));
    const match = rows.find((row) => wanted.has(String(row.child_id)));
    if (match) return match;
  }
  return rows[0] || null;
}
