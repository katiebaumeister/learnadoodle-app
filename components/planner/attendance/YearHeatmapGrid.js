import React, { useRef, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
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

export default function YearHeatmapGrid({
  yearStart,
  yearEnd,
  children = [],
  childSummaries = [],
  dayStatusByChild = {},
  onMarkDayAttended,
  onEditChild = null,
  onExport = null,
  onChildNamePress = null,
}) {
  const scrollRef = useRef(null);
  const [hoveredCellKey, setHoveredCellKey] = useState(null);
  const cellSize = TOKENS.hmCell;
  const gap = TOKENS.hmGap;
  const labelWidth = 52;
  const rowSpacing = gap + 4;
  const monthRowHeight = 22;
  const isWeb = Platform.OS === 'web';

  const now = new Date();
  const displayYear = now.getFullYear();
  const currentMonthIndex = now.getMonth();

  const months = useMemo(() => {
    return MONTH_LABELS.map((label, i) => {
      const daysInMonth = getDaysInMonth(displayYear, i);
      const width = (cellSize + gap) * daysInMonth - gap;
      return { index: i, label, year: displayYear, daysInMonth, width };
    });
  }, [displayYear, cellSize]);

  const monthGap = 10;

  const initialScrollX = useMemo(() => {
    let x = 0;
    for (let i = 0; i < currentMonthIndex; i++) {
      x += months[i].width + monthGap;
    }
    return x;
  }, [months, currentMonthIndex]);

  useEffect(() => {
    if (scrollRef.current == null || initialScrollX <= 0) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo?.({ x: initialScrollX, animated: false });
    }, 100);
    return () => clearTimeout(t);
  }, [initialScrollX]);

  const heatmapBlock = (
    <>
      <View style={styles.heatmapWrap}>
        <View style={[styles.labelColumn, { width: labelWidth }]}>
          <View style={[styles.monthRowPlaceholder, { height: monthRowHeight }]} />
          {children.map((child) => (
            <View key={child.id} style={[styles.labelRow, { height: cellSize + rowSpacing, marginBottom: rowSpacing }]}>
              {onChildNamePress ? (
                <TouchableOpacity
                  onPress={() => onChildNamePress(child)}
                  activeOpacity={0.7}
                  style={styles.nameLabelTouchable}
                  {...(Platform.OS === 'web' && { accessibilityRole: 'button', accessibilityLabel: `View attendance for ${child.first_name || child.name || 'Child'}` })}
                >
                  <Text style={styles.nameLabel} numberOfLines={1}>
                    {child.first_name || child.name || 'Child'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.nameLabel} numberOfLines={1}>
                  {child.first_name || child.name || 'Child'}
                </Text>
              )}
            </View>
          ))}
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={true}
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.grid}>
            <View style={[styles.monthRow, { minHeight: monthRowHeight }]}>
              {months.map((m) => (
                <View key={m.index} style={[styles.monthLabel, { width: m.width, marginRight: monthGap }]}>
                  <Text style={styles.monthText}>{m.label}</Text>
                </View>
              ))}
            </View>
            {children.map((child) => {
              const statusMap = dayStatusByChild[child.id] || {};
              return (
                <View key={child.id} style={[styles.row, { marginBottom: rowSpacing }]}>
                  {months.map((m) => (
                    <View key={m.index} style={[styles.daysRow, { width: m.width, marginRight: monthGap }]}>
                      {Array.from({ length: m.daysInMonth }, (_, i) => i + 1).map((day) => {
                        const key = getDayKey(m.year, m.index, day);
                        const status = statusMap[key] || 'noEvents';
                        const color = ATTENDANCE_COLORS[status] || (status === 'partial' ? ATTENDANCE_COLORS.present : ATTENDANCE_COLORS.noEvents);
                        const isNone = status === 'noEvents';
                        return (
                          <TouchableOpacity
                            key={`${child.id}-${key}`}
                            style={[
                              styles.cell,
                              { width: cellSize, height: cellSize, marginRight: gap, marginBottom: rowSpacing, backgroundColor: color },
                              isNone && styles.cellNone,
                              isWeb && styles.cellWeb,
                              isWeb && hoveredCellKey === key && styles.cellHover,
                            ]}
                            activeOpacity={0.8}
                            onPress={() => onMarkDayAttended && onMarkDayAttended(key, child.id)}
                            {...(isWeb && {
                              onMouseEnter: () => setHoveredCellKey(key),
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
                  ))}
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.present }]} />
          <Text style={styles.legendPillText}>Attended</Text>
        </View>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.unmarked }]} />
          <Text style={styles.legendPillText}>Upcoming</Text>
        </View>
        <View style={styles.legendPill}>
          <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.absent }]} />
          <Text style={styles.legendPillText}>Unattended</Text>
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
        Each row is one child; each cell is one day. Click a cell to mark that day as attended or unattended for that child. For lessons shared with multiple children, marking attended marks all of them; unmarking affects only that child. Scroll left and right for other months. Click a child’s name to export their report.
      </Text>
      {isWeb ? (
        <View style={styles.topGrid}>
          <View style={styles.heatmapColumn}>
            {heatmapBlock}
          </View>
        </View>
      ) : (
        heatmapBlock
      )}
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
    fontWeight: '600',
    color: TOKENS.text,
  },
  exportIconBtn: {
    padding: 4,
    borderRadius: 6,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  sectionHelp: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
  },
  topGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: TOKENS.s7,
  },
  heatmapColumn: {
    flex: 1,
    minWidth: 0,
  },
  heatmapWrap: {
    paddingVertical: TOKENS.s6,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  labelColumn: {
    paddingRight: 8,
    zIndex: 1,
    borderRightWidth: 1,
    borderRightColor: TOKENS.border,
  },
  monthRowPlaceholder: { marginBottom: 6 },
  labelRow: { justifyContent: 'center' },
  scroll: { flex: 1, minWidth: 0 },
  scrollContent: { paddingRight: 16 },
  grid: {},
  monthRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  monthLabel: { alignItems: 'center' },
  monthText: { fontSize: 14, fontWeight: '600', color: TOKENS.text },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  nameLabel: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted, maxWidth: 52 },
  nameLabelTouchable: {
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  daysRow: { flexDirection: 'row', flexWrap: 'nowrap', alignContent: 'flex-start' },
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
    marginTop: TOKENS.s1,
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
