import { getPlannerEventCategory } from './plannerEventCategories';
import { eventHasLinkedLesson } from '../subjectLessonLinking';
import { isDayOffOrHolidayEvent, isWorkAssignmentEditEvent } from '../create/eventOpenRouting';
import { resolveEventSubjectId } from './plannerEventSubject';
import {
  dispatchOpenLearningDayModal,
  dispatchOpenLearningDayChoiceModal,
} from './learningDayModalNavigation';

export { resolveEventSubjectId, resolveEventSubjectName } from './plannerEventSubject';

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
  dispatchOpenLearningDayModal(detail);
}

export { dispatchOpenLearningDayModal, dispatchOpenLearningDayChoiceModal };
