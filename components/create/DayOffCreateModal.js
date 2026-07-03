import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import CreateModalShell from './shared/CreateModalShell';
import ScheduleDateFields from './shared/ScheduleDateFields';
import AdditionalNotesSection from './shared/AdditionalNotesSection';
import EventRecurrenceFields from './shared/EventRecurrenceFields';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import { ModalFooter } from '../ui/ModalFooter';
import { createModalStyles as styles, PLACEHOLDER, CREATE_EVENT_MODAL_MAX_WIDTH } from './shared/createModalStyles';
import { validateOptionalEventTimes } from '../../lib/create/eventTimeUtils';
import {
  dayOffFormFromRow,
  deleteDayOff,
  saveDayOff,
} from '../../lib/create/saveDayOffHelpers';

export default function DayOffCreateModal({
  visible,
  onClose,
  onSaved,
  onDeleted,
  familyId,
  schoolYearLabel,
  defaultDate = null,
  editRow = null,
}) {
  const toast = useToast();
  const isEditMode = !!editRow?.id;
  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(null);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [isRepeating, setIsRepeating] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState('weekly');
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState([]);
  const [recurrenceEndType, setRecurrenceEndType] = useState('never');
  const [recurrenceEndAfterText, setRecurrenceEndAfterText] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!visible) return;
    const form = dayOffFormFromRow(editRow);
    setTitle(form.title);
    setStartDate(defaultDate && !isEditMode ? new Date(defaultDate) : form.startDate);
    setEndDate(isEditMode ? form.endDate : null);
    setStartTime('');
    setEndTime('');
    setLocation('');
    setNotes('');
    setIsRepeating(false);
    setRecurrenceType('weekly');
    setRecurrenceWeekdays([]);
    setRecurrenceEndType('never');
    setRecurrenceEndAfterText('');
    setRecurrenceEndDate(null);
    setDatePickerTarget(null);
    setValidationBanner('');
    setErrors({});
    setShowDeleteConfirm(false);
    setDeleting(false);
  }, [visible, editRow, defaultDate, isEditMode]);

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
    const timeCheck = validateOptionalEventTimes({ startTime, endTime });
    if (!timeCheck.ok) next.time = timeCheck.error;
    if (isRepeating) {
      next.repeat = 'Repeating days off are not supported yet. Choose Just once or use a date range.';
    }
    setErrors(next);
    const ok = Object.keys(next).length === 0;
    if (!ok) setValidationBanner('Please complete required fields before saving.');
    else setValidationBanner('');
    return ok;
  }, [title, startDate, startTime, endTime, isRepeating]);

  const handleSave = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const savedRow = await saveDayOff({
        familyId,
        schoolYearLabel,
        title,
        startDate,
        endDate,
        editRow,
      });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      }
      toast.push(isEditMode ? 'Day off updated' : 'Day off added', 'success');
      onSaved?.(savedRow, editRow);
      onClose?.();
    } catch (err) {
      toast.push(err?.message || `Failed to ${isEditMode ? 'update' : 'add'} day off`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDayOff = async () => {
    if (!editRow?.id || submitting || deleting) return;
    setDeleting(true);
    try {
      await deleteDayOff(editRow);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      }
      toast.push('Day off deleted', 'success');
      setShowDeleteConfirm(false);
      onDeleted?.(editRow);
      onClose?.();
    } catch (err) {
      toast.push(err?.message || 'Failed to delete day off', 'error');
    } finally {
      setDeleting(false);
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
          title={isEditMode ? 'Edit day off' : 'Day off'}
          onClose={onClose}
          onSave={isEditMode ? undefined : handleSave}
          saving={submitting}
          saveDisabled={!title.trim()}
          saveLabel="Save changes"
          validationBanner={validationBanner}
          maxWidth={CREATE_EVENT_MODAL_MAX_WIDTH}
          footer={isEditMode ? (
            <ModalFooter
              mode="edit"
              primaryLabel={submitting ? 'Saving…' : 'Save changes'}
              onCancel={onClose}
              onPrimary={handleSave}
              onDelete={() => {
                if (!submitting && !deleting) setShowDeleteConfirm(true);
              }}
              destructiveLabel={deleting ? 'Deleting…' : 'Delete day off'}
              accent="#9ECFFB"
              disabled={submitting || deleting}
              visuallyDisabled={!title.trim()}
              loading={submitting}
              onBlockedPrimary={() => validate()}
            />
          ) : undefined}
        >
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>
              Title<Text style={styles.required}> *</Text>
            </Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Day off name"
              placeholderTextColor={PLACEHOLDER}
              style={[styles.fieldInput, errors.title && styles.fieldInputError]}
              autoFocus
            />
            {errors.title ? <Text style={styles.errorTextSmall}>{errors.title}</Text> : null}
          </View>

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
            timeError={errors.time}
          />

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Repeat</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                onPress={() => selectRepeatMode(false)}
                style={[styles.dropdownOption, !isRepeating && styles.dropdownOptionActive]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={[styles.dropdownOptionText, !isRepeating && styles.dropdownOptionTextActive]}>
                  Just once
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => selectRepeatMode(true)}
                style={[styles.dropdownOption, isRepeating && styles.dropdownOptionActive]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={[styles.dropdownOptionText, isRepeating && styles.dropdownOptionTextActive]}>
                  Repeat
                </Text>
              </TouchableOpacity>
            </View>
            {errors.repeat ? <Text style={styles.errorTextSmall}>{errors.repeat}</Text> : null}
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

          <AdditionalNotesSection value={notes} onChangeText={setNotes} />
        </CreateModalShell>
      </Modal>

      <AppCalendarDatePickerModal
        visible={!!datePickerTarget}
        selectedDate={datePickerValue}
        onClose={() => setDatePickerTarget(null)}
        onSelectDate={(nextDate) => {
          if (datePickerTarget === 'end') setEndDate(nextDate);
          else if (datePickerTarget === 'recurrenceEnd') setRecurrenceEndDate(nextDate);
          else setStartDate(nextDate);
          setDatePickerTarget(null);
        }}
      />

      <ConfirmDialog
        visible={showDeleteConfirm}
        title="Delete day off?"
        message={
          title.trim()
            ? `"${title.trim()}" will be removed from your school year calendar. This cannot be undone.`
            : 'This day off will be removed from your school year calendar. This cannot be undone.'
        }
        confirmLabel={deleting ? 'Deleting…' : 'Delete day off'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!deleting) setShowDeleteConfirm(false);
        }}
        onConfirm={handleDeleteDayOff}
      />
    </>
  );
}
