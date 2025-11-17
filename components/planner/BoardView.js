import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView } from 'react-native';
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

export default function BoardView({ weekAnchor, events = [], onEventPress, onEventRightClick, onEventComplete }) {
  const scrollViewRef = useRef(null);
  const weekStart = startOfWeek(weekAnchor); // Monday start
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Auto-scroll to today's column on mount or when weekAnchor changes
  useEffect(() => {
    const today = new Date();
    const todayIndex = days.findIndex(d => isSameDay(d, today));
    
    if (todayIndex >= 0 && scrollViewRef.current) {
      // Scroll to today's column (280px width + 12px gap)
      const scrollPosition = todayIndex * (280 + 12);
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ x: scrollPosition, animated: true });
      }, 100);
    }
  }, [weekAnchor]);

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
    for (const e of events) {
      const startTime = e.start || e.start_ts || e.start_local;
      if (!startTime) continue;
      
      const eventDate = new Date(startTime);
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
    <ScrollView
      ref={scrollViewRef}
      horizontal
      style={{ flex: 1, backgroundColor: 'white' }}
      contentContainerStyle={{ padding: 12, gap: 12 }}
      showsHorizontalScrollIndicator={true}
    >
      {days.map(d => {
        const key = d.toDateString();
        const dayPeriods = byDayAndPeriod.get(key) ?? new Map();
        
        // Check if day has any events
        const hasEvents = Array.from(dayPeriods.values()).some(events => events.length > 0);
        
        return (
          <View
            key={key}
            style={{
              width: 280,
              backgroundColor: '#f8fafc',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 12,
              minHeight: 400
            }}
          >
            {/* Column header */}
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '600', marginBottom: 4 }}>
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
                  backgroundColor: 'white',
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
                      <View style={{ gap: 8 }}>
                        {periodEvents.map(ev => (
                          <EventChip
                            key={ev.id}
                            ev={ev}
                            fullWidth={true}
                            onPress={onEventPress ? () => onEventPress(ev) : undefined}
                            onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                            onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                            showCheckmark={true}
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
  );
}

