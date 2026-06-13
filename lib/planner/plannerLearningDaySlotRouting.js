import { Platform } from 'react-native';
import { getPlannerEventCategory } from './plannerEventCategories';
import { eventHasLinkedLesson } from '../subjectLessonLinking';
import { isDayOffOrHolidayEvent, isWorkAssignmentEditEvent } from '../create/eventOpenRouting';

export function resolveEventSubjectId(event) {
  if (!event) return null;
  const raw = event.subject_id || event.subjectId || event?.data?.subject_id;
  return raw != null ? String(raw).trim() : null;
}

export function resolveEventSubjectName(event) {
  if (!event) return null;
  const name = event.subject_name || event.subjectName || event.subject || event?.data?.subject_name;
  return name != null ? String(name).trim() : null;
}

/** Learning-day calendar row with no curriculum lesson linked yet. */
export function isUnfilledPlannerLearningDaySlot(event) {
  if (!event?.id) return false;
  if (isDayOffOrHolidayEvent(event)) return false;
  if (isWorkAssignmentEditEvent(event?.event_type || event?.type)) return false;
  if (getPlannerEventCategory(event) !== 'Learning day') return false;
  if (eventHasLinkedLesson(event)) return false;
  if (!resolveEventSubjectId(event)) return false;
  return true;
}

export function dispatchOpenAttachLessonModal(detail = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('openAttachLessonModal', { detail }));
}
