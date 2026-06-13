import React from 'react';
import { View, Text, TouchableOpacity, TextInput, Platform } from 'react-native';
import { createModalStyles as styles, PLACEHOLDER, FG } from './createModalStyles';
import { fmtDate } from '../../../lib/create/eventTimeUtils';
import { RECURRENCE_WEEKDAY_OPTIONS } from '../../../lib/create/saveEventHelpers';

const PATTERN_OPTIONS = ['daily', 'weekly', 'monthly'];
const END_OPTIONS = [
  { id: 'never', label: 'Never' },
  { id: 'after', label: 'After' },
  { id: 'on', label: 'On date' },
];

export default function EventRecurrenceFields({
  recurrenceType,
  onRecurrenceTypeChange,
  recurrenceWeekdays,
  onRecurrenceWeekdaysChange,
  recurrenceEndType,
  onRecurrenceEndTypeChange,
  recurrenceEndAfterText,
  onRecurrenceEndAfterTextChange,
  recurrenceEndDate,
  onOpenRecurrenceEndDatePicker,
  errors = {},
}) {
  const toggleWeekday = (dayValue) => {
    onRecurrenceWeekdaysChange((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      if (current.includes(dayValue)) {
        return current.filter((value) => value !== dayValue);
      }
      return [...current, dayValue];
    });
  };

  return (
    <View style={styles.recurringSectionContent}>
      <View style={styles.repeatGrid}>
        <View style={[styles.repeatGroup, styles.repeatGroupPattern]}>
          <Text style={styles.recurrenceGroupLabel}>Repeat pattern</Text>
          <View style={styles.chipRow}>
            {PATTERN_OPTIONS.map((type) => (
              <TouchableOpacity
                key={type}
                onPress={() => onRecurrenceTypeChange(type)}
                style={[
                  styles.dropdownOption,
                  recurrenceType === type && styles.dropdownOptionActive,
                ]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    recurrenceType === type && styles.dropdownOptionTextActive,
                  ]}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.repeatGroup, styles.repeatGroupDays]}>
          <Text style={styles.recurrenceGroupLabel}>Repeats on</Text>
          {recurrenceType === 'weekly' ? (
            <>
              <View style={styles.chipRow}>
                {RECURRENCE_WEEKDAY_OPTIONS.map((day) => {
                  const selected = Array.isArray(recurrenceWeekdays) && recurrenceWeekdays.includes(day.value);
                  return (
                    <TouchableOpacity
                      key={day.value}
                      onPress={() => toggleWeekday(day.value)}
                      style={[
                        styles.dropdownOption,
                        selected && styles.dropdownOptionActive,
                      ]}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          selected && styles.dropdownOptionTextActive,
                        ]}
                      >
                        {day.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {errors.recurrenceWeekdays ? (
                <Text style={styles.errorTextSmall}>{errors.recurrenceWeekdays}</Text>
              ) : null}
            </>
          ) : (
            <View style={styles.repeatDisabledHintWrap}>
              <Text style={styles.fieldHelpText}>Used for weekly repeats.</Text>
            </View>
          )}
        </View>

        <View style={[styles.repeatGroup, styles.repeatGroupEnds]}>
          <Text style={styles.recurrenceGroupLabel}>Ends</Text>
          <View style={styles.chipRow}>
            {END_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option.id}
                onPress={() => onRecurrenceEndTypeChange(option.id)}
                style={[
                  styles.dropdownOption,
                  recurrenceEndType === option.id && styles.dropdownOptionActive,
                ]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    recurrenceEndType === option.id && styles.dropdownOptionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {recurrenceEndType !== 'never' ? (
          <View style={[styles.repeatGroup, styles.repeatGroupEndInput]}>
            <Text style={styles.recurrenceGroupLabel}>
              {recurrenceEndType === 'after' ? 'Occurrences' : 'End date'}
            </Text>
            {recurrenceEndType === 'after' ? (
              <TextInput
                value={recurrenceEndAfterText}
                onChangeText={(text) => {
                  if (text === '' || /^\d+$/.test(text)) {
                    onRecurrenceEndAfterTextChange(text);
                  }
                }}
                keyboardType="numeric"
                placeholder="e.g. 10"
                placeholderTextColor={PLACEHOLDER}
                style={[
                  styles.recurrenceEndInput,
                  errors.recurrenceEnd && styles.recurrenceEndInputError,
                ]}
              />
            ) : (
              <TouchableOpacity
                onPress={onOpenRecurrenceEndDatePicker}
                style={[
                  styles.recurrenceEndDateChip,
                  errors.recurrenceEnd && styles.recurrenceEndDateChipError,
                ]}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={{ color: recurrenceEndDate ? FG : PLACEHOLDER, fontSize: 14, fontWeight: '500' }}>
                  {recurrenceEndDate ? fmtDate(recurrenceEndDate) : 'Pick date'}
                </Text>
              </TouchableOpacity>
            )}
            {errors.recurrenceEnd ? (
              <Text style={styles.errorTextSmall}>{errors.recurrenceEnd}</Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
