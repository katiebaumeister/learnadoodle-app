import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { eachDayMatrix, isSameMonth, isToday, formatDayNum } from './utils/date';
import EventChip from './EventChip';

export default function MonthGrid({ date, events = [], selectedDate, onSelectDate }) {
  const matrix = eachDayMatrix(date);

  // Event bucketing by day
  const byDay = new Map();
  for (const ev of events) {
    const d = new Date(ev.start);
    const key = d.toDateString();
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(ev);
  }

  return (
    <View style={{ 
      overflow: 'hidden', 
      borderRadius: 12, 
      borderWidth: 1, 
      borderColor: '#232a33' 
    }}>
      {/* Day Headers */}
      <View style={{ flexDirection: 'row', backgroundColor: '#151a21' }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, index) => (
          <View key={d} style={{ 
            flex: 1, 
            borderBottomWidth: 1, 
            borderBottomColor: '#232a33', 
            borderRightWidth: index < 6 ? 1 : 0,
            borderRightColor: '#232a33',
            paddingHorizontal: 12, 
            paddingVertical: 8 
          }}>
            <Text style={{ 
              fontSize: 12, 
              color: '#c0cad6', 
              textAlign: 'center' 
            }}>{d.toUpperCase()}</Text>
          </View>
        ))}
      </View>
      
      {/* Calendar Grid */}
      <View style={{ backgroundColor: '#0f141a' }}>
        {matrix.map((week, i) => (
          <View key={i} style={{ 
            flexDirection: 'row',
            borderBottomWidth: i < 5 ? 1 : 0,
            borderBottomColor: '#232a33'
          }}>
            {week.map((day, j) => {
              const inMonth = isSameMonth(day, date);
              const k = day.toDateString();
              const dayEvents = byDay.get(k) ?? [];
              const isSel = selectedDate && day.toDateString() === selectedDate.toDateString();
              
              // Filter valid events and limit to 4 for display (increased from 3)
              const validEvents = dayEvents
                .filter(ev => ev.title && ev.title !== 'undefined' && ev.title !== 'null')
                .slice(0, 4);
              const remainingCount = dayEvents.length - validEvents.length;
              
              return (
                <TouchableOpacity
                  key={`${i}-${j}`}
                  onPress={() => onSelectDate(day)}
                  style={{ 
                    flex: 1, 
                    height: 120, 
                    borderRightWidth: j < 6 ? 1 : 0, 
                    borderRightColor: '#232a33', 
                    padding: 4,
                    backgroundColor: isSel ? 'rgba(96, 165, 250, 0.2)' : 'transparent'
                  }}
                >
                  <Text style={{ 
                    marginBottom: 2, 
                    fontSize: 12, 
                    color: !inMonth ? 'rgba(192, 202, 214, 0.5)' : (isToday(day) ? '#60a5fa' : '#c0cad6'),
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
                    {validEvents.map((ev, index) => (
                      <EventChip 
                        key={ev.id || `event-${index}`} 
                        ev={ev} 
                        compact={true}
                        fullWidth={true}
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
        ))}
      </View>
    </View>
  );
}
