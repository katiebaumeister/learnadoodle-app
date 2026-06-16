import React, { useRef, useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { ChevronDown, CheckCircle } from 'lucide-react';
import { createModalStyles as styles } from '../../create/shared/createModalStyles';
import { SingleDateField } from '../../create/shared/ScheduleDateFields';
import Dropdown from '../../ui/Dropdown';
import MaskedTimeInput from '../../ui/MaskedTimeInput';
import { normalizeTimeValue, parseTimeString } from '../../../lib/create/eventTimeUtils';
import {
  WEEKDAY_OPTIONS,
  hmToMaskedTime,
  maskedTimeToHm,
} from '../../../lib/subjectConfigureSchedule';

function isWeekdayActive(weekdays, dayNum) {
  return (weekdays || []).some((day) => Number(day) === dayNum);
}

function toggleWeekday(current, dayNum) {
  const set = new Set(
    (current || [])
      .map((day) => parseInt(day, 10))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );
  if (set.has(dayNum)) set.delete(dayNum);
  else set.add(dayNum);
  return [...set].sort((a, b) => a - b);
}

const SCHEDULE_FIELD_DEFAULTS = {
  time: '09:00',
  duration: '60',
};

export default function SubjectScheduleFields({
  schoolYear,
  schoolYearOptions = [],
  onSchoolYearChange,
  schoolTerm,
  termOptions = [],
  onSchoolTermChange,
  weekdays,
  onWeekdaysChange,
  startTime,
  onStartTimeChange,
  durationMinutes,
  onDurationMinutesChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onOpenStartDatePicker,
  onOpenEndDatePicker,
  embeddedInForm = false,
}) {
  const schoolYearTriggerRef = useRef(null);
  const schoolTermTriggerRef = useRef(null);
  const [showSchoolYearDropdown, setShowSchoolYearDropdown] = useState(false);
  const [showSchoolTermDropdown, setShowSchoolTermDropdown] = useState(false);
  const [maskedStartTime, setMaskedStartTime] = useState('');
  const startTimeRef = useRef(startTime);

  useEffect(() => {
    startTimeRef.current = startTime;
    setMaskedStartTime(hmToMaskedTime(startTime || SCHEDULE_FIELD_DEFAULTS.time));
  }, [startTime]);

  const commitStartTime = (masked) => {
    const hm = maskedTimeToHm(masked, startTimeRef.current || SCHEDULE_FIELD_DEFAULTS.time);
    setMaskedStartTime(hmToMaskedTime(hm));
    onStartTimeChange?.(hm);
  };

  const handleMaskedStartTimeChange = (masked) => {
    setMaskedStartTime(masked);
    const parsed = parseTimeString(normalizeTimeValue(masked));
    if (parsed) {
      const hm = `${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`;
      onStartTimeChange?.(hm);
    }
  };

  const activeTermLabel = (termOptions.find((opt) => opt.id === schoolTerm) || termOptions[0])?.label || 'Full year';
  const showScopeFields = typeof onSchoolYearChange === 'function';

  const startDateField = (
    <SingleDateField
      label="Start date"
      date={startDate}
      onDateChange={onStartDateChange}
      onOpenDatePicker={onOpenStartDatePicker}
      required
    />
  );
  const endDateField = (
    <SingleDateField
      label="End date"
      date={endDate}
      onDateChange={onEndDateChange}
      onOpenDatePicker={onOpenEndDatePicker}
      required
    />
  );

  return (
    <View>
      {!embeddedInForm ? (
        <Text style={styles.sectionHeading}>Recurring schedule</Text>
      ) : null}

      {showScopeFields ? (
        <>
          <View style={localStyles.scopeField}>
        <Text style={styles.fieldLabel}>School year</Text>
        <TouchableOpacity
          ref={schoolYearTriggerRef}
          style={styles.select}
          onPress={() => {
            setShowSchoolTermDropdown(false);
            setShowSchoolYearDropdown((open) => !open);
          }}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.selectText}>{schoolYear}</Text>
          <ChevronDown size={18} color="#6b7280" />
        </TouchableOpacity>
        <Dropdown
          visible={showSchoolYearDropdown}
          triggerRef={schoolYearTriggerRef}
          onClose={() => setShowSchoolYearDropdown(false)}
          placement="bottom-start"
          matchTriggerWidth
          maxHeight={220}
        >
          {schoolYearOptions.map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[localStyles.menuOption, opt === schoolYear && localStyles.menuOptionSelected]}
              onPress={() => {
                onSchoolYearChange?.(opt);
                setShowSchoolYearDropdown(false);
              }}
            >
              <Text style={[localStyles.menuOptionText, opt === schoolYear && localStyles.menuOptionTextSelected]}>
                {opt}
              </Text>
              {opt === schoolYear ? <CheckCircle size={16} color="#6BB3E8" /> : null}
            </TouchableOpacity>
          ))}
        </Dropdown>
      </View>

      <View style={localStyles.scopeField}>
        <Text style={styles.fieldLabel}>Term</Text>
        <TouchableOpacity
          ref={schoolTermTriggerRef}
          style={styles.select}
          onPress={() => {
            setShowSchoolYearDropdown(false);
            setShowSchoolTermDropdown((open) => !open);
          }}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.selectText}>{activeTermLabel}</Text>
          <ChevronDown size={18} color="#6b7280" />
        </TouchableOpacity>
        <Dropdown
          visible={showSchoolTermDropdown}
          triggerRef={schoolTermTriggerRef}
          onClose={() => setShowSchoolTermDropdown(false)}
          placement="bottom-start"
          matchTriggerWidth
          maxHeight={220}
        >
          {termOptions.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={[localStyles.menuOption, opt.id === schoolTerm && localStyles.menuOptionSelected]}
              onPress={() => {
                onSchoolTermChange?.(opt.id);
                setShowSchoolTermDropdown(false);
              }}
            >
              <Text style={[localStyles.menuOptionText, opt.id === schoolTerm && localStyles.menuOptionTextSelected]}>
                {opt.label}
              </Text>
              {opt.id === schoolTerm ? <CheckCircle size={16} color="#6BB3E8" /> : null}
            </TouchableOpacity>
          ))}
        </Dropdown>
          </View>

          {startDateField}
          {endDateField}
        </>
      ) : null}

      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>Days</Text>
        <View style={styles.chipRow}>
          {WEEKDAY_OPTIONS.map(({ num, label }) => {
            const active = isWeekdayActive(weekdays, num);
            return (
              <TouchableOpacity
                key={num}
                onPress={() => onWeekdaysChange(toggleWeekday(weekdays, num))}
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
          <MaskedTimeInput
            value={maskedStartTime}
            onChangeText={handleMaskedStartTimeChange}
            onBlur={commitStartTime}
            placeholder="Optional"
            wrapStyle={styles.scheduleTimeInputWrap}
          />
        </View>
        <View style={[styles.scheduleColumn, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Duration (min)</Text>
          <TextInput
            value={durationMinutes === '' || durationMinutes == null ? '' : String(durationMinutes)}
            onChangeText={(text) => onDurationMinutesChange(text.replace(/[^\d]/g, ''))}
            placeholder="60"
            keyboardType="numeric"
            style={styles.fieldInput}
          />
        </View>
      </View>

      {!showScopeFields ? (
        <>
          {startDateField}
          {endDateField}
        </>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  scopeField: {
    marginBottom: 14,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  menuOptionSelected: {
    backgroundColor: 'rgba(133, 196, 242, 0.12)',
  },
  menuOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  menuOptionTextSelected: {
    color: '#6BB3E8',
    fontWeight: '600',
  },
});
