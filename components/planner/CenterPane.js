import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MonthGrid from './MonthGrid';
import WeekGrid from './WeekGrid';
import DayAgenda from './DayAgenda';
import BoardView from './BoardView';
import { addMonths, addDays, addWeeks, format, startOfToday, startOfWeek } from './utils/date';

const VIEWS = ['Month', 'Week', 'Day', 'Board'];
const DEFAULT_VIEW = 'Month';

export default function CenterPane({
  date,
  events = [],
  selectedDate,
  onSelectDate,
  onCreateTask,
  filters,
  onEventSelect,
  onEventRightClick,
  onEventComplete,
}) {
  const [mode, setMode] = useState(DEFAULT_VIEW);
  const [viewDate, setViewDate] = useState(selectedDate || date || startOfToday());
  
  // Update viewDate when selectedDate or date changes
  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    } else if (date) {
      setViewDate(date);
    }
  }, [selectedDate, date]);
  
  console.log('[CenterPane] Rendering with mode:', mode, 'events:', events.length);
  
  // Navigation handlers
  const handlePrev = () => {
    let newDate;
    if (mode === 'Month') {
      newDate = addMonths(viewDate, -1);
    } else if (mode === 'Week' || mode === 'Board') {
      newDate = addDays(viewDate, -7);
    } else if (mode === 'Day') {
      newDate = addDays(viewDate, -1);
    }
    setViewDate(newDate);
    if (onSelectDate) onSelectDate(newDate);
  };
  
  const handleNext = () => {
    let newDate;
    if (mode === 'Month') {
      newDate = addMonths(viewDate, 1);
    } else if (mode === 'Week' || mode === 'Board') {
      newDate = addDays(viewDate, 7);
    } else if (mode === 'Day') {
      newDate = addDays(viewDate, 1);
    }
    setViewDate(newDate);
    if (onSelectDate) onSelectDate(newDate);
  };
  
  const handleToday = () => {
    const today = startOfToday();
    setViewDate(today);
    if (onSelectDate) onSelectDate(today);
  };
  
  // Format date for display
  const getDateLabel = () => {
    if (mode === 'Month') {
      return format(viewDate, 'MMMM yyyy');
    } else if (mode === 'Week') {
      const weekStart = startOfWeek(viewDate);
      const weekEnd = addDays(weekStart, 6);
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`;
    } else if (mode === 'Day') {
      return format(viewDate, 'EEEE, MMMM d, yyyy');
    } else if (mode === 'Board') {
      const weekStart = startOfWeek(viewDate);
      const weekEnd = addDays(weekStart, 6);
      return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`;
    }
    return '';
  };

  const filtered = useMemo(() => {
    let out = events;
    console.log('[CenterPane] Filtering', events.length, 'events with filters:', filters);
    // Only filter by childIds if filters.childIds is an array with items (not null)
    if (filters?.childIds && Array.isArray(filters.childIds) && filters.childIds.length > 0) {
      out = out.filter(e => {
        const childId = e.childId || e.student_id || e.child_id;
        return childId && filters.childIds.includes(childId);
      });
    }
    // Only filter by subjects if filters.subjects is an array with items
    if (filters?.subjects && Array.isArray(filters.subjects) && filters.subjects.length > 0) {
      out = out.filter(e => {
        const subject = e.subject || e.subjectName || e.subject_name;
        return subject && filters.subjects.includes(subject);
      });
    }
    console.log('[CenterPane] Filtered to', out.length, 'events');
    return out;
  }, [events, filters]);

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Mini toolbar (stays inside the center pane) */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 2,
        borderColor: '#eef2f7',
        backgroundColor: '#ffffff',
        zIndex: 10,
        elevation: 10,
        minHeight: 48
      }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flex: 1 }}>
          {VIEWS.map(v => (
            <TouchableOpacity
              key={v}
              onPress={() => {
                console.log('[CenterPane] Switching to view:', v);
                setMode(v);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: v === mode ? '#eef6ff' : '#f7f8fa',
                borderWidth: v === mode ? 2 : 1,
                borderColor: v === mode ? '#3b82f6' : '#e5e7eb',
                minWidth: 60,
                alignItems: 'center'
              }}
            >
              <Text style={{
                fontWeight: v === mode ? '700' : '500',
                color: v === mode ? '#1e40af' : '#6b7280',
                fontSize: 14
              }}>
                {v}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        {/* Navigation controls */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16 }}>
          <TouchableOpacity
            onPress={handlePrev}
            style={{
              padding: 6,
              borderRadius: 6,
              backgroundColor: '#f7f8fa',
              borderWidth: 1,
              borderColor: '#e5e7eb'
            }}
          >
            <ChevronLeft size={18} color="#374151" />
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={handleToday}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: '#f7f8fa',
              borderWidth: 1,
              borderColor: '#e5e7eb'
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>Today</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={handleNext}
            style={{
              padding: 6,
              borderRadius: 6,
              backgroundColor: '#f7f8fa',
              borderWidth: 1,
              borderColor: '#e5e7eb'
            }}
          >
            <ChevronRight size={18} color="#374151" />
          </TouchableOpacity>
          
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827', marginLeft: 8, minWidth: 200, textAlign: 'right' }}>
            {getDateLabel()}
          </Text>
        </View>
        
        {onCreateTask && (
          <TouchableOpacity
            onPress={onCreateTask}
            style={{
              backgroundColor: '#0ea5e9',
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 10,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontWeight: '700', fontSize: 18, lineHeight: 18 }}>
              +
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Center view */}
      {mode === 'Month' && (
        <MonthGrid
          date={viewDate}
          events={filtered}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onEventPress={onEventSelect}
          onEventRightClick={onEventRightClick}
          onEventComplete={onEventComplete}
        />
      )}
      {mode === 'Week' && (
        <WeekGrid
          anchorDate={viewDate}
          events={filtered}
          onSelectDate={onSelectDate}
          onEventPress={onEventSelect}
          onEventRightClick={onEventRightClick}
          onEventComplete={onEventComplete}
        />
      )}
      {mode === 'Day' && (
        <DayAgenda
          date={viewDate}
          events={filtered}
          onEventPress={onEventSelect}
          onEventRightClick={onEventRightClick}
          onEventComplete={onEventComplete}
        />
      )}
      {mode === 'Board' && (
        <BoardView
          weekAnchor={viewDate}
          events={filtered}
          onEventPress={onEventSelect}
          onEventRightClick={onEventRightClick}
          onEventComplete={onEventComplete}
        />
      )}
    </View>
  );
}

