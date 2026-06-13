import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { useToast } from '../Toast';
import CreateModalShell from '../create/shared/CreateModalShell';
import ScheduleDateFields from '../create/shared/ScheduleDateFields';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import { createModalStyles as styles } from '../create/shared/createModalStyles';
import {
  WEEKDAY_OPTIONS,
  APPLY_SCOPE_FULL_YEAR,
  APPLY_SCOPE_FORWARD,
  buildInitialScheduleForm,
  applySubjectScheduleToCalendar,
  normalizeHm,
  resolveApplyFromDate,
  toLocalYmd,
} from '../../lib/subjectConfigureSchedule';

function toggleWeekday(current, dayNum) {
  const set = new Set(current || []);
  if (set.has(dayNum)) set.delete(dayNum);
  else set.add(dayNum);
  return [...set].sort((a, b) => a - b);
}

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
  const [weekdays, setWeekdays] = useState([1, 3, 5]);
  const [startTime, setStartTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');
  const [applyScope, setApplyScope] = useState(APPLY_SCOPE_FULL_YEAR);
  const [hasExistingBlock, setHasExistingBlock] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const initial = buildInitialScheduleForm({
      subject,
      planData: subjectPlanData,
      academicYearId,
    });
    setWeekdays(initial.weekdays);
    setStartTime(initial.startTime);
    setDurationMinutes(String(initial.durationMinutes));
    setStartDate(initial.startDate);
    setEndDate(initial.endDate);
    setHasExistingBlock(!!initial.hasExistingBlock);
    setApplyScope(initial.hasExistingBlock ? APPLY_SCOPE_FORWARD : APPLY_SCOPE_FULL_YEAR);
    setValidationBanner('');
  }, [visible, subject, subjectPlanData, academicYearId]);

  const applyFromLabel = useMemo(() => {
    if (!startDate || !endDate) return 'today';
    const startYmd = toLocalYmd(startDate);
    const endYmd = toLocalYmd(endDate);
    return resolveApplyFromDate(startYmd, endYmd);
  }, [startDate, endDate]);

  const datePickerValue = useMemo(() => {
    if (datePickerTarget === 'end') return endDate;
    return startDate;
  }, [datePickerTarget, startDate, endDate]);

  const validate = useCallback(() => {
    if (!weekdays.length) {
      setValidationBanner('Select at least one day.');
      return false;
    }
    if (!normalizeHm(startTime, '')) {
      setValidationBanner('Enter a valid start time (HH:MM).');
      return false;
    }
    if (!Number(durationMinutes) || Number(durationMinutes) <= 0) {
      setValidationBanner('Duration must be at least 1 minute.');
      return false;
    }
    if (!startDate || !endDate) {
      setValidationBanner('Pick start and end dates.');
      return false;
    }
    setValidationBanner('');
    return true;
  }, [weekdays, startTime, durationMinutes, startDate, endDate]);

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
        applyScope: hasExistingBlock ? applyScope : APPLY_SCOPE_FULL_YEAR,
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

          <View style={styles.formGroup}>
            <Text style={styles.fieldLabel}>Days</Text>
            <View style={styles.chipRow}>
              {WEEKDAY_OPTIONS.map(({ num, label }) => {
                const active = weekdays.includes(num);
                return (
                  <TouchableOpacity
                    key={num}
                    onPress={() => setWeekdays((prev) => toggleWeekday(prev, num))}
                    style={[
                      styles.dropdownOption,
                      styles.assigneePill,
                      active && styles.dropdownOptionActive,
                    ]}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        styles.assigneePillText,
                        active && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.dateTimeInlineRow}>
            <View style={[styles.scheduleColumn, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Time</Text>
              <TextInput
                value={startTime}
                onChangeText={(text) => setStartTime(normalizeHm(text.replace(/[^\d:]/g, ''), startTime))}
                placeholder="09:00"
                style={styles.fieldInput}
              />
            </View>
            <View style={[styles.scheduleColumn, { flex: 1 }]}>
              <Text style={styles.fieldLabel}>Duration (min)</Text>
              <TextInput
                value={String(durationMinutes)}
                onChangeText={(text) => setDurationMinutes(text.replace(/[^\d]/g, ''))}
                placeholder="60"
                keyboardType="numeric"
                style={styles.fieldInput}
              />
            </View>
          </View>

          <ScheduleDateFields
            startDate={startDate}
            onStartDateChange={setStartDate}
            endDate={endDate}
            onEndDateChange={setEndDate}
            showEndDate
            showTimes={false}
            onOpenStartDatePicker={() => setDatePickerTarget('start')}
            onOpenEndDatePicker={() => setDatePickerTarget('end')}
          />

          {hasExistingBlock ? (
            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>Apply changes</Text>
              <View style={styles.chipRow}>
                <TouchableOpacity
                  onPress={() => setApplyScope(APPLY_SCOPE_FORWARD)}
                  style={[
                    styles.dropdownOption,
                    styles.assigneePill,
                    applyScope === APPLY_SCOPE_FORWARD && styles.dropdownOptionActive,
                  ]}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      styles.assigneePillText,
                      applyScope === APPLY_SCOPE_FORWARD && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
                    ]}
                  >
                    From today forward
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setApplyScope(APPLY_SCOPE_FULL_YEAR)}
                  style={[
                    styles.dropdownOption,
                    styles.assigneePill,
                    applyScope === APPLY_SCOPE_FULL_YEAR && styles.dropdownOptionActive,
                  ]}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text
                    style={[
                      styles.dropdownOptionText,
                      styles.assigneePillText,
                      applyScope === APPLY_SCOPE_FULL_YEAR && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
                    ]}
                  >
                    Entire school year
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 13, color: '#64748B', marginTop: 8 }}>
                {applyScope === APPLY_SCOPE_FORWARD
                  ? `Updates sessions from ${applyFromLabel} onward. Past sessions and mapped lessons are left unchanged.`
                  : 'Regenerates all sessions in the date range. Mapped lessons are not overwritten.'}
              </Text>
            </View>
          ) : null}
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
