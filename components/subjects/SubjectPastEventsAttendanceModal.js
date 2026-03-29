import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { X, CheckCircle2, Trash2 } from 'lucide-react';
import { completeEvent } from '../../lib/services/attendanceClient';
import { deleteEvent as deletePlannerEvent } from '../../lib/services/plannerClientWithOffline';
import { getAttendanceRecordsForEventIds } from '../../lib/services/recordsClient';
import { useToast } from '../Toast';
import { colors } from '../../theme/colors';

function eventPrimaryMs(e) {
  const s = e?.start_ts || e?.due_ts || e?.end_ts;
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

function isPastEvent(e, nowMs = Date.now()) {
  const t = eventPrimaryMs(e);
  if (t == null) return false;
  return t < nowMs;
}

function summarizeAttendanceForEvent(eventId, logs) {
  const rows = logs.filter((l) => String(l.event_id) === String(eventId));
  if (rows.length === 0) return 'none';
  const present = rows.filter((r) => r.status === 'present').length;
  const absent = rows.filter((r) => r.status === 'absent').length;
  if (present > 0 && absent === 0) return 'present';
  if (absent > 0 && present === 0) return 'absent';
  return 'mixed';
}

function attendanceLabel(key) {
  switch (key) {
    case 'present':
      return 'Attended';
    case 'absent':
      return 'Absent';
    case 'mixed':
      return 'Mixed';
    default:
      return 'Not marked';
  }
}

function notifyAttendanceAndSubjectRefresh(subjectId) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('refreshCalendar', {
        detail: { skipCacheClear: true, skipHomeRefresh: true },
      })
    );
    window.dispatchEvent(new CustomEvent('refreshSubjects'));
    if (subjectId) {
      window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
    }
  }
}

