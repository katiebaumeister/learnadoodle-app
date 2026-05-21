import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Check, ChevronRight, Plus } from 'lucide-react';
import { TOKENS } from './constants';

function timeStr(e) {
  const t = e.start_ts || e.start || e.start_local;
  if (!t) return '';
  const d = new Date(t);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function duration(e, getEventMinutes) {
  if (getEventMinutes && typeof getEventMinutes === 'function') {
    const m = getEventMinutes(e);
    return m ? `${m} min` : '';
  }
  const mins = e.duration_minutes ?? (e.end_ts && e.start_ts
    ? Math.round((new Date(e.end_ts) - new Date(e.start_ts)) / 60000) : 0);
  return `${mins} min`;
}

export default function DayEventsPanel({
  dateLabel,
  childName,
  events = [],
  attendanceByEventId = {},
  onToggleEventAttendance,
  onMarkAllAttended,
  onEventPress,
  getEventMinutes,
  compactEventRows = false,
  onAddEventForDate = null,
}) {
  const [pressedEventId, setPressedEventId] = useState(null);
  const sortedEvents = [...events].sort((a, b) => {
    const ta = (a.start_ts || a.start || a.start_local) ? new Date(a.start_ts || a.start || a.start_local).getTime() : 0;
    const tb = (b.start_ts || b.start || b.start_local) ? new Date(b.start_ts || b.start || b.start_local).getTime() : 0;
    return ta - tb;
  });
  const totalMins = events.reduce((sum, e) => sum + (getEventMinutes ? getEventMinutes(e) : 0), 0);

  return (
    <View style={styles.panel}>
      {!dateLabel ? (
        <View style={styles.detailEmpty}>
          <Text style={styles.emptyStateTitle} numberOfLines={1}>Select a day to view attendance</Text>
          <Text style={styles.emptyStateSub} numberOfLines={2}>
            Shows lessons, attendance status, and completion details.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.headerBlock}>
            <View style={styles.headerRow1}>
              <Text style={styles.dateLabel}>{dateLabel}</Text>
              {onAddEventForDate && (
                <TouchableOpacity
                  onPress={onAddEventForDate}
                  style={styles.addEventBtn}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel="Add event for selected day"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={14} color={TOKENS.textMuted} />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.headerRow2}>
              <Text style={styles.headerMeta} numberOfLines={1}>
                {childName || 'Child'}
                {' • '}
                {sortedEvents.length} {sortedEvents.length === 1 ? 'event' : 'events'}
                {totalMins ? ` • ${totalMins} min` : ''}
              </Text>
              {onMarkAllAttended && sortedEvents.length > 0 && dayStatus !== 'present' && (
                <TouchableOpacity
                  onPress={onMarkAllAttended}
                  style={styles.markAllBtn}
                  activeOpacity={0.7}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.markAllBtnText}>Mark all attended</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.headerDivider} />
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {sortedEvents.length === 0 ? (
              <Text style={styles.empty}>No events scheduled for this day.</Text>
            ) : (
              sortedEvents.map((e) => {
                const status = attendanceByEventId[e.id] || null;
                const isPresent = status === 'present';
                const isPressed = pressedEventId === e.id;
                return (
                  <TouchableOpacity
                    key={e.id}
                    style={[styles.eventCard, isPressed && styles.eventCardPressed]}
                    onPress={() => onEventPress && onEventPress(e)}
                    activeOpacity={0.9}
                    {...(Platform.OS === 'web' && onEventPress && { cursor: 'pointer' })}
                  >
                    <TouchableOpacity
                      style={[
                        styles.toggleCircle,
                        compactEventRows && styles.toggleCircleCompact,
                        isPresent && styles.toggleCirclePresent,
                      ]}
                      onPress={(ev) => {
                        ev?.stopPropagation?.();
                        onToggleEventAttendance && onToggleEventAttendance(e.id);
                      }}
                      onPressIn={() => setPressedEventId(e.id)}
                      onPressOut={() => setPressedEventId(null)}
                      activeOpacity={0.8}
                      hitSlop={8}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      {isPresent ? <Check size={compactEventRows ? 14 : 16} color="#16a34a" strokeWidth={2.5} /> : null}
                    </TouchableOpacity>
                    <View style={styles.eventContent}>
                      {compactEventRows ? (
                        <Text style={styles.eventLine} numberOfLines={1}>
                          {(e.title || 'Event')}
                          {` · ${timeStr(e) ? `${timeStr(e)} • ${duration(e, getEventMinutes)}` : duration(e, getEventMinutes)}`}
                        </Text>
                      ) : (
                        <>
                          <Text style={styles.eventTitle} numberOfLines={1}>{e.title || 'Event'}</Text>
                          <Text style={styles.eventMeta} numberOfLines={1}>
                            {timeStr(e) ? `${timeStr(e)} • ${duration(e, getEventMinutes)}` : duration(e, getEventMinutes)}
                            {e.subject_id ? ' • Subject' : ''}
                          </Text>
                        </>
                      )}
                    </View>
                    {onEventPress && (
                      <ChevronRight size={18} color="rgba(15,23,42,0.4)" style={styles.chevron} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minWidth: 200,
    maxWidth: 480,
  },
  detailEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 120,
    paddingRight: 24,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: TOKENS.text,
    textAlign: 'center',
    maxWidth: 320,
  },
  emptyStateSub: {
    fontSize: 14,
    color: TOKENS.textMuted,
    marginTop: 8,
    textAlign: 'center',
    maxWidth: 320,
  },
  headerBlock: { marginBottom: 0 },
  headerRow1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  dateLabel: { fontSize: 16, fontWeight: '600', color: TOKENS.text },
  addEventBtn: {
    height: 24,
    width: 24,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow2: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 0,
  },
  headerMeta: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted, flex: 1 },
  markAllBtn: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  markAllBtnText: { fontSize: 12, color: TOKENS.textMuted, fontWeight: '500' },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.06)',
    marginTop: 6,
    marginBottom: 10,
  },
  scroll: { maxHeight: 320 },
  empty: {
    fontSize: TOKENS.fontSizeCaption,
    color: TOKENS.textMuted,
    paddingVertical: 16,
  },
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    marginBottom: 10,
    gap: 10,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  eventCardPressed: {
    backgroundColor: 'rgba(59,130,246,0.06)',
    borderColor: 'rgba(59,130,246,0.18)',
  },
  toggleCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.14)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleCirclePresent: {
    backgroundColor: 'rgba(34,197,94,0.14)',
    borderColor: 'rgba(34,197,94,0.35)',
  },
  toggleCircleCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  eventContent: { flex: 1, minWidth: 0 },
  eventTitle: { fontSize: 14, fontWeight: '600', color: TOKENS.text },
  eventMeta: { fontSize: TOKENS.fontSizeCaption, color: TOKENS.textMuted, marginTop: 4 },
  eventLine: { fontSize: 13, color: TOKENS.text, fontWeight: '500' },
  chevron: { marginLeft: 4 },
});
