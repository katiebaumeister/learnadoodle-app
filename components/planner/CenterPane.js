import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import MonthGrid from './MonthGrid';
import WeekGrid from './WeekGrid';
import DayAgenda from './DayAgenda';
import BoardView from './BoardView';
import TasksView from './TasksView';
import MobileCardView from './MobileCardView';
import { startOfToday, startOfWeek } from './utils/date';

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
  onNavigateToIntelligence,
  children = [],
  onChildFilterChange,
  blackoutDates = [],
  viewMode: externalViewMode,
}) {
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' || width < 768;
  const [mode, setMode] = useState(externalViewMode || DEFAULT_VIEW);
  const prevModeRef = useRef(mode);
  
  // Sync mode when external viewMode prop changes
  useEffect(() => {
    if (externalViewMode) {
      // Capitalize first letter to match internal format (Month, Week, Day, Board)
      const capitalized = externalViewMode.charAt(0).toUpperCase() + externalViewMode.slice(1);
      setMode(capitalized);
    }
  }, [externalViewMode]);
  const [viewDate, setViewDate] = useState(selectedDate || date || startOfToday());
  
  // Update viewDate when selectedDate or date changes
  useEffect(() => {
    if (selectedDate) {
      setViewDate(selectedDate);
    } else if (date) {
      setViewDate(date);
    }
  }, [selectedDate, date]);
  
  // When switching to Board view, jump to the week containing today (only on initial switch)
  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = mode;
    
    // Only run when switching TO Board mode, not when already in Board mode
    if (mode === 'Board' && prevMode !== 'Board') {
      const today = startOfToday();
      // Check if current viewDate is in the same week as today
      const viewDateWeekStart = startOfWeek(viewDate);
      const todayWeekStart = startOfWeek(today);
      
      // If viewDate is not in the current week, set it to today
      if (viewDateWeekStart.getTime() !== todayWeekStart.getTime()) {
        setViewDate(today);
      }
    }
  }, [mode]);
  
  

  const filtered = useMemo(() => {
    let out = events;
    
    // First, filter out canceled events - these should not be displayed
    out = out.filter(e => {
      const status = e.status || e.data?.status;
      return status !== 'canceled';
    });
    
    // For Tasks view, we need to include backlog items (events with dates in 2099)
    // These won't be in the current month's events, so we need to fetch them separately
    // For now, we'll work with what we have - the backlog filter in TasksView will handle it
    
    // Only filter by childIds if filters.childIds is an array with items (not null)
    if (filters?.childIds && Array.isArray(filters.childIds) && filters.childIds.length > 0) {
      out = out.filter(e => {
        // Check single child_id
        const childId = e.childId || e.student_id || e.child_id;
        if (childId && filters.childIds.includes(childId)) {
          return true;
        }
        
        // Check child_ids array (multiple children) - if any child in the event matches selected filter
        if (e.child_ids && Array.isArray(e.child_ids) && e.child_ids.length > 0) {
          return e.child_ids.some(id => filters.childIds.includes(id));
        }
        
        // If event has no child_id or child_ids, it might be a family event - show it
        // (Family events should show for all children)
        if (!childId && (!e.child_ids || e.child_ids.length === 0)) {
          return true;
        }
        
        return false;
      });
    }
    // Only filter by subjects if filters.subjects is an array with items
    if (filters?.subjects && Array.isArray(filters.subjects) && filters.subjects.length > 0) {
      out = out.filter(e => {
        const subject = e.subject || e.subjectName || e.subject_name;
        return subject && filters.subjects.includes(subject);
      });
    }
    // Only filter by event types if filters.eventTypes is an array with items
    if (filters?.eventTypes && Array.isArray(filters.eventTypes) && filters.eventTypes.length > 0) {
      out = out.filter(e => {
        const eventType = e.event_type || e.data?.event_type || e.type;
        return eventType && filters.eventTypes.includes(eventType);
      });
    }
    return out;
  }, [events, filters]);

  // Get child filter display text
  const getChildFilterText = () => {
    if (!filters?.childIds || !Array.isArray(filters.childIds) || filters.childIds.length === 0) {
      return 'All Children';
    }
    if (filters.childIds.length === 1 && children.length > 0) {
      const child = children.find(c => c.id === filters.childIds[0]);
      return child ? (child.first_name || child.name) : '1 Child';
    }
    return `${filters.childIds.length} Children`;
  };


  return (
    <View style={{ 
      flex: 1, 
      backgroundColor: 'transparent',
      ...(Platform.OS === 'web' && {
        width: '100%',
        maxWidth: '100%',
        overflow: 'visible',
        minHeight: 0,
      }),
    }}>


      {/* Center view */}
      {isMobile ? (
        <MobileCardView
          date={viewDate}
          events={filtered}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          onEventPress={onEventSelect}
          onEventRightClick={onEventRightClick}
          onEventComplete={onEventComplete}
        />
      ) : (
        <>
          {mode === 'Month' && (
            <MonthGrid
              date={viewDate}
              events={filtered}
              selectedDate={selectedDate}
              onSelectDate={onSelectDate}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
              blackoutDates={blackoutDates}
              children={children}
              onSwitchToBoardView={() => setMode('Board')}
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
              children={children}
              onSwitchToBoardView={() => setMode('Board')}
            />
          )}
          {mode === 'Day' && (
            <DayAgenda
              date={viewDate}
              events={filtered}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
              children={children}
            />
          )}
          {mode === 'Board' && (
            <BoardView
              weekAnchor={viewDate}
              events={filtered}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
              children={children}
            />
          )}
          {mode === 'Tasks' && (
            <TasksView
              events={filtered}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
              onCreateTask={onCreateTask}
              children={children}
            />
          )}
        </>
      )}
    </View>
  );
}

