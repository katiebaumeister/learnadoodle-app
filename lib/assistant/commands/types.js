/**
 * Typed Doodle command + response contracts (MVP).
 * Discriminated unions expressed as JSDoc for runtime use in the Expo/JS codebase.
 */

/** @typedef {'idle'|'submitting'|'awaiting_clarification'|'awaiting_confirmation'|'executing'|'completed'|'error'} DoodlePaneStatus */

/**
 * @typedef {Object} DoodleContext
 * @property {string} currentRoute
 * @property {'home'|'messages'|'planner'|'learning'|'materials'|'settings'} currentArea
 * @property {string} householdId
 * @property {string} [schoolYearId]
 * @property {string} [schoolYearLabel]
 * @property {string[]} [selectedChildIds]
 * @property {string} [selectedSubjectId]
 * @property {string} [selectedUnitId]
 * @property {string} [selectedLessonId]
 * @property {'day'|'week'|'month'|'year'|'list'} [plannerView]
 * @property {string} [visibleDateStart]
 * @property {string} [visibleDateEnd]
 * @property {string} userId
 * @property {'parent'|'child'|'tutor'} userRole
 * @property {string[]} enabledFeatures
 */

/**
 * @typedef {Object} DoodleLink
 * @property {string} label
 * @property {string} href
 * @property {string} [entityType]
 * @property {string} [entityId]
 */

/**
 * @typedef {Object} DoodleOption
 * @property {string} id
 * @property {string} label
 * @property {string} value
 */

/**
 * @typedef {Object} PreviewField
 * @property {string} label
 * @property {string} value
 * @property {boolean} [editable]
 * @property {string} [fieldPath]
 */

/**
 * @typedef {Object} BatchPreviewItem
 * @property {string} title
 * @property {string} [description]
 * @property {number} commandIndex
 */

/**
 * @typedef {
 *   | { type: 'event.create', householdId: string, title: string, startAt: string, endAt?: string, childIds?: string[], description?: string, subjectId?: string }
 *   | { type: 'assignment.create', householdId: string, schoolYearId?: string, subjectId: string, childIds: string[], title: string, dueAt?: string, pointsPossible?: number, instructions?: string }
 *   | { type: 'planner.item.move', itemId: string, startAt: string, endAt?: string }
 *   | { type: 'attendance.mark', householdId: string, childIds: string[], date: string, status: 'present'|'absent'|'partial', minutes?: number, subjectId?: string }
 * } DoodleCommand
 */

/**
 * @typedef {
 *   | { type: 'answer', message: string, links?: DoodleLink[] }
 *   | { type: 'clarification', message: string, options?: DoodleOption[] }
 *   | { type: 'navigation', message: string, destination: DoodleLink, related?: DoodleLink[] }
 *   | { type: 'action_preview', message: string, command: DoodleCommand, preview: PreviewField[], warnings?: string[], confirmationLabel: string, idempotencyKey?: string }
 *   | { type: 'batch_action_preview', message: string, commands: DoodleCommand[], preview: BatchPreviewItem[], warnings?: string[], confirmationLabel: string, idempotencyKey?: string }
 *   | { type: 'result', message: string, affectedRecords?: DoodleLink[], undoToken?: string }
 *   | { type: 'error', message: string, recoverable: boolean }
 * } DoodleResponse
 */

/**
 * @typedef {Object} DoodleMessage
 * @property {string} id
 * @property {'user'|'assistant'|'system'} role
 * @property {string} content
 * @property {string} createdAt
 * @property {DoodleResponse} [structured]
 */

export const DOODLE_COMMAND_TYPES = Object.freeze({
  EVENT_CREATE: 'event.create',
  EVENT_UPDATE: 'event.update',
  EVENT_DELETE: 'event.delete',
  ASSIGNMENT_CREATE: 'assignment.create',
  PLANNER_ITEM_MOVE: 'planner.item.move',
  PLANNER_ITEM_COMPLETE: 'planner.item.complete',
  ATTENDANCE_MARK: 'attendance.mark',
  ATTENDANCE_MARK_RANGE: 'attendance.mark_range',
  SCHOOL_YEAR_UPDATE: 'school_year.update',
  DAY_OFF_CREATE: 'day_off.create',
  DAY_OFF_DELETE: 'day_off.delete',
  MATERIAL_CREATE_LINK: 'material.create_link',
  MATERIAL_CREATE_FILE: 'material.create_file',
  MATERIAL_RENAME: 'material.rename',
  MATERIAL_ARCHIVE: 'material.archive',
  MATERIAL_ARCHIVE_ALL: 'material.archive_all',
  SUBJECT_CREATE: 'subject.create',
  SUBJECT_RENAME: 'subject.rename',
  SUBJECT_UPDATE: 'subject.update',
  SUBJECT_DELETE: 'subject.delete',
  CHILD_CREATE: 'child.create',
  CHILD_UPDATE: 'child.update',
  CHILD_DELETE: 'child.delete',
  CHILD_INVITE: 'child.invite',
  LEARNING_DAY_CREATE: 'learning_day.create',
  LEARNING_DAY_UPDATE: 'learning_day.update',
  LEARNING_DAY_DELETE: 'learning_day.delete',
  BULLETIN_POST_CREATE: 'bulletin.post.create',
  BULLETIN_POST_UPDATE: 'bulletin.post.update',
  BULLETIN_POST_DELETE: 'bulletin.post.delete',
});

export const DOODLE_RESPONSE_TYPES = Object.freeze({
  ANSWER: 'answer',
  CLARIFICATION: 'clarification',
  NAVIGATION: 'navigation',
  ACTION_PREVIEW: 'action_preview',
  BATCH_ACTION_PREVIEW: 'batch_action_preview',
  RESULT: 'result',
  ERROR: 'error',
});

export const DOODLE_PANE_STATUS = Object.freeze({
  IDLE: 'idle',
  SUBMITTING: 'submitting',
  AWAITING_CLARIFICATION: 'awaiting_clarification',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  ERROR: 'error',
});

/** @param {Partial<DoodleResponse> & { type: string }} response */
export function assertDoodleResponse(response) {
  if (!response || typeof response !== 'object' || !response.type) {
    return {
      type: 'error',
      message: 'Doodle returned an invalid response. Please try again.',
      recoverable: true,
    };
  }
  return response;
}
