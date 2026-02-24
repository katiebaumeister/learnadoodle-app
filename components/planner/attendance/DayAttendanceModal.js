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

  const timeStr = (e) => {
    const t = e.start_ts || e.start || e.start_local;
    if (!t) return '';
    const d = new Date(t);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const sortedEvents = [...events].sort((a, b) => {
    const ta = (a.start_ts || a.start || a.start_local) ? new Date(a.start_ts || a.start || a.start_local).getTime() : 0;
    const tb = (b.start_ts || b.start || b.start_local) ? new Date(b.start_ts || b.start || b.start_local).getTime() : 0;
    return ta - tb;
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.box} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <View>
              <Text style={styles.dateLabel}>{dateLabel}</Text>
              <Text style={styles.childLabel}>{childName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionLabel}>Scheduled for this day</Text>
          <ScrollView style={styles.scroll}>
            {sortedEvents.length === 0 ? (
              <Text style={styles.emptyListText}>No events scheduled for this day.</Text>
            ) : (
              sortedEvents.map((e) => {
                const status = getStatus(e.id);
                const isPresent = status === 'present';
                const isAbsent = status === 'absent';
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={styles.eventRow}
                    onPress={() => handleToggle(e.id, status)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.circleButton}>
                      {isPresent ? (
                        <CheckCircle2 size={24} color="#059669" />
                      ) : isAbsent ? (
                        <Circle size={24} color="#DC2626" />
                      ) : (
                        <Circle size={24} color="#9CA3AF" />
                      )}
                    </View>
                    <View style={styles.eventInfo}>
                      <Text style={styles.eventTitle}>{e.title || 'Event'}</Text>
                      <Text style={styles.eventMeta}>
                        {timeStr(e) ? `${timeStr(e)} · ${duration(e)}` : duration(e)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => handleMarkAll(true)}>
              <Text style={styles.actionBtnText}>Mark all events for the day as attended</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => handleMarkAll(false)}>
              <Text style={styles.actionBtnTextSecondary}>Mark all events for the day as absent</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 16, maxHeight: 320 },
  emptyListText: {
    fontSize: 14,
    color: '#9CA3AF',
    paddingVertical: 24,
    textAlign: 'center',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  circleButton: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
