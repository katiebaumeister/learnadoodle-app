import { Platform } from 'react-native';
import {
  createBulletinPost,
  dedupeFamilySystemBulletinPosts,
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

/** In-flight seeds per family — prevents onboarding + home mount races from double-inserting. */
const seedInFlightByFamily = new Map();

function isUniqueViolation(error) {
  const code = String(error?.code || error?.error?.code || '');
  const msg = String(error?.message || error?.error?.message || error || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate') || msg.includes('unique');
}

function notifyBulletinRefresh(familyId) {
  invalidateBulletinPostsCache(familyId);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('refreshBulletinBoard', {
        detail: { familyId },
      }),
    );
  }
}

export async function seedHomeWelcomeBulletinPost({ familyId, planningMode }) {
  if (!familyId) {
    return { data: null, error: new Error('Missing family id') };
  }

  const existing = seedInFlightByFamily.get(familyId);
  if (existing) return existing;

  let settle;
  const gate = new Promise((resolve) => {
    settle = resolve;
  });
  // Register synchronously before any await so concurrent callers share this gate.
  seedInFlightByFamily.set(familyId, gate);

  (async () => {
    try {
      // Clean up duplicates from earlier races (keep oldest).
      const dedupe = await dedupeFamilySystemBulletinPosts(
        familyId,
        HOME_GETTING_STARTED_SYSTEM_KIND,
      );
      if (dedupe.removed > 0) {
        notifyBulletinRefresh(familyId);
      }

      const alreadySeeded = await familySystemBulletinPostExists(
        familyId,
        HOME_GETTING_STARTED_SYSTEM_KIND,
      );
      if (alreadySeeded) {
        settle({ data: null, error: null, skipped: true });
        return;
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
        if (isUniqueViolation(result.error)) {
          await dedupeFamilySystemBulletinPosts(familyId, HOME_GETTING_STARTED_SYSTEM_KIND);
          settle({ data: null, error: null, skipped: true });
          return;
        }
        settle({ data: null, error: result.error, skipped: false });
        return;
      }

      if (result.data) {
        notifyBulletinRefresh(familyId);
      }
      settle(result);
    } catch (err) {
      settle({ data: null, error: err, skipped: false });
    } finally {
      seedInFlightByFamily.delete(familyId);
    }
  })();

  return gate;
}
