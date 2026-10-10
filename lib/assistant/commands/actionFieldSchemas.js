/**
 * Required / optional fields for Doodle command intents.
 * Preparers use these for ask-one-field clarification prompts.
 */

/** @typedef {'title'|'childId'|'subjectId'|'date'|'dueAt'|'startAt'|'time'|'targetEventId'|'itemId'} ActionField */

/**
 * @typedef {{
 *   required: ActionField[],
 *   optional?: ActionField[],
 *   prompts: Record<string, string>,
 * }} ActionFieldSchema
 */

/** @type {Record<string, ActionFieldSchema>} */
export const ACTION_FIELD_SCHEMAS = {
  'assignment.create': {
    required: ['title', 'subjectId', 'childId', 'dueAt'],
    optional: [],
    prompts: {
      title: 'What should the assignment be titled?',
      subjectId: 'Which subject should this assignment belong to?',
      childId: 'Which student should this assignment be for?',
      dueAt: 'When is this assignment due?',
    },
  },
  'assignment.move': {
    required: ['assignmentId', 'date'],
    optional: [],
    prompts: {
      assignmentId: 'Which assignment should I move?',
      date: 'Which day should I move it to? Pick one, or type a day (e.g. Friday).',
      childId: 'Which student’s assignment?',
    },
  },
  'assignment.update': {
    required: ['assignmentId'],
    optional: ['title', 'date', 'dueAt'],
    prompts: {
      assignmentId: 'Which assignment should I update?',
      title: 'What should the new title be?',
      date: 'Which day should it be due?',
      dueAt: 'When should it be due?',
    },
  },
  'assignment.delete': {
    required: ['assignmentId'],
    optional: [],
    prompts: {
      assignmentId: 'Which assignment should I delete?',
    },
  },
  'event.create': {
    required: ['title', 'childId', 'date'],
    optional: ['time', 'location', 'description'],
    prompts: {
      title: 'What should I call this event?',
      childId: 'Which student should this event be for?',
      date: 'Which day should this event be on? Pick one, or type a day (e.g. Saturday, next Monday).',
      time: 'What time should this event start? (e.g. 2pm)',
    },
  },
  'learning_day.create': {
    required: ['subjectId', 'childId', 'date'],
    optional: ['time'],
    prompts: {
      subjectId: 'Which subject should this lesson / learning day be for?',
      childId: 'Which student is this for?',
      date: 'Which day should this one-off learning event be on? Pick one, or type a day (e.g. Saturday, next Monday, next week).',
      time: 'What time should this learning day start?',
    },
  },
  'day_off.create': {
    required: ['date'],
    optional: ['title'],
    prompts: {
      date: 'Which day (or date range) should be a day off? Pick one, or type dates (e.g. Friday, July 27–29).',
      title: 'What should I call this day off?',
    },
  },
  'planner.item.move': {
    required: ['itemId', 'date'],
    optional: ['time'],
    prompts: {
      itemId: 'Which planner item should I move?',
      date: 'Which day should I move it to?',
      time: 'What time should it start on the new day? (e.g. 10am)',
    },
  },
  'event.update': {
    required: ['targetEventId'],
    optional: ['title', 'date', 'time', 'location', 'description'],
    prompts: {
      targetEventId: 'Which event should I update?',
      title: 'What should the new title be?',
      date: 'Which day should it move to?',
      time: 'What time should it be?',
      location: 'What location should I set?',
    },
  },
};

/**
 * @param {string} intent
 * @param {string} field
 * @returns {string}
 */
export function fieldPromptFor(intent, field) {
  const schema = ACTION_FIELD_SCHEMAS[intent];
  if (!schema) return 'Could you tell me a bit more?';
  return schema.prompts[field] || 'Could you tell me a bit more?';
}

/**
 * Quick date chips for clarification UIs.
 * @returns {Array<{ id: string, label: string, value: string, field: string }>}
 */
export function dateClarificationOptions(field = 'date') {
  const today = new Date();
  const ymd = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return [
    { id: 'today', label: 'Today', value: ymd(today), field },
    { id: 'tomorrow', label: 'Tomorrow', value: ymd(tomorrow), field },
  ];
}
