import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchAndCacheAssignmentActivity,
  hydrateAssignmentActivityState,
  writeAssignmentActivityCache,
} from '../../lib/bulletinBoardCache';

export default function useAssignmentActivity(familyId, subjectId, limit = 20, enabled = true) {
  const initialState = useMemo(
    () => (enabled && familyId ? hydrateAssignmentActivityState(familyId, subjectId) : { fromCache: false, items: [] }),
    [enabled, familyId, subjectId]
  );
  const [items, setItems] = useState(() => initialState.items);

  const load = useCallback(async () => {
    if (!enabled || !familyId) {
      setItems([]);
      return;
    }
    try {
      const data = await fetchAndCacheAssignmentActivity(familyId, subjectId, limit);
      setItems(data || []);
    } catch (_) {
      // Keep showing cached items on refresh failure.
    }
  }, [enabled, familyId, subjectId, limit]);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled || !familyId) {
      setItems([]);
      return;
    }
    const cached = hydrateAssignmentActivityState(familyId, subjectId);
    if (cached.fromCache) {
      setItems(cached.items);
    }
    loadRef.current();
  }, [enabled, familyId, subjectId, limit]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const handler = () => loadRef.current();
    window.addEventListener('childAssignmentsNeedRefresh', handler);
    window.addEventListener('parentAssignmentsNeedRefresh', handler);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', handler);
      window.removeEventListener('parentAssignmentsNeedRefresh', handler);
    };
  }, [enabled]);

  const reload = useCallback(() => {
    loadRef.current();
  }, []);

  const updateItems = useCallback((nextItems) => {
    const normalized = Array.isArray(nextItems) ? nextItems : [];
    setItems(normalized);
    if (familyId) writeAssignmentActivityCache(familyId, subjectId, normalized);
  }, [familyId, subjectId]);

  return { items, loading: false, reload, updateItems };
}
