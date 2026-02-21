import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Download, CalendarCheck, Settings } from 'lucide-react';
import { STATUS_LABELS } from './constants';

export default function HeaderSummaryStrip({
  termLabel,
  yearLabel,
  childSummaries = [],
  onExport,
  onMarkRange,
  onSettings,
}) {
  return (
    <View style={styles.container}>
      <View style={styles.left}>
        <Text style={styles.title}>Attendance</Text>
        <Text style={styles.subtitle}>{termLabel} · {yearLabel}</Text>
        <View style={styles.summaryRow}>
          {childSummaries.map((c) => (
            <View key={c.childId} style={styles.childChip}>
              <Text style={styles.childName}>{c.childName}</Text>
              <Text style={styles.childStat}>
                {c.daysAttended} / {c.requiredDays} days
              </Text>
              <Text style={styles.childPct}>{c.percent}%</Text>
              <Text style={[styles.statusBadge, c.status === 'at_risk' && styles.statusAtRisk, c.status === 'slightly_behind' && styles.statusBehind]}>
                {STATUS_LABELS[c.status] || STATUS_LABELS.on_track}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.btn} onPress={onExport}>
          <Download size={16} color="#6B7280" />
          <Text style={styles.btnText}>Export</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={onMarkRange}>
          <CalendarCheck size={16} color="#6B7280" />
          <Text style={styles.btnText}>Mark Range Attended</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={onSettings}>
          <Settings size={16} color="#6B7280" />
          <Text style={styles.btnText}>Settings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 16,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    marginBottom: 24,
  },
  left: { flex: 1 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  childName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  childStat: { fontSize: 13, color: '#6B7280' },
  childPct: { fontSize: 13, fontWeight: '600', color: '#374151' },
  statusBadge: { fontSize: 12, color: '#059669', fontWeight: '500' },
  statusBehind: { color: '#D97706' },
  statusAtRisk: { color: '#DC2626' },
  actions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  btnText: { fontSize: 13, fontWeight: '500', color: '#374151' },
});
