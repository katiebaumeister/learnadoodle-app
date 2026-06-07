import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Download } from 'lucide-react';
import { ATTENDANCE_COLORS, TOKENS } from './constants';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getDayKey(year, month, day) {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/** Parse YYYY-MM-DD to { year, month, day }. */
function parseDateKey(key) {
  if (!key || key.length < 10) return null;
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1;
  const d = parseInt(key.slice(8, 10), 10);
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return null;
  return { year: y, month: m, day: d };
}

/** Build list of months from range start to end (inclusive). */
function buildMonthsInRange(yearStart, yearEnd) {
  const start = parseDateKey(yearStart);
  const end = parseDateKey(yearEnd);
  if (!start || !end) return [];
  const months = [];
  let idx = 0;
  for (let y = start.year; y <= end.year; y++) {
    const monthStart = y === start.year ? start.month : 0;
    const monthEnd = y === end.year ? end.month : 11;
    for (let m = monthStart; m <= monthEnd; m++) {
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

export default function YearHeatmapGrid({
  yearStart,
  yearEnd,
  children = [],
  childSummaries = [],
  dayStatusByChild = {},
  onMarkDayAttended,
  onExport = null,
  onChildNamePress = null,
}) {
  const [hoveredCellKey, setHoveredCellKey] = useState(null);
  const cellSize = TOKENS.hmCell;
  const gap = TOKENS.hmGap;
  const rowSpacing = gap + 2;
  const isWeb = Platform.OS === 'web';

  const months = useMemo(() => buildMonthsInRange(yearStart, yearEnd), [yearStart, yearEnd]);

  const heatmapBlock = (
    <>
      <View style={styles.monthStack}>
        {months.map((m) => (
          <View key={m.index} style={styles.monthSection}>
            <Text style={styles.monthSectionTitle}>{m.label}</Text>
            {children.map((child) => {
              const statusMap = dayStatusByChild[child.id] || {};
              const childName = child.first_name || child.name || 'Child';
              return (
                <View key={child.id} style={styles.childMonthRow}>
                  <View style={styles.childMonthLabel}>
                    {onChildNamePress ? (
                      <TouchableOpacity
                        onPress={() => onChildNamePress(child)}
                        activeOpacity={0.7}
                        style={styles.nameLabelTouchable}
                        {...(Platform.OS === 'web' && {
                          accessibilityRole: 'button',
                          accessibilityLabel: `View attendance for ${childName}`,
                        })}
                      >
                        <Text style={styles.childMonthName} numberOfLines={1}>
                          {childName}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={styles.childMonthName} numberOfLines={1}>
                        {childName}
                      </Text>
                    )}
                  </View>
                  <View style={styles.daysRow}>
                    {Array.from({ length: m.lastDay - m.firstDay + 1 }, (_, i) => m.firstDay + i).map((day) => {
                      const key = getDayKey(m.year, m.monthIndex, day);
                      const cellKey = `${child.id}-${key}`;
                      const status = statusMap[key] || 'noEvents';
                      const color = ATTENDANCE_COLORS[status] || (status === 'partial' ? ATTENDANCE_COLORS.present : ATTENDANCE_COLORS.noEvents);
                      const isNone = status === 'noEvents';
                      return (
                        <TouchableOpacity
                          key={cellKey}
                          style={[
                            styles.cell,
                            {
                              width: cellSize,
                              height: cellSize,
                              marginRight: gap,
                              marginBottom: rowSpacing,
                              backgroundColor: color,
                            },
                            isNone && styles.cellNone,
                            isWeb && styles.cellWeb,
                            isWeb && hoveredCellKey === cellKey && styles.cellHover,
                          ]}
                          activeOpacity={0.8}
                          onPress={() => onMarkDayAttended && onMarkDayAttended(key, child.id)}
                          {...(isWeb && {
                            onMouseEnter: () => setHoveredCellKey(cellKey),
                            onMouseLeave: () => setHoveredCellKey(null),
                          })}
                        >
                          <Text style={styles.cellDayText} numberOfLines={1}>
                            {day}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
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
        Each month is a row; each child has a line of day cells. Click a cell to mark that day as attended or unattended for that child. You can mark a day even when no lessons are scheduled (attendance-only). For lessons shared with multiple children, marking attended marks all of them; unmarking affects only that child. Click a child&apos;s name to export their report.
      </Text>
      {heatmapBlock}
    </>
  );
}

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
  monthStack: {
    gap: TOKENS.s5,
    paddingVertical: TOKENS.s2,
  },
  monthSection: {
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.border,
    paddingBottom: TOKENS.s4,
  },
  monthSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TOKENS.text,
    marginBottom: TOKENS.s3,
  },
  childMonthRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: TOKENS.s2,
  },
  childMonthLabel: {
    width: 72,
    paddingRight: 8,
    paddingTop: 4,
    flexShrink: 0,
  },
  childMonthName: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
  },
  nameLabelTouchable: {
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  daysRow: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    minWidth: 0,
  },
  cell: {
    borderRadius: TOKENS.hmRadius,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellNone: {
    backgroundColor: 'rgba(15,23,42,0.02)',
    borderColor: 'rgba(15,23,42,0.04)',
  },
  cellDayText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.75)',
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
