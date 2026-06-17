/**
 * In-memory + session bulletin board cache.
 * Preloaded from WebLayout so Home / Subject bulletin feeds render without a loading flash.
 */

import { Platform } from 'react-native';
import {
  fetchAuthorProfiles,
  fetchBulletinPosts,
  mergeFamilyMemberProfiles,
} from './services/bulletinClient';
import { fetchAssignmentActivityForSubject } from './services/assignmentActivityClient';
import { getFamilyMembers } from './apiClient';
import { supabase } from './supabase';

const postsMemory = new Map();
const activityMemory = new Map();

const POSTS_SESSION_PREFIX = 'bulletin_posts_v1_';
const ACTIVITY_SESSION_PREFIX = 'bulletin_activity_v1_';

const serializeProfileMap = (profileMap) => {
  if (!(profileMap instanceof Map)) return [];
  return [...profileMap.entries()];
};

const deserializeProfileMap = (entries) => {
  if (!Array.isArray(entries)) return new Map();
  return new Map(entries);
};

const readSessionJson = (key) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage?.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
};

const writeSessionJson = (key, payload) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(key, JSON.stringify(payload));
  } catch (_) {
    // Quota or private mode — in-memory cache still works.
  }
};

const activityCacheKey = (familyId, subjectId) => `${String(familyId)}::${subjectId ? String(subjectId) : 'all'}`;

export function readBulletinPostsCache(familyId) {
  if (!familyId) return null;
  const key = String(familyId);
  if (postsMemory.has(key)) return postsMemory.get(key);
  const stored = readSessionJson(`${POSTS_SESSION_PREFIX}${key}`);
  if (stored && typeof stored === 'object') {
    postsMemory.set(key, stored);
    return stored;
  }
  return null;
}

export function writeBulletinPostsCache(familyId, payload) {
  if (!familyId || !payload || typeof payload !== 'object') return;
  const key = String(familyId);
  const next = {
    posts: Array.isArray(payload.posts) ? payload.posts : [],
    profileEntries: serializeProfileMap(payload.profileMap),
    currentUserId: payload.currentUserId || null,
    familyMembers: Array.isArray(payload.familyMembers) ? payload.familyMembers : [],
    updatedAt: Date.now(),
  };
  postsMemory.set(key, next);
  writeSessionJson(`${POSTS_SESSION_PREFIX}${key}`, next);
}

export function hydrateBulletinPostsState(familyId) {
  const cached = readBulletinPostsCache(familyId);
  if (!cached) {
    return {
      fromCache: false,
      posts: [],
      profileMap: new Map(),
      currentUserId: null,
      familyMembers: [],
    };
  }
  return {
    fromCache: true,
    posts: cached.posts || [],
    profileMap: deserializeProfileMap(cached.profileEntries),
    currentUserId: cached.currentUserId || null,
    familyMembers: cached.familyMembers || [],
  };
}

export function readAssignmentActivityCache(familyId, subjectId = null) {
  if (!familyId) return null;
  const key = activityCacheKey(familyId, subjectId);
  if (activityMemory.has(key)) return activityMemory.get(key);
  const stored = readSessionJson(`${ACTIVITY_SESSION_PREFIX}${key}`);
  if (stored && typeof stored === 'object') {
    activityMemory.set(key, stored);
    return stored;
  }
  return null;
}

export function writeAssignmentActivityCache(familyId, subjectId, items) {
  if (!familyId) return;
  const key = activityCacheKey(familyId, subjectId);
  const next = {
    items: Array.isArray(items) ? items : [],
    updatedAt: Date.now(),
  };
  activityMemory.set(key, next);
  writeSessionJson(`${ACTIVITY_SESSION_PREFIX}${key}`, next);
}

export function hydrateAssignmentActivityState(familyId, subjectId = null) {
  const cached = readAssignmentActivityCache(familyId, subjectId);
  if (cached) {
    return {
      fromCache: true,
      items: cached.items || [],
    };
  }
  // Subject feeds reuse family-wide activity preloaded at app shell bootstrap.
  if (subjectId) {
    const allCached = readAssignmentActivityCache(familyId, null);
    const filtered = (allCached?.items || []).filter(
      (item) => String(item?.subjectId || '') === String(subjectId),
    );
    if (filtered.length) {
      return { fromCache: true, items: filtered };
    }
  }
  return { fromCache: false, items: [] };
}

export async function fetchAndCacheBulletinPosts(familyId) {
  if (!familyId) return null;
  const [{ data: postRows, error: postError }, authRes, membersRes] = await Promise.all([
    fetchBulletinPosts(familyId),
    supabase.auth.getUser(),
    getFamilyMembers(),
  ]);
  if (postError) throw postError;

  const userIds = new Set();
  (postRows || []).forEach((post) => {
    if (post.authorUserId) userIds.add(String(post.authorUserId));
    (post.comments || []).forEach((c) => {
      if (c.authorUserId) userIds.add(String(c.authorUserId));
    });
  });
  if (authRes?.data?.user?.id) userIds.add(String(authRes.data.user.id));
  const familyMembers = membersRes?.data?.members || membersRes?.data || [];
  let profileMap = await fetchAuthorProfiles([...userIds]);
  profileMap = mergeFamilyMemberProfiles(profileMap, familyMembers);

  const authUser = authRes?.data?.user;
  if (authUser?.id) {
    const key = String(authUser.id);
    const existing = profileMap.get(key) || { id: authUser.id };
    profileMap.set(key, {
      ...existing,
      email: existing.email || authUser.email || null,
    });
  }

  const payload = {
    posts: postRows || [],
    profileMap,
    currentUserId: authUser?.id || null,
    familyMembers,
  };
  writeBulletinPostsCache(familyId, payload);
  return payload;
}

export async function fetchAndCacheAssignmentActivity(familyId, subjectId = null, limit = 50) {
  if (!familyId) return [];
  const { data } = await fetchAssignmentActivityForSubject(familyId, subjectId, limit);
  const items = data || [];
  writeAssignmentActivityCache(familyId, subjectId, items);
  return items;
}

/** Warm bulletin data during app shell bootstrap (non-blocking). */
export async function preloadBulletinBoardForFamily(familyId) {
  if (!familyId) return;
  await Promise.all([
    fetchAndCacheBulletinPosts(familyId).catch(() => null),
    fetchAndCacheAssignmentActivity(familyId, null, 50).catch(() => []),
  ]);
}

export function invalidateBulletinPostsCache(familyId) {
  if (!familyId) return;
  const key = String(familyId);
  postsMemory.delete(key);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      window.sessionStorage?.removeItem(`${POSTS_SESSION_PREFIX}${key}`);
    } catch (_) {
      // no-op
    }
  }
}
