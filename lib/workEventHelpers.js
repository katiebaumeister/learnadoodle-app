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
  quiz: false,
  parent_checkoff: false,
};

const NO_SUBMISSION_METHODS = {
  text: false,
  file: false,
  photo: false,
  link: false,
  quiz: false,
  parent_checkoff: false,
};

/** Standard submission methods for create-modal assignment type chips. */
export function defaultSubmissionMethodsForAssignmentType(assignmentType) {
  const type = String(assignmentType || 'Assignment').trim();
  if (type === 'Question') return { ...NO_SUBMISSION_METHODS, text: true };
  if (type === 'Quiz') return { ...NO_SUBMISSION_METHODS, quiz: true };
  if (type === 'Project') return { ...NO_SUBMISSION_METHODS, file: true, link: true };
  if (type === 'Exam') return { ...NO_SUBMISSION_METHODS, file: true };
  return { ...NO_SUBMISSION_METHODS, text: true, file: true };
}

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

const LEARNING_GRADING_SWITCHES_EXCLUDED = new Set(['Day Off', 'Break', 'Appointment']);

/** Learning details graded / submission toggles — all types except exclusions. */
export function showsLearningGradingSwitches(eventType) {
  const type = String(eventType || '').trim();
  if (!type) return false;
  return !LEARNING_GRADING_SWITCHES_EXCLUDED.has(type);
}

