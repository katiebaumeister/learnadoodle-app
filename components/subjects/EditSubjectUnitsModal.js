/**
 * Canonical orchestrator for subject unit editing — opens ManualCurriculumBuilderModal directly.
 * Do not duplicate this flow elsewhere — use dispatchOpenSubjectUnitsEditor on web.
 */
import React, { useCallback, useMemo } from 'react';
import ManualCurriculumBuilderModal from '../ManualCurriculumBuilderModal';
import { dispatchOpenSubjectClassworkScheduleAll } from '../../lib/subjectClassworkActions';
import { openMagicCreateWizard } from '../../lib/doodleLaunch';

export default function EditSubjectUnitsModal({
  visible,
  onClose,
  onSaved,
  familyId,
  subject,
  hasExistingContent = false,
  academicYearId = null,
  initialDraft = null,
  childIds = [],
  stackZIndex = 10002,
}) {
  const subjectId = subject?.id || null;
  const subjectName = subject?.name?.trim() || 'Subject';

  const hasDraft = Boolean(initialDraft?.units?.length);
  const loadExisting = hasExistingContent || hasDraft;

  const draftForEditor = useMemo(
    () => (hasDraft ? initialDraft : null),
    [hasDraft, initialDraft],
  );

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleManualSaved = useCallback(() => {
    onSaved?.();
    handleClose();
  }, [onSaved, handleClose]);

  const handleScheduleAllLessons = useCallback(() => {
    if (!subjectId) return;
    dispatchOpenSubjectClassworkScheduleAll(subjectId);
  }, [subjectId]);

  const handleCreateUnitsAndLessons = useCallback(() => {
    if (!subjectId) return;
    openMagicCreateWizard({
      subjectId,
      subjectName,
      academicYearId,
      childIds: Array.isArray(childIds) ? childIds : [],
    });
  }, [subjectId, subjectName, academicYearId, childIds]);

  if (!visible) return null;

  return (
    <ManualCurriculumBuilderModal
      visible
      onClose={handleClose}
      onSaved={handleManualSaved}
      familyId={familyId}
      subjectId={subjectId}
      subjectName={subjectName}
      initialDraft={draftForEditor}
      loadExisting={loadExisting && !hasDraft}
      replaceExisting={loadExisting}
      createCalendarEvents={false}
      academicYearId={academicYearId}
      headerTitle={
        loadExisting
          ? `Edit units — ${subjectName}`
          : 'Add units'
      }
      stackZIndex={stackZIndex}
      showCreateUnitsAction={loadExisting}
      createUnitsActionLabel="Create units and lessons"
      onCreateUnitsAction={handleCreateUnitsAndLessons}
      showScheduleAllAction={loadExisting}
      scheduleAllActionLabel="Schedule all lessons"
      onScheduleAllAction={handleScheduleAllLessons}
    />
  );
}
