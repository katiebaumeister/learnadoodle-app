import { Platform } from 'react-native';
import { getEventStartDate } from './subjectLessonLinking';

export const OPEN_SUBJECT_CLASSWORK_EVENT = 'openSubjectClasswork';

export function resolveEventSubjectId(event) {
  if (!event) return null;
  const raw = event.subject_id || event.subjectId || event?.data?.subject_id;
  return raw != null ? String(raw).trim() : null;
}

export function plannerDateParamFromEvent(event) {
  const d = getEventStartDate(event);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Navigate to subject Learning Schedule (optionally highlight a lesson or assignment). */
export function dispatchOpenSubjectClasswork({
  subjectId,
  lessonId = null,
  assignmentId = null,
  tab = 'classwork',
} = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const detail = {
    subjectId: subjectId != null ? String(subjectId) : null,
    lessonId: lessonId != null ? String(lessonId) : null,
    assignmentId: assignmentId != null ? String(assignmentId) : null,
    tab,
  };
  window.__ldPendingClassworkFocus = detail;
  window.dispatchEvent(new CustomEvent(OPEN_SUBJECT_CLASSWORK_EVENT, { detail }));
}

export function consumePendingClassworkFocus() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const detail = window.__ldPendingClassworkFocus || null;
  delete window.__ldPendingClassworkFocus;
  return detail;
}

/** Jump to planner month/week view for a subject session. */
export function dispatchNavigateToPlanner({
  subjectId,
  date = null,
  eventId = null,
  view = 'month',
} = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('navigateToPlanner', {
    detail: { subjectId, date, eventId, view },
  }));
}

/** Open Edit Subject settings (e.g. from a plan-generated learning day on the calendar). */
export function dispatchOpenSubjectSettings({
  subject = null,
  subjectId = null,
  initialTab = 'schedule',
} = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const sid = subject?.id || subjectId;
  if (!sid) return;
  const detail = {
    initialTab,
    subject: subject?.id ? subject : { id: sid },
  };
  window.dispatchEvent(new CustomEvent('openAddSubjectModal', { detail }));
}
