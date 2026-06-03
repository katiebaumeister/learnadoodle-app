import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, Pressable } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ATTENDANCE_COLORS, TOKENS } from '../planner/attendance/constants';
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

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getDayKey(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function parseDateParts(key) {
  if (!key || key.length < 10) return null;
  const year = parseInt(key.slice(0, 4), 10);
  const month = parseInt(key.slice(5, 7), 10) - 1;
  const day = parseInt(key.slice(8, 10), 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  return { year, month, day };
}

function buildDayRange(startKey, endKey) {
  const start = parseDateParts(startKey);
  const end = parseDateParts(endKey);
  if (!start || !end) return [];
  const startDate = new Date(start.year, start.month, start.day);
  const endDate = new Date(end.year, end.month, end.day);
  const keys = [];
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    keys.push(getDayKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
}

function buildMonthBlocks(startKey, endKey, cellSize, gap, monthGap) {
  const start = parseDateParts(startKey);
  const end = parseDateParts(endKey);
  if (!start || !end) return [];
  const blocks = [];
  for (let year = start.year; year <= end.year; year += 1) {
    const monthStart = year === start.year ? start.month : 0;
    const monthEnd = year === end.year ? end.month : 11;
    for (let month = monthStart; month <= monthEnd; month += 1) {
      const totalDays = new Date(year, month + 1, 0).getDate();
      const firstDay = year === start.year && month === start.month ? start.day : 1;
      const lastDay = year === end.year && month === end.month ? end.day : totalDays;
      const numDays = lastDay - firstDay + 1;
      const width = (cellSize + gap) * numDays - gap;
      blocks.push({
        key: `${year}-${String(month + 1).padStart(2, '0')}`,
        label: `${MONTH_LABELS[month]} ${year}`,
        width,
        monthGap,
      });
    }
  }
  return blocks;
}

function formatDateDisplay(key) {
  if (!key) return '—';
  const parts = parseDateParts(key);
  if (!parts) return key;
  return new Date(parts.year, parts.month, parts.day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

function AttendanceYearHeatmapFull({ attendanceRecords = [], subjectEvents = [], onDayPress = null, isDayMarkable = null, hideLegend = false }) {
  const recordStatusByKey = useMemo(() => {
    const map = new Map();
    attendanceRecords.forEach((record) => {
      const key = toDateKey(record?.day_date);
      if (!key) return;
      const status = String(record?.status || '').toLowerCase();
      if (status === 'present') {
        map.set(key, 'present');
      } else if (!map.has(key)) {
        map.set(key, 'absent');
      }
    });
    return map;
  }, [attendanceRecords]);

  const eventKeys = useMemo(() => {
    const set = new Set();
    subjectEvents.forEach((event) => {
      const key = toDateKey(event?.start_ts || event?.start || event?.start_local || event?.date);
      if (key) set.add(key);
    });
    return set;
  }, [subjectEvents]);

  const dataKeys = useMemo(
    () => Array.from(new Set([...Array.from(recordStatusByKey.keys()), ...Array.from(eventKeys.values())])).sort(),
    [recordStatusByKey, eventKeys],
  );
  const earliestKey = dataKeys[0] || null;
  const latestKey = dataKeys[dataKeys.length - 1] || null;
  const earliestYear = earliestKey ? parseInt(earliestKey.slice(0, 4), 10) : null;
  const latestYear = latestKey ? parseInt(latestKey.slice(0, 4), 10) : null;
  const defaultYearStartKey = earliestYear ? `${earliestYear}-01-01` : null;
  const defaultYearEndKey = latestYear ? `${latestYear}-12-31` : null;
  const [yearStartKey, setYearStartKey] = useState(defaultYearStartKey);
  const [yearEndKey, setYearEndKey] = useState(defaultYearEndKey);
  const cellSize = Math.max(20, Math.round(TOKENS.hmCell * 0.85));
  const gap = Math.max(3, Math.round(TOKENS.hmGap * 0.66));
  const cellRadius = Math.max(4, Math.round(TOKENS.hmRadius * 0.7));
  const monthGap = 10;
  const dayKeys = useMemo(
    () => (yearStartKey && yearEndKey ? buildDayRange(yearStartKey, yearEndKey) : []),
    [yearStartKey, yearEndKey],
  );
  const monthBlocks = useMemo(
    () => (yearStartKey && yearEndKey ? buildMonthBlocks(yearStartKey, yearEndKey, cellSize, gap, monthGap) : []),
    [yearStartKey, yearEndKey, cellSize, gap, monthGap],
  );

  useEffect(() => {
    setYearStartKey(defaultYearStartKey);
    setYearEndKey(defaultYearEndKey);
  }, [defaultYearStartKey, defaultYearEndKey]);

  const shiftDateKeyByMonths = useCallback((key, delta) => {
    const parts = parseDateParts(key);
    if (!parts) return key;
    const next = new Date(parts.year, parts.month + delta, parts.day);
    return getDayKey(next.getFullYear(), next.getMonth(), next.getDate());
  }, []);

  const handleShiftStart = useCallback((delta) => {
    if (!yearStartKey || !yearEndKey) return;
    const nextStart = shiftDateKeyByMonths(yearStartKey, delta);
    if (nextStart > yearEndKey) return;
    setYearStartKey(nextStart);
  }, [yearStartKey, yearEndKey, shiftDateKeyByMonths]);

  const handleShiftEnd = useCallback((delta) => {
    if (!yearStartKey || !yearEndKey) return;
    const nextEnd = shiftDateKeyByMonths(yearEndKey, delta);
    if (nextEnd < yearStartKey) return;
    setYearEndKey(nextEnd);
  }, [yearStartKey, yearEndKey, shiftDateKeyByMonths]);

  if (!dataKeys.length) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>No data yet for this view.</Text>
      </View>
    );
  }
  const todayKey = toDateKey(new Date());
  const initialScrollX = useMemo(() => {
    let x = 0;
    for (let i = 0; i < monthBlocks.length; i += 1) {
      const month = monthBlocks[i];
      const year = parseInt(month.key.slice(0, 4), 10);
      const monthIndex = parseInt(month.key.slice(5, 7), 10) - 1;
      const monthStart = getDayKey(year, monthIndex, 1);
      const monthEnd = getDayKey(year, monthIndex, new Date(year, monthIndex + 1, 0).getDate());
      if (todayKey >= monthStart && todayKey <= monthEnd) break;
      x += month.width + month.monthGap;
    }
    return Math.max(0, x);
  }, [monthBlocks, todayKey]);

  return (
    <View style={styles.subjectHeatmapWrap}>
      <View style={styles.yearAtGlanceHeaderRow}>
        <Text style={[styles.attendanceDrilldownTitle, styles.yearAtGlanceTitle]}>Year at a glance</Text>
      </View>
      <View style={styles.yearAtGlanceRangeRow}>
        <View style={styles.subjectRangeActionsWrap}>
          <View style={styles.subjectRangeRowWrap}>
            <Text style={styles.subjectRangeRowLabel}>Attendance range</Text>
            <View style={styles.subjectRangeDateWrap}>
              <TouchableOpacity
                onPress={() => handleShiftStart(-1)}
                disabled={!yearStartKey || !yearEndKey}
                {...(Platform.OS === 'web' && { cursor: yearStartKey && yearEndKey ? 'pointer' : 'default' })}
              >
                <ChevronLeft size={14} color={TOKENS.textMuted} />
              </TouchableOpacity>
              <Text style={styles.subjectRangeDate}>{formatDateDisplay(yearStartKey)}</Text>
              <TouchableOpacity
                onPress={() => handleShiftStart(1)}
                disabled={!yearStartKey || !yearEndKey}
                {...(Platform.OS === 'web' && { cursor: yearStartKey && yearEndKey ? 'pointer' : 'default' })}
              >
                <ChevronRight size={14} color={TOKENS.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.subjectRangeArrow}>→</Text>
            <View style={styles.subjectRangeDateWrap}>
              <TouchableOpacity
                onPress={() => handleShiftEnd(-1)}
                disabled={!yearStartKey || !yearEndKey}
                {...(Platform.OS === 'web' && { cursor: yearStartKey && yearEndKey ? 'pointer' : 'default' })}
              >
                <ChevronLeft size={14} color={TOKENS.textMuted} />
              </TouchableOpacity>
              <Text style={styles.subjectRangeDate}>{formatDateDisplay(yearEndKey)}</Text>
              <TouchableOpacity
                onPress={() => handleShiftEnd(1)}
                disabled={!yearStartKey || !yearEndKey}
                {...(Platform.OS === 'web' && { cursor: yearStartKey && yearEndKey ? 'pointer' : 'default' })}
              >
                <ChevronRight size={14} color={TOKENS.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      <Text style={styles.subjectHeatmapHelpText}>
        Click a cell to mark that day as attended or unattended. For courses shared with multiple children, marking attended marks attendance for all of them. Scroll left and right for other months.
      </Text>
      <ScrollView
        horizontal
        style={styles.subjectHeatmapScroll}
        contentContainerStyle={styles.subjectHeatmapScrollContent}
        contentOffset={{ x: initialScrollX, y: 0 }}
        showsHorizontalScrollIndicator
      >
        <View style={styles.subjectHeatmapInner}>
          <View style={styles.subjectHeatmapMonthRow}>
            {monthBlocks.map((month) => (
              <View key={month.key} style={[styles.subjectHeatmapMonthLabelWrap, { width: month.width, marginRight: month.monthGap }]}>
                <Text style={styles.subjectHeatmapMonthLabel}>{month.label}</Text>
              </View>
            ))}
          </View>
          <View style={styles.subjectHeatmapCellsRow}>
            {dayKeys.map((key) => {
              const explicitStatus = recordStatusByKey.get(key);
              const hasEvent = eventKeys.has(key);
              const isMarkableByRule = typeof isDayMarkable === 'function' ? !!isDayMarkable(key) : false;
              const isMarkableDay = isMarkableByRule || hasEvent || !!explicitStatus;
              const hasSchedule = hasEvent || isMarkableDay;
              const status = explicitStatus || (hasSchedule ? (key > todayKey ? 'upcoming' : 'absent') : 'noEvents');
              const canPressDay = typeof onDayPress === 'function' && isMarkableDay;
              const handleDayPress = () => {
                if (typeof onDayPress === 'function') onDayPress(key);
              };
              return (
                <Pressable
                  key={key}
                  style={({ pressed }) => ([
                    styles.subjectHeatmapCell,
                    { width: cellSize, height: cellSize, borderRadius: cellRadius, marginRight: gap },
                    status === 'present' && styles.heatmapPresent,
                    status === 'absent' && styles.heatmapAbsent,
                    status === 'upcoming' && styles.heatmapUpcoming,
                    status === 'noEvents' && styles.heatmapNoEvents,
                    pressed && canPressDay ? styles.subjectHeatmapCellPressed : null,
                  ])}
                  title={key}
                  onPress={canPressDay ? handleDayPress : undefined}
                  {...(Platform.OS === 'web' && {
                    role: canPressDay ? 'button' : undefined,
                    cursor: canPressDay ? 'pointer' : 'default',
                    onMouseDown: canPressDay ? (e) => {
                      e.preventDefault();
                    } : undefined,
                  })}
                >
                  <Text style={styles.subjectHeatmapCellDayText}>{parseInt(key.slice(8, 10), 10)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
      {!hideLegend ? (
        <View style={styles.subjectHeatmapLegendAndRangeRow}>
          <View style={styles.subjectHeatmapLegend}>
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
          </View>
        </View>
      ) : null}
    </View>
  );
}

export function SubjectAttendanceYearHeatmap({ attendanceRecords = [], subjectEvents = [], onDayPress = null, isDayMarkable = null, hideLegend = false }) {
  return (
    <AttendanceYearHeatmapFull
      attendanceRecords={attendanceRecords}
      subjectEvents={subjectEvents}
      onDayPress={onDayPress}
      isDayMarkable={isDayMarkable}
      hideLegend={hideLegend}
    />
  );
}

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
  subjectHeatmapWrap: { marginTop: 0 },
  subjectHeatmapHelpText: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    marginBottom: 10,
    lineHeight: 17,
  },
  subjectHeatmapScroll: { width: '100%' },
  subjectHeatmapScrollContent: { paddingBottom: 4, paddingRight: 12 },
  subjectHeatmapInner: { minWidth: '100%' },
  subjectHeatmapMonthRow: { flexDirection: 'row', marginBottom: 12 },
  subjectHeatmapMonthLabelWrap: { alignItems: 'center' },
  subjectHeatmapMonthLabel: { fontSize: 14, fontWeight: '600', color: TOKENS.text },
  subjectHeatmapCellsRow: { flexDirection: 'row', marginBottom: 6 },
  subjectHeatmapCell: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subjectHeatmapCellPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },
  subjectHeatmapCellDayText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.75)',
  },
  yearAtGlanceHeaderRow: {
    marginBottom: 2,
  },
  yearAtGlanceRangeRow: {
    marginBottom: 6,
  },
  subjectHeatmapLegendAndRangeRow: {
    marginTop: TOKENS.s3,
    alignItems: 'flex-start',
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
