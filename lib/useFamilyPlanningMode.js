import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const CACHE_PREFIX = 'ld_family_planning_mode_v1::';

const cacheKeyForFamily = (familyId) => {
  const fid = String(familyId || '').trim();
  return fid ? `${CACHE_PREFIX}${fid}` : null;
};

const readCachedMode = (familyId) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const key = cacheKeyForFamily(familyId);
  if (!key) return null;
  try {
    const raw = window.localStorage?.getItem(key);
    return raw && raw.trim() ? raw : null;
  } catch (_) {
    return null;
  }
};

const writeCachedMode = (familyId, mode) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const key = cacheKeyForFamily(familyId);
  if (!key || mode === undefined || mode === null || mode === '') return;
  try {
    window.localStorage?.setItem(key, String(mode));
  } catch (_) {
    // ignore cache write failures
  }
};

/**
 * Stored family.default_planning_mode — kept in sync with Settings changes and refreshFamily events.
 * Seeds from a per-family localStorage cache so the correct mode renders immediately on refresh
 * (avoids a flash of the default mode before family data loads).
 */
export function useFamilyPlanningMode(familyId, family) {
  const [storedMode, setStoredMode] = useState(
    () => family?.default_planning_mode ?? readCachedMode(familyId || family?.id) ?? null
  );

  // When the family prop resolves a real mode, adopt it. Never clobber a known
  // value with null (which happens transiently while family data is loading).
  useEffect(() => {
    const nextMode = family?.default_planning_mode;
    if (nextMode === undefined || nextMode === null) return;
    setStoredMode(nextMode);
  }, [family?.default_planning_mode, family?.id]);

  // If we only have a familyId (no mode yet), seed from cache.
  useEffect(() => {
    setStoredMode((prev) => prev ?? readCachedMode(familyId || family?.id));
  }, [familyId, family?.id]);

  // Persist whenever we hold a known mode so the next refresh is stable.
  useEffect(() => {
    if (storedMode) writeCachedMode(familyId || family?.id, storedMode);
  }, [storedMode, familyId, family?.id]);

  const refreshFromDatabase = useCallback(async () => {
    const fid = familyId || family?.id;
    if (!fid) return;
    try {
      const { data, error } = await supabase
        .from('family')
        .select('default_planning_mode')
        .eq('id', fid)
        .maybeSingle();
      if (!error && data && data.default_planning_mode) {
        setStoredMode(data.default_planning_mode);
        writeCachedMode(fid, data.default_planning_mode);
      }
    } catch (_) {
      // Non-blocking — family prop / cache remain fallback.
    }
  }, [family?.id, familyId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const applyMode = (nextMode) => {
      if (nextMode === undefined || nextMode === null) return;
      setStoredMode(nextMode);
      writeCachedMode(familyId || family?.id, nextMode);
    };

    const handlePlanningModeChanged = (event) => {
      applyMode(event?.detail?.default_planning_mode);
    };

    const handleRefreshFamily = (event) => {
      const nextMode = event?.detail?.default_planning_mode;
      if (nextMode !== undefined && nextMode !== null) {
        applyMode(nextMode);
        return;
      }
      refreshFromDatabase();
    };

    window.addEventListener('planningModeChanged', handlePlanningModeChanged);
    window.addEventListener('refreshFamily', handleRefreshFamily);
    return () => {
      window.removeEventListener('planningModeChanged', handlePlanningModeChanged);
      window.removeEventListener('refreshFamily', handleRefreshFamily);
    };
  }, [refreshFromDatabase, familyId, family?.id]);

  return storedMode;
}

export function dispatchPlanningModeChanged(defaultPlanningMode) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('planningModeChanged', {
    detail: { default_planning_mode: defaultPlanningMode },
  }));
  window.dispatchEvent(new CustomEvent('refreshFamily', {
    detail: { default_planning_mode: defaultPlanningMode },
  }));
}
