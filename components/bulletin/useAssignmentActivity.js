import { useCallback, useEffect, useState } from 'react';
import { fetchAssignmentActivityForSubject } from '../../lib/services/assignmentActivityClient';

export default function useAssignmentActivity(familyId, subjectId, limit = 20, enabled = true) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled && familyId));

  const load = useCallback(async () => {
    if (!enabled || !familyId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await fetchAssignmentActivityForSubject(familyId, subjectId, limit);
      setItems(data || []);
    } catch (_) {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, familyId, subjectId, limit]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    const handler = () => load();
    window.addEventListener('childAssignmentsNeedRefresh', handler);
    window.addEventListener('parentAssignmentsNeedRefresh', handler);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', handler);
      window.removeEventListener('parentAssignmentsNeedRefresh', handler);
    };
  }, [enabled, load]);

  return { items, loading, reload: load };
}
