/**
 * HomeHeroCard
 * 
 * Shared hero card for all role-based home screens.
 * Features: poodle icon, date, forecast title/subtitle, status icons, stat chips.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';
import { Calendar, ListTodo, Calendar as CalendarIcon, FileText, ChevronRight } from 'lucide-react';
import { colors } from '../../theme/colors';

export default function HomeHeroCard({
  date,
  dateLabel,
  title,
  subtitle,
  chips = [],
  onChipPress,
  onParentDigest,
  weatherStatus = 'light',
  studentsWithActivity = [],
  readyCount = 0,
  blockCount = 0,
  backlogCount = 0,
  overdueCount = 0,
  dueTodayOrTomorrow = 0,
  onOpenPlanner,
  onReviewBacklog,
  onViewTodaysTodo, // Optional: callback to view today's to do
  familyName = 'Doodle Family', // Optional: family name for greeting
}) {
  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  };

  const formatDate = (date) => {
    if (dateLabel) return dateLabel;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${dayName}, ${month} ${day}, ${year}`;
  };

  // Animation refs for staggered casino-style appearance
  const stat1Opacity = useRef(new Animated.Value(0)).current;
  const stat1TranslateY = useRef(new Animated.Value(4)).current;
  const stat2Opacity = useRef(new Animated.Value(0)).current;
  const stat2TranslateY = useRef(new Animated.Value(4)).current;
  const stat3Opacity = useRef(new Animated.Value(0)).current;
  const stat3TranslateY = useRef(new Animated.Value(4)).current;
  const stat4Opacity = useRef(new Animated.Value(0)).current;
  const stat4TranslateY = useRef(new Animated.Value(4)).current;

  // Staggered fade-in animation for stats
  useEffect(() => {
    const prefersReducedMotion = () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
      return false;
    };

    if (prefersReducedMotion()) {
      // Set to final values immediately
      stat1Opacity.setValue(1);
      stat1TranslateY.setValue(0);
      stat2Opacity.setValue(1);
      stat2TranslateY.setValue(0);
      stat3Opacity.setValue(1);
      stat3TranslateY.setValue(0);
      stat4Opacity.setValue(1);
      stat4TranslateY.setValue(0);
      return;
    }

    const staggerDelay = 70;
    const duration = 250;

    Animated.parallel([
      Animated.parallel([
        Animated.timing(stat1Opacity, {
          toValue: 1,
          duration,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(stat1TranslateY, {
          toValue: 0,
          duration,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
      Animated.parallel([
        Animated.timing(stat2Opacity, {
          toValue: 1,
          duration,
          delay: staggerDelay,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(stat2TranslateY, {
          toValue: 0,
          duration,
          delay: staggerDelay,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
      Animated.parallel([
        Animated.timing(stat3Opacity, {
          toValue: 1,
          duration,
          delay: staggerDelay * 2,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(stat3TranslateY, {
          toValue: 0,
          duration,
          delay: staggerDelay * 2,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
      Animated.parallel([
        Animated.timing(stat4Opacity, {
          toValue: 1,
          duration,
          delay: staggerDelay * 3,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(stat4TranslateY, {
          toValue: 0,
          duration,
          delay: staggerDelay * 3,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    ]).start();
  }, [date, stat1Opacity, stat1TranslateY, stat2Opacity, stat2TranslateY, stat3Opacity, stat3TranslateY, stat4Opacity, stat4TranslateY]);

  return (
    <View style={styles.container}>
      <View style={styles.heroContent}>
        <View style={styles.headerRow}>
          <View style={styles.greetingBlock}>
            <Text style={styles.greetingText}>{getTimeBasedGreeting()}, {familyName}!</Text>
            <Text style={styles.dateText}>{formatDate(date)}</Text>
          </View>

          {/* Top right button */}
          <TouchableOpacity
            style={styles.viewTodosButton}
            onPress={(e) => {
              e.stopPropagation();
              // View today's to do - scroll to today's schedule or open planner focused on today
              if (onViewTodaysTodo) {
                onViewTodaysTodo();
              } else if (onOpenPlanner) {
                onOpenPlanner();
              }
            }}
            activeOpacity={0.7}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.viewTodosButtonText}>View To-Dos</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 24,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#EEF2F7',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      width: '100%',
    }),
  },
  heroContent: {
    gap: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    ...(Platform.OS === 'web' && {
      display: 'flex',
    }),
  },
  greetingBlock: {
    flex: 1,
    gap: 0,
    alignItems: 'flex-start',
  },
  greetingText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1F2937',
    lineHeight: 28.8, // 1.2 * 24
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '-0.01em',
    }),
  },
  dateText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  weatherStatusText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#9CA3AF',
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      letterSpacing: '0.01em',
    }),
  },
  poodleContainer: {
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }),
  },
  poodleCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(180deg, #F8FBFF 0%, #EEF6FF 100%)',
      display: 'flex',
    }),
    ...(Platform.OS !== 'web' && {
      backgroundColor: '#F8FBFF',
    }),
  },
  poodleIcon: {
    width: 140,
    height: 140,
    opacity: 0.8,
    ...(Platform.OS === 'web' && {
      objectFit: 'contain',
      objectPosition: 'center center',
    }),
  },
  studentActivityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  studentActivityText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  stateIndicatorsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  stateIndicator: {
    fontSize: 13,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  stateIndicatorSeparator: {
    fontSize: 13,
    color: colors.textSecondary,
    opacity: 0.5,
  },
  stateIndicatorOverdue: {
    color: '#F87171', // red for overdue
  },
  stateIndicatorBacklog: {
    color: '#FACC15', // yellow for backlog
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 18,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingVertical: 0,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      cursor: 'pointer',
      '&:hover': {
        backgroundColor: '#F3F4F6',
        borderColor: '#D1D5DB',
      },
    }),
  },
  actionButtonOutline: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      cursor: 'pointer',
    }),
  },
  actionButtonIcon: {
    opacity: 0.7,
  },
  actionButtonText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionButtonTextOutline: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewTodosButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      cursor: 'pointer',
      '&:hover': {
        backgroundColor: '#F1F5F9',
        borderColor: '#D1D5DB',
      },
    }),
  },
  viewTodosButtonText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.border,
      },
    }),
  },
  chipValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  chipLabel: {
    fontSize: 13,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  statItem: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statValueOverdue: {
    color: '#F87171', // red
  },
  statLabelOverdue: {
    color: '#F87171', // red
  },
  statValueBacklog: {
    color: '#FACC15', // yellow
  },
  statLabelBacklog: {
    color: '#FACC15', // yellow
  },
  statValueDueSoon: {
    color: '#60A5FA', // blue
  },
  statLabelDueSoon: {
    color: '#60A5FA', // blue
  },
});
