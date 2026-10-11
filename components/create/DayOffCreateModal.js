import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  useModalStackElevation,
  NESTED_OVER_PARENT_MODAL_Z,
} from '../hooks/useModalStackElevation';
import { SCHOOL_YEAR_SETTINGS_UI } from '../planner/planningPreferencesUiCopy';

export default function DayOffCreateModal({
  visible,
  onClose,
  onSaved,
  onDeleted,
  familyId,
  schoolYearLabel,
  defaultDate = null,
  editRow = null,
  /** When opened from School Year Settings (or another elevated modal), sit above that parent. */
  stackZIndex = NESTED_OVER_PARENT_MODAL_Z,
}) {
  const toast = useToast();
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible, stackZIndex);
  const isEditMode = !!editRow?.id;
  const isDefaultUsHoliday = editRow?.kind === 'public'
    || String(editRow?.id || '').startsWith('public-');
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
    if (isDefaultUsHoliday) return;
    setIsRepeating(repeating);
    if (repeating) {
      const anchor = startDate instanceof Date ? startDate : new Date();
      setRecurrenceType('weekly');
      setRecurrenceWeekdays([anchor.getDay()]);
      setRecurrenceEndType('never');
      setRecurrenceEndAfterText('');
      setRecurrenceEndDate(null);
    }
  }, [startDate, isDefaultUsHoliday]);

  const handleRecurrenceTypeChange = useCallback((type) => {
    if (isDefaultUsHoliday) return;
    setRecurrenceType(type);
    if (type === 'weekly' && (!Array.isArray(recurrenceWeekdays) || recurrenceWeekdays.length === 0)) {
      const anchor = startDate instanceof Date ? startDate : new Date();
      setRecurrenceWeekdays([anchor.getDay()]);
    }
  }, [recurrenceWeekdays, startDate, isDefaultUsHoliday]);

  const validate = useCallback(() => {
    if (isDefaultUsHoliday) return false;
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
  }, [title, startDate, startTime, endTime, isRepeating, isDefaultUsHoliday]);

  const handleSave = async () => {
    if (isDefaultUsHoliday) return;
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
      // Await parent update (and DB exclusion write for default US holidays) before closing.
      // Skip refreshPlanDefaults for default holidays — it reloads settings and can resurrect them.
      await Promise.resolve(onDeleted?.(editRow));
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        if (!isDefaultUsHoliday) {
          window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
        }
        window.dispatchEvent(new CustomEvent('refreshCalendar', {
          detail: { forceInvalidate: true, reason: isDefaultUsHoliday ? 'excludedPublicHoliday' : 'dayOffDeleted' },
        }));
      }
      toast.push(isDefaultUsHoliday ? 'Holiday removed from days off' : 'Day off deleted', 'success');
      setShowDeleteConfirm(false);
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
        <View ref={overlayRef} style={{ flex: 1 }}>
          <CreateModalShell
            title={isDefaultUsHoliday ? 'Default US holiday' : (isEditMode ? 'Edit day off' : 'Day off')}
            onClose={onClose}
            onSave={isEditMode || isDefaultUsHoliday ? undefined : handleSave}
            saving={submitting}
            saveDisabled={!title.trim() || isDefaultUsHoliday}
            saveLabel="Save changes"
            validationBanner={validationBanner}
            maxWidth={CREATE_EVENT_MODAL_MAX_WIDTH}
            footer={isEditMode ? (
              <ModalFooter
                mode="edit"
                primaryLabel={submitting ? 'Saving…' : 'Save changes'}
                onCancel={onClose}
                onPrimary={isDefaultUsHoliday ? undefined : handleSave}
                hidePrimary={isDefaultUsHoliday}
                onDelete={() => {
                  if (!submitting && !deleting) setShowDeleteConfirm(true);
                }}
                destructiveLabel={deleting
                  ? (isDefaultUsHoliday ? 'Removing…' : 'Deleting…')
                  : (isDefaultUsHoliday ? 'Remove from days off' : 'Delete day off')}
                accent="#9ECFFB"
                disabled={submitting || deleting}
                visuallyDisabled={isDefaultUsHoliday ? false : !title.trim()}
                loading={submitting}
                onBlockedPrimary={isDefaultUsHoliday ? undefined : () => validate()}
              />
            ) : undefined}
          >
          {isDefaultUsHoliday ? (
            <View
              style={{
                marginBottom: 14,
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: 'rgba(148, 163, 184, 0.35)',
                backgroundColor: '#F8FAFC',
              }}
            >
              <Text style={{
                fontSize: 13,
                lineHeight: 18,
                color: '#475569',
                ...(Platform.OS === 'web' && {
                  fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                }),
              }}
              >
                {SCHOOL_YEAR_SETTINGS_UI.defaultHolidayNotEditableNote}
              </Text>
            </View>
          ) : null}

          <View style={[styles.formGroup, isDefaultUsHoliday ? { opacity: 0.72 } : null]}>
            <Text style={styles.fieldLabel}>
              Title{isDefaultUsHoliday ? null : <Text style={styles.required}> *</Text>}
            </Text>
            <TextInput
              value={title}
              onChangeText={isDefaultUsHoliday ? undefined : setTitle}
              placeholder="Day off name"
              placeholderTextColor={PLACEHOLDER}
              style={[styles.fieldInput, errors.title && styles.fieldInputError]}
              editable={!isDefaultUsHoliday}
              autoFocus={!isDefaultUsHoliday}
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
            onOpenStartDatePicker={isDefaultUsHoliday ? undefined : () => setDatePickerTarget('start')}
            onOpenEndDatePicker={isDefaultUsHoliday ? undefined : () => setDatePickerTarget('end')}
            startDateError={errors.date}
            timeError={errors.time}
            disabled={isDefaultUsHoliday}
          />

          <View style={[styles.formGroup, isDefaultUsHoliday ? { opacity: 0.72 } : null]}>
            <Text style={styles.fieldLabel}>Repeat</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                onPress={() => selectRepeatMode(false)}
                disabled={isDefaultUsHoliday}
                style={[styles.dropdownOption, !isRepeating && styles.dropdownOptionActive]}
                {...(Platform.OS === 'web' && { cursor: isDefaultUsHoliday ? 'default' : 'pointer' })}
              >
                <Text style={[styles.dropdownOptionText, !isRepeating && styles.dropdownOptionTextActive]}>
                  Just once
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => selectRepeatMode(true)}
                disabled={isDefaultUsHoliday}
                style={[styles.dropdownOption, isRepeating && styles.dropdownOptionActive]}
                {...(Platform.OS === 'web' && { cursor: isDefaultUsHoliday ? 'default' : 'pointer' })}
              >
                <Text style={[styles.dropdownOptionText, isRepeating && styles.dropdownOptionTextActive]}>
                  Repeat
                </Text>
              </TouchableOpacity>
            </View>
            {errors.repeat ? <Text style={styles.errorTextSmall}>{errors.repeat}</Text> : null}
          </View>

          {isRepeating && !isDefaultUsHoliday ? (
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

          <View style={[styles.formGroup, isDefaultUsHoliday ? { opacity: 0.72 } : null]}>
            <Text style={styles.fieldLabel}>Location (optional)</Text>
            <TextInput
              value={location}
              onChangeText={isDefaultUsHoliday ? undefined : setLocation}
              placeholder="Where is this happening?"
              placeholderTextColor={PLACEHOLDER}
              style={styles.fieldInput}
              editable={!isDefaultUsHoliday}
            />
          </View>

          {isDefaultUsHoliday ? (
            <View style={[styles.formGroup, { opacity: 0.72 }]}>
              <Text style={styles.fieldLabel}>Additional notes (optional)</Text>
              <TextInput
                value={notes}
                editable={false}
                placeholder="Anything else to remember."
                placeholderTextColor={PLACEHOLDER}
                style={[styles.fieldInput, { minHeight: 88, textAlignVertical: 'top' }]}
                multiline
              />
            </View>
          ) : (
            <AdditionalNotesSection value={notes} onChangeText={setNotes} />
          )}
          </CreateModalShell>
        </View>
      </Modal>

      {!isDefaultUsHoliday ? (
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
      ) : null}

      <ConfirmDialog
        visible={showDeleteConfirm}
        title={isDefaultUsHoliday ? 'Remove holiday from days off?' : 'Delete day off?'}
        message={
          isDefaultUsHoliday
            ? (title.trim()
              ? `"${title.trim()}" will no longer count as a day off. Default US holidays stay available if you turn the setting back on later.`
              : 'This default holiday will no longer count as a day off.')
            : (title.trim()
              ? `"${title.trim()}" will be removed from your school year calendar. This cannot be undone.`
              : 'This day off will be removed from your school year calendar. This cannot be undone.')
        }
        confirmLabel={deleting
          ? (isDefaultUsHoliday ? 'Removing…' : 'Deleting…')
          : (isDefaultUsHoliday ? 'Remove from days off' : 'Delete day off')}
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
