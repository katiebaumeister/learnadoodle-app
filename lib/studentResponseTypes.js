/** Student response modes for assignment create modal. */

export const STUDENT_RESPONSE_TYPES = [
  { id: 'structured_qa', label: 'Structured Q&A' },
  { id: 'attachment', label: 'Attachment' },
];

export function parseStudentResponseType(value) {
  if (value == null || value === '') return null;
  const id = String(value).trim();
  if (STUDENT_RESPONSE_TYPES.some((row) => row.id === id)) return id;
  if (id === 'short_form' || id === 'long_form' || id === 'multiple_choice') return 'structured_qa';
  return null;
}

export function normalizeStudentResponseType(value) {
  return parseStudentResponseType(value) || 'structured_qa';
}

export function studentResponseTypeLabel(id) {
  const parsed = parseStudentResponseType(id);
  return STUDENT_RESPONSE_TYPES.find((row) => row.id === parsed)?.label || 'Structured Q&A';
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function newQuizOptionId(questionId) {
  return `${questionId || 'q'}_o_${Math.random().toString(36).slice(2, 6)}`;
}

export function defaultOptionLabel(index) {
  return `Option ${index + 1}`;
}

/** Legacy defaults were saved as real values — treat as empty so placeholders work. */
export function isDefaultOptionLabel(text, index) {
  const normalized = String(text ?? '').trim();
  if (!normalized) return true;
  return normalized === defaultOptionLabel(index);
}

export function defaultMultipleChoiceQuestion() {
  const id = newId('mc');
  const o1 = newQuizOptionId(id);
  const o2 = newQuizOptionId(id);
  return {
    prompt: '',
    options: [
      { id: o1, text: '' },
      { id: o2, text: '' },
    ],
    correct_option_id: null,
  };
}

export function defaultStructuredQuestion() {
  const id = newId('q');
  return {
    id,
    prompt: '',
    question_type: 'short_answer',
    options: [],
    correct_option_id: null,
    points: null,
  };
}

export function normalizeMultipleChoice(raw) {
  if (!raw || typeof raw !== 'object') return defaultMultipleChoiceQuestion();
  const prompt = String(raw.prompt || '');
  const options = Array.isArray(raw.options)
    ? raw.options
      .map((row, index) => {
        if (!row || typeof row !== 'object') return null;
        const optId = String(row.id || newQuizOptionId(`mc_${index}`)).trim();
        const text = String(row.text ?? row.label ?? '').trim();
        if (!optId) return null;
        return { id: optId, text };
      })
      .filter(Boolean)
    : [];
  const normalizedOptions = options.length > 0
    ? options
    : defaultMultipleChoiceQuestion().options;
  const correct = String(raw.correct_option_id || '').trim();
  return {
    prompt,
    options: normalizedOptions,
    correct_option_id: normalizedOptions.some((row) => row.id === correct) ? correct : null,
  };
}

export function defaultSubmissionMethodsForStudentResponseType(responseType) {
  const type = parseStudentResponseType(responseType);
  const none = {
    text: false,
    file: false,
    photo: false,
    link: false,
    quiz: false,
    parent_checkoff: false,
  };
  if (!type) return { ...none };
  if (type === 'attachment') return { ...none, file: true };
  return { ...none, quiz: true };
}

export function buildWorkSpecForStudentResponseType(responseType, prev = {}) {
  const type = parseStudentResponseType(responseType);
  if (!type) {
    return {
      ...prev,
      student_response_type: null,
      submission_methods: defaultSubmissionMethodsForStudentResponseType(null),
      require_final_deliverable: false,
      response_format: null,
      multiple_choice: null,
      quiz_questions: [],
    };
  }

  const next = {
    ...prev,
    student_response_type: type,
    submission_methods: defaultSubmissionMethodsForStudentResponseType(type),
    require_final_deliverable: true,
    response_format: null,
    multiple_choice: null,
  };

  if (type === 'structured_qa') {
    const existing = Array.isArray(prev.quiz_questions) ? prev.quiz_questions : [];
    next.quiz_questions = existing.length > 0 ? existing : [defaultStructuredQuestion()];
  } else {
    next.quiz_questions = [];
  }

  return next;
}
