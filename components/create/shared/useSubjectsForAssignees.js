import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { parseChildIds } from '../../../lib/services/subjectsClient';

export { parseChildIds as parseSubjectChildIds };

export function getCurrentSchoolYearLabel(refDate = new Date()) {
  const month = refDate.getMonth() + 1;
  const startYear = month >= 8 ? refDate.getFullYear() : refDate.getFullYear() - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export function normalizeSchoolYearLabel(value, refDate = new Date()) {
  const raw = String(value || '').trim();
  if (/^\d{4}\/\d{2}$/.test(raw)) return raw;
  return getCurrentSchoolYearLabel(refDate);
}

export function resolveSubjectSchoolYearLabel(subject) {
  return normalizeSchoolYearLabel(subject?.school_year);
}

export function isSubjectInCurrentSchoolYear(subject, refDate = new Date()) {
  const current = getCurrentSchoolYearLabel(refDate);
  return resolveSubjectSchoolYearLabel(subject) === current;
}

function sortSubjectsByName(subjects) {
  return (subjects || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function normalizePinnedSubjectIds(pinnedSubjectIds, pinnedSubjectId) {
  const ids = [];
  if (pinnedSubjectId != null && String(pinnedSubjectId).trim()) {
    ids.push(String(pinnedSubjectId).trim());
  }
  if (Array.isArray(pinnedSubjectIds)) {
    pinnedSubjectIds.forEach((id) => {
      const next = String(id || '').trim();
      if (next) ids.push(next);
    });
  }
  return [...new Set(ids)];
}

function filterSubjectsForAssignmentPicker(allSubjects, { pinnedSubjectIds = [] } = {}) {
  const pinnedSet = new Set(pinnedSubjectIds);
  const filtered = (allSubjects || []).filter((subject) => {
    const id = String(subject?.id || '').trim();
    if (!id) return false;
    if (pinnedSet.has(id)) return true;
    return isSubjectInCurrentSchoolYear(subject);
  });
  return sortSubjectsByName(filtered);
}

async function fetchFamilySubjectRows(familyId) {
  const { data, error } = await supabase
    .from('subject')
    .select('id, name, child_id, school_year')
    .eq('family_id', familyId);
  if (error) throw error;
  return data || [];
}

/** Current-school-year subjects for assignment/event subject pickers. */
export function useFamilySubjects(familyId, options = {}) {
  const pinnedSubjectIds = useMemo(
    () => normalizePinnedSubjectIds(options.pinnedSubjectIds, options.pinnedSubjectId),
    [options.pinnedSubjectIds, options.pinnedSubjectId],
  );
  const [subjects, setSubjects] = useState([]);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handleRefresh = () => setRefreshToken((token) => token + 1);
    window.addEventListener('refreshSubjects', handleRefresh);
    return () => window.removeEventListener('refreshSubjects', handleRefresh);
  }, []);

  useEffect(() => {
    if (!familyId) {
      setSubjects([]);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchFamilySubjectRows(familyId);
        if (cancelled) return;
        setSubjects(filterSubjectsForAssignmentPicker(rows, { pinnedSubjectIds }));
      } catch (_) {
        if (!cancelled) setSubjects([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [familyId, refreshToken, pinnedSubjectIds]);

  return subjects;
}

function parseSubjectChildIdsFromRow(raw) {
  return parseChildIds(raw == null ? '' : raw)
    .map((id) => id.trim())
    .filter(Boolean);
}

export function useSubjectsForAssignees(familyId, assigneeIds, defaultSubjectId = null) {
  const pinnedSubjectIds = useMemo(
    () => normalizePinnedSubjectIds(defaultSubjectId ? [defaultSubjectId] : []),
    [defaultSubjectId],
  );
  const [subjects, setSubjects] = useState([]);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handleRefresh = () => setRefreshToken((token) => token + 1);
    window.addEventListener('refreshSubjects', handleRefresh);
    return () => window.removeEventListener('refreshSubjects', handleRefresh);
  }, []);

  useEffect(() => {
    if (!familyId) {
      setSubjects([]);
      return;
    }
    if (!Array.isArray(assigneeIds) || assigneeIds.length === 0) {
      setSubjects([]);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const allSubjects = await fetchFamilySubjectRows(familyId);
        if (cancelled) return;

        const yearFiltered = filterSubjectsForAssignmentPicker(allSubjects, { pinnedSubjectIds });

        const subjectMap = new Map();
        yearFiltered.forEach((subject) => {
          const subjectChildIds = parseSubjectChildIdsFromRow(subject.child_id);
          const isFamilyWide = subjectChildIds.length === 0;
          const isForSelectedChild = subjectChildIds.some((id) =>
            assigneeIds.some((assigneeId) => String(assigneeId) === String(id))
          );
          const isDefaultSubject = !!defaultSubjectId && String(subject.id) === String(defaultSubjectId);
          if (isFamilyWide || isForSelectedChild || isDefaultSubject) {
            const existing = subjectMap.get(subject.name);
            if (!existing || isDefaultSubject) {
              subjectMap.set(subject.name, subject);
            }
          }
        });

        setSubjects(
          Array.from(subjectMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        );
      } catch (_) {
        if (!cancelled) setSubjects([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [familyId, assigneeIds, defaultSubjectId, refreshToken, pinnedSubjectIds]);

  return subjects;
}
