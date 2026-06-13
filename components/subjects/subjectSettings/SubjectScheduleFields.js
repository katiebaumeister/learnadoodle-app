import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native';
import { createModalStyles as styles } from '../../create/shared/createModalStyles';
import ScheduleDateFields from '../../create/shared/ScheduleDateFields';
import {
  WEEKDAY_OPTIONS,
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
  showRemoveEventsButton = false,
  onRemoveAllEvents,
  removingEvents = false,
  embeddedInForm = false,
}) {
  return (
    <View>
      {!embeddedInForm ? (
        <>
          <Text style={styles.sectionHeading}>Recurring schedule</Text>
          <Text style={scheduleHelpStyles.helpText}>
            Set when this subject meets. Saving applies schedule changes to the planner calendar.
          </Text>
        </>
      ) : (
        <Text style={scheduleHelpStyles.helpTextEmbedded}>
          Set when this subject meets. Saving applies schedule changes to the planner calendar.
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
            onChangeText={(text) => onStartTimeChange(normalizeHm(text.replace(/[^\d:]/g, ''), startTime || ''))}
            placeholder="09:00"
            style={styles.fieldInput}
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

      {showRemoveEventsButton ? (
        <TouchableOpacity
          style={[
            scheduleHelpStyles.removeBtn,
            removingEvents && scheduleHelpStyles.removeBtnDisabled,
          ]}
          onPress={onRemoveAllEvents}
          disabled={removingEvents}
          {...(Platform.OS === 'web' && { cursor: removingEvents ? 'default' : 'pointer' })}
        >
          <Text style={scheduleHelpStyles.removeBtnText}>
            {removingEvents ? 'Removing…' : 'Remove all events'}
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
    marginBottom: 12,
  },
  removeBtn: {
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  removeBtnDisabled: {
    opacity: 0.5,
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  removeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
};