export default function SubjectPastEventsAttendanceModal({
  visible,
  onClose,
  familyId,
  subjectId,
  events = [],
  onCompleted,
  getChildName,
  onOpenEvent,
}) {
  const toast = useToast();
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cutoffIndex, setCutoffIndex] = useState(null);
  const [applyingThrough, setApplyingThrough] = useState(false);

  const pastEvents = useMemo(() => {
    const list = (events || []).filter(
      (e) => e && String(e.subject_id) === String(subjectId) && !e.is_backlog && e.status !== 'canceled'
    );
    const past = list.filter((e) => isPastEvent(e));
    past.sort((a, b) => (eventPrimaryMs(b) || 0) - (eventPrimaryMs(a) || 0));
    return past;
  }, [events, subjectId]);

  /** Oldest → newest (same as progress check-in) for “mark through here”. */
  const pastEventsChronological = useMemo(() => {
    const list = [...pastEvents];
    list.sort((a, b) => (eventPrimaryMs(a) || 0) - (eventPrimaryMs(b) || 0));
    return list;
  }, [pastEvents]);

  const eventIds = useMemo(() => pastEvents.map((e) => e.id).filter(Boolean), [pastEvents]);
  const hasPastEvents = pastEvents.length > 0;
  const hasPendingChanges = pendingAction === 'markAll' || pendingAction === 'deleteAll';

  useEffect(() => {
    if (!visible || !familyId || eventIds.length === 0) {
      setAttendanceLogs([]);
      setLogsLoading(false);
      return;
    }
    let cancelled = false;
    setLogsLoading(true);
    (async () => {
      try {
        const rows = await getAttendanceRecordsForEventIds(familyId, eventIds);
        if (!cancelled) setAttendanceLogs(rows || []);
      } catch (err) {
        console.warn('[SubjectPastEventsAttendanceModal] attendance load:', err);
        if (!cancelled) {
          setAttendanceLogs([]);
          toast.push('Could not load attendance for these events.', 'error');
        }
      } finally {
        if (!cancelled) setLogsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, familyId, eventIds.join(',')]);

  useEffect(() => {
    if (!visible) {
      setPendingAction(null);
      setSaving(false);
      setCutoffIndex(null);
      setApplyingThrough(false);
    }
  }, [visible]);

  useEffect(() => {
    setCutoffIndex(null);
  }, [eventIds.join(',')]);

  const refreshLogs = useCallback(async () => {
    if (!familyId || eventIds.length === 0) return;
    try {
      const rows = await getAttendanceRecordsForEventIds(familyId, eventIds);
      setAttendanceLogs(rows || []);
    } catch (_) {
      /* keep existing */
    }
  }, [familyId, eventIds]);

  const applyThroughCutoff = useCallback(async () => {
    if (cutoffIndex == null || cutoffIndex < 0) {
      toast.push('Select the last lesson you’ve completed through.', 'info');
      return;
    }
    const slice = pastEventsChronological.slice(0, cutoffIndex + 1).filter((e) => e.status !== 'done');
    if (slice.length === 0) {
      toast.push('Nothing to update — those lessons are already complete.', 'info');
      return;
    }
    setApplyingThrough(true);
    try {
      let ok = 0;
      for (const ev of slice) {
        const { error } = await completeEvent(ev.id);
        if (error == null) ok += 1;
      }
      toast.push(
        `Updated ${ok} lesson${ok !== 1 ? 's' : ''} (completed & attended).`,
        'success'
      );
      notifyAttendanceAndSubjectRefresh(subjectId);
      onCompleted?.();
      await refreshLogs();
      setCutoffIndex(null);
      onClose?.();
    } catch (e) {
      toast.push(e?.message || 'Something went wrong.', 'error');
    } finally {
      setApplyingThrough(false);
    }
  }, [cutoffIndex, pastEventsChronological, toast, subjectId, onCompleted, onClose, refreshLogs]);

  const handleSaveChanges = useCallback(async () => {
    if (!pendingAction || saving || !familyId) return;
    if (pendingAction === 'markAll') {
      if (!pastEvents.length) return;
      setSaving(true);
      let succeeded = 0;
      let failed = 0;
      try {
        for (const ev of pastEvents) {
          const { error } = await completeEvent(ev.id);
          if (error) failed += 1;
          else succeeded += 1;
        }
        if (succeeded > 0) {
          toast.push(
            `Marked ${succeeded} lesson${succeeded !== 1 ? 's' : ''} complete and attended.${failed ? ` ${failed} could not be updated.` : ''}`,
            failed ? 'info' : 'success'
          );
        } else if (failed > 0) {
          toast.push('Could not update lessons. Try again or open an event in the planner.', 'error');
        }
        notifyAttendanceAndSubjectRefresh(subjectId);
        onCompleted?.();
        await refreshLogs();
        setPendingAction(null);
        onClose?.();
      } catch (e) {
        toast.push(e?.message || 'Something went wrong.', 'error');
      } finally {
        setSaving(false);
      }
      return;
    }
    if (pendingAction === 'deleteAll') {
      const n = pastEvents.length;
      const ok =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.confirm(
              `Delete all ${n} past scheduled lesson${n !== 1 ? 's' : ''} for this subject? They will be removed from your calendar. This cannot be undone.`
            )
          : true;
      if (!ok) return;
      setSaving(true);
      let succeeded = 0;
      let failed = 0;
      try {
        for (const ev of pastEvents) {
          const { error } = await deletePlannerEvent(ev.id, familyId);
          if (error) failed += 1;
          else succeeded += 1;
        }
        if (succeeded > 0) {
          toast.push(
            `Removed ${succeeded} lesson${succeeded !== 1 ? 's' : ''}.${failed ? ` ${failed} could not be removed.` : ''}`,
            failed ? 'info' : 'success'
          );
        } else if (failed > 0) {
          toast.push('Could not delete lessons. Try again from the planner.', 'error');
        }
        notifyAttendanceAndSubjectRefresh(subjectId);
        onCompleted?.();
        setPendingAction(null);
        onClose?.();
      } catch (e) {
        toast.push(e?.message || 'Something went wrong.', 'error');
      } finally {
        setSaving(false);
      }
    }
  }, [pendingAction, saving, familyId, pastEvents, toast, subjectId, onCompleted, onClose, refreshLogs]);

  const handleCancel = useCallback(() => {
    setPendingAction(null);
    onClose?.();
  }, [onClose]);

  if (!visible) return null;

  const showStagingActions = hasPastEvents && !logsLoading;
  const footerShowsSave = hasPendingChanges;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Past lessons</Text>
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.closeCircle}
              disabled={saving || applyingThrough}
              accessibilityRole="button"
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' && { cursor: saving || applyingThrough ? 'default' : 'pointer' })}
            >
              <X size={18} color="#0f172a" strokeWidth={2.25} />
            </TouchableOpacity>
          </View>

          {logsLoading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={colors.accent || '#4F46E5'} />
            </View>
          ) : !hasPastEvents ? (
            <Text style={styles.empty}>No past events loaded for this subject yet.</Text>
          ) : (
            <>
              <Text style={styles.instruction}>
                Tap the last lesson you’ve completed through — we’ll mark those lessons done and log attendance — or mark all as
                attended below.
              </Text>
              {hasPendingChanges ? (
                <View style={styles.pendingBanner}>
                  <Text style={styles.pendingBannerText}>
                    {pendingAction === 'markAll'
                      ? `Ready to mark ${pastEvents.length} past lesson${pastEvents.length !== 1 ? 's' : ''} complete and attended.`
                      : `Ready to remove ${pastEvents.length} past lesson${pastEvents.length !== 1 ? 's' : ''} from your calendar.`}
                  </Text>
                </View>
              ) : null}
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {pastEventsChronological.map((ev, idx) => {
                  const att = summarizeAttendanceForEvent(ev.id, attendanceLogs);
                  const when = ev.start_ts
                    ? new Date(ev.start_ts).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '';
                  const childIds =
                    ev.child_ids && Array.isArray(ev.child_ids) && ev.child_ids.length > 0
                      ? ev.child_ids
                      : ev.child_id
                        ? [ev.child_id]
                        : [];
                  const childLabel =
                    childIds.length > 0 && typeof getChildName === 'function'
                      ? childIds.map((id) => getChildName(id)).filter(Boolean).join(', ')
                      : '';
                  const selected = cutoffIndex === idx;
                  return (
                    <View
                      key={ev.id}
                      style={[styles.row, selected && styles.rowSelected]}
                    >
                      <TouchableOpacity
                        style={styles.rowTapArea}
                        onPress={() => {
                          setCutoffIndex(idx);
                          setPendingAction(null);
                        }}
                        activeOpacity={0.75}
                        disabled={saving || applyingThrough}
                        accessibilityRole="button"
                        accessibilityLabel={`Select through ${ev.title || 'lesson'}`}
                        {...(Platform.OS === 'web' && { cursor: saving || applyingThrough ? 'default' : 'pointer' })}
                      >
                        <View style={styles.rowTop}>
                          <Text style={styles.rowTitle} numberOfLines={2}>
                            {ev.title || 'Lesson'}
                          </Text>
                          <Text
                            style={[styles.badge, att === 'present' && styles.badgeOk, att === 'none' && styles.badgeMuted]}
                          >
                            {attendanceLabel(att)}
                          </Text>
                        </View>
                        {when ? <Text style={styles.rowMeta}>{when}</Text> : null}
                        {childLabel ? <Text style={styles.rowChild}>{childLabel}</Text> : null}
                        <Text style={styles.rowStatus}>
                          Calendar: {ev.status === 'done' ? 'Complete' : ev.status || 'scheduled'}
                        </Text>
                      </TouchableOpacity>
                      {onOpenEvent && ev.id ? (
                        <TouchableOpacity
                          style={styles.rowOpenLink}
                          onPress={() => onOpenEvent(ev.id, ev)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                          accessibilityLabel="Open event details"
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.rowOpenLinkText}>Details</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  );
                })}
              </ScrollView>
              <TouchableOpacity
                style={[
                  styles.markThroughBtn,
                  (applyingThrough || cutoffIndex == null || saving) && styles.btnDisabled,
                ]}
                onPress={applyThroughCutoff}
                disabled={applyingThrough || cutoffIndex == null || saving}
                accessibilityRole="button"
                accessibilityLabel="Mark complete and attended through selected lesson"
                {...(Platform.OS === 'web' && {
                  cursor: applyingThrough || cutoffIndex == null || saving ? 'default' : 'pointer',
                })}
              >
                {applyingThrough ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.markThroughBtnText}>Mark complete & attended through here</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {showStagingActions ? (
            <View style={styles.stagingActions}>
              <TouchableOpacity
                style={[styles.actionBtnGreen, pendingAction === 'markAll' && styles.actionBtnGreenSelected]}
                onPress={() => {
                  setPendingAction('markAll');
                  setCutoffIndex(null);
                }}
                disabled={saving || applyingThrough}
                accessibilityRole="button"
                accessibilityLabel="Stage mark all past lessons as attended"
                {...(Platform.OS === 'web' && { cursor: saving || applyingThrough ? 'default' : 'pointer' })}
              >
                <CheckCircle2 size={20} color="#15803d" strokeWidth={2} />
                <Text style={[styles.actionBtnGreenText, pendingAction === 'markAll' && styles.actionBtnGreenTextSelected]}>
                  Mark all as attended
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtnRed, pendingAction === 'deleteAll' && styles.actionBtnRedSelected]}
                onPress={() => {
                  setPendingAction('deleteAll');
                  setCutoffIndex(null);
                }}
                disabled={saving || applyingThrough}
                accessibilityRole="button"
                accessibilityLabel="Stage delete all past lessons"
                {...(Platform.OS === 'web' && { cursor: saving || applyingThrough ? 'default' : 'pointer' })}
              >
                <Trash2 size={20} color="#e11d48" strokeWidth={2} />
                <Text style={[styles.actionBtnRedText, pendingAction === 'deleteAll' && styles.actionBtnRedTextSelected]}>
                  Delete all past events
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.footer}>
            {footerShowsSave ? (
              <TouchableOpacity
                style={[
                  pendingAction === 'deleteAll' ? styles.saveBtnRedOutline : styles.saveBtnGreenOutline,
                  saving && styles.btnDisabled,
                ]}
                onPress={handleSaveChanges}
                disabled={saving || applyingThrough}
                accessibilityRole="button"
                accessibilityLabel="Save changes"
                {...(Platform.OS === 'web' && { cursor: saving || applyingThrough ? 'default' : 'pointer' })}
              >
                {saving ? (
                  <ActivityIndicator color={pendingAction === 'deleteAll' ? '#e11d48' : '#15803d'} />
                ) : (
                  <>
                    {pendingAction === 'deleteAll' ? (
                      <Trash2 size={20} color="#e11d48" strokeWidth={2} />
                    ) : (
                      <CheckCircle2 size={20} color="#15803d" strokeWidth={2} />
                    )}
                    <Text
                      style={
                        pendingAction === 'deleteAll' ? styles.saveBtnRedOutlineText : styles.saveBtnGreenOutlineText
                      }
                    >
                      Save changes
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.cancelLink}
              onPress={handleCancel}
              disabled={saving || applyingThrough}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              {...(Platform.OS === 'web' && { cursor: saving || applyingThrough ? 'default' : 'pointer' })}
            >
              <Text style={styles.cancelLinkText}>Cancel</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 20,
    ...(Platform.OS === 'web'
      ? {
          backdropFilter: 'blur(4px)',
        }
      : {}),
  },
  card: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 22,
    maxHeight: '90%',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
        }
      : {
          shadowColor: '#0f172a',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.15,
          shadowRadius: 24,
          elevation: 12,
        }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    paddingRight: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBanner: {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
  },
  pendingBannerText: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
    fontWeight: '500',
  },
  instruction: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 21,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  empty: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 8,
    lineHeight: 22,
  },
  loaderWrap: {
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 4,
  },
  list: {
    maxHeight: 260,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    marginBottom: 8,
    overflow: 'hidden',
  },
  rowSelected: {
    borderColor: '#4F46E5',
    backgroundColor: 'rgba(79, 70, 229, 0.06)',
  },
  rowTapArea: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 10,
    paddingHorizontal: 12,
    paddingRight: 8,
  },
  rowOpenLink: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  rowOpenLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'underline',
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  markThroughBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 14,
  },
  markThroughBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: '#b45309',
    backgroundColor: '#fffbeb',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  badgeOk: {
    color: '#047857',
    backgroundColor: '#d1fae5',
  },
  badgeMuted: {
    color: '#64748b',
    backgroundColor: '#f1f5f9',
  },
  rowMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 6,
  },
  rowChild: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  rowStatus: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
    textTransform: 'capitalize',
  },
  stagingActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  actionBtnGreen: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.55)',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
  },
  actionBtnGreenSelected: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderColor: '#15803d',
  },
  actionBtnGreenText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionBtnGreenTextSelected: {
    color: '#14532d',
  },
  actionBtnRed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 140,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.5)',
    backgroundColor: 'rgba(244, 63, 94, 0.08)',
  },
  actionBtnRedSelected: {
    backgroundColor: 'rgba(244, 63, 94, 0.14)',
    borderColor: '#e11d48',
  },
  actionBtnRedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#be123c',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionBtnRedTextSelected: {
    color: '#9f1239',
  },
  footer: {
    gap: 12,
    marginTop: 4,
  },
  saveBtnGreenOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.55)',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  saveBtnGreenOutlineText: {
    color: '#166534',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  saveBtnRedOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.55)',
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
  },
  saveBtnRedOutlineText: {
    color: '#be123c',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  btnDisabled: {
    opacity: 0.65,
  },
  cancelLink: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  cancelLinkText: {
    fontSize: 15,
    color: '#94a3b8',
    fontWeight: '500',
  },
});
