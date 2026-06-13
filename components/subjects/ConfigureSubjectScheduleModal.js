import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text } from 'react-native';
import { useToast } from '../Toast';
import CreateModalShell from '../create/shared/CreateModalShell';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import { createModalStyles as styles } from '../create/shared/createModalStyles';
import SubjectScheduleFields from './subjectSettings/SubjectScheduleFields';
import {
  APPLY_SCOPE_FULL_YEAR,
  buildInitialScheduleForm,
  applySubjectScheduleToCalendar,
} from '../../lib/subjectConfigureSchedule';

export default function ConfigureSubjectScheduleModal({
  visible,
  onClose,
  onSaved,
  familyId,
  subject,
  assignedChildIds = [],
  allChildIds = [],
  subjectPlanData = null,
  academicYearId = null,
}) {
  const toast = useToast();
  const [weekdays, setWeekdays] = useState([]);
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');

  useEffect(() => {
    if (!visible) return;
    const initial = buildInitialScheduleForm({
      subject,
      planData: subjectPlanData,
      academicYearId,
    });
    setWeekdays(initial.weekdays);
    setStartTime(initial.startTime || '');
    setDurationMinutes(
      initial.durationMinutes === '' || initial.durationMinutes == null
        ? ''
        : String(initial.durationMinutes),
    );
    setStartDate(initial.startDate);
    setEndDate(initial.endDate);
    setValidationBanner('');
  }, [visible, subject, subjectPlanData, academicYearId]);

  const datePickerValue = useMemo(() => {
    if (datePickerTarget === 'end') return endDate;
    return startDate;
  }, [datePickerTarget, startDate, endDate]);

  const validate = useCallback(() => {
    if (!weekdays.length) {
      setValidationBanner('Select at least one day.');
      return false;
    }
    if (!startDate || !endDate) {
      setValidationBanner('Pick start and end dates.');
      return false;
    }
    if (!Number(durationMinutes) || Number(durationMinutes) <= 0) {
      setValidationBanner('Duration must be at least 1 minute.');
      return false;
    }
    setValidationBanner('');
    return true;
  }, [weekdays, durationMinutes, startDate, endDate]);

  const handleGenerate = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const result = await applySubjectScheduleToCalendar({
        familyId,
        subject,
        assignedChildIds,
        allChildIds,
        weekdays,
        startTime,
        durationMinutes: Number(durationMinutes),
        startDate,
        endDate,
        academicYearId,
        planData: subjectPlanData,
        applyScope: APPLY_SCOPE_FULL_YEAR,
      });
      toast.push(`Generated ${result?.created ?? 0} calendar events`, 'success');
      onSaved?.(result);
      onClose?.();
    } catch (err) {
      toast.push(err?.message || 'Failed to generate calendar events', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <CreateModalShell
          title="Configure schedule"
          onClose={onClose}
          onSave={handleGenerate}
          saving={submitting}
          saveDisabled={!weekdays.length || !startDate || !endDate}
          validationBanner={validationBanner}
          saveLabel="Generate calendar events"
        >
          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Subject</Text>
            <Text style={{ fontSize: 16, fontWeight: '600', color: '#0F172A' }}>
              {subject?.name || 'Subject'}
            </Text>
          </View>

          <SubjectScheduleFields
            weekdays={weekdays}
            onWeekdaysChange={setWeekdays}
            startTime={startTime}
            onStartTimeChange={setStartTime}
            durationMinutes={durationMinutes}
            onDurationMinutesChange={setDurationMinutes}
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
            onOpenStartDatePicker={() => setDatePickerTarget('start')}
            onOpenEndDatePicker={() => setDatePickerTarget('end')}
          />
        </CreateModalShell>
      </Modal>

      <AppCalendarDatePickerModal
        visible={!!datePickerTarget}
        onClose={() => setDatePickerTarget(null)}
        selectedDate={datePickerValue || new Date()}
        onSelectDate={(d) => {
          if (datePickerTarget === 'end') setEndDate(d);
          else setStartDate(d);
          setDatePickerTarget(null);
        }}
      />
    </>
  );
}
