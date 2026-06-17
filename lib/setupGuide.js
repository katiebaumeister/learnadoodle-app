/**
 * Post-onboarding routing by planning mode.
 */

const DEFAULT_MODE = 'HOMESCHOOL_COMPLIANCE';

function normalizeMode(mode) {
  if (mode === 'HOMESCHOOL_COMPLIANCE' || mode === 'AFTERSCHOOL_GOALS' || mode === 'NONE') {
    return mode;
  }
  return DEFAULT_MODE;
}

/** Post-onboarding landing tab by planning mode. */
export function getPostOnboardingRoute(planningMode) {
  const mode = normalizeMode(planningMode);
  if (mode === 'HOMESCHOOL_COMPLIANCE') return { tab: 'subjects' };
  if (mode === 'AFTERSCHOOL_GOALS') return { tab: 'home' };
  return { tab: 'planner' };
}
