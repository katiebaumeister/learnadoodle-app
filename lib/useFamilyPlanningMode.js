import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Stored family.default_planning_mode — kept in sync with Settings changes and refreshFamily events.
 */
export function useFamilyPlanningMode(familyId, family) {
  const [storedMode, setStoredMode] = useState(family?.default_planning_mode ?? null);

  useEffect(() => {
    setStoredMode(family?.default_planning_mode ?? null);
  }, [family?.default_planning_mode, family?.id]);

  const refreshFromDatabase = useCallback(async () => {
    const fid = familyId || family?.id;
    if (!fid) return;
    try {
      const { data, error } = await supabase
        .from('family')
        .select('default_planning_mode')
        .eq('id', fid)
        .maybeSingle();
      if (!error && data) {
        setStoredMode(data.default_planning_mode ?? null);
      }
    } catch (_) {
      // Non-blocking — family prop remains fallback.
    }
  }, [family?.id, familyId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;

    const applyMode = (nextMode) => {
      if (nextMode === undefined || nextMode === null) return;
      setStoredMode(nextMode);
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
  }, [refreshFromDatabase]);

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
