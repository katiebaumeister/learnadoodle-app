import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { startOfWeek, addDays, format, isToday } from './utils/date';
import EventChip from '../calendar/EventChip';

// Map event colors to dot colors (simplified - only for timeline dots)
const getEventDotColor = (eventColor) => {
  switch (eventColor) {
    case 'teal':
      return '#166534';
    case 'violet':
      return '#6B21A8';
    case 'amber':
      return '#854D0E';
    case 'sky':
      return '#1E40AF';
    default:
      return '#C2410C';
  }
};

// Time rail configuration
const START_HOUR = 8; // 08:00
const END_HOUR = 20; // 20:00
const PIXELS_PER_MINUTE = 1; // 1px per minute

// Generate hours array for time rail
const generateHours = () => {
  return Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
};

// Calculate Y position from time (minutes from start of day)
const getYPosition = (date, startHour = START_HOUR) => {
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const totalMinutes = (hours - startHour) * 60 + minutes;
  return Math.max(0, totalMinutes * PIXELS_PER_MINUTE);
};

// Calculate height from duration
const getHeight = (startDate, endDate) => {
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationMinutes = Math.max(15, Math.round(durationMs / (1000 * 60))); // Minimum 15 minutes
  return durationMinutes * PIXELS_PER_MINUTE;
};

// DayEventBlock component - now uses EventChip like month view
function DayEventBlock({ event, onPress, onRightClick, onComplete, showCheckmark = true, children = [], stackedTop, eventHeight }) {
  const startTime = event.start || event.start_ts || event.start_local;
  const endTime = event.end || event.end_ts || event.end_local;
  
  if (!startTime) return null;
  
  const startDate = new Date(startTime);
  const endDate = endTime ? new Date(endTime) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour
  
  if (Number.isNaN(startDate.getTime())) return null;
  
  // Use stackedTop if provided (for overlapping events), otherwise calculate from time
  const top = stackedTop !== undefined ? stackedTop : getYPosition(startDate);
  const height = eventHeight !== undefined ? eventHeight : Math.max(24, getHeight(startDate, endDate));
  
  return (
    <View
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: Math.max(24, height), // Minimum height
        paddingHorizontal: 4,
        paddingVertical: 2,
      }}
    >
      <EventChip
        ev={event}
        compact={true}
        fullWidth={true}
        hideTime={false}
        onPress={onPress ? () => onPress(event) : undefined}
        onRightClick={onRightClick ? (event, nativeEvent) => onRightClick(event, nativeEvent) : undefined}
        onComplete={onComplete ? () => onComplete(event) : undefined}
        showCheckmark={showCheckmark}
        children={children}
        alignDotsNearTime={true}
        titleFontSize={13}
        timeFontSize={11}
        hideDoneStyling={true}
      />
    </View>
  );
}

