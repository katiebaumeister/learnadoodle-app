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
import { eventMatchesPlannerCategoryFilter } from '../../lib/planner/plannerEventCategories';

const DEFAULT_VIEW = 'Board';

/** Lowercase keys from URL / WebLayout must map to PascalCase mode (render branches use 'Month', 'Week', …). */
const KNOWN_MODES = {
  month: 'Month',
  week: 'Board',
  day: 'Day',
  board: 'Board',
  tasks: 'Tasks',
  year: 'Year',
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
  preloadedSectionEvents = null,
  plannerAttendanceSnapshot = null,
  plannerHolidaysCache = {},
  plannerExclusions = [],
  academicYears = null,
  /** Tutor / observer: view events, no drag-create-complete ownership */
  readOnly = false,
  /** Allow checking events done even when read-only (e.g. children marking their own work). */
  allowComplete = !readOnly,
  plannerShellVisible = true,
}) {
  const completeHandler = allowComplete ? onEventComplete : undefined;
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

  const switchToMonthForDay = useCallback((dayKey, dayDate) => {
    const nextDate = dayDate instanceof Date && !Number.isNaN(dayDate.getTime())
      ? dayDate
      : (dayKey ? new Date(`${dayKey}T12:00:00`) : null);
    if (!nextDate || Number.isNaN(nextDate.getTime())) return;
    setViewDate(nextDate);
    onSelectDate?.(nextDate);
    setMode('Month');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'month' }));
    }
  }, [onSelectDate]);

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
    
    // Only filter by childIds if filters.childIds is an array with items (not null).
    // Planner "By child" is All or exactly one id; compare as strings for UUID safety.
    if (filters?.childIds && Array.isArray(filters.childIds) && filters.childIds.length > 0) {
      const selectedChildIds = new Set(filters.childIds.map(String));
      out = out.filter(e => {
        // Check single child_id
        const childId = e.childId || e.student_id || e.child_id;
        if (childId != null && selectedChildIds.has(String(childId))) {
          return true;
        }

        // Check child_ids array (multiple children) - if any child in the event matches selected filter
        if (e.child_ids && Array.isArray(e.child_ids) && e.child_ids.length > 0) {
          return e.child_ids.some((id) => selectedChildIds.has(String(id)));
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
      out = out.filter((e) => eventMatchesPlannerCategoryFilter(e, filters.eventTypes));
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
          onEventComplete={completeHandler}
          readOnly={readOnly}
          allowComplete={allowComplete}
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
                onEventComplete={completeHandler}
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
                onEventComplete={completeHandler}
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
              onEventComplete={completeHandler}
              children={children}
            />
          )}
          {mode === 'Board' && (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                ...(Platform.OS === 'web' && {
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                }),
              }}
            >
              <BoardView
                weekAnchor={viewDate}
                events={filtered}
                onEventPress={onEventSelect}
                onEventRightClick={onEventRightClick}
                onEventComplete={completeHandler}
                children={children}
                familyId={familyId}
              />
            </View>
          )}
          {Platform.OS === 'web' && !isMobile ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                ...(mode !== 'Tasks' ? { display: 'none' } : {}),
              }}
            >
              <TasksView
                events={filtered}
                monthDate={viewDate}
                onEventPress={onEventSelect}
                onEventRightClick={onEventRightClick}
                onEventComplete={completeHandler}
                onCreateTask={readOnly ? undefined : onCreateTask}
                children={children}
                familyId={familyId}
                preloadedBacklogEvents={preloadedBacklogEvents}
                preloadedTrashEvents={preloadedTrashEvents}
                preloadedSectionEvents={preloadedSectionEvents}
                plannerHolidaysCache={plannerHolidaysCache}
                plannerExclusions={plannerExclusions}
                plannerShellVisible={plannerShellVisible}
                viewActive={mode === 'Tasks'}
              />
            </View>
          ) : (
            mode === 'Tasks' && (
              <TasksView
                events={filtered}
                monthDate={viewDate}
                onEventPress={onEventSelect}
                onEventRightClick={onEventRightClick}
                onEventComplete={completeHandler}
                onCreateTask={readOnly ? undefined : onCreateTask}
                children={children}
                familyId={familyId}
                preloadedBacklogEvents={preloadedBacklogEvents}
                preloadedTrashEvents={preloadedTrashEvents}
                preloadedSectionEvents={preloadedSectionEvents}
                plannerHolidaysCache={plannerHolidaysCache}
                plannerExclusions={plannerExclusions}
                plannerShellVisible={plannerShellVisible}
                viewActive
              />
            )
          )}
          {/* Web: keep Year view mounted so attendance grid state stays stable (no remount flash). */}
          {Platform.OS === 'web' && !isMobile ? (
            <View
              style={{
                flex: 1,
                minHeight: 0,
                ...(mode !== 'Year' ? { display: 'none' } : {}),
              }}
            >
              <AttendanceView
                familyId={familyId}
                children={children}
                events={filtered}
                onEventPress={onEventSelect}
                onEditChild={readOnly ? undefined : onEditChild}
                plannerInitialSnapshot={plannerAttendanceSnapshot}
                mode="overview"
                layoutMode="year-planner"
                plannerYearAnchor={viewDate}
                academicYears={academicYears}
                plannerChildFilterIds={filters?.childIds || []}
                onPlannerChildFilterChange={onChildFilterChange}
                readOnly={readOnly}
              />
            </View>
          ) : (
            mode === 'Year' && (
              <AttendanceView
                familyId={familyId}
                children={children}
                events={filtered}
                onEventPress={onEventSelect}
                onEditChild={readOnly ? undefined : onEditChild}
                plannerInitialSnapshot={plannerAttendanceSnapshot}
                mode="overview"
                layoutMode="year-planner"
                plannerYearAnchor={viewDate}
                academicYears={academicYears}
                plannerChildFilterIds={filters?.childIds || []}
                onPlannerChildFilterChange={onChildFilterChange}
                readOnly={readOnly}
              />
            )
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

