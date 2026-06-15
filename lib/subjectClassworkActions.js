import { Platform } from 'react-native';

export const OPEN_SUBJECT_CLASSWORK_SCHEDULE_ALL = 'openSubjectClassworkScheduleAll';

export function dispatchOpenSubjectClassworkScheduleAll(subjectId) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !subjectId) return;
  window.dispatchEvent(new CustomEvent(OPEN_SUBJECT_CLASSWORK_SCHEDULE_ALL, {
    detail: { subjectId: String(subjectId) },
  }));
}
