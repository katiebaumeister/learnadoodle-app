import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  TextInput,
} from 'react-native';
import { CalendarCheck2, Eraser, Plus, Save, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';

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

function normalizeGradeValue(raw) {
  if (raw == null) return null;
  const v = String(raw).trim();
  return v.length > 0 ? v : null;
}

function notifyGradesAndSubjectRefresh(subjectId) {
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

export default function SubjectPastEventsGradesModal({
  visible,
  onClose,
  familyId,
  subjectId,
  events = [],
  eventOutcomes = [],
  getChildName,
  onOpenEvent,
  onCreatePlan,
  onCompleted,
}) {
  const toast = useToast();
  const [draftGrades, setDraftGrades] = useState({});
  const [saving, setSaving] = useState(false);
  const [hoveredRowIndex, setHoveredRowIndex] = useState(null);

  const pastEvents = useMemo(() => {
    const list = (events || []).filter(
      (e) => e && String(e.subject_id) === String(subjectId) && !e.is_backlog && e.status !== 'canceled'
    );
    const past = list.filter((e) => isPastEvent(e));
    past.sort((a, b) => (eventPrimaryMs(b) || 0) - (eventPrimaryMs(a) || 0));
    return past;
  }, [events, subjectId]);

  const outcomesByEventId = useMemo(() => {
    const map = {};
    for (const row of eventOutcomes || []) {
      const eid = row?.event_id;
      if (!eid) continue;
      map[String(eid)] = row;
    }
    return map;
  }, [eventOutcomes]);

  const initialGrades = useMemo(() => {
    const map = {};
    for (const ev of pastEvents) {
      const outcome = outcomesByEventId[String(ev.id)];
      const base = normalizeGradeValue(outcome?.grade ?? ev?.grade);
      map[String(ev.id)] = base || '';
    }
    return map;
  }, [pastEvents, outcomesByEventId]);

  useEffect(() => {
    if (!visible) return;
    setDraftGrades(initialGrades);
  }, [visible, initialGrades]);

  useEffect(() => {
    if (!visible) {
      setSaving(false);
      setHoveredRowIndex(null);
    }
  }, [visible]);

  const hasPastEvents = pastEvents.length > 0;

  const hasPendingChanges = useMemo(() => {
    if (!visible) return false;
    return pastEvents.some((ev) => {
      const id = String(ev.id);
      const prev = normalizeGradeValue(initialGrades[id]);
      const next = normalizeGradeValue(draftGrades[id]);
      return prev !== next;
    });
  }, [visible, pastEvents, initialGrades, draftGrades]);

  const applyFillUngradedPass = useCallback(() => {
    setDraftGrades((prev) => {
      const next = { ...prev };
      for (const ev of pastEvents) {
        const id = String(ev.id);
        if (!normalizeGradeValue(next[id])) {
          next[id] = 'Pass';
        }
      }
      return next;
    });
  }, [pastEvents]);

  const applyClearAll = useCallback(() => {
    setDraftGrades((prev) => {
      const next = { ...prev };
      for (const ev of pastEvents) {
        next[String(ev.id)] = '';
      }
      return next;
    });
  }, [pastEvents]);

  const handleSave = useCallback(async () => {
    if (!familyId || !subjectId || saving || !hasPendingChanges) return;
    setSaving(true);
    let updated = 0;
    let failed = 0;

    try {
      for (const ev of pastEvents) {
        const id = String(ev.id);
        const prev = normalizeGradeValue(initialGrades[id]);
        const next = normalizeGradeValue(draftGrades[id]);
        if (prev === next) continue;

        const outcome = outcomesByEventId[id];
        try {
          if (outcome?.id) {
            const { error: updateOutcomeError } = await supabase
              .from('event_outcomes')
              .update({ grade: next })
              .eq('id', outcome.id);
            if (updateOutcomeError) throw updateOutcomeError;
          } else if (next != null) {
            const childId =
              ev?.child_id ||
              (Array.isArray(ev?.child_ids) && ev.child_ids.length > 0 ? ev.child_ids[0] : null);
            const payload = {
              event_id: ev.id,
              grade: next,
            };
            if (childId) payload.child_id = childId;
            const { error: insertOutcomeError } = await supabase
              .from('event_outcomes')
              .insert(payload);
            if (insertOutcomeError) throw insertOutcomeError;
          }

          const { error: updateEventError } = await supabase
            .from('events')
            .update({ grade: next })
            .eq('id', ev.id);
          if (updateEventError) throw updateEventError;

          updated += 1;
        } catch (err) {
          failed += 1;
          console.warn('[SubjectPastEventsGradesModal] save row failed', err);
        }
      }

      if (updated > 0) {
        toast.push(
          `Saved grades for ${updated} event${updated !== 1 ? 's' : ''}.${failed ? ` ${failed} failed.` : ''}`,
          failed ? 'info' : 'success'
        );
        notifyGradesAndSubjectRefresh(subjectId);
        onCompleted?.();
        onClose?.();
      } else if (failed > 0) {
        toast.push('Could not save grades. Please try again.', 'error');
      } else {
        toast.push('No grade changes to save.', 'info');
      }
    } finally {
      setSaving(false);
    }
  }, [
    familyId,
    subjectId,
    saving,
    hasPendingChanges,
    pastEvents,
    initialGrades,
    draftGrades,
    outcomesByEventId,
    toast,
    onCompleted,
    onClose,
  ]);

  const handleCancel = useCallback(() => {
    if (saving) return;
    onClose?.();
  }, [saving, onClose]);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <Pressable
          style={styles.overlayBackdrop}
          onPress={handleCancel}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          {...(Platform.OS === 'web' && {
            cursor: saving ? 'default' : 'pointer',
          })}
        />
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Grade past events</Text>
            <TouchableOpacity
              onPress={handleCancel}
              style={styles.closeCircle}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
            >
              <X size={18} color="#0f172a" strokeWidth={2.25} />
            </TouchableOpacity>
          </View>

          {!hasPastEvents ? (
            <>
              <Text style={styles.empty}>No events added for this subject yet.</Text>
              <View style={styles.emptyActions}>
                <TouchableOpacity
                  style={styles.emptyCancelButton}
                  onPress={handleCancel}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel"
                  {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                >
                  <Text style={styles.emptyCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.emptyCreatePlanButton}
                  onPress={() => {
                    onCreatePlan?.();
                    onClose?.();
                  }}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Create a plan"
                  {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                >
                  <Plus size={14} color="#ffffff" strokeWidth={2.5} />
                  <Text style={styles.emptyCreatePlanButtonText}>Create a plan</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.headline}>Quick-add grades for past events</Text>
              <Text style={styles.subhead}>
                Includes all subject-attached events (including plan events). Use Details to open the event editor.
              </Text>

              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {pastEvents.map((ev, idx) => {
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
                    <View
                      key={ev.id}
                      style={[
                        styles.selectRow,
                        Platform.OS === 'web' && hoveredRowIndex === idx && styles.selectRowHover,
                      ]}
                      {...rowWebHover}
                    >
                      <View style={styles.selectRowBody}>
                        <View style={styles.rowTop}>
                          <Text style={styles.rowTitle} numberOfLines={2}>
                            {ev.title || 'Event'}
                          </Text>
                          {onOpenEvent && ev.id ? (
                            <TouchableOpacity
                              onPress={() => onOpenEvent(ev.id, ev)}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              accessibilityRole="button"
                              accessibilityLabel="Open event details"
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.rowOpenLinkText}>Details</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        {when ? <Text style={styles.rowMeta}>{when}</Text> : null}
                        <Text style={styles.rowCompactLine}>{[childLabel, calLabel].filter(Boolean).join(' · ')}</Text>
                        <View style={styles.gradeInputRow}>
                          <Text style={styles.gradeLabel}>Grade</Text>
                          <TextInput
                            value={draftGrades[String(ev.id)] ?? ''}
                            onChangeText={(text) =>
                              setDraftGrades((prev) => ({ ...prev, [String(ev.id)]: text }))
                            }
                            placeholder="e.g. A-, 92, Pass"
                            placeholderTextColor="#94a3b8"
                            editable={!saving}
                            style={styles.gradeInput}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            returnKeyType="done"
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <View style={styles.sectionRule} />
              <Text style={styles.secondarySectionLabel}>Bulk actions</Text>
              <View style={styles.bulkActionsRow}>
                <TouchableOpacity
                  style={[styles.secondaryOutlineBtn, styles.secondaryOutlineBtnHalf]}
                  onPress={applyFillUngradedPass}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Fill ungraded rows with Pass"
                  {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                >
                  <CalendarCheck2 size={18} color="#64748b" strokeWidth={2} />
                  <Text style={[styles.secondaryOutlineBtnText, styles.secondaryOutlineBtnTextInRow]} numberOfLines={2}>
                    Fill ungraded as Pass
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.secondaryOutlineBtn, styles.secondaryOutlineBtnHalf]}
                  onPress={applyClearAll}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Clear all grade entries"
                  {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                >
                  <Eraser size={18} color="#64748b" strokeWidth={2} />
                  <Text style={[styles.secondaryOutlineBtnText, styles.secondaryOutlineBtnTextInRow]} numberOfLines={2}>
                    Clear all entries
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          <View style={styles.footer}>
            {hasPastEvents ? (
              <TouchableOpacity
                style={[styles.saveBtnGreenOutline, (!hasPendingChanges || saving) && styles.btnDisabled]}
                onPress={handleSave}
                disabled={!hasPendingChanges || saving}
                accessibilityRole="button"
                accessibilityLabel="Save grade changes"
                {...(Platform.OS === 'web' && { cursor: !hasPendingChanges || saving ? 'default' : 'pointer' })}
              >
                {saving ? (
                  <ActivityIndicator color="#15803d" />
                ) : (
                  <>
                    <Save size={20} color="#15803d" strokeWidth={2} />
                    <Text style={styles.saveBtnGreenOutlineText}>
                      {hasPendingChanges ? 'Save changes' : 'No changes to save'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            {hasPastEvents ? (
              <TouchableOpacity
                style={styles.cancelLink}
                onPress={handleCancel}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
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
    maxWidth: 560,
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
  emptyActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  emptyCreatePlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#93C5FD',
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  emptyCreatePlanButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyCancelButton: {
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 18,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    maxHeight: 360,
    marginBottom: 8,
  },
  selectRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)',
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
  selectRowBody: {
    flex: 1,
    minWidth: 0,
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
  rowOpenLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4F46E5',
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'underline',
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
  },
  gradeInputRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gradeLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    minWidth: 40,
  },
  gradeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'web' ? 8 : 7,
    fontSize: 14,
    color: '#0f172a',
  },
  sectionRule: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginBottom: 12,
    marginTop: 8,
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
  },
  secondaryOutlineBtnHalf: {
    flex: 1,
    minWidth: 0,
  },
  secondaryOutlineBtnTextInRow: {
    textAlign: 'center',
    flexShrink: 1,
  },
  secondaryOutlineBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
