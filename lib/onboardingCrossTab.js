/** Cross-tab signal when onboarding finishes in another browser tab. */

export const ONBOARDING_COMPLETED_STORAGE_KEY = 'ld_onboarding_completed_signal';
export const PENDING_SIGNUP_VERIFICATION_KEY = 'ld_pending_signup_verification';

export function notifyOnboardingCompleted(detail = {}) {
  if (typeof window === 'undefined') return;
  const payload = {
    at: Date.now(),
    planningMode: detail.planningMode ?? null,
    familyId: detail.familyId ?? null,
  };
  try {
    localStorage.setItem(ONBOARDING_COMPLETED_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new CustomEvent('onboardingCompleted', { detail: payload }));
  try {
    const channel = new BroadcastChannel('learnadoodle-onboarding');
    channel.postMessage({ type: 'completed', ...payload });
    channel.close();
  } catch (_) {
    /* BroadcastChannel unavailable */
  }
}

export function subscribeOnboardingCompleted(handler) {
  if (typeof window === 'undefined') return () => {};

  const onCustom = (event) => {
    handler(event?.detail || {});
  };

  const onStorage = (event) => {
    if (event.key !== ONBOARDING_COMPLETED_STORAGE_KEY || !event.newValue) return;
    try {
      handler(JSON.parse(event.newValue));
    } catch (_) {
      handler({});
    }
  };

  let channel = null;
  const onBroadcast = (event) => {
    if (event?.data?.type === 'completed') {
      handler(event.data);
    }
  };

  window.addEventListener('onboardingCompleted', onCustom);
  window.addEventListener('storage', onStorage);
  try {
    channel = new BroadcastChannel('learnadoodle-onboarding');
    channel.addEventListener('message', onBroadcast);
  } catch (_) {
    /* ignore */
  }

  return () => {
    window.removeEventListener('onboardingCompleted', onCustom);
    window.removeEventListener('storage', onStorage);
    if (channel) {
      channel.removeEventListener('message', onBroadcast);
      channel.close();
    }
  };
}

export function markPendingSignupVerification(email) {
  if (typeof window === 'undefined' || !email) return;
  try {
    sessionStorage.setItem(PENDING_SIGNUP_VERIFICATION_KEY, String(email).trim());
  } catch (_) {
    /* ignore */
  }
}

export function clearPendingSignupVerification() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_SIGNUP_VERIFICATION_KEY);
  } catch (_) {
    /* ignore */
  }
}

export function hasPendingSignupVerification() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(sessionStorage.getItem(PENDING_SIGNUP_VERIFICATION_KEY));
  } catch (_) {
    return false;
  }
}

/** Redirect into the app when another tab completes email verification. */
export function redirectIfAuthenticatedSession(getSession) {
  if (typeof window === 'undefined') return Promise.resolve(false);
  return getSession()
    .then(({ data }) => {
      if (!data?.session?.user) return false;
      clearPendingSignupVerification();
      window.location.href = '/?signup=true';
      return true;
    })
    .catch(() => false);
}
