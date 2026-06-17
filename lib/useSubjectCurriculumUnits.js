import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { fetchSubjectCurriculumEventsStructure } from './services/curriculumClient';
import {
  getSubjectProgressCache,
  mergeSubjectProgressCache,
} from './subjectProgressPlanCache';
import { prefetchSubjectProgressPlanEntry } from './prefetchSubjectProgressPlan';

export function readCachedSubjectCurriculumUnits(familyId, subjectId) {
  if (!familyId || subjectId == null || String(subjectId).trim() === '') return [];
  const entry = getSubjectProgressCache(familyId, subjectId);
  return Array.isArray(entry?.curriculumUnits) ? entry.curriculumUnits : [];
}

export function writeCachedSubjectCurriculumUnits(familyId, subjectId, units) {
  if (!familyId || subjectId == null || String(subjectId).trim() === '') return;
  mergeSubjectProgressCache(familyId, subjectId, {
    curriculumUnits: Array.isArray(units) ? units : [],
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('subjectProgressPlanCacheUpdated', {
        detail: { familyId: String(familyId), subjectId: String(subjectId) },
      }),
    );
  }
}

export async function refreshSubjectCurriculumUnits(
  familyId,
  subjectId,
  academicYearId = null,
) {
  if (!familyId || subjectId == null || String(subjectId).trim() === '') return [];
  const { data, error } = await fetchSubjectCurriculumEventsStructure(
    familyId,
    subjectId,
    academicYearId,
  );
  const units = !error && Array.isArray(data?.units) ? data.units : [];
  writeCachedSubjectCurriculumUnits(familyId, subjectId, units);
  return units;
}

/**
 * Cache-first curriculum units for unit/lesson pickers. Never exposes a loading flag —
 * initial render uses prefetch cache; background refresh keeps data fresh.
 */
export function useSubjectCurriculumUnits(familyId, subjectId, academicYearId = null) {
  const [units, setUnits] = useState(() => readCachedSubjectCurriculumUnits(familyId, subjectId));

  const syncFromCache = useCallback(() => {
    setUnits(readCachedSubjectCurriculumUnits(familyId, subjectId));
  }, [familyId, subjectId]);

  useEffect(() => {
    if (!familyId || subjectId == null || String(subjectId).trim() === '') {
      setUnits([]);
      return undefined;
    }

    syncFromCache();

    const cached = readCachedSubjectCurriculumUnits(familyId, subjectId);
    if (!cached.length) {
      prefetchSubjectProgressPlanEntry(familyId, subjectId).catch(() => {});
    }

    let cancelled = false;
    (async () => {
      try {
        const next = await refreshSubjectCurriculumUnits(familyId, subjectId, academicYearId);
        if (!cancelled) setUnits(next);
      } catch (_) {
        if (!cancelled) syncFromCache();
      }
    })();

    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return () => {
        cancelled = true;
      };
    }

    const onCacheUpdate = (event) => {
      const detail = event?.detail || {};
      if (String(detail.familyId) !== String(familyId)) return;
      if (String(detail.subjectId) !== String(subjectId)) return;
      syncFromCache();
    };
    window.addEventListener('subjectProgressPlanCacheUpdated', onCacheUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener('subjectProgressPlanCacheUpdated', onCacheUpdate);
    };
  }, [familyId, subjectId, academicYearId, syncFromCache]);

  return units;
}
