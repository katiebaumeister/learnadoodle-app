import { Platform } from 'react-native';
import {
  createBulletinPost,
  subjectSystemBulletinPostExists,
} from './services/bulletinClient';

export const SUBJECT_GETTING_STARTED_SYSTEM_KIND = 'subject_getting_started';

export function buildSubjectGettingStartedBulletinBody(subjectName) {
  const name = String(subjectName || '').trim() || 'your subject';
  return `Welcome to ${name}! This is the Bulletin Board for ${name}.`;
}

/** Strip legacy copy from stored welcome posts. */
export function normalizeSubjectGettingStartedBulletinBody(body) {
  let text = String(body || '');
  text = text.replace(/Edit units\s*\(optional\)/gi, 'Edit units');
  text = text.replace(
    /Configure Schedule — open this subject['’]s .* recurring planner slots for ([^.]+)\./gi,
    'Configure Schedule — Edit this subject and set dates to see recurring planner slots for $1.',
  );
  return text;
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
