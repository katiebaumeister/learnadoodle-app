import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, Platform, Alert, ActivityIndicator } from 'react-native';
import { useToast } from '../Toast';
import CreateModalShell from './shared/CreateModalShell';
import FamilyMemberPicker, { resolveDefaultAssigneeIds } from './shared/FamilyMemberPicker';
import ScheduleDateFields from './shared/ScheduleDateFields';
import AdditionalNotesSection from './shared/AdditionalNotesSection';
import EventAttachmentsField, { materialIdsFromSelection } from './shared/EventAttachmentsField';
import EventRecurrenceFields from './shared/EventRecurrenceFields';
import ClassworkPlacementFields from './shared/ClassworkPlacementFields';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import AddMaterialModal from '../materials/AddMaterialModal';
import { nestedAddMaterialModalProps } from './shared/nestedAddMaterialModalProps';
import { useFamilySubjects } from './shared/useSubjectsForAssignees';
import { ModalFooter } from '../ui/ModalFooter';
import { createModalStyles as styles, PLACEHOLDER, CREATE_EVENT_MODAL_MAX_WIDTH } from './shared/createModalStyles';
import { saveCalendarEvent, buildEventRecurrenceRule, updateCalendarEvent } from '../../lib/create/saveEventHelpers';
import { validateOptionalEventTimes } from '../../lib/create/eventTimeUtils';
import {
  calendarEventFormFromEvent,
  deleteCalendarEvent,
  fetchCalendarEventForEdit,
} from '../../lib/create/calendarEventEditHelpers';

