import React, { useState } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { CheckCircle2, Circle, X } from 'lucide-react';

export default function DayAttendanceModal({
  visible,
  dateLabel,
  childName,
  events = [],
  attendanceByEventId = {},
  onClose,
  onMarkEvent,
  onMarkAllAttended,
  onMarkAllAbsent,
}) {
  const [localAttendance, setLocalAttendance] = useState({});

  const getStatus = (eventId) => {
    if (localAttendance[eventId] !== undefined) return localAttendance[eventId];
    return attendanceByEventId[eventId] ?? null;
  };

  const handleToggle = (eventId, status) => {
    const next = status === 'present' ? 'absent' : 'present';
    setLocalAttendance((prev) => ({ ...prev, [eventId]: next }));
    onMarkEvent && onMarkEvent(eventId, next);
  };

  const handleMarkAll = (asPresent) => {
    events.forEach((e) => {
      setLocalAttendance((prev) => ({ ...prev, [e.id]: asPresent ? 'present' : 'absent' }));
      onMarkEvent && onMarkEvent(e.id, asPresent ? 'present' : 'absent');
    });
    if (onMarkAllAttended && asPresent) onMarkAllAttended();
    if (onMarkAllAbsent && !asPresent) onMarkAllAbsent();
  };

  if (!visible) return null;

  const duration = (e) => {
    const mins = e.duration_minutes ?? (e.end_ts && e.start_ts
      ? Math.round((new Date(e.end_ts) - new Date(e.start_ts)) / 60000) : 0);
    return `${mins} min`;
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.header}>
            <View>
              <Text style={styles.dateLabel}>{dateLabel}</Text>
              <Text style={styles.childLabel}>{childName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.scroll}>
            {events.map((e) => {
              const status = getStatus(e.id);
              const isPresent = status === 'present';
              return (
                <TouchableOpacity
                  key={e.id}
                  style={styles.eventRow}
                  onPress={() => handleToggle(e.id, status)}
                >
                  {isPresent ? (
                    <CheckCircle2 size={22} color="#059669" />
                  ) : (
                    <Circle size={22} color="#9CA3AF" />
                  )}
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle}>{e.title || 'Event'}</Text>
                    <Text style={styles.eventMeta}>{duration(e)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleMarkAll(true)}>
              <Text style={styles.actionBtnText}>Mark all attended</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => handleMarkAll(false)}>
              <Text style={styles.actionBtnTextSecondary}>Mark all absent</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 16,
    maxWidth: 420,
    width: '100%',
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dateLabel: { fontSize: 18, fontWeight: '700', color: '#111827' },
  childLabel: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  scroll: { padding: 20, maxHeight: 320 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  eventInfo: { marginLeft: 12, flex: 1 },
  eventTitle: { fontSize: 15, fontWeight: '500', color: '#111827' },
  eventMeta: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
  },
  actionBtnSecondary: { backgroundColor: '#F3F4F6' },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  actionBtnTextSecondary: { fontSize: 14, fontWeight: '600', color: '#374151' },
});
