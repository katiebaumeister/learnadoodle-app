import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Platform } from 'react-native';
import { startOfWeek, addDays, format, isSameDay, isToday } from './utils/date';
import EventChip from '../calendar/EventChip';

// Time-of-day periods
const TIME_PERIODS = [
  { key: 'morning', label: 'Morning', start: 5, end: 12 },
  { key: 'afternoon', label: 'Afternoon', start: 12, end: 17 },
  { key: 'evening', label: 'Evening', start: 17, end: 22 },
  { key: 'late', label: 'Late', start: 22, end: 29 }, // 22:00-05:00 (wraps to next day)
];

// Get time period for an event
const getTimePeriod = (event) => {
  const startTime = event.start || event.start_ts || event.start_local;
  if (!startTime) return 'morning'; // Default
  
  const eventDate = new Date(startTime);
  if (Number.isNaN(eventDate.getTime())) return 'morning';
  
  const hour = eventDate.getHours();
  
  // Handle late period (22:00-05:00)
  if (hour >= 22 || hour < 5) {
    return 'late';
  }
  
  // Check other periods
  for (const period of TIME_PERIODS) {
    if (period.key === 'late') continue; // Already handled
    
    if (hour >= period.start && hour < period.end) {
      return period.key;
    }
  }
  
  return 'morning'; // Default fallback
};

