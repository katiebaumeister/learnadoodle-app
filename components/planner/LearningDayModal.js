import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
} from 'react-native';
import { CalendarDays } from 'lucide-react';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import { ModalFooter } from '../ui/ModalFooter';
import CreateModalShell from '../create/shared/CreateModalShell';
import ClassworkPlacementFields from '../create/shared/ClassworkPlacementFields';
import ScheduleDateFields from '../create/shared/ScheduleDateFields';
import AdditionalNotesSection from '../create/shared/AdditionalNotesSection';
import EventAttachmentsField, { materialIdsFromSelection } from '../create/shared/EventAttachmentsField';
import AddMaterialModal from '../materials/AddMaterialModal';
import { nestedAddMaterialModalProps } from '../create/shared/nestedAddMaterialModalProps';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import { createModalStyles as styles, PLACEHOLDER } from '../create/shared/createModalStyles';
import { resolveMaterialId } from '../../lib/create/calendarEventFormUtils';
import { normalizeTimeValue, parseTimeString, toYmd } from '../../lib/create/eventTimeUtils';
import {
  hmToMaskedTime,
  maskedTimeToHm,
} from '../../lib/subjectConfigureSchedule';
import { getEventStartDate, linkLessonToEvent } from '../../lib/subjectLessonLinking';
import { getPlannerLearningDayLessonTitle } from '../../lib/planner/plannerLearningDayChip';
import { deleteEvent, updateEvent } from '../../lib/services/plannerClientWithOffline';
import { getPlanYearFullDataFromCache } from '../../lib/planEditListCache';
import {
  resolveLearningDayDurationMinutes,
  resolveLearningDaySubjectName,
} from '../../lib/planner/learningDayModalNavigation';
import {
  applyLearningDayTimeOverride,
  eventStartTimeHm,
  isLearningDaySessionSkipped,
} from '../../lib/learningDaySessionHelpers';
import { dispatchOpenSubjectSettings } from '../../lib/subjectClassworkNavigation';
import { resolveEventSubjectId } from '../../lib/planner/plannerEventSubject';
import { saveLesson } from '../../lib/create/saveEventHelpers';
import { formatSubjectScheduleSummaryLine } from '../subjects/subjectScheduleOverview';
import EditSubjectUnitsModal from '../subjects/EditSubjectUnitsModal';
import { NESTED_OVER_PARENT_MODAL_Z } from '../hooks/useModalStackElevation';
import { getSubjectProgressCache } from '../../lib/subjectProgressPlanCache';
import {
  curriculumStructureHasContent,
  draftFromCurriculumStructure,
} from '../../lib/subjectUnitsEditorDraft';

