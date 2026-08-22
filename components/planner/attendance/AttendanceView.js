import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Platform, Modal, TouchableOpacity, Image } from 'react-native';
import { Check, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

/** Notify other views (planner calendar, home schedule, subject pages) so attendance stays in sync. */
function notifyAttendanceUpdated(patchedAttendances = []) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const latestByEventId = new Map();
    (Array.isArray(patchedAttendances) ? patchedAttendances : []).forEach((item) => {
      const eventId = String(item?.eventId || '').trim();
      if (!eventId) return;
      const normalizedStatus = String(item?.status || '').trim().toLowerCase();
      const status = normalizedStatus === 'completed' ? 'done' : (normalizedStatus || 'scheduled');
      latestByEventId.set(eventId, status);
    });
    latestByEventId.forEach((status, eventId) => {
      window.dispatchEvent(
        new CustomEvent('eventAttendancePatched', {
          detail: { eventId, status },
        })
      );
    });
    window.dispatchEvent(new CustomEvent('refreshCalendar', {
      detail: { skipCacheClear: true },
    }));
    window.dispatchEvent(new CustomEvent('refreshSubjects'));
  }
}
import { getAttendanceLogs, createAttendanceLog, updateAttendanceLog, deleteAttendanceLog } from '../../../lib/services/recordsClient';
import { updateEventStatus } from '../../../lib/services/attendanceClient';
import { getFamilyPlannerSettings, buildBulkTermOptionsFromPlannerSettings, pickCurrentTermStartFromPlannerSettings, getCachedPlannerTermOptions, setCachedPlannerTermOptions, deriveDefaultBulkTermOptions } from '../../../lib/services/plannerSettingsClient';
import { getCachedYearAttendanceBundle, setCachedYearAttendanceBundle } from '../../../lib/services/plannerPrefetch';
import { getAttendanceMode, isClassDayMode } from '../../../lib/attendanceMode';
import { trackEvent } from '../../../lib/analytics';
import HeaderSummaryStrip from './HeaderSummaryStrip';
import YearHeatmapGrid, { YearHeatmapLegend } from './YearHeatmapGrid';
import MonthlyCalendarView from './MonthlyCalendarView';
import DayEventsPanel from './DayEventsPanel';
import AttendanceExportModal from './AttendanceExportModal';
import { useToast } from '../../Toast';
import { TOKENS } from './constants';
import { isAllDayEvent, isTimelessUntimedEvent } from '../plannerListTableUtils';
import { resolveCalendarYearRange, buildMonthsInRange } from '../plannerYearRange';
import { sourceForChild } from '../../ui/ChildAvatarCluster';

const REQUIRED_DAYS_DEFAULT = 180;
const REQUIRED_HOURS_DEFAULT = 1000;
/** Minutes logged when marking a day present with no scheduled events (matches assistant quick-mark default). */
const STANDALONE_DAY_ATTENDANCE_MINUTES = 300;
const FAMILY_HEATMAP_CHILD_ID = '__family__';
const YEAR_PLANNER_MODE_ATTENDANCE = 'attendance';
const YEAR_PLANNER_MODE_EVENTS = 'events';
const YEAR_PLANNER_MODE_ORDER = [YEAR_PLANNER_MODE_EVENTS, YEAR_PLANNER_MODE_ATTENDANCE];
const YEAR_PLANNER_MODE_COPY = {
  [YEAR_PLANNER_MODE_ATTENDANCE]: {
    label: 'Attendance check',
    help: 'Click a day to mark it attended or unattended. You can mark days with no scheduled lessons. Shared lessons mark all filtered children attended; unmarking affects only the selected child.',
  },
  [YEAR_PLANNER_MODE_EVENTS]: {
    label: 'View events',
    help: 'Click a day to open that day’s lessons. Use the circle on each event to mark it attended or unattended. Only instructional-time events count toward attendance.',
  },
};
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Allowed attendance range: full year before through full year after current year. */
function getAttendanceMinMaxRange() {
  const now = new Date();
  const y = now.getFullYear();
  return {
    minStart: new Date(y - 1, 0, 1),
    maxEnd: new Date(y + 1, 11, 31),
  };
}

/** Clamp a calendar month (any date) to the feasible attendance range so the picker doesn't navigate outside it. */
function clampCalendarMonthToRange(d, minStart, maxEnd) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const minFirst = new Date(minStart.getFullYear(), minStart.getMonth(), 1);
  const maxFirst = new Date(maxEnd.getFullYear(), maxEnd.getMonth(), 1);
  if (first < minFirst) return minFirst;
  if (first > maxFirst) return maxFirst;
  return first;
}

function toLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function eventLocalDateKey(event) {
  if (!event) return null;
  const dateLocal = event.date_local || event.dateLocal;
  if (dateLocal) {
    const localPrefix = String(dateLocal).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(localPrefix)) return localPrefix;
  }
  const raw = event.start_local || event.start_ts || event.start;
  if (!raw) return null;
  if (event.start_local && typeof event.start_local === 'string') {
    const localPrefix = String(event.start_local).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(localPrefix)) return localPrefix;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalYYYYMMDD(parsed);
}

async function fetchEventsForLocalDateRange(familyId, yearStartKey, yearEndKey) {
  const months = buildMonthsInRange(yearStartKey, yearEndKey);
  if (!familyId || months.length === 0) return [];
  const responses = await Promise.all(
    months.map(({ year, monthIndex }) =>
      supabase.rpc('get_month_view', {
        _family_id: familyId,
        _year: year,
        _month: monthIndex + 1,
        _child_ids: null,
      })
    )
  );
  const byId = new Map();
  responses.forEach(({ data, error }) => {
    if (error || !data?.events_by_date) return;
    Object.entries(data.events_by_date).forEach(([dateKey, dayEvents]) => {
      const list = Array.isArray(dayEvents)
        ? dayEvents
        : (dayEvents?.events && Array.isArray(dayEvents.events) ? dayEvents.events : []);
      (list || []).forEach((eventItem) => {
        if (!eventItem?.id) return;
        const normalizedDate = String(eventItem.date_local || dateKey || '').slice(0, 10);
        byId.set(String(eventItem.id), {
          ...eventItem,
          date_local: /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) ? normalizedDate : eventItem.date_local,
        });
      });
    });
  });
  return Array.from(byId.values());
}

function getEventChildIds(event, fallbackChildIds = []) {
  if (!event) return [];
  const ids = event.child_ids && Array.isArray(event.child_ids) && event.child_ids.length > 0
    ? event.child_ids
    : (event.child_id || event.childId || event.student_id
      ? [event.child_id || event.childId || event.student_id]
      : []);
  const normalized = ids.filter(Boolean).map((id) => String(id));
  if (normalized.length > 0) return normalized;
  return (fallbackChildIds || []).map((id) => String(id)).filter(Boolean);
}

function isEventAttendancePresent(event) {
  if (!event) return false;
  const status = String(event.status || event.data?.status || '').trim().toLowerCase();
  if (status === 'done' || status === 'completed') return true;
  const instructional = String(
    event.instructional_status || event.data?.instructional_status || ''
  ).trim().toUpperCase();
  return instructional === 'MANUAL_COUNTS';
}

function dateStringToDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return new Date();
  return new Date(ymd + 'T12:00:00');
}

function formatDateDisplay(ymd) {
  if (!ymd) return '';
  const d = dateStringToDate(ymd);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDefaultYearRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  // School year: Sept (8) -> next year June (5)
  const start = month >= 8 ? new Date(year, 7, 1) : new Date(year - 1, 8, 1);
  const end = month >= 8 ? new Date(year + 1, 5, 30) : new Date(year, 5, 30);
  return { start, end };
}

