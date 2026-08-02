/**
 * One-time home bulletin helper: “Click a post to open it.”
 * Shown until the user opens a post (or we mark it seen).
 */

const STORAGE_PREFIX = 'ld_bulletin_click_hint_seen_v1';

function storageKey(userId) {
  return `${STORAGE_PREFIX}_${userId}`;
}

export function hasSeenBulletinClickHint(userId) {
  if (!userId || typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(storageKey(userId)) === '1';
  } catch {
    return true;
  }
}

export function markBulletinClickHintSeen(userId) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), '1');
  } catch {
    /* ignore quota */
  }
}
