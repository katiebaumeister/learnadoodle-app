import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import EditSubjectUnitsModal from './EditSubjectUnitsModal';
import SubjectCurriculumImportModal from './SubjectCurriculumImportModal';
import { getSubjectProgressCache } from '../../lib/subjectProgressPlanCache';
import {
  curriculumStructureHasContent,
  draftFromCurriculumStructure,
} from '../../lib/subjectUnitsEditorDraft';
import { normalizeSubjectUnitsEditorMethod } from '../../lib/subjectUnitsEditor';

const IMPORT_METHODS = new Set(['upload', 'paste_plain', 'generate']);

export default function SubjectUnitsEditorHost({ familyId }) {
  const [visible, setVisible] = useState(false);
  const [subjectId, setSubjectId] = useState(null);
  const [subjectName, setSubjectName] = useState('');
  const [academicYearId, setAcademicYearId] = useState(null);
  const [hasExistingContent, setHasExistingContent] = useState(false);
  const [initialDraft, setInitialDraft] = useState(null);
  const [method, setMethod] = useState(null);
  const [initialMaterialId, setInitialMaterialId] = useState(null);
  const [autoContinueOnOpen, setAutoContinueOnOpen] = useState(false);
  const [headerTitle, setHeaderTitle] = useState(null);
  const [childIds, setChildIds] = useState([]);

  const subject = useMemo(
    () => (subjectId ? { id: subjectId, name: subjectName || 'Subject' } : null),
    [subjectId, subjectName],
  );

  const handleClose = useCallback(() => {
    setVisible(false);
    setInitialDraft(null);
    setMethod(null);
    setInitialMaterialId(null);
    setAutoContinueOnOpen(false);
    setHeaderTitle(null);
    setChildIds([]);
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
      setInitialMaterialId(
        detail.initialMaterialId != null ? String(detail.initialMaterialId).trim() : null,
      );
      setAutoContinueOnOpen(detail.autoContinueOnOpen === true);
      setHeaderTitle(detail.headerTitle != null ? String(detail.headerTitle).trim() || null : null);
      setChildIds(Array.isArray(detail.childIds) ? detail.childIds.map(String) : []);

      const nextMethod = detail.method
        ? normalizeSubjectUnitsEditorMethod(detail.method)
        : null;
      setMethod(nextMethod);

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

  if (!familyId || !subject || !visible) return null;

  if (method && IMPORT_METHODS.has(method)) {
    return (
      <SubjectCurriculumImportModal
        visible
        onClose={handleClose}
        onSaved={handleSaved}
        familyId={familyId}
        subject={subject}
        assignedChildIds={childIds}
        replaceExisting={hasExistingContent}
        hasExistingContent={hasExistingContent}
        initialMethod={method}
        academicYearId={academicYearId}
        initialMaterialId={initialMaterialId}
        autoContinueOnOpen={autoContinueOnOpen}
        headerTitle={headerTitle}
      />
    );
  }

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
