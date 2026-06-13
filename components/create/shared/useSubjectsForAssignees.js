import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

function parseSubjectChildIds(raw) {
  return String(raw == null ? '' : raw)
    .split(';')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function useSubjectsForAssignees(familyId, assigneeIds, defaultSubjectId = null) {
  const [subjects, setSubjects] = useState([]);

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
      const { data: allSubjects, error } = await supabase
        .from('subject')
        .select('id, name, child_id')
        .eq('family_id', familyId);
      if (cancelled) return;
      if (error) {
        setSubjects([]);
        return;
      }

      const subjectMap = new Map();
      (allSubjects || []).forEach((subject) => {
        const subjectChildIds = parseSubjectChildIds(subject.child_id);
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
    })();

    return () => {
      cancelled = true;
    };
  }, [familyId, assigneeIds, defaultSubjectId]);

  return subjects;
}
