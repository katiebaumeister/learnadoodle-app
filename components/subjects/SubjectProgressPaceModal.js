import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X } from 'lucide-react';
import { completeEvent } from '../../lib/services/attendanceClient';
import { useToast } from '../Toast';

export default function SubjectProgressPaceModal({
  visible,
  onClose,
  subjectId,
  events = [],
  hasPlanOrUnits,
}) {
  const toast = useToast();
  const [cutoffIndex, setCutoffIndex] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCutoffIndex(null);
      setApplying(false);
    }
  }, [visible]);

  const sorted = useMemo(() => {
    const list = (events || [])
      .filter((e) => e && String(e.subject_id) === String(subjectId) && !e.is_backlog)
      .filter((e) => e.status !== 'canceled');
    list.sort((a, b) => {
      const ta = new Date(a.start_ts || a.due_ts || 0).getTime();
      const tb = new Date(b.start_ts || b.due_ts || 0).getTime();
      return ta - tb;
    });
    return list;
  }, [events, subjectId]);

  const applyThroughCutoff = useCallback(async () => {
    if (cutoffIndex == null || cutoffIndex < 0) {
      toast.push('Select a lesson to mark through.', 'info');
      return;
    }
    const slice = sorted.slice(0, cutoffIndex + 1).filter((e) => e.status !== 'done');
    if (slice.length === 0) {
      toast.push('Nothing to update — selected lessons are already complete.', 'info');
      return;
    }
    setApplying(true);
    try {
      let ok = 0;
      for (const ev of slice) {
        const { error } = await completeEvent(ev.id);
        if (error == null) ok += 1;
      }
      toast.push(`Updated ${ok} lesson${ok !== 1 ? 's' : ''} (completed & attended).`, 'success');
      onClose?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
        window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
      }
    } catch (e) {
      toast.push(e?.message || 'Something went wrong.', 'error');
    } finally {
      setApplying(false);
    }
  }, [cutoffIndex, sorted, toast, onClose, subjectId]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Progress check-in</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
              <X size={22} color="#64748b" />
            </TouchableOpacity>
          </View>

          {!hasPlanOrUnits ? (
            <Text style={styles.body}>
              Add schedule cadence or lesson structure (Add units in Progress) so we can line up lessons and measure
              progress. You can start with either path and connect them later.
            </Text>
          ) : sorted.length === 0 ? (
            <Text style={styles.body}>
              No scheduled lessons found for this subject yet. Add dates from your plan or add lessons on the calendar.
            </Text>
          ) : (
            <>
              <Text style={styles.body}>
                Tap the last lesson you’ve completed through. We’ll mark those lessons done and log attendance for them (same as
                completing each in the planner).
              </Text>
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {sorted.map((ev, idx) => {
                  const selected = cutoffIndex === idx;
                  const label = ev.title || 'Lesson';
                  const when = ev.start_ts ? new Date(ev.start_ts).toLocaleString() : '';
                  return (
                    <TouchableOpacity
                      key={ev.id}
                      style={[styles.row, selected && styles.rowSelected]}
                      onPress={() => setCutoffIndex(idx)}
                      activeOpacity={0.75}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={styles.rowTitle}>{label}</Text>
                      <Text style={styles.rowMeta}>{when}</Text>
                      <Text style={styles.rowStatus}>{ev.status === 'done' ? 'Done' : ev.status || 'scheduled'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={[styles.primaryBtn, applying && styles.primaryBtnDisabled]}
                onPress={applyThroughCutoff}
                disabled={applying || cutoffIndex == null}
                {...(Platform.OS === 'web' && { cursor: applying ? 'default' : 'pointer' })}
              >
                {applying ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Mark complete & attended through here</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
            <Text style={styles.secondaryBtnText}>Close</Text>
          </TouchableOpacity>
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
    padding: 20,
  },
  card: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
    marginBottom: 12,
  },
  list: {
    maxHeight: 280,
    marginBottom: 12,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    marginBottom: 8,
  },
  rowSelected: {
    borderColor: '#4F46E5',
    backgroundColor: 'rgba(79, 70, 229, 0.06)',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  rowMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  rowStatus: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '500',
  },
});
