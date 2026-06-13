/** Route openTaskModal / create menu selections to the focused create modal. */
export function resolveCreateModalKind(eventType) {
  const type = String(eventType || '').trim();
  if (type === 'Lesson') return 'lesson';
  if (type === 'Assignment' || type === 'Project' || type === 'Exam') return 'assignment';
  return 'calendar_event';
}

export function createPaneOptionToModalKind(optionId) {
  switch (optionId) {
    case 'calendar_event':
      return 'calendar_event';
    case 'lesson':
      return 'lesson';
    case 'assignment':
    case 'submission_request':
      return 'assignment';
    default:
      return null;
  }
}
