export const ASSIGNMENT_TYPES = [
  { id: 'Assignment', label: 'Assignment' },
  { id: 'Question', label: 'Question' },
  { id: 'Quiz', label: 'Quiz' },
  { id: 'Project', label: 'Project' },
  { id: 'Exam', label: 'Exam' },
];

export function getAssignmentTypeLayout(assignmentType) {
  const type = String(assignmentType || 'Assignment').trim();

  const primary = {
    instructions: true,
    instructionsLabel: type === 'Question' ? 'Question prompt' : 'Instructions',
    instructionsPlaceholder:
      type === 'Question'
        ? 'What should students answer?'
        : 'Add instructions for students…',
    resources: type === 'Assignment' || type === 'Project',
    responseType: type === 'Question',
    quizBuilder: type === 'Quiz',
    points: true,
    subject: true,
    children: true,
    dueDate: true,
  };

  return { type, primary };
}
