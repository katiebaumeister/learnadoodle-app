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
import { formatSubjectScheduleSummaryLine } from '../subjects/subjectScheduleOverview';

const SCHEDULE_EDIT_SUFFIX = 'Edit subject name, children, and recurring schedule from Subject settings.';

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
  const [formDirty, setFormDirty] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const activeEvent = sessionEvent || event;
  const subjectId = resolveEventSubjectId(activeEvent);
  const subjectName = resolveLearningDaySubjectName(activeEvent, subjects);
  const isSkipped = isLearningDaySessionSkipped(activeEvent);
  const eventId = activeEvent?.id;
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
    let summary = null;
    if (familyId && yearId && subjectId) {
      const planData = getPlanYearFullDataFromCache(familyId, yearId);
      summary = formatSubjectScheduleSummaryLine(planData, subjectId);
    }
    if (!summary && subjectRow?.cadenceText) {
      summary = String(subjectRow.cadenceText).trim();
    }
    if (summary) return `${summary}. ${SCHEDULE_EDIT_SUFFIX}`;
    return SCHEDULE_EDIT_SUFFIX;
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

  const handleSave = async () => {
    if (!eventId || !familyId || isSkipped || !formDirty) return;
    setSaving(true);
    try {
      let patch = {};
      const originalDate = getEventStartDate(activeEvent);
      const originalYmd = originalDate ? toYmd(originalDate) : null;
      const nextYmd = toYmd(sessionDate);
      const originalHm = eventStartTimeHm(activeEvent);
      const originalDuration = String(resolveLearningDayDurationMinutes(activeEvent) || 60);
      const nextHm = maskedTimeToHm(maskedStartTime, startTime || '09:00');
      setStartTime(nextHm);
      setMaskedStartTime(hmToMaskedTime(nextHm));
      const timeChanged = nextYmd !== originalYmd
        || nextHm !== originalHm
        || durationInput !== originalDuration;

      if (timeChanged) {
        const result = await applyLearningDayTimeOverride({
          eventId,
          familyId,
          event: activeEvent,
          startTimeHm: nextHm,
          durationMinutes: durationInput,
          sessionDateYmd: nextYmd,
        });
        patch = {
          ...patch,
          start_ts: result.start_ts,
          end_ts: result.end_ts,
          minutes: result.minutes,
        };
      }

      const originalLessonId = activeEvent?.curriculum_lesson_id != null
        ? String(activeEvent.curriculum_lesson_id)
        : null;
      const nextLessonId = curriculumLessonId ? String(curriculumLessonId) : null;
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
      } else if (nextLessonId && (unitTitle || lessonLabel)) {
        const nextUnit = String(unitTitle || '').trim();
        const nextLesson = String(lessonLabel || '').trim();
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

      if (activeEvent?.is_flexible) {
        await updateEvent(eventId, { is_flexible: false }, familyId);
        patch = { ...patch, is_flexible: false };
      }

      const originalNotes = String(activeEvent?.description || '').trim();
      const nextNotes = String(notes || '').trim();
      const originalMaterialId = resolveMaterialId(activeEvent);
      const nextMaterialId = materialId ? String(materialId) : null;
      if (nextNotes !== originalNotes || nextMaterialId !== originalMaterialId) {
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
      setFormDirty(false);
      toast.push('Learning day updated', 'success');
      notifySaved(patch);
    } catch (err) {
      toast.push(err?.message || 'Failed to save learning day', 'error');
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
          title="Learning day"
          onClose={onClose}
          saving={saving || deleting}
          saveDisabled={!formDirty || isSkipped}
          footer={(
            <ModalFooter
              mode="edit"
              primaryLabel={saving ? 'Saving…' : 'Save'}
              destructiveLabel="Delete learning day"
              onCancel={onClose}
              onDelete={() => {
                if (!eventId || deleting || isSkipped) return;
                setShowDeleteConfirm(true);
              }}
              onPrimary={handleSave}
              accent="#9ECFFB"
              disabled={saving || deleting}
              visuallyDisabled={!formDirty || isSkipped}
              loading={saving || deleting}
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
            <Text style={styles.fieldHint}>{scheduleHint}</Text>
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
                  }}
                  showEndDate={false}
                  startTime={maskedStartTime}
                  onStartTimeChange={(masked) => {
                    setMaskedStartTime(masked);
                    setFormDirty(true);
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
                        }}
                        editable={!disabled}
                        style={styles.fieldInput}
                        keyboardType="number-pad"
                        placeholder="60"
                        placeholderTextColor={PLACEHOLDER}
                      />
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
                  }}
                  onLessonChange={({ curriculumLessonId: nextLessonId, lessonLabel: nextLessonLabel }) => {
                    setCurriculumLessonId(nextLessonId || null);
                    setLessonLabel(nextLessonLabel || '');
                    setFormDirty(true);
                  }}
                />

                <AdditionalNotesSection
                  value={notes}
                  onChangeText={(value) => {
                    setNotes(value);
                    setFormDirty(true);
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
