import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MaskedTimeInput from '../../ui/MaskedTimeInput';
import { createModalStyles as styles, FG, PLACEHOLDER } from './createModalStyles';
import { addDays, fmtDate } from '../../../lib/create/eventTimeUtils';

export default function ScheduleDateFields({
  startDate,
  onStartDateChange,
  endDate = null,
  onEndDateChange = null,
  showEndDate = false,
  startTime = '',
  onStartTimeChange = null,
  endTime = '',
  onEndTimeChange = null,
  showTimes = true,
  showEndTime = true,
  onOpenStartDatePicker = null,
  onOpenEndDatePicker = null,
  startDateError = null,
  endDateError = null,
  timeError = null,
  trailingContent = null,
  matchEventModalDateWidth = false,
  timeColumnStyle = null,
  trailingColumnStyle = null,
  endDateRequired = false,
}) {
  const handleStartPrev = () => onStartDateChange?.(addDays(startDate, -1));
  const handleStartNext = () => onStartDateChange?.(addDays(startDate, 1));
  const dateColumnStyle = matchEventModalDateWidth
    ? styles.scheduleColumnEventDate
    : styles.scheduleColumn;
  const startTimeColumnStyle = timeColumnStyle || styles.scheduleColumn;
  const trailingWrapStyle = trailingColumnStyle || styles.scheduleTrailingColumn;

  return (
    <View style={styles.formGroup}>
      <View style={styles.dateTimeInlineRow}>
        <View style={dateColumnStyle}>
          <Text style={styles.fieldLabel}>Start date <Text style={styles.required}>*</Text></Text>
          <View style={[styles.chip, styles.scheduleDateChip, startDateError && { borderColor: '#ef4444' }]}>
            <TouchableOpacity onPress={handleStartPrev}>
              <ChevronLeft size={16} color={FG} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onOpenStartDatePicker?.()}
              style={styles.scheduleDateChipLabel}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.scheduleDateChipText} numberOfLines={1}>
                {fmtDate(startDate)}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleStartNext}>
              <ChevronRight size={16} color={FG} />
            </TouchableOpacity>
          </View>
          {startDateError ? <Text style={styles.errorTextSmall}>{startDateError}</Text> : null}
        </View>

        {showEndDate && onEndDateChange ? (
          <View style={dateColumnStyle}>
            <Text style={styles.fieldLabel}>
              End date
              {endDateRequired ? <Text style={styles.required}> *</Text> : null}
            </Text>
            <View style={[styles.chip, styles.scheduleDateChip, endDateError && { borderColor: '#ef4444' }]}>
              <TouchableOpacity onPress={() => endDate && onEndDateChange?.(addDays(endDate, -1))}>
                <ChevronLeft size={16} color={FG} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onOpenEndDatePicker?.()}
                style={styles.scheduleDateChipLabel}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text
                  style={[styles.scheduleDateChipText, !endDate && { color: PLACEHOLDER }]}
                  numberOfLines={1}
                >
                  {endDate ? fmtDate(endDate) : 'Optional'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onEndDateChange?.(addDays(endDate || startDate, 1))}>
                <ChevronRight size={16} color={FG} />
              </TouchableOpacity>
            </View>
            {endDateError ? <Text style={styles.errorTextSmall}>{endDateError}</Text> : null}
          </View>
        ) : null}

        {showTimes && onStartTimeChange && (showEndTime ? onEndTimeChange : true) ? (
          <>
            <View style={startTimeColumnStyle}>
              <Text style={styles.fieldLabel}>Start time</Text>
              <MaskedTimeInput
                value={startTime}
                onChangeText={onStartTimeChange}
                placeholder="Optional"
                placeholderTextColor={PLACEHOLDER}
                wrapStyle={styles.scheduleTimeInputWrap}
                hasError={!!timeError}
              />
            </View>
            {showEndTime && onEndTimeChange ? (
              <View style={styles.scheduleColumn}>
                <Text style={styles.fieldLabel}>End time</Text>
                <MaskedTimeInput
                  value={endTime}
                  onChangeText={onEndTimeChange}
                  placeholder="Optional"
                  placeholderTextColor={PLACEHOLDER}
                  wrapStyle={styles.scheduleTimeInputWrap}
                  hasError={!!timeError}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {trailingContent ? (
          <View style={trailingWrapStyle}>
            {trailingContent}
          </View>
        ) : null}
      </View>
      {timeError ? <Text style={styles.errorTextSmall}>{timeError}</Text> : null}
    </View>
  );
}

export function SingleDateField({
  label,
  date,
  onDateChange,
  onOpenDatePicker,
  required = false,
  error = null,
  optionalLabel = 'Optional',
  compact = false,
}) {
  const anchorDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();

  return (
    <View style={styles.formGroup}>
      <View style={styles.dateTimeInlineRow}>
        <View style={compact ? styles.scheduleColumnCompact : styles.scheduleColumn}>
          <Text style={styles.fieldLabel}>
            {label}
            {required ? <Text style={styles.required}> *</Text> : null}
          </Text>
          <View
            style={[
              styles.chip,
              styles.scheduleDateChip,
              compact && styles.scheduleDateChipCompact,
              error && { borderColor: '#ef4444' },
            ]}
          >
            <TouchableOpacity onPress={() => onDateChange?.(addDays(anchorDate, -1))}>
              <ChevronLeft size={16} color={FG} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onOpenDatePicker?.()}
              style={[styles.scheduleDateChipLabel, compact && styles.scheduleDateChipLabelCompact]}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text
                style={[
                  styles.chipText,
                  !date && { color: PLACEHOLDER },
                  compact && styles.scheduleDateChipTextCompact,
                ]}
                numberOfLines={1}
              >
                {date ? fmtDate(date) : optionalLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onDateChange?.(addDays(anchorDate, 1))}>
              <ChevronRight size={16} color={FG} />
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.errorTextSmall}>{error}</Text> : null}
        </View>
      </View>
    </View>
  );
}
