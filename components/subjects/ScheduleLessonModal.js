import React, { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { X } from 'lucide-react';
import { useToast } from '../Toast';
import { getUnlinkedUpcomingEvents, linkLessonToEvent } from '../../lib/subjectLessonLinking';

export default function ScheduleLessonModal({
  visible,
  onClose,
  lesson,
  unitTitle,
  familyId,
  subjectId,
  events = [],
  onScheduled,
}) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const slots = useMemo(
    () => getUnlinkedUpcomingEvents(events, { limit: 20 }),
    [events],
  );

  const handleSelect = async (slot) => {
    if (!lesson?.lessonId || !slot?.event?.id) return;
    setSaving(true);
    try {
      await linkLessonToEvent({
        eventId: slot.event.id,
        familyId,
        lessonId: lesson.lessonId,
        unitTitle: unitTitle || '',
        lessonTitle: lesson.title || '',
      });
      toast.push('Lesson scheduled', 'success');
      onScheduled?.();
    } catch (err) {
      toast.push(err?.message || 'Could not schedule lesson', 'error');
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
            <Text style={styles.title}>
            {subjectName ? `Available ${subjectName} slots` : 'Available slots'}
          </Text>
            <TouchableOpacity onPress={onClose} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <X size={20} color="#64748B" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>{lesson?.title || 'Lesson'}</Text>
          <Text style={styles.hint}>Choose a planner slot for this lesson.</Text>
          {saving ? (
            <ActivityIndicator style={{ marginVertical: 24 }} color="#9ECFFB" />
          ) : slots.length === 0 ? (
            <Text style={styles.empty}>No open schedule slots found. Configure schedule first.</Text>
          ) : (
            <ScrollView style={styles.list}>
              {slots.map(({ event, dateLabel }) => (
                <TouchableOpacity
                  key={event.id}
                  style={styles.option}
                  onPress={() => handleSelect({ event, dateLabel })}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.optionText}>{dateLabel}</Text>
                  <Text style={styles.optionMeta}>{event.title || 'Learning session'}</Text>
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
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  hint: {
    fontSize: 13,
    color: '#64748B',
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 8,
  },
  empty: {
    fontSize: 14,
    color: '#64748B',
    padding: 16,
  },
  list: {
    padding: 8,
  },
  option: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  optionMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
});
