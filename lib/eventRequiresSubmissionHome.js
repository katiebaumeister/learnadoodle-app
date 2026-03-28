/**
 * Default for "Show in student home as Requires Submission" by event type.
 * On: Project, Exam, Assignment. Off: Lesson, Activity, Appointment (and other types).
 */
export function defaultRequiresSubmissionHomeForEventType(eventType) {
  const raw = (eventType || '').trim();
  const t = raw.toLowerCase();
  if (t === 'schedule block' || t === 'scheduled class day') return false;
  return ['project', 'exam', 'assignment'].includes(t);
}
