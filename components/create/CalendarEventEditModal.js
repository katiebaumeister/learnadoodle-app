import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useToast } from '../Toast';
import CreateModalShell from './shared/CreateModalShell';
import { ModalFooter } from '../ui/ModalFooter';
import FamilyMemberPicker, { resolveDefaultAssigneeIds } from './shared/FamilyMemberPicker';
import ScheduleDateFields from './shared/ScheduleDateFields';
import AdditionalNotesSection from './shared/AdditionalNotesSection';
import EventAttachmentsField, { materialIdsFromSelection } from './shared/EventAttachmentsField';
import EventRecurrenceFields from './shared/EventRecurrenceFields';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import AddMaterialModal from '../materials/AddMaterialModal';
import { nestedAddMaterialModalProps } from './shared/nestedAddMaterialModalProps';
import { useFamilySubjects } from './shared/useSubjectsForAssignees';
import { createModalStyles as styles, PLACEHOLDER, CREATE_EVENT_MODAL_MAX_WIDTH } from './shared/createModalStyles';
import { updateCalendarEvent, buildEventRecurrenceRule } from '../../lib/create/saveEventHelpers';
import { validateOptionalEventTimes } from '../../lib/create/eventTimeUtils';
import { hydrateCalendarEventForm } from '../../lib/create/calendarEventFormUtils';

export default function CalendarEventEditModal({
  visible,
  onClose,
  onUpdated,
  event = null,
  familyId,
  familyMembers = [],
  readOnly = false,
  loading = false,
}) {
  const toast = useToast();
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
  const subjects = useFamilySubjects(familyId);

  useEffect(() => {
    if (!visible || !event) return;
    const form = hydrateCalendarEventForm(event);
    setTitle(form.title);
    setAssigneeIds(
      form.assigneeIds.length > 0
        ? form.assigneeIds
        : resolveDefaultAssigneeIds({ familyMembers }),
    );
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
    setDatePickerTarget(null);
    setValidationBanner('');
    setErrors({});
  }, [visible, event, familyMembers]);

  const selectRepeatMode = useCallback((repeating) => {
    if (readOnly) return;
    setIsRepeating(repeating);
    if (repeating) {
      const anchor = startDate instanceof Date ? startDate : new Date();
      setRecurrenceType('weekly');
      setRecurrenceWeekdays([anchor.getDay()]);
      setRecurrenceEndType('never');
      setRecurrenceEndAfterText('');
      setRecurrenceEndDate(null);
    }
  }, [readOnly, startDate]);

  const handleRecurrenceTypeChange = useCallback((type) => {
    if (readOnly) return;
    setRecurrenceType(type);
    if (type === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
      const anchor = startDate instanceof Date ? startDate : new Date();
      setRecurrenceWeekdays([anchor.getDay()]);
    }
  }, [readOnly, recurrenceWeekdays, startDate]);

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
    if (readOnly || !event?.id) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const updated = await updateCalendarEvent({
        eventId: event.id,
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
        recurrenceRule: isRepeating
          ? buildEventRecurrenceRule({
            recurrenceType,
            recurrenceWeekdays,
            recurrenceEndType,
            recurrenceEndAfter: parseInt(recurrenceEndAfterText, 10) || null,
            recurrenceEndDate,
            startDate,
          })
          : null,
      });
      toast.push('Event updated', 'success');
      onUpdated?.(updated);
      onClose?.();
    } catch (err) {
      const message = err?.message || 'Failed to update event';
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

  if (!visible) return null;

  const datePickerValue = datePickerTarget === 'end'
    ? (endDate || startDate)
    : datePickerTarget === 'recurrenceEnd'
      ? (recurrenceEndDate || startDate)
      : startDate;

  const disabled = readOnly;

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <CreateModalShell
          title="Calendar Event"
          onClose={onClose}
          onSave={handleSave}
          saving={submitting}
          saveDisabled={disabled || !title.trim() || assigneeIds.length === 0}
          validationBanner={validationBanner}
          maxWidth={CREATE_EVENT_MODAL_MAX_WIDTH}
          footer={disabled ? (
            <ModalFooter
              mode="edit"
              primaryLabel="Close"
              onCancel={onClose}
              onPrimary={onClose}
              accent="#9ECFFB"
            />
          ) : undefined}
        >
          {loading ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#9ECFFB" />
            </View>
          ) : (
            <View pointerEvents={disabled ? 'none' : 'auto'} style={disabled ? { opacity: 0.92 } : null}>
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
                  editable={!disabled}
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
                    disabled={disabled}
                    style={[
                      styles.dropdownOption,
                      !isRepeating && styles.dropdownOptionActive,
                    ]}
                    {...(Platform.OS === 'web' && !disabled && { cursor: 'pointer' })}
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
                    disabled={disabled}
                    style={[
                      styles.dropdownOption,
                      isRepeating && styles.dropdownOptionActive,
                    ]}
                    {...(Platform.OS === 'web' && !disabled && { cursor: 'pointer' })}
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
                  editable={!disabled}
                />
              </View>

              <AdditionalNotesSection
                value={notes}
                onChangeText={setNotes}
              />

              {familyId ? (
                <EventAttachmentsField
                  familyId={familyId}
                  selectedMaterialId={materialId}
                  onMaterialChange={setMaterialId}
                  onAddNew={() => setShowAddMaterial(true)}
                />
              ) : null}
            </View>
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
            subjectId: event?.subject_id || null,
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
