import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { eachDayMatrix, isSameMonth, isToday, formatDayNum } from './utils/date';
import EventChip from '../calendar/EventChip';

// Helper to filter out text nodes from children
const filterTextNodes = (children) => {
  return React.Children.toArray(children).filter(child => {
    if (typeof child === 'string' || typeof child === 'number') {
      console.warn('[MonthGrid] Filtered out text node:', child);
      return false;
    }
    return child != null;
  });
};

export default function MonthGrid({ date, events = [], selectedDate, onSelectDate, onEventPress, onEventRightClick, onEventComplete }) {
  const matrix = eachDayMatrix(date);

  // Event bucketing by day with deduplication
  const byDay = new Map();
  const seenIds = new Set();
  console.log('[MonthGrid] Processing', events.length, 'events for date:', date.toISOString());
  
  // Deduplicate events by ID first
  const uniqueEvents = events.filter(ev => {
    if (!ev || !ev.id) return false;
    if (seenIds.has(ev.id)) {
      console.warn('[MonthGrid] Duplicate event ID:', ev.id, ev.title);
      return false;
    }
    seenIds.add(ev.id);
    return true;
  });
  
  for (const ev of uniqueEvents) {
    // Try multiple date fields
    const eventDateStr = ev.start || ev.start_ts || ev.start_at || ev.start_local;
    if (!eventDateStr) {
      console.warn('[MonthGrid] Event missing start date:', ev.id, ev.title);
      continue;
    }
    const d = new Date(eventDateStr);
    if (Number.isNaN(d.getTime())) {
      console.warn('[MonthGrid] Invalid date for event:', ev.id, eventDateStr);
      continue;
    }
    const key = d.toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(ev);
  }
  console.log('[MonthGrid] Bucketed', uniqueEvents.length, 'unique events into', byDay.size, 'days');

  return (
    <View style={{ 
      flex: 1,
      backgroundColor: 'white',
      overflow: 'hidden', 
      borderRadius: 12, 
      borderWidth: 1, 
      borderColor: '#eef2f7',
      margin: 16
    }}>
      {/* Day Headers */}
      <View style={{ flexDirection: 'row', backgroundColor: '#fafbfc', borderBottomWidth: 1, borderBottomColor: '#eef2f7' }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, index) => (
          <View key={d} style={{ 
            flex: 1, 
            borderRightWidth: index < 6 ? 1 : 0,
            borderRightColor: '#eef2f7',
            paddingHorizontal: 12, 
            paddingVertical: 8 
          }}>
            <Text style={{ 
              fontSize: 12, 
              color: '#6b7280', 
              textAlign: 'center',
              fontWeight: '600'
            }}>{d.toUpperCase()}</Text>
          </View>
        ))}
      </View>
      
      {/* Calendar Grid */}
      <View style={{ backgroundColor: 'white' }}>
        {matrix.map((week, i) => {
          // Safety: Filter out any invalid weeks
          if (!week || !Array.isArray(week)) return null;
          return (
            <View key={i} style={{ 
              flexDirection: 'row',
              borderBottomWidth: i < 5 ? 1 : 0,
              borderBottomColor: '#eef2f7'
            }}>
              {week.map((day, j) => {
              const inMonth = isSameMonth(day, date);
              const k = day.toDateString();
              const dayEvents = byDay.get(k) ?? [];
              const isSel = selectedDate && day.toDateString() === selectedDate.toDateString();
              
              // Filter valid events and limit to 4 for display
              const validEvents = dayEvents
                .filter(ev => ev.title && ev.title !== 'undefined' && ev.title !== 'null')
                .slice(0, 4);
              const remainingCount = dayEvents.length - validEvents.length;
              
              return (
                <TouchableOpacity
                  key={`${i}-${j}`}
                  onPress={() => onSelectDate && onSelectDate(day)}
                  style={{ 
                    flex: 1, 
                    height: 120, 
                    borderRightWidth: j < 6 ? 1 : 0, 
                    borderRightColor: '#eef2f7', 
                    padding: 4,
                    backgroundColor: isSel ? '#eef6ff' : 'transparent'
                  }}
                >
                  <Text style={{ 
                    marginBottom: 2, 
                    fontSize: 12, 
                    color: !inMonth ? '#d1d5db' : (isToday(day) ? '#0ea5e9' : '#374151'),
                    fontWeight: isToday(day) ? '600' : 'normal'
                  }}>
                    {formatDayNum(day)}
                  </Text>
                  
                  {/* Event Chips Container */}
                  <View style={{ 
                    flexDirection: 'column',
                    flex: 1,
                    justifyContent: 'flex-start',
                    gap: 1
                  }}>
                    {/* Show up to 4 ultra-compact full-width event chips */}
                    {validEvents
                      .filter(ev => ev && typeof ev === 'object' && ev !== null)
                      .map((ev, index) => (
                        <EventChip 
                          key={ev.id || `event-${index}`} 
                          ev={ev} 
                          compact={true}
                          fullWidth={true}
                          onPress={onEventPress ? () => onEventPress(ev) : undefined}
                          onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                          onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                          showCheckmark={true}
                        />
                      ))}
                    
                    {/* Show remaining count if there are more events */}
                    {remainingCount > 0 && (
                      <View style={{
                        backgroundColor: 'rgba(156, 163, 175, 0.2)',
                        borderRadius: 6,
                        paddingHorizontal: 4,
                        paddingVertical: 1,
                        marginTop: 1,
                        alignSelf: 'flex-start'
                      }}>
                        <Text style={{ 
                          fontSize: 8, 
                          color: '#9ca3af',
                          fontWeight: '500',
                          textAlign: 'left'
                        }}>
                          +{remainingCount} more
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

