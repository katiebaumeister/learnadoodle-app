import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Clock, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { getChildColorFromAvatar } from '../../utils/avatarColors';

export default function TodayScheduleCard({
  events = [],
  children = [],
  subjects = [],
  onOpenPlanner,
  onAddBlock,
  suggestedRhythms = [],
  onAddSuggestedRhythm,
}) {
  const [showSuggestedRhythms, setShowSuggestedRhythms] = useState(false);

  const formatTime = (timeString) => {
    if (!timeString) return '';
    // Handle both "HH:MM" and full timestamp formats
    if (timeString.includes('T')) {
      const date = new Date(timeString);
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    // Already formatted as "HH:MM"
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getChildName = (childId) => {
    const child = children.find(c => String(c.id) === String(childId));
    return child?.first_name || child?.name || 'Unknown';
  };

  const getChildColor = (childId) => {
    const child = children.find(c => String(c.id) === String(childId));
    if (!child) return '#94A3B8';
    return getChildColorFromAvatar(child.avatar);
  };

  const getSubjectName = (subjectId) => {
    const subject = subjects.find(s => String(s.id) === String(subjectId));
    return subject?.name || null;
  };

  const getSubjectColor = (subjectId) => {
    const subject = subjects.find(s => String(s.id) === String(subjectId));
    // Use rainbow gradient similar to progress bars
    return '#8B7CF6'; // Default purple
  };

  const hasEvents = events && events.length > 0;
  const [isHovered, setIsHovered] = useState(false);

  return (
    <View 
      style={[
        styles.container,
        Platform.OS === 'web' && isHovered && styles.containerHovered
      ]}
      {...(Platform.OS === 'web' && {
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
      })}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Today's schedule</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={onAddBlock}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={16} color="#64748b" />
            <Text style={styles.addButtonText}>Add event</Text>
          </TouchableOpacity>
        </View>
        {onOpenPlanner && (
          <TouchableOpacity
            style={styles.plannerLink}
            onPress={onOpenPlanner}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.plannerLinkText}>Open Planner</Text>
            <ChevronRight size={16} color="#64748b" />
          </TouchableOpacity>
        )}
      </View>

      {hasEvents ? (
        <View style={styles.eventsList}>
          {events.map((event) => (
            <View key={event.id} style={styles.eventRow}>
              <View style={styles.timeColumn}>
                <Text style={styles.timeText}>{formatTime(event.start_local || event.start_ts)}</Text>
              </View>
              <View style={styles.contentColumn}>
                <Text style={styles.eventTitle}>{event.title}</Text>
                <View style={styles.pillsRow}>
                  {event.child_id && (
                    <View style={[styles.pill, { backgroundColor: getChildColor(event.child_id) + '20' }]}>
                      <Text style={[styles.pillText, { color: getChildColor(event.child_id) }]}>
                        {getChildName(event.child_id)}
                      </Text>
                    </View>
                  )}
                  {event.subject_id && (
                    <View style={[styles.pill, { backgroundColor: getSubjectColor(event.subject_id) + '20' }]}>
                      <Text style={[styles.pillText, { color: getSubjectColor(event.subject_id) }]}>
                        {getSubjectName(event.subject_id)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Plan today</Text>
          <Text style={styles.emptySubtext}>Start with suggested rhythms</Text>
        </View>
      )}

      {suggestedRhythms && suggestedRhythms.length > 0 && (
        <View style={styles.suggestedSection}>
          <TouchableOpacity
            style={styles.suggestedHeader}
            onPress={() => setShowSuggestedRhythms(!showSuggestedRhythms)}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.suggestedTitle}>Need inspiration? Suggested rhythms</Text>
            {showSuggestedRhythms ? (
              <ChevronDown size={16} color="#64748b" />
            ) : (
              <ChevronRight size={16} color="#64748b" />
            )}
          </TouchableOpacity>

          {showSuggestedRhythms && (
            <View style={styles.suggestedList}>
              {suggestedRhythms.slice(0, 4).map((rhythm, index) => (
                <View key={index} style={styles.suggestedItem}>
                  <View style={styles.suggestedItemContent}>
                    <Clock size={14} color="#64748b" />
                    <Text style={styles.suggestedItemText}>{rhythm.time} {rhythm.title}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.suggestedAddButton}
                    onPress={() => onAddSuggestedRhythm && onAddSuggestedRhythm(rhythm)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.suggestedAddButtonText}>Add</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.2s ease',
    } : {
      elevation: 2,
    }),
  },
  containerHovered: {
    ...(Platform.OS === 'web' && {
      transform: [{ translateY: -1 }],
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.08)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'column',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  addButtonText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  plannerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  plannerLinkText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eventsList: {
    gap: 16,
  },
  eventRow: {
    flexDirection: 'row',
    gap: 16,
  },
  timeColumn: {
    width: 80,
  },
  timeText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  contentColumn: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#0f172a',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  pill: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptySubtext: {
    fontSize: 13,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyActions: {
    flexDirection: 'row',
    gap: 12,
  },
  emptyPrimaryButton: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease',
    }),
  },
  emptyPrimaryButtonHovered: {
    ...(Platform.OS === 'web' && {
      backgroundColor: '#1e293b',
    }),
  },
  emptyPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptySecondaryButton: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'background-color 0.2s ease, border-color 0.2s ease',
    }),
  },
  emptySecondaryButtonHovered: {
    ...(Platform.OS === 'web' && {
      backgroundColor: '#F8FAFC',
      borderColor: '#CBD5E1',
    }),
  },
  emptySecondaryButtonText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  suggestedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  suggestedTitle: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedList: {
    gap: 12,
  },
  suggestedItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  suggestedItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  suggestedItemText: {
    fontSize: 13,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  suggestedAddButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  suggestedAddButtonText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