function formatDateLabel(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getDateKeysInRange(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const keys = [];
  const current = new Date(startDate);
  current.setHours(12, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(12, 0, 0, 0);
  while (current <= end) {
    keys.push(toLocalYYYYMMDD(current));
    current.setDate(current.getDate() + 1);
    if (keys.length > 800) break;
  }
  return keys;
}

/** Days off (holidays, breaks, vacations) are never instructional and must not be markable. */
const OFF_DAY_EVENT_TYPES = new Set(['break', 'day off', 'holiday', 'vacation']);
function isOffDayEvent(e) {
  return OFF_DAY_EVENT_TYPES.has(String(e?.event_type || '').trim().toLowerCase());
}

/** Only events marked as counting toward instructional time are used for attendance. */
function isInstructionalEvent(e) {
  if (String(e?.event_type || '').trim().toLowerCase() === 'classday') return true;
  const status = e.instructional_status;
  if (status === 'MANUAL_COUNTS' || status === 'PLAN_PLACEHOLDER') return true;
  if (e.counts_toward_plan === true) return true;
  return false;
}

function isInstructionalEventForMode(e, attendanceTrackingMode = 'subject') {
  const mode = getAttendanceMode({ academicYearMode: attendanceTrackingMode });
  if (!isClassDayMode(mode)) return isInstructionalEvent(e);
  const eventType = String(e?.event_type || '').trim().toLowerCase();
  if (eventType === 'classday') return true;
  const status = String(e?.instructional_status || '').trim().toUpperCase();
  const counts = e?.counts_toward_plan === true || status === 'MANUAL_COUNTS' || status === 'PLAN_PLACEHOLDER';
  // In class-day mode, avoid subject-scoped rows; count generic instructional-day rows only.
  return counts && (e?.subject_id == null || String(e?.subject_id || '').trim() === '');
}

function resolveWarmTermOptions(familyId, snapshot, yearAnchor) {
  const cached = familyId ? getCachedPlannerTermOptions(familyId) : null;
  if (cached?.termOptions?.length) return cached;
  if (snapshot?.termOptions?.length && snapshot.familyId === familyId) {
    return {
      termOptions: snapshot.termOptions,
      bulkTermStartKey: snapshot.bulkTermStartKey || null,
      selectedBulkTermIdx: snapshot.selectedBulkTermIdx ?? 0,
    };
  }
  const anchor = yearAnchor instanceof Date
    ? yearAnchor
    : (yearAnchor ? new Date(yearAnchor) : new Date());
  return {
    termOptions: deriveDefaultBulkTermOptions(anchor),
    bulkTermStartKey: null,
    selectedBulkTermIdx: 0,
  };
}

function resolveWarmAttendanceBundle(familyId, layoutMode, yearAnchor, snapshot) {
  if (layoutMode === 'year-planner' && familyId && yearAnchor) {
    const { yearStart, yearEnd } = resolveCalendarYearRange(yearAnchor);
    const cached = getCachedYearAttendanceBundle(familyId, yearStart, yearEnd);
    if (cached) return cached;
  }
  if (snapshot?.familyId === familyId && Array.isArray(snapshot.attendanceRecords)) {
    return {
      attendanceRecords: snapshot.attendanceRecords,
      yearEvents: snapshot.yearEvents || [],
    };
  }
  return { attendanceRecords: [], yearEvents: [] };
}

export default function AttendanceView({
  familyId,
  children: childrenProp = [],
  events: eventsProp = [],
  onEventPress,
  onEditChild = null,
  plannerInitialSnapshot = null,
  mode = 'overview',
  layoutMode = 'default',
  plannerYearAnchor = null,
  academicYears = null,
  plannerChildFilterIds = null,
  onPlannerChildFilterChange = null,
  renderBelowToolbar = null,
  readOnly = false,
}) {
  const [loading, setLoading] = useState(true);
  const [academicYear, setAcademicYear] = useState(null);
  const [yearRange, setYearRange] = useState(getDefaultYearRange());
  const [attendanceRecords, setAttendanceRecords] = useState(() =>
    resolveWarmAttendanceBundle(familyId, layoutMode, plannerYearAnchor, plannerInitialSnapshot).attendanceRecords
  );
  const [yearEvents, setYearEvents] = useState(() =>
    resolveWarmAttendanceBundle(familyId, layoutMode, plannerYearAnchor, plannerInitialSnapshot).yearEvents
  );
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState({ dateKey: null, childId: null });
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportModalChildId, setExportModalChildId] = useState(null);
  const [attendanceRefreshKey, setAttendanceRefreshKey] = useState(0);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [startDateCalendarMonth, setStartDateCalendarMonth] = useState(() => new Date());
  const [endDateCalendarMonth, setEndDateCalendarMonth] = useState(() => new Date());
  const [rangeReady, setRangeReady] = useState(false);
  const [markingRangeAttended, setMarkingRangeAttended] = useState(false);
  const [confirmRangeVisible, setConfirmRangeVisible] = useState(false);
  const [termCountsModalVisible, setTermCountsModalVisible] = useState(false);
  const [selectedHeatmapChildId, setSelectedHeatmapChildId] = useState(null);
  const [yearPlannerInteractionMode, setYearPlannerInteractionMode] = useState(YEAR_PLANNER_MODE_EVENTS);
  const [yearPlannerDayPanelVisible, setYearPlannerDayPanelVisible] = useState(false);
  // Start of the current term/semester (YYYY-MM-DD); used to bound the year-planner bulk range.
  const [bulkTermStartKey, setBulkTermStartKey] = useState(() =>
    resolveWarmTermOptions(familyId, plannerInitialSnapshot, plannerYearAnchor).bulkTermStartKey
  );
  // All available terms for the term chooser in the bulk modal.
  const [bulkTermOptions, setBulkTermOptions] = useState(() =>
    resolveWarmTermOptions(familyId, plannerInitialSnapshot, plannerYearAnchor).termOptions
  );
  const [selectedBulkTermIdx, setSelectedBulkTermIdx] = useState(() =>
    resolveWarmTermOptions(familyId, plannerInitialSnapshot, plannerYearAnchor).selectedBulkTermIdx ?? 0
  );
  // Snapshot of the last bulk run so it can be undone.
  const [lastBulkUndo, setLastBulkUndo] = useState(null);
  const [undoingBulk, setUndoingBulk] = useState(false);
  // Family for which the live (full-range) fetch has populated records/events.
  // Prevents a late-arriving prefetch snapshot (which only covers the narrower
  // academic-year range) from clobbering full calendar-year data.
  const liveDataLoadedFamilyRef = React.useRef(null);

  const toast = useToast();
  const familyIdResolved = familyId || eventsProp[0]?.family_id || eventsProp[0]?.familyId;
  const children = childrenProp.length > 0 ? childrenProp : [];
  const isDrilldownMode = mode === 'drilldown';
  const isYearPlannerLayout = layoutMode === 'year-planner';

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = () => {
      if (!isYearPlannerLayout || readOnly || children.length === 0) return;
      setConfirmRangeVisible(true);
    };
    window.addEventListener('openPlannerBulkAttendance', handler);
    return () => window.removeEventListener('openPlannerBulkAttendance', handler);
  }, [isYearPlannerLayout, readOnly, children.length]);

  const { minStart, maxEnd } = useMemo(() => getAttendanceMinMaxRange(), []);
  const minStartKey = toLocalYYYYMMDD(minStart);
  const maxEndKey = toLocalYYYYMMDD(maxEnd);

  // Set initial year range from academic year when family/children change (do not overwrite user-selected range later).
  useEffect(() => {
    if (!familyIdResolved) {
      setLoading(false);
      setYearRange(getDefaultYearRange());
      setRangeReady(false);
      return;
    }
    // Apply prefetch whenever family matches (childCount can differ if children loaded after prefetch — refetch below corrects).
    if (plannerInitialSnapshot && plannerInitialSnapshot.familyId === familyIdResolved) {
      const snap = plannerInitialSnapshot;
      setAcademicYear(snap.academicYear ?? null);
      if (!isYearPlannerLayout) {
        setYearRange({
          start: new Date(snap.yearRange.start),
          end: new Date(snap.yearRange.end),
        });
      }
      // Skip seeding from the snapshot once the live fetch has loaded the full
      // range — otherwise the (narrower) snapshot overwrites earlier-year data
      // and those days vanish until the next refetch.
      if (liveDataLoadedFamilyRef.current !== familyIdResolved) {
        setAttendanceRecords(snap.attendanceRecords ?? []);
        setYearEvents(snap.yearEvents ?? []);
      }
      if (snap.termOptions?.length) {
        setBulkTermOptions(snap.termOptions);
        if (snap.bulkTermStartKey) setBulkTermStartKey(snap.bulkTermStartKey);
        setSelectedBulkTermIdx(snap.selectedBulkTermIdx ?? 0);
        setCachedPlannerTermOptions(familyIdResolved, {
          termOptions: snap.termOptions,
          bulkTermStartKey: snap.bulkTermStartKey,
          selectedBulkTermIdx: snap.selectedBulkTermIdx ?? 0,
        });
      }
      if (!isYearPlannerLayout) {
        setRangeReady(true);
      }
      setLoading(false);
      return;
    }
    if (isYearPlannerLayout) {
      let cancelled = false;
      (async () => {
        try {
          const { data: years } = await supabase
            .from('academic_years')
            .select('id, year_name, start_date, end_date, attendance_tracking_mode')
            .eq('family_id', familyIdResolved)
            .order('start_date', { ascending: false })
            .limit(1);
          if (!cancelled && years?.[0]) setAcademicYear(years[0]);
        } catch (_) {
          // range + records load via plannerYearAnchor effect / fetch effect
        }
      })();
      return () => { cancelled = true; };
    }
    setRangeReady(false);
    let cancelled = false;
    (async () => {
      try {
        const { data: years } = await supabase
          .from('academic_years')
          .select('id, year_name, start_date, end_date, attendance_tracking_mode')
          .eq('family_id', familyIdResolved)
          .order('start_date', { ascending: false })
          .limit(1);

        const defaultRange = getDefaultYearRange();
        let rangeStart;
        let rangeEnd;
        if (years?.[0]) {
          const ay = years[0];
          setAcademicYear(ay);
          const ayStart = new Date(ay.start_date + 'T12:00:00');
          const ayEnd = new Date(ay.end_date + 'T12:00:00');
          rangeStart = new Date(ayStart.getFullYear(), ayStart.getMonth(), 1);
          rangeEnd = ayEnd;
        } else {
          rangeStart = defaultRange.start;
          rangeEnd = defaultRange.end;
        }
        if (!cancelled) {
          setYearRange({ start: rangeStart, end: rangeEnd });
          setRangeReady(true);
        }
      } catch (_) {
        if (!cancelled) setRangeReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [familyIdResolved, plannerInitialSnapshot, isYearPlannerLayout]);

  useEffect(() => {
    if (!isYearPlannerLayout || !plannerYearAnchor || !familyIdResolved) return;
    const { yearStart, yearEnd } = resolveCalendarYearRange(plannerYearAnchor);
    setYearRange({
      start: dateStringToDate(yearStart),
      end: dateStringToDate(yearEnd),
    });
    setRangeReady(true);
    setLoading(false);
  }, [isYearPlannerLayout, plannerYearAnchor, familyIdResolved]);

  // Resolve the current term/semester start so the year-planner bulk action defaults
  // to "term start -> today" instead of the whole calendar year.
  useEffect(() => {
    if (!isYearPlannerLayout || !plannerYearAnchor || !familyIdResolved) return;
    const { yearStart, yearEnd } = resolveCalendarYearRange(plannerYearAnchor);
    const cached = getCachedYearAttendanceBundle(familyIdResolved, yearStart, yearEnd);
    if (cached) {
      setAttendanceRecords(cached.attendanceRecords);
      setYearEvents(cached.yearEvents);
    }
  }, [isYearPlannerLayout, plannerYearAnchor, familyIdResolved]);

  useEffect(() => {
    if (!isYearPlannerLayout || !familyIdResolved) return undefined;
    const cached = getCachedPlannerTermOptions(familyIdResolved);
    if (cached?.termOptions?.length) {
      setBulkTermOptions(cached.termOptions);
      if (cached.bulkTermStartKey) setBulkTermStartKey(cached.bulkTermStartKey);
      setSelectedBulkTermIdx(cached.selectedBulkTermIdx ?? 0);
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: settings } = await getFamilyPlannerSettings(familyIdResolved);
        const start = pickCurrentTermStartFromPlannerSettings(settings, new Date());
        if (!cancelled && start) setBulkTermStartKey(start);

        if (!cancelled && settings) {
          const terms = buildBulkTermOptionsFromPlannerSettings(settings);
          if (terms.length > 0) {
            const todayKey = toLocalYYYYMMDD(new Date());
            const currentIdx = terms.findIndex((t) => t.start <= todayKey && todayKey <= t.end);
            const nextIdx = currentIdx >= 0 ? currentIdx : 0;
            setBulkTermOptions(terms);
            setSelectedBulkTermIdx(nextIdx);
            setCachedPlannerTermOptions(familyIdResolved, {
              termOptions: terms,
              bulkTermStartKey: start,
              selectedBulkTermIdx: nextIdx,
            });
          }
        }
      } catch (_) {
        // Falls back to academic-year start / calendar-year start at bulk time.
      }
    })();
    return () => { cancelled = true; };
  }, [isYearPlannerLayout, familyIdResolved]);

  // Fetch attendance and events when year range (or family/children/refresh) changes.
  const yearStartKey = yearRange.start ? toLocalYYYYMMDD(yearRange.start) : '';
  const yearEndKey = yearRange.end ? toLocalYYYYMMDD(yearRange.end) : '';
  useEffect(() => {
    if (!familyIdResolved || !rangeReady || !yearStartKey || !yearEndKey) return;
    let cancelled = false;
    (async () => {
      try {
        const fetchStart = dateStringToDate(yearStartKey);
        fetchStart.setHours(0, 0, 0, 0);
        const fetchEnd = dateStringToDate(yearEndKey);
        fetchEnd.setHours(23, 59, 59, 999);
        const startStr = yearStartKey;
        const endStr = yearEndKey;
        const childIds = children.map((c) => c.id);
        const [logs, eventsData] = await Promise.all([
          getAttendanceLogs(familyIdResolved, childIds.length ? childIds : null, { start: startStr, end: endStr }),
          isYearPlannerLayout
            ? fetchEventsForLocalDateRange(familyIdResolved, startStr, endStr)
            : supabase
              .from('events')
              .select('*')
              .eq('family_id', familyIdResolved)
              .gte('start_ts', fetchStart.toISOString())
              .lte('start_ts', fetchEnd.toISOString())
              .neq('status', 'canceled')
              .is('deleted_at', null)
              .order('start_ts', { ascending: true })
              .then(({ data, error }) => {
                if (error) throw error;
                return data || [];
              }),
        ]);
        if (!cancelled) {
          liveDataLoadedFamilyRef.current = familyIdResolved;
          const nextRecords = logs || [];
          const nextEvents = Array.isArray(eventsData) ? eventsData : [];
          setAttendanceRecords(nextRecords);
          setYearEvents(nextEvents);
          setCachedYearAttendanceBundle(familyIdResolved, yearStartKey, yearEndKey, {
            attendanceRecords: nextRecords,
            yearEvents: nextEvents,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setAttendanceRecords((prev) => prev);
          setYearEvents((prev) => prev);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [familyIdResolved, rangeReady, yearStartKey, yearEndKey, children.length, attendanceRefreshKey, isYearPlannerLayout]);

  const attendanceTrackingMode = getAttendanceMode({ academicYearMode: academicYear?.attendance_tracking_mode });

  const mergedPlannerEvents = useMemo(() => {
    const byId = new Map();
    (yearEvents || []).forEach((eventItem) => {
      if (eventItem?.id) byId.set(String(eventItem.id), eventItem);
    });
    (eventsProp || []).forEach((eventItem) => {
      if (eventItem?.id) byId.set(String(eventItem.id), eventItem);
    });
    return Array.from(byId.values());
  }, [yearEvents, eventsProp]);

  const eventsInRange = useMemo(() => {
    if (!yearStartKey || !yearEndKey) return [];
    const inRangeByDate = (eventItem) => {
      const key = eventLocalDateKey(eventItem);
      return Boolean(key && key >= yearStartKey && key <= yearEndKey);
    };
    const source = isYearPlannerLayout
      ? mergedPlannerEvents
      : (yearEvents.length > 0 ? yearEvents : eventsProp);
    return (source || []).filter(inRangeByDate);
  }, [yearStartKey, yearEndKey, isYearPlannerLayout, mergedPlannerEvents, yearEvents, eventsProp]);

  // Dates that are days off (holiday/break/vacation) and have no real lesson — these
  // must not be clickable or counted for attendance in the year planner.
  const offDayKeys = useMemo(() => {
    const byDate = new Map();
    (eventsInRange || []).forEach((eventItem) => {
      const key = eventLocalDateKey(eventItem);
      if (!key) return;
      const entry = byDate.get(key) || { hasOff: false, hasLesson: false };
      if (isOffDayEvent(eventItem)) entry.hasOff = true;
      else entry.hasLesson = true;
      byDate.set(key, entry);
    });
    const set = new Set();
    byDate.forEach((entry, key) => {
      if (entry.hasOff && !entry.hasLesson) set.add(key);
    });
    return set;
  }, [eventsInRange]);

  const events = useMemo(() => {
    if (isYearPlannerLayout) return eventsInRange.filter((eventItem) => !isOffDayEvent(eventItem));
    return eventsInRange.filter((eventItem) => isInstructionalEventForMode(eventItem, attendanceTrackingMode));
  }, [eventsInRange, isYearPlannerLayout, attendanceTrackingMode]);

  const eventsByDateChild = useMemo(() => {
    const map = {};
    const fallbackChildIds = children.map((child) => child.id).filter(Boolean);
    events.forEach((e) => {
      const dateStr = eventLocalDateKey(e);
      if (!dateStr) return;
      getEventChildIds(e, fallbackChildIds).forEach((childId) => {
        if (!map[dateStr]) map[dateStr] = {};
        if (!map[dateStr][childId]) map[dateStr][childId] = [];
        map[dateStr][childId].push(e);
      });
    });
    return map;
  }, [events, children]);

  const attendanceByEventId = useMemo(() => {
    const map = {};
    attendanceRecords.forEach((r) => {
      if (r.event_id) map[r.event_id] = r.status || 'present';
    });
    return map;
  }, [attendanceRecords]);

  const dayStatusByChild = useMemo(() => {
    const byChild = {};
    const endStr = yearEndKey;
    const startAnchor = yearStartKey ? dateStringToDate(yearStartKey) : null;
    if (!startAnchor || !endStr) return byChild;
    const todayKey = toLocalYYYYMMDD(new Date());
    children.forEach((c) => { byChild[c.id] = {}; });
    for (let i = 0; i < 400; i += 1) {
      const d = new Date(startAnchor);
      d.setDate(d.getDate() + i);
      const key = toLocalYYYYMMDD(d);
      if (key > endStr) break;
      const isPastDay = key < todayKey;
      children.forEach((c) => {
        const dayEvents = eventsByDateChild[key]?.[c.id] || [];
        const recordsForDay = attendanceRecords.filter(
          (r) => String(r.child_id) === String(c.id)
            && (r.day_date === key || (r.day_date && String(r.day_date).slice(0, 10) === key))
        );
        const eventIds = new Set(dayEvents.map((e) => String(e.id)));
        const hasEvent = (r) => r.event_id != null && eventIds.has(String(r.event_id));
        const standalonePresent =
          recordsForDay.some((r) => r.event_id == null && r.status === 'present');
        const presentForEvents = new Set(
          recordsForDay.filter((r) => r.status === 'present' && hasEvent(r)).map((r) => r.event_id)
        );
        const eventMarkedPresent = dayEvents.some(isEventAttendancePresent);
        if (dayEvents.length === 0) {
          byChild[c.id][key] = standalonePresent ? 'present' : 'noEvents';
        } else if (presentForEvents.size >= 1 || standalonePresent || eventMarkedPresent) {
          byChild[c.id][key] = 'present';
        } else {
          byChild[c.id][key] = isPastDay ? 'absent' : 'unmarked';
        }
      });
    }
    return byChild;
  }, [children, yearStartKey, yearEndKey, eventsByDateChild, attendanceRecords]);

  // Year planner: Filters "By child" is All (empty) or exactly one id.
  const yearChildFilterId = useMemo(() => {
    if (!Array.isArray(plannerChildFilterIds) || plannerChildFilterIds.length !== 1) return null;
    return String(plannerChildFilterIds[0]);
  }, [plannerChildFilterIds]);

  // Prefer toolbar Filters; fall back to local chip state when Filters isn't wired.
  const effectiveYearChildId = useMemo(() => {
    if (yearChildFilterId) return yearChildFilterId;
    if (
      selectedHeatmapChildId
      && selectedHeatmapChildId !== FAMILY_HEATMAP_CHILD_ID
      && typeof onPlannerChildFilterChange !== 'function'
    ) {
      return String(selectedHeatmapChildId);
    }
    return null;
  }, [yearChildFilterId, selectedHeatmapChildId, onPlannerChildFilterChange]);

  const visibleHeatmapChildren = useMemo(() => {
    if (!isYearPlannerLayout) return children;
    if (effectiveYearChildId) {
      const narrowed = children.filter((child) => String(child?.id) === effectiveYearChildId);
      return narrowed.length > 0 ? narrowed : children;
    }
    return children;
  }, [children, isYearPlannerLayout, effectiveYearChildId]);

  const heatmapSelectedChildId = useMemo(() => {
    if (!isYearPlannerLayout) return selectedHeatmapChildId;
    if (visibleHeatmapChildren.length === 1) return visibleHeatmapChildren[0]?.id ?? null;
    if (visibleHeatmapChildren.length === 0) return null;
    return FAMILY_HEATMAP_CHILD_ID;
  }, [isYearPlannerLayout, selectedHeatmapChildId, visibleHeatmapChildren]);

  const setYearChildFilter = useCallback((childIdOrNull) => {
    if (typeof onPlannerChildFilterChange === 'function') {
      onPlannerChildFilterChange(childIdOrNull ? [childIdOrNull] : null);
      return;
    }
    // Fallback when Filters is not wired (standalone attendance).
    setSelectedHeatmapChildId(childIdOrNull || null);
  }, [onPlannerChildFilterChange]);

  const heatmapDayStatusByChild = useMemo(() => {
    if (heatmapSelectedChildId !== FAMILY_HEATMAP_CHILD_ID) return dayStatusByChild;
    const familyStatus = {};
    const childIds = visibleHeatmapChildren.map((child) => child.id).filter(Boolean);
    const startAnchor = yearStartKey ? dateStringToDate(yearStartKey) : null;
    const endStr = yearEndKey;
    if (!startAnchor || !endStr) return { [FAMILY_HEATMAP_CHILD_ID]: {} };
    for (let i = 0; i < 400; i += 1) {
      const d = new Date(startAnchor);
      d.setDate(d.getDate() + i);
      const key = toLocalYYYYMMDD(d);
      if (key > endStr) break;
      const statuses = childIds.map((id) => dayStatusByChild[id]?.[key] || 'noEvents');
      if (statuses.every((status) => status === 'noEvents')) {
        familyStatus[key] = 'noEvents';
      } else if (statuses.some((status) => status === 'present')) {
        familyStatus[key] = 'present';
      } else if (statuses.some((status) => status === 'unmarked')) {
        familyStatus[key] = 'unmarked';
      } else if (statuses.some((status) => status === 'absent')) {
        familyStatus[key] = 'absent';
      } else {
        familyStatus[key] = 'noEvents';
      }
    }
    return { [FAMILY_HEATMAP_CHILD_ID]: familyStatus };
  }, [dayStatusByChild, heatmapSelectedChildId, visibleHeatmapChildren, yearStartKey, yearEndKey]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = () => {
      if (!isYearPlannerLayout || children.length === 0) return;
      if (
        heatmapSelectedChildId
        && heatmapSelectedChildId !== FAMILY_HEATMAP_CHILD_ID
      ) {
        setExportModalChildId(heatmapSelectedChildId);
      } else {
        setExportModalChildId(null);
      }
      setExportModalVisible(true);
    };
    window.addEventListener('openPlannerExportAttendance', handler);
    return () => window.removeEventListener('openPlannerExportAttendance', handler);
  }, [isYearPlannerLayout, children.length, heatmapSelectedChildId]);

  useEffect(() => {
    if (yearPlannerInteractionMode !== YEAR_PLANNER_MODE_EVENTS) {
      setYearPlannerDayPanelVisible(false);
    }
  }, [yearPlannerInteractionMode]);

  const yearPlannerDayChildId = useMemo(() => {
    if (!isYearPlannerLayout) return null;
    if (heatmapSelectedChildId && heatmapSelectedChildId !== FAMILY_HEATMAP_CHILD_ID) {
      return heatmapSelectedChildId;
    }
    return null;
  }, [isYearPlannerLayout, heatmapSelectedChildId]);

  const summaryPerChild = useMemo(() => {
    return children.map((c) => {
      const daysSet = new Set();
      const minutesByDay = {};
      attendanceRecords.filter((r) => r.child_id === c.id && r.status === 'present').forEach((r) => {
        const day = r.day_date?.slice?.(0, 10) || r.day_date;
        if (day) {
          daysSet.add(day);
          minutesByDay[day] = (minutesByDay[day] || 0) + (r.minutes || 0);
        }
      });
      const daysAttended = daysSet.size;
      const requiredDays = academicYear?.target_instructional_days ?? REQUIRED_DAYS_DEFAULT;
      const percent = requiredDays ? Math.round((daysAttended / requiredDays) * 100) : 0;
      let status = 'on_track';
      if (percent < 70) status = 'at_risk';
      else if (percent < 85) status = 'slightly_behind';
      return {
        childId: c.id,
        childName: c.first_name || c.name || 'Child',
        daysAttended,
        requiredDays,
        percent,
        status,
      };
    });
  }, [children, attendanceRecords, academicYear]);

  useEffect(() => {
    if (isYearPlannerLayout) return;
    if (children.length === 0) {
      setSelectedHeatmapChildId(null);
      return;
    }
    setSelectedHeatmapChildId((prev) => {
      if (prev && children.some((c) => c.id === prev)) return prev;
      return children[0]?.id ?? null;
    });
  }, [children, isYearPlannerLayout]);

  const exceptions = useMemo(() => {
    const list = [];
    const seen = new Set();
    const getChildEventStatus = (childId, eventId, dateStr) => {
      const r = attendanceRecords.find(
        (rec) => String(rec.child_id) === String(childId) && rec.event_id === eventId && String(rec.day_date).slice(0, 10) === dateStr
      );
      return r?.status ?? null;
    };
    Object.keys(eventsByDateChild).forEach((dateStr) => {
      Object.keys(eventsByDateChild[dateStr]).forEach((childId) => {
        const child = children.find((c) => c.id === childId);
        const dayEvents = eventsByDateChild[dateStr][childId];
        const present = dayEvents.filter((e) => getChildEventStatus(childId, e.id, dateStr) === 'present').length;
        const absent = dayEvents.filter((e) => getChildEventStatus(childId, e.id, dateStr) === 'absent').length;
        if (present === 0 && absent === 0) {
          const key = `${dateStr}-${childId}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              id: key,
              dateStr,
              childId,
              dateLabel: formatDateLabel(dateStr),
              childName: child?.first_name || child?.name || 'Child',
              description: dayEvents.length === 1
                ? `${dayEvents[0].title || 'Lesson'} — attendance not marked`
                : `${dayEvents.length} lessons scheduled — no attendance recorded`,
            });
          }
        } else if (absent === dayEvents.length && dayEvents.length > 0) {
          const key = `absent-${dateStr}-${childId}`;
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              id: key,
              dateStr,
              childId,
              dateLabel: formatDateLabel(dateStr),
              childName: child?.first_name || child?.name || 'Child',
              description: 'marked unattended',
            });
          }
        }
      });
    });
    return list.sort((a, b) => (b.dateLabel > a.dateLabel ? 1 : -1));
  }, [eventsByDateChild, children, attendanceRecords]);

  const totalsPerChild = useMemo(() => {
    return children.map((c) => {
      const minutes = attendanceRecords
        .filter((r) => r.child_id === c.id && r.status === 'present')
        .reduce((sum, r) => sum + (r.minutes || 0), 0);
      const daysSet = new Set();
      attendanceRecords.filter((r) => r.child_id === c.id && r.status === 'present').forEach((r) => {
        const day = r.day_date?.slice?.(0, 10) || r.day_date;
        if (day) daysSet.add(day);
      });
      const requiredDays = academicYear?.target_instructional_days ?? REQUIRED_DAYS_DEFAULT;
      const requiredHours = academicYear?.target_instructional_hours ?? REQUIRED_HOURS_DEFAULT;
      const hoursLogged = Math.round(minutes / 60);
      const atRisk = requiredDays && daysSet.size < requiredDays * 0.7;
      let projectedCompletion = null;
      if (yearRange.end && requiredDays) {
        const needMore = Math.max(0, requiredDays - daysSet.size);
        if (needMore > 0) {
          const d = new Date(yearRange.end);
          d.setDate(d.getDate() + Math.ceil(needMore * 1.2));
          projectedCompletion = d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
        } else {
          projectedCompletion = yearRange.end.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' });
        }
      }
      return {
        childId: c.id,
        childName: c.first_name || c.name || 'Child',
        daysAttended: daysSet.size,
        hoursLogged,
        requiredDays,
        requiredHours,
        projectedCompletion,
        atRisk,
      };
    });
  }, [children, attendanceRecords, academicYear, yearRange]);

  const exportModalChildren = isYearPlannerLayout ? visibleHeatmapChildren : children;

  const exportRows = useMemo(() => {
    const startAnchor = yearStartKey ? dateStringToDate(yearStartKey) : null;
    const endStr = yearEndKey;
    if (!startAnchor || !endStr) return [];
    const rows = [];
    for (let i = 0; i < 400; i += 1) {
      const d = new Date(startAnchor);
      d.setDate(d.getDate() + i);
      const dateKey = toLocalYYYYMMDD(d);
      if (dateKey > endStr) break;
      const childStatuses = {};
      children.forEach((c) => {
        childStatuses[c.id] = dayStatusByChild[c.id]?.[dateKey] || 'noEvents';
      });
      rows.push({
        dateKey,
        dateLabel: formatDateLabel(dateKey),
        childStatuses,
      });
    }
    return rows;
  }, [yearStartKey, yearEndKey, children, dayStatusByChild]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDay.dateKey) return [];
    const scopeChildren = isYearPlannerLayout ? visibleHeatmapChildren : children;
    if (selectedDay.childId != null) {
      return eventsByDateChild[selectedDay.dateKey]?.[selectedDay.childId] || [];
    }
    const byChild = eventsByDateChild[selectedDay.dateKey];
    if (!byChild) return [];
    const seen = new Set();
    const list = [];
    scopeChildren.forEach((c) => {
      (byChild[c.id] || []).forEach((e) => {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          list.push(e);
        }
      });
    });
    return list.sort((a, b) => (a.start_ts || a.start || '').localeCompare(b.start_ts || b.start || ''));
  }, [selectedDay.dateKey, selectedDay.childId, eventsByDateChild, children, isYearPlannerLayout, visibleHeatmapChildren]);
  const selectedDayChild = selectedDay.childId != null ? children.find((c) => c.id === selectedDay.childId) : null;

  const yearPlannerDayPanelChildName = useMemo(() => {
    if (yearPlannerDayChildId) {
      const child = children.find((c) => c.id === yearPlannerDayChildId);
      return child?.first_name || child?.name || 'Child';
    }
    if (visibleHeatmapChildren.length === children.length) return 'All children';
    if (visibleHeatmapChildren.length === 1) {
      const child = visibleHeatmapChildren[0];
      return child?.first_name || child?.name || 'Child';
    }
    return `${visibleHeatmapChildren.length} children`;
  }, [yearPlannerDayChildId, visibleHeatmapChildren, children.length, children]);

  const handleDayPress = useCallback((dateKey, childId) => {
    setSelectedDay({ dateKey, childId: childId !== undefined ? childId : null });
  }, []);

  const handleYearPlannerDayPress = useCallback((dateKey) => {
    setSelectedDay({ dateKey, childId: yearPlannerDayChildId });
    setYearPlannerDayPanelVisible(true);
  }, [yearPlannerDayChildId]);

  const getEventMinutes = useCallback((e) => {
    // Untimed/all-day rows use a full-day placeholder span (~1440 min). That is
    // placement only — do not treat it as a real 24h duration.
    if (isTimelessUntimedEvent(e) || isAllDayEvent(e)) {
      const explicit = e.minutes != null ? Number(e.minutes) : null;
      if (Number.isFinite(explicit) && explicit > 0 && explicit < 12 * 60) {
        return Math.round(explicit);
      }
      return 0;
    }

    let n = null;
    if (e.duration_minutes != null) {
      n = Math.round(Number(e.duration_minutes));
    } else if (e.minutes != null) {
      n = Math.round(Number(e.minutes));
    } else {
      const start = e.start_ts || e.start || e.start_local;
      const end = e.end_ts || e.end;
      if (start && end) {
        n = Math.round((new Date(end) - new Date(start)) / 60000);
      }
    }
    if (!Number.isFinite(n) || n <= 0) return 0;

    // Defensive: midnight + ~full-day float from EXTRACT(EPOCH)/60 should not
    // count as 24h of instructional time when helpers miss the untimed flag.
    if (n >= 23 * 60 && n <= 24 * 60) {
      const start = e.start_ts || e.start || e.start_local;
      if (start) {
        const d = new Date(start);
        if (!Number.isNaN(d.getTime()) && d.getHours() === 0 && d.getMinutes() === 0) {
          return 0;
        }
      }
    }
    return n;
  }, []);

  /** Child IDs explicitly assigned to this event (shared events have multiple). Only these children get attendance. */
  const getChildIdsForEvent = useCallback((event) => getEventChildIds(event), []);

  /** Events on the same day that are the same "lesson" (same source_block_id = per-child plan events, or same id). */
  const getSiblingEventsOnDay = useCallback((dateKey, event, eventsList) => {
    if (!event || !dateKey || !eventsList?.length) return [event].filter(Boolean);
    const key = String(dateKey).slice(0, 10);
    const blockId = event.source_block_id;
    return eventsList.filter((ev) => {
      const evDate = eventLocalDateKey(ev);
      if (evDate !== key) return false;
      if (blockId) return ev.source_block_id === blockId;
      return ev.id === event.id;
    });
  }, []);

  const attendanceRecordByEventId = useMemo(() => {
    if (!selectedDay.dateKey) return {};
    const key = String(selectedDay.dateKey).slice(0, 10);
    const map = {};
    const multi = selectedDay.childId == null;
    attendanceRecords.forEach((r) => {
      if (String(r.day_date).slice(0, 10) !== key || !r.event_id) return;
      if (selectedDay.childId != null && String(r.child_id) !== String(selectedDay.childId)) return;
      if (multi) {
        if (!map[r.event_id]) map[r.event_id] = [];
        map[r.event_id].push(r);
      } else {
        map[r.event_id] = r;
      }
    });
    return map;
  }, [selectedDay.dateKey, selectedDay.childId, attendanceRecords]);

  /** Per-event attendance for the selected day. When viewing all children: present if any child present, else absent if any absent, else unmarked. */
  const selectedDayAttendanceByEventId = useMemo(() => {
    const map = {};
    Object.entries(attendanceRecordByEventId).forEach(([eid, recOrList]) => {
      const list = Array.isArray(recOrList) ? recOrList : (recOrList ? [recOrList] : []);
      const anyPresent = list.some((r) => r.status === 'present');
      const anyAbsent = list.some((r) => r.status === 'absent');
      map[eid] = anyPresent ? 'present' : anyAbsent ? 'absent' : 'unmarked';
    });
    return map;
  }, [attendanceRecordByEventId]);

  const handleToggleEventAttendance = useCallback(async (eventId) => {
    if (!familyIdResolved || !selectedDay.dateKey) return;
    const normKey = String(selectedDay.dateKey).slice(0, 10);
    const viewingAllChildren = selectedDay.childId == null;
    const normChildId = viewingAllChildren ? null : String(selectedDay.childId);
    const event = selectedDayEvents.find((e) => e.id === eventId);
    const isUnmark = selectedDayAttendanceByEventId[eventId] === 'present';
    const patchedAttendances = [];
    try {
      if (isUnmark) {
        const assignedIds = getChildIdsForEvent(event);
        const isShared = assignedIds.length > 1;
        const minutes = getEventMinutes(event);
        if (viewingAllChildren) {
          const recordsToUpdate = attendanceRecords.filter(
            (r) => r.event_id === event.id && String(r.day_date).slice(0, 10) === normKey
          );
          if (isShared && recordsToUpdate.length > 0) {
            await Promise.all(recordsToUpdate.map((r) => updateAttendanceLog(r.id, { status: 'absent', minutes })));
          } else if (recordsToUpdate.length > 0) {
            await Promise.all(recordsToUpdate.map((r) => deleteAttendanceLog(r.id)));
            const res = await updateEventStatus(event.id, 'scheduled');
            if (res.error) console.warn('[AttendanceView] Could not unmark event status:', res.error);
            else patchedAttendances.push({ eventId: event.id, status: 'scheduled' });
          } else {
            await Promise.all(assignedIds.map((cid) => createAttendanceLog({
              family_id: familyIdResolved,
              child_id: String(cid),
              event_id: event.id,
              day_date: normKey,
              status: 'absent',
              minutes,
            })));
          }
        } else if (isShared) {
          const existing = attendanceRecords.find(
            (r) => r.event_id === event.id && String(r.child_id) === normChildId && String(r.day_date).slice(0, 10) === normKey
          );
          if (existing) {
            await updateAttendanceLog(existing.id, { status: 'absent', minutes });
          } else {
            await createAttendanceLog({
              family_id: familyIdResolved,
              child_id: normChildId,
              event_id: event.id,
              day_date: normKey,
              status: 'absent',
              minutes,
            });
          }
        } else {
          const recordsToDelete = attendanceRecords.filter(
            (r) => r.event_id === event.id && String(r.day_date).slice(0, 10) === normKey
          );
          await Promise.all(recordsToDelete.map((r) => deleteAttendanceLog(r.id)));
          const res = await updateEventStatus(event.id, 'scheduled');
          if (res.error) console.warn('[AttendanceView] Could not unmark event status:', res.error);
          else patchedAttendances.push({ eventId: event.id, status: 'scheduled' });
        }
        setTimeout(() => {
          setAttendanceRefreshKey((k) => k + 1);
          notifyAttendanceUpdated(patchedAttendances);
        }, 150);
        trackEvent('attendance_marked', {
          mode: attendanceTrackingMode,
          scope: 'event',
          status: 'absent',
        });
        return;
      }
      const siblings = getSiblingEventsOnDay(normKey, event, events);
      for (const ev of siblings) {
        const childIds = getChildIdsForEvent(ev);
        if (childIds.length === 0) continue;
        const minutes = getEventMinutes(ev);
        const upserts = childIds.map((cid) => {
          const cidStr = String(cid);
          const existing = attendanceRecords.find(
            (r) => r.event_id === ev.id && String(r.child_id) === cidStr && String(r.day_date).slice(0, 10) === normKey
          );
          if (existing) {
            return updateAttendanceLog(existing.id, { status: 'present', minutes });
          }
          return createAttendanceLog({
            family_id: familyIdResolved,
            child_id: cidStr,
            event_id: ev.id,
            day_date: normKey,
            status: 'present',
            minutes,
          });
        });
        await Promise.all(upserts);
        const res = await updateEventStatus(ev.id, 'done');
        if (res.error) console.warn('[AttendanceView] Could not mark event complete:', res.error);
        else patchedAttendances.push({ eventId: ev.id, status: 'done' });
      }
      setAttendanceRefreshKey((k) => k + 1);
      notifyAttendanceUpdated(patchedAttendances);
      trackEvent('attendance_marked', {
        mode: attendanceTrackingMode,
        scope: 'event',
        status: 'present',
      });
    } catch (_) {
      setAttendanceRefreshKey((k) => k + 1);
    }
  }, [familyIdResolved, selectedDay.childId, selectedDay.dateKey, attendanceRecordByEventId, attendanceRecords, selectedDayEvents, selectedDayAttendanceByEventId, events, getEventMinutes, getChildIdsForEvent, getSiblingEventsOnDay, attendanceTrackingMode]);

  const handleMarkDayAttended = useCallback(async (dateKey, childId) => {
    if (!familyIdResolved || !childId) return;
    const normKey = String(dateKey).slice(0, 10);
    const normChildId = String(childId);
    const dayEventsForChild = eventsByDateChild[normKey]?.[normChildId] || [];
    const classDayEventsForChild = dayEventsForChild.filter(
      (eventItem) => String(eventItem?.event_type || '').trim().toLowerCase() === 'classday'
    );
    const preferredEventRows = isClassDayMode(attendanceTrackingMode)
      ? classDayEventsForChild
      : dayEventsForChild;
    const standaloneDay = attendanceRecords.find(
      (r) =>
        r.event_id == null &&
        String(r.child_id) === normChildId &&
        String(r.day_date).slice(0, 10) === normKey
    );
    const patchedAttendances = [];

    // Prefer ClassDay event rows when present in class-day mode; otherwise fallback to manual day-only attendance.
    if (preferredEventRows.length === 0) {
      try {
        if (standaloneDay?.status === 'present') {
          await deleteAttendanceLog(standaloneDay.id);
        } else {
          const { error } = await createAttendanceLog({
            family_id: familyIdResolved,
            child_id: normChildId,
            event_id: null,
            day_date: normKey,
            status: 'present',
            minutes: STANDALONE_DAY_ATTENDANCE_MINUTES,
          });
          if (error) {
            toast.push(error.message || 'Could not save attendance', 'error');
            return;
          }
        }
        setAttendanceRefreshKey((k) => k + 1);
        notifyAttendanceUpdated();
        trackEvent('attendance_marked', {
          mode: attendanceTrackingMode,
          scope: 'day',
          status: standaloneDay?.status === 'present' ? 'absent' : 'present',
        });
      } catch (_) {
        setAttendanceRefreshKey((k) => k + 1);
      }
      return;
    }

    // For "all present" check: this child must have at least one present record per their events that day
    const allPresentForChild = preferredEventRows.every((e) => {
      const rec = attendanceRecords.find(
        (r) => r.event_id === e.id && String(r.child_id) === normChildId && String(r.day_date).slice(0, 10) === normKey
      );
      return rec?.status === 'present';
    });
    try {
      if (allPresentForChild) {
        // Clear manual day-only row if present (same click as unmarking scheduled lessons).
        if (standaloneDay?.id) {
          await deleteAttendanceLog(standaloneDay.id);
        }
        // Mark day unattended for this child only
        for (const e of preferredEventRows) {
          const assignedIds = getChildIdsForEvent(e);
          const isShared = assignedIds.length > 1;
          const minutes = getEventMinutes(e);
          if (isShared) {
            // Do not change event completion status; only set this child's attendance to absent
            const existing = attendanceRecords.find(
              (r) => r.event_id === e.id && String(r.child_id) === normChildId && String(r.day_date).slice(0, 10) === normKey
            );
            if (existing) {
              await updateAttendanceLog(existing.id, { status: 'absent', minutes });
            } else {
              await createAttendanceLog({
                family_id: familyIdResolved,
                child_id: normChildId,
                event_id: e.id,
                day_date: normKey,
                status: 'absent',
                minutes,
              });
            }
          } else {
            const recordsToDelete = attendanceRecords.filter(
              (r) => r.event_id === e.id && String(r.day_date).slice(0, 10) === normKey
            );
            await Promise.all(recordsToDelete.map((r) => deleteAttendanceLog(r.id)));
            const res = await updateEventStatus(e.id, 'scheduled');
            if (res.error) console.warn('[AttendanceView] Could not unmark event status:', res.error);
            else patchedAttendances.push({ eventId: e.id, status: 'scheduled' });
          }
        }
        setTimeout(() => {
          setAttendanceRefreshKey((k) => k + 1);
          notifyAttendanceUpdated(patchedAttendances);
        }, 150);
        trackEvent('attendance_marked', {
          mode: attendanceTrackingMode,
          scope: 'day',
          status: 'absent',
        });
        return;
      }
      // Replacing manual-only attendance with event-based rows: remove standalone first.
      if (standaloneDay?.id) {
        await deleteAttendanceLog(standaloneDay.id);
      }
      // Mark day attended: include sibling events so the lesson group shows complete; mark all assigned children present and set event done
      const seenIds = new Set();
      const dayEvents = [];
      if (isClassDayMode(attendanceTrackingMode)) {
        preferredEventRows.forEach((eventItem) => {
          if (!seenIds.has(eventItem.id)) {
            seenIds.add(eventItem.id);
            dayEvents.push(eventItem);
          }
        });
      } else {
        preferredEventRows.forEach((e) => {
          getSiblingEventsOnDay(normKey, e, events).forEach((s) => {
            if (!seenIds.has(s.id)) {
              seenIds.add(s.id);
              dayEvents.push(s);
            }
          });
        });
      }
      for (const e of dayEvents) {
        const childIds = getChildIdsForEvent(e);
        const minutes = getEventMinutes(e);
        const upserts = childIds.map((cid) => {
          const cidStr = String(cid);
          const existing = attendanceRecords.find(
            (r) => r.event_id === e.id && String(r.child_id) === cidStr && String(r.day_date).slice(0, 10) === normKey
          );
          if (existing) {
            return updateAttendanceLog(existing.id, { status: 'present', minutes });
          }
          return createAttendanceLog({
            family_id: familyIdResolved,
            child_id: cidStr,
            event_id: e.id,
            day_date: normKey,
            status: 'present',
            minutes,
          });
        });
        await Promise.all(upserts);
        const res = await updateEventStatus(e.id, 'done');
        if (res.error) console.warn('[AttendanceView] Could not mark event complete:', res.error);
        else patchedAttendances.push({ eventId: e.id, status: 'done' });
      }
      setAttendanceRefreshKey((k) => k + 1);
      notifyAttendanceUpdated(patchedAttendances);
      trackEvent('attendance_marked', {
        mode: attendanceTrackingMode,
        scope: 'day',
        status: 'present',
      });
    } catch (_) {
      setAttendanceRefreshKey((k) => k + 1);
    }
  }, [familyIdResolved, eventsByDateChild, events, attendanceRecords, getEventMinutes, getChildIdsForEvent, getSiblingEventsOnDay, toast, attendanceTrackingMode]);

  const handleHeatmapMarkDay = useCallback(async (dateKey, childId) => {
    // Days off (holidays/breaks/vacations) are not markable.
    if (offDayKeys.has(String(dateKey).slice(0, 10))) {
      return;
    }
    // Future days can never be attended.
    if (String(dateKey).slice(0, 10) > toLocalYYYYMMDD(new Date())) {
      toast.push("You can't mark attendance for a future day.");
      return;
    }
    if (childId === FAMILY_HEATMAP_CHILD_ID) {
      await Promise.all(
        visibleHeatmapChildren.map((child) => handleMarkDayAttended(dateKey, child.id))
      );
      return;
    }
    return handleMarkDayAttended(dateKey, childId);
  }, [handleMarkDayAttended, visibleHeatmapChildren, toast, offDayKeys]);

  const handleMarkAllRangeAttended = useCallback(async ({
    startDate = yearRange.start,
    endDate = yearRange.end,
    childId = isYearPlannerLayout ? heatmapSelectedChildId : selectedHeatmapChildId,
  } = {}) => {
    if (!familyIdResolved || markingRangeAttended || children.length === 0) return;
    setMarkingRangeAttended(true);
    try {
      const patchedAttendances = [];
      const undoEvents = [];
      const todayKey = toLocalYYYYMMDD(new Date());
      // Never mark future days as attended.
      const dateKeys = getDateKeysInRange(startDate, endDate).filter((k) => k <= todayKey);
      if (dateKeys.length === 0) {
        toast.push('Nothing to mark in that range yet.');
        return;
      }
      // In the year planner, only mark days that actually have lessons (teaching days),
      // so weekends / empty days are never painted attended.
      const lessonsOnly = isYearPlannerLayout;

      let childIds;
      if (childId === FAMILY_HEATMAP_CHILD_ID) {
        childIds = visibleHeatmapChildren.map((c) => String(c.id));
      } else if (childId) {
        childIds = [String(childId)];
      } else {
        childIds = children.map((c) => String(c.id));
      }
      const childIdSet = new Set(childIds);
      const existingStandaloneByChildDay = new Map();
      const existingByEventChildDay = new Map();
      attendanceRecords.forEach((r) => {
        const dayKey = String(r.day_date || '').slice(0, 10);
        if (!dayKey) return;
        const childKey = String(r.child_id);
        if (r.event_id == null) {
          existingStandaloneByChildDay.set(`${childKey}|${dayKey}`, r);
          return;
        }
        existingByEventChildDay.set(`${String(r.event_id)}|${childKey}|${dayKey}`, r);
      });

      const allOps = [];
      for (const dayKey of dateKeys) {
        const dayEventsByChild = eventsByDateChild[dayKey] || {};
        const uniqueDayEvents = new Map();
        Object.values(dayEventsByChild).forEach((list) => {
          (Array.isArray(list) ? list : []).forEach((event) => {
            if (event?.id != null) uniqueDayEvents.set(String(event.id), event);
          });
        });

        if (!lessonsOnly) {
          childIds.forEach((cid) => {
            const hasEventsForChild = (dayEventsByChild[cid] || []).length > 0;
            const standaloneKey = `${cid}|${dayKey}`;
            const standalone = existingStandaloneByChildDay.get(standaloneKey);
            if (hasEventsForChild) {
              if (standalone?.id) allOps.push(deleteAttendanceLog(standalone.id));
              return;
            }
            if (standalone?.id) {
              if (standalone.status !== 'present') {
                allOps.push(updateAttendanceLog(standalone.id, { status: 'present', minutes: STANDALONE_DAY_ATTENDANCE_MINUTES }));
              }
              return;
            }
            allOps.push(createAttendanceLog({
              family_id: familyIdResolved,
              child_id: cid,
              event_id: null,
              day_date: dayKey,
              status: 'present',
              minutes: STANDALONE_DAY_ATTENDANCE_MINUTES,
            }));
          });
        }

        for (const event of uniqueDayEvents.values()) {
          const assignedIds = getEventChildIds(event, children.map((c) => c.id))
            .filter((id) => childIdSet.has(String(id)));
          if (!assignedIds.length) continue;
          if (isEventAttendancePresent(event)) continue;
          const minutes = getEventMinutes(event);
          assignedIds.forEach((assignedId) => {
            const cid = String(assignedId);
            const recordKey = `${String(event.id)}|${cid}|${dayKey}`;
            const existing = existingByEventChildDay.get(recordKey);
            if (existing?.id) {
              allOps.push(updateAttendanceLog(existing.id, { status: 'present', minutes }));
            } else {
              allOps.push(createAttendanceLog({
                family_id: familyIdResolved,
                child_id: cid,
                event_id: event.id,
                day_date: dayKey,
                status: 'present',
                minutes,
              }));
            }
          });
          undoEvents.push({ eventId: String(event.id), prevStatus: String(event.status || 'scheduled') });
          allOps.push(
            updateEventStatus(event.id, 'done').then((res) => {
              if (res?.error) {
                console.warn('[AttendanceView] Could not mark event complete:', res.error);
                return;
              }
              patchedAttendances.push({ eventId: event.id, status: 'done' });
            })
          );
        }
      }

      // Execute all operations in parallel batches for speed
      const BATCH_SIZE = 20;
      for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
        await Promise.all(allOps.slice(i, i + BATCH_SIZE));
      }

      setLastBulkUndo(undoEvents.length > 0 ? { events: undoEvents, at: Date.now() } : null);
      setAttendanceRefreshKey((k) => k + 1);
      notifyAttendanceUpdated(patchedAttendances);
      trackEvent('attendance_marked', {
        mode: attendanceTrackingMode,
        scope: 'day',
        status: 'present',
      });
      toast.push(
        lessonsOnly
          ? 'Marked scheduled lessons attended through today.'
          : 'Marked the selected attendance range as attended.',
        'success'
      );
    } catch (_) {
      toast.push('Could not mark the selected range attended.', 'error');
      setAttendanceRefreshKey((k) => k + 1);
    } finally {
      setMarkingRangeAttended(false);
    }
  }, [
    familyIdResolved,
    markingRangeAttended,
    children,
    selectedHeatmapChildId,
    isYearPlannerLayout,
    heatmapSelectedChildId,
    visibleHeatmapChildren,
    yearRange.start,
    yearRange.end,
    attendanceRecords,
    eventsByDateChild,
    getChildIdsForEvent,
    getEventMinutes,
    toast,
    attendanceTrackingMode,
  ]);

  const handleUndoBulk = useCallback(async () => {
    if (!lastBulkUndo || undoingBulk) return;
    const events = Array.isArray(lastBulkUndo.events) ? lastBulkUndo.events : [];
    if (events.length === 0) {
      setLastBulkUndo(null);
      return;
    }
    setUndoingBulk(true);
    try {
      // Reverting each event's status to its prior value clears the attendance rows we wrote for it.
      await Promise.all(
        events.map(({ eventId, prevStatus }) =>
          updateEventStatus(eventId, prevStatus || 'scheduled').catch(() => null)
        )
      );
      setLastBulkUndo(null);
      setAttendanceRefreshKey((k) => k + 1);
      notifyAttendanceUpdated(events.map((e) => ({ eventId: e.eventId, status: e.prevStatus || 'scheduled' })));
      toast.push('Undid the bulk attendance changes.', 'success');
    } catch (_) {
      toast.push('Could not undo the bulk changes.', 'error');
      setAttendanceRefreshKey((k) => k + 1);
    } finally {
      setUndoingBulk(false);
    }
  }, [lastBulkUndo, undoingBulk, toast]);

  const setRangeStart = useCallback((ymd) => {
    const clamped = ymd < minStartKey ? minStartKey : ymd > maxEndKey ? maxEndKey : ymd;
    const start = dateStringToDate(clamped);
    let end = yearRange.end ? new Date(yearRange.end) : dateStringToDate(maxEndKey);
    if (end < start) end = new Date(start);
    end.setHours(23, 59, 59, 999);
    if (toLocalYYYYMMDD(end) > maxEndKey) end = dateStringToDate(maxEndKey);
    setYearRange({ start, end });
  }, [minStartKey, maxEndKey, yearRange.end]);

  const setRangeEnd = useCallback((ymd) => {
    const clamped = ymd < minStartKey ? minStartKey : ymd > maxEndKey ? maxEndKey : ymd;
    const end = dateStringToDate(clamped);
    let start = yearRange.start ? new Date(yearRange.start) : dateStringToDate(minStartKey);
    if (start > end) start = new Date(end);
    setYearRange({ start, end });
  }, [minStartKey, maxEndKey, yearRange.start]);

  const effectiveTermOptions = useMemo(() => {
    if (bulkTermOptions.length > 0) return bulkTermOptions;
    const anchor = plannerYearAnchor instanceof Date
      ? plannerYearAnchor
      : (plannerYearAnchor ? new Date(plannerYearAnchor) : new Date());
    return deriveDefaultBulkTermOptions(anchor);
  }, [bulkTermOptions, plannerYearAnchor]);

  const termDayCounts = useMemo(() => {
    const childId = heatmapSelectedChildId === FAMILY_HEATMAP_CHILD_ID ? null : heatmapSelectedChildId;
    const termResults = effectiveTermOptions.map((term) => {
      const daysSet = new Set();
      attendanceRecords.forEach((r) => {
        if (r.status !== 'present') return;
        if (childId && String(r.child_id) !== String(childId)) return;
        const day = String(r.day_date || '').slice(0, 10);
        if (day >= term.start && day <= term.end) daysSet.add(day);
      });
      return { label: term.label, start: term.start, end: term.end, count: daysSet.size };
    });
    // Count days outside any term
    const noTermDays = new Set();
    attendanceRecords.forEach((r) => {
      if (r.status !== 'present') return;
      if (childId && String(r.child_id) !== String(childId)) return;
      const day = String(r.day_date || '').slice(0, 10);
      const inAnyTerm = effectiveTermOptions.some((t) => day >= t.start && day <= t.end);
      if (!inAnyTerm) noTermDays.add(day);
    });
    if (noTermDays.size > 0) {
      termResults.push({ label: 'Other', start: null, end: null, count: noTermDays.size });
    }
    return termResults;
  }, [effectiveTermOptions, attendanceRecords, heatmapSelectedChildId]);

  if (loading && !familyIdResolved) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#887DEE" />
        <Text style={styles.loadingText}>Loading attendance…</Text>
      </View>
    );
  }

  const rangeStartStr = yearRange.start ? toLocalYYYYMMDD(yearRange.start) : '';
  const rangeEndStr = yearRange.end ? toLocalYYYYMMDD(yearRange.end) : '';
  const bulkTargetChildId = isYearPlannerLayout ? heatmapSelectedChildId : selectedHeatmapChildId;
  const selectedBulkChild = children.find((c) => c.id === bulkTargetChildId);
  const selectedBulkChildName = bulkTargetChildId === FAMILY_HEATMAP_CHILD_ID
    ? (visibleHeatmapChildren.length === children.length ? 'all children' : 'the filtered children')
    : (selectedBulkChild?.first_name || selectedBulkChild?.name || 'the selected child');
  // Year-planner bulk is bounded to selected term start -> min(term end, today).
  const selectedBulkTerm = bulkTermOptions[selectedBulkTermIdx] || null;
  const bulkTermStart = selectedBulkTerm?.start
    || bulkTermStartKey
    || (academicYear?.start_date ? String(academicYear.start_date).slice(0, 10) : `${new Date().getFullYear()}-01-01`);
  const bulkTodayKey = toLocalYYYYMMDD(new Date());
  const bulkTermEnd = selectedBulkTerm?.end && selectedBulkTerm.end < bulkTodayKey
    ? selectedBulkTerm.end
    : bulkTodayKey;

  const attendanceDateRangePicker = (options = {}) => {
    const { showLabel = true, style = null } = options;
    return (
    <View style={[styles.rangeRowWrap, style]}>
      {showLabel ? <Text style={styles.rangeRowLabel}>Attendance range</Text> : null}
      <View style={styles.dateRangeRow}>
        <View style={styles.dateRangeSide}>
          <TouchableOpacity
            onPress={() => { if (!rangeStartStr) return; const d = new Date(rangeStartStr + 'T12:00:00'); d.setDate(d.getDate() - 1); setRangeStart(toLocalYYYYMMDD(d)); }}
            style={styles.dateRangeArrow}
            disabled={!rangeStartStr || rangeStartStr === minStartKey}
            {...(Platform.OS === 'web' && { cursor: rangeStartStr && rangeStartStr !== minStartKey ? 'pointer' : 'default' })}
          >
            <ChevronLeft size={14} color={rangeStartStr && rangeStartStr !== minStartKey ? TOKENS.text : TOKENS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateRangeDateWrap}
            onPress={() => { setStartDateCalendarMonth(clampCalendarMonthToRange(rangeStartStr ? dateStringToDate(rangeStartStr) : new Date(), minStart, maxEnd)); setShowStartDatePicker(true); }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.dateRangeDate}>{rangeStartStr ? formatDateDisplay(rangeStartStr) : 'From'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { if (!rangeStartStr) return; const d = new Date(rangeStartStr + 'T12:00:00'); d.setDate(d.getDate() + 1); setRangeStart(toLocalYYYYMMDD(d)); }}
            style={styles.dateRangeArrow}
            disabled={!rangeStartStr || rangeStartStr === maxEndKey}
            {...(Platform.OS === 'web' && { cursor: rangeStartStr && rangeStartStr !== maxEndKey ? 'pointer' : 'default' })}
          >
            <ChevronRight size={14} color={rangeStartStr && rangeStartStr !== maxEndKey ? TOKENS.text : TOKENS.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.dateRangeArrowLabel}>→</Text>
        <View style={styles.dateRangeSide}>
          <TouchableOpacity
            onPress={() => { if (!rangeEndStr) return; const d = new Date(rangeEndStr + 'T12:00:00'); d.setDate(d.getDate() - 1); setRangeEnd(toLocalYYYYMMDD(d)); }}
            style={styles.dateRangeArrow}
            disabled={!rangeEndStr || rangeEndStr === minStartKey}
            {...(Platform.OS === 'web' && { cursor: rangeEndStr && rangeEndStr !== minStartKey ? 'pointer' : 'default' })}
          >
            <ChevronLeft size={14} color={rangeEndStr && rangeEndStr !== minStartKey ? TOKENS.text : TOKENS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dateRangeDateWrap}
            onPress={() => { setEndDateCalendarMonth(clampCalendarMonthToRange(rangeEndStr ? dateStringToDate(rangeEndStr) : new Date(), minStart, maxEnd)); setShowEndDatePicker(true); }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.dateRangeDate}>{rangeEndStr ? formatDateDisplay(rangeEndStr) : 'To'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { if (!rangeEndStr) return; const d = new Date(rangeEndStr + 'T12:00:00'); d.setDate(d.getDate() + 1); setRangeEnd(toLocalYYYYMMDD(d)); }}
            style={styles.dateRangeArrow}
            disabled={!rangeEndStr || rangeEndStr === maxEndKey}
            {...(Platform.OS === 'web' && { cursor: rangeEndStr && rangeEndStr !== maxEndKey ? 'pointer' : 'default' })}
          >
            <ChevronRight size={14} color={rangeEndStr && rangeEndStr !== maxEndKey ? TOKENS.text : TOKENS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
    );
  };

  const rangeRow = (
    <View style={styles.topToolbar}>
      {attendanceDateRangePicker()}
      <View style={styles.childFilterChips}>
        {children.map((child) => {
          const selected = selectedHeatmapChildId === child.id;
          const summary = summaryPerChild.find((s) => s.childId === child.id);
          const totalDays = summary?.daysAttended ?? 0;
          const childName = child.first_name || child.name || 'Child';
          return (
            <TouchableOpacity
              key={child.id}
              style={[styles.childFilterChip, selected && styles.childFilterChipSelected]}
              onPress={() => setSelectedHeatmapChildId(child.id)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={styles.childFilterChipAvatarWrap}>
                <Image
                  source={sourceForChild(child)}
                  style={styles.childFilterChipAvatar}
                  resizeMode="cover"
                />
              </View>
              <Text style={[styles.childFilterChipText, selected && styles.childFilterChipTextSelected]}>
                {childName}
              </Text>
              <Text style={[styles.childFilterChipTotal, selected && styles.childFilterChipTextSelected]}>
                Total: {totalDays}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!isYearPlannerLayout ? (
        <TouchableOpacity
          style={[styles.rangeBulkChip, (markingRangeAttended || children.length === 0 || readOnly) && styles.rangeBulkChipDisabled]}
          onPress={() => setConfirmRangeVisible(true)}
          disabled={markingRangeAttended || children.length === 0 || readOnly}
          {...(Platform.OS === 'web' && { cursor: markingRangeAttended || readOnly ? 'default' : 'pointer' })}
        >
          <Text style={styles.rangeBulkChipText}>
            {markingRangeAttended ? 'Marking range…' : 'Bulk actions'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const yearPlannerRangeRow = (
    <View style={styles.yearPlannerToolbar}>
      <View style={styles.yearPlannerTopRow}>
        <View style={styles.yearPlannerModeSwitch}>
          {YEAR_PLANNER_MODE_ORDER.map((mode) => {
            const selected = yearPlannerInteractionMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                style={[styles.yearPlannerModeChip, selected && styles.yearPlannerModeChipSelected]}
                onPress={() => setYearPlannerInteractionMode(mode)}
                activeOpacity={0.85}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={[styles.yearPlannerModeChipText, selected && styles.yearPlannerModeChipTextSelected]}>
                  {YEAR_PLANNER_MODE_COPY[mode].label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <YearHeatmapLegend style={styles.yearPlannerInlineLegend} toolbar />
        {lastBulkUndo && !readOnly ? (
          <TouchableOpacity
            style={[styles.rangeBulkChip, undoingBulk && styles.rangeBulkChipDisabled]}
            onPress={handleUndoBulk}
            disabled={undoingBulk}
            {...(Platform.OS === 'web' && { cursor: undoingBulk ? 'default' : 'pointer' })}
          >
            <Text style={styles.rangeBulkChipText}>
              {undoingBulk ? 'Undoing…' : 'Undo bulk'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children.length > 1 ? (
        <View style={styles.yearPlannerControlsRow}>
          <View style={styles.childFilterChips}>
            <TouchableOpacity
              style={[styles.childFilterChip, !effectiveYearChildId && styles.childFilterChipSelected]}
              onPress={() => setYearChildFilter(null)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={[styles.childFilterChipText, !effectiveYearChildId && styles.childFilterChipTextSelected]}>
                All Children
              </Text>
            </TouchableOpacity>
            {children.map((child) => {
              const selected = effectiveYearChildId != null && effectiveYearChildId === String(child.id);
              const childName = child.first_name || child.name || 'Child';
              return (
                <TouchableOpacity
                  key={child.id}
                  style={[styles.childFilterChip, selected && styles.childFilterChipSelected]}
                  onPress={() => setYearChildFilter(selected ? null : child.id)}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.childFilterChipAvatarWrap}>
                    <Image
                      source={sourceForChild(child)}
                      style={styles.childFilterChipAvatar}
                      resizeMode="cover"
                    />
                  </View>
                  <Text style={[styles.childFilterChipText, selected && styles.childFilterChipTextSelected]}>
                    {childName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ) : null}
      <TouchableOpacity
        style={styles.termCountsRow}
        onPress={() => setTermCountsModalVisible(true)}
        activeOpacity={0.7}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        {termDayCounts.map((term) => (
          <View key={term.label} style={styles.termCountItem}>
            <Text style={styles.termCountLabel}>{term.label}</Text>
            <Text style={styles.termCountValue}>{term.count} {term.count === 1 ? 'day' : 'days'}</Text>
          </View>
        ))}
        <View style={styles.termCountItem}>
          <Text style={styles.termCountLabel}>Total</Text>
          <Text style={[styles.termCountValue, styles.termCountValueTotal]}>
            {termDayCounts.reduce((sum, t) => sum + t.count, 0)} days
          </Text>
        </View>
      </TouchableOpacity>
      <Text style={styles.yearPlannerModeHelp}>
        {YEAR_PLANNER_MODE_COPY[yearPlannerInteractionMode].help}
      </Text>
    </View>
  );

  const belowToolbarContent = renderBelowToolbar
    ? renderBelowToolbar()
    : (
      <YearHeatmapGrid
        yearStart={yearStartKey}
        yearEnd={yearEndKey}
        selectedChildId={heatmapSelectedChildId}
        dayStatusByChild={heatmapDayStatusByChild}
        offDayKeys={offDayKeys}
        showLegend={!isYearPlannerLayout}
        onMarkDayAttended={
          readOnly
          || (isYearPlannerLayout && yearPlannerInteractionMode !== YEAR_PLANNER_MODE_ATTENDANCE)
            ? undefined
            : handleHeatmapMarkDay
        }
        onDayPress={
          isYearPlannerLayout && yearPlannerInteractionMode === YEAR_PLANNER_MODE_EVENTS
            ? handleYearPlannerDayPress
            : null
        }
        interactionMode={isYearPlannerLayout ? yearPlannerInteractionMode : YEAR_PLANNER_MODE_ATTENDANCE}
        selectedDateKey={
          isYearPlannerLayout && yearPlannerDayPanelVisible ? selectedDay.dateKey : null
        }
      />
    );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isYearPlannerLayout && styles.contentYearPlanner]}
    >
      {!isYearPlannerLayout && <HeaderSummaryStrip />}
      {children.length > 0 ? (
        <>
          {!isDrilldownMode && (
            <>
              {isYearPlannerLayout ? yearPlannerRangeRow : rangeRow}
              {belowToolbarContent}
            </>
          )}
          {isDrilldownMode && (
            <View style={[styles.drilldownSection, styles.drilldownSectionStandalone]}>
              <Text style={styles.drilldownTitle}>Month drill-down</Text>
              <Text style={styles.drilldownHelp}>
                Click a day on the calendar to see that day’s events for all children. Toggle the circle next to an event to mark it attended or unattended. Please note that only events marked as instructional time (e.g. lessons from your plan) count. Use the year heatmap above to mark a day attended even when nothing is scheduled. Same rules as the heatmap: shared events are marked for all children when you mark attended; unmarking affects only the selected context.
              </Text>
              <View style={styles.drilldownGrid}>
                <View style={styles.calendarWithDivider}>
                  <View style={styles.calendarColumn}>
                    <MonthlyCalendarView
                      monthDate={calendarMonth}
                      dayStatusByChild={dayStatusByChild}
                      selectedChildId={selectedDay.childId}
                      selectedDateKey={selectedDay.dateKey}
                      children={children}
                      enableVerticalMonthScroll
                      onMonthChange={(delta) => setCalendarMonth((m) => {
                        const next = new Date(m);
                        next.setMonth(next.getMonth() + delta);
                        return next;
                      })}
                      onDayPress={(dateKey) => handleDayPress(dateKey, null)}
                    />
                  </View>
                  <View style={styles.drilldownDivider} />
                </View>
                <View style={styles.detailColumn}>
                  <DayEventsPanel
                    dateLabel={selectedDay.dateKey ? formatDateLabel(selectedDay.dateKey) : null}
                    childName={selectedDay.childId == null && selectedDay.dateKey ? 'All children' : (selectedDayChild?.first_name || selectedDayChild?.name || null)}
                    events={selectedDayEvents}
                    attendanceByEventId={selectedDayAttendanceByEventId}
                    onToggleEventAttendance={handleToggleEventAttendance}
                    onMarkAllAttended={selectedDay.dateKey ? (selectedDay.childId != null ? () => handleMarkDayAttended(selectedDay.dateKey, selectedDay.childId) : async () => {
                      const withEvents = children.filter((c) => (eventsByDateChild[selectedDay.dateKey]?.[c.id] || []).length > 0);
                      await Promise.all(withEvents.map((c) => handleMarkDayAttended(selectedDay.dateKey, c.id)));
                    }) : null}
                    onEventPress={onEventPress}
                    getEventMinutes={getEventMinutes}
                  />
                </View>
              </View>
            </View>
          )}
        </>
      ) : isYearPlannerLayout && renderBelowToolbar ? (
        renderBelowToolbar()
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Add children to see attendance.</Text>
        </View>
      )}

      {yearPlannerDayPanelVisible && isYearPlannerLayout && (
        <Modal
          animationType="fade"
          transparent
          visible={yearPlannerDayPanelVisible}
          onRequestClose={() => setYearPlannerDayPanelVisible(false)}
        >
          <TouchableOpacity
            style={styles.confirmOverlay}
            activeOpacity={1}
            onPress={() => setYearPlannerDayPanelVisible(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={styles.yearPlannerDayModal}
            >
              <View style={styles.confirmHeader}>
                <Text style={styles.confirmTitle}>Day events</Text>
                <TouchableOpacity
                  style={styles.confirmCloseBtn}
                  onPress={() => setYearPlannerDayPanelVisible(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <X size={18} color="#6B7280" />
                </TouchableOpacity>
              </View>
              <View style={styles.yearPlannerDayModalBody}>
              <DayEventsPanel
                dateLabel={selectedDay.dateKey ? formatDateLabel(selectedDay.dateKey) : null}
                childName={yearPlannerDayPanelChildName}
                events={selectedDayEvents}
                attendanceByEventId={selectedDayAttendanceByEventId}
                onToggleEventAttendance={readOnly ? undefined : handleToggleEventAttendance}
                onMarkAllAttended={
                  readOnly || !selectedDay.dateKey
                    ? null
                    : (yearPlannerDayChildId
                      ? () => handleMarkDayAttended(selectedDay.dateKey, yearPlannerDayChildId)
                      : async () => {
                        const withEvents = visibleHeatmapChildren.filter(
                          (c) => (eventsByDateChild[selectedDay.dateKey]?.[c.id] || []).length > 0
                        );
                        await Promise.all(withEvents.map((c) => handleMarkDayAttended(selectedDay.dateKey, c.id)));
                      })
                }
                onEventPress={onEventPress}
                getEventMinutes={getEventMinutes}
                compactEventRows
              />
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}

      {showStartDatePicker && (
        <Modal animationType="fade" transparent visible={showStartDatePicker} onRequestClose={() => setShowStartDatePicker(false)}>
          <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowStartDatePicker(false)}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
              <View style={styles.calendarNavRow}>
                <TouchableOpacity onPress={() => { const d = new Date(startDateCalendarMonth); d.setMonth(d.getMonth() - 1); setStartDateCalendarMonth(clampCalendarMonthToRange(d, minStart, maxEnd)); }} style={styles.calendarNavButton}>
                  <ChevronLeft size={20} color={TOKENS.text} />
                </TouchableOpacity>
                <Text style={styles.calendarMonthTitle}>{startDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                <TouchableOpacity onPress={() => { const d = new Date(startDateCalendarMonth); d.setMonth(d.getMonth() + 1); setStartDateCalendarMonth(clampCalendarMonthToRange(d, minStart, maxEnd)); }} style={styles.calendarNavButton}>
                  <ChevronRight size={20} color={TOKENS.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.calendarYearRow}>
                <TouchableOpacity onPress={() => { const d = new Date(startDateCalendarMonth); d.setFullYear(d.getFullYear() - 1); setStartDateCalendarMonth(clampCalendarMonthToRange(d, minStart, maxEnd)); }} style={styles.calendarNavButton}>
                  <Text style={styles.calendarYearLink}>← Year</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { const today = new Date(); const clamped = clampCalendarMonthToRange(today, minStart, maxEnd); setStartDateCalendarMonth(clamped); setRangeStart(toLocalYYYYMMDD(today)); setShowStartDatePicker(false); }} style={styles.calendarNavButton}>
                  <Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { const d = new Date(startDateCalendarMonth); d.setFullYear(d.getFullYear() + 1); setStartDateCalendarMonth(clampCalendarMonthToRange(d, minStart, maxEnd)); }} style={styles.calendarNavButton}>
                  <Text style={styles.calendarYearLink}>Year →</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.calendarDayHeaders}>
                {WEEKDAY_LABELS.map((day) => (
                  <View key={day} style={styles.calendarDayHeader}>
                    <Text style={styles.calendarDayHeaderText}>{day}</Text>
                  </View>
                ))}
              </View>
              {(() => {
                const year = startDateCalendarMonth.getFullYear();
                const month = startDateCalendarMonth.getMonth();
                const firstDay = new Date(year, month, 1);
                const startDateGrid = new Date(firstDay);
                startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                const days = [];
                const current = new Date(startDateGrid);
                for (let i = 0; i < 42; i++) {
                  days.push(new Date(current));
                  current.setDate(current.getDate() + 1);
                }
                return (
                  <View>
                    {[0, 1, 2, 3, 4, 5].map((week) => (
                      <View key={week} style={styles.calendarWeekRow}>
                        {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                          const isCurrentMonth = day.getMonth() === month;
                          const ymd = toLocalYYYYMMDD(day);
                          const isSelected = rangeStartStr === ymd;
                          const isToday = ymd === toLocalYYYYMMDD(new Date());
                          const inRange = ymd >= minStartKey && ymd <= maxEndKey;
                          return (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => { if (inRange) { setRangeStart(ymd); setShowStartDatePicker(false); } }}
                              style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday, !inRange && styles.calendarDayCellDisabled]}
                              disabled={!inRange}
                            >
                              <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted, !inRange && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                );
              })()}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
      {showEndDatePicker && (
        <Modal animationType="fade" transparent visible={showEndDatePicker} onRequestClose={() => setShowEndDatePicker(false)}>
          <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowEndDatePicker(false)}>
            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
              <View style={styles.calendarNavRow}>
                <TouchableOpacity onPress={() => { const d = new Date(endDateCalendarMonth); d.setMonth(d.getMonth() - 1); setEndDateCalendarMonth(clampCalendarMonthToRange(d, minStart, maxEnd)); }} style={styles.calendarNavButton}>
                  <ChevronLeft size={20} color={TOKENS.text} />
                </TouchableOpacity>
                <Text style={styles.calendarMonthTitle}>{endDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                <TouchableOpacity onPress={() => { const d = new Date(endDateCalendarMonth); d.setMonth(d.getMonth() + 1); setEndDateCalendarMonth(clampCalendarMonthToRange(d, minStart, maxEnd)); }} style={styles.calendarNavButton}>
                  <ChevronRight size={20} color={TOKENS.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.calendarYearRow}>
                <TouchableOpacity onPress={() => { const d = new Date(endDateCalendarMonth); d.setFullYear(d.getFullYear() - 1); setEndDateCalendarMonth(clampCalendarMonthToRange(d, minStart, maxEnd)); }} style={styles.calendarNavButton}>
                  <Text style={styles.calendarYearLink}>← Year</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { const today = new Date(); const clamped = clampCalendarMonthToRange(today, minStart, maxEnd); setEndDateCalendarMonth(clamped); setRangeEnd(toLocalYYYYMMDD(today)); setShowEndDatePicker(false); }} style={styles.calendarNavButton}>
                  <Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { const d = new Date(endDateCalendarMonth); d.setFullYear(d.getFullYear() + 1); setEndDateCalendarMonth(clampCalendarMonthToRange(d, minStart, maxEnd)); }} style={styles.calendarNavButton}>
                  <Text style={styles.calendarYearLink}>Year →</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.calendarDayHeaders}>
                {WEEKDAY_LABELS.map((day) => (
                  <View key={day} style={styles.calendarDayHeader}>
                    <Text style={styles.calendarDayHeaderText}>{day}</Text>
                  </View>
                ))}
              </View>
              {(() => {
                const year = endDateCalendarMonth.getFullYear();
                const month = endDateCalendarMonth.getMonth();
                const firstDay = new Date(year, month, 1);
                const startDateGrid = new Date(firstDay);
                startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                const days = [];
                const current = new Date(startDateGrid);
                for (let i = 0; i < 42; i++) {
                  days.push(new Date(current));
                  current.setDate(current.getDate() + 1);
                }
                return (
                  <View>
                    {[0, 1, 2, 3, 4, 5].map((week) => (
                      <View key={week} style={styles.calendarWeekRow}>
                        {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                          const isCurrentMonth = day.getMonth() === month;
                          const ymd = toLocalYYYYMMDD(day);
                          const isSelected = rangeEndStr === ymd;
                          const isToday = ymd === toLocalYYYYMMDD(new Date());
                          const inRange = ymd >= minStartKey && ymd <= maxEndKey;
                          return (
                            <TouchableOpacity
                              key={idx}
                              onPress={() => { if (inRange) { setRangeEnd(ymd); setShowEndDatePicker(false); } }}
                              style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday, !inRange && styles.calendarDayCellDisabled]}
                              disabled={!inRange}
                            >
                              <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted, !inRange && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                );
              })()}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
      <Modal animationType="fade" transparent visible={confirmRangeVisible} onRequestClose={() => setConfirmRangeVisible(false)}>
        <TouchableOpacity style={styles.confirmOverlay} activeOpacity={1} onPress={() => setConfirmRangeVisible(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.confirmModal, styles.confirmRangeModal]}>
            <View style={[styles.confirmHeader, styles.confirmRangeHeader]}>
              <Text style={styles.confirmTitle}>Mark full range attended?</Text>
              <TouchableOpacity
                style={styles.confirmCloseBtn}
                onPress={() => setConfirmRangeVisible(false)}
                disabled={markingRangeAttended}
                accessibilityRole="button"
                accessibilityLabel="Close"
                {...(Platform.OS === 'web' && { cursor: markingRangeAttended ? 'default' : 'pointer' })}
              >
                <X size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {!isYearPlannerLayout ? (
              <View style={styles.confirmRangePickerWrap}>
                {attendanceDateRangePicker({ showLabel: false })}
              </View>
            ) : null}
            {isYearPlannerLayout && effectiveTermOptions.length > 0 && (
              <View style={styles.bulkTermChooserWrap}>
                <Text style={styles.bulkTermLabel}>Term</Text>
                <View style={styles.bulkTermChooser}>
                  {effectiveTermOptions.map((term, idx) => (
                    <TouchableOpacity
                      key={term.label}
                      style={[styles.bulkTermChip, idx === selectedBulkTermIdx && styles.bulkTermChipSelected]}
                      onPress={() => setSelectedBulkTermIdx(idx)}
                      disabled={markingRangeAttended}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={[styles.bulkTermChipText, idx === selectedBulkTermIdx && styles.bulkTermChipTextSelected]}>
                        {term.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <Text style={[styles.confirmBody, styles.confirmRangeBody]}>
              {isYearPlannerLayout
                ? `This marks scheduled lessons as attended from ${formatDateDisplay(bulkTermStart)} through ${bulkTermEnd === bulkTodayKey ? `today (${formatDateDisplay(bulkTodayKey)})` : formatDateDisplay(bulkTermEnd)} for ${bulkTargetChildId ? selectedBulkChildName : 'all children'}. Future days and days with no lessons are left untouched.`
                : `This will mark all days in the selected range as attended for ${bulkTargetChildId ? selectedBulkChildName : 'all children'}.`}
            </Text>
            <View style={[styles.confirmActions, styles.confirmRangeActions]}>
              <TouchableOpacity
                style={styles.bulkCancelBtn}
                onPress={() => setConfirmRangeVisible(false)}
                disabled={markingRangeAttended}
                {...(Platform.OS === 'web' && { cursor: markingRangeAttended ? 'default' : 'pointer' })}
              >
                <X size={15} color="#374151" strokeWidth={2.5} />
                <Text style={styles.bulkCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.bulkConfirmBtn,
                  (markingRangeAttended || (!isYearPlannerLayout && (!rangeStartStr || !rangeEndStr))) && styles.confirmPrimaryBtnDisabled,
                ]}
                disabled={markingRangeAttended || (!isYearPlannerLayout && (!rangeStartStr || !rangeEndStr))}
                onPress={async () => {
                  setConfirmRangeVisible(false);
                  if (isYearPlannerLayout) {
                    await handleMarkAllRangeAttended({
                      startDate: dateStringToDate(bulkTermStart),
                      endDate: dateStringToDate(bulkTermEnd),
                    });
                  } else {
                    await handleMarkAllRangeAttended();
                  }
                }}
                {...(Platform.OS === 'web' && { cursor: markingRangeAttended ? 'default' : 'pointer' })}
              >
                <Check size={15} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.bulkConfirmText}>
                  {markingRangeAttended ? 'Marking…' : 'Confirm'}
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      {/* Term Counts Detail Modal */}
      <Modal animationType="fade" transparent visible={termCountsModalVisible} onRequestClose={() => setTermCountsModalVisible(false)}>
        <TouchableOpacity style={styles.confirmOverlay} activeOpacity={1} onPress={() => setTermCountsModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.confirmModal, styles.termCountsDetailModal]}>
            <View style={styles.confirmHeader}>
              <Text style={styles.confirmTitle}>Attendance Details</Text>
              <TouchableOpacity
                style={styles.confirmCloseBtn}
                onPress={() => setTermCountsModalVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {/* School year dropdown (read-only display) */}
            <View style={styles.termCountsYearRow}>
              <View style={styles.termCountsYearDropdown}>
                <Text style={styles.termCountsYearText}>
                  {plannerYearAnchor ? `${plannerYearAnchor.getFullYear()} School Year` : `${new Date().getFullYear()} School Year`}
                </Text>
                <ChevronDown size={16} color="#6B7280" />
              </View>
            </View>
            {/* Term rows */}
            <View style={styles.termCountsDetailList}>
              {termDayCounts.map((term) => (
                <View key={term.label} style={styles.termCountsDetailRow}>
                  <View style={styles.termCountsDetailLeft}>
                    <Text style={styles.termCountsDetailLabel}>{term.label}</Text>
                    {term.start && term.end ? (
                      <Text style={styles.termCountsDetailRange}>
                        {formatDateDisplay(term.start)} – {formatDateDisplay(term.end)}
                      </Text>
                    ) : (
                      <Text style={styles.termCountsDetailRange}>Days outside term ranges</Text>
                    )}
                  </View>
                  <Text style={styles.termCountsDetailCount}>{term.count} {term.count === 1 ? 'day' : 'days'}</Text>
                </View>
              ))}
              {/* Total */}
              <View style={[styles.termCountsDetailRow, styles.termCountsDetailTotalRow]}>
                <Text style={styles.termCountsDetailTotalLabel}>Total</Text>
                <Text style={styles.termCountsDetailTotalCount}>
                  {termDayCounts.reduce((sum, t) => sum + t.count, 0)} days
                </Text>
              </View>
            </View>
            {/* Footer */}
            <View style={styles.termCountsDetailFooter}>
              <TouchableOpacity
                style={styles.bulkCancelBtn}
                onPress={() => setTermCountsModalVisible(false)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={15} color="#374151" strokeWidth={2.5} />
                <Text style={styles.bulkCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.bulkConfirmBtn}
                onPress={() => {
                  setTermCountsModalVisible(false);
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openSchoolYearSettings'));
                  }
                }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.bulkConfirmText}>Edit school year</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <AttendanceExportModal
        visible={exportModalVisible}
        onClose={() => {
          setExportModalVisible(false);
          setExportModalChildId(null);
        }}
        exportRows={exportRows}
        children={exportModalChildren}
        singleChildId={exportModalChildId}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingTop: TOKENS.contentPadY,
    paddingBottom: 48,
    paddingHorizontal: TOKENS.contentPadX,
    width: '100%',
  },
  contentYearPlanner: {
    paddingTop: 6,
    paddingBottom: 12,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: TOKENS.text,
    marginBottom: TOKENS.s2,
  },
  sectionHelp: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    marginBottom: TOKENS.s6,
  },
  drilldownTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TOKENS.text,
    marginBottom: 8,
    letterSpacing: 0.6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  drilldownHelp: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    marginBottom: 20,
  },
  drilldownSection: {
    marginTop: TOKENS.s5,
    paddingTop: 16,
  },
  drilldownSectionStandalone: {
    marginTop: TOKENS.s3,
    paddingTop: 8,
  },
  drilldownDividerLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  drilldownGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flexWrap: 'wrap',
    gap: 0,
  },
  calendarWithDivider: {
    flexDirection: 'row',
    width: 361,
    minWidth: 281,
  },
  calendarColumn: {
    width: 360,
    minWidth: 280,
  },
  drilldownDivider: {
    width: 1,
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  detailColumn: {
    flex: 1,
    minWidth: 200,
    paddingLeft: 24,
  },
  calendarRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: TOKENS.s7,
    flexWrap: 'wrap',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: TOKENS.textMuted },
  empty: { padding: 24 },
  emptyText: { fontSize: 14, color: TOKENS.textMuted },
  rangeActionsWrap: {
    marginTop: TOKENS.s4,
    alignItems: 'flex-start',
    gap: 10,
  },
  topToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: TOKENS.s4,
  },
  yearPlannerToolbar: {
    gap: 8,
    marginBottom: 12,
  },
  yearPlannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 14,
  },
  yearPlannerInlineLegend: {
    marginTop: 0,
    flexShrink: 1,
  },
  yearPlannerModeSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    flexShrink: 0,
    padding: 3,
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  yearPlannerModeChip: {
    paddingHorizontal: 14,
    paddingVertical: 0,
    minHeight: 30,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  yearPlannerModeChipSelected: {
    backgroundColor: 'rgba(107, 179, 232, 0.12)',
    borderWidth: 1,
    borderColor: '#6BB3E8',
  },
  yearPlannerModeChipText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.9)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearPlannerModeChipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '600',
  },
  yearPlannerModeHelp: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    lineHeight: 17,
    maxWidth: 760,
  },
  termCountsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    alignSelf: 'flex-start',
  },
  termCountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  termCountLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.5)',
  },
  termCountValue: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(15, 23, 42, 0.8)',
  },
  termCountValueTotal: {
    color: '#0F172A',
  },
  yearPlannerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
  },
  yearPlannerDayModal: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '78vh',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    ...(Platform.OS === 'web' && { boxShadow: '0 18px 48px rgba(15, 23, 42, 0.18)' }),
  },
  yearPlannerDayModalBody: {
    maxHeight: 420,
    minHeight: 120,
    marginTop: 8,
  },
  childFilterChips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
    minWidth: 160,
  },
  childFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 0,
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  childFilterChipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(107, 179, 232, 0.12)',
  },
  childFilterChipText: {
    fontSize: 14,
    lineHeight: 18,
    color: 'rgba(15, 23, 42, 0.9)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childFilterChipTotal: {
    fontSize: 11,
    color: TOKENS.textFaint,
  },
  childFilterChipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childFilterChipAvatarWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  childFilterChipAvatar: {
    width: 18,
    height: 18,
    transform: [{ scale: 1.2 }],
    ...(Platform.OS === 'web' && { objectFit: 'cover' }),
  },
  rangeRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: TOKENS.bgSubtle,
    alignSelf: 'flex-start',
  },
  rangeRowLabel: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  dateRangeSide: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateRangeArrow: { paddingVertical: 4, paddingHorizontal: 0 },
  dateRangeDateWrap: { minWidth: 100, alignItems: 'center', justifyContent: 'center' },
  dateRangeDate: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted },
  dateRangeArrowLabel: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted },
  rangeBulkChip: {
    borderRadius: 999,
    minHeight: 36,
    paddingVertical: 0,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignSelf: 'center',
    marginLeft: 'auto',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rangeBulkChipDisabled: {
    opacity: 0.55,
  },
  rangeBulkChipText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.9)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  confirmModal: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  confirmRangeModal: {
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 28,
  },
  confirmRangePickerWrap: {
    marginTop: 12,
    marginBottom: 16,
  },
  confirmRangeHeader: {
    marginBottom: 4,
  },
  confirmRangeBody: {
    marginTop: 0,
    marginBottom: 4,
  },
  bulkTermChooserWrap: {
    marginBottom: 14,
  },
  bulkTermLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.55)',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  bulkTermChooser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.04)',
    alignSelf: 'flex-start',
  },
  bulkTermChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  bulkTermChipSelected: {
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 3px rgba(15, 23, 42, 0.1)' }),
  },
  bulkTermChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.55)',
  },
  bulkTermChipTextSelected: {
    color: '#0F172A',
  },
  confirmRangeActions: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bulkCancelBtn: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  bulkCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  bulkConfirmBtn: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#9ECFFB',
    borderWidth: 1,
    borderColor: '#9ECFFB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  bulkConfirmText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  confirmCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  confirmTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  confirmBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
    marginTop: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  confirmActions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  confirmCancelBtn: {
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  confirmPrimaryBtn: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9ECFFB',
    backgroundColor: '#9ECFFB',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  confirmPrimaryBtnDisabled: {
    opacity: 0.6,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  confirmPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModal: {
    backgroundColor: TOKENS.bg ?? '#fff',
    borderRadius: 12,
    padding: 16,
    width: Platform.OS === 'web' ? 320 : '90%',
    maxWidth: 320,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' } : {}),
  },
  calendarNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  calendarNavButton: { padding: 4 },
  calendarMonthTitle: { fontSize: 14, fontWeight: '600', color: TOKENS.text },
  calendarYearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
  calendarYearLink: { fontSize: 12, color: TOKENS.textMuted },
  calendarDayHeaders: { flexDirection: 'row', marginBottom: 8 },
  calendarDayHeader: { flex: 1, alignItems: 'center' },
  calendarDayHeaderText: { fontSize: 12, color: TOKENS.textMuted, fontWeight: '500' },
  calendarWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calendarDayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  calendarDayCellSelected: { backgroundColor: TOKENS.accent ?? '#887DEE' },
  calendarDayCellToday: { borderWidth: 2, borderColor: TOKENS.accent ?? '#887DEE' },
  calendarDayCellDisabled: { opacity: 0.4 },
  calendarDayText: { fontSize: 13, color: TOKENS.text },
  calendarDayTextSelected: { color: '#fff', fontWeight: '600' },
  calendarDayTextMuted: { color: TOKENS.textMuted },
  termCountsDetailModal: {
    width: 420,
    maxWidth: '90%',
  },
  termCountsYearRow: {
    marginBottom: 16,
  },
  termCountsYearDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignSelf: 'flex-start',
  },
  termCountsYearText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termCountsDetailList: {
    gap: 0,
    marginBottom: 20,
  },
  termCountsDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  termCountsDetailLeft: {
    flex: 1,
    gap: 2,
  },
  termCountsDetailLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termCountsDetailRange: {
    fontSize: 13,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termCountsDetailCount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termCountsDetailTotalRow: {
    borderBottomWidth: 0,
    paddingTop: 14,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: '#E5E7EB',
  },
  termCountsDetailTotalLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termCountsDetailTotalCount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termCountsDetailFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
});
