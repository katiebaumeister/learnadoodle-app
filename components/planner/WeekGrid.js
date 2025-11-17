import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { startOfWeek, addDays, isSameDay, format, isSameMonth, isToday } from './utils/date';
import EventChip from '../calendar/EventChip';

export default function WeekGrid({ anchorDate, events = [], onSelectDate, onEventPress, onEventRightClick, onEventComplete }) {
  const scrollViewRef = useRef(null);
  const weekStart = startOfWeek(anchorDate); // Monday start
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Full 24-hour range (0-23, midnight to 11 PM)
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const hourHeight = 60; // Height per hour in pixels
  
  // Auto-scroll to 7 AM on mount (default view shows 7 AM-7 PM)
  useEffect(() => {
    if (scrollViewRef.current) {
      // Always start at 7 AM (index 7 in hours array)
      const targetHour = 7;
      const scrollPosition = targetHour * hourHeight;
      
      // Use requestAnimationFrame to ensure DOM is ready
      const scrollToPosition = () => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ y: scrollPosition, animated: false });
        }
      };
      
      // Try immediately, then with delays to ensure it works
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
  
  // Bucket events by day and calculate positions
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
              top: startMinutes - (hours[0] * 60), // Offset from first hour
              height: duration
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
  }, [events, anchorDate, hours]);
  
  // Format hour for display (12-hour format)
  const formatHour = (hour) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };
  
  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Header row */}
      <View style={{
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderColor: '#eef2f7',
        backgroundColor: '#fafbfc',
        paddingLeft: 60 // Space for time column
      }}>
        {days.map(d => (
          <View key={d.toISOString()} style={{ flex: 1, padding: 12 }}>
            <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '600', marginBottom: 4 }}>
              {format(d, 'EEE').toUpperCase()}
            </Text>
            <Text style={{
              fontSize: 18,
              fontWeight: '700',
              color: isSameMonth(d, anchorDate) ? '#0f141a' : '#94a3b8'
            }}>
              {format(d, 'd')}
            </Text>
          </View>
        ))}
      </View>

      {/* Scrollable time grid */}
      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={true}
        onContentSizeChange={() => {
          // Scroll to 7 AM when content size changes
          if (scrollViewRef.current) {
            const scrollPosition = 7 * hourHeight; // 7 AM = index 7
            scrollViewRef.current.scrollTo({ y: scrollPosition, animated: false });
          }
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          {/* Time column */}
          <View style={{ width: 60, borderRightWidth: 1, borderRightColor: '#eef2f7' }}>
            {hours.map(hour => (
              <View
                key={hour}
                style={{
                  height: hourHeight,
                  paddingRight: 8,
                  paddingTop: 4,
                  alignItems: 'flex-end',
                  borderBottomWidth: 1,
                  borderBottomColor: '#f3f4f6'
                }}
              >
                <Text style={{ fontSize: 11, color: '#9ca3af', fontWeight: '500' }}>
                  {formatHour(hour)}
                </Text>
              </View>
            ))}
          </View>
          
          {/* Day columns */}
          <View style={{ flex: 1, flexDirection: 'row' }}>
            {days.map(d => {
              const key = d.toDateString();
              const dayEvents = eventsByDay.get(key) ?? [];
              
              return (
                <View
                  key={key}
                  style={{
                    flex: 1,
                    borderRightWidth: d !== days[days.length - 1] ? 1 : 0,
                    borderRightColor: '#eef2f7',
                    position: 'relative',
                    minHeight: hours.length * hourHeight
                  }}
                >
                  {/* Hour lines */}
                  {hours.map(hour => (
                    <View
                      key={hour}
                      style={{
                        position: 'absolute',
                        top: (hour - hours[0]) * hourHeight,
                        left: 0,
                        right: 0,
                        height: 1,
                        backgroundColor: '#f3f4f6',
                        zIndex: 0
                      }}
                    />
                  ))}
                  
                  {/* Events positioned by time with lane-based overlap handling */}
                  {(() => {
                    // Lane-based algorithm for overlapping events
                    // Assign each event to a lane based on overlaps
                    const lanes = [];
                    
                    // Sort events by start time, then by duration (shorter first for better packing)
                    const sortedEvents = [...dayEvents].sort((a, b) => {
                      if (a.startMinutes !== b.startMinutes) {
                        return a.startMinutes - b.startMinutes;
                      }
                      return a.duration - b.duration;
                    });
                    
                    // Assign events to lanes
                    sortedEvents.forEach(ev => {
                      const evEnd = ev.startMinutes + ev.duration;
                      let assignedLane = -1;
                      
                      // Find the first lane where this event doesn't overlap with existing events
                      for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
                        const laneEvents = lanes[laneIndex];
                        const hasOverlap = laneEvents.some(laneEv => {
                          const laneEvEnd = laneEv.startMinutes + laneEv.duration;
                          return ev.startMinutes < laneEvEnd && evEnd > laneEv.startMinutes;
                        });
                        
                        if (!hasOverlap) {
                          assignedLane = laneIndex;
                          break;
                        }
                      }
                      
                      // If no suitable lane found, create a new one
                      if (assignedLane === -1) {
                        assignedLane = lanes.length;
                        lanes.push([]);
                      }
                      
                      lanes[assignedLane].push(ev);
                    });
                    
                    // Calculate max lanes needed at any point (for width calculation)
                    const getMaxLanesAtTime = (time) => {
                      let maxLanes = 0;
                      lanes.forEach(lane => {
                        const activeInLane = lane.some(ev => {
                          const evEnd = ev.startMinutes + ev.duration;
                          return ev.startMinutes <= time && evEnd > time;
                        });
                        if (activeInLane) maxLanes++;
                      });
                      return maxLanes;
                    };
                    
                    // Render events with calculated positions
                    return sortedEvents.map(ev => {
                      const startOffsetMinutes = ev.startMinutes - (hours[0] * 60);
                      const topPx = startOffsetMinutes * (hourHeight / 60);
                      const heightPx = ev.duration * (hourHeight / 60);
                      
                      // Only show if within visible hours
                      const eventStartHour = Math.floor(ev.startMinutes / 60);
                      const eventEndHour = Math.ceil((ev.startMinutes + ev.duration) / 60);
                      
                      if (eventEndHour < hours[0] || eventStartHour > hours[hours.length - 1] + 1) {
                        return null;
                      }
                      
                      // Find which lane this event is in
                      let laneIndex = -1;
                      for (let i = 0; i < lanes.length; i++) {
                        if (lanes[i].includes(ev)) {
                          laneIndex = i;
                          break;
                        }
                      }
                      
                      // Calculate max concurrent lanes during this event's entire duration
                      // Check multiple points to find the true maximum
                      const checkPoints = [
                        ev.startMinutes,
                        ev.startMinutes + (ev.duration / 3),
                        ev.startMinutes + (ev.duration * 2 / 3),
                        ev.startMinutes + ev.duration - 1
                      ];
                      const maxLanes = Math.max(...checkPoints.map(t => getMaxLanesAtTime(t)));
                      
                      // Calculate width and position based on lane
                      // Each event takes up 1/maxLanes of the width
                      const widthPercent = maxLanes > 0 ? (100 / maxLanes) : 100;
                      const leftOffset = laneIndex >= 0 ? (laneIndex * widthPercent) : 0;
                      
                      // Estimate minimum width needed for text (roughly 80px for title + time)
                      // If event is too narrow, use compact mode or hide text
                      const estimatedMinWidth = 80; // pixels
                      const isTooNarrow = widthPercent < 15; // Less than 15% width (roughly < 80px on typical screens)
                      const isVeryNarrow = widthPercent < 8; // Less than 8% width - hide text entirely
                      
                      return (
                        <View
                          key={ev.id}
                          style={{
                            position: 'absolute',
                            top: Math.max(0, topPx),
                            left: `${leftOffset}%`,
                            width: `${widthPercent}%`,
                            paddingLeft: 2,
                            paddingRight: 2,
                            height: Math.max(24, heightPx),
                            zIndex: 1
                          }}
                        >
                          {isVeryNarrow ? (
                            // Very narrow: just show a colored bar with checkmark
                            <View
                              style={{
                                width: '100%',
                                height: '100%',
                                backgroundColor: ev.color === 'teal' ? 'rgba(20, 184, 166, 0.25)' :
                                                ev.color === 'violet' ? 'rgba(139, 92, 246, 0.25)' :
                                                ev.color === 'amber' ? 'rgba(245, 158, 11, 0.25)' :
                                                ev.color === 'sky' ? 'rgba(14, 165, 233, 0.25)' :
                                                'rgba(20, 184, 166, 0.25)',
                                borderWidth: 1,
                                borderColor: ev.color === 'teal' ? 'rgba(20, 184, 166, 0.3)' :
                                            ev.color === 'violet' ? 'rgba(139, 92, 246, 0.3)' :
                                            ev.color === 'amber' ? 'rgba(245, 158, 11, 0.3)' :
                                            ev.color === 'sky' ? 'rgba(14, 165, 233, 0.3)' :
                                            'rgba(20, 184, 166, 0.3)',
                                borderRadius: 4,
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: ev.status === 'done' ? 0.6 : 1
                              }}
                            >
                              {onEventComplete && (
                                <View>
                                  {ev.status === 'done' ? (
                                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10b981' }} />
                                  ) : (
                                    <View style={{ width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)' }} />
                                  )}
                                </View>
                              )}
                            </View>
                          ) : (
                            <EventChip
                              ev={ev}
                              compact={isTooNarrow}
                              fullWidth={true}
                              hideTime={isTooNarrow}
                              onPress={onEventPress ? () => onEventPress(ev) : undefined}
                              onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                              onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                              showCheckmark={true}
                            />
                          )}
                        </View>
                      );
                    });
                  })()}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
