import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Plus, ChevronRight, FileText } from 'lucide-react';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';

export default function TodayScheduleCard({
  events = [],
  children = [],
  subjects = [],
  onOpenPlanner,
  onAddBlock,
  suggestedRhythms = [],
  onAddSuggestedRhythm,
  noCard = false,
  onTabChange, // Optional: for direct tab navigation
}) {

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

  return (
    <View style={noCard ? styles.contentOnly : styles.container}>
      {!noCard && (
        <View style={styles.header}>
          <Text style={styles.title}>Today's schedule</Text>
          <View style={styles.headerButtons}>
            {(onOpenPlanner || onTabChange) && (
              <TouchableOpacity
                style={styles.viewTodosButton}
                onPress={() => {
                  // Navigate to planner with today's tab in list view (tasks view)
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    const today = new Date();
                    const todayStr = today.toISOString().split('T')[0];
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', 'planner');
                    url.searchParams.set('view', 'tasks');
                    url.searchParams.set('section', 'today');
                    url.searchParams.set('date', todayStr);
                    window.history.replaceState({}, '', url.toString());
                    window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'tasks' }));
                    window.dispatchEvent(new CustomEvent('plannerTasksViewChange', { detail: { section: 'today' } }));
                  }
                  // Use onTabChange if available, otherwise fall back to onOpenPlanner
                  if (onTabChange) {
                    onTabChange('planner');
                  } else if (onOpenPlanner) {
                    onOpenPlanner();
                  }
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.viewTodosButtonText}>View To-Dos</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => {
                if (onAddBlock) {
                  onAddBlock();
                } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  // Dispatch openTaskModal event to open the add event modal
                  window.dispatchEvent(new CustomEvent('openTaskModal', {
                    detail: {
                      date: new Date(),
                      placement: 'calendar',
                    }
                  }));
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={16} color="#6B7280" />
              <Text style={styles.addButtonText}>Add event</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {hasEvents ? (
        <ScrollView 
          style={styles.eventsListContainer}
          contentContainerStyle={styles.eventsList}
          showsVerticalScrollIndicator={false}
        >
          {events.map((event) => {
            const startTime = formatTime(event.start_local || event.start_ts);
            const endTime = event.end_ts || event.end_local ? formatTime(event.end_ts || event.end_local) : null;
            const timeRange = endTime ? `${startTime} - ${endTime}` : startTime;
            const isAssignment = (event.event_type || event.type || '').toLowerCase() === 'assignment';
            
            return (
              <TouchableOpacity
                key={event.id}
                style={styles.eventRow}
                onPress={() => {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openEventModal', {
                      detail: {
                        eventId: event.id,
                        initialEvent: event,
                      }
                    }));
                  }
                }}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <View style={styles.timeColumn}>
                  <Text style={styles.timeText}>{timeRange}</Text>
                </View>
                <View style={styles.contentColumn}>
                  <View style={styles.eventHeader}>
                    {event.subject_id && (
                      <View style={[styles.subjectDot, { backgroundColor: getSubjectColor(event.subject_id) }]} />
                    )}
                    {isAssignment && (
                      <FileText size={12} color={colors.textSecondary} />
                    )}
                  </View>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <View style={styles.pillsRow}>
                    {event.child_id && (
                      <View style={styles.childLabel}>
                        <View style={[styles.childDot, { backgroundColor: getChildColor(event.child_id) }]} />
                        <Text style={styles.childLabelText}>{getChildName(event.child_id)}</Text>
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
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nothing scheduled</Text>
            <Text style={styles.emptySubtext}>Add an event to get started</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
      transition: 'all 0.2s ease',
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      minHeight: 0,
      marginBottom: 0,
    } : {
      elevation: 2,
      marginBottom: 20,
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewTodosButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  viewTodosButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  eventsListContainer: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: 0,
    }),
  },
  eventsList: {
    gap: 16,
  },
  eventRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 8,
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.2s ease',
      '&:hover': {
        backgroundColor: colors.bgSubtle,
      },
    }),
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  childLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  childLabelText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
  emptyStateContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 200, // Ensure minimum height for visibility
    ...(Platform.OS === 'web' && {
      minHeight: 200,
    }),
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptySubtext: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  emptyAddButtonText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
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
    paddingTop: 0,
    borderTopWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    ...(Platform.OS === 'web' && {
      flexShrink: 0,
    }),
  },
  suggestedListContainer: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: 0,
    }),
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
