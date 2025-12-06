import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import { startOfWeek, addDays, isSameDay, format, isSameMonth, isToday } from './utils/date';
import EventChip from '../calendar/EventChip';

export default function WeekGrid({ anchorDate, events = [], onSelectDate, onEventPress, onEventRightClick, onEventComplete }) {
  const scrollViewRef = useRef(null);
  const weekStart = startOfWeek(anchorDate); // Monday start
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Full 24-hour range (0-23, midnight to 11 PM)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const hourHeight = 48; // Reduced from 60px for Google Calendar density
  
  // Auto-scroll to 7 AM on mount
  useEffect(() => {
    if (scrollViewRef.current) {
      const targetHour = 7;
      const scrollPosition = targetHour * hourHeight;
      
      const scrollToPosition = () => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ y: scrollPosition, animated: false });
        }
      };
      
      requestAnimationFrame(() => {
        scrollToPosition();
        setTimeout(scrollToPosition, 50);
        setTimeout(scrollToPosition, 200);
      });
    }
  }, [anchorDate]);
  
  // Parse event time to minutes since midnight
  const getEventMinutes = (event) => {
    const startTime = event.start || event.start_ts || event.start_at || event.start_local;
    if (!startTime) return null;
    
    const eventDate = new Date(startTime);
    if (Number.isNaN(eventDate.getTime())) return null;
    
    return eventDate.getHours() * 60 + eventDate.getMinutes();
  };
  
  // Get event duration in minutes
  const getEventDuration = (event) => {
    const startTime = event.start || event.start_ts || event.start_at || event.start_local;
    const endTime = event.end || event.end_ts || event.end_at || event.end_local;
    
    if (!startTime || !endTime) return 60; // Default 1 hour
    
    const start = new Date(startTime);
    const end = new Date(endTime);
    
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 60;
    
    return Math.max(15, Math.round((end.getTime() - start.getTime()) / 60000)); // Minimum 15 minutes
  };
  
  // Bucket events by day and calculate positions with overlap detection
  const eventsByDay = useMemo(() => {
    const map = new Map();
    
    // Initialize all days
    for (const d of days) {
      map.set(d.toDateString(), []);
    }
    
    // Deduplicate events by ID first
    const seenIds = new Set();
    const uniqueEvents = events.filter(e => {
      if (!e || !e.id) return false;
      if (seenIds.has(e.id)) return false;
      seenIds.add(e.id);
      return true;
    });
    
    // Add events to their respective days with position info
    for (const e of uniqueEvents) {
      const eventDateStr = e.start || e.start_ts || e.start_at || e.start_local;
      if (!eventDateStr) continue;
      
      const eventDate = new Date(eventDateStr);
      if (Number.isNaN(eventDate.getTime())) continue;
      
      for (const d of days) {
        if (isSameDay(eventDate, d)) {
          const startMinutes = getEventMinutes(e);
          const duration = getEventDuration(e);
          
          if (startMinutes !== null) {
            map.get(d.toDateString()).push({
              ...e,
              startMinutes,
              duration,
              endMinutes: startMinutes + duration,
            });
          }
          break; // Only add to one day
        }
      }
    }
    
    // Sort events by start time within each day
    for (const [dayKey, dayEvents] of map.entries()) {
      dayEvents.sort((a, b) => a.startMinutes - b.startMinutes);
    }
    
    return map;
  }, [events, anchorDate, days]);
  
  // Calculate overlap groups and positions for events in a day
  // Uses a more sophisticated algorithm that handles transitive overlaps
  const calculateEventPositions = (dayEvents) => {
    if (dayEvents.length === 0) return [];
    
    // Build overlap graph - events that directly overlap
    const overlapGraph = new Map();
    dayEvents.forEach(event => {
      overlapGraph.set(event.id, []);
    });
    
    dayEvents.forEach(event => {
      dayEvents.forEach(otherEvent => {
        if (event.id === otherEvent.id) return;
        
        // Check if events overlap
        const overlaps = !(
          event.endMinutes <= otherEvent.startMinutes ||
          otherEvent.endMinutes <= event.startMinutes
        );
        
        if (overlaps) {
          overlapGraph.get(event.id).push(otherEvent.id);
        }
      });
    });
    
    // Find connected components (events that overlap directly or transitively)
    const groups = [];
    const processed = new Set();
    
    const findConnectedComponent = (startId) => {
      const component = new Set([startId]);
      const queue = [startId];
      processed.add(startId);
      
      while (queue.length > 0) {
        const currentId = queue.shift();
        const neighbors = overlapGraph.get(currentId) || [];
        
        neighbors.forEach(neighborId => {
          if (!processed.has(neighborId)) {
            component.add(neighborId);
            processed.add(neighborId);
            queue.push(neighborId);
          }
        });
      }
      
      return Array.from(component);
    };
    
    dayEvents.forEach(event => {
      if (!processed.has(event.id)) {
        const componentIds = findConnectedComponent(event.id);
        const component = dayEvents.filter(e => componentIds.includes(e.id));
        if (component.length > 0) {
          groups.push(component);
        }
      }
    });
    
    // Calculate positions for each group
    const positionedEvents = [];
    
    groups.forEach(group => {
      // Sort group by start time, then by duration (shorter first for better packing)
      group.sort((a, b) => {
        if (a.startMinutes !== b.startMinutes) {
          return a.startMinutes - b.startMinutes;
        }
        return a.duration - b.duration;
      });
      
      // For each event in the group, calculate its horizontal position
      // Events are split evenly: 50/50 for 2, 33/33/33 for 3, etc.
      group.forEach((event, index) => {
        const widthPercent = 100 / group.length;
        const leftPercent = (index / group.length) * 100;
        
        positionedEvents.push({
          ...event,
          widthPercent,
          leftPercent,
        });
      });
    });
    
    return positionedEvents;
  };
  
  // Format hour for display (12-hour format)
  const formatHour = (hour) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };
  
  return (
    <View style={styles.container}>
      {/* Fixed Header Row */}
      {Platform.OS === 'web' && typeof window !== 'undefined' ? (
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: '#e5e7eb',
          borderBottomStyle: 'solid',
          backgroundColor: '#ffffff',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}>
          {/* Time column spacer */}
          <div style={{ width: 60, borderRightWidth: 1, borderRightColor: '#e5e7eb', borderRightStyle: 'solid' }} />
          
          {/* Day headers */}
          {days.map(d => (
            <div key={d.toISOString()} style={{ flex: 1, paddingTop: 8, paddingBottom: 8, paddingLeft: 4, paddingRight: 4, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#e5e7eb', borderRightStyle: 'solid', display: 'flex', flexDirection: 'column' }}>
              <Text style={styles.dayName}>
                {format(d, 'EEE').toUpperCase()}
              </Text>
              <Text style={[
                styles.dayNumber,
                isToday(d) && styles.dayNumberToday,
                !isSameMonth(d, anchorDate) && styles.dayNumberOtherMonth
              ]}>
                {format(d, 'd')}
              </Text>
            </div>
          ))}
        </div>
      ) : (
        <View style={styles.headerRow}>
        {/* Time column spacer */}
        <View style={styles.timeColumnSpacer} />
        
        {/* Day headers */}
        {days.map(d => (
          <View key={d.toISOString()} style={styles.dayHeader}>
            <Text style={styles.dayName}>
              {format(d, 'EEE').toUpperCase()}
            </Text>
            <Text style={[
              styles.dayNumber,
              isToday(d) && styles.dayNumberToday,
              !isSameMonth(d, anchorDate) && styles.dayNumberOtherMonth
            ]}>
              {format(d, 'd')}
            </Text>
          </View>
        ))}
      </View>
      )}

      {/* Scrollable Time Grid */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        onContentSizeChange={() => {
          if (scrollViewRef.current) {
            const scrollPosition = 7 * hourHeight;
            scrollViewRef.current.scrollTo({ y: scrollPosition, animated: false });
          }
        }}
      >
        <View style={styles.gridContainer}>
          {/* Time Column */}
          {Platform.OS === 'web' && typeof window !== 'undefined' ? (
            <div style={{
              width: 60,
              borderRightWidth: 1,
              borderRightColor: '#e5e7eb',
              borderRightStyle: 'solid',
              backgroundColor: '#ffffff',
              position: 'sticky',
              left: 0,
              zIndex: 5,
            }}>
              {hours.map(hour => (
                <div
                  key={hour}
                  style={{
                    height: 48,
                    paddingRight: 8,
                    paddingTop: 2,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'flex-start',
                    borderBottomWidth: 1,
                    borderBottomColor: '#f3f4f6',
                    borderBottomStyle: 'solid',
                  }}
                >
                  <Text style={styles.timeText}>
                    {formatHour(hour)}
                  </Text>
                </div>
              ))}
            </div>
          ) : (
            <View style={styles.timeColumn}>
            {hours.map(hour => (
              <View
                key={hour}
                style={styles.timeCell}
              >
                <Text style={styles.timeText}>
                  {formatHour(hour)}
                </Text>
              </View>
            ))}
          </View>
          )}
          
          {/* Day Columns */}
          <View style={styles.dayColumnsContainer}>
            {days.map(d => {
              const key = d.toDateString();
              const dayEvents = eventsByDay.get(key) ?? [];
              const positionedEvents = calculateEventPositions(dayEvents);
              
              return (
                <View
                  key={key}
                  style={styles.dayColumn}
                >
                  {/* Hour grid lines */}
                  {hours.map(hour => (
                    <View
                      key={hour}
                      style={[
                        styles.hourLine,
                        { top: hour * hourHeight }
                      ]}
                    />
                  ))}
                  
                  {/* Half-hour grid lines (subtle) */}
                  {hours.map(hour => (
                    <View
                      key={`half-${hour}`}
                      style={[
                        styles.halfHourLine,
                        { top: (hour * hourHeight) + (hourHeight / 2) }
                      ]}
                    />
                  ))}
                  
                  {/* Events positioned absolutely */}
                  {positionedEvents.map(ev => {
                    const startOffsetMinutes = ev.startMinutes - (hours[0] * 60);
                    const topPx = (startOffsetMinutes / 60) * hourHeight;
                    const heightPx = (ev.duration / 60) * hourHeight;
                    
                    // Only show if within visible hours
                    const eventStartHour = Math.floor(ev.startMinutes / 60);
                    const eventEndHour = Math.ceil(ev.endMinutes / 60);
                    
                    if (eventEndHour < hours[0] || eventStartHour > hours[hours.length - 1] + 1) {
                      return null;
                    }
                    
                    // Use div for web with inline styles, View for native
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      return (
                        <div
                          key={ev.id}
                          style={{
                            position: 'absolute',
                            paddingLeft: 2,
                            paddingRight: 2,
                            paddingTop: 1,
                            paddingBottom: 1,
                            zIndex: 1,
                            cursor: 'pointer',
                            top: Math.max(0, topPx),
                            left: `${ev.leftPercent}%`,
                            width: `${ev.widthPercent}%`,
                            height: Math.max(20, heightPx),
                          }}
                          onClick={(e) => {
                            if (onEventPress) {
                              e.stopPropagation();
                              onEventPress(ev);
                            }
                          }}
                          onContextMenu={(e) => {
                            if (onEventRightClick) {
                              e.preventDefault();
                              e.stopPropagation();
                              onEventRightClick(ev, e);
                            }
                          }}
                        >
                          <EventChip
                            ev={ev}
                            compact={ev.widthPercent < 20}
                            fullWidth={true}
                            hideTime={ev.widthPercent < 15}
                            onPress={onEventPress ? () => onEventPress(ev) : undefined}
                            onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                            onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                            showCheckmark={true}
                          />
                        </div>
                      );
                    }
                    
                    // Native version
                    return (
                      <View
                        key={ev.id}
                        style={[
                          styles.eventBlock,
                          {
                            top: Math.max(0, topPx),
                            left: `${ev.leftPercent}%`,
                            width: `${ev.widthPercent}%`,
                            height: Math.max(20, heightPx),
                          }
                        ]}
                      >
                        <EventChip
                          ev={ev}
                          compact={ev.widthPercent < 20}
                          fullWidth={true}
                          hideTime={ev.widthPercent < 15}
                          onPress={onEventPress ? () => onEventPress(ev) : undefined}
                          onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                          onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                          showCheckmark={true}
                        />
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  timeColumnSpacer: {
    width: 60,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  dayHeader: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
  },
  dayName: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  dayNumberToday: {
    color: '#3b82f6',
  },
  dayNumberOtherMonth: {
    color: '#94a3b8',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  gridContainer: {
    flexDirection: 'row',
    minHeight: 24 * 48, // 24 hours * 48px
  },
  timeColumn: {
    width: 60,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  timeCell: {
    height: 48,
    paddingRight: 8,
    paddingTop: 2,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  timeText: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
  },
  dayColumnsContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  dayColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    position: 'relative',
    minHeight: 24 * 48, // 24 hours * 48px
    backgroundColor: '#ffffff',
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#f3f4f6',
    zIndex: 0,
  },
  halfHourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#fafbfc',
    zIndex: 0,
  },
  eventBlock: {
    position: 'absolute',
    paddingHorizontal: 2,
    paddingVertical: 1,
    zIndex: 1,
  },
});
