import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';

/**
 * DatePillRow Component
 * Horizontal scrollable row of date pills
 */
export default function DatePillRow({
  days = 14,
  selectedDate,
  onSelectDate,
  existingOverrides = [],
}) {
  const getUpcomingDays = () => {
    const daysArray = [];
    const today = new Date();
    // Use local date to avoid timezone issues
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    for (let i = 0; i < days; i++) {
      const date = new Date(todayLocal);
      date.setDate(todayLocal.getDate() + i);
      
      // Format date as YYYY-MM-DD using local date components (not UTC)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      daysArray.push({
        date: dateStr,
        dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNumber: date.getDate(),
        month: date.toLocaleDateString('en-US', { month: 'short' }),
      });
    }
    return daysArray;
  };

  const upcomingDays = getUpcomingDays();

  const getOverrideForDate = (dateStr) => {
    return existingOverrides.find(o => o.date === dateStr);
  };

  const getOverrideType = (override) => {
    if (!override) return null;
    switch (override.override_kind) {
      case 'day_off':
        return 'off';
      case 'late_start':
      case 'early_end':
        return 'adjusted';
      default:
        return 'custom';
    }
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {upcomingDays.map((day) => {
        const isSelected = selectedDate === day.date;
        const override = getOverrideForDate(day.date);
        const overrideType = getOverrideType(override);

        return (
          <TouchableOpacity
            key={day.date}
            style={[
              styles.pill,
              isSelected && styles.pillSelected,
              overrideType && styles.pillHasOverride,
            ]}
            onPress={() => onSelectDate(day.date)}
            activeOpacity={0.7}
            {...(Platform.OS === 'web' && {
              cursor: 'pointer',
            })}
          >
            <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
              {day.dayName}
            </Text>
            <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>
              {day.dayNumber}
            </Text>
            {overrideType && (
              <View style={styles.overrideDot} />
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
  },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    minWidth: 60,
    position: 'relative',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      ':hover': {
        backgroundColor: '#f9fafb',
        borderColor: '#d1d5db',
      },
    }),
  },
  pillSelected: {
    backgroundColor: '#e0e7ff',
    borderColor: '#c7d2fe',
  },
  pillHasOverride: {
    borderWidth: 2,
  },
  dayName: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayNameSelected: {
    color: '#4338ca',
  },
  dayNumber: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '600',
    marginTop: 2,
  },
  dayNumberSelected: {
    color: '#4338ca',
  },
  overrideDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#f59e0b',
  },
});
