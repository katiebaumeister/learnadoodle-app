import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Download } from 'lucide-react';
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
  onMarkDayAttended,
  cellSize,
  gap,
  isWeb,
  hoveredCellKey,
  setHoveredCellKey,
}) {
  const { year, monthIndex, firstDay, lastDay } = month;
  const { cells, fullRows } = buildMonthCells(year, monthIndex);
  const statusMap = selectedChildId ? (dayStatusByChild[selectedChildId] || {}) : {};

  return (
    <View style={styles.monthPanel}>
      <Text style={styles.monthPanelTitle}>{month.label}</Text>
      <View style={styles.dayHeaders}>
        {DAY_HEADERS.map((h, i) => (
          <Text key={`${h}-${i}`} style={[styles.dayHeaderText, { width: cellSize, marginHorizontal: gap / 2 }]}>
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
              const status = inRange ? (statusMap[key] || 'noEvents') : null;
              const color = status
                ? (ATTENDANCE_COLORS[status] || (status === 'partial' ? ATTENDANCE_COLORS.present : ATTENDANCE_COLORS.noEvents))
                : ATTENDANCE_COLORS.noEvents;
              const isNone = status === 'noEvents';
              const isDisabled = !inRange || !selectedChildId;

              return (
                <TouchableOpacity
                  key={cellKey}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      marginHorizontal: gap / 2,
                      marginBottom: 2,
                      backgroundColor: inRange ? color : 'transparent',
                    },
                    inRange && isNone && styles.cellNone,
                    !inRange && styles.cellOutOfRange,
                    isWeb && !isDisabled && styles.cellWeb,
                    isWeb && hoveredCellKey === cellKey && styles.cellHover,
                  ]}
                  activeOpacity={0.8}
                  disabled={isDisabled}
                  onPress={() => onMarkDayAttended && onMarkDayAttended(key, selectedChildId)}
                  {...(isWeb && !isDisabled && {
                    onMouseEnter: () => setHoveredCellKey(cellKey),
                    onMouseLeave: () => setHoveredCellKey(null),
                  })}
                >
                  <Text
                    style={[
                      styles.cellDayText,
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

export default function YearHeatmapGrid({
  yearStart,
  yearEnd,
  selectedChildId = null,
  dayStatusByChild = {},
  onMarkDayAttended,
  onExport = null,
}) {
  const [hoveredCellKey, setHoveredCellKey] = useState(null);
  const cellSize = TOKENS.hmCell;
  const gap = TOKENS.hmGap;
  const isWeb = Platform.OS === 'web';

  const months = useMemo(() => buildMonthsInRange(yearStart, yearEnd), [yearStart, yearEnd]);

  return (
    <>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>Year at a glance</Text>
        {onExport && (
          <TouchableOpacity
            style={styles.exportIconBtn}
            onPress={onExport}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' && { accessibilityRole: 'button', accessibilityLabel: 'Export attendance' })}
          >
            <Download size={18} color="#374151" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.sectionHelp}>
        Each month is a calendar grid. Use the child filter above to switch learners; use the date range to change the school year. Click a day to mark it attended or unattended. You can mark days with no scheduled lessons. Shared lessons mark all children attended; unmarking affects only the selected child.
      </Text>
      {!selectedChildId ? (
        <Text style={styles.emptyHint}>Select a child above to view their calendar.</Text>
      ) : (
        <View style={styles.monthGrid}>
          {months.map((m) => (
            <MonthMiniCalendar
              key={m.index}
              month={m}
              selectedChildId={selectedChildId}
              dayStatusByChild={dayStatusByChild}
              onMarkDayAttended={onMarkDayAttended}
              cellSize={cellSize}
              gap={gap}
              isWeb={isWeb}
              hoveredCellKey={hoveredCellKey}
              setHoveredCellKey={setHoveredCellKey}
            />
          ))}
        </View>
      )}
      <View style={styles.legend}>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.present }]} />
          <Text style={styles.legendPillText}>Attended</Text>
        </View>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.absent }]} />
          <Text style={styles.legendPillText}>Unattended</Text>
        </View>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.unmarked }]} />
          <Text style={styles.legendPillText}>Upcoming</Text>
        </View>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.noEvents }]} />
          <Text style={styles.legendPillText}>No events</Text>
        </View>
      </View>
    </>
  );
}

const MONTH_PANEL_WIDTH = 7 * (TOKENS.hmCell + TOKENS.hmGap);

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: TOKENS.s2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TOKENS.text,
    letterSpacing: 0.6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exportIconBtn: {
    padding: 4,
    borderRadius: 6,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  sectionHelp: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    marginBottom: TOKENS.s4,
  },
  emptyHint: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    marginBottom: TOKENS.s4,
    fontStyle: 'italic',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TOKENS.s5,
    paddingVertical: TOKENS.s2,
  },
  monthPanel: {
    width: MONTH_PANEL_WIDTH,
    minWidth: MONTH_PANEL_WIDTH,
  },
  monthPanelTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TOKENS.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
    justifyContent: 'center',
  },
  dayHeaderText: {
    textAlign: 'center',
    fontSize: 10,
    color: TOKENS.textMuted,
    fontWeight: '600',
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
    backgroundColor: 'rgba(15,23,42,0.02)',
    borderColor: 'rgba(15,23,42,0.04)',
  },
  cellOutOfRange: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    opacity: 0.35,
  },
  cellDayText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.75)',
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
  legendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: TOKENS.s2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: TOKENS.bgSubtle,
  },
  legendPillText: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted, opacity: 0.9 },
  legendDot: { width: 8, height: 8, borderRadius: 4, opacity: 0.9 },
});
