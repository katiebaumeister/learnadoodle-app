import { Platform } from 'react-native';
import {
  createBulletinPost,
  familySystemBulletinPostExists,
} from './services/bulletinClient';
import { invalidateBulletinPostsCache } from './bulletinBoardCache';

export const HOME_GETTING_STARTED_SYSTEM_KIND = 'home_getting_started';

export const HOME_WELCOME_LABEL = 'Welcome to Learnadoodle';

export const HOME_WELCOME_INTRO = "Welcome to your family's learning home.";

export const HOME_WELCOME_BULLETIN_BODY = `${HOME_WELCOME_INTRO}

Getting Started
• Create your school year — Set up terms, schedules, and your family's learning calendar.
• Schedule lessons in Planner — Plan classes, events, and daily learning on your calendar.
• Share announcements in Subjects — Keep everyone informed about what's happening in each class.
• Organize resources in Materials — Store files, links, and lesson materials in one place.

💡 Tip
You can dismiss this message at any time.`;

/** Always show the current home welcome copy, including for posts seeded with older text. */
export function normalizeHomeGettingStartedBulletinBody(_body) {
  return HOME_WELCOME_BULLETIN_BODY;
}

export function buildHomeWelcomeBulletinBody(_planningMode) {
  return HOME_WELCOME_BULLETIN_BODY;
}

export async function seedHomeWelcomeBulletinPost({ familyId, planningMode }) {
  if (!familyId) {
    return { data: null, error: new Error('Missing family id') };
  }

  const alreadySeeded = await familySystemBulletinPostExists(
    familyId,
    HOME_GETTING_STARTED_SYSTEM_KIND,
  );
  if (alreadySeeded) {
    return { data: null, error: null, skipped: true };
  }

  const result = await createBulletinPost({
    familyId,
    subjectId: null,
    body: buildHomeWelcomeBulletinBody(planningMode),
    visibility: 'all',
    source: 'learnadoodle',
    systemKind: HOME_GETTING_STARTED_SYSTEM_KIND,
  });

  if (result.error) {
    return { data: null, error: result.error, skipped: false };
  }

  if (result.data) {
    invalidateBulletinPostsCache(familyId);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('refreshBulletinBoard', {
          detail: { familyId },
        }),
      );
    }
  }

  return result;
}
