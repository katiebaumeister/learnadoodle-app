import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { createModalStyles as styles } from '../../create/shared/createModalStyles';
import ScheduleDateFields from '../../create/shared/ScheduleDateFields';
import {
  WEEKDAY_OPTIONS,
  APPLY_SCOPE_FULL_YEAR,
  APPLY_SCOPE_FORWARD,
  normalizeHm,
} from '../../../lib/subjectConfigureSchedule';

function toggleWeekday(current, dayNum) {
  const set = new Set(current || []);
  if (set.has(dayNum)) set.delete(dayNum);
  else set.add(dayNum);
  return [...set].sort((a, b) => a - b);
}

export default function SubjectScheduleFields({
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
  hasExistingBlock = false,
  applyScope,
  onApplyScopeChange,
  showGenerateButton = false,
  onGenerate,
  generating = false,
  generateDisabled = false,
  embeddedInForm = false,
}) {
  return (
    <View>
      {!embeddedInForm ? (
        <>
          <Text style={styles.sectionHeading}>Recurring schedule</Text>
          <Text style={scheduleHelpStyles.helpText}>
            Set when this subject meets, then generate or update planner events on the calendar.
          </Text>
        </>
      ) : (
        <Text style={scheduleHelpStyles.helpTextEmbedded}>
          Set when this subject meets, then generate or update planner events on the calendar.
        </Text>
      )}

      <View style={styles.formGroup}>
        <Text style={styles.fieldLabel}>Days</Text>
        <View style={styles.chipRow}>
          {WEEKDAY_OPTIONS.map(({ num, label }) => {
            const active = weekdays.includes(num);
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
          <TextInput
            value={startTime}
            onChangeText={(text) => onStartTimeChange(normalizeHm(text.replace(/[^\d:]/g, ''), startTime))}
            placeholder="09:00"
            style={styles.fieldInput}
          />
        </View>
        <View style={[styles.scheduleColumn, { flex: 1 }]}>
          <Text style={styles.fieldLabel}>Duration (min)</Text>
          <TextInput
            value={String(durationMinutes)}
            onChangeText={(text) => onDurationMinutesChange(text.replace(/[^\d]/g, ''))}
            placeholder="60"
            keyboardType="numeric"
            style={styles.fieldInput}
          />
        </View>
      </View>

      <ScheduleDateFields
        startDate={startDate}
        onStartDateChange={onStartDateChange}
        endDate={endDate}
        onEndDateChange={onEndDateChange}
        showEndDate
        showTimes={false}
        endDateRequired
        onOpenStartDatePicker={onOpenStartDatePicker}
        onOpenEndDatePicker={onOpenEndDatePicker}
      />

      {hasExistingBlock ? (
        <View style={styles.formGroup}>
          <Text style={styles.fieldLabel}>Apply changes</Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              onPress={() => onApplyScopeChange(APPLY_SCOPE_FORWARD)}
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
              onPress={() => onApplyScopeChange(APPLY_SCOPE_FULL_YEAR)}
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
        </View>
      ) : null}

      {showGenerateButton ? (
        <TouchableOpacity
          style={[
            scheduleHelpStyles.generateBtn,
            (generating || generateDisabled) && scheduleHelpStyles.generateBtnDisabled,
          ]}
          onPress={onGenerate}
          disabled={generating || generateDisabled}
          {...(Platform.OS === 'web' && { cursor: generating || generateDisabled ? 'default' : 'pointer' })}
        >
          <Text style={scheduleHelpStyles.generateBtnText}>
            {generating ? 'Generating…' : 'Generate / update planner events'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const scheduleHelpStyles = {
  helpText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    marginBottom: 16,
  },
  helpTextEmbedded: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    marginBottom: 14,
  },
  generateBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: '#4F46E5',
  },
  generateBtnDisabled: {
    opacity: 0.5,
  },
  generateBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
};
