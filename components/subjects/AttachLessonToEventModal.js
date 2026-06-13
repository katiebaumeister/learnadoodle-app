import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native';
import { X } from 'lucide-react';
import { useToast } from '../Toast';
import { fetchSubjectCurriculumEventsStructure } from '../../lib/services/curriculumClient';
import { flattenCurriculumLessons, linkLessonToEvent } from '../../lib/subjectLessonLinking';

export default function AttachLessonToEventModal({
  visible,
  onClose,
  onLinked,
  familyId,
  subjectId,
  subjectName,
  event,
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lessons, setLessons] = useState([]);

  const eventDateLabel = useMemo(() => {
    const raw = event?.start_ts || event?.start || event?.due_ts;
    if (!raw) return 'Upcoming session';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'Upcoming session';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }, [event]);

  useEffect(() => {
    if (!visible || !familyId || !subjectId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await fetchSubjectCurriculumEventsStructure(familyId, subjectId, null);
        if (cancelled) return;
        setLessons(flattenCurriculumLessons(data?.units || []));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, familyId, subjectId]);

  const handleSelect = async (lessonRow) => {
    if (!event?.id || !lessonRow?.lessonId) return;
    setSaving(true);
    try {
      await linkLessonToEvent({
        eventId: event.id,
        familyId,
        lessonId: lessonRow.lessonId,
        unitTitle: lessonRow.unitTitle,
        lessonTitle: lessonRow.lessonTitle,
      });
      toast.push(`Linked ${lessonRow.lessonTitle}`, 'success');
      onLinked?.(lessonRow);
      onClose?.();
    } catch (err) {
      toast.push(err?.message || 'Failed to link lesson', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Link lesson</Text>
              <Text style={styles.subtitle}>
                {subjectName || 'Subject'} · {eventDateLabel}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <X size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#6BB3E8" />
              <Text style={styles.loadingText}>Loading lessons…</Text>
            </View>
          ) : lessons.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No saved lessons yet. Use Edit units to add curriculum first.</Text>
            </View>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 8 }}>
              {lessons.map((row) => (
                <TouchableOpacity
                  key={row.lessonId}
                  style={styles.row}
                  disabled={saving}
                  onPress={() => handleSelect(row)}
                  {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                >
                  <Text style={styles.lessonTitle}>{row.lessonTitle}</Text>
                  {row.unitTitle ? <Text style={styles.unitTitle}>{row.unitTitle}</Text> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.08)',
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  loadingWrap: {
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  emptyWrap: {
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  list: {
    maxHeight: 360,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  lessonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  unitTitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
});
