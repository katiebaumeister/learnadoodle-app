import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import EditSubjectUnitsModal from './EditSubjectUnitsModal';
import SubjectCurriculumImportModal from './SubjectCurriculumImportModal';
import SubjectMagicCreateWizard from './SubjectMagicCreateWizard';
import { getSubjectProgressCache } from '../../lib/subjectProgressPlanCache';
import {
  curriculumStructureHasContent,
  draftFromCurriculumStructure,
} from '../../lib/subjectUnitsEditorDraft';
import { normalizeSubjectUnitsEditorMethod } from '../../lib/subjectUnitsEditor';
import { CLOSE_SUBJECT_UNITS_EDITOR } from '../../lib/subjectClassworkActions';

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
  const [withDates, setWithDates] = useState(false);

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
    setWithDates(false);
  }, []);

  const handleSaved = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && subjectId) {
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
      window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
    }
    handleClose();
  }, [handleClose, subjectId]);

  const handleMagicContinue = useCallback((choice) => {
    const purpose = choice?.purpose || 'subject_plan';
    const nextWithDates = choice?.withDates === true;
    const sourceMethod = normalizeSubjectUnitsEditorMethod(choice?.sourceMethod || 'upload');

    // Assignment / lesson stay in the wizard chat step (handled inside SubjectMagicCreateWizard).
    if (purpose === 'assignment' || purpose === 'lesson') {
      return;
    }

    // Full subject plan → curriculum import modal for the chosen source.
    setWithDates(nextWithDates);
    setAutoContinueOnOpen(false);
    setHeaderTitle(
      sourceMethod === 'generate'
        ? 'Generate curriculum'
        : sourceMethod === 'paste_plain'
          ? 'Paste plain text'
          : 'Create from doc',
    );
    setMethod(IMPORT_METHODS.has(sourceMethod) ? sourceMethod : 'upload');
  }, []);

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
      setWithDates(detail.withDates === true);

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
    const closeHandler = () => {
      handleClose();
    };
    window.addEventListener('openSubjectUnitsEditor', handler);
    window.addEventListener(CLOSE_SUBJECT_UNITS_EDITOR, closeHandler);
    return () => {
      window.removeEventListener('openSubjectUnitsEditor', handler);
      window.removeEventListener(CLOSE_SUBJECT_UNITS_EDITOR, closeHandler);
    };
  }, [familyId, handleClose]);

  if (!familyId || !subject || !visible) return null;

  if (method === 'magic') {
    return (
      <SubjectMagicCreateWizard
        visible
        onClose={handleClose}
        onContinue={handleMagicContinue}
        onChatCompleted={() => {
          if (Platform.OS === 'web' && typeof window !== 'undefined' && subjectId) {
            window.dispatchEvent(new CustomEvent('refreshSubjects'));
            window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
            window.dispatchEvent(new CustomEvent('refreshPlanner'));
          }
        }}
        subjectName={subject.name}
        familyId={familyId}
        subjectId={subject.id}
        academicYearId={academicYearId}
        childIds={childIds}
      />
    );
  }

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
        detectDates={withDates}
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
      childIds={childIds}
    />
  );
}