/** Whole Learning details accordion (subjects, grading, submission) — hidden for exclusions. */
export function showsLearningDetailsSection(eventType) {
  const type = String(eventType || '').trim();
  if (!type) return true;
  return !LEARNING_GRADING_SWITCHES_EXCLUDED.has(type);
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
    require_final_deliverable: type === 'Project' || type === 'Assignment' || type === 'Exam',
    exam_modes: { ...DEFAULT_EXAM_MODES },
    quiz_questions: [],
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
    quiz_questions: normalizeQuizQuestions(raw),
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

export const SUBMISSION_COLUMN_STATES = {
  NONE: 'none',
  REQUESTED: 'requested',
  IN_PROGRESS: 'in_progress',
  SUBMITTED: 'submitted',
  RETURNED: 'returned',
  COMPLETE: 'complete',
  LATE: 'late',
};

export const SUBMISSION_COLUMN_TONES = {
  requested: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' },
  in_progress: { bg: '#F0F9FF', border: '#7DD3FC', text: '#0369A1' },
  submitted: { bg: '#EEF2FF', border: '#C7D2FE', text: '#4338CA' },
  returned: { bg: '#FFF7ED', border: '#FDBA74', text: '#C2410C' },
  complete: { bg: '#ECFDF5', border: '#86EFAC', text: '#047857' },
  late: { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626' },
};

function formatStartWorkByLabel(ymd) {
  const raw = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function workSpecRequiresSubmission(workSpec) {
  if (!workSpec || typeof workSpec !== 'object') return false;
  if (workSpec.require_final_deliverable === true) return true;
  const methods = workSpec.submission_methods;
  if (methods && typeof methods === 'object') {
    return Object.values(methods).some(Boolean);
  }
  return false;
}

function assignmentHasSubmission(assignment) {
  if (!assignment) return false;
  const status = String(assignment.status || '').trim().toLowerCase();
  return status === 'submitted'
    || status === 'reviewed'
    || status === 'accepted'
    || Boolean(assignment.submitted_at);
}

function assignmentIsComplete(assignment) {
  if (!assignment) return false;
  const review = String(assignment.review_status || '').trim().toLowerCase();
  const status = String(assignment.status || '').trim().toLowerCase();
  return review === 'approved'
    || review === 'reviewed'
    || status === 'accepted'
    || status === 'reviewed';
}

function assignmentIsReturned(assignment) {
  if (!assignment) return false;
  const review = String(assignment.review_status || '').trim().toLowerCase();
  return review === 'needs_revision' || review === 'rejected';
}

function assignmentIsSubmittedAwaitingReview(assignment) {
  if (!assignment || !assignmentHasSubmission(assignment)) return false;
  if (assignmentIsComplete(assignment) || assignmentIsReturned(assignment)) return false;
  const status = String(assignment.status || '').trim().toLowerCase();
  return status === 'submitted' || Boolean(assignment.submitted_at);
}

function assignmentIsInProgress(assignment) {
  if (!assignment || assignmentHasSubmission(assignment)) return false;
  const status = String(assignment.status || '').trim().toLowerCase();
  if (status === 'in_progress') return true;
  return Number(assignment.progress_percent) > 0;
}

function assignmentIsOverdueWithoutSubmission(event, assignment) {
  if (assignmentHasSubmission(assignment) || assignmentIsComplete(assignment)) return false;
  const dueYmd = eventDueYmd(event)
    || (assignment?.due_date ? String(assignment.due_date).slice(0, 10) : null);
  if (!dueYmd) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(`${dueYmd}T12:00:00`);
  dueDay.setHours(0, 0, 0, 0);
  return dueDay < today;
}

/** Whether the submission column should track work for this event. */
export function eventRequiresSubmission(event, assignment, workSpec = null) {
  if (assignment) return true;
  const raw = event?.work_spec;
  if (!raw || typeof raw !== 'object') return false;
  if (raw.require_final_deliverable === true) return true;
  if (raw.submission_methods && typeof raw.submission_methods === 'object') {
    return Object.values(raw.submission_methods).some(Boolean);
  }
  if (isWorkProducingEventType(event?.event_type)) {
    const spec = workSpec || parseWorkSpec(raw, event?.event_type);
    return workSpecRequiresSubmission(spec) && Object.keys(raw).length > 0;
  }
  return false;
}

export function resolveStartWorkBy(assignment, event, workSpec = null) {
  const fromAssignment = assignment?.start_work_by
    ? String(assignment.start_work_by).slice(0, 10)
    : null;
  if (fromAssignment && /^\d{4}-\d{2}-\d{2}$/.test(fromAssignment)) return fromAssignment;
  const spec = workSpec || parseWorkSpec(event?.work_spec, event?.event_type);
  return computeSuggestedStartDate(event, spec);
}

/**
 * Submission column display model for planner list + learning log.
 * States: none | requested | in_progress | submitted | returned | complete | late
 */
export function resolveSubmissionColumnDisplay({
  event,
  assignment,
  workSpec: workSpecInput = null,
} = {}) {
  const workSpec = workSpecInput || parseWorkSpec(event?.work_spec, event?.event_type);

  if (!eventRequiresSubmission(event, assignment, workSpec)) {
    return {
      state: SUBMISSION_COLUMN_STATES.NONE,
      pillLabel: null,
      subLabel: null,
      subLabelRole: null,
      tone: null,
    };
  }

  if (assignmentIsComplete(assignment)) {
    return {
      state: SUBMISSION_COLUMN_STATES.COMPLETE,
      pillLabel: 'Complete',
      subLabel: null,
      subLabelRole: null,
      tone: 'complete',
    };
  }

  if (assignmentIsReturned(assignment)) {
    return {
      state: SUBMISSION_COLUMN_STATES.RETURNED,
      pillLabel: 'Returned',
      subLabel: 'Needs changes',
      subLabelRole: 'text',
      tone: 'returned',
    };
  }

  if (assignmentIsSubmittedAwaitingReview(assignment)) {
    return {
      state: SUBMISSION_COLUMN_STATES.SUBMITTED,
      pillLabel: 'Submitted',
      subLabel: 'Review',
      subLabelRole: 'action',
      tone: 'submitted',
    };
  }

  if (assignmentIsOverdueWithoutSubmission(event, assignment)) {
    return {
      state: SUBMISSION_COLUMN_STATES.LATE,
      pillLabel: 'Late',
      subLabel: null,
      subLabelRole: null,
      tone: 'late',
    };
  }

  if (assignmentIsInProgress(assignment)) {
    return {
      state: SUBMISSION_COLUMN_STATES.IN_PROGRESS,
      pillLabel: 'In progress',
      subLabel: null,
      subLabelRole: null,
      tone: 'in_progress',
    };
  }

  const startBy = resolveStartWorkBy(assignment, event, workSpec);
  return {
    state: SUBMISSION_COLUMN_STATES.REQUESTED,
    pillLabel: 'Requested',
    subLabel: startBy ? `Start by ${formatStartWorkByLabel(startBy)}` : null,
    subLabelRole: 'text',
    tone: 'requested',
  };
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
    const display = resolveSubmissionColumnDisplay({ event, assignment });
    return display.pillLabel || '—';
  }
  const label = getWorkStatusLabel(assignment);
  if (label === 'Submitted' || label === 'Needs Revision' || label === 'Approved' || label === 'Graded') {
    return label;
  }
  return '—';
}

/** @deprecated Prefer resolveSubmissionColumnDisplay for rich pill UI. */
export function getAllEventsSubmissionLabel(event, assignment) {
  const display = resolveSubmissionColumnDisplay({ event, assignment });
  if (display.state === SUBMISSION_COLUMN_STATES.NONE) return null;
  if (display.state === SUBMISSION_COLUMN_STATES.LATE) return 'Late';
  if (display.state === SUBMISSION_COLUMN_STATES.RETURNED) return 'Returned';
  if (display.state === SUBMISSION_COLUMN_STATES.COMPLETE) return 'Complete';
  return display.pillLabel;
}

/** Extract the latest student free-text submission from assignment description. */
export function extractStudentSubmissionText(description) {
  const desc = String(description || '');
  if (!desc.includes('[Submission from student]')) return '';
  const blocks = desc
    .split('[Submission from student]')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  return blocks.length ? blocks[blocks.length - 1] : '';
}

/** Normalize quiz question rows on work_spec. */
export function normalizeQuizQuestions(workSpec) {
  const raw = workSpec?.quiz_questions;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      if (!row || typeof row !== 'object') return null;
      const prompt = String(row.prompt || '').trim();
      const id = String(row.id || `q_${index + 1}`).trim();
      if (!id) return null;
      return { id, prompt };
    })
    .filter(Boolean);
}

