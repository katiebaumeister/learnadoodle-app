import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatSchoolEventTypeLabel } from '../child/childHomeRailHelpers';

function formatEventWhen(event) {
  const startRaw = event?.start_ts || event?.start_local;
  if (!startRaw) return '';
  const start = new Date(startRaw);
  if (Number.isNaN(start.getTime())) return '';
  const datePart = start.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const endRaw = event?.end_ts || event?.end_local;
  const end = endRaw ? new Date(endRaw) : null;
  const fmtTime = (d) =>
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const endIsValid = !!(end && !Number.isNaN(end.getTime()));
  const endsAtMidnight = endIsValid && end.getHours() === 0 && end.getMinutes() === 0;
  const endsAtEndOfDay = endIsValid && end.getHours() === 23 && end.getMinutes() === 59;
  const noSavedTime = startsAtMidnight && (!endIsValid || endsAtMidnight || endsAtEndOfDay);
  if (noSavedTime) return datePart;
  const timePart = endIsValid ? `${fmtTime(start)}–${fmtTime(end)}` : fmtTime(start);
  return `${datePart} · ${timePart}`;
}

export default function DmAttachEventModal({
  visible = false,
  onClose,
  onSelect,
  familyId,
  childId = null,
  children = [],
}) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');

  const childName = useMemo(() => {
    if (!childId) return 'Student';
    const match = (children || []).find((c) => String(c?.id) === String(childId));
    return String(match?.first_name || match?.name || 'Student').trim() || 'Student';
  }, [childId, children]);

  const loadEvents = useCallback(async () => {
    if (!familyId || !childId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const horizon = new Date(now);
      horizon.setDate(horizon.getDate() + 30);
      horizon.setHours(23, 59, 59, 999);

      const childIdStr = String(childId);
      const { data, error: fetchError } = await supabase
        .from('events')
        .select('id, title, start_ts, end_ts, child_id, child_ids, subject_id, status, event_type')
        .eq('family_id', familyId)
        .or(`child_id.eq.${childIdStr},child_ids.cs.{${childIdStr}}`)
        .gte('start_ts', dayStart.toISOString())
        .lte('start_ts', horizon.toISOString())
        .neq('status', 'canceled')
        .is('canceled_at', null)
        .is('deleted_at', null)
        .order('start_ts', { ascending: true })
        .limit(40);

      if (fetchError) throw fetchError;

      const subjectIds = [...new Set((data || []).map((event) => event.subject_id).filter(Boolean))];
      let subjectsMap = {};
      if (subjectIds.length > 0) {
        const { data: subjectsData } = await supabase
          .from('subject')
          .select('id, name')
          .in('id', subjectIds);
        if (subjectsData) {
          subjectsMap = subjectsData.reduce((acc, sub) => {
            acc[sub.id] = sub;
            return acc;
          }, {});
        }
      }

      setEvents((data || []).map((event) => ({
        ...event,
        subject: event.subject_id ? subjectsMap[event.subject_id] || null : null,
      })));
    } catch (err) {
      setEvents([]);
      setError(err?.message || 'Could not load events.');
    } finally {
      setLoading(false);
    }
  }, [familyId, childId]);

  useEffect(() => {
    if (!visible) return;
    setError('');
    loadEvents();
  }, [visible, loadEvents]);

  const handleSelect = (event) => {
    if (!event?.id) return;
    onSelect?.(event);
    onClose?.();
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <X size={20} color="#6B7280" />
          </TouchableOpacity>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <Text style={styles.title}>Attach event</Text>
            <Text style={styles.subtitle}>Upcoming for {childName}</Text>

            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color="#64748B" />
              </View>
            ) : null}

            {!loading && events.length === 0 ? (
              <Text style={styles.emptyText}>No upcoming events in the next 30 days.</Text>
            ) : null}

            {!loading
              ? events.map((event) => {
                const when = formatEventWhen(event);
                const typeLabel = formatSchoolEventTypeLabel(event?.event_type);
                const subjectName = String(event?.subject?.name || '').trim();
                return (
                  <TouchableOpacity
                    key={event.id}
                    style={styles.eventRow}
                    onPress={() => handleSelect(event)}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.eventRowMain}>
                      <Text style={styles.eventTitle} numberOfLines={2}>
                        {event.title || 'Schoolwork'}
                      </Text>
                      {when ? <Text style={styles.eventWhen}>{when}</Text> : null}
                      <Text style={styles.eventMeta}>
                        {[typeLabel, subjectName].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
              : null}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    paddingRight: 36,
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: 13,
    color: '#64748B',
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    paddingVertical: 12,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    marginBottom: 10,
  },
  eventRowMain: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  eventWhen: {
    marginTop: 4,
    fontSize: 13,
    color: '#475569',
  },
  eventMeta: {
    marginTop: 2,
    fontSize: 12,
    color: '#94A3B8',
  },
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#DC2626',
  },
});
