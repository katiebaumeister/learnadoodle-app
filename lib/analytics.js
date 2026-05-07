export function trackEvent(name, payload = {}) {
  try {
    if (globalThis?.analytics?.track && typeof globalThis.analytics.track === 'function') {
      globalThis.analytics.track(name, payload);
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[analytics]', name, payload);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[analytics failed]', name, err);
  }
}
