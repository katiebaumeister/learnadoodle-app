/**
 * Built-in Doodle helper contact for the Messages inbox.
 * Selecting it opens the existing Doodle command pane (chat UX unchanged).
 */

export const DOODLE_HELPER_PARTICIPANT = Object.freeze({
  type: 'doodle',
  id: 'doodle',
  name: 'Doodle',
  roleLabel: 'Helper',
  isHelper: true,
});

export function isDoodleHelperParticipant(participant) {
  return participant?.type === 'doodle' || participant?.id === 'doodle';
}

export function doodleHelperParticipantKey() {
  return 'doodle:doodle';
}
