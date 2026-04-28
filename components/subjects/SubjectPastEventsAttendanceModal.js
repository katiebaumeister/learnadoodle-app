import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
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

/** In-memory cache so reopening the modal shows attendance badges immediately; fetch still runs to sync. */
const pastEventsAttendanceLogsCache = new Map();

function cacheKeyForAttendance(familyId, eventIds) {
  if (!familyId || !eventIds?.length) return '';
  return `${String(familyId)}:${[...eventIds].map(String).sort().join(',')}`;
}

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

function summarizeAttendanceForEvent(eventId, logs, eventStatus = null) {
  const rows = logs.filter((l) => String(l.event_id) === String(eventId));
  if (rows.length === 0) {
    if (String(eventStatus || '').toLowerCase() === 'done') return 'present';
    return 'none';
  }
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
      return 'Pending';
  }
}

function errorText(err) {
  if (!err) return '';
  const raw = String(err?.detail || err?.message || err || '').trim();
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, ' ');
  return compact.length > 220 ? `${compact.slice(0, 220)}...` : compact;
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
  const [pendingAction, setPendingAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cutoffIndex, setCutoffIndex] = useState(null);
  const [applyingThrough, setApplyingThrough] = useState(false);
  const [hoveredRowIndex, setHoveredRowIndex] = useState(null);

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
  const attendanceCacheKey = useMemo(
    () => cacheKeyForAttendance(familyId, eventIds),
    [familyId, eventIds.join(',')]
  );
  const hasPastEvents = pastEvents.length > 0;
  const hasPendingChanges = pendingAction === 'markAll' || pendingAction === 'deleteAll';

  useEffect(() => {
    if (!visible || !attendanceCacheKey) return;

    const cached = pastEventsAttendanceLogsCache.get(attendanceCacheKey);
    if (cached != null) {
      setAttendanceLogs(cached);
    } else {
      setAttendanceLogs([]);
    }

    let cancelled = false;
    (async () => {
      try {
        const rows = await getAttendanceRecordsForEventIds(familyId, eventIds);
        if (cancelled) return;
        const data = rows || [];
        setAttendanceLogs(data);
        pastEventsAttendanceLogsCache.set(attendanceCacheKey, data);
      } catch (err) {
        console.warn('[SubjectPastEventsAttendanceModal] attendance load:', err);
        if (!cancelled) {
          if (cached == null) {
            setAttendanceLogs([]);
            toast.push('Could not load attendance for these events.', 'error');
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, attendanceCacheKey]);

  useEffect(() => {
    if (!visible) {
      setPendingAction(null);
      setSaving(false);
      setCutoffIndex(null);
      setApplyingThrough(false);
      setHoveredRowIndex(null);
    }
  }, [visible]);

  useEffect(() => {
    setCutoffIndex(null);
  }, [eventIds.join(',')]);

  const refreshLogs = useCallback(async () => {
    if (!familyId || eventIds.length === 0) return;
    const key = cacheKeyForAttendance(familyId, eventIds);
    try {
      const rows = await getAttendanceRecordsForEventIds(familyId, eventIds);
      const data = rows || [];
      setAttendanceLogs(data);
      if (key) pastEventsAttendanceLogsCache.set(key, data);
    } catch (_) {
      /* keep existing */
    }
  }, [familyId, eventIds.join(',')]);

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
      let failed = 0;
      let firstError = null;
      for (const ev of slice) {
        const { error } = await completeEvent(ev.id, null, { requirePersist: true });
        if (error == null) ok += 1;
        else {
          failed += 1;
          if (!firstError) firstError = error;
        }
      }
      if (ok > 0) {
        toast.push(
          `Updated ${ok} lesson${ok !== 1 ? 's' : ''} (completed & attended).${failed ? ` ${failed} could not be updated.` : ''}`,
          failed ? 'info' : 'success'
        );
        notifyAttendanceAndSubjectRefresh(subjectId);
        onCompleted?.();
        await refreshLogs();
        setCutoffIndex(null);
        onClose?.();
      } else {
        const detail = errorText(firstError);
        toast.push(
          detail ? `Could not update lessons: ${detail}` : 'Could not update lessons. Try again or open an event in the planner.',
          'error'
        );
        await refreshLogs();
      }
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
      let firstError = null;
      try {
        for (const ev of pastEvents) {
          const { error } = await completeEvent(ev.id, null, { requirePersist: true });
          if (error) {
            failed += 1;
            if (!firstError) firstError = error;
          } else succeeded += 1;
        }
        if (succeeded > 0) {
          toast.push(
            `Marked ${succeeded} lesson${succeeded !== 1 ? 's' : ''} complete and attended.${failed ? ` ${failed} could not be updated.` : ''}`,
            failed ? 'info' : 'success'
          );
        } else if (failed > 0) {
          const detail = errorText(firstError);
          toast.push(
            detail ? `Could not update lessons: ${detail}` : 'Could not update lessons. Try again or open an event in the planner.',
            'error'
          );
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

  const footerShowsSave = hasPendingChanges;

  const selectedLesson =
    cutoffIndex != null && cutoffIndex >= 0 ? pastEventsChronological[cutoffIndex] : null;
  const throughDateShort = selectedLesson?.start_ts
    ? new Date(selectedLesson.start_ts).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;
  const lessonsToMarkCount =
    cutoffIndex != null && cutoffIndex >= 0
      ? pastEventsChronological.slice(0, cutoffIndex + 1).filter((e) => e.status !== 'done').length
      : 0;
  const primaryFlowDisabled = applyingThrough || saving || cutoffIndex == null;
  const primaryLabel =
    cutoffIndex == null
      ? 'Select a lesson to continue'
      : `Mark complete through ${throughDateShort || selectedLesson?.title || 'lesson'}`;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.overlayBackdrop}
          onPress={() => {
            if (saving || applyingThrough) return;
            handleCancel();
          }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          {...(Platform.OS === 'web' && {
            cursor: saving || applyingThrough ? 'default' : 'pointer',
          })}
        />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Mark past lessons</Text>
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

          {!hasPastEvents ? (
            <Text style={styles.empty}>No past events loaded for this subject yet.</Text>
          ) : (
            <>
              <Text style={styles.headline}>Select the last lesson completed</Text>
              <Text style={styles.subhead}>We’ll mark all earlier lessons as attended.</Text>

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
                  const att = summarizeAttendanceForEvent(ev.id, attendanceLogs, ev.status);
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
                  const selected = cutoffIndex != null && idx <= cutoffIndex;
                  const selectedCutoff = cutoffIndex === idx;
                  const previewWillMarkAttended =
                    (pendingAction == null && cutoffIndex != null && idx <= cutoffIndex) ||
                    pendingAction === 'markAll';
                  const displayAttendance = previewWillMarkAttended ? 'present' : att;
                  const calRaw = ev.status === 'done' ? 'Complete' : ev.status || 'scheduled';
                  const calLabel =
                    typeof calRaw === 'string' && calRaw.length
                      ? calRaw.charAt(0).toUpperCase() + calRaw.slice(1).toLowerCase()
                      : calRaw;
                  const rowWebHover =
                    Platform.OS === 'web'
                      ? {
                          onMouseEnter: () => setHoveredRowIndex(idx),
                          onMouseLeave: () => setHoveredRowIndex((h) => (h === idx ? null : h)),
                        }
                      : {};
                  return (
                    <TouchableOpacity
                      key={ev.id}
                      style={[
                        styles.selectRow,
                        selected && styles.selectRowSelected,
                        Platform.OS === 'web' && hoveredRowIndex === idx && !selected && styles.selectRowHover,
                      ]}
                      onPress={() => {
                        setCutoffIndex(idx);
                        setPendingAction(null);
                      }}
                      activeOpacity={0.82}
                      disabled={saving || applyingThrough}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: saving || applyingThrough }}
                      accessibilityLabel={`${selected ? 'Selected: ' : ''}${ev.title || 'Lesson'}, through here`}
                      {...(Platform.OS === 'web' && { cursor: saving || applyingThrough ? 'default' : 'pointer' })}
                      {...rowWebHover}
                    >
                      <View
                        style={[styles.radioOuter, selected && styles.radioOuterSelected]}
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      >
                        {selectedCutoff ? <View style={styles.radioInner} /> : null}
                      </View>
                      <View style={styles.selectRowBody}>
                        <View style={styles.rowTop}>
                          <Text style={styles.rowTitle} numberOfLines={2}>
                            {ev.title || 'Lesson'}
                          </Text>
                          <Text
                            style={[
                              styles.badge,
                              displayAttendance === 'present' && styles.badgeOk,
                              displayAttendance === 'none' && styles.badgeMuted,
                            ]}
                          >
                            {attendanceLabel(displayAttendance)}
                          </Text>
                        </View>
                        {when ? <Text style={styles.rowMeta}>{when}</Text> : null}
                        <Text style={styles.rowCompactLine}>
                          {[childLabel, calLabel].filter(Boolean).join(' · ')}
                        </Text>
                        {onOpenEvent && ev.id ? (
                          <TouchableOpacity
                            onPress={(e) => {
                              if (Platform.OS === 'web' && e?.stopPropagation) e.stopPropagation();
                              onOpenEvent(ev.id, ev);
                            }}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityRole="button"
                            accessibilityLabel="Open event details"
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={styles.rowOpenLinkText}>Details</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {cutoffIndex != null ? (
                <Text style={styles.progressionHint}>
                  {lessonsToMarkCount > 0
                    ? `${lessonsToMarkCount} lesson${lessonsToMarkCount !== 1 ? 's' : ''} will be marked complete`
                    : 'Selected lessons are already complete'}
                </Text>
              ) : null}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  primaryFlowDisabled && styles.primaryBtnDisabled,
                  applyingThrough && styles.primaryBtnLoading,
                ]}
                onPress={applyThroughCutoff}
                disabled={primaryFlowDisabled}
                accessibilityRole="button"
                accessibilityLabel={primaryLabel}
                {...(Platform.OS === 'web' && {
                  cursor: primaryFlowDisabled ? 'default' : 'pointer',
                })}
              >
                {applyingThrough ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={[styles.primaryBtnText, primaryFlowDisabled && styles.primaryBtnTextDisabled]}
                    numberOfLines={2}
                  >
                    {primaryLabel}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.sectionRule} />

              <Text style={styles.secondarySectionLabel}>Bulk actions</Text>

              <View style={styles.bulkActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.secondaryOutlineBtn,
                    styles.secondaryOutlineBtnHalf,
                    pendingAction === 'markAll' && styles.secondaryOutlineBtnActive,
                  ]}
                  onPress={() => {
                    const isAlreadySelected = pendingAction === 'markAll';
                    setPendingAction(isAlreadySelected ? null : 'markAll');
                    setCutoffIndex(null);
                  }}
                  disabled={saving || applyingThrough}
                  accessibilityRole="button"
                  accessibilityLabel="Mark all past lessons as attended"
                  {...(Platform.OS === 'web' && { cursor: saving || applyingThrough ? 'default' : 'pointer' })}
                >
                  <CheckCircle2 size={18} color="#64748b" strokeWidth={2} />
                  <Text style={[styles.secondaryOutlineBtnText, styles.secondaryOutlineBtnTextInRow]} numberOfLines={2}>
                    Mark all as attended
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.secondaryOutlineBtn,
                    styles.secondaryOutlineBtnHalf,
                    pendingAction === 'deleteAll' && styles.secondaryOutlineDangerActive,
                  ]}
                  onPress={() => {
                    setPendingAction('deleteAll');
                    setCutoffIndex(null);
                  }}
                  disabled={saving || applyingThrough}
                  accessibilityRole="button"
                  accessibilityLabel="Delete all past events for this subject"
                  {...(Platform.OS === 'web' && { cursor: saving || applyingThrough ? 'default' : 'pointer' })}
                >
                  <Trash2
                    size={18}
                    color={pendingAction === 'deleteAll' ? '#dc2626' : '#64748b'}
                    strokeWidth={2}
                  />
                  <Text
                    style={[
                      styles.secondaryOutlineBtnText,
                      styles.secondaryOutlineBtnTextInRow,
                      pendingAction === 'deleteAll' && styles.secondaryOutlineDangerText,
                    ]}
                    numberOfLines={2}
                  >
                    Delete past events
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

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
            {hasPastEvents ? (
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
            ) : null}
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
  },
  overlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    zIndex: 1,
    elevation: 13,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
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
    marginBottom: 10,
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
  headline: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subhead: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
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
  list: {
    maxHeight: 280,
    marginBottom: 8,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)',
    marginBottom: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' && {
      transitionProperty: 'border-color, background-color',
      transitionDuration: '120ms',
    }),
  },
  selectRowHover: {
    borderColor: 'rgba(79, 70, 229, 0.35)',
    backgroundColor: 'rgba(248, 250, 252, 1)',
  },
  selectRowSelected: {
    borderColor: '#4F46E5',
    backgroundColor: 'rgba(79, 70, 229, 0.07)',
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#94a3b8',
    marginRight: 10,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioOuterSelected: {
    borderColor: '#4F46E5',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4F46E5',
  },
  selectRowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowOpenLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
    marginTop: 6,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'underline',
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  progressionHint: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 10,
    fontWeight: '500',
  },
  primaryBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginBottom: 16,
  },
  primaryBtnDisabled: {
    backgroundColor: '#c7d2fe',
  },
  primaryBtnLoading: {
    opacity: 0.92,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryBtnTextDisabled: {
    color: '#eef2ff',
    opacity: 0.92,
  },
  sectionRule: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 12,
  },
  secondarySectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#94a3b8',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  bulkActionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  secondaryOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    marginBottom: 0,
  },
  secondaryOutlineBtnHalf: {
    flex: 1,
    minWidth: 0,
  },
  secondaryOutlineBtnTextInRow: {
    textAlign: 'center',
    flexShrink: 1,
  },
  secondaryOutlineBtnActive: {
    borderColor: '#94a3b8',
    backgroundColor: '#f8fafc',
  },
  secondaryOutlineBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  secondaryOutlineDangerActive: {
    borderColor: 'rgba(220, 38, 38, 0.35)',
    backgroundColor: 'rgba(254, 242, 242, 0.65)',
  },
  secondaryOutlineDangerText: {
    color: '#b91c1c',
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
    fontWeight: '600',
    textTransform: 'none',
    letterSpacing: 0,
  },
  rowMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 3,
    lineHeight: 16,
  },
  rowCompactLine: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
    lineHeight: 16,
    textTransform: 'none',
  },
  footer: {
    gap: 12,
    marginTop: 14,
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