export default function LearningDayModal({
  visible,
  onClose,
  onSaved,
  onDeleted,
  familyId,
  event,
  subjects = [],
  children = [],
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [sessionEvent, setSessionEvent] = useState(null);
  const [sessionDate, setSessionDate] = useState(new Date());
  const [startTime, setStartTime] = useState('09:00');
  const [maskedStartTime, setMaskedStartTime] = useState('09:00 AM');
  const [durationInput, setDurationInput] = useState('60');
  const [unitId, setUnitId] = useState(null);
  const [unitTitle, setUnitTitle] = useState('');
  const [curriculumLessonId, setCurriculumLessonId] = useState(null);
  const [lessonLabel, setLessonLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [materialId, setMaterialId] = useState(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showUnitsEditor, setShowUnitsEditor] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');
  const [errors, setErrors] = useState({});

  const activeEvent = sessionEvent || event;
  const isCreateMode = !activeEvent?.id || activeEvent?._pendingCreate === true;
  const subjectId = resolveEventSubjectId(activeEvent);
  const subjectName = resolveLearningDaySubjectName(activeEvent, subjects);
  const isSkipped = isLearningDaySessionSkipped(activeEvent);
  const eventId = isCreateMode ? null : activeEvent?.id;
  const disabled = isSkipped || saving;

  const sessionChildIds = useMemo(() => {
    const childId = activeEvent?.child_id || activeEvent?.childId;
    if (childId) return [String(childId)];
    return (children || []).map((c) => String(c?.id)).filter(Boolean);
  }, [children, activeEvent?.childId, activeEvent?.child_id]);

  const sessionChildren = useMemo(() => {
    const idSet = new Set(sessionChildIds.map(String));
    return (children || []).filter((child) => idSet.has(String(child?.id)));
  }, [children, sessionChildIds]);

  const childNamesLine = useMemo(
    () => sessionChildren
      .map((child) => child.name || child.first_name || 'Student')
      .join(' · '),
    [sessionChildren],
  );

  const subjectRow = useMemo(
    () => (subjects || []).find((row) => String(row?.id) === String(subjectId)) || null,
    [subjects, subjectId],
  );

  const scheduleHint = useMemo(() => {
    const yearId = activeEvent?.academic_year_id;
    if (familyId && yearId && subjectId) {
      const planData = getPlanYearFullDataFromCache(familyId, yearId);
      const summary = formatSubjectScheduleSummaryLine(planData, subjectId);
      if (summary) return summary;
    }
    if (subjectRow?.cadenceText) {
      return String(subjectRow.cadenceText).trim();
    }
    return null;
  }, [activeEvent?.academic_year_id, familyId, subjectId, subjectRow?.cadenceText]);

  const resetSessionFields = useCallback((row) => {
    if (!row) return;
    setSessionEvent(row);
    const date = getEventStartDate(row);
    setSessionDate(date && !Number.isNaN(date.getTime()) ? date : new Date());
    const hm = eventStartTimeHm(row);
    setStartTime(hm);
    setMaskedStartTime(hmToMaskedTime(hm));
    setDurationInput(String(resolveLearningDayDurationMinutes(row) || 60));
    setUnitId(row?.curriculum_unit_id != null ? String(row.curriculum_unit_id) : null);
    setUnitTitle(String(row?.unit || row?.curriculum_unit_title || '').trim());
    const lessonId = row?.curriculum_lesson_id != null ? String(row.curriculum_lesson_id) : null;
    setCurriculumLessonId(lessonId);
    setLessonLabel(getPlannerLearningDayLessonTitle(row) || String(row?.lesson || '').trim());
    setNotes(String(row?.description || '').trim());
    setMaterialId(resolveMaterialId(row));
    setShowAddMaterial(false);
    setShowDeleteConfirm(false);
    setFormDirty(false);
    setValidationBanner('');
    setErrors({});
  }, []);

  useEffect(() => {
    if (!visible || !event) return;
    resetSessionFields(event);
  }, [visible, event, resetSessionFields]);

  const notifySaved = useCallback((patch = {}) => {
    onSaved?.({
      event: { ...activeEvent, ...patch },
      lessonId: patch.curriculum_lesson_id ?? curriculumLessonId ?? activeEvent?.curriculum_lesson_id ?? null,
    });
  }, [activeEvent, curriculumLessonId, onSaved]);

  const clearFieldError = useCallback((key) => {
    setErrors((prev) => {
      if (!prev?.[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setValidationBanner('');
  }, []);

  const validate = useCallback(() => {
    const next = {};
    if (!(sessionDate instanceof Date) || Number.isNaN(sessionDate.getTime())) {
      next.date = 'Start date is required.';
    }
    const normalizedTime = normalizeTimeValue(maskedStartTime);
    if (!normalizedTime || !parseTimeString(normalizedTime)) {
      next.time = 'Enter a valid start time (e.g., 9:00 AM).';
    }
    const durationNum = parseInt(String(durationInput || '').trim(), 10);
    if (!Number.isFinite(durationNum) || durationNum <= 0) {
      next.duration = 'Enter a duration in minutes.';
    } else if (durationNum < 15) {
      next.duration = 'Duration must be at least 15 minutes.';
    }
    if (!isCreateMode && (!eventId || !familyId)) {
      next.form = 'This learning day could not be loaded. Close and try again.';
    }
    if (isSkipped) {
      next.form = 'This session is skipped and cannot be edited.';
    }
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    if (!ok) {
      setValidationBanner(
        next.form || 'Please complete required fields before saving.',
      );
    } else {
      setValidationBanner('');
    }
    return ok;
  }, [
    sessionDate,
    maskedStartTime,
    durationInput,
    eventId,
    familyId,
    isSkipped,
    isCreateMode,
  ]);

  const buildPendingChanges = useCallback(() => {
    const originalDate = getEventStartDate(activeEvent);
    const originalYmd = originalDate ? toYmd(originalDate) : null;
    const nextYmd = toYmd(sessionDate);
    const originalHm = eventStartTimeHm(activeEvent);
    const nextHm = maskedTimeToHm(maskedStartTime, startTime || '09:00');
    const originalDuration = Number(resolveLearningDayDurationMinutes(activeEvent) || 60);
    const nextDuration = Number.parseInt(String(durationInput || '').trim(), 10);
    const timeChanged = nextYmd !== originalYmd
      || nextHm !== originalHm
      || (Number.isFinite(nextDuration) && nextDuration !== originalDuration);

    const originalLessonId = activeEvent?.curriculum_lesson_id != null
      ? String(activeEvent.curriculum_lesson_id)
      : null;
    const nextLessonId = curriculumLessonId ? String(curriculumLessonId) : null;
    const nextUnit = String(unitTitle || '').trim();
    const nextLesson = String(lessonLabel || '').trim();
    const prevUnit = String(activeEvent?.unit || activeEvent?.curriculum_unit_title || '').trim();
    const prevLesson = getPlannerLearningDayLessonTitle(activeEvent)
      || String(activeEvent?.lesson || '').trim();
    const lessonChanged = nextLessonId !== originalLessonId
      || (nextLessonId && (nextUnit !== prevUnit || nextLesson !== prevLesson));

    const originalNotes = String(activeEvent?.description || '').trim();
    const nextNotes = String(notes || '').trim();
    const originalMaterialId = resolveMaterialId(activeEvent);
    const nextMaterialId = materialId ? String(materialId) : null;
    const notesOrMaterialChanged = nextNotes !== originalNotes || nextMaterialId !== originalMaterialId;
    const flexibleChanged = !!activeEvent?.is_flexible;

    return {
      nextYmd,
      nextHm,
      nextDuration,
      timeChanged,
      originalLessonId,
      nextLessonId,
      nextUnit,
      nextLesson,
      lessonChanged,
      nextNotes,
      nextMaterialId,
      notesOrMaterialChanged,
      flexibleChanged,
      hasChanges: timeChanged || lessonChanged || notesOrMaterialChanged || flexibleChanged || formDirty,
    };
  }, [
    activeEvent,
    sessionDate,
    maskedStartTime,
    startTime,
    durationInput,
    curriculumLessonId,
    unitTitle,
    lessonLabel,
    notes,
    materialId,
    formDirty,
  ]);

  const finishSaveSuccess = useCallback((patch = {}) => {
    setFormDirty(false);
    setValidationBanner('');
    toast.push(isCreateMode ? 'Learning day added' : 'Learning day updated', 'success');
    try {
      notifySaved(patch);
    } catch (err) {
      console.warn('[LearningDayModal] onSaved failed:', err);
    }
    // Always close from the modal so a parent handler error cannot leave it open.
    onClose?.();
  }, [toast, notifySaved, onClose, isCreateMode]);

  const handleBlockedSave = useCallback(() => {
    if (!validate()) return;
  }, [validate]);

  const handleSave = async () => {
    if (!validate()) return;

    if (isCreateMode) {
      if (!familyId || !subjectId) {
        setValidationBanner('This learning day could not be saved. Close and try again.');
        return;
      }
      setSaving(true);
      setValidationBanner('');
      try {
        const durationNum = parseInt(String(durationInput || '').trim(), 10) || 60;
        const created = await saveLesson({
          familyId,
          title: subjectName,
          childIds: sessionChildIds,
          subjectId,
          unitTitle: unitTitle || '',
          curriculumLessonId: curriculumLessonId || null,
          lessonLabel: lessonLabel || '',
          description: notes,
          materialIds: materialId ? [materialId] : [],
          durationMinutes: durationNum,
          scheduleMode: 'schedule_now',
          date: sessionDate,
          startTime: maskedStartTime,
        });
        finishSaveSuccess(created || {});
      } catch (err) {
        const message = err?.message || 'Failed to create learning day';
        setValidationBanner(message);
        toast.push(message, 'error');
      } finally {
        setSaving(false);
      }
      return;
    }

    const pending = buildPendingChanges();
    // No outstanding diffs (or already persisted): toast + close like other modals.
    if (!pending.timeChanged && !pending.lessonChanged
      && !pending.notesOrMaterialChanged && !pending.flexibleChanged) {
      finishSaveSuccess({});
      return;
    }
    setSaving(true);
    setValidationBanner('');
    try {
      let patch = {};
      const {
        nextYmd,
        nextHm,
        nextDuration,
        timeChanged,
        nextLessonId,
        originalLessonId,
        nextUnit,
        nextLesson,
        nextNotes,
        nextMaterialId,
        notesOrMaterialChanged,
        flexibleChanged,
      } = pending;

      setStartTime(nextHm);
      setMaskedStartTime(hmToMaskedTime(nextHm));

      if (timeChanged) {
        const result = await applyLearningDayTimeOverride({
          eventId,
          familyId,
          event: activeEvent,
          startTimeHm: nextHm,
          durationMinutes: Number.isFinite(nextDuration) ? nextDuration : durationInput,
          sessionDateYmd: nextYmd,
        });
        patch = {
          ...patch,
          start_ts: result.start_ts,
          end_ts: result.end_ts,
          minutes: result.minutes,
        };
      }

      if (nextLessonId !== originalLessonId) {
        if (nextLessonId) {
          await linkLessonToEvent({
            eventId,
            familyId,
            lessonId: nextLessonId,
            unitTitle,
            lessonTitle: lessonLabel,
          });
          patch = {
            ...patch,
            curriculum_lesson_id: nextLessonId,
            lesson: lessonLabel || null,
            unit: unitTitle || null,
            curriculum_metadata: lessonLabel ? { lesson_label: lessonLabel } : {},
          };
        } else {
          const { error } = await updateEvent(
            eventId,
            {
              curriculum_lesson_id: null,
              curriculum_unit_title: null,
              unit: null,
              lesson: null,
              curriculum_metadata: {},
            },
            familyId,
          );
          if (error) throw error;
          patch = {
            ...patch,
            curriculum_lesson_id: null,
            lesson: null,
            unit: null,
            curriculum_metadata: {},
          };
        }
      } else if (nextLessonId && (nextUnit || nextLesson)) {
        const prevUnit = String(activeEvent?.unit || activeEvent?.curriculum_unit_title || '').trim();
        const prevLesson = getPlannerLearningDayLessonTitle(activeEvent)
          || String(activeEvent?.lesson || '').trim();
        if (nextUnit !== prevUnit || nextLesson !== prevLesson) {
          await linkLessonToEvent({
            eventId,
            familyId,
            lessonId: nextLessonId,
            unitTitle: nextUnit,
            lessonTitle: nextLesson,
          });
          patch = {
            ...patch,
            lesson: nextLesson || null,
            unit: nextUnit || null,
            curriculum_metadata: nextLesson ? { lesson_label: nextLesson } : {},
          };
        }
      }

      if (flexibleChanged) {
        await updateEvent(eventId, { is_flexible: false }, familyId);
        patch = { ...patch, is_flexible: false };
      }

      if (notesOrMaterialChanged) {
        const materialIds = materialIdsFromSelection(nextMaterialId);
        const { error } = await updateEvent(
          eventId,
          {
            description: nextNotes || null,
            material_id: nextMaterialId,
            materials_attachment_ids: materialIds.length ? materialIds : null,
          },
          familyId,
        );
        if (error) throw error;
        patch = {
          ...patch,
          description: nextNotes || null,
          material_id: nextMaterialId,
          materials_attachment_ids: materialIds.length ? materialIds : null,
        };
      }

      setSessionEvent((prev) => ({ ...(prev || activeEvent), ...patch }));
      finishSaveSuccess(patch);
    } catch (err) {
      const message = err?.message || 'Failed to save learning day';
      setValidationBanner(message);
      toast.push(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubjectSchedule = () => {
    if (!subjectId) return;
    dispatchOpenSubjectSettings({
      subject: subjectRow,
      subjectId,
      initialTab: 'schedule',
    });
  };

  const unitsEditorInitialDraft = useMemo(() => {
    if (!familyId || !subjectId) return null;
    const cached = getSubjectProgressCache(familyId, subjectId);
    const units = Array.isArray(cached?.curriculumUnits) ? cached.curriculumUnits : [];
    return units.length ? draftFromCurriculumStructure({ units }) : null;
  }, [familyId, subjectId, showUnitsEditor]);

  const unitsEditorHasContent = useMemo(() => {
    if (unitsEditorInitialDraft?.units?.length) return true;
    if (!familyId || !subjectId) return false;
    const cached = getSubjectProgressCache(familyId, subjectId);
    return curriculumStructureHasContent({ units: cached?.curriculumUnits || [] });
  }, [familyId, subjectId, unitsEditorInitialDraft]);

  const handleOpenUnitsEditor = useCallback(() => {
    if (!subjectId) return;
    setShowUnitsEditor(true);
  }, [subjectId]);

  const handleDeleteLearningDay = useCallback(async () => {
    if (!eventId || deleting || isSkipped) return;
    setDeleting(true);
    try {
      const { error } = await deleteEvent(eventId, familyId);
      if (error) throw error;
      setShowDeleteConfirm(false);
      toast.push('Learning day deleted', 'success');
      onDeleted?.(eventId);
      onClose?.();
    } catch (err) {
      toast.push(err?.message || 'Failed to delete learning day', 'error');
    } finally {
      setDeleting(false);
    }
  }, [eventId, deleting, isSkipped, familyId, onDeleted, onClose, toast]);

  if (!visible || !event) return null;

  const secondaryActions = subjectId ? [{
    key: 'edit-schedule',
    label: 'Edit subject schedule',
    icon: CalendarDays,
    onPress: handleEditSubjectSchedule,
  }] : [];

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <CreateModalShell
          title={isCreateMode ? 'Add learning day' : 'Learning day'}
          onClose={onClose}
          saving={saving || deleting}
          saveDisabled={isSkipped}
          validationBanner={validationBanner}
          footer={(
            <ModalFooter
              mode={isCreateMode ? 'create' : 'edit'}
              primaryLabel={saving ? (isCreateMode ? 'Adding…' : 'Saving…') : (isCreateMode ? 'Add' : 'Save')}
              destructiveLabel={isCreateMode ? null : 'Delete learning day'}
              onCancel={onClose}
              onDelete={() => {
                if (!eventId || deleting || isSkipped) return;
                setShowDeleteConfirm(true);
              }}
              onPrimary={handleSave}
              accent="#9ECFFB"
              disabled={saving || deleting}
              visuallyDisabled={isSkipped}
              loading={saving || deleting}
              onBlockedPrimary={handleBlockedSave}
              secondaryActions={secondaryActions}
            />
          )}
        >
          <View style={styles.formGroup}>
            <Text style={styles.learningDaySummaryTitle}>{subjectName}</Text>
            {sessionChildIds.length > 0 ? (
              <View style={styles.learningDaySummaryRow}>
                <ChildAvatarCluster
                  childIds={sessionChildIds}
                  familyChildren={children || []}
                  size={22}
                />
                {childNamesLine ? (
                  <Text style={styles.learningDaySummaryNames}>{childNamesLine}</Text>
                ) : null}
              </View>
            ) : (
              <Text style={[styles.fieldHint, { marginTop: 6 }]}>No children assigned</Text>
            )}
            {scheduleHint ? (
              <Text style={styles.fieldHint}>{scheduleHint}</Text>
            ) : null}
          </View>

          <View pointerEvents={disabled ? 'none' : 'auto'} style={disabled && !isSkipped ? { opacity: 0.92 } : null}>
            {isSkipped ? (
              <Text style={styles.fieldHint}>This session is skipped on the calendar.</Text>
            ) : (
              <>
                <ScheduleDateFields
                  startDate={sessionDate}
                  onStartDateChange={(nextDate) => {
                    setSessionDate(nextDate);
                    setFormDirty(true);
                    clearFieldError('date');
                  }}
                  showEndDate={false}
                  startTime={maskedStartTime}
                  onStartTimeChange={(masked) => {
                    setMaskedStartTime(masked);
                    setFormDirty(true);
                    clearFieldError('time');
                    const parsed = parseTimeString(normalizeTimeValue(masked));
                    if (parsed) {
                      setStartTime(
                        `${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`,
                      );
                    }
                  }}
                  endTime=""
                  showEndTime={false}
                  showTimes
                  onOpenStartDatePicker={() => setDatePickerOpen(true)}
                  matchEventModalDateWidth
                  startDateError={errors.date || null}
                  timeError={errors.time || null}
                  timeColumnStyle={styles.scheduleColumnLearningDayTime}
                  trailingColumnStyle={styles.scheduleColumnLearningDayDuration}
                  trailingContent={(
                    <>
                      <Text style={[styles.fieldLabel, styles.fieldLabelNoWrap]}>Duration (min)</Text>
                      <TextInput
                        value={durationInput}
                        onChangeText={(value) => {
                          setDurationInput(value.replace(/[^\d]/g, '').slice(0, 3));
                          setFormDirty(true);
                          clearFieldError('duration');
                        }}
                        editable={!disabled}
                        style={[
                          styles.fieldInput,
                          errors.duration ? { borderColor: '#ef4444' } : null,
                        ]}
                        keyboardType="number-pad"
                        placeholder="60"
                        placeholderTextColor={PLACEHOLDER}
                      />
                      {errors.duration ? (
                        <Text style={styles.errorTextSmall}>{errors.duration}</Text>
                      ) : null}
                    </>
                  )}
                />
                <Text style={[styles.fieldHint, { marginTop: -4, marginBottom: 8 }]}>
                  Changes to date and time apply to this day only, not the recurring subject schedule.
                </Text>

                <ClassworkPlacementFields
                  familyId={familyId}
                  subjectId={subjectId}
                  unitId={unitId}
                  unitTitle={unitTitle}
                  curriculumLessonId={curriculumLessonId}
                  lessonLabel={lessonLabel}
                  onUnitChange={({ unitId: nextUnitId, unitTitle: nextUnitTitle }) => {
                    setUnitId(nextUnitId || null);
                    setUnitTitle(nextUnitTitle || '');
                    setFormDirty(true);
                    setValidationBanner('');
                  }}
                  onLessonChange={({ curriculumLessonId: nextLessonId, lessonLabel: nextLessonLabel }) => {
                    setCurriculumLessonId(nextLessonId || null);
                    setLessonLabel(nextLessonLabel || '');
                    setFormDirty(true);
                    setValidationBanner('');
                  }}
                  onAddUnitNew={subjectId ? handleOpenUnitsEditor : null}
                  onAddLessonNew={subjectId ? handleOpenUnitsEditor : null}
                />

                <AdditionalNotesSection
                  value={notes}
                  onChangeText={(value) => {
                    setNotes(value);
                    setFormDirty(true);
                    setValidationBanner('');
                  }}
                  label="Session notes"
                  placeholder="Special notes for this learning day"
                />

                {familyId ? (
                  <EventAttachmentsField
                    familyId={familyId}
                    selectedMaterialId={materialId}
                    onMaterialChange={(nextMaterialId) => {
                      setMaterialId(nextMaterialId);
                      setFormDirty(true);
                      setValidationBanner('');
                    }}
                    onAddNew={() => setShowAddMaterial(true)}
                    placeholder="Select attachment…"
                  />
                ) : null}
              </>
            )}
          </View>
        </CreateModalShell>
      </Modal>

      {showUnitsEditor && subjectId ? (
        <EditSubjectUnitsModal
          visible
          onClose={() => setShowUnitsEditor(false)}
          onSaved={() => {
            setShowUnitsEditor(false);
          }}
          familyId={familyId}
          subject={{ id: subjectId, name: subjectName || subjectRow?.name || 'Subject' }}
          hasExistingContent={unitsEditorHasContent}
          initialDraft={unitsEditorInitialDraft}
          academicYearId={activeEvent?.academic_year_id || null}
          stackZIndex={NESTED_OVER_PARENT_MODAL_Z}
        />
      ) : null}

      {showAddMaterial ? (
        <AddMaterialModal
          visible
          {...nestedAddMaterialModalProps({
            familyId,
            familyMembers: children || [],
            subjectId,
            assigneeIds: sessionChildIds,
            subjects,
          })}
          onClose={() => setShowAddMaterial(false)}
          onSaved={(material) => {
            if (material?.id) {
              setMaterialId(material.id);
              setFormDirty(true);
            }
            setShowAddMaterial(false);
          }}
        />
      ) : null}

      <AppCalendarDatePickerModal
        visible={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        selectedDate={sessionDate}
        onSelectDate={(nextDate) => {
          setSessionDate(nextDate);
          setFormDirty(true);
          clearFieldError('date');
          setDatePickerOpen(false);
        }}
      />

      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Delete learning day?"
        message="This learning day will be removed from the planner. This cannot be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete learning day'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!deleting) setShowDeleteConfirm(false);
        }}
        onConfirm={handleDeleteLearningDay}
      />
    </>
  );
}