export default function BoardView({ weekAnchor, events = [], onEventPress, onEventRightClick, onEventComplete, children = [] }) {
  const scrollViewRef = useRef(null);
  const hasScrolledToToday = useRef(false);
  const weekStart = startOfWeek(weekAnchor); // Sunday start
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Auto-scroll to today's column on mount or when weekAnchor changes
  useEffect(() => {
    // Reset scroll flag when weekAnchor changes
    hasScrolledToToday.current = false;
    
    // Compute days inside useEffect to ensure we have the latest values
    const weekStart = startOfWeek(weekAnchor);
    const daysArray = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
    
    const scrollToToday = () => {
      if (!scrollViewRef.current || hasScrolledToToday.current) return;
      
      const today = new Date();
      const todayIndex = daysArray.findIndex(d => isSameDay(d, today));
      
      if (todayIndex >= 0) {
        // Scroll to today's column (280px width + 8px gap = 288px per column)
        const scrollPosition = todayIndex * 288;
        
        scrollViewRef.current.scrollTo({ x: scrollPosition, animated: false });
        hasScrolledToToday.current = true;
      }
    };
    
    // Try scrolling with multiple attempts to ensure layout is ready
    requestAnimationFrame(() => {
      scrollToToday();
      setTimeout(scrollToToday, 50);
      setTimeout(scrollToToday, 200);
      setTimeout(scrollToToday, 500);
    });
  }, [weekAnchor]);

  // Expand Project events to show on all days they span (if within a week)
  const expandedEvents = useMemo(() => {
    const expanded = [];
    const seenIds = new Set();
    
    for (const e of events) {
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
      if (!seenIds.has(e.id)) {
        expanded.push(e);
        seenIds.add(e.id);
      }
    }
    
    return expanded;
  }, [events, days]);

  // Bucket events by day and time period
  const byDayAndPeriod = useMemo(() => {
    const map = new Map();
    
    // Initialize all days with time periods
    for (const d of days) {
      const dayKey = d.toDateString();
      const dayMap = new Map();
      for (const period of TIME_PERIODS) {
        dayMap.set(period.key, []);
      }
      map.set(dayKey, dayMap);
    }
    
    // Add events to their respective days and time periods
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
        const startTime = e.start || e.start_ts || e.start_local;
        if (!startTime) continue;
        eventDate = new Date(startTime);
      }
      
      if (Number.isNaN(eventDate.getTime())) continue;
      
      const dayKey = eventDate.toDateString();
      const periodKey = getTimePeriod(e);
      
      if (map.has(dayKey)) {
        const dayMap = map.get(dayKey);
        if (dayMap.has(periodKey)) {
          dayMap.get(periodKey).push(e);
        }
      }
    }
    
    // Sort events by start time within each period
    for (const dayMap of map.values()) {
      for (const periodEvents of dayMap.values()) {
        periodEvents.sort((a, b) => {
          const aTime = a.start || a.start_ts || a.start_local;
          const bTime = b.start || b.start_ts || b.start_local;
          if (!aTime || !bTime) return 0;
          return new Date(aTime).getTime() - new Date(bTime).getTime();
        });
      }
    }
    
    return map;
  }, [events, days]);

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
        backgroundColor: 'transparent',
        overflow: 'visible',
        borderRadius: 0,
        borderWidth: 0,
        borderColor: 'transparent',
        ...(Platform.OS === 'web' && {
          width: '100%',
          maxWidth: '100%',
        }),
      }}>
    <ScrollView
      ref={scrollViewRef}
      horizontal
          style={{ 
            flex: 1, 
            backgroundColor: 'transparent',
            ...(Platform.OS === 'web' && {
              width: '100%',
              maxWidth: '100%',
              overflowY: 'hidden',
              overflowX: 'auto',
              minHeight: 0,
            }),
          }}
      contentContainerStyle={{ padding: 8, gap: 8 }}
      showsHorizontalScrollIndicator={true}
    >
      {days.map(d => {
        const key = d.toDateString();
        const dayPeriods = byDayAndPeriod.get(key) ?? new Map();
        const isWeekend = d.getDay() === 0 || d.getDay() === 6; // Sunday (0) or Saturday (6)
        
        // Check if day has any events
        const hasEvents = Array.from(dayPeriods.values()).some(events => events.length > 0);
        
        return (
          <View
            key={key}
            style={{
              width: 280,
              backgroundColor: 'transparent',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 12,
              minHeight: 400,
              ...(Platform.OS === 'web' && {
                flexShrink: 0,
                overflow: 'hidden',
                maxHeight: '100%',
              }),
            }}
          >
            {/* Column header */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700', marginBottom: 4 }}>
                {format(d, 'EEEE')}
              </Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#0f141a' }}>
                {format(d, 'MMM d')}
              </Text>
            </View>

            {/* Events grouped by time period */}
            {!hasEvents ? (
              <View
                style={{
                  height: 56,
                  borderWidth: 1,
                  borderColor: '#e5e7eb',
                  borderRadius: 12,
                  backgroundColor: 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <Text style={{ color: '#9aa3af', fontSize: 12 }}>No tasks</Text>
              </View>
            ) : (
              <View style={{ gap: 16 }}>
                {TIME_PERIODS.map((period, periodIndex) => {
                  const periodEvents = dayPeriods.get(period.key) ?? [];
                  
                  if (periodEvents.length === 0) return null;
                  
                  // Check if there's a previous non-empty period
                  const hasPreviousPeriod = TIME_PERIODS.slice(0, periodIndex).some(p => {
                    const prevEvents = dayPeriods.get(p.key) ?? [];
                    return prevEvents.length > 0;
                  });
                  
                  return (
                    <View key={period.key} style={{ gap: 8 }}>
                      {/* Section header with divider */}
                      {hasPreviousPeriod && (
                        <View style={{
                          height: 1,
                          backgroundColor: '#e5e7eb',
                          marginBottom: 8,
                          marginTop: -8
                        }} />
                      )}
                      
                      <View style={{ marginBottom: 8 }}>
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '600',
                          color: '#64748b',
                          textTransform: 'uppercase',
                          letterSpacing: 0.5
                        }}>
                          {period.label}
                        </Text>
                      </View>
                      
                      {/* Events in this period */}
                      <View style={{ gap: 4 }}>
                        {periodEvents.map(ev => (
                          <EventChip
                            key={ev.id}
                            ev={ev}
                            compact={true}
                            fullWidth={true}
                            hideTime={false}
                            onPress={onEventPress ? () => onEventPress(ev) : undefined}
                            onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                            onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                            showCheckmark={true}
                            children={children}
                            titleFontSize={13}
                            timeFontSize={11}
                          />
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
      </View>
    </View>
  );
}