export default function CalendarEventCreateModal({
  visible,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
  familyId,
  familyMembers = [],
  defaultDate = null,
  defaultChildId = null,
  defaultChildIds = null,
  defaultSubjectId: _defaultSubjectId = null,
  defaultTitle = null,
  defaultMaterialId = null,
  defaultStartTime = null,
  editEvent = null,
  editEventId = null,
}) {
  const toast = useToast();
  const isEditMode = !!(editEvent?.id || editEventId);
  const [loadingEvent, setLoadingEvent] = useState(false);
  const [resolvedEventId, setResolvedEventId] = useState(null);
  const [title, setTitle] = useState('');
  const [assigneeIds, setAssigneeIds] = useState([]);
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [materialId, setMaterialId] = useState(null);
  const [isRepeating, setIsRepeating] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('weekly');
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState([]);
  const [recurrenceEndType, setRecurrenceEndType] = useState('never');
  const [recurrenceEndAfterText, setRecurrenceEndAfterText] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');
  const [errors, setErrors] = useState({});
  const [subjectId, setSubjectId] = useState(null);
  const [subjectName, setSubjectName] = useState('');
  const [unitId, setUnitId] = useState(null);
  const [unitTitle, setUnitTitle] = useState('');
  const [curriculumLessonId, setCurriculumLessonId] = useState(null);
  const [lessonLabel, setLessonLabel] = useState('');
  const subjects = useFamilySubjects(familyId);

  useEffect(() => {
    if (!visible) return;

    if (isEditMode) {
      let cancelled = false;
      const hydrate = async () => {
        setLoadingEvent(true);
        try {
          let eventRow = editEvent;
          const targetId = editEvent?.id || editEventId;
          if (!eventRow && targetId) {
            eventRow = await fetchCalendarEventForEdit(targetId);
          }
          if (cancelled || !eventRow) return;
          const form = calendarEventFormFromEvent(eventRow);
          setResolvedEventId(form.eventId);
          setTitle(form.title);
          setAssigneeIds(form.assigneeIds);
          setStartDate(form.startDate);
          setEndDate(form.endDate);
          setStartTime(form.startTime);
          setEndTime(form.endTime);
          setLocation(form.location);
          setNotes(form.notes);
          setMaterialId(form.materialId);
          setIsRepeating(form.isRepeating);
          setRecurrenceType(form.recurrenceType);
          setRecurrenceWeekdays(form.recurrenceWeekdays);
          setRecurrenceEndType(form.recurrenceEndType);
          setRecurrenceEndAfterText(form.recurrenceEndAfterText);
          setRecurrenceEndDate(form.recurrenceEndDate);
          setSubjectId(form.subjectId);
          setSubjectName(form.subjectName);
          setUnitId(form.unitId);
          setUnitTitle(form.unitTitle);
          setCurriculumLessonId(form.curriculumLessonId);
          setLessonLabel(form.lessonLabel);
          setValidationBanner('');
          setErrors({});
        } catch (err) {
          if (!cancelled) {
            toast.push(err?.message || 'Could not load event', 'error');
          }
        } finally {
          if (!cancelled) setLoadingEvent(false);
        }
      };
      hydrate();
      return () => {
        cancelled = true;
      };
    }

    setResolvedEventId(null);
    setTitle(defaultTitle || '');
    setAssigneeIds(resolveDefaultAssigneeIds({ defaultChildIds, defaultChildId, familyMembers }));
    setStartDate(defaultDate ? new Date(defaultDate) : new Date());
    setEndDate(null);
    setStartTime(defaultStartTime || '');
    setEndTime('');
    setLocation('');
    setNotes('');
    setMaterialId(defaultMaterialId || null);
    setIsRepeating(false);
    setRecurrenceType('weekly');
    setRecurrenceWeekdays([]);
    setRecurrenceEndType('never');
    setRecurrenceEndAfterText('');
    setRecurrenceEndDate(null);
    setDatePickerTarget(null);
    setSubjectId(null);
    setSubjectName('');
    setUnitId(null);
    setUnitTitle('');
    setCurriculumLessonId(null);
    setLessonLabel('');
    setValidationBanner('');
    setErrors({});
  }, [
    visible,
    isEditMode,
    editEvent,
    editEventId,
    defaultDate,
    defaultChildId,
    defaultChildIds,
    defaultTitle,
    defaultMaterialId,
    defaultStartTime,
    familyMembers,
    toast,
  ]);

  const selectRepeatMode = useCallback((repeating) => {
    setIsRepeating(repeating);
    if (repeating) {
      const anchor = startDate instanceof Date ? startDate : new Date();
      setRecurrenceType('weekly');
      setRecurrenceWeekdays([anchor.getDay()]);
      setRecurrenceEndType('never');
      setRecurrenceEndAfterText('');
      setRecurrenceEndDate(null);
    }
  }, [startDate]);

  const handleRecurrenceTypeChange = useCallback((type) => {
    setRecurrenceType(type);
    if (type === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
      const anchor = startDate instanceof Date ? startDate : new Date();
      setRecurrenceWeekdays([anchor.getDay()]);
    }
  }, [recurrenceWeekdays, startDate]);

  const validate = useCallback(() => {
    const next = {};
    if (!title.trim()) next.title = 'Title is required';
    if (!startDate) next.date = 'Date is required';
    if (assigneeIds.length === 0) next.assignee = 'Select at least one student';
    const timeCheck = validateOptionalEventTimes({ startTime, endTime });
    if (!timeCheck.ok) next.time = timeCheck.error;
    if (isRepeating) {
      if (recurrenceType === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
        next.recurrenceWeekdays = 'Select at least one weekday';
      }
      if (recurrenceEndType === 'after') {
        const count = parseInt(recurrenceEndAfterText, 10);
        if (!Number.isFinite(count) || count <= 0) {
          next.recurrenceEnd = 'Enter number of occurrences';
        }
      }
      if (recurrenceEndType === 'on' && !recurrenceEndDate) {
        next.recurrenceEnd = 'Pick an end date';
      }
    }
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    if (!ok) setValidationBanner('Please complete required fields before saving.');
    else setValidationBanner('');
    return ok;
  }, [
    title,
    startDate,
    assigneeIds,
    isRepeating,
    recurrenceType,
    recurrenceWeekdays,
    recurrenceEndType,
    recurrenceEndAfterText,
    recurrenceEndDate,
    startTime,
    endTime,
  ]);

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const recurrenceRule = isRepeating
        ? buildEventRecurrenceRule({
          recurrenceType,
          recurrenceWeekdays,
          recurrenceEndType,
          recurrenceEndAfter: parseInt(recurrenceEndAfterText, 10) || null,
          recurrenceEndDate,
          startDate,
        })
        : null;

      if (isEditMode && resolvedEventId) {
        const updated = await updateCalendarEvent({
          eventId: resolvedEventId,
          familyId,
          title,
          childIds: assigneeIds,
          date: startDate,
          endDate,
          startTime,
          endTime,
          location,
          notes,
          materialIds: materialIdsFromSelection(materialId),
          recurrenceRule,
          ...(subjectId
            ? {
              curriculumLessonId: curriculumLessonId || null,
              unitTitle,
              lessonLabel,
            }
            : {}),
        });
        toast.push('Event updated', 'success');
        onUpdated?.(updated);
        onClose?.();
        return;
      }

      const event = await saveCalendarEvent({
        familyId,
        title,
        childIds: assigneeIds,
        date: startDate,
        endDate,
        startTime,
        endTime,
        location,
        notes,
        materialIds: materialIdsFromSelection(materialId),
        recurrenceRule,
      });
      toast.push('Event created', 'success');
      onCreated?.(event);
      onClose?.();
    } catch (err) {
      const message = err?.message || `Failed to ${isEditMode ? 'update' : 'create'} event`;
      const timeCheck = validateOptionalEventTimes({ startTime, endTime });
      if (!timeCheck.ok || /start time|end time|date or time/i.test(message)) {
        setErrors((prev) => ({ ...prev, time: timeCheck.ok ? message : timeCheck.error }));
        setValidationBanner('Please fix the highlighted fields before saving.');
      } else {
        toast.push(message, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = () => {
    if (!resolvedEventId || submitting) return;
    const runDelete = async () => {
      setSubmitting(true);
      try {
        await deleteCalendarEvent({ eventId: resolvedEventId, familyId });
        toast.push('Event deleted', 'success');
        onDeleted?.(resolvedEventId);
        onClose?.();
      } catch (err) {
        toast.push(err?.message || 'Failed to delete event', 'error');
      } finally {
        setSubmitting(false);
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm('Delete this event?')) runDelete();
      return;
    }
    Alert.alert('Delete event', 'Delete this event?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: runDelete },
    ]);
  };

  if (!visible) return null;

  const datePickerValue = datePickerTarget === 'end'
    ? (endDate || startDate)
    : datePickerTarget === 'recurrenceEnd'
      ? (recurrenceEndDate || startDate)
      : startDate;

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <CreateModalShell
          title="Calendar Event"
          onClose={onClose}
          onSave={isEditMode ? undefined : handleSave}
          saving={submitting}
          saveDisabled={!title.trim() || assigneeIds.length === 0}
          saveLabel={isEditMode ? 'Save changes' : 'Save changes'}
          validationBanner={validationBanner}
          maxWidth={CREATE_EVENT_MODAL_MAX_WIDTH}
          footer={isEditMode ? (
            <ModalFooter
              mode="edit"
              primaryLabel={submitting ? 'Saving…' : 'Save changes'}
              onCancel={onClose}
              onPrimary={handleSave}
              onDelete={confirmDelete}
              destructiveLabel="Delete event"
              accent="#9ECFFB"
              disabled={submitting}
              visuallyDisabled={!title.trim() || assigneeIds.length === 0}
              loading={submitting}
              onBlockedPrimary={() => validate()}
            />
          ) : undefined}
        >
          {loadingEvent ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#9ECFFB" />
            </View>
          ) : (
            <>
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>
              Title<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Event name"
              placeholderTextColor={PLACEHOLDER}
              style={[styles.fieldInput, errors.title && styles.fieldInputError]}
              autoFocus
            />
            {errors.title ? <Text style={styles.errorTextSmall}>{errors.title}</Text> : null}
          </View>

          <FamilyMemberPicker
            familyMembers={familyMembers}
            selectedIds={assigneeIds}
            onChange={setAssigneeIds}
            error={errors.assignee}
          />

          <ScheduleDateFields
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
            showEndDate
            startTime={startTime}
            onStartTimeChange={(value) => {
              setStartTime(value);
              if (errors.time) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.time;
                  return next;
                });
                setValidationBanner('');
              }
            }}
            endTime={endTime}
            onEndTimeChange={(value) => {
              setEndTime(value);
              if (errors.time) {
                setErrors((prev) => {
                  const next = { ...prev };
                  delete next.time;
                  return next;
                });
                setValidationBanner('');
              }
            }}
            onOpenStartDatePicker={() => setDatePickerTarget('start')}
            onOpenEndDatePicker={() => setDatePickerTarget('end')}
            startDateError={errors.date}
            timeError={errors.time}
          />

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Repeat</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                onPress={() => selectRepeatMode(false)}
                style={[
                  styles.dropdownOption,
                  !isRepeating && styles.dropdownOptionActive,
                ]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    !isRepeating && styles.dropdownOptionTextActive,
                  ]}
                >
                  Just once
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => selectRepeatMode(true)}
                style={[
                  styles.dropdownOption,
                  isRepeating && styles.dropdownOptionActive,
                ]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    isRepeating && styles.dropdownOptionTextActive,
                  ]}
                >
                  Repeat
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {isRepeating ? (
            <EventRecurrenceFields
              recurrenceType={recurrenceType}
              onRecurrenceTypeChange={handleRecurrenceTypeChange}
              recurrenceWeekdays={recurrenceWeekdays}
              onRecurrenceWeekdaysChange={setRecurrenceWeekdays}
              recurrenceEndType={recurrenceEndType}
              onRecurrenceEndTypeChange={setRecurrenceEndType}
              recurrenceEndAfterText={recurrenceEndAfterText}
              onRecurrenceEndAfterTextChange={setRecurrenceEndAfterText}
              recurrenceEndDate={recurrenceEndDate}
              onOpenRecurrenceEndDatePicker={() => setDatePickerTarget('recurrenceEnd')}
              errors={errors}
            />
          ) : null}

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Location (optional)</Text>
            <TextInput
              value={location}
              onChangeText={setLocation}
              placeholder="Where is this happening?"
              placeholderTextColor={PLACEHOLDER}
              style={styles.fieldInput}
            />
          </View>

          <AdditionalNotesSection
            value={notes}
            onChangeText={setNotes}
          />

          {isEditMode && subjectId ? (
            <>
              {subjectName ? (
                <View style={styles.formGroup}>
                  <Text style={styles.fieldLabel}>Subject</Text>
                  <Text style={{ fontSize: 14, color: '#0F172A' }}>{subjectName}</Text>
                </View>
              ) : null}
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
                }}
                onLessonChange={({ curriculumLessonId: nextLessonId, lessonLabel: nextLessonLabel }) => {
                  setCurriculumLessonId(nextLessonId || null);
                  setLessonLabel(nextLessonLabel || '');
                }}
              />
            </>
          ) : null}

          {familyId ? (
            <EventAttachmentsField
              familyId={familyId}
              selectedMaterialId={materialId}
              onMaterialChange={setMaterialId}
              onAddNew={() => setShowAddMaterial(true)}
            />
          ) : null}
            </>
          )}
        </CreateModalShell>
      </Modal>

      <AppCalendarDatePickerModal
        visible={!!datePickerTarget}
        onClose={() => setDatePickerTarget(null)}
        selectedDate={datePickerValue || new Date()}
        onSelectDate={(d) => {
          if (datePickerTarget === 'end') setEndDate(d);
          else if (datePickerTarget === 'recurrenceEnd') setRecurrenceEndDate(d);
          else setStartDate(d);
          setDatePickerTarget(null);
        }}
      />

      {showAddMaterial ? (
        <AddMaterialModal
          visible
          {...nestedAddMaterialModalProps({
            familyId,
            familyMembers,
            subjectId,
            assigneeIds,
            subjects,
          })}
          onClose={() => setShowAddMaterial(false)}
          onSaved={(material) => {
            if (material?.id) setMaterialId(material.id);
            setShowAddMaterial(false);
          }}
        />
      ) : null}
    </>
  );
}