/** Serialize student quiz answers into assignment description. */
export function formatQuizAnswersBlock(answersById) {
  const lines = Object.entries(answersById || {})
    .map(([id, answer]) => [String(id || '').trim(), String(answer || '').trim()])
    .filter(([id, answer]) => id && answer)
    .map(([id, answer]) => `${id}: ${answer}`);
  if (!lines.length) return '';
  return `[Quiz answers]\n${lines.join('\n')}`;
}

/** Parse student quiz answers from assignment description. */
export function extractQuizAnswers(description) {
  const desc = String(description || '');
  if (!desc.includes('[Quiz answers]')) return {};
  const block = desc.split('[Quiz answers]')[1]?.split('\n\n[')[0] || '';
  const out = {};
  block
    .split('\n')
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .forEach((line) => {
      const idx = line.indexOf(':');
      if (idx <= 0) return;
      const id = line.slice(0, idx).trim();
      const answer = line.slice(idx + 1).trim();
      if (id) out[id] = answer;
    });
  return out;
}

/** Build parent-facing Q&A rows from work spec + assignment description. */
export function resolveQuizAnswerRows(workSpec, description) {
  const questions = normalizeQuizQuestions(workSpec);
  const answers = extractQuizAnswers(description);
  return questions.map((q, index) => ({
    id: q.id,
    prompt: q.prompt || `Question ${index + 1}`,
    answer: answers[q.id] || '',
  }));
}

/** Which submission inputs to show for the student based on work_spec. */
export function resolveStudentSubmissionModes(workSpec, eventType = 'Assignment') {
  const spec = parseWorkSpec(workSpec, eventType);
  const methods = spec.submission_methods || {};
  const configured = Object.keys(methods).length > 0;
  const quizQuestions = normalizeQuizQuestions(spec);
  return {
    text: configured ? !!methods.text : true,
    file: configured ? !!methods.file : true,
    photo: !!methods.photo,
    link: !!methods.link,
    quiz: !!methods.quiz && quizQuestions.length > 0,
    parentCheckoff: !!methods.parent_checkoff,
    quizQuestions,
  };
}

/** Unified student-facing status labels. */
export function getStudentSubmissionStatusLabel(assignment) {
  if (!assignment) return 'Not started';
  if (assignmentIsComplete(assignment)) return 'Complete';
  if (assignmentIsReturned(assignment)) return 'Needs changes';
  if (assignmentIsSubmittedAwaitingReview(assignment)) return 'Submitted';
  if (assignmentIsInProgress(assignment)) return 'In progress';
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
