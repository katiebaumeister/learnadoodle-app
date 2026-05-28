import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { startOfWeek, addDays, isSameDay, format, isSameMonth, isToday } from './utils/date';
import EventChip from '../calendar/EventChip';

export default function WeekGrid({ anchorDate, events = [], onSelectDate, onEventPress, onEventRightClick, onEventComplete, children = [], onSwitchToBoardView, busyIntervals = [], suggestedSlots = [], onSlotSelect }) {
  const isPublicHolidayEvent = (ev) =>
    String(ev?.holiday_type || ev?.holidayType || '').toUpperCase() === 'GLOBAL_HOLIDAY';
  const scrollViewRef = useRef(null);
  const weekStart = startOfWeek(anchorDate); // Sunday start
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Visible hours range (6 AM to 6 PM = 13 hours)
  const DAY_START_HOUR = 6; // 6 AM
  const DAY_END_HOUR = 19; // 7 PM (19:00)
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => i + DAY_START_HOUR);
  const hourHeight = 60; // 60px per hour for proper alignment
  const DAY_START_MINUTES = DAY_START_HOUR * 60; // 360 minutes (6 AM)
  
  // Auto-scroll to 7 AM on mount
  useEffect(() => {
    if (scrollViewRef.current) {
      const targetHour = 7;
      const scrollPosition = (targetHour - DAY_START_HOUR) * hourHeight;
      
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
  
  // Parse event time to minutes since midnight, using start_local as primary source
  const getEventMinutes = (event) => {
    // 1) Prefer start_local (time-only or timestamp) as the single source of truth
    if (typeof event.start_local === 'string') {
      const match = event.start_local.match(/(\d{1,2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
      if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2] ?? '0', 10);
        const period = match[3]?.toUpperCase();
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      }
    }
    
    // 2) Fallback: derive from full timestamps if start_local is missing
    const startStr = event.start || event.start_ts || event.start_at;
    if (startStr) {
      const eventDate = new Date(startStr);
      if (!Number.isNaN(eventDate.getTime())) {
        return eventDate.getHours() * 60 + eventDate.getMinutes();
      }
    }
    
    return null;
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
  
  // Expand Project events to show on all days they span (if within a week)
  const expandedEvents = useMemo(() => {
    const expanded = [];
    const seenIds = new Set();
    
    for (const e of events) {
      if (!e || !e.id) continue;
      if (seenIds.has(e.id)) continue;
      seenIds.add(e.id);
      
      // Check if this is a Project event with start and end dates
      if (e.event_type === 'Project' && e.start_ts && e.end_ts) {
        const startDate = new Date(e.start_ts);
        const endDate = new Date(e.end_ts);
        
        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
          // Calculate days difference
          const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // If project spans within a week (7 days or less), expand it
          if (daysDiff <= 7) {
            // Create a copy for each day from start to end
            for (let i = 0; i <= daysDiff; i++) {
              const dayDate = new Date(startDate);
              dayDate.setDate(startDate.getDate() + i);
              
              // Only include days that are in the current week view
              const dayKey = dayDate.toDateString();
              if (days.some(d => d.toDateString() === dayKey)) {
                const expandedEvent = {
                  ...e,
                  id: `${e.id}-day-${i}`, // Unique ID for each day instance
                  _originalId: e.id, // Keep reference to original
                  _dayIndex: i,
                };
                expanded.push(expandedEvent);
              }
            }
            continue; // Skip adding the original event
          }
        }
      }
      
      // For non-Project events or Projects outside the week range, add as-is
      expanded.push(e);
    }
    
    return expanded;
  }, [events, days]);

  // Bucket events by day and calculate positions with overlap detection
  const eventsByDay = useMemo(() => {
    const map = new Map();
    
    // Initialize all days
    for (const d of days) {
      map.set(d.toDateString(), []);
    }
    
    // Add events to their respective days with position info
    for (const e of expandedEvents) {
      // For expanded Project events, use the day from the expansion
      let eventDate;
      if (e._dayIndex !== undefined && e._originalId) {
        // This is an expanded Project event - calculate the date for this day
        const originalStart = new Date(e.start_ts);
        eventDate = new Date(originalStart);
        eventDate.setDate(originalStart.getDate() + e._dayIndex);
      } else {
        // Regular event - use its start time
        const eventDateStr = e.start || e.start_ts || e.start_at || e.start_local;
        if (!eventDateStr) continue;
        eventDate = new Date(eventDateStr);
      }
      
      if (Number.isNaN(eventDate.getTime())) continue;
      
      for (const d of days) {
        if (isSameDay(eventDate, d)) {
          const startMinutes = getEventMinutes(e);
          const duration = getEventDuration(e);

          // If we failed to parse the time for some reason, fall back to noon
          const safeStartMinutes = startMinutes !== null ? startMinutes : 12 * 60; // 12:00 PM

          map.get(d.toDateString()).push({
            ...e,
            startMinutes: safeStartMinutes,
            duration,
            endMinutes: safeStartMinutes + duration,
          });
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
  
  // Calculate event positions based on actual time (proper time-grid alignment)
  const calculateEventPositions = (dayEvents) => {
    if (dayEvents.length === 0) return [];
    
    // Sort events by start time
    const sortedEvents = [...dayEvents].sort((a, b) => a.startMinutes - b.startMinutes);
    
    // Use DAY_START_MINUTES constant (6 AM = 360 minutes)
    const dayStartMinutes = DAY_START_MINUTES;
    
    // Group events by hour for overflow handling
    const eventsByHour = new Map();
    sortedEvents.forEach(event => {
      const eventHour = Math.floor(event.startMinutes / 60);
      if (!eventsByHour.has(eventHour)) {
        eventsByHour.set(eventHour, []);
      }
      eventsByHour.get(eventHour).push(event);
    });
    
    // Process each hour: show max 2 events, rest go to overflow
    const visibleEvents = [];
    const overflowByHourMap = new Map(); // Track overflow per hour
    
    eventsByHour.forEach((hourEvents, hour) => {
      // Sort events in this hour by start time
      hourEvents.sort((a, b) => a.startMinutes - b.startMinutes);
      
      if (hourEvents.length === 1) {
        // Show the single event
        visibleEvents.push(...hourEvents);
      } else if (hourEvents.length === 2) {
        // Show both events if exactly 2
        visibleEvents.push(...hourEvents);
      } else {
        // More than 2 events: show only first 1 event
        visibleEvents.push(hourEvents[0]);
        // Rest go to overflow for this hour
        overflowByHourMap.set(hour, hourEvents.slice(1));
      }
    });
    
    // Stack overlapping events vertically instead of horizontally
    // Group events by overlapping time ranges
    const eventGroups = [];
    
    visibleEvents.forEach(event => {
      // Find which group this event belongs to (overlaps with)
      let addedToGroup = false;
      
      for (const group of eventGroups) {
        // Check if event overlaps with any event in this group
        const overlaps = group.some(e => 
          event.startMinutes < e.endMinutes && event.endMinutes > e.startMinutes
        );
        
        if (overlaps) {
          group.push(event);
          addedToGroup = true;
          break;
        }
      }
      
      // If no overlap found, create new group
      if (!addedToGroup) {
        eventGroups.push([event]);
      }
    });
    
    // Now calculate positions for each visible event - only stack if events actually overlap
    const positionedEvents = [];
    const eventSpacing = 2; // Spacing between stacked events
    
    // Sort visible events by start time to process in order
    const sortedVisibleEvents = [...visibleEvents].sort((a, b) => a.startMinutes - b.startMinutes);
    
    sortedVisibleEvents.forEach(event => {
      // Calculate base top position from actual time
      const minutesFromDayStart = event.startMinutes - dayStartMinutes;
      const baseTopPx = (minutesFromDayStart / 60) * hourHeight;
      const eventEndMinutes = event.startMinutes + event.duration;
      
      // Find if this event overlaps with any already-positioned event
      let stackedTopPx = baseTopPx;
      let maxBottomPx = baseTopPx;
      
      // Check all already-positioned events to see if this one overlaps
      for (const positionedEvent of positionedEvents) {
        const positionedStartMinutes = positionedEvent.startMinutes;
        const positionedEndMinutes = positionedEvent.startMinutes + positionedEvent.duration;
        
        // Check if events overlap in time
        const overlaps = event.startMinutes < positionedEndMinutes && eventEndMinutes > positionedStartMinutes;
        
        if (overlaps) {
          // This event overlaps with an already-positioned event
          // Stack it below the overlapping event
          const positionedBottomPx = positionedEvent.topPx + positionedEvent.heightPx;
          maxBottomPx = Math.max(maxBottomPx, positionedBottomPx);
        }
      }
      
      // If we found overlapping events, stack below them; otherwise use actual time position
      if (maxBottomPx > baseTopPx) {
        stackedTopPx = maxBottomPx + eventSpacing;
      }
      
      // Calculate height based on duration
      const heightPx = Math.max(24, (event.duration / 60) * hourHeight);
      
      positionedEvents.push({
        ...event,
        topPx: Math.max(0, stackedTopPx),
        heightPx,
        widthPercent: 100,
        leftPercent: 0,
        isOverflow: false,
      });
    });
    
    // Add overflow indicators for hours with more than 2 events
    overflowByHourMap.forEach((hourOverflowEvents, hour) => {
      if (hourOverflowEvents.length === 0) return;
      
      // Find the earliest event in this hour's overflow to position the indicator
      const earliestOverflowEvent = hourOverflowEvents.reduce((earliest, event) => 
        event.startMinutes < earliest.startMinutes ? event : earliest
      );
      
      // Position overflow indicator at the same time as first overflow event
      // It will appear below the 2 visible events if they exist at the same time
      const minutesFromDayStart = earliestOverflowEvent.startMinutes - dayStartMinutes;
      const topPx = (minutesFromDayStart / 60) * hourHeight;
      
      // Check if there are visible events at the same time - if so, position overflow below them
      const visibleEventsAtSameTime = visibleEvents.filter(e => {
        const eHour = Math.floor(e.startMinutes / 60);
        return eHour === hour && e.startMinutes === earliestOverflowEvent.startMinutes;
      });
      
      // Adjust top position if visible events exist at same time
      let adjustedTopPx = topPx;
      if (visibleEventsAtSameTime.length > 0) {
        // Position after the visible events (stack below them)
        const maxVisibleEnd = Math.max(...visibleEventsAtSameTime.map(e => {
          const endMin = e.endMinutes || (e.startMinutes + (e.duration || 60));
          return endMin;
        }));
        const minutesFromDayStartAdjusted = maxVisibleEnd - dayStartMinutes;
        adjustedTopPx = (minutesFromDayStartAdjusted / 60) * hourHeight;
      }
      
      // Use a fixed height for overflow indicator
      const heightPx = Math.max(24, hourHeight * 0.5); // Half hour height
      
      positionedEvents.push({
        id: `overflow-${hour}-${earliestOverflowEvent.startMinutes}`,
        topPx: Math.max(0, adjustedTopPx),
        heightPx,
        widthPercent: 100,
        leftPercent: 0,
        isOverflow: true,
        overflowCount: hourOverflowEvents.length,
        overflowEvents: hourOverflowEvents,
      });
    });
    
    return positionedEvents.sort((a, b) => a.topPx - b.topPx);
  };
  
  // Format hour for display (12-hour format)
  const formatHour = (hour) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  };
  
  return (
    <View style={styles.outerContainer}>
    <View style={styles.container}>
      {/* Fixed Header Row */}
      {Platform.OS === 'web' && typeof window !== 'undefined' ? (
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: 'transparent',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          width: '100%',
          maxWidth: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}>
          {/* Time column spacer */}
          <div style={{ width: 60, flexShrink: 0, borderRightWidth: 1, borderRightColor: '#e5e7eb', borderRightStyle: 'solid' }} />
          
          {/* Day headers */}
          {days.map(d => {
            const isWeekend = d.getDay() === 0 || d.getDay() === 6; // Sunday (0) or Saturday (6)
            return (
              <div key={d.toISOString()} style={{ flex: 1, minWidth: 0, paddingTop: 8, paddingBottom: 8, paddingLeft: 4, paddingRight: 4, alignItems: 'center', borderRightWidth: 1, borderRightColor: '#e5e7eb', borderRightStyle: 'solid', display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'transparent' }}>
                <Text style={styles.dayName}>
                  {format(d, 'EEE').toUpperCase()}
                </Text>
                {isToday(d) ? (
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: '14px',
                    backgroundColor: '#111827',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Text style={[
                      styles.dayNumber,
                      { color: '#FFFFFF', fontSize: 14 }
                    ]}>
                      {format(d, 'd')}
                    </Text>
                  </div>
                ) : (
                  <Text style={[
                    styles.dayNumber,
                    !isSameMonth(d, anchorDate) && styles.dayNumberOtherMonth
                  ]}>
                    {format(d, 'd')}
                  </Text>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <View style={styles.headerRow}>
        {/* Time column spacer */}
        <View style={styles.timeColumnSpacer} />
        
        {/* Day headers */}
        {days.map(d => {
          const isWeekend = d.getDay() === 0 || d.getDay() === 6; // Sunday (0) or Saturday (6)
          return (
            <View key={d.toISOString()} style={[styles.dayHeader, { backgroundColor: 'transparent' }]}>
              <Text style={styles.dayName}>
                {format(d, 'EEE').toUpperCase()}
              </Text>
              {isToday(d) ? (
                <View style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: '#111827',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Text style={[
                    styles.dayNumber,
                    { color: '#FFFFFF', fontSize: 14 }
                  ]}>
                    {format(d, 'd')}
                  </Text>
                </View>
              ) : (
                <Text style={[
                  styles.dayNumber,
                  !isSameMonth(d, anchorDate) && styles.dayNumberOtherMonth
                ]}>
                  {format(d, 'd')}
                </Text>
              )}
            </View>
          );
        })}
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
            const scrollPosition = (7 - DAY_START_HOUR) * hourHeight;
            scrollViewRef.current.scrollTo({ y: scrollPosition, animated: false });
          }
        }}
      >
        <View style={styles.gridContainer}>
          {/* Time Column */}
          {Platform.OS === 'web' && typeof window !== 'undefined' ? (
            <div style={{
              width: 60,
              flexShrink: 0,
              flexGrow: 0,
              borderRightWidth: 1,
              borderRightColor: '#e5e7eb',
              borderRightStyle: 'solid',
              backgroundColor: 'transparent',
              position: 'sticky',
              left: 0,
              zIndex: 5,
              overflow: 'hidden',
              boxSizing: 'border-box',
              margin: 0,
              padding: 0,
            }}>
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  style={{
                    height: hourHeight,
                    paddingRight: 8,
                    paddingTop: 0,
                    paddingBottom: 0,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-start',
                    textAlign: 'right',
                    boxSizing: 'border-box',
                    borderTopWidth: index > 0 ? 1 : 0,
                    borderTopColor: '#F3F4F6',
                    borderTopStyle: 'solid',
                    position: 'relative',
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
              const isWeekend = d.getDay() === 0 || d.getDay() === 6; // Sunday (0) or Saturday (6)
              
              return (
                <View
                  key={key}
                  style={[styles.dayColumn, { 
                    backgroundColor: 'transparent'
                  }]}
                  {...(Platform.OS === 'web' && {
                    onMouseEnter: undefined,
                    onMouseLeave: undefined,
                  })}
                >
                  {/* Hour grid lines - positioned at exact hour boundaries */}
                  {hours.map((hour, index) => (
                    <View
                      key={hour}
                      style={[
                        styles.hourLine,
                        { top: index * hourHeight }
                      ]}
                    />
                  ))}
                  
                  {/* Half-hour grid lines (subtle) */}
                  {hours.map((hour, index) => (
                    <View
                      key={`half-${hour}`}
                      style={[
                        styles.halfHourLine,
                        { top: (index * hourHeight) + (hourHeight / 2) }
                      ]}
                    />
                  ))}
                  
                  {/* Busy Interval Overlays */}
                  {busyIntervals.map((interval, idx) => {
                    const startDate = new Date(interval.start_at);
                    const endDate = new Date(interval.end_at);
                    const dayKey = d.toDateString();
                    const intervalDay = startDate.toDateString();
                    
                    // Only render if this interval is on this day
                    if (intervalDay !== dayKey) {
                      if (idx === 0 && busyIntervals.length > 0) {
                        console.log('[WeekGrid] Busy interval date mismatch:', {
                          intervalDay,
                          dayKey,
                          start_at: interval.start_at,
                          dayDate: d.toISOString(),
                        });
                      }
                      return null;
                    }
                    
                    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
                    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
                    const top = ((startMinutes - DAY_START_MINUTES) / 60) * hourHeight;
                    const height = ((endMinutes - startMinutes) / 60) * hourHeight;
                    
                    // Log first interval for debugging
                    if (idx === 0) {
                      console.log('[WeekGrid] Rendering busy interval:', {
                        start_at: interval.start_at,
                        end_at: interval.end_at,
                        startDate: startDate.toISOString(),
                        startMinutes,
                        endMinutes,
                        top,
                        height,
                        dayKey,
                      });
                    }
                    
                    return (
                      <View
                        key={`busy-${idx}`}
                        style={[
                          styles.busyOverlay,
                          {
                            top,
                            height,
                            opacity: interval.is_tentative ? 0.3 : 0.5,
                          }
                        ]}
                      />
                    );
                  })}
                  
                  {/* Suggested Slots */}
                  {suggestedSlots.map((slot, idx) => {
                    const startDate = new Date(slot.start_at);
                    const endDate = new Date(slot.end_at);
                    const dayKey = d.toDateString();
                    const slotDay = startDate.toDateString();
                    
                    // Only render if this slot is on this day
                    if (slotDay !== dayKey) return null;
                    
                    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
                    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
                    const top = ((startMinutes - DAY_START_MINUTES) / 60) * hourHeight;
                    const height = ((endMinutes - startMinutes) / 60) * hourHeight;
                    
                    return (
                      <TouchableOpacity
                        key={`suggested-${idx}`}
                        style={[
                          styles.suggestedSlot,
                          { top, height }
                        ]}
                        onPress={() => onSlotSelect && onSlotSelect(slot)}
                      >
                        <View style={styles.suggestedSlotContent}>
                          <Sparkles size={12} color="#10b981" />
                          <Text style={styles.suggestedSlotText}>Drop here</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                  
                  {/* Events positioned absolutely at their actual times */}
                  {positionedEvents.map(ev => {
                    // Check if event is within visible hours
                    const eventStartHour = Math.floor(ev.startMinutes / 60);
                    const eventEndHour = Math.ceil(ev.endMinutes / 60);
                    
                    if (eventEndHour < hours[0] || eventStartHour > hours[hours.length - 1] + 1) {
                      return null;
                    }
                    
                    // Overflow indicator
                    if (ev.isOverflow) {
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        return (
                          <View
                            key={ev.id}
                            style={{
                              position: 'absolute',
                              left: 4,
                              top: ev.topPx,
                              zIndex: 1,
                              backgroundColor: 'rgba(156, 163, 175, 0.2)',
                              borderRadius: 4,
                              paddingHorizontal: 4,
                              paddingVertical: 2,
                              alignSelf: 'flex-start',
                              flexShrink: 0,
                              ...(Platform.OS === 'web' && {
                                cursor: 'pointer',
                              }),
                            }}
                            {...(Platform.OS === 'web' && {
                              onClick: (e) => {
                                e.stopPropagation();
                                if (onSwitchToBoardView) {
                                  onSwitchToBoardView();
                                }
                              },
                              onMouseEnter: (e) => {
                                if (e.currentTarget) {
                                  e.currentTarget.style.zIndex = '100';
                                  e.currentTarget.style.backgroundColor = 'rgba(156, 163, 175, 0.3)';
                                }
                              },
                              onMouseLeave: (e) => {
                                if (e.currentTarget) {
                                  e.currentTarget.style.zIndex = '1';
                                  e.currentTarget.style.backgroundColor = 'rgba(156, 163, 175, 0.2)';
                                }
                              },
                            })}
                          >
                            <Text style={{ 
                              fontSize: 9, 
                              color: '#9ca3af',
                              fontWeight: '500',
                              textAlign: 'left',
                              lineHeight: 12,
                            }}>
                              +{ev.overflowCount} more
                            </Text>
                          </View>
                        );
                      }
                      
                      return (
                        <TouchableOpacity
                          key={ev.id}
                          style={[
                            styles.eventBlock,
                            {
                              top: ev.topPx,
                              left: 6,
                              right: 6,
                              height: ev.heightPx,
                              minHeight: 24,
                            }
                          ]}
                          onPress={(e) => {
                            e.stopPropagation();
                            if (onSwitchToBoardView) {
                              onSwitchToBoardView();
                            }
                          }}
                        >
                          <View style={{
                            backgroundColor: 'rgba(156, 163, 175, 0.2)',
                            borderRadius: 4,
                            paddingHorizontal: 4,
                            paddingVertical: 2,
                            alignSelf: 'flex-start',
                          }}>
                            <Text style={{ 
                              fontSize: 9, 
                              color: '#9ca3af',
                              fontWeight: '500',
                              textAlign: 'left',
                              lineHeight: 12,
                            }}>
                              +{ev.overflowCount}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }
                    
                    // Regular event chip - positioned at exact time
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      return (
                        <div
                          key={ev.id}
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: `${ev.topPx}px`,
                            height: `${ev.heightPx}px`,
                            minHeight: 24,
                            zIndex: 1,
                            cursor: isPublicHolidayEvent(ev) ? 'default' : 'pointer',
                            boxSizing: 'border-box',
                            overflow: 'visible',
                            margin: 0,
                            padding: 0,
                            border: 'none',
                            outline: 'none',
                            willChange: 'z-index',
                            ...(Platform.OS === 'web' && {
                              transition: 'z-index 0.15s ease',
                            }),
                          }}
                          onClick={(e) => {
                            if (isPublicHolidayEvent(ev)) return;
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
                          onMouseEnter={(e) => {
                            e.currentTarget.style.zIndex = '100';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.zIndex = '1';
                          }}
                        >
                          <EventChip
                            ev={ev}
                            compact={true}
                            fullWidth={true}
                            hideTime={false}
                            onPress={onEventPress ? () => onEventPress(ev) : undefined}
                            onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                            onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                            showCheckmark={true}
                            children={children}
                            hideDoneStyling={true}
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
                            top: ev.topPx,
                            left: 0,
                            right: 0,
                            height: ev.heightPx,
                            minHeight: 24,
                          }
                        ]}
                      >
                        <EventChip
                          ev={ev}
                          compact={true}
                          fullWidth={true}
                          hideTime={false}
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
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    margin: 8,
    ...(Platform.OS === 'web' && {
      width: 'calc(100% - 16px)',
      maxWidth: 'calc(100% - 16px)',
    }),
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' && {
      width: '100%',
      maxWidth: '100%',
      minHeight: 0,
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }),
    ...(Platform.OS !== 'web' && {
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      elevation: 2,
    }),
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#F8F8F8',
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
    fontWeight: '400',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '400',
    color: '#1F2937',
  },
  dayNumberToday: {
    color: '#4F46E5',
  },
  dayNumberOtherMonth: {
    color: '#9CA3AF',
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      maxWidth: '100%',
      width: '100%',
    }),
  },
  scrollContent: {
    paddingBottom: 40,
  },
  gridContainer: {
    flexDirection: 'row',
    minHeight: 24 * 72, // 24 hours * 72px (taller hour blocks)
    alignItems: 'flex-start',
    ...(Platform.OS === 'web' && {
      width: '100%',
      maxWidth: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }),
  },
  timeColumn: {
    width: 60,
    flexShrink: 0,
    flexGrow: 0,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    backgroundColor: '#F8F8F8',
    margin: 0,
    padding: 0,
  },
  timeCell: {
    height: 60, // Match hourHeight constant exactly
    paddingRight: 8,
    paddingTop: 0,
    paddingBottom: 0,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  timeText: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '400',
    lineHeight: 11, // Match font size to prevent extra spacing
    marginTop: 0,
    marginBottom: 0,
    paddingTop: 0,
    paddingBottom: 0,
    ...(Platform.OS === 'web' && {
      fontVariantNumeric: 'tabular-nums',
    }),
  },
  dayColumnsContainer: {
    flex: 1,
    flexDirection: 'row',
    margin: 0,
    padding: 0,
    ...(Platform.OS === 'web' && {
      width: '100%',
      maxWidth: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }),
  },
  dayColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#e5e7eb',
    position: 'relative',
    minHeight: 780, // 13 hours * 60px = 780px
    backgroundColor: 'transparent',
    margin: 0,
    paddingHorizontal: 4, // Equal padding on both sides
    paddingVertical: 0,
    ...(Platform.OS === 'web' && {
      minWidth: 0,
      overflow: 'visible', // Allow rounded corners to show
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      cursor: 'default',
    }),
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#F3F4F6',
    zIndex: 0,
    pointerEvents: 'none',
    boxSizing: 'border-box',
  },
  halfHourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#FAFBFC',
    zIndex: 0,
    pointerEvents: 'none',
  },
  eventBlock: {
    position: 'absolute',
    paddingHorizontal: 0, // Padding removed - spacing handled by left/right positioning
    paddingVertical: 0, // Padding removed - EventChip handles its own padding
    zIndex: 1,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  overflowIndicator: {
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  overflowText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  busyOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#fca5a5',
    borderLeftWidth: 2,
    borderLeftColor: '#ef4444',
    ...(Platform.OS === 'web' && {
      pointerEvents: 'none',
    }),
  },
  suggestedSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 2,
    borderColor: '#10b981',
    borderStyle: 'dashed',
    borderRadius: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  suggestedSlotContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  suggestedSlotText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#10b981',
  },
});
