import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useToast } from '../Toast';
import CreateModalShell from './shared/CreateModalShell';
import FamilyMemberPicker, { resolveDefaultAssigneeIds } from './shared/FamilyMemberPicker';
import ScheduleDateFields from './shared/ScheduleDateFields';
import AdditionalNotesSection from './shared/AdditionalNotesSection';
import EventAttachmentsField, { materialIdsFromSelection } from './shared/EventAttachmentsField';
import EventRecurrenceFields from './shared/EventRecurrenceFields';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import AddMaterialModal from '../materials/AddMaterialModal';
import { createModalStyles as styles, PLACEHOLDER, CREATE_EVENT_MODAL_MAX_WIDTH } from './shared/createModalStyles';
import { saveCalendarEvent, buildEventRecurrenceRule } from '../../lib/create/saveEventHelpers';

export default function CalendarEventCreateModal({
  visible,
  onClose,
  onCreated,
  familyId,
  familyMembers = [],
  defaultDate = null,
  defaultChildId = null,
  defaultChildIds = null,
  defaultSubjectId = null,
  defaultTitle = null,
  defaultMaterialId = null,
  defaultStartTime = null,
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

  useEffect(() => {
    if (!visible) return;
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
    setValidationBanner('');
    setErrors({});
  }, [visible, defaultDate, defaultChildId, defaultChildIds, defaultTitle, defaultMaterialId, defaultStartTime, familyMembers]);

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
  ]);

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
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
      toast.push('Event created', 'success');
      onCreated?.(event);
      onClose?.();
    } catch (err) {
      toast.push(err?.message || 'Failed to create event', 'error');
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

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <CreateModalShell
          title="Calendar Event"
          onClose={onClose}
          onSave={handleSave}
          saving={submitting}
          saveDisabled={!title.trim() || assigneeIds.length === 0}
          validationBanner={validationBanner}
          maxWidth={CREATE_EVENT_MODAL_MAX_WIDTH}
        >
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
            onStartTimeChange={setStartTime}
            endTime={endTime}
            onEndTimeChange={setEndTime}
            onOpenStartDatePicker={() => setDatePickerTarget('start')}
            onOpenEndDatePicker={() => setDatePickerTarget('end')}
            startDateError={errors.date}
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

          {familyId ? (
            <EventAttachmentsField
              familyId={familyId}
              selectedMaterialId={materialId}
              onMaterialChange={setMaterialId}
              onAddNew={() => setShowAddMaterial(true)}
            />
          ) : null}
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
          familyId={familyId}
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
