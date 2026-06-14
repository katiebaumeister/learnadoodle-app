import { getPlannerEventCategory } from './plannerEventCategories';
import { eventHasLinkedLesson } from '../subjectLessonLinking';
import { resolveEventSubjectName } from './plannerLearningDaySlotRouting';

export function isPlannerLearningDayEvent(event) {
  return getPlannerEventCategory(event) === 'Learning day';
}

/** Learning-day row with no curriculum lesson linked yet. */
export function isEmptyPlannerLearningDaySlot(event) {
  if (!isPlannerLearningDayEvent(event)) return false;
  return !eventHasLinkedLesson(event);
}

export function getPlannerLearningDayLessonTitle(event) {
  if (!event) return '';
  const meta = event.curriculum_metadata && typeof event.curriculum_metadata === 'object'
    ? event.curriculum_metadata
    : {};
  return String(meta?.lesson_label || event.lesson || event.lesson_name || '').trim();
}

/** Chip primary label — subject name, or subject name - lesson name when linked. */
export function getPlannerEventChipTitle(event) {
  if (!event) return 'Untitled Event';
  if (!isPlannerLearningDayEvent(event)) {
    return String(event.title || '').trim() || 'Untitled Event';
  }
  const subjectName = resolveEventSubjectName(event) || String(event.title || '').trim();
  const lessonTitle = getPlannerLearningDayLessonTitle(event);
  if (subjectName && lessonTitle) return `${subjectName} - ${lessonTitle}`;
  if (subjectName) return subjectName;
  if (lessonTitle) return lessonTitle;
  return 'Untitled Event';
}