// Day Section Component
function DaySection({ day, events, onEventPress, onEventRightClick, onEventComplete, isTodayDate, children = [] }) {
  const dayStart = new Date(day);
  dayStart.setHours(START_HOUR, 0, 0, 0);
  
  const dayEnd = new Date(day);
  dayEnd.setHours(END_HOUR, 0, 0, 0);
  
  const totalHeight = (END_HOUR - START_HOUR) * 60 * PIXELS_PER_MINUTE;
  const hours = generateHours();
  
  // Filter and sort events for this day, then calculate positions with stacking
  const dayEvents = useMemo(() => {
    const filtered = events.filter(e => {
      const startTime = e.start || e.start_ts || e.start_local;
      if (!startTime) return false;
      
      const eventDate = new Date(startTime);
      if (Number.isNaN(eventDate.getTime())) return false;
      
      const eventLocalDate = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
      const dayLocalDate = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      
      return eventLocalDate.getTime() === dayLocalDate.getTime();
    });
    
    const sorted = filtered.sort((a, b) => {
      const aTime = a.start || a.start_ts || a.start_local;
      const bTime = b.start || b.start_ts || b.start_local;
      if (!aTime || !bTime) return 0;
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    });
    
    // Calculate positions with stacking for overlapping events
    const eventSpacing = 2; // Spacing between stacked events
    const positionedEvents = [];
    const eventGroups = []; // Groups of overlapping events
    
    sorted.forEach(event => {
      const startTime = event.start || event.start_ts || event.start_local;
      const endTime = event.end || event.end_ts || event.end_local;
      if (!startTime) return;
      
      const startDate = new Date(startTime);
      const endDate = endTime ? new Date(endTime) : new Date(startDate.getTime() + 60 * 60 * 1000);
      
      if (Number.isNaN(startDate.getTime())) return;
      
      const eventTop = getYPosition(startDate);
      const eventHeight = Math.max(24, getHeight(startDate, endDate));
      const eventEnd = eventTop + eventHeight;
      
      // Find which group this event belongs to (overlaps with)
      let addedToGroup = false;
      
      for (const group of eventGroups) {
        // Check if event overlaps with any event in this group
        const overlaps = group.some(e => {
          const eStartTime = e.start || e.start_ts || e.start_local;
          const eEndTime = e.end || e.end_ts || e.end_local;
          if (!eStartTime) return false;
          
          const eStartDate = new Date(eStartTime);
          const eEndDate = eEndTime ? new Date(eEndTime) : new Date(eStartDate.getTime() + 60 * 60 * 1000);
          if (Number.isNaN(eStartDate.getTime())) return false;
          
          const eTop = getYPosition(eStartDate);
          const eHeight = Math.max(24, getHeight(eStartDate, eEndDate));
          const eEnd = eTop + eHeight;
          
          return eventTop < eEnd && eventEnd > eTop;
        });
        
        if (overlaps) {
          group.push({ ...event, eventTop, eventHeight, eventEnd });
          addedToGroup = true;
          break;
        }
      }
      
      // If no overlap found, create new group
      if (!addedToGroup) {
        eventGroups.push([{ ...event, eventTop, eventHeight, eventEnd }]);
      }
    });
    
    // Position events within each group (stack vertically)
    eventGroups.forEach(group => {
      // Sort group by start time
      group.sort((a, b) => a.eventTop - b.eventTop);
      
      let currentTop = group[0].eventTop;
      
      group.forEach((event, index) => {
        positionedEvents.push({
          ...event,
          stackedTop: currentTop,
          stackedIndex: index,
        });
        
        // Move down for next event (add spacing)
        currentTop += event.eventHeight + eventSpacing;
      });
    });
    
    return positionedEvents.sort((a, b) => a.stackedTop - b.stackedTop);
  }, [events, day]);
  
  // Calculate actual height needed based on events
  const actualContentHeight = useMemo(() => {
    if (dayEvents.length === 0) return 120;
    
    // Find the bottom-most event
    const lastEvent = dayEvents[dayEvents.length - 1];
    const lastEventBottom = (lastEvent.stackedTop || 0) + (lastEvent.eventHeight || 24);
    
    // Return max of totalHeight (time range) or last event position + padding
    return Math.max(totalHeight, lastEventBottom + 40);
  }, [dayEvents, totalHeight]);
  
  // Get unique hours with events for timeline dots
  const hoursWithEvents = useMemo(() => {
    const hourSet = new Set();
    dayEvents.forEach(ev => {
      const startTime = ev.start || ev.start_ts || ev.start_local;
      if (startTime) {
        const d = new Date(startTime);
        if (!Number.isNaN(d.getTime())) {
          hourSet.add(d.getHours());
        }
      }
    });
    return hourSet;
  }, [dayEvents]);
  
  const dayNumber = format(day, 'd');
  const weekday = format(day, 'EEE');
  
  return (
    <View style={{ marginBottom: 8 }}>
      {/* Day Header */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 8
      }}>
        <Text style={{
          fontSize: 32,
          fontWeight: '600',
          color: '#1F2937',
          lineHeight: 36
        }}>
          {dayNumber}
        </Text>
        <Text style={{
          fontSize: 16,
          fontWeight: '600',
          color: '#6B7280',
          textTransform: 'uppercase'
        }}>
          {weekday}
        </Text>
      </View>
      
      {/* Day Content */}
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: 16,
      }}>
        {/* Time Rail */}
        <View style={{
          width: 70,
          position: 'relative',
          paddingRight: 12,
          minHeight: actualContentHeight
        }}>
          {/* Vertical Timeline Line */}
          <View style={{
            position: 'absolute',
            left: 35, // Center of time rail
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: '#e5e7eb',
            opacity: dayEvents.length === 0 ? 0.3 : 0.5
          }} />
          
          {/* Hour Labels */}
          {hours.map(hour => {
            const hasEvent = hoursWithEvents.has(hour);
            const yPos = (hour - START_HOUR) * 60 * PIXELS_PER_MINUTE;
            
            return (
              <View
                key={hour}
                style={{
                  position: 'absolute',
                  top: yPos - 8,
                  left: 0,
                  right: 0,
                  alignItems: 'flex-end',
                  paddingRight: 8
                }}
              >
                {/* Colored dot for first event at this hour */}
                {hasEvent && (() => {
                  const firstEventAtHour = dayEvents.find(e => {
                    const startTime = e.start || e.start_ts || e.start_local;
                    if (!startTime) return false;
                    const d = new Date(startTime);
                    return !Number.isNaN(d.getTime()) && d.getHours() === hour;
                  });
                  // Use light grey dot for timeline indicator in day view (matching timeline line)
                  return (
                    <View style={{
                      position: 'absolute',
                      right: 31, // Align with timeline
                      top: 20, // Lowered to avoid covering hour labels
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: '#E5E7EB', // Light grey to match timeline line
                      zIndex: 2
                    }} />
                  );
                })()}
                
                {/* Hour Label */}
                <Text style={{
                  fontSize: 12,
                  fontWeight: '500',
                  color: hasEvent ? '#374151' : '#9ca3af',
                  opacity: dayEvents.length === 0 ? 0.5 : 1
                }}>
                  {hour.toString().padStart(2, '0')}:00
                </Text>
              </View>
            );
          })}
        </View>
        
        {/* Events Column - Scrollable */}
        <ScrollView
          style={{
            flex: 1,
            ...(Platform.OS === 'web' && {
              overflowY: 'auto',
              overflowX: 'hidden',
              maxHeight: '80vh', // Limit max height to viewport
            }),
          }}
          contentContainerStyle={{
            minHeight: actualContentHeight,
            position: 'relative',
            paddingBottom: 20,
          }}
          showsVerticalScrollIndicator={true}
          nestedScrollEnabled={true}
        >
          {dayEvents.length === 0 ? (
            <View style={{
              position: 'absolute',
              top: totalHeight / 2 - 20,
              left: 0,
              right: 0,
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Text style={{
                fontSize: 12,
                color: '#9ca3af',
                opacity: 0.5
              }}>
                No events
              </Text>
            </View>
          ) : (
            dayEvents.map(event => (
              <DayEventBlock
                key={event.id}
                event={event}
                onPress={onEventPress}
                onRightClick={onEventRightClick}
                onComplete={onEventComplete}
                showCheckmark={true}
                children={children}
                stackedTop={event.stackedTop}
                eventHeight={event.eventHeight}
              />
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// Main DayAgenda Component
export default function DayAgenda({ date, events = [], onEventPress, onEventRightClick, onEventComplete, children = [] }) {
  const scrollViewRef = useRef(null);
  const dayPositions = useRef({});
  const hasScrolledToToday = useRef(false);
  const weekStart = startOfWeek(date); // Sunday start
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

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
  
  // Find today's index
  const today = new Date();
  const todayIndex = days.findIndex(d => {
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const tDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return dDate.getTime() === tDate.getTime();
  });
  
  // Auto-scroll to current day on mount
  useEffect(() => {
    if (scrollViewRef.current && todayIndex >= 0 && !hasScrolledToToday.current) {
      // Wait for layout, then scroll to today
      const timeoutId = setTimeout(() => {
        const todayY = dayPositions.current[todayIndex];
        if (todayY !== undefined) {
          scrollViewRef.current?.scrollTo({ 
            y: Math.max(0, todayY - 20), // Offset by 20px for padding
            animated: true 
          });
          hasScrolledToToday.current = true;
        } else {
          // Fallback: estimate position based on index
          const estimatedY = todayIndex * 400; // Rough estimate per day section
          scrollViewRef.current?.scrollTo({ 
            y: Math.max(0, estimatedY - 20),
            animated: true 
          });
          hasScrolledToToday.current = true;
        }
      }, 300); // Wait for layout
      
      return () => clearTimeout(timeoutId);
    }
  }, [date, todayIndex]);
  
  // Reset scroll flag when date changes
  useEffect(() => {
    hasScrolledToToday.current = false;
  }, [date]);
  
  return (
    <View style={{ 
      flex: 1, 
      margin: 8,
      ...(Platform.OS === 'web' && {
        width: 'calc(100% - 16px)',
        maxWidth: 'calc(100% - 16px)',
      }),
    }}>
      <View style={{
        flex: 1,
        backgroundColor: '#FAFBFC',
        overflow: 'visible',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        ...(Platform.OS === 'web' && {
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        }),
        ...(Platform.OS !== 'web' && {
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          elevation: 2,
        }),
        ...(Platform.OS === 'web' && {
          width: '100%',
          maxWidth: '100%',
        }),
      }}>
    <ScrollView 
      ref={scrollViewRef} 
          style={{ 
            flex: 1, 
            backgroundColor: 'white',
            ...(Platform.OS === 'web' && {
              width: '100%',
              maxWidth: '100%',
              overflowY: 'auto',
              overflowX: 'hidden',
              minHeight: 0,
            }),
          }}
      contentContainerStyle={{ paddingBottom: 40 }}
      showsVerticalScrollIndicator={true}
    >
      {days.map((day, index) => {
        const dayKey = day.toDateString();
        const isTodayDate = isToday(day);
        
        return (
          <View
            key={dayKey}
            onLayout={(event) => {
              const { y } = event.nativeEvent.layout;
              dayPositions.current[index] = y;
              
              // If this is today and we haven't scrolled yet, scroll now
              if (isTodayDate && !hasScrolledToToday.current && scrollViewRef.current) {
                setTimeout(() => {
                  scrollViewRef.current?.scrollTo({ 
                    y: Math.max(0, y - 20),
                    animated: true 
                  });
                  hasScrolledToToday.current = true;
                }, 100);
              }
            }}
          >
            <DaySection
              day={day}
              events={expandedEvents}
              onEventPress={onEventPress}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
              isTodayDate={isTodayDate}
              children={children}
            />
          </View>
        );
      })}
    </ScrollView>
      </View>
    </View>
  );
}