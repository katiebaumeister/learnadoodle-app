import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export default function PeriodSwitcher({ 
  currentPeriod, 
  onPeriodChange,
  subjectTrack = null // { start_date, end_date, name }
}) {
  const periods = ['this-week', 'next-week'];
  
  // Add "this-unit" if we have a subject track
  if (subjectTrack && subjectTrack.start_date && subjectTrack.end_date) {
    periods.push('this-unit');
  }

  const getPeriodLabel = (period) => {
    switch (period) {
      case 'this-week':
        return 'This Week';
      case 'next-week':
        return 'Next Week';
      case 'this-unit':
        return subjectTrack?.name || 'This Unit';
      default:
        return period;
    }
  };

  const startOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
    return new Date(d.setDate(diff));
  };

  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const getPeriodDates = (period) => {
    const now = new Date();
    
    switch (period) {
      case 'this-week':
        return {
          start: startOfWeek(now),
          end: addDays(startOfWeek(now), 6)
        };
      case 'next-week':
        return {
          start: addDays(startOfWeek(now), 7),
          end: addDays(startOfWeek(now), 13)
        };
      case 'this-unit':
        if (subjectTrack) {
          return {
            start: new Date(subjectTrack.start_date),
            end: new Date(subjectTrack.end_date)
          };
        }
        return getPeriodDates('this-week');
      default:
        return getPeriodDates('this-week');
    }
  };

  return (
    <View style={styles.container}>
      {periods.map(period => {
        const isActive = currentPeriod === period;
        const dates = getPeriodDates(period);
        
        return (
          <TouchableOpacity
            key={period}
            style={[
              styles.chip,
              isActive && styles.chipActive
            ]}
            onPress={() => onPeriodChange(period, dates)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.chipText,
              isActive && styles.chipTextActive
            ]}>
              {getPeriodLabel(period)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.indigoSoft,
    borderColor: colors.indigoBold,
  },
  chipText: {
    fontSize: 14,
    color: colors.text,
  },
  chipTextActive: {
    fontWeight: '500',
    color: colors.indigoBold,
  },
});

