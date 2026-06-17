import { Platform } from 'react-native';
import {
  createBulletinPost,
  familySystemBulletinPostExists,
} from './services/bulletinClient';
import { invalidateBulletinPostsCache } from './bulletinBoardCache';
import { getEffectivePlanningMode } from './planningMode';

export const HOME_GETTING_STARTED_SYSTEM_KIND = 'home_getting_started';

const SHARED_CLOSING =
  "We'll help you from here with staying on track, encouraging growth, and connecting as a family.";

const BODIES = {
  HOMESCHOOL_COMPLIANCE: `Welcome to Learnadoodle

Let's set up your first school year.

1. Go to Subjects > Edit School Year and set your default learning rhythm
2. Add Subjects and recurring learning days to populate the planner with your expected student learning times
3. Schedule other events, start assigning work, and planning curriculum. ${SHARED_CLOSING}`,

  AFTERSCHOOL_GOALS: `Welcome to Learnadoodle! Start scheduling events in Planner and tracking learning in Subjects. ${SHARED_CLOSING}`,
};

function normalizeMode(mode) {
  const effective = getEffectivePlanningMode(mode);
  if (effective && BODIES[effective]) return effective;
  return 'HOMESCHOOL_COMPLIANCE';
}

export function buildHomeWelcomeBulletinBody(planningMode) {
  return BODIES[normalizeMode(planningMode)];
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
