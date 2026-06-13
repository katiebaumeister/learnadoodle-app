import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import EditSubjectUnitsModal from './EditSubjectUnitsModal';
import { getSubjectProgressCache } from '../../lib/subjectProgressPlanCache';
import {
  curriculumStructureHasContent,
  draftFromCurriculumStructure,
} from '../../lib/subjectUnitsEditorDraft';

export default function SubjectUnitsEditorHost({ familyId }) {
  const [visible, setVisible] = useState(false);
  const [subjectId, setSubjectId] = useState(null);
  const [subjectName, setSubjectName] = useState('');
  const [academicYearId, setAcademicYearId] = useState(null);
  const [hasExistingContent, setHasExistingContent] = useState(false);
  const [initialDraft, setInitialDraft] = useState(null);

  const subject = useMemo(
    () => (subjectId ? { id: subjectId, name: subjectName || 'Subject' } : null),
    [subjectId, subjectName]
  );

  const handleClose = useCallback(() => {
    setVisible(false);
    setInitialDraft(null);
  }, []);

  const handleSaved = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && subjectId) {
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
      window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
    }
    handleClose();
  }, [handleClose, subjectId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = (event) => {
      const detail = event?.detail || {};
      const sid = detail.subjectId != null ? String(detail.subjectId).trim() : '';
      if (!sid || !familyId) return;
      setSubjectId(sid);
      setSubjectName(String(detail.subjectName || '').trim() || 'Subject');
      setAcademicYearId(detail.academicYearId != null ? String(detail.academicYearId).trim() : null);

      const cached = getSubjectProgressCache(familyId, sid);
      const units = Array.isArray(cached?.curriculumUnits) ? cached.curriculumUnits : [];
      if (typeof detail.hasExistingContent === 'boolean') {
        setHasExistingContent(detail.hasExistingContent);
      } else {
        setHasExistingContent(curriculumStructureHasContent({ units }));
      }
      setInitialDraft(units.length ? draftFromCurriculumStructure({ units }) : null);
      setVisible(true);
    };
    window.addEventListener('openSubjectUnitsEditor', handler);
    return () => window.removeEventListener('openSubjectUnitsEditor', handler);
  }, [familyId]);

  if (!familyId || !subject) return null;

  return (
    <EditSubjectUnitsModal
      visible={visible}
      onClose={handleClose}
      onSaved={handleSaved}
      familyId={familyId}
      subject={subject}
      hasExistingContent={hasExistingContent || Boolean(initialDraft?.units?.length)}
      initialDraft={initialDraft}
      academicYearId={academicYearId}
    />
  );
}
