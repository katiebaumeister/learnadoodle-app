import { Platform } from 'react-native';
import {
  createBulletinPost,
  subjectSystemBulletinPostExists,
} from './services/bulletinClient';

export const SUBJECT_GETTING_STARTED_SYSTEM_KIND = 'subject_getting_started';

export function buildSubjectGettingStartedBulletinBody(subjectName) {
  const name = String(subjectName || '').trim() || 'your subject';
  return `Welcome to ${name}! Here’s how to get started:

• Configure Schedule — open this subject's settings and set recurring planner slots for ${name}.

• Edit units (optional) — add structured units and lessons under Classwork when you want a clear outline.

• New Assignment — create initial work and attach it to lessons or drop it onto planner slots as you schedule.

Then keep coordinating, learning, and growing together — following your students’ strengths and curiosities as you go.`;
}

export async function seedSubjectGettingStartedBulletinPost({
  familyId,
  subjectId,
  subjectName,
}) {
  if (!familyId || !subjectId) {
    return { data: null, error: new Error('Missing family or subject id') };
  }

  const alreadySeeded = await subjectSystemBulletinPostExists(
    familyId,
    subjectId,
    SUBJECT_GETTING_STARTED_SYSTEM_KIND,
  );
  if (alreadySeeded) {
    return { data: null, error: null, skipped: true };
  }

  const result = await createBulletinPost({
    familyId,
    subjectId,
    body: buildSubjectGettingStartedBulletinBody(subjectName),
    visibility: 'all',
    source: 'learnadoodle',
    systemKind: SUBJECT_GETTING_STARTED_SYSTEM_KIND,
  });

  if (Platform.OS === 'web' && typeof window !== 'undefined' && result.data) {
    window.dispatchEvent(
      new CustomEvent('refreshBulletinBoard', {
        detail: { familyId, subjectId },
      }),
    );
  }

  return result;
}
