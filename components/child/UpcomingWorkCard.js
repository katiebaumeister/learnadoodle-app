import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { ClipboardList, ChevronRight } from 'lucide-react';
import { fetchUpcomingWorkForChild } from '../../lib/workAssignmentClient';
import {
  formatDueLabel,
  getWorkStatusLabel,
  normalizeWorkEventType,
} from '../../lib/workEventHelpers';

function statusAccent(label) {
  const key = String(label || '').toLowerCase();
  if (key.includes('revision')) return { bg: '#FEF3C7', text: '#B45309' };
  if (key.includes('submitted') || key.includes('approved') || key.includes('graded')) {
    return { bg: '#DCFCE7', text: '#15803D' };
  }
  if (key.includes('progress')) return { bg: '#E0F2FE', text: '#0369A1' };
  return { bg: '#F1F5F9', text: '#475569' };
}

export default function UpcomingWorkCard({ familyId, childId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    if (!familyId || !childId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await fetchUpcomingWorkForChild({ familyId, childId, horizonDays: 30, limit: 8 });
      setItems(rows);
    } catch (err) {
      console.warn('[UpcomingWorkCard] load failed:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [familyId, childId]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refresh = () => loadItems();
    window.addEventListener('refreshRightRail', refresh);
    window.addEventListener('parentAssignmentsNeedRefresh', refresh);
    window.addEventListener('refreshCalendar', refresh);
    return () => {
      window.removeEventListener('refreshRightRail', refresh);
      window.removeEventListener('parentAssignmentsNeedRefresh', refresh);
      window.removeEventListener('refreshCalendar', refresh);
    };
  }, [loadItems]);

  const openWorkItem = (item) => {
    const assignment = item?.assignment || null;
    const event = item?.event || null;
    const linkedEventId = event?.id ? String(event.id) : null;
    if (!linkedEventId) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openEventModal', {
        detail: {
          eventId: linkedEventId,
          initialEvent: event,
          assignment,
          schedulingMode: false,
        },
      }));
    }
  };

  if (!familyId || !childId) return null;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <ClipboardList size={18} color="#0369A1" />
          </View>
          <Text style={styles.title}>Upcoming work</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#64748B" />
        </View>
      ) : items.length === 0 ? (
        <Text style={styles.emptyText}>No upcoming assignments, projects, or exams.</Text>
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const event = item.event || {};
            const assignment = item.assignment || null;
            const eventId = String(event.id || '');
            const typeLabel = normalizeWorkEventType(event.event_type) || 'Work';
            const statusLabel = getWorkStatusLabel(assignment);
            const dueLabel = formatDueLabel(event);
            const progress =
              assignment?.progress_percent != null && Number(assignment.progress_percent) > 0
                ? `${Math.round(Number(assignment.progress_percent))}% complete`
                : null;
            const subtitle = progress || statusLabel;
            const accent = statusAccent(statusLabel);
            return (
              <TouchableOpacity
                key={eventId || item.assignment?.id || Math.random()}
                style={styles.row}
                onPress={() => openWorkItem(item)}
                activeOpacity={0.75}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {String(event.title || assignment?.title || 'Schoolwork')}
                  </Text>
                  <View style={styles.rowMeta}>
                    <Text style={styles.typeLabel}>{typeLabel}</Text>
                    {dueLabel ? <Text style={styles.dueLabel}>{dueLabel}</Text> : null}
                  </View>
                </View>
                <View style={styles.rowTrailing}>
                  <View style={[styles.statusPill, { backgroundColor: accent.bg }]}>
                    <Text style={[styles.statusText, { color: accent.text }]} numberOfLines={1}>
                      {subtitle}
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#94A3B8" />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    paddingTop: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  loadingWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  typeLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  dueLabel: {
    fontSize: 12,
    color: '#0369A1',
    fontWeight: '500',
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: 140,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
