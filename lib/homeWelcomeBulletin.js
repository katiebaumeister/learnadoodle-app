import { Platform } from 'react-native';
import {
  createBulletinPost,
  familySystemBulletinPostExists,
} from './services/bulletinClient';

export const HOME_GETTING_STARTED_SYSTEM_KIND = 'home_getting_started';

const CLOSING =
  "Then keep coordinating, learning, and growing together — following your students' strengths and curiosities as you go.";

const BODIES = {
  HOMESCHOOL_COMPLIANCE: `Welcome to Learnadoodle! Here's how to get started:

• Subjects — add the subjects you teach and build units, lessons, and assignments.
• Settings — set your school year dates, terms, and attendance targets.
• Planner — schedule class days and see your week come together.

${CLOSING}`,

  AFTERSCHOOL_GOALS: `Welcome to Learnadoodle! Here's how to get started:

• Planner — add activities, practices, and recurring family routines.
• Subjects — track reading, homework, or enrichment goals.
• Settings — invite another parent or student when you're ready to coordinate together.

${CLOSING}`,

  NONE: `Welcome to Learnadoodle! Here's how to get started:

• Planner — create events and put your family's schedule in one place.
• Settings — connect an external calendar or invite household members when you're ready.

Then keep coordinating, learning, and growing together — one week at a time.`,
};

function normalizeMode(mode) {
  if (mode && BODIES[mode]) return mode;
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

  if (Platform.OS === 'web' && typeof window !== 'undefined' && result.data) {
    window.dispatchEvent(
      new CustomEvent('refreshBulletinBoard', {
        detail: { familyId },
      }),
    );
  }

  return result;
}
