import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { ATTENDANCE_COLORS } from './constants';

const MONTH_LABELS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];

export default function YearHeatmapGrid({
  yearStart,
  yearEnd,
  children = [],
  dayStatusByChild = {},
  onDayPress,
}) {
  const start = new Date(yearStart);
  const end = new Date(yearEnd);
  const totalDays = Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1;
  const maxDaysToShow = Math.min(totalDays, 365);
  const cellSize = Platform.OS === 'web' ? 12 : 10;
  const gap = 2;

  const getDayKey = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const days = [];
  for (let i = 0; i < maxDaysToShow; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionTitle}>Year at a glance</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
        <View style={styles.grid}>
          <View style={styles.monthRow}>
            <View style={[styles.cell, styles.labelCell, { width: 44 }]} />
            {MONTH_LABELS.map((m) => (
              <View key={m} style={[styles.monthLabel, { width: (cellSize + gap) * 30 - gap }]}>
                <Text style={styles.monthText}>{m}</Text>
              </View>
            ))}
          </View>
          {children.map((child) => {
            const statusMap = dayStatusByChild[child.id] || {};
            return (
              <View key={child.id} style={styles.row}>
                <View style={[styles.cell, styles.labelCell, { width: 44 }]}>
                  <Text style={styles.nameLabel} numberOfLines={1}>
                    {child.first_name || child.name || 'Child'}
                  </Text>
                </View>
                <View style={styles.daysRow}>
                  {days.map((d) => {
                    const key = getDayKey(d);
                    const status = statusMap[key] || 'noEvents';
                    const color = ATTENDANCE_COLORS[status] || ATTENDANCE_COLORS.noEvents;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[
                          styles.cell,
                          { width: cellSize, height: cellSize, marginRight: gap, marginBottom: gap, backgroundColor: color },
                          Platform.OS === 'web' && styles.cellWeb,
                        ]}
                        onPress={() => onDayPress && onDayPress(key, child.id)}
                      />
                    );
                  })}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.legend}>
        <Text style={styles.legendText}>All attended</Text>
        <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.present }]} />
        <Text style={styles.legendText}>Partial</Text>
        <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.partial }]} />
        <Text style={styles.legendText}>Unmarked</Text>
        <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.unmarked }]} />
        <Text style={styles.legendText}>Absent</Text>
        <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.absent }]} />
        <Text style={styles.legendText}>No events</Text>
        <View style={[styles.legendDot, { backgroundColor: ATTENDANCE_COLORS.noEvents }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  scroll: { marginHorizontal: -24 },
  grid: { paddingRight: 24 },
  monthRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  monthLabel: { alignItems: 'center' },
  monthText: { fontSize: 10, color: '#6B7280' },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  labelCell: { marginRight: 8, justifyContent: 'center' },
  nameLabel: { fontSize: 12, color: '#374151', maxWidth: 44 },
  daysRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  cell: { borderRadius: 3 },
  cellWeb: { cursor: 'pointer' },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  legendText: { fontSize: 11, color: '#6B7280' },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
});
