import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { rowToFlagMap } from '../lib/services/userControlsClient';
import { useSession } from './SessionContext';
import { getFamilyUserControls, rowToFlagMap } from '../lib/services/userControlsClient';

const FamilyUserControlsContext = createContext(null);

export function FamilyUserControlsProvider({ children }) {
  const session = useSession();
  const familyId = session?.family_id ?? null;
  const isRestrictedViewer = !!(
    session?.role_flags?.isChild ||
    session?.role_flags?.isTutor
  );

  const [flags, setFlags] = useState(() => rowToFlagMap(null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!familyId) {
      setFlags(rowToFlagMap(null));
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await getFamilyUserControls(familyId);
      if (err) throw err;
      setFlags(rowToFlagMap(data));
    } catch (e) {
      setError(e?.message || 'Failed to load user controls');
      setFlags(rowToFlagMap(null));
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Parents are never blocked by these flags. Child/tutor use stored flags (default allow). */
  const allowed = useCallback(
    (key) => {
      if (!isRestrictedViewer) return true;
      return !!flags[key];
    },
    [isRestrictedViewer, flags]
  );

  const value = useMemo(
    () => ({
      familyId,
      flags,
      loading,
      error,
      refresh: load,
      isRestrictedViewer,
      allowed,
    }),
    [familyId, flags, loading, error, load, isRestrictedViewer, allowed]
  );

  return (
    <FamilyUserControlsContext.Provider value={value}>{children}</FamilyUserControlsContext.Provider>
  );
}

export function useFamilyUserControls() {
  const ctx = useContext(FamilyUserControlsContext);
  if (!ctx) {
    throw new Error('useFamilyUserControls must be used within FamilyUserControlsProvider');
  }
  return ctx;
}

/** Safe when provider is absent (e.g. tests); enforcement defaults to allow-all. */
export function useOptionalFamilyUserControls() {
  const ctx = useContext(FamilyUserControlsContext);
  if (!ctx) {
    return {
      familyId: null,
      flags: rowToFlagMap(null),
      loading: false,
      error: null,
      refresh: () => {},
      isRestrictedViewer: false,
      allowed: () => true,
    };
  }
  return ctx;
}
