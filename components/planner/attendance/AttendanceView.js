import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '../../../lib/supabase';
import { getAttendanceLogs } from '../../../lib/services/recordsClient';
import HeaderSummaryStrip from './HeaderSummaryStrip';
import YearHeatmapGrid from './YearHeatmapGrid';
import MonthlyCalendarView from './MonthlyCalendarView';
import ExceptionsPanel from './ExceptionsPanel';
import TotalsPanel from './TotalsPanel';
import DayAttendanceModal from './DayAttendanceModal';
import MarkRangeModal from './MarkRangeModal';

const REQUIRED_DAYS_DEFAULT = 180;
const REQUIRED_HOURS_DEFAULT = 1000;

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

export default function AttendanceView({
  familyId,
  children: childrenProp = [],
  events: eventsProp = [],
  onEventPress,
}) {
  const [loading, setLoading] = useState(true);
  const [academicYear, setAcademicYear] = useState(null);
  const [yearRange, setYearRange] = useState(getDefaultYearRange());
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [yearEvents, setYearEvents] = useState([]);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [dayModal, setDayModal] = useState({ visible: false, date: null, childId: null });
  const [markRangeVisible, setMarkRangeVisible] = useState(false);

  const familyIdResolved = familyId || eventsProp[0]?.family_id || eventsProp[0]?.familyId;
  const children = childrenProp.length > 0 ? childrenProp : [];

  useEffect(() => {
    if (!familyIdResolved) {
      setLoading(false);
      setYearRange(getDefaultYearRange());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: years } = await supabase
          .from('academic_years')
          .select('id, year_name, start_date, end_date')
          .eq('family_id', familyIdResolved)
          .order('start_date', { ascending: false })
          .limit(1);

        const start = yearRange.start;
        const end = yearRange.end;
        const startStr = start.toISOString().split('T')[0];
        const endStr = end.toISOString().split('T')[0];

        if (years?.[0]) {
          const ay = years[0];
          setAcademicYear(ay);
          const ayStart = new Date(ay.start_date + 'T12:00:00');
          const ayEnd = new Date(ay.end_date + 'T12:00:00');
          setYearRange({ start: ayStart, end: ayEnd });
        }

        const childIds = children.map((c) => c.id);
        const [logs, eventsRes] = await Promise.all([
          getAttendanceLogs(familyIdResolved, childIds.length ? childIds : null, { start: startStr, end: endStr }),
          supabase
            .from('events')
            .select('*')
            .eq('family_id', familyIdResolved)
            .gte('start_ts', start.toISOString())
            .lte('start_ts', end.toISOString())
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
          setAttendanceRecords([]);
          setYearEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [familyIdResolved, children.length]);

  const events = yearEvents.length > 0 ? yearEvents : eventsProp.filter((e) => {
    const t = e.start_ts || e.start || e.start_local;
    if (!t) return false;
    const d = new Date(t);
    return d >= yearRange.start && d <= yearRange.end;
  });

  const eventsByDateChild = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      const dateStr = (e.start_ts || e.start || e.start_local || '').slice(0, 10);
      if (!dateStr) return;
      const childId = e.child_id || e.child_ids?.[0];
      if (!childId) return;
      if (!map[dateStr]) map[dateStr] = {};
      if (!map[dateStr][childId]) map[dateStr][childId] = [];
      map[dateStr][childId].push(e);
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
    children.forEach((c) => { byChild[c.id] = {}; });
    for (let i = 0; i < 400; i++) {
      const d = new Date(yearRange.start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      if (key > endStr) break;
      children.forEach((c) => {
        const dayEvents = eventsByDateChild[key]?.[c.id] || [];
        const recordsForDay = attendanceRecords.filter(
          (r) => r.child_id === c.id && (r.day_date === key || (r.day_date && r.day_date.slice(0, 10) === key))
        );
        const eventIds = new Set(dayEvents.map((e) => e.id));
        const presentCount = recordsForDay.filter((r) => r.status === 'present').length;
        const absentCount = recordsForDay.filter((r) => r.status === 'absent').length;
        if (dayEvents.length === 0) {
          byChild[c.id][key] = 'noEvents';
        } else if (absentCount === dayEvents.length) {
          byChild[c.id][key] = 'absent';
        } else if (presentCount === dayEvents.length) {
          byChild[c.id][key] = 'present';
        } else if (presentCount > 0) {
          byChild[c.id][key] = 'partial';
        } else {
          byChild[c.id][key] = 'unmarked';
        }
      });
    }
    return byChild;
  }, [children, yearRange, eventsByDateChild, attendanceRecords]);

  const summaryPerChild = useMemo(() => {
    return children.map((c) => {
      const daysSet = new Set();
      const minutesByDay = {};
      attendanceRecords.filter((r) => r.child_id === c.id).forEach((r) => {
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

  const exceptions = useMemo(() => {
    const list = [];
    const seen = new Set();
    Object.keys(eventsByDateChild).forEach((dateStr) => {
      Object.keys(eventsByDateChild[dateStr]).forEach((childId) => {
        const child = children.find((c) => c.id === childId);
        const dayEvents = eventsByDateChild[dateStr][childId];
        const present = dayEvents.filter((e) => attendanceByEventId[e.id] === 'present').length;
        const absent = dayEvents.filter((e) => attendanceByEventId[e.id] === 'absent').length;
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
              description: 'marked absent',
            });
          }
        }
      });
    });
    return list.sort((a, b) => (b.dateLabel > a.dateLabel ? 1 : -1));
  }, [eventsByDateChild, children, attendanceByEventId]);

  const totalsPerChild = useMemo(() => {
    return children.map((c) => {
      const minutes = attendanceRecords
        .filter((r) => r.child_id === c.id)
        .reduce((sum, r) => sum + (r.minutes || 0), 0);
      const daysSet = new Set();
      attendanceRecords.filter((r) => r.child_id === c.id).forEach((r) => {
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

  const termLabel = academicYear?.year_name
    ? (() => {
        const m = new Date().getMonth();
        if (m >= 0 && m <= 4) return 'Spring Term';
        if (m >= 5 && m <= 7) return 'Summer Term';
        return 'Fall Term';
      })()
    : 'School Year';
  const yearLabel = academicYear?.year_name || `${yearRange.start.getFullYear()}–${yearRange.end.getFullYear()} Academic Year`;

  const dayModalEvents = dayModal.date && dayModal.childId
    ? (eventsByDateChild[dayModal.date]?.[dayModal.childId] || [])
    : [];
  const dayModalChild = children.find((c) => c.id === dayModal.childId);

  const handleDayPress = useCallback((dateKey, childId) => {
    setDayModal({ visible: true, date: dateKey, childId: childId || children[0]?.id });
  }, [children]);

  const handleExport = useCallback(() => {
    // TODO: open export modal or trigger PDF/CSV
  }, []);

  const handleMarkRangeConfirm = useCallback(({ childId, fromDate, toDate }) => {
    // TODO: call API to mark all scheduled events in range as attended
  }, []);

  if (loading && !familyIdResolved) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#887DEE" />
        <Text style={styles.loadingText}>Loading attendance…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <HeaderSummaryStrip
        termLabel={termLabel}
        yearLabel={yearLabel}
        childSummaries={summaryPerChild}
        onExport={handleExport}
        onMarkRange={() => setMarkRangeVisible(true)}
        onSettings={() => {}}
      />
      {children.length > 0 ? (
        <>
          <YearHeatmapGrid
            yearStart={yearRange.start.toISOString().slice(0, 10)}
            yearEnd={yearRange.end.toISOString().slice(0, 10)}
            children={children}
            dayStatusByChild={dayStatusByChild}
            onDayPress={handleDayPress}
          />
          <MonthlyCalendarView
            monthDate={calendarMonth}
            dayStatusByChild={dayStatusByChild}
            selectedChildId={children[0]?.id}
            onMonthChange={(delta) => setCalendarMonth((m) => {
              const next = new Date(m);
              next.setMonth(next.getMonth() + delta);
              return next;
            })}
            onDayPress={(dateKey) => handleDayPress(dateKey, children[0]?.id)}
          />
          <ExceptionsPanel items={exceptions} onItemPress={(item) => setDayModal({ visible: true, date: item.dateStr, childId: item.childId || children[0]?.id })} />
          <TotalsPanel title="This Year" childTotals={totalsPerChild} />
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Add children to see attendance.</Text>
        </View>
      )}

      <DayAttendanceModal
        visible={dayModal.visible}
        dateLabel={dayModal.date ? formatDateLabel(dayModal.date) : ''}
        childName={dayModalChild?.first_name || dayModalChild?.name || ''}
        events={dayModalEvents}
        attendanceByEventId={attendanceByEventId}
        onClose={() => setDayModal({ visible: false, date: null, childId: null })}
        onMarkEvent={(eventId, status) => {
          // TODO: upsert attendance_records for event
        }}
      />
      <MarkRangeModal
        visible={markRangeVisible}
        children={children}
        onClose={() => setMarkRangeVisible(false)}
        onConfirm={handleMarkRangeConfirm}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6B7280' },
  empty: { padding: 24 },
  emptyText: { fontSize: 14, color: '#6B7280' },
});
