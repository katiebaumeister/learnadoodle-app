import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { startOfWeek, addDays, format, isToday } from './utils/date';
import { CheckCircle2, Circle } from 'lucide-react';

// Pastel color palette matching reference design
const PASTEL_COLORS = {
  peach: { bg: '#FDF3F2', border: '#F5C2B8', text: '#C2410C' },
  blue: { bg: '#F0F6FF', border: '#93C5FD', text: '#1E40AF' },
  teal: { bg: '#F5FBF5', border: '#86EFAC', text: '#166534' },
  yellow: { bg: '#FEFCE8', border: '#FDE047', text: '#854D0E' },
  purple: { bg: '#F5F3FF', border: '#C4B5FD', text: '#6B21A8' },
  pink: { bg: '#FDF2F8', border: '#F9A8D4', text: '#9F1239' },
};

// Map event colors to pastel palette
const getPastelColor = (eventColor) => {
  switch (eventColor) {
    case 'teal':
      return PASTEL_COLORS.teal;
    case 'violet':
      return PASTEL_COLORS.purple;
    case 'amber':
      return PASTEL_COLORS.yellow;
    case 'sky':
      return PASTEL_COLORS.blue;
    default:
      return PASTEL_COLORS.peach;
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

// DayEventBlock component
function DayEventBlock({ event, onPress, onRightClick, onComplete, showCheckmark = true }) {
  const startTime = event.start || event.start_ts || event.start_local;
  const endTime = event.end || event.end_ts || event.end_local;
  
  if (!startTime) return null;
  
  const startDate = new Date(startTime);
  const endDate = endTime ? new Date(endTime) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour
  
  if (Number.isNaN(startDate.getTime())) return null;
  
  const top = getYPosition(startDate);
  const height = getHeight(startDate, endDate);
  const pastelColor = getPastelColor(event.color || 'teal');
  
  // Format time range
  const formatTime = (date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    if (minutes === 0) {
      return `${hours.toString().padStart(2, '0')}:00`;
    }
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };
  
  const timeRange = `${formatTime(startDate)} - ${formatTime(endDate)}`;
  
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress ? () => onPress(event) : undefined}
      onLongPress={onRightClick ? (e) => onRightClick(event, e.nativeEvent) : undefined}
      style={{
        position: 'absolute',
        top,
        left: 0,
        right: 0,
        height: Math.max(40, height), // Minimum height
        backgroundColor: pastelColor.bg,
        borderWidth: 1,
        borderColor: pastelColor.border,
        borderRadius: 10,
        padding: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
        opacity: event.status === 'done' ? 0.6 : 1
      }}
    >
      {/* Time Range */}
      <Text style={{
        fontSize: 11,
        fontWeight: '700',
        color: pastelColor.text,
        marginBottom: 4
      }}>
        {timeRange}
      </Text>
      
      {/* Event Title */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        {showCheckmark && onComplete && (
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation();
              onComplete(event);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {event.status === 'done' ? (
              <CheckCircle2 size={16} color={pastelColor.text} fill={pastelColor.text} />
            ) : (
              <Circle size={16} color={pastelColor.text} strokeWidth={2} />
            )}
          </TouchableOpacity>
        )}
        <Text style={{
          fontSize: 14,
          fontWeight: '500',
          color: pastelColor.text,
          flex: 1,
          textDecorationLine: event.status === 'done' ? 'line-through' : 'none'
        }}>
          {event.title || 'Untitled Event'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// Day Section Component
function DaySection({ day, events, onEventPress, onEventRightClick, onEventComplete, isTodayDate }) {
  const dayStart = new Date(day);
  dayStart.setHours(START_HOUR, 0, 0, 0);
  
  const dayEnd = new Date(day);
  dayEnd.setHours(END_HOUR, 0, 0, 0);
  
  const totalHeight = (END_HOUR - START_HOUR) * 60 * PIXELS_PER_MINUTE;
  const hours = generateHours();
  
  // Filter and sort events for this day
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
    
    return filtered.sort((a, b) => {
      const aTime = a.start || a.start_ts || a.start_local;
      const bTime = b.start || b.start_ts || b.start_local;
      if (!aTime || !bTime) return 0;
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    });
  }, [events, day]);
  
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
    <View style={{ marginBottom: 24 }}>
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
          fontWeight: '700',
          color: isTodayDate ? '#0ea5e9' : '#0f141a',
          lineHeight: 36
        }}>
          {dayNumber}
        </Text>
        <Text style={{
          fontSize: 16,
          fontWeight: '600',
          color: isTodayDate ? '#0ea5e9' : '#6b7280',
          textTransform: 'uppercase'
        }}>
          {weekday}
        </Text>
      </View>
      
      {/* Day Content */}
      <View style={{
        flexDirection: 'row',
        paddingHorizontal: 16,
        minHeight: dayEvents.length === 0 ? 120 : totalHeight
      }}>
        {/* Time Rail */}
        <View style={{
          width: 70,
          position: 'relative',
          paddingRight: 12
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
                  const eventColor = firstEventAtHour?.color || 'teal';
                  const pastelColor = getPastelColor(eventColor);
                  
                  return (
                    <View style={{
                      position: 'absolute',
                      right: 31, // Align with timeline
                      top: 8,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: pastelColor.text,
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
        
        {/* Events Column */}
        <View style={{
          flex: 1,
          position: 'relative',
          minHeight: totalHeight
        }}>
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
              />
            ))
          )}
        </View>
      </View>
    </View>
  );
}

// Main DayAgenda Component
export default function DayAgenda({ date, events = [], onEventPress, onEventRightClick, onEventComplete }) {
  const scrollViewRef = useRef(null);
  const dayPositions = useRef({});
  const hasScrolledToToday = useRef(false);
  const weekStart = startOfWeek(date); // Monday start
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
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
    <ScrollView 
      ref={scrollViewRef} 
      style={{ flex: 1, backgroundColor: 'white' }}
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
              events={events}
              onEventPress={onEventPress}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
              isTodayDate={isTodayDate}
            />
          </View>
        );
      })}
    </ScrollView>
  );
}
