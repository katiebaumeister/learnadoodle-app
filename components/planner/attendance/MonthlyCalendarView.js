import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { ATTENDANCE_COLORS } from './constants';

const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function MonthlyCalendarView({
  monthDate,
  dayStatusByChild = {},
  selectedChildId,
  onMonthChange,
  onDayPress,
}) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startPad = first.getDay();
  const daysInMonth = last.getDate();
  const totalCells = startPad + daysInMonth;
  const rows = Math.ceil(totalCells / 7);
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

  const getStatusForDay = (day) => {
    if (!day) return null;
    const key = getDayKey(day);
    const byChild = selectedChildId ? dayStatusByChild[selectedChildId] : null;
    const status = byChild ? byChild[key] : null;
    if (status) return status;
    return 'noEvents';
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onMonthChange(-1)} style={styles.arrow}>
          <ChevronLeft size={20} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => onMonthChange(1)} style={styles.arrow}>
          <ChevronRight size={20} color="#374151" />
        </TouchableOpacity>
      </View>
      <View style={styles.dayHeaders}>
        {DAY_HEADERS.map((h) => (
          <Text key={h} style={styles.dayHeaderText}>{h}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, i) => {
          const status = getStatusForDay(day);
          const color = status ? ATTENDANCE_COLORS[status] : 'transparent';
          const key = day ? getDayKey(day) : `empty-${i}`;
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.cell,
                !day && styles.cellEmpty,
                day && { backgroundColor: color || '#ECEFF3' },
                Platform.OS === 'web' && day && styles.cellWeb,
              ]}
              onPress={() => day && onDayPress && onDayPress(key)}
            >
              {day ? <Text style={styles.cellDay}>{day}</Text> : null}
              {day && status && status !== 'noEvents' && (
                <View style={[styles.indicator, { backgroundColor: color }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  arrow: { padding: 4 },
  monthTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayHeaderText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    maxWidth: 44,
    maxHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    margin: 1,
  },
  cellEmpty: { backgroundColor: 'transparent' },
  cellWeb: { cursor: 'pointer' },
  cellDay: { fontSize: 13, color: '#374151', fontWeight: '500' },
  indicator: {
    position: 'absolute',
    bottom: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
