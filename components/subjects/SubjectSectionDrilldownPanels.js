import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ATTENDANCE_COLORS, TOKENS } from '../planner/attendance/constants';
import YearHeatmapGrid from '../planner/attendance/YearHeatmapGrid';
import MonthlyCalendarView from '../planner/attendance/MonthlyCalendarView';
import DayEventsPanel from '../planner/attendance/DayEventsPanel';

function toDateKey(value) {
  if (!value) return null;
  const asString = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) return asString;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildMonthCells(monthDate) {
  const y = monthDate.getFullYear();
  const m = monthDate.getMonth();
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const leading = first.getDay();
  const cells = [];
  for (let i = 0; i < leading; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ day, key });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function MonthCalendar({ monthDate, selectedKey, onSelectKey, onMonthChange, getTone }) {
  const cells = buildMonthCells(monthDate);
  return (
    <View style={styles.calendarWrap}>
      <View style={styles.calendarHeader}>
        <TouchableOpacity onPress={() => onMonthChange(-1)} style={styles.calendarNavBtn}>
          <ChevronLeft size={16} color="#64748b" />
        </TouchableOpacity>
        <Text style={styles.calendarMonthLabel}>
          {monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={() => onMonthChange(1)} style={styles.calendarNavBtn}>
          <ChevronRight size={16} color="#64748b" />
        </TouchableOpacity>
      </View>
      <View style={styles.weekdayRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
          <Text key={d} style={styles.weekdayCell}>{d}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {cells.map((cell, idx) => {
          if (!cell) return <View key={`empty-${idx}`} style={[styles.dayCell, styles.dayCellEmpty]} />;
          const tone = getTone(cell.key);
          const isSelected = selectedKey === cell.key;
          return (
            <TouchableOpacity
              key={cell.key}
              style={[
                styles.dayCell,
                tone === 'present' && styles.dayCellPresent,
                tone === 'absent' && styles.dayCellAbsent,
                tone === 'graded' && styles.dayCellGraded,
                tone === 'unmarked' && styles.dayCellUnmarked,
                isSelected && styles.dayCellSelected,
              ]}
              onPress={() => onSelectKey(cell.key)}
              activeOpacity={0.85}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>{cell.day}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function YearHeatmap({ title, dateKeys = [], colorForKey }) {
  const uniqueKeys = useMemo(() => Array.from(new Set(dateKeys.filter(Boolean))).sort(), [dateKeys]);
  if (!uniqueKeys.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>No data yet for this view.</Text>
      </View>
    );
  }
  return (
    <View style={styles.heatmapWrap}>
      <Text style={styles.panelTitle}>{title}</Text>
      <View style={styles.heatmapGrid}>
        {uniqueKeys.map((key) => (
          <View
            key={key}
            style={[styles.heatmapCell, colorForKey(key)]}
            title={key}
          />
        ))}
      </View>
    </View>
  );
}


const SUBJECT_SYNTHETIC_CHILD_ID = '__subject__';

export const SubjectAttendanceYearHeatmap = React.memo(function SubjectAttendanceYearHeatmap({ attendanceRecords = [], subjectEvents = [], onDayPress = null, onMarkDayAttended = null, isDayMarkable = null, hideLegend = false, interactionMode = 'events', selectedDateKey = null }) {
  const todayKey = useMemo(() => toDateKey(new Date()), []);

  const { yearStart, yearEnd, dayStatusByChild } = useMemo(() => {
    const recordStatusByKey = new Map();
    attendanceRecords.forEach((record) => {
      const key = toDateKey(record?.day_date);
      if (!key) return;
      const status = String(record?.status || '').toLowerCase();
      if (status === 'present') {
        recordStatusByKey.set(key, 'present');
      } else if (!recordStatusByKey.has(key)) {
        recordStatusByKey.set(key, 'absent');
      }
    });

    const eventKeys = new Set();
    subjectEvents.forEach((event) => {
      const key = toDateKey(event?.start_ts || event?.start || event?.start_local || event?.date);
      if (key) eventKeys.add(key);
    });

    const allKeys = Array.from(new Set([...Array.from(recordStatusByKey.keys()), ...Array.from(eventKeys)])).sort();
    if (!allKeys.length) return { yearStart: null, yearEnd: null, dayStatusByChild: {} };

    const earliestYear = parseInt(allKeys[0].slice(0, 4), 10);
    const latestYear = parseInt(allKeys[allKeys.length - 1].slice(0, 4), 10);
    const start = `${earliestYear}-01-01`;
    const end = `${latestYear}-12-31`;

    const statusMap = {};
    allKeys.forEach((key) => {
      const explicitStatus = recordStatusByKey.get(key);
      const hasEvent = eventKeys.has(key);
      const isMarkable = typeof isDayMarkable === 'function' ? !!isDayMarkable(key) : false;
      const hasSchedule = hasEvent || isMarkable || !!explicitStatus;
      if (explicitStatus === 'present') {
        statusMap[key] = 'present';
      } else if (hasSchedule && key > todayKey) {
        statusMap[key] = 'unmarked';
      } else if (hasSchedule) {
        statusMap[key] = 'absent';
      } else {
        statusMap[key] = 'noEvents';
      }
    });

    return {
      yearStart: start,
      yearEnd: end,
      dayStatusByChild: { [SUBJECT_SYNTHETIC_CHILD_ID]: statusMap },
    };
  }, [attendanceRecords, subjectEvents, isDayMarkable, todayKey]);

  if (!yearStart || !yearEnd) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>No data yet for this view.</Text>
      </View>
    );
  }

  return (
    <YearHeatmapGrid
      yearStart={yearStart}
      yearEnd={yearEnd}
      selectedChildId={SUBJECT_SYNTHETIC_CHILD_ID}
      dayStatusByChild={dayStatusByChild}
      offDayKeys={null}
      onDayPress={onDayPress}
      onMarkDayAttended={onMarkDayAttended}
      interactionMode={interactionMode}
      showLegend={!hideLegend}
      selectedDateKey={selectedDateKey}
    />
  );
});

export function SubjectAttendanceMonthDrilldown({
  attendanceRecords = [],
  subjectEvents = [],
  onOpenEventDetails = null,
  onToggleEventAttendance = null,
  onMarkAllAttendedDay = null,
  onAddEventForDate = null,
  hideLegend = false,
}) {
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedKey, setSelectedKey] = useState(null);
  const recordsByDate = useMemo(() => {
    const map = new Map();
    attendanceRecords.forEach((r) => {
      const key = toDateKey(r?.day_date);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return map;
  }, [attendanceRecords]);
  const eventsByDate = useMemo(() => {
    const map = new Map();
    subjectEvents.forEach((e) => {
      const key = toDateKey(e?.start_ts || e?.start || e?.start_local);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return map;
  }, [subjectEvents]);
  const dayStatusByChild = useMemo(() => {
    const statuses = {};
    const todayKey = toDateKey(new Date());
    const allKeys = new Set([...Array.from(recordsByDate.keys()), ...Array.from(eventsByDate.keys())]);
    allKeys.forEach((key) => {
      const rows = recordsByDate.get(key) || [];
      const hasPresent = rows.some((r) => String(r?.status || '').toLowerCase() === 'present');
      const hasAbsent = rows.some((r) => String(r?.status || '').toLowerCase() === 'absent');
      const hasEvents = (eventsByDate.get(key) || []).length > 0;
      if (hasPresent) statuses[key] = 'present';
      else if (hasAbsent) statuses[key] = 'absent';
      else if (hasEvents) statuses[key] = todayKey && key > todayKey ? 'unmarked' : 'absent';
      else statuses[key] = 'noEvents';
    });
    return { all: statuses };
  }, [recordsByDate, eventsByDate]);
  const selectedRows = selectedKey ? (recordsByDate.get(selectedKey) || []) : [];
  const selectedEvents = selectedKey ? (eventsByDate.get(selectedKey) || []) : [];
  const selectedAttendanceByEventId = useMemo(() => {
    if (!selectedKey) return {};
    const todayKey = toDateKey(new Date());
    const statusMap = {};
    selectedEvents.forEach((event) => {
      const rowsForEvent = selectedRows.filter((row) => row?.event_id === event.id);
      if (rowsForEvent.some((row) => String(row?.status || '').toLowerCase() === 'present')) {
        statusMap[event.id] = 'present';
      } else if (rowsForEvent.some((row) => String(row?.status || '').toLowerCase() === 'absent')) {
        statusMap[event.id] = 'absent';
      } else if (!todayKey || selectedKey <= todayKey) {
        statusMap[event.id] = 'absent';
      }
    });
    return statusMap;
  }, [selectedKey, selectedEvents, selectedRows]);
  const selectedDateLabel = useMemo(() => {
    if (!selectedKey) return null;
    const d = new Date(`${selectedKey}T12:00:00`);
    if (Number.isNaN(d.getTime())) return selectedKey;
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedKey]);

  return (
    <View style={styles.attendanceDrilldownSection}>
      <View style={styles.attendanceDrilldownGrid}>
        <View style={styles.attendanceCalendarWithDivider}>
          <View style={styles.attendanceCalendarColumn}>
            <MonthlyCalendarView
              monthDate={monthDate}
              dayStatusByChild={dayStatusByChild}
              selectedChildId="all"
              selectedDateKey={selectedKey}
              children={[{ id: 'all' }]}
              enableVerticalMonthScroll
              onMonthChange={(delta) => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))}
              onDayPress={setSelectedKey}
            />
          </View>
          <View style={styles.attendanceDrilldownDivider} />
        </View>
        <View style={styles.attendanceDetailColumn}>
          <DayEventsPanel
            dateLabel={selectedDateLabel}
            childName={selectedKey ? 'All children' : null}
            events={selectedEvents}
            attendanceByEventId={selectedAttendanceByEventId}
            compactEventRows
            onToggleEventAttendance={selectedKey && onToggleEventAttendance ? (eventId) => onToggleEventAttendance(selectedKey, eventId) : null}
            onMarkAllAttended={selectedKey && onMarkAllAttendedDay ? () => onMarkAllAttendedDay(selectedKey) : null}
            onAddEventForDate={selectedKey && onAddEventForDate ? () => onAddEventForDate(selectedKey) : null}
            onEventPress={onOpenEventDetails ? (event) => onOpenEventDetails(event.id, event) : null}
            getEventMinutes={(event) => {
              const direct = Number(event?.duration_minutes);
              if (Number.isFinite(direct) && direct > 0) return direct;
              const startTs = event?.start_ts || event?.start || event?.start_local;
              const endTs = event?.end_ts || event?.end || event?.end_local;
              if (startTs && endTs) {
                const minutes = Math.round((new Date(endTs) - new Date(startTs)) / 60000);
                if (Number.isFinite(minutes) && minutes > 0) return minutes;
              }
              return 0;
            }}
          />
        </View>
      </View>
      {!hideLegend ? (
        <View style={[styles.subjectHeatmapLegend, styles.monthHeatmapLegend]}>
          <View style={styles.subjectHeatmapLegendPill}>
            <View style={[styles.subjectHeatmapLegendDot, styles.heatmapPresent]} />
            <Text style={styles.subjectHeatmapLegendText}>Attended</Text>
          </View>
          <View style={styles.subjectHeatmapLegendPill}>
            <View style={[styles.subjectHeatmapLegendDot, styles.heatmapAbsent]} />
            <Text style={styles.subjectHeatmapLegendText}>Unattended</Text>
          </View>
          <View style={styles.subjectHeatmapLegendPill}>
            <View style={[styles.subjectHeatmapLegendDot, styles.heatmapUpcoming]} />
            <Text style={styles.subjectHeatmapLegendText}>Upcoming</Text>
          </View>
          <View style={styles.subjectHeatmapLegendPill}>
            <View style={[styles.subjectHeatmapLegendDot, styles.heatmapNoEvents]} />
            <Text style={styles.subjectHeatmapLegendText}>No events</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function SubjectGradesYearHeatmap({ gradedItems = [] }) {
  const dateKeys = gradedItems.map((g) => toDateKey(g?.date)).filter(Boolean);
  return (
    <YearHeatmap
      title="Year heatmap"
      dateKeys={dateKeys}
      colorForKey={() => styles.heatmapGraded}
    />
  );
}

export function SubjectGradesMonthDrilldown({ gradedItems = [] }) {
  const [monthDate, setMonthDate] = useState(new Date());
  const [selectedKey, setSelectedKey] = useState(null);
  const gradesByDate = useMemo(() => {
    const map = new Map();
    gradedItems.forEach((g) => {
      const key = toDateKey(g?.date);
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(g);
    });
    return map;
  }, [gradedItems]);
  const selectedRows = selectedKey ? (gradesByDate.get(selectedKey) || []) : [];

  return (
    <View style={styles.drilldownWrap}>
      <View style={styles.drilldownCalendarCol}>
        <MonthCalendar
          monthDate={monthDate}
          selectedKey={selectedKey}
          onSelectKey={setSelectedKey}
          onMonthChange={(delta) => setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1))}
          getTone={(key) => ((gradesByDate.get(key) || []).length > 0 ? 'graded' : null)}
        />
      </View>
      <View style={styles.drilldownDetailCol}>
        <Text style={styles.panelTitle}>{selectedKey ? selectedKey : 'Select a day'}</Text>
        {selectedRows.length > 0 ? (
          selectedRows.slice(0, 8).map((item) => (
            <View key={item.id} style={styles.detailRow}>
              <Text style={styles.detailRowTitle}>{item.name || 'Grade item'}</Text>
              <Text style={styles.detailRowMeta}>
                {item.percent != null ? `${item.percent}%` : item.grade || '—'}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Pick a day to see grade entries.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heatmapWrap: { marginTop: 8 },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  heatmapCell: { width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: 'rgba(148,163,184,0.25)' },
  heatmapPresent: { backgroundColor: ATTENDANCE_COLORS.present },
  heatmapAbsent: { backgroundColor: ATTENDANCE_COLORS.absent },
  // Keep Upcoming visibly darker than No events for quick scanning.
  heatmapUpcoming: { backgroundColor: '#dbeafe' },
  heatmapNoEvents: { backgroundColor: '#f8fafc' },
  heatmapGraded: { backgroundColor: '#bfdbfe' },
  panelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  drilldownWrap: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', marginTop: 8 },
  drilldownCalendarCol: { minWidth: 280, flex: 1 },
  drilldownDetailCol: { minWidth: 220, flex: 1, paddingTop: 4 },
  calendarWrap: { borderWidth: 1, borderColor: 'rgba(148,163,184,0.25)', borderRadius: 10, padding: 10, backgroundColor: '#fff' },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  calendarNavBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 8, ...(Platform.OS === 'web' && { cursor: 'pointer' }) },
  calendarMonthLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  weekdayRow: { flexDirection: 'row', marginBottom: 4 },
  weekdayCell: { flex: 1, textAlign: 'center', fontSize: 11, color: '#94a3b8' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.2857%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  dayCellEmpty: { opacity: 0 },
  dayCellText: { fontSize: 12, color: '#64748b' },
  dayCellTextSelected: { color: '#0f172a', fontWeight: '700' },
  dayCellSelected: { borderColor: '#6BB3E8', backgroundColor: 'rgba(133,196,242,0.2)' },
  dayCellPresent: { backgroundColor: '#dcfce7' },
  dayCellAbsent: { backgroundColor: '#fee2e2' },
  dayCellGraded: { backgroundColor: '#dbeafe' },
  dayCellUnmarked: { backgroundColor: '#f1f5f9' },
  detailMeta: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  detailRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(148,163,184,0.2)' },
  detailRowTitle: { fontSize: 13, color: '#334155', fontWeight: '600' },
  detailRowMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
  emptyBox: { paddingVertical: 12 },
  emptyText: { fontSize: 13, color: '#64748b' },
  yearAtGlanceHeaderRow: {
    marginBottom: 2,
  },
  yearAtGlanceRangeRow: {
    marginBottom: 6,
  },
  subjectHeatmapLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TOKENS.s3,
  },
  monthHeatmapLegend: {
    marginTop: TOKENS.s3,
  },
  subjectHeatmapLegendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TOKENS.s2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: TOKENS.bgSubtle,
  },
  subjectHeatmapLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    opacity: 0.9,
  },
  subjectHeatmapLegendText: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    opacity: 0.9,
  },
  subjectRangeActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  subjectRangeRowWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: TOKENS.bgSubtle,
    alignSelf: 'flex-start',
  },
  subjectRangeRowLabel: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
  },
  subjectRangeDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  subjectRangeDate: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
  },
  subjectRangeArrow: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    marginHorizontal: 2,
  },
  subjectRangeBulkChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: TOKENS.bgSubtle,
  },
  subjectRangeBulkChipText: {
    fontSize: TOKENS.fontSizeCaption,
    fontWeight: '500',
    color: TOKENS.textMuted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceDrilldownSection: {
    marginTop: 0,
    paddingTop: 0,
  },
  attendanceDrilldownTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TOKENS.text,
    marginBottom: 8,
    letterSpacing: 0.6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearAtGlanceTitle: {
    marginBottom: 6,
  },
  attendanceDrilldownHelp: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    marginBottom: 6,
  },
  attendanceDrilldownHelpMonth: {
    marginBottom: 8,
  },
  attendanceDrilldownGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flexWrap: 'wrap',
    gap: 0,
  },
  attendanceCalendarWithDivider: {
    flexDirection: 'row',
    width: 361,
    minWidth: 281,
  },
  attendanceCalendarColumn: {
    width: 360,
    minWidth: 280,
  },
  attendanceDrilldownDivider: {
    width: 1,
    backgroundColor: 'rgba(15,23,42,0.06)',
  },
  attendanceDetailColumn: {
    flex: 1,
    minWidth: 200,
    paddingLeft: 24,
  },
});
