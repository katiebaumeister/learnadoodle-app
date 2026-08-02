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
import { updateCalendarEvent, updateCalendarEventSeries, buildEventRecurrenceRule } from '../../lib/create/saveEventHelpers';
import { validateOptionalEventTimes, computeEventTimes } from '../../lib/create/eventTimeUtils';
import { hydrateCalendarEventForm } from '../../lib/create/calendarEventFormUtils';
import { fetchCalendarEventForEdit } from '../../lib/create/calendarEventEditHelpers';
import { findEventConflict, isOverlapError, formatTimeForInput } from '../../lib/create/eventConflictHelpers';
import EventConflictBanner from './shared/EventConflictBanner';

export default function CalendarEventEditModal({
  visible,
  onClose,
  onUpdated,
  event = null,
  familyId,
  familyMembers = [],
  readOnly = false,
  loading = false,
  editScope = 'single',
}) {
  const toast = useToast();
  const isSeriesScope = editScope === 'series';
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
  // True when this event is already part of a recurring series. Series-scope edits route
  // to the legacy modal, so recurrence is read-only here (single occurrence edit).
  const [recurrenceLocked, setRecurrenceLocked] = useState(false);
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
  const [conflict, setConflict] = useState(null);
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
    setRecurrenceLocked(
      !!form.isRepeating ||
      !!event.recurrence_id ||
      !!event.parent_event_id ||
      !!event.recurrence_rule
    );
    setRecurrenceType(form.recurrenceType);
    setRecurrenceWeekdays(form.recurrenceWeekdays);
    setRecurrenceEndType(form.recurrenceEndType);
    setRecurrenceEndAfterText(form.recurrenceEndAfterText);
    setRecurrenceEndDate(form.recurrenceEndDate);
    setDatePickerTarget(null);
    setValidationBanner('');
    setErrors({});
    setConflict(null);
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
      setEndDate(null);
      setErrors((prev) => {
        if (!prev.endDate) return prev;
        const next = { ...prev };
        delete next.endDate;
        return next;
      });
    }
  }, [readOnly, startDate]);

  // Switch this modal between single-occurrence and whole-series scope by re-dispatching
  // the same event with the new editScope (recurrence lock/unlock + single vs series save).
  const switchEditScope = useCallback((nextScope) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!event?.id) return;
    if (typeof onClose === 'function') onClose();
    window.dispatchEvent(new CustomEvent('openEventModal', {
      detail: {
        eventId: event.id,
        initialEvent: event,
        schedulingMode: true,
        editScope: nextScope,
        skipSummary: true,
      },
    }));
  }, [event, onClose]);

  const handleEditSeries = useCallback(() => switchEditScope('series'), [switchEditScope]);
  const handleEditThisOccurrence = useCallback(() => switchEditScope('single'), [switchEditScope]);

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
    if (!isRepeating && endDate && startDate) {
      const startDay = new Date(startDate);
      startDay.setHours(0, 0, 0, 0);
      const endDay = new Date(endDate);
      endDay.setHours(0, 0, 0, 0);
      if (endDay.getTime() < startDay.getTime()) {
        next.endDate = 'End date can’t be before the start date.';
      }
    }
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
    endDate,
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

  const handleSave = async (overrideTimes = null) => {
    if (readOnly || !event?.id) return;
    const effectiveStartTime = overrideTimes?.startTime ?? startTime;
    const effectiveEndTime = overrideTimes?.endTime ?? endTime;
    // Once a conflict has been surfaced, a second Save (or Ignore) saves anyway.
    const allowConflict = overrideTimes?.allowConflict ?? !!conflict;
    if (!validate()) return;
    setSubmitting(true);
    setConflict(null);
    try {
      const editPayload = {
        eventId: event.id,
        familyId,
        title,
        childIds: assigneeIds,
        date: startDate,
        endDate,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        location,
        notes,
        materialIds: materialIdsFromSelection(materialId),
        allowConflict,
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
      };
      const updated = isSeriesScope
        ? await updateCalendarEventSeries(editPayload)
        : await updateCalendarEvent(editPayload);
      toast.push(isSeriesScope ? 'Series updated' : 'Event updated', 'success');
      onUpdated?.(updated);
      onClose?.();
    } catch (err) {
      const message = err?.message || 'Failed to update event';
      const timeCheck = validateOptionalEventTimes({ startTime: effectiveStartTime, endTime: effectiveEndTime });
      if (!timeCheck.ok || /start time|end time|date or time/i.test(message)) {
        setErrors((prev) => ({ ...prev, time: timeCheck.ok ? message : timeCheck.error }));
        setValidationBanner('Please fix the highlighted fields before saving.');
      } else if (isOverlapError(message)) {
        await showConflict(effectiveStartTime, effectiveEndTime);
      } else {
        toast.push(message, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const showConflict = async (effectiveStartTime, effectiveEndTime) => {
    try {
      const times = computeEventTimes({
        date: startDate,
        endDate,
        startTime: effectiveStartTime,
        endTime: effectiveEndTime,
        allowOptionalTime: true,
      });
      if (!times.start || !times.end) {
        toast.push('Event overlaps with an existing event.', 'error');
        return;
      }
      const found = await findEventConflict({
        familyId,
        childIds: assigneeIds,
        startTs: times.start.toISOString(),
        endTs: times.end.toISOString(),
        excludeEventId: event?.id || null,
      });
      if (found) {
        setConflict(found);
      } else {
        toast.push('Event overlaps with an existing event.', 'error');
      }
    } catch {
      toast.push('Event overlaps with an existing event.', 'error');
    }
  };

  const handleUseSuggestion = (suggestion) => {
    if (!suggestion?.start || !suggestion?.end) return;
    const nextStart = formatTimeForInput(suggestion.start);
    const nextEnd = formatTimeForInput(suggestion.end);
    setStartTime(nextStart);
    setEndTime(nextEnd);
    setConflict(null);
    handleSave({ startTime: nextStart, endTime: nextEnd, allowConflict: false });
  };

  const handleIgnoreConflict = () => {
    setConflict(null);
    handleSave({ allowConflict: true });
  };

  if (!visible) return null;

  const datePickerValue = datePickerTarget === 'end'
    ? (endDate || startDate)
    : datePickerTarget === 'recurrenceEnd'
      ? (recurrenceEndDate || startDate)
      : startDate;

  const disabled = readOnly;

  // Recurrence is read-only only when editing a single occurrence of a series.
  const lockRecurrence = recurrenceLocked && !isSeriesScope;
  const scopeSecondaryActions = disabled
    ? []
    : isSeriesScope
      ? [{ key: 'edit-one', label: 'Edit only this event', onPress: handleEditThisOccurrence }]
      : recurrenceLocked
        ? [{ key: 'edit-series', label: 'Edit series', onPress: handleEditSeries }]
        : [];

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <CreateModalShell
          title={isSeriesScope ? 'Edit series' : 'Calendar Event'}
          onClose={onClose}
          onSave={handleSave}
          onBlockedSave={disabled ? undefined : () => validate()}
          saving={submitting}
          saveDisabled={disabled || !title.trim() || assigneeIds.length === 0}
          secondaryActions={scopeSecondaryActions}
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
                onEndDateChange={(value) => {
                  setEndDate(value);
                  if (errors.endDate) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.endDate;
                      return next;
                    });
                    setValidationBanner('');
                  }
                }}
                showEndDate={!isRepeating}
                startTime={startTime}
                onStartTimeChange={(value) => {
                  setStartTime(value);
                  if (conflict) setConflict(null);
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
                  if (conflict) setConflict(null);
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

              <EventConflictBanner
                conflict={conflict}
                familyChildren={familyMembers}
                onUseSuggestion={handleUseSuggestion}
                onIgnore={handleIgnoreConflict}
                onDismiss={() => setConflict(null)}
              />

              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>Repeat</Text>
                <View
                  style={lockRecurrence ? { opacity: 0.55 } : null}
                  pointerEvents={lockRecurrence ? 'none' : 'auto'}
                >
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      onPress={() => selectRepeatMode(false)}
                      disabled={disabled || lockRecurrence}
                      style={[
                        styles.dropdownOption,
                        !isRepeating && styles.dropdownOptionActive,
                      ]}
                      {...(Platform.OS === 'web' && { cursor: (disabled || lockRecurrence) ? 'not-allowed' : 'pointer' })}
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
                      disabled={disabled || lockRecurrence}
                      style={[
                        styles.dropdownOption,
                        isRepeating && styles.dropdownOptionActive,
                      ]}
                      {...(Platform.OS === 'web' && { cursor: (disabled || lockRecurrence) ? 'not-allowed' : 'pointer' })}
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
                {lockRecurrence ? (
                  <Text style={[styles.fieldHelpText, { marginTop: 6 }]}>
                    This event repeats. Use “Edit series” below to change repeat settings.
                  </Text>
                ) : null}
              </View>

              {isRepeating ? (
                <View
                  style={lockRecurrence ? { opacity: 0.55 } : null}
                  pointerEvents={lockRecurrence ? 'none' : 'auto'}
                >
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
                </View>
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
          if (conflict) setConflict(null);
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
