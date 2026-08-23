import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import { Plus, CalendarDays, MoreVertical } from 'lucide-react';
import CompletionRing from '../calendar/CompletionRing';
import { colors } from '../../theme/colors';
import { getEventChildIdsForDisplay } from '../../lib/utils/eventChildIds';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import { completeEvent, updateEventStatus } from '../../lib/services/attendanceClient';
import {
  isSharedMultiChildEvent,
  resolveEventDoneStatusForPlanner,
  syncEventDoneStatusAfterAttendanceWrites,
} from '../../lib/attendance/partialAttendance';
import { createAttendanceLog } from '../../lib/services/recordsClient';
import { cleanPlannerEventId } from '../../lib/utils/recurringEventUtils';
import { writeAppSearchParams } from '../../lib/url';

const ATTENDANCE_RING_SIZE = 20;

function ScheduleEventRow({
  event,
  familyChildren = [],
  primaryLabel,
  showTitleSubtitle,
  rawTitle,
  timeLabel,
  hasTimeLabel,
  done,
  showCheck,
  showAttendanceToggle,
  eventChildIds,
  showEventMenu,
  onOpenEvent,
  handleAttendanceToggle,
  handleEventContextMenu,
  formatChildNamesLine,
}) {
  const menuBtnRef = useRef(null);

  const handleEditEvent = () => {
    if (typeof onOpenEvent === 'function') {
      onOpenEvent(event);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: {
            eventId: event.id,
            initialEvent: event,
          },
        })
      );
    }
  };

  const handleOpenEventMenu = (pressEvent) => {
    pressEvent?.stopPropagation?.();
    if (Platform.OS !== 'web') return;
    let nativeEvent = pressEvent?.nativeEvent || pressEvent;
    const node = menuBtnRef.current;
    const el = node?.getBoundingClientRect ? node : node?._nativeNode ?? node?.nativeElement;
    if (el?.getBoundingClientRect) {
      const rect = el.getBoundingClientRect();
      nativeEvent = {
        clientX: rect.right,
        clientY: rect.bottom,
        target: el,
        preventDefault: () => {},
        stopPropagation: () => {},
      };
    }
    handleEventContextMenu(event, nativeEvent);
  };

  return (
    <View
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
        onPress={handleEditEvent}
        activeOpacity={0.7}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <View style={styles.eventRowInner}>
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
                <CompletionRing
                  isDone={done}
                  size={ATTENDANCE_RING_SIZE}
                  pendingBorderColor="rgba(156, 163, 175, 0.45)"
                  onPress={() => handleAttendanceToggle(event)}
                />
              </View>
            ) : (
              <View style={styles.attendanceSpacer} />
            )
          ) : null}
          <View style={styles.detailsCell}>
            <Text
              style={[styles.eventPrimaryTitle, done && styles.eventTitleDone]}
              numberOfLines={1}
            >
              {primaryLabel}
            </Text>
            {showTitleSubtitle ? (
              <Text
                style={[styles.eventSubtitle, done && styles.eventMetaDone]}
                numberOfLines={1}
              >
                {rawTitle}
              </Text>
            ) : null}
            <View style={styles.sublineRow}>
              <Text
                style={[
                  styles.timeText,
                  !hasTimeLabel && styles.timePlaceholderText,
                  done && styles.eventMetaDone,
                ]}
                numberOfLines={1}
              >
                {timeLabel}
              </Text>
              {eventChildIds.length > 0 ? (
                <View style={styles.childLabel}>
                  <ChildAvatarCluster
                    childIds={eventChildIds}
                    familyChildren={familyChildren}
                    size={20}
                    overlap={-9}
                    hideBackground
                  />
                  <Text style={[styles.childLabelText, done && styles.eventMetaDone]} numberOfLines={1}>
                    {formatChildNamesLine(eventChildIds)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>
      {showEventMenu ? (
        <View style={styles.eventMenuWrap}>
          <TouchableOpacity
            ref={menuBtnRef}
            style={styles.eventMenuBtn}
            onPress={handleOpenEventMenu}
            accessibilityRole="button"
            accessibilityLabel={`${primaryLabel} actions`}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <MoreVertical size={16} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

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

      const eventChildIds = getEventChildIdsForDisplay(ev, children);
      const contextChildId = eventChildIds.length === 1 ? String(eventChildIds[0]) : null;
      const isShared = isSharedMultiChildEvent(ev, children);
      const wasDone = attendanceOptimistic[ev.id] !== undefined
        ? attendanceOptimistic[ev.id]
        : resolveEventDoneStatusForPlanner(ev, [], children, contextChildId) === 'done';
      const nextDone = !wasDone;
      const dayKey = String(ev.date_local || ev.start_ts || '').slice(0, 10);
      setAttendanceOptimistic((p) => ({ ...p, [ev.id]: nextDone }));
      const shouldBroadcastGlobalPatch = !isShared || Boolean(contextChildId);
      if (shouldBroadcastGlobalPatch && Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('eventAttendancePatched', {
            detail: { eventId: cleanEventId, status: nextDone ? 'done' : 'scheduled' },
          })
        );
      }

      try {
        if (wasDone) {
          if (isShared && contextChildId) {
            const result = await createAttendanceLog({
              family_id: ev.family_id,
              child_id: contextChildId,
              event_id: cleanEventId,
              day_date: dayKey,
              status: 'absent',
              minutes: 60,
            });
            if (result?.error) throw result.error;
            await syncEventDoneStatusAfterAttendanceWrites(ev, dayKey, [], children);
          } else {
            const { error } = await updateEventStatus(cleanEventId, 'scheduled');
            if (error) throw error;
          }
        } else {
          const { error } = await completeEvent(cleanEventId, null, {
            childId: contextChildId || undefined,
          });
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
        if (shouldBroadcastGlobalPatch && Platform.OS === 'web' && typeof window !== 'undefined') {
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
    [showAttendanceToggle, children]
  );
  const handleEventContextMenu = useCallback((event, nativeEvent) => {
    if (!event?.id || Platform.OS !== 'web' || typeof window === 'undefined') return;
    nativeEvent?.preventDefault?.();
    nativeEvent?.stopPropagation?.();
    let x =
      nativeEvent?.clientX ??
      nativeEvent?.pageX ??
      nativeEvent?.x ??
      nativeEvent?.nativeEvent?.clientX ??
      nativeEvent?.nativeEvent?.pageX ??
      nativeEvent?.nativeEvent?.x;
    let y =
      nativeEvent?.clientY ??
      nativeEvent?.pageY ??
      nativeEvent?.y ??
      nativeEvent?.nativeEvent?.clientY ??
      nativeEvent?.nativeEvent?.pageY ??
      nativeEvent?.nativeEvent?.y;
    if ((x == null || y == null) && nativeEvent?.target?.getBoundingClientRect) {
      const rect = nativeEvent.target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    window.dispatchEvent(
      new CustomEvent('plannerEventContextMenu', {
        detail: { event, position: { x: x ?? 0, y: y ?? 0 } },
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
    <>
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
                    writeAppSearchParams({
                      tab: 'planner',
                      view: 'tasks',
                      section: 'today',
                      date: todayStr,
                    });
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

            return (
              <ScheduleEventRow
                key={event.id}
                event={event}
                familyChildren={children}
                primaryLabel={primaryLabel}
                showTitleSubtitle={showTitleSubtitle}
                rawTitle={rawTitle}
                timeLabel={timeLabel}
                hasTimeLabel={hasTimeLabel}
                done={done}
                showCheck={showCheck}
                showAttendanceToggle={showAttendanceToggle}
                eventChildIds={eventChildIds}
                showEventMenu={!isHoliday}
                onOpenEvent={onOpenEvent}
                handleAttendanceToggle={handleAttendanceToggle}
                handleEventContextMenu={handleEventContextMenu}
                formatChildNamesLine={formatChildNamesLine}
              />
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
          </View>
        </View>
      )}
    </View>
    </>
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
    gap: 12,
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 2,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
      transition: 'border-color 0.12s ease, box-shadow 0.12s ease',
      ':hover': {
        borderColor: '#CBD5E1',
      },
    }),
  },
  eventMenuWrap: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
    alignSelf: 'center',
  },
  eventMenuBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  eventMenuBtnActive: {
    backgroundColor: '#F1F5F9',
  },
  attendanceSpacer: {
    width: ATTENDANCE_RING_SIZE,
    flexShrink: 0,
  },
  attendanceHit: {
    width: ATTENDANCE_RING_SIZE,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  eventRowMain: {
    flex: 1,
    minWidth: 0,
  },
  eventRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minWidth: 0,
  },
  detailsCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-start',
    gap: 3,
  },
  sublineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  childLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  childLabelText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '400',
    flexShrink: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
  timeText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '400',
    flexShrink: 0,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timePlaceholderText: {
    color: '#9ca3af',
  },
  /** Primary row label: subject name or event title */
  eventPrimaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    minWidth: 0,
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      margin: 0,
      padding: 0,
    }),
  },
  /** Secondary line when both subject and a distinct title exist */
  eventSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#64748b',
    lineHeight: 20,
    marginTop: 0,
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
