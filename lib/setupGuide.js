/**
 * Post-onboarding routing.
 */

/** Post-onboarding landing tab — always Home so the welcome bulletin is visible. */
export function getPostOnboardingRoute(_planningMode) {
  return { tab: 'home' };
}
