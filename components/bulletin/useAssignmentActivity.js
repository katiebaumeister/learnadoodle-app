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
  const [loading, setLoading] = useState(() => enabled && !!familyId && !initialState.fromCache);

  const load = useCallback(async (options = {}) => {
    const silent = options?.silent === true;
    if (!enabled || !familyId) {
      setItems([]);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const data = await fetchAndCacheAssignmentActivity(familyId, subjectId, limit);
      setItems(data || []);
    } catch (_) {
      if (!silent) setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, familyId, subjectId, limit]);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled || !familyId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const cached = hydrateAssignmentActivityState(familyId, subjectId);
    if (cached.fromCache) {
      setItems(cached.items);
      setLoading(false);
      loadRef.current({ silent: true });
      return;
    }
    loadRef.current({ silent: false });
  }, [enabled, familyId, subjectId, limit]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const handler = () => loadRef.current({ silent: true });
    window.addEventListener('childAssignmentsNeedRefresh', handler);
    window.addEventListener('parentAssignmentsNeedRefresh', handler);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', handler);
      window.removeEventListener('parentAssignmentsNeedRefresh', handler);
    };
  }, [enabled]);

  const reload = useCallback(() => {
    loadRef.current({ silent: true });
  }, []);

  const updateItems = useCallback((nextItems) => {
    const normalized = Array.isArray(nextItems) ? nextItems : [];
    setItems(normalized);
    if (familyId) writeAssignmentActivityCache(familyId, subjectId, normalized);
  }, [familyId, subjectId]);

  return { items, loading, reload, updateItems };
}
