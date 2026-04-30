import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ATTENDANCE_COLORS, TOKENS } from './constants';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MonthlyCalendarView({
  monthDate,
  dayStatusByChild = {},
  selectedChildId,
  selectedDateKey,
  onMonthChange,
  onDayPress,
  children = [],
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const monthLabel = monthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const getDayKey = (day) => {
    const d = new Date(year, month, day);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayStr = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dayStr}`;
  };

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  const fullRows = Math.ceil(cells.length / 7);
  while (cells.length < fullRows * 7) cells.push(null);

  const [hoveredKey, setHoveredKey] = useState(null);

  // Aggregate status across all children: absent > unmarked > present > noEvents
  const getStatusForDay = (day) => {
    if (!day) return null;
    const key = getDayKey(day);
    const childIds = children.length > 0 ? children.map((c) => c.id) : (selectedChildId ? [selectedChildId] : []);
    let hasAny = false;
    let hasAbsent = false;
    let hasUnmarked = false;
    let hasPresent = false;
    childIds.forEach((cid) => {
      const status = dayStatusByChild[cid]?.[key];
      if (!status || status === 'noEvents') return;
      hasAny = true;
      if (status === 'absent') hasAbsent = true;
      else if (status === 'unmarked') hasUnmarked = true;
      else if (status === 'present') hasPresent = true;
    });
    if (!hasAny) return 'noEvents';
    if (hasAbsent) return 'absent';
    if (hasUnmarked) return 'unmarked';
    if (hasPresent) return 'present';
    return 'noEvents';
  };

  const [hoverPrev, setHoverPrev] = useState(false);
  const [hoverNext, setHoverNext] = useState(false);

  return (
    <View style={styles.wrapper}>
      <View style={styles.monthNavRow}>
        <TouchableOpacity
          onPress={() => onMonthChange(-1)}
          style={[styles.monthNavBtn, hoverPrev && styles.monthNavBtnHover]}
          {...(Platform.OS === 'web' && {
            onMouseEnter: () => setHoverPrev(true),
            onMouseLeave: () => setHoverPrev(false),
          })}
        >
          <ChevronLeft size={18} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{monthLabel}</Text>
        <TouchableOpacity
          onPress={() => onMonthChange(1)}
          style={[styles.monthNavBtn, hoverNext && styles.monthNavBtnHover]}
          {...(Platform.OS === 'web' && {
            onMouseEnter: () => setHoverNext(true),
            onMouseLeave: () => setHoverNext(false),
          })}
        >
          <ChevronRight size={18} color="#374151" />
        </TouchableOpacity>
      </View>
      <View style={styles.dayHeaders}>
        {DAY_HEADERS.map((h) => (
          <Text key={h} style={styles.dayHeaderText}>{h}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: fullRows }, (_, r) => (
          <View key={r} style={styles.weekRow}>
            {cells.slice(r * 7, r * 7 + 7).map((day, c) => {
              const i = r * 7 + c;
              const status = getStatusForDay(day);
              const hasAttendance = status && status !== 'noEvents';
              const color = hasAttendance ? (ATTENDANCE_COLORS[status] || (status === 'partial' ? ATTENDANCE_COLORS.present : null)) : null;
              const key = day ? getDayKey(day) : `empty-${i}`;
              const isSelected = day && selectedDateKey === key;
              const isHovered = Platform.OS === 'web' && day && hoveredKey === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.cell,
                    !day && styles.cellEmpty,
                    day && (hasAttendance ? { backgroundColor: color, borderColor: color } : styles.cellDefault),
                    day && isSelected && styles.cellSelectedOutline,
                    Platform.OS === 'web' && day && styles.cellWeb,
                    isHovered && styles.cellHover,
                  ]}
                  onPress={() => day && onDayPress && onDayPress(key)}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' && day && {
                    onMouseEnter: () => setHoveredKey(key),
                    onMouseLeave: () => setHoveredKey(null),
                  })}
                >
                  {day ? (
                    <Text style={styles.cellDay}>{day}</Text>
                  ) : null}
                  {day && hasAttendance && !isSelected && (
                    <View style={[styles.indicator, { backgroundColor: color }]} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const CELL_SIZE = 40;
const CAL_GAP = 3;
const CAL_RADIUS = 10;

const styles = StyleSheet.create({
  wrapper: {
    maxWidth: 360,
    width: '100%',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  monthTitle: { fontSize: 15, fontWeight: '600', color: TOKENS.text },
  monthNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthNavBtnHover: Platform.OS === 'web' ? {
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  } : {},
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeaderText: {
    width: CELL_SIZE,
    textAlign: 'center',
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    fontWeight: '500',
  },
  grid: {},
  weekRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: CAL_RADIUS,
    marginHorizontal: CAL_GAP / 2,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  cellEmpty: { backgroundColor: 'transparent', borderColor: 'transparent' },
  cellDefault: {
    backgroundColor: TOKENS.bgSurface,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  cellSelectedOutline: {
    borderColor: 'rgba(17,24,39,0.45)',
    borderWidth: 1,
  },
  cellWeb: {
    cursor: 'pointer',
    ...(Platform.OS === 'web' && { transition: 'background-color 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease' }),
  },
  cellHover: Platform.OS === 'web' ? {
    backgroundColor: '#F3F7FF',
    borderColor: 'rgba(15,23,42,0.14)',
    ...TOKENS.shadow1,
  } : {},
  cellDay: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted, fontWeight: '500' },
  indicator: {
    position: 'absolute',
    bottom: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
