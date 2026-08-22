import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ATTENDANCE_COLORS, TOKENS } from './constants';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_HEADERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getDayKey(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

function parseDateKey(key) {
  if (!key || key.length < 10) return null;
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1;
  const d = parseInt(key.slice(8, 10), 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return { year: y, month: m, day: d };
}

function buildMonthsInRange(yearStart, yearEnd) {
  const start = parseDateKey(yearStart);
  const end = parseDateKey(yearEnd);
  if (!start || !end) return [];
  const months = [];
  let idx = 0;
  for (let y = start.year; y <= end.year; y += 1) {
    const monthStart = y === start.year ? start.month : 0;
    const monthEnd = y === end.year ? end.month : 11;
    for (let m = monthStart; m <= monthEnd; m += 1) {
      const totalDays = getDaysInMonth(y, m);
      const firstDay = (y === start.year && m === start.month) ? start.day : 1;
      const lastDay = (y === end.year && m === end.month) ? end.day : totalDays;
      months.push({
        index: idx,
        label: `${MONTH_LABELS[m]} ${y}`,
        year: y,
        monthIndex: m,
        firstDay,
        lastDay,
        totalDays,
      });
      idx += 1;
    }
  }
  return months;
}

function buildMonthCells(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  const fullRows = Math.ceil(cells.length / 7);
  while (cells.length < fullRows * 7) cells.push(null);
  return { cells, fullRows };
}

function MonthMiniCalendar({
  month,
  selectedChildId,
  dayStatusByChild,
  offDayKeys,
  onMarkDayAttended,
  onDayPress,
  interactionMode = 'attendance',
  selectedDateKey = null,
  cellSize,
  gap,
  compact = false,
  isWeb,
  hoveredCellKey,
  setHoveredCellKey,
}) {
  const { year, monthIndex, firstDay, lastDay } = month;
  const { cells, fullRows } = buildMonthCells(year, monthIndex);
  const statusMap = selectedChildId ? (dayStatusByChild[selectedChildId] || {}) : {};
  const panelWidth = 7 * (cellSize + gap);
  const cellMarginBottom = compact ? 1 : 2;
  const borderRadius = compact ? TOKENS.hmRadiusCompact : TOKENS.hmRadius;

  return (
    <View style={[styles.monthPanel, { width: panelWidth, minWidth: panelWidth }]}>
      <Text style={[styles.monthPanelTitle, compact && styles.monthPanelTitleCompact]}>{month.label}</Text>
      <View style={[styles.dayHeaders, compact && styles.dayHeadersCompact]}>
        {DAY_HEADERS.map((h, i) => (
          <Text
            key={`${h}-${i}`}
            style={[
              styles.dayHeaderText,
              compact && styles.dayHeaderTextCompact,
              { width: cellSize, marginHorizontal: gap / 2 },
            ]}
          >
            {h}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: fullRows }, (_, r) => (
          <View key={r} style={styles.weekRow}>
            {cells.slice(r * 7, r * 7 + 7).map((day, c) => {
              const i = r * 7 + c;
              if (!day) {
                return (
                  <View
                    key={`empty-${year}-${monthIndex}-${i}`}
                    style={[styles.cell, styles.cellEmpty, { width: cellSize, height: cellSize, marginHorizontal: gap / 2 }]}
                  />
                );
              }

              const inRange = day >= firstDay && day <= lastDay;
              const key = getDayKey(year, monthIndex, day);
              const cellKey = `${selectedChildId}-${key}`;
              const isOffDay = inRange && !!offDayKeys && offDayKeys.has(key);
              const status = inRange ? (statusMap[key] || 'noEvents') : null;
              const color = status
                ? (ATTENDANCE_COLORS[status] || (status === 'partial' ? ATTENDANCE_COLORS.present : ATTENDANCE_COLORS.noEvents))
                : ATTENDANCE_COLORS.noEvents;
              const isNone = status === 'noEvents';
              const isEventsMode = interactionMode === 'events';
              // Days off (holidays/breaks) are informational only — never clickable.
              const isDisabled = !inRange || isOffDay || !selectedChildId || (isEventsMode ? !onDayPress : !onMarkDayAttended);
              const isSelected = isEventsMode && selectedDateKey === key;

              return (
                <TouchableOpacity
                  key={cellKey}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      marginHorizontal: gap / 2,
                      marginBottom: cellMarginBottom,
                      backgroundColor: inRange ? color : 'transparent',
                      borderRadius,
                    },
                    inRange && isNone && !isOffDay && styles.cellNone,
                    inRange && isOffDay && styles.cellOffDay,
                    !inRange && styles.cellOutOfRange,
                    isSelected && styles.cellSelected,
                    isWeb && !isDisabled && styles.cellWeb,
                    isWeb && hoveredCellKey === cellKey && styles.cellHover,
                  ]}
                  activeOpacity={0.8}
                  disabled={isDisabled}
                  {...(isWeb && isOffDay && { title: 'Day off' })}
                  onPress={() => {
                    if (isOffDay) return;
                    if (isEventsMode && onDayPress) {
                      onDayPress(key);
                      return;
                    }
                    if (onMarkDayAttended) {
                      onMarkDayAttended(key, selectedChildId);
                    }
                  }}
                  {...(isWeb && !isDisabled && {
                    onMouseEnter: () => setHoveredCellKey(cellKey),
                    onMouseLeave: () => setHoveredCellKey(null),
                  })}
                >
                  <Text
                    style={[
                      styles.cellDayText,
                      compact && styles.cellDayTextCompact,
                      !inRange && styles.cellDayTextMuted,
                    ]}
                    numberOfLines={1}
                  >
                    {day}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export function YearHeatmapLegend({ style, compact = false, toolbar = false }) {
  const pillStyle = [
    styles.legendPill,
    compact && styles.legendPillCompact,
    toolbar && styles.legendPillToolbar,
  ];
  const textStyle = [
    styles.legendPillText,
    compact && styles.legendPillTextCompact,
    toolbar && styles.legendPillTextToolbar,
  ];
  return (
    <View style={[styles.legend, compact && styles.legendCompact, toolbar && styles.legendToolbar, style]}>
      <View style={pillStyle}>
        <View style={[styles.legendDot, toolbar && styles.legendDotToolbar, { backgroundColor: ATTENDANCE_COLORS.present }]} />
        <Text style={textStyle}>Attended</Text>
      </View>
      <View style={pillStyle}>
        <View style={[styles.legendDot, toolbar && styles.legendDotToolbar, { backgroundColor: ATTENDANCE_COLORS.absent }]} />
        <Text style={textStyle}>Unattended</Text>
      </View>
      <View style={pillStyle}>
        <View style={[styles.legendDot, toolbar && styles.legendDotToolbar, { backgroundColor: ATTENDANCE_COLORS.unmarked }]} />
        <Text style={textStyle}>Upcoming</Text>
      </View>
      <View style={pillStyle}>
        <View style={[styles.legendDot, toolbar && styles.legendDotToolbar, { backgroundColor: ATTENDANCE_COLORS.noEvents }]} />
        <Text style={textStyle}>No events</Text>
      </View>
      <View style={pillStyle}>
        <View style={[styles.legendDot, styles.legendDotOffDay, toolbar && styles.legendDotToolbar]} />
        <Text style={textStyle}>Day off</Text>
      </View>
    </View>
  );
}

export default function YearHeatmapGrid({
  yearStart,
  yearEnd,
  selectedChildId = null,
  dayStatusByChild = {},
  offDayKeys = null,
  onMarkDayAttended,
  onDayPress = null,
  interactionMode = 'attendance',
  selectedDateKey = null,
  showLegend = true,
  compact = false,
}) {
  const [hoveredCellKey, setHoveredCellKey] = useState(null);
  const cellSize = compact ? TOKENS.hmCellCompact : TOKENS.hmCell;
  const gap = compact ? TOKENS.hmGapCompact : TOKENS.hmGap;
  const isWeb = Platform.OS === 'web';

  const months = useMemo(() => buildMonthsInRange(yearStart, yearEnd), [yearStart, yearEnd]);

  if (!selectedChildId) {
    return null;
  }

  return (
    <>
      <View style={[styles.monthGrid, compact && styles.monthGridCompact]}>
        {months.map((m) => (
          <MonthMiniCalendar
            key={m.index}
            month={m}
            selectedChildId={selectedChildId}
            dayStatusByChild={dayStatusByChild}
            offDayKeys={offDayKeys}
            onMarkDayAttended={onMarkDayAttended}
            onDayPress={onDayPress}
            interactionMode={interactionMode}
            selectedDateKey={selectedDateKey}
            cellSize={cellSize}
            gap={gap}
            compact={compact}
            isWeb={isWeb}
            hoveredCellKey={hoveredCellKey}
            setHoveredCellKey={setHoveredCellKey}
          />
        ))}
      </View>
      {showLegend ? <YearHeatmapLegend style={compact ? styles.legendCompact : null} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TOKENS.s5,
    paddingVertical: TOKENS.s2,
  },
  monthGridCompact: {
    gap: TOKENS.s3,
    paddingVertical: 0,
  },
  monthPanel: {},
  monthPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  monthPanelTitleCompact: {
    fontSize: 11,
    marginBottom: 3,
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
    justifyContent: 'center',
  },
  dayHeadersCompact: {
    marginBottom: 2,
  },
  dayHeaderText: {
    textAlign: 'center',
    fontSize: 10,
    color: TOKENS.textMuted,
    fontWeight: '600',
  },
  dayHeaderTextCompact: {
    fontSize: 8,
  },
  grid: {},
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  cell: {
    borderRadius: TOKENS.hmRadius,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellEmpty: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  cellNone: {
    backgroundColor: ATTENDANCE_COLORS.noEvents,
    borderColor: 'rgba(15,23,42,0.06)',
  },
  cellOffDay: {
    // Days off (holidays/breaks) — neutral, clearly non-interactive.
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderColor: 'rgba(15,23,42,0.06)',
    borderStyle: 'dashed',
    opacity: 0.7,
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  cellOutOfRange: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    opacity: 0.35,
  },
  cellSelected: {
    borderColor: '#6366F1',
    borderWidth: 2,
    ...(Platform.OS === 'web' && { boxShadow: '0 0 0 2px rgba(99, 102, 241, 0.18)' }),
  },
  cellDayText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.75)',
  },
  cellDayTextCompact: {
    fontSize: 9,
  },
  cellDayTextMuted: {
    color: TOKENS.textFaint,
  },
  cellWeb: {
    cursor: 'pointer',
    ...(Platform.OS === 'web' && { transition: 'transform 0.12s ease, box-shadow 0.12s ease' }),
  },
  cellHover: Platform.OS === 'web' ? {
    transform: [{ translateY: -1 }],
    ...TOKENS.shadow1,
  } : {},
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: TOKENS.s3,
    marginTop: TOKENS.s4,
  },
  legendCompact: {
    marginTop: TOKENS.s2,
    gap: TOKENS.s2,
  },
  legendToolbar: {
    marginTop: 0,
    gap: 8,
  },
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TOKENS.s2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: TOKENS.bgSubtle,
  },
  legendPillCompact: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6,
  },
  legendPillToolbar: {
    minHeight: 36,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
  },
  legendPillText: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted, opacity: 0.9 },
  legendPillTextCompact: { fontSize: 11 },
  legendPillTextToolbar: {
    fontSize: 14,
    lineHeight: 18,
    color: 'rgba(15, 23, 42, 0.9)',
    opacity: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  legendDot: { width: 8, height: 8, borderRadius: 4, opacity: 0.9 },
  legendDotToolbar: { width: 9, height: 9, borderRadius: 5 },
  legendDotOffDay: {
    backgroundColor: 'rgba(15,23,42,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.35)',
    borderStyle: 'dashed',
  },
});
