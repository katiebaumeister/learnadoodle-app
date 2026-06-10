import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Platform, Modal, TouchableOpacity } from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
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
import { getAttendanceMode, isClassDayMode } from '../../../lib/attendanceMode';
import { trackEvent } from '../../../lib/analytics';
import HeaderSummaryStrip from './HeaderSummaryStrip';
import YearHeatmapGrid from './YearHeatmapGrid';
import MonthlyCalendarView from './MonthlyCalendarView';
import DayEventsPanel from './DayEventsPanel';
import AttendanceExportModal from './AttendanceExportModal';
import { useToast } from '../../Toast';
import { TOKENS } from './constants';
import { resolvePlannerYearRange } from '../plannerYearRange';

const REQUIRED_DAYS_DEFAULT = 180;
const REQUIRED_HOURS_DEFAULT = 1000;
/** Minutes logged when marking a day present with no scheduled events (matches assistant quick-mark default). */
const STANDALONE_DAY_ATTENDANCE_MINUTES = 300;
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
  renderBelowToolbar = null,
  readOnly = false,
}) {
  const [loading, setLoading] = useState(true);
  const [academicYear, setAcademicYear] = useState(null);
  const [yearRange, setYearRange] = useState(getDefaultYearRange());
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [yearEvents, setYearEvents] = useState([]);
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
  const [selectedHeatmapChildId, setSelectedHeatmapChildId] = useState(null);

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
      setAttendanceRecords(snap.attendanceRecords ?? []);
      setYearEvents(snap.yearEvents ?? []);
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
    if (!isYearPlannerLayout || !plannerYearAnchor) return;
    const { yearStart, yearEnd } = resolvePlannerYearRange(plannerYearAnchor, academicYears);
    if (!yearStart || !yearEnd) return;
    setYearRange({
      start: dateStringToDate(yearStart),
      end: dateStringToDate(yearEnd),
    });
    if (Array.isArray(academicYears) && academicYears.length > 0) {
      const match = academicYears.find((year) => {
        const start = String(year?.start_date || '').slice(0, 10);
        const end = String(year?.end_date || '').slice(0, 10);
        return start === yearStart && end === yearEnd;
      });
      if (match) setAcademicYear(match);
    }
    setRangeReady(true);
    setLoading(false);
  }, [isYearPlannerLayout, plannerYearAnchor, academicYears]);

  // Fetch attendance and events when year range (or family/children/refresh) changes.
  const yearStartKey = yearRange.start ? toLocalYYYYMMDD(yearRange.start) : '';
  const yearEndKey = yearRange.end ? toLocalYYYYMMDD(yearRange.end) : '';
  useEffect(() => {
    if (!familyIdResolved || !rangeReady || !yearStartKey || !yearEndKey) return;
    let cancelled = false;
    (async () => {
      try {
        const fetchStart = dateStringToDate(yearStartKey);
        const fetchEnd = dateStringToDate(yearEndKey);
        const startStr = yearStartKey;
        const endStr = yearEndKey;
        const childIds = children.map((c) => c.id);
        const [logs, eventsRes] = await Promise.all([
          getAttendanceLogs(familyIdResolved, childIds.length ? childIds : null, { start: startStr, end: endStr }),
          supabase
            .from('events')
            .select('*')
            .eq('family_id', familyIdResolved)
            .gte('start_ts', fetchStart.toISOString())
            .lte('start_ts', fetchEnd.toISOString())
            .neq('status', 'canceled')
            .is('deleted_at', null)
            .order('start_ts', { ascending: true }),
        ]);
        if (!cancelled) {
          setAttendanceRecords(logs || []);
          setYearEvents(eventsRes?.data || []);
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
  }, [familyIdResolved, rangeReady, yearStartKey, yearEndKey, children.length, attendanceRefreshKey]);

  const eventsInRange = yearEvents.length > 0 ? yearEvents : eventsProp.filter((e) => {
    const t = e.start_ts || e.start || e.start_local;
    if (!t) return false;
    const d = new Date(t);
    return d >= yearRange.start && d <= yearRange.end;
  });

  const attendanceTrackingMode = getAttendanceMode({ academicYearMode: academicYear?.attendance_tracking_mode });
  const events = useMemo(
    () => eventsInRange.filter((eventItem) => isInstructionalEventForMode(eventItem, attendanceTrackingMode)),
    [eventsInRange, attendanceTrackingMode]
  );

  const eventsByDateChild = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      const dateStr = (e.start_ts || e.start || e.start_local || '').slice(0, 10);
      if (!dateStr) return;
      const childIds = e.child_ids && Array.isArray(e.child_ids) && e.child_ids.length > 0
        ? e.child_ids
        : (e.child_id ? [e.child_id] : []);
      childIds.forEach((childId) => {
        if (!childId) return;
        if (!map[dateStr]) map[dateStr] = {};
        if (!map[dateStr][childId]) map[dateStr][childId] = [];
        map[dateStr][childId].push(e);
      });
    });
    return map;
  }, [events]);

  const attendanceByEventId = useMemo(() => {
    const map = {};
    attendanceRecords.forEach((r) => {
      if (r.event_id) map[r.event_id] = r.status || 'present';
    });
    return map;
  }, [attendanceRecords]);

  const dayStatusByChild = useMemo(() => {
    const byChild = {};
    const startStr = yearRange.start.toISOString().split('T')[0];
    const endStr = yearRange.end.toISOString().split('T')[0];
    // Today in local timezone (YYYY-MM-DD) for "past day" rule: unmarked past days count as absent
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    children.forEach((c) => { byChild[c.id] = {}; });
    for (let i = 0; i < 400; i++) {
      const d = new Date(yearRange.start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      if (key > endStr) break;
      const isPastDay = key < todayKey;
      children.forEach((c) => {
        const dayEvents = eventsByDateChild[key]?.[c.id] || [];
        const recordsForDay = attendanceRecords.filter(
          (r) => r.child_id === c.id && (r.day_date === key || (r.day_date && r.day_date.slice(0, 10) === key))
        );
        const eventIds = new Set(dayEvents.map((e) => String(e.id)));
        const hasEvent = (r) => r.event_id != null && eventIds.has(String(r.event_id));
        const standalonePresent =
          recordsForDay.some((r) => r.event_id == null && r.status === 'present');
        // Only count records for this day's events so we don't show "present" from unrelated records
        const presentForEvents = new Set(
          recordsForDay.filter((r) => r.status === 'present' && hasEvent(r)).map((r) => r.event_id)
        );
        const absentForEvents = new Set(
          recordsForDay.filter((r) => r.status === 'absent' && hasEvent(r)).map((r) => r.event_id)
        );
        const presentCount = presentForEvents.size;
        const absentCount = absentForEvents.size;
        if (dayEvents.length === 0) {
          byChild[c.id][key] = standalonePresent ? 'present' : 'noEvents';
        } else if (presentCount >= 1 || standalonePresent) {
          // Attended: at least one event has a present record for this child
          byChild[c.id][key] = 'present';
        } else {
          // Unattended (none present): past days count as absent, future as upcoming
          byChild[c.id][key] = isPastDay ? 'absent' : 'unmarked';
        }
      });
    }
    return byChild;
  }, [children, yearRange, eventsByDateChild, attendanceRecords]);

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
    if (children.length === 0) {
      setSelectedHeatmapChildId(null);
      return;
    }
    setSelectedHeatmapChildId((prev) => {
      if (prev && children.some((c) => c.id === prev)) return prev;
      return children[0]?.id ?? null;
    });
  }, [children]);

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

  const exportRows = useMemo(() => {
    const startStr = yearRange.start.toISOString().split('T')[0];
    const endStr = yearRange.end.toISOString().split('T')[0];
    const rows = [];
    for (let i = 0; i < 400; i++) {
      const d = new Date(yearRange.start);
      d.setDate(d.getDate() + i);
      const dateKey = d.toISOString().split('T')[0];
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
  }, [yearRange, children, dayStatusByChild]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDay.dateKey) return [];
    if (selectedDay.childId != null) {
      return eventsByDateChild[selectedDay.dateKey]?.[selectedDay.childId] || [];
    }
    const byChild = eventsByDateChild[selectedDay.dateKey];
    if (!byChild) return [];
    const seen = new Set();
    const list = [];
    children.forEach((c) => {
      (byChild[c.id] || []).forEach((e) => {
        if (!seen.has(e.id)) {
          seen.add(e.id);
          list.push(e);
        }
      });
    });
    return list.sort((a, b) => (a.start_ts || a.start || '').localeCompare(b.start_ts || b.start || ''));
  }, [selectedDay.dateKey, selectedDay.childId, eventsByDateChild, children]);
  const selectedDayChild = selectedDay.childId != null ? children.find((c) => c.id === selectedDay.childId) : null;

  const handleDayPress = useCallback((dateKey, childId) => {
    setSelectedDay({ dateKey, childId: childId !== undefined ? childId : null });
  }, []);

  const getEventMinutes = useCallback((e) => {
    if (e.duration_minutes != null) return e.duration_minutes;
    const start = e.start_ts || e.start || e.start_local;
    const end = e.end_ts || e.end;
    if (start && end) return Math.round((new Date(end) - new Date(start)) / 60000);
    return 0;
  }, []);

  /** Child IDs explicitly assigned to this event (shared events have multiple). Only these children get attendance. */
  const getChildIdsForEvent = useCallback((event) => {
    if (!event) return [];
    const ids = event.child_ids && Array.isArray(event.child_ids) && event.child_ids.length > 0
      ? event.child_ids
      : (event.child_id ? [event.child_id] : []);
    return ids.filter(Boolean).map((id) => String(id));
  }, []);

  /** Events on the same day that are the same "lesson" (same source_block_id = per-child plan events, or same id). */
  const getSiblingEventsOnDay = useCallback((dateKey, event, eventsList) => {
    if (!event || !dateKey || !eventsList?.length) return [event].filter(Boolean);
    const key = String(dateKey).slice(0, 10);
    const blockId = event.source_block_id;
    return eventsList.filter((ev) => {
      const evDate = (ev.start_ts || ev.start || ev.start_local || '').slice(0, 10);
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

  const handleMarkAllRangeAttended = useCallback(async ({
    startDate = yearRange.start,
    endDate = yearRange.end,
    childId = selectedHeatmapChildId,
  } = {}) => {
    if (!familyIdResolved || markingRangeAttended || children.length === 0) return;
    setMarkingRangeAttended(true);
    try {
      const patchedAttendances = [];
      const dateKeys = getDateKeysInRange(startDate, endDate);
      if (dateKeys.length === 0) return;

      const childIds = childId
        ? [String(childId)]
        : children.map((c) => String(c.id));
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

      for (const dayKey of dateKeys) {
        const dayOps = [];
        const dayEventsByChild = eventsByDateChild[dayKey] || {};
        const uniqueDayEvents = new Map();
        Object.values(dayEventsByChild).forEach((list) => {
          (Array.isArray(list) ? list : []).forEach((event) => {
            if (event?.id != null) uniqueDayEvents.set(String(event.id), event);
          });
        });

        childIds.forEach((childId) => {
          const hasEventsForChild = (dayEventsByChild[childId] || []).length > 0;
          const standaloneKey = `${childId}|${dayKey}`;
          const standalone = existingStandaloneByChildDay.get(standaloneKey);
          if (hasEventsForChild) {
            if (standalone?.id) dayOps.push(deleteAttendanceLog(standalone.id));
            return;
          }
          if (standalone?.id) {
            if (standalone.status !== 'present') {
              dayOps.push(updateAttendanceLog(standalone.id, { status: 'present', minutes: STANDALONE_DAY_ATTENDANCE_MINUTES }));
            }
            return;
          }
          dayOps.push(createAttendanceLog({
            family_id: familyIdResolved,
            child_id: childId,
            event_id: null,
            day_date: dayKey,
            status: 'present',
            minutes: STANDALONE_DAY_ATTENDANCE_MINUTES,
          }));
        });

        for (const event of uniqueDayEvents.values()) {
          const assignedIds = getChildIdsForEvent(event);
          if (!assignedIds.length) continue;
          const minutes = getEventMinutes(event);
          assignedIds.forEach((assignedId) => {
            const childId = String(assignedId);
            const recordKey = `${String(event.id)}|${childId}|${dayKey}`;
            const existing = existingByEventChildDay.get(recordKey);
            if (existing?.id) {
              dayOps.push(updateAttendanceLog(existing.id, { status: 'present', minutes }));
            } else {
              dayOps.push(createAttendanceLog({
                family_id: familyIdResolved,
                child_id: childId,
                event_id: event.id,
                day_date: dayKey,
                status: 'present',
                minutes,
              }));
            }
          });
          dayOps.push(
            updateEventStatus(event.id, 'done').then((res) => {
              if (res?.error) {
                console.warn('[AttendanceView] Could not mark event complete:', res.error);
                return;
              }
              patchedAttendances.push({ eventId: event.id, status: 'done' });
            })
          );
        }

        if (dayOps.length > 0) await Promise.all(dayOps);
      }

      setAttendanceRefreshKey((k) => k + 1);
      notifyAttendanceUpdated(patchedAttendances);
      trackEvent('attendance_marked', {
        mode: attendanceTrackingMode,
        scope: 'day',
        status: 'present',
      });
      toast.push('Marked the selected attendance range as attended.', 'success');
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
    yearRange.start,
    yearRange.end,
    attendanceRecords,
    eventsByDateChild,
    getChildIdsForEvent,
    getEventMinutes,
    toast,
    attendanceTrackingMode,
  ]);

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
  const selectedBulkChild = children.find((c) => c.id === selectedHeatmapChildId);
  const selectedBulkChildName = selectedBulkChild?.first_name || selectedBulkChild?.name || 'the selected child';

  const rangeRow = (
    <View style={styles.topToolbar}>
      <View style={styles.rangeRowWrap}>
        <Text style={styles.rangeRowLabel}>Attendance range</Text>
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
    </View>
  );

  const belowToolbarContent = renderBelowToolbar
    ? renderBelowToolbar()
    : (
      <YearHeatmapGrid
        yearStart={yearRange.start.toISOString().slice(0, 10)}
        yearEnd={yearRange.end.toISOString().slice(0, 10)}
        selectedChildId={selectedHeatmapChildId}
        dayStatusByChild={dayStatusByChild}
        onMarkDayAttended={readOnly ? undefined : handleMarkDayAttended}
        onExport={() => {
          setExportModalChildId(selectedHeatmapChildId);
          setExportModalVisible(true);
        }}
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
              {rangeRow}
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
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.confirmModal}>
            <View style={styles.confirmHeader}>
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
            <Text style={styles.confirmBody}>
              This will mark all days from {rangeStartStr ? formatDateDisplay(rangeStartStr) : 'the start date'} to {rangeEndStr ? formatDateDisplay(rangeEndStr) : 'the end date'} as attended for {selectedHeatmapChildId ? selectedBulkChildName : 'all children'}.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setConfirmRangeVisible(false)}
                disabled={markingRangeAttended}
                {...(Platform.OS === 'web' && { cursor: markingRangeAttended ? 'default' : 'pointer' })}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmPrimaryBtn, markingRangeAttended && styles.confirmPrimaryBtnDisabled]}
                disabled={markingRangeAttended}
                onPress={async () => {
                  setConfirmRangeVisible(false);
                  await handleMarkAllRangeAttended();
                }}
                {...(Platform.OS === 'web' && { cursor: markingRangeAttended ? 'default' : 'pointer' })}
              >
                <Text style={styles.confirmPrimaryText}>
                  {markingRangeAttended ? 'Marking…' : 'Confirm'}
                </Text>
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
        children={children}
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
    paddingTop: 8,
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
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: TOKENS.border,
    backgroundColor: '#FFFFFF',
  },
  childFilterChipSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#93C5FD',
  },
  childFilterChipText: {
    fontSize: TOKENS.fontSizeCaption,
    fontWeight: '600',
    color: TOKENS.textMuted,
  },
  childFilterChipTotal: {
    fontSize: 11,
    color: TOKENS.textFaint,
  },
  childFilterChipTextSelected: {
    color: '#1E40AF',
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
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: TOKENS.accent,
    alignSelf: 'flex-start',
  },
  rangeBulkChipDisabled: {
    opacity: 0.55,
  },
  rangeBulkChipText: {
    fontSize: TOKENS.fontSizeCaption,
    fontWeight: '700',
    color: '#000',
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
    maxWidth: 460,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
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
});
