import React, { useMemo, useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { View, Platform, useWindowDimensions } from 'react-native';
import MonthGrid from './MonthGrid';
import WeekGrid from './WeekGrid';
import PlannerWeek from './PlannerWeek';
import DayAgenda from './DayAgenda';
import BoardView from './BoardView';
import TasksView from './TasksView';
import AttendanceView from './attendance/AttendanceView';
import MobileCardView from './MobileCardView';
import { startOfToday, startOfWeek } from './utils/date';

const DEFAULT_VIEW = 'Month';

/** Lowercase keys from URL / WebLayout must map to PascalCase mode (render branches use 'Month', 'Week', …). */
const KNOWN_MODES = {
  month: 'Month',
  week: 'Board',
  day: 'Day',
  board: 'Board',
  tasks: 'Tasks',
  attendance: 'Attendance',
  'attendance-drilldown': 'AttendanceDrilldown',
};

function normalizeViewMode(raw) {
  if (raw == null || raw === '') return DEFAULT_VIEW;
  const key = String(raw).toLowerCase().trim();
  return KNOWN_MODES[key] || DEFAULT_VIEW;
}

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
  familyId = null,
  onEditChild = null,
  preloadedBacklogEvents = null,
  preloadedTrashEvents = null,
  plannerAttendanceSnapshot = null,
  /** Tutor / observer: view events, no drag-create-complete ownership */
  readOnly = false,
}) {
  const { width } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' || width < 768;
  const [mode, setMode] = useState(() => normalizeViewMode(externalViewMode));
  const prevModeRef = useRef(mode);

  // useLayoutEffect: sync toolbar/URL view before paint. useEffect caused a visible flash (e.g. plan → attendance showed Month for one frame).
  useLayoutEffect(() => {
    setMode(normalizeViewMode(externalViewMode));
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
  
  // When switching to Board view from non-Month view, jump to the week containing today
  // (When switching from Month, viewDate may have been set to a clicked day — don't override.)
  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = mode;
    
    if (mode === 'Board' && prevMode !== 'Board' && prevMode !== 'Month') {
      const today = startOfToday();
      const viewDateWeekStart = startOfWeek(viewDate);
      const todayWeekStart = startOfWeek(today);
      if (viewDateWeekStart.getTime() !== todayWeekStart.getTime()) {
        setViewDate(today);
      }
    }
  }, [mode]);

  const switchToBoardViewForDay = useCallback((day) => {
    setViewDate(day);
    setMode('Board');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'board' }));
    }
  }, []);

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
        const selected = filters.eventTypes || [];
        const selectedLower = selected.map(t => String(t || '').toLowerCase());
        const eventType = e.event_type || e.data?.event_type || e.type;
        const generatedByPlan = String(e.generated_by || e.data?.generated_by || '').toLowerCase() === 'plan_year';
        const hasAcademicYear = !!(e.academic_year_id || e.data?.academic_year_id);
        const looksLikePlanSlot = generatedByPlan || hasAcademicYear;
        const typeLower = String(eventType || '').toLowerCase();

        const isSelectedClassDay = selectedLower.includes('class day') || selectedLower.includes('classday');
        const isClassDayLikeType = (
          typeLower === 'classday'
          || typeLower === 'class day'
          || typeLower === 'schedule block'
          || typeLower === 'scheduled class day'
        );

        // Plan slots often serialize as "Schedule Block"/"Scheduled Class Day" (or no explicit type).
        // Treat them as lessons for filter UX parity with the right-rail filter chips.
        if (looksLikePlanSlot && selectedLower.includes('lesson')) {
          if (!eventType || typeLower === 'schedule block' || typeLower === 'scheduled class day' || typeLower === 'lesson') {
            return true;
          }
        }

        // Class Day filter should include explicit ClassDay events and plan-generated class-day blocks.
        if (isSelectedClassDay && (isClassDayLikeType || (looksLikePlanSlot && !eventType))) {
          return true;
        }

        if (!eventType) return false;
        if (selected.includes(eventType)) return true;
        // Treat "Schedule Block" and "Scheduled Class Day" as the same
        if ((typeLower === 'schedule block' && selectedLower.includes('scheduled class day')) ||
            (typeLower === 'scheduled class day' && selectedLower.includes('schedule block'))) return true;
        // Treat "Exam" and "Assessment" as the same (UI shows "Exam", DB may store "Assessment")
        if ((typeLower === 'exam' && selectedLower.includes('exam')) ||
            (typeLower === 'assessment' && selectedLower.includes('exam'))) return true;
        return false;
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
          onEventComplete={readOnly ? undefined : onEventComplete}
          readOnly={readOnly}
        />
      ) : (
        <>
          {/* Web: keep month grid mounted so switching from Week/Tasks/etc. shows data immediately (no blank flash). */}
          {Platform.OS === 'web' && !isMobile ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                ...(mode !== 'Month' ? { display: 'none' } : {}),
              }}
            >
              <MonthGrid
                date={viewDate}
                events={filtered}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                onEventPress={onEventSelect}
                onEventRightClick={onEventRightClick}
                onEventComplete={readOnly ? undefined : onEventComplete}
                blackoutDates={blackoutDates}
                children={children}
                onSwitchToBoardView={() => setMode('Board')}
                onSwitchToBoardViewForDay={switchToBoardViewForDay}
                readOnly={readOnly}
              />
            </View>
          ) : (
            mode === 'Month' && (
              <MonthGrid
                date={viewDate}
                events={filtered}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                onEventPress={onEventSelect}
                onEventRightClick={onEventRightClick}
                onEventComplete={readOnly ? undefined : onEventComplete}
                blackoutDates={blackoutDates}
                children={children}
                onSwitchToBoardView={() => setMode('Board')}
                onSwitchToBoardViewForDay={switchToBoardViewForDay}
                readOnly={readOnly}
              />
            )
          )}
          {mode === 'Week' && (
            <PlannerWeek
              familyId={familyId}
              weekStart={startOfWeek(viewDate)}
              onWeekStartChange={(newWeekStart) => {
                setViewDate(newWeekStart);
                if (onSelectDate) {
                  onSelectDate(newWeekStart);
                }
              }}
              selectedChildIds={filters?.childIds || []}
              onChildFilterChange={onChildFilterChange}
              onEventSelect={onEventSelect}
              readOnly={readOnly}
              onViewChange={(newView) => {
                if (newView === 'Board') {
                  setMode('Board');
                }
              }}
            />
          )}
          {mode === 'Day' && (
            <DayAgenda
              date={viewDate}
              events={filtered}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={readOnly ? undefined : onEventComplete}
              children={children}
            />
          )}
          {mode === 'Board' && (
            <BoardView
              weekAnchor={viewDate}
              events={filtered}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={readOnly ? undefined : onEventComplete}
              children={children}
              familyId={familyId}
            />
          )}
          {mode === 'Tasks' && (
            <TasksView
              events={filtered}
              monthDate={viewDate}
              onEventPress={onEventSelect}
              onEventRightClick={onEventRightClick}
              onEventComplete={readOnly ? undefined : onEventComplete}
              onCreateTask={readOnly ? undefined : onCreateTask}
              children={children}
              familyId={familyId}
              preloadedBacklogEvents={preloadedBacklogEvents}
              preloadedTrashEvents={preloadedTrashEvents}
            />
          )}
          {/* Web: keep mounted while on other planner modes so prefetch hydrates before first open (no blank flash). */}
          {Platform.OS === 'web' && !isMobile ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                ...(!['Attendance', 'AttendanceDrilldown'].includes(mode) ? { display: 'none' } : {}),
              }}
            >
              <AttendanceView
                familyId={familyId}
                children={children}
                events={(mode === 'Attendance' || mode === 'AttendanceDrilldown') ? filtered : []}
                onEventPress={onEventSelect}
                onEditChild={readOnly ? undefined : onEditChild}
                plannerInitialSnapshot={plannerAttendanceSnapshot}
                mode={mode === 'AttendanceDrilldown' ? 'drilldown' : 'overview'}
              />
            </View>
          ) : (
            (mode === 'Attendance' || mode === 'AttendanceDrilldown') && (
              <AttendanceView
                familyId={familyId}
                children={children}
                events={filtered}
                onEventPress={onEventSelect}
                onEditChild={readOnly ? undefined : onEditChild}
                plannerInitialSnapshot={plannerAttendanceSnapshot}
                mode={mode === 'AttendanceDrilldown' ? 'drilldown' : 'overview'}
              />
            )
          )}
        </>
      )}
    </View>
  );
}

