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

const IMPORT_METHODS = new Set(['upload', 'paste_plain', 'generate', 'unified']);

function deriveTitleFromNotes(notes, fallback) {
  const text = String(notes || '').trim();
  if (!text) return fallback || null;
  const firstLine = text.split(/\n/)[0].trim();
  if (!firstLine) return fallback || null;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

export default function SubjectUnitsEditorHost({ familyId }) {
  const [visible, setVisible] = useState(false);
  const [subjectId, setSubjectId] = useState(null);
  const [subjectName, setSubjectName] = useState('');
  const [academicYearId, setAcademicYearId] = useState(null);
  const [hasExistingContent, setHasExistingContent] = useState(false);
  const [initialDraft, setInitialDraft] = useState(null);
  const [method, setMethod] = useState(null);
  const [initialMaterialId, setInitialMaterialId] = useState(null);
  const [initialNotes, setInitialNotes] = useState('');
  const [autoContinueOnOpen, setAutoContinueOnOpen] = useState(false);
  const [headerTitle, setHeaderTitle] = useState(null);
  const [childIds, setChildIds] = useState([]);
  const [withDates, setWithDates] = useState(false);
  /** When set, reopen magic wizard on the compose step after leaving an import screen. */
  const [magicResume, setMagicResume] = useState(null);

  const subject = useMemo(
    () => (subjectId ? { id: subjectId, name: subjectName || 'Subject' } : null),
    [subjectId, subjectName],
  );

  const handleClose = useCallback(() => {
    setVisible(false);
    setInitialDraft(null);
    setMethod(null);
    setInitialMaterialId(null);
    setInitialNotes('');
    setAutoContinueOnOpen(false);
    setHeaderTitle(null);
    setChildIds([]);
    setWithDates(false);
    setMagicResume(null);
  }, []);

  const handleSaved = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && subjectId) {
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
      window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
    }
    handleClose();
  }, [handleClose, subjectId]);

  const openAssignmentOrLessonModal = useCallback((choice) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !subjectId) return;
    const notes = String(choice?.notes || '').trim();
    const materialId = choice?.materialId != null ? String(choice.materialId) : null;
    const ids = Array.isArray(childIds) ? childIds.map(String).filter(Boolean) : [];
    const isLesson = choice?.purpose === 'lesson';
    const title = deriveTitleFromNotes(
      notes,
      isLesson ? `Learning day · ${subjectName || 'Subject'}` : `Assignment · ${subjectName || 'Subject'}`,
    );
    window.dispatchEvent(new CustomEvent('openTaskModal', {
      detail: {
        date: new Date(),
        eventType: isLesson ? 'Lesson' : 'Assignment',
        subjectId,
        childIds: ids,
        childId: ids[0] || null,
        title,
        materialId,
        instructions: isLesson ? undefined : notes,
        notes: isLesson ? notes : undefined,
        placement: choice?.withDates === true ? 'calendar' : 'backlog',
      },
    }));
    handleClose();
  }, [subjectId, subjectName, childIds, handleClose]);

  const handleMagicContinue = useCallback((choice) => {
    const purpose = choice?.purpose || 'subject_plan';
    const nextWithDates = choice?.withDates === true;
    const notes = String(choice?.notes || '').trim();
    const materialId = choice?.materialId != null ? String(choice.materialId) : null;

    if (purpose === 'assignment' || purpose === 'lesson') {
      openAssignmentOrLessonModal({
        purpose,
        withDates: nextWithDates,
        notes,
        materialId,
      });
      return;
    }

    // Full subject plan → unified curriculum import (auto-run with compose payload).
    setMagicResume({
      step: 2,
      purpose,
      withDates: nextWithDates,
      notes,
      materialId,
    });
    setWithDates(nextWithDates);
    setInitialNotes(notes);
    setInitialMaterialId(materialId);
    setAutoContinueOnOpen(true);
    setHeaderTitle('Create classwork');
    setMethod('unified');
  }, [openAssignmentOrLessonModal]);

  const handleImportBackToCompose = useCallback(() => {
    setHeaderTitle(null);
    setAutoContinueOnOpen(false);
    setMethod('magic');
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
      setInitialNotes(typeof detail.initialNotes === 'string' ? detail.initialNotes : '');
      setAutoContinueOnOpen(detail.autoContinueOnOpen === true);
      setHeaderTitle(detail.headerTitle != null ? String(detail.headerTitle).trim() || null : null);
      setChildIds(Array.isArray(detail.childIds) ? detail.childIds.map(String) : []);
      setWithDates(detail.withDates === true);
      setMagicResume(null);

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
        resumeAt={magicResume}
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
        onBack={magicResume ? handleImportBackToCompose : undefined}
        onSaved={handleSaved}
        familyId={familyId}
        subject={subject}
        assignedChildIds={childIds}
        replaceExisting={hasExistingContent}
        hasExistingContent={hasExistingContent}
        initialMethod={method}
        academicYearId={academicYearId}
        initialMaterialId={initialMaterialId}
        initialNotes={initialNotes}
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
