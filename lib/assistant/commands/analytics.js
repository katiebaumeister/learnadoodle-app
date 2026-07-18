/**
 * Lightweight analytics for Doodle (no message text).
 */
export function trackDoodleEvent(name, properties = {}) {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('doodleAnalytics', {
          detail: {
            name,
            properties: {
              ...properties,
              ts: new Date().toISOString(),
            },
          },
        }),
      );
    }
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.debug('[doodle]', name, properties);
    }
  } catch {
    /* ignore */
  }
}
