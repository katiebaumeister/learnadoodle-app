import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Plus, FileText, Check, CalendarDays } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getEventChildIdsForDisplay } from '../../lib/utils/eventChildIds';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import { completeEvent, updateEventStatus } from '../../lib/services/attendanceClient';
import { cleanPlannerEventId } from '../../lib/utils/recurringEventUtils';

export default function TodayScheduleCard({
  events = [],
  children = [],
  subjects = [],
  onOpenPlanner,
  onOpenEvent,
  onAddBlock,
  suggestedRhythms = [],
  onAddSuggestedRhythm,
  noCard = false,
  onTabChange, // Optional: for direct tab navigation
  /** When true, show attendance checkboxes (same backend as planner). */
  showAttendanceToggle = true,
  hideSubjectDot = false,
}) {
  /** Optimistic done state by event id until server props catch up */
  const [attendanceOptimistic, setAttendanceOptimistic] = useState({});

  useEffect(() => {
    setAttendanceOptimistic((prev) => {
      if (!events?.length || !Object.keys(prev).length) return prev;
      const next = { ...prev };
      let changed = false;
      for (const ev of events) {
        if (!ev?.id || next[ev.id] === undefined) continue;
        const serverDone = ev.status === 'done';
        if (serverDone === next[ev.id]) {
          delete next[ev.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [events]);

  const isEventDone = useCallback(
    (ev) => {
      if (!ev?.id) return false;
      if (attendanceOptimistic[ev.id] !== undefined) return attendanceOptimistic[ev.id];
      const normalized = String(ev.status || '').trim().toLowerCase();
      return normalized === 'done' || normalized === 'completed' || normalized === 'present';
    },
    [attendanceOptimistic]
  );

  const handleAttendanceToggle = useCallback(
    async (ev) => {
      if (!showAttendanceToggle || !ev?.id) return;
      const et = (ev.event_type || ev.type || '').toLowerCase();
      if (et === 'holiday') return;
      const cleanEventId = cleanPlannerEventId(String(ev.id || ''));
      if (!cleanEventId) return;

      const wasDone = isEventDone(ev);
      const nextDone = !wasDone;
      setAttendanceOptimistic((p) => ({ ...p, [ev.id]: nextDone }));
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('eventAttendancePatched', {
            detail: { eventId: cleanEventId, status: nextDone ? 'done' : 'scheduled' },
          })
        );
      }

      try {
        if (wasDone) {
          const { error } = await updateEventStatus(cleanEventId, 'scheduled');
          if (error) throw error;
        } else {
          const { error } = await completeEvent(cleanEventId);
          if (error) throw error;
        }
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('refreshCalendar', {
              detail: { skipCacheClear: true },
            })
          );
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
        }
      } catch (err) {
        setAttendanceOptimistic((p) => {
          const n = { ...p };
          delete n[ev.id];
          return n;
        });
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('eventAttendancePatched', {
              detail: { eventId: cleanEventId, status: wasDone ? 'done' : 'scheduled' },
            })
          );
        }
        if (Platform.OS === 'web') {
          window.alert?.(`Could not update attendance: ${err?.message || err}`);
        }
      }
    },
    [showAttendanceToggle, isEventDone]
  );
  const handleEventContextMenu = useCallback((event, nativeEvent) => {
    if (!event?.id || Platform.OS !== 'web' || typeof window === 'undefined') return;
    nativeEvent?.preventDefault?.();
    nativeEvent?.stopPropagation?.();
    const x = nativeEvent?.clientX ?? nativeEvent?.nativeEvent?.clientX ?? 0;
    const y = nativeEvent?.clientY ?? nativeEvent?.nativeEvent?.clientY ?? 0;
    window.dispatchEvent(
      new CustomEvent('plannerEventContextMenu', {
        detail: { event, position: { x, y } },
      })
    );
  }, []);

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

  const formatChildNamesLine = (childIds) => {
    if (childIds.length === 0) return '';
    return childIds.map((id) => getChildName(id)).join(', ');
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
            const eventTypeRaw = String(event?.event_type || event?.type || '').trim();
            const isIntrinsicAllDayType = ['Project', 'Trip', 'Holiday', 'Other'].includes(eventTypeRaw);
            const isMidnightBounded =
              !!(event?.start_ts || event?.start) &&
              !!(event?.end_ts || event?.end) &&
              (() => {
                const start = new Date(event.start_ts || event.start);
                const end = new Date(event.end_ts || event.end);
                if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
                const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0;
                const endsAtMidnight = end.getHours() === 0 && end.getMinutes() === 0;
                const endsAtEndOfDay = end.getHours() === 23 && end.getMinutes() === 59;
                return startsAtMidnight && (endsAtMidnight || endsAtEndOfDay);
              })();
            const isTimeless = event?.is_flexible === true || (!isIntrinsicAllDayType && isMidnightBounded);
            const eventChildIds = getEventChildIdsForDisplay(event, children);
            const startTime = isTimeless ? '' : formatTime(event.start_local || event.start_ts);
            const endTime = isTimeless ? null : (event.end_ts || event.end_local ? formatTime(event.end_ts || event.end_local) : null);
            const timeRange = startTime ? (endTime ? `${startTime} - ${endTime}` : startTime) : '';
            const hasTimeLabel = Boolean(timeRange);
            const timeLabel = hasTimeLabel ? timeRange : 'No time added';
            const isAssignment = (event.event_type || event.type || '').toLowerCase() === 'assignment';
            const isHoliday = (event.event_type || event.type || '').toLowerCase() === 'holiday';
            const done = isEventDone(event);
            const showCheck = showAttendanceToggle && !isHoliday;
            const subjectName = event.subject_id ? getSubjectName(event.subject_id) : null;
            const rawTitle = (event.title || '').trim();
            const primaryLabel = subjectName || rawTitle || 'Event';
            const showTitleSubtitle =
              Boolean(
                subjectName &&
                  rawTitle &&
                  rawTitle.toLowerCase() !== String(subjectName).toLowerCase()
              );
            /** Subject chip only if we could not resolve a name for the headline */
            const showSubjectPill = Boolean(event.subject_id && !subjectName);

            return (
              <View
                key={event.id}
                style={styles.eventRow}
                {...(Platform.OS === 'web' && {
                  'data-event-id': String(event?.id || ''),
                  onMouseDown: (e) => {
                    const button = e?.button ?? e?.nativeEvent?.button;
                    if (button !== 2) return;
                    e.preventDefault?.();
                    e.stopPropagation?.();
                    handleEventContextMenu(event, e?.nativeEvent || e);
                  },
                  onContextMenu: (e) => {
                    e.preventDefault?.();
                    e.stopPropagation?.();
                    handleEventContextMenu(event, e?.nativeEvent || e);
                  },
                })}
              >
                <TouchableOpacity
                  style={styles.eventRowMain}
                  onPress={() => {
                    if (typeof onOpenEvent === 'function') {
                      onOpenEvent(event);
                      return;
                    }
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
                    <Text style={[styles.timeText, !hasTimeLabel && styles.timePlaceholderText]}>{timeLabel}</Text>
                  </View>
                  <View style={styles.contentColumn}>
                    <View style={styles.titleRow}>
                      {(event.subject_id || isAssignment) ? (
                        <View style={styles.eventHeader}>
                          {event.subject_id && !hideSubjectDot && (
                            <View style={[styles.subjectDot, { backgroundColor: getSubjectColor(event.subject_id) }]} />
                          )}
                          {isAssignment && (
                            <FileText size={12} color={colors.textSecondary} />
                          )}
                        </View>
                      ) : null}
                      <View style={styles.titleStack}>
                        <Text
                          style={styles.eventPrimaryTitle}
                          numberOfLines={2}
                        >
                          {primaryLabel}
                        </Text>
                        {showTitleSubtitle ? (
                          <Text
                            style={styles.eventSubtitle}
                            numberOfLines={2}
                          >
                            {rawTitle}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.pillsRow}>
                      {eventChildIds.length > 0 && (
                        <View style={styles.childLabel}>
                          <ChildAvatarCluster
                            childIds={eventChildIds}
                            familyChildren={children}
                            size={28}
                            overlap={-8}
                          />
                          <Text style={styles.childLabelText}>
                            {formatChildNamesLine(eventChildIds)}
                          </Text>
                        </View>
                      )}
                      {showSubjectPill ? (
                        <View style={[styles.pill, { backgroundColor: getSubjectColor(event.subject_id) + '20' }]}>
                          <Text style={[styles.pillText, { color: getSubjectColor(event.subject_id) }]}>
                            {getSubjectName(event.subject_id)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
                {showAttendanceToggle ? (
                  showCheck ? (
                    <View
                      {...(Platform.OS === 'web' && typeof window !== 'undefined'
                        ? {
                            onClick: (e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              handleAttendanceToggle(event);
                            },
                            onMouseDown: (e) => e.stopPropagation(),
                          }
                        : {})}
                      style={styles.attendanceHit}
                    >
                      <TouchableOpacity
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          handleAttendanceToggle(event);
                        }}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        style={styles.attendanceInner}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        {done ? (
                          <View style={styles.attendanceChecked}>
                            <Check size={12} color="#FFFFFF" strokeWidth={2.5} />
                          </View>
                        ) : (
                          <View style={styles.attendanceUnchecked} />
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.attendanceSpacer} />
                  )
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={[styles.emptyStateContainer, noCard && styles.emptyStateContainerEmbedded]}>
          <View style={styles.emptyState}>
            <View style={styles.emptyIllustration}>
              <CalendarDays size={28} color="#94a3b8" strokeWidth={1.75} />
            </View>
            <Text style={styles.emptyTitle}>Nothing scheduled</Text>
            <TouchableOpacity
              style={styles.emptyPrimaryCta}
              onPress={() => {
                if (onAddBlock) {
                  onAddBlock();
                } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('openTaskModal', {
                      detail: { date: new Date(), placement: 'calendar' },
                    })
                  );
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={18} color="#fff" strokeWidth={2.5} />
              <Text style={styles.emptyPrimaryCtaText}>Add event</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contentOnly: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.09)',
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
    alignItems: 'flex-start',
    paddingTop: 6,
    marginBottom: 12,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    marginTop: 5,
    letterSpacing: 0.1,
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
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    ...(Platform.OS === 'web' && {
      transition: 'background-color 0.2s ease',
      '&:hover': {
        backgroundColor: colors.bgSubtle,
      },
    }),
  },
  attendanceSpacer: {
    width: 36,
    flexShrink: 0,
  },
  attendanceHit: {
    width: 36,
    flexShrink: 0,
    alignItems: 'center',
    paddingTop: 2,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  attendanceInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceUnchecked: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(156, 163, 175, 0.45)',
    backgroundColor: 'transparent',
  },
  attendanceChecked: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventRowMain: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: 16,
    minWidth: 0,
  },
  eventTitleDone: {
    textDecorationLine: 'line-through',
    opacity: 0.55,
    ...(Platform.OS === 'web' && {
      textDecorationThickness: '0.5px',
      textDecorationColor: 'rgba(15, 23, 42, 0.35)',
    }),
  },
  eventMetaDone: {
    opacity: 0.55,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    flex: 1,
    minWidth: 0,
    marginBottom: 4,
  },
  titleStack: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'column',
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 3,
    flexShrink: 0,
  },
  subjectDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  childLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  childLabelText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '400',
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timeColumn: {
    width: 80,
    alignSelf: 'flex-start',
  },
  timeText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timePlaceholderText: {
    color: '#9ca3af',
  },
  contentColumn: {
    flex: 1,
  },
  /** Primary row label: subject name or event title */
  eventPrimaryTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    minWidth: 0,
    letterSpacing: -0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Secondary line when both subject and a distinct title exist */
  eventSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#64748b',
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    minHeight: 148,
    ...(Platform.OS === 'web' && {
      minHeight: 148,
    }),
  },
  emptyStateContainerEmbedded: {
    minHeight: 132,
    ...(Platform.OS === 'web' && {
      minHeight: 132,
    }),
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  emptyIllustration: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  /** Empty state — status message, not a headline */
  emptyTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#94a3b8',
    marginBottom: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyPrimaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#111827',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.12)',
    }),
  },
  emptyPrimaryCtaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
