/**
 * Mobile Card View for Planner
 * Displays events as swipeable cards instead of grid view on mobile devices
 */

import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Clock, Calendar, Users, BookOpen, CheckCircle2, Circle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { format, isSameDay, isToday } from './utils/date';

// Helper to parse ISO date string or Date object
const parseDate = (dateInput) => {
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'string') {
    const d = new Date(dateInput);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

// Helper to format date as yyyy-MM-dd
const formatDateKey = (date) => {
  const d = parseDate(date);
  if (!d) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Helper to get start of day
const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function MobileCardView({
  date,
  events = [],
  onEventPress,
  onEventRightClick,
  onEventComplete,
  selectedDate,
  onSelectDate,
  readOnly = false,
}) {
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' || width < 768;

  // Define getEventTime before useMemo to avoid temporal dead zone
  const getEventTime = (event) => {
    const startTime = event.start || event.start_ts || event.start_at || event.start_local;
    if (!startTime) return 0;
    const dateObj = parseDate(startTime);
    if (!dateObj) return 0;
    return dateObj.getHours() * 60 + dateObj.getMinutes();
  };

  // Group events by date
  const eventsByDate = useMemo(() => {
    const grouped = new Map();
    
    // Initialize with selected date and nearby dates
    const dates = [];
    for (let i = -2; i <= 2; i++) {
      const d = new Date(date);
      d.setDate(d.getDate() + i);
      dates.push(d);
    }
    
    dates.forEach(d => {
      const dateKey = formatDateKey(d);
      grouped.set(dateKey, []);
    });

    // Add events to their dates
    events.forEach(event => {
      const eventDate = event.start || event.start_ts || event.start_at || event.start_local;
      if (!eventDate) return;

      const eventDateObj = parseDate(eventDate);
      if (!eventDateObj) return;

      const dateKey = formatDateKey(eventDateObj);
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey).push(event);
    });

    // Sort events within each date by time
    grouped.forEach((eventsList, dateKey) => {
      eventsList.sort((a, b) => {
        const timeA = getEventTime(a);
        const timeB = getEventTime(b);
        return timeA - timeB;
      });
    });

    return grouped;
  }, [date, events]);

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
  };

  const formatDateHeader = (dateStr) => {
    const date = parseDate(dateStr);
    if (!date) return dateStr;
    const today = startOfDay(new Date());
    const dateDay = startOfDay(date);

    if (isToday(date)) {
      return 'Today';
    }
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (isSameDay(date, tomorrow)) {
      return 'Tomorrow';
    }
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (isSameDay(date, yesterday)) {
      return 'Yesterday';
    }
    return format(date, 'EEEE, MMM d');
  };

  const sortedDates = Array.from(eventsByDate.keys()).sort();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {sortedDates.map(dateKey => {
        const dateEvents = eventsByDate.get(dateKey) || [];
        const dateObj = parseDate(dateKey);
        const isSelected = selectedDate && dateObj && isSameDay(parseDate(selectedDate), dateObj);

        return (
          <View key={dateKey} style={styles.dateSection}>
            <TouchableOpacity
              style={[styles.dateHeader, isSelected && styles.dateHeaderSelected]}
              onPress={() => onSelectDate && onSelectDate(dateKey)}
            >
              <Calendar size={18} color={isSelected ? colors.accent : colors.muted} />
              <Text style={[styles.dateHeaderText, isSelected && styles.dateHeaderTextSelected]}>
                {formatDateHeader(dateKey)}
              </Text>
              <View style={styles.eventCount}>
                <Text style={styles.eventCountText}>{dateEvents.length}</Text>
              </View>
            </TouchableOpacity>

            {dateEvents.length === 0 ? (
              <View style={styles.emptyDay}>
                <Text style={styles.emptyDayText}>No events scheduled</Text>
              </View>
            ) : (
              <View style={styles.eventsList}>
                {dateEvents.map((event, index) => (
                  <EventCard
                    key={event.id || index}
                    event={event}
                    onPress={() => onEventPress && onEventPress(event)}
                    onLongPress={() => onEventRightClick && onEventRightClick(event)}
                    onComplete={readOnly || !onEventComplete ? undefined : () => onEventComplete(event)}
                    formatTime={formatTime}
                    getEventTime={getEventTime}
                  />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function EventCard({ event, onPress, onLongPress, onComplete, formatTime, getEventTime }) {
  const [completed, setCompleted] = useState(event.completed || event.is_complete || false);
  
  const eventTime = getEventTime(event);
  const duration = getEventDuration(event);
  const subjectName = event.subject?.name || event.subject_name || 'Unassigned';
  const childNames = event.children?.map(c => c.name || c.first_name).join(', ') || 
                     event.child_names || 
                     (event.child_id ? 'Child' : 'All');

  const handleComplete = () => {
    const newCompleted = !completed;
    setCompleted(newCompleted);
    if (onComplete) {
      onComplete({ ...event, completed: newCompleted, is_complete: newCompleted });
    }
  };

  return (
    <TouchableOpacity
      style={[styles.eventCard, completed && styles.eventCardCompleted]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.7}
    >
      <View style={styles.eventCardHeader}>
        <View style={styles.eventTimeSection}>
          <Clock size={16} color={colors.accent} />
          <Text style={styles.eventTime}>
            {formatTime(eventTime)}
            {duration > 0 && ` • ${duration} min`}
          </Text>
        </View>
        {onComplete ? (
        <TouchableOpacity
          onPress={handleComplete}
          style={styles.completeButton}
        >
          {completed ? (
            <CheckCircle2 size={20} color={colors.accent} />
          ) : (
            <Circle size={20} color={colors.muted} />
          )}
        </TouchableOpacity>
        ) : null}
      </View>

      <Text style={[styles.eventTitle, completed && styles.eventTitleCompleted]} numberOfLines={2}>
        {event.title || event.name || 'Untitled Event'}
      </Text>

      <View style={styles.eventMeta}>
        {subjectName !== 'Unassigned' && (
          <View style={styles.eventMetaItem}>
            <BookOpen size={14} color={colors.muted} />
            <Text style={styles.eventMetaText}>{subjectName}</Text>
          </View>
        )}
        <View style={styles.eventMetaItem}>
          <Users size={14} color={colors.muted} />
          <Text style={styles.eventMetaText}>{childNames}</Text>
        </View>
      </View>

      {event.description && (
        <Text style={styles.eventDescription} numberOfLines={2}>
          {event.description}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function getEventDuration(event) {
  const startTime = event.start || event.start_ts || event.start_at || event.start_local;
  const endTime = event.end || event.end_ts || event.end_at || event.end_local;
  
  if (!startTime || !endTime) return 0;
  
  const start = parseDate(startTime);
  const end = parseDate(endTime);
  
  if (!start || !end) return 0;
  
  return Math.round((end.getTime() - start.getTime()) / 60000);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  dateSection: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  dateHeaderSelected: {
    borderColor: colors.accent,
    backgroundColor: '#eff6ff',
  },
  dateHeaderText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  dateHeaderTextSelected: {
    color: colors.accent,
  },
  eventCount: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eventCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  emptyDay: {
    padding: 24,
    alignItems: 'center',
  },
  emptyDayText: {
    fontSize: 14,
    color: colors.muted,
  },
  eventsList: {
    gap: 12,
  },
  eventCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  eventCardCompleted: {
    opacity: 0.6,
    backgroundColor: '#f9fafb',
  },
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventTimeSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  eventTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  completeButton: {
    padding: 4,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  eventTitleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.muted,
  },
  eventMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  eventMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  eventMetaText: {
    fontSize: 13,
    color: colors.muted,
  },
  eventDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginTop: 4,
  },
});
