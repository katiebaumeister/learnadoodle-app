import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  StyleSheet,
  TextInput,
} from 'react-native';
import { BookOpen, Check, FileText, Link2, Plus, RotateCcw, Unlink, X, Ban } from 'lucide-react';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import { fetchSubjectCurriculumEventsStructure } from '../../lib/services/curriculumClient';
import {
  eventHasLinkedLesson,
  flattenCurriculumLessons,
  linkLessonToEvent,
} from '../../lib/subjectLessonLinking';
import { getPlannerLearningDayLessonTitle } from '../../lib/planner/plannerLearningDayChip';
import { updateEvent } from '../../lib/services/plannerClientWithOffline';
import {
  formatLearningDayDateLabel,
  resolveLearningDayDurationMinutes,
  formatLearningDayTimeLabel,
  isGeneratedFromSubjectSchedule,
  resolveLearningDaySubjectName,
  dispatchCreateAssignmentForLearningDay,
} from '../../lib/planner/learningDayModalNavigation';
import {
  applyLearningDayTimeOverride,
  eventStartTimeHm,
  fetchSubjectAssignmentsForLearningDay,
  isLearningDaySessionSkipped,
  linkAssignmentToLearningDay,
  partitionAssignmentsForLearningDay,
  restoreLearningDaySession,
  skipLearningDaySession,
  unlinkAssignmentFromLearningDay,
} from '../../lib/learningDaySessionHelpers';
import { dispatchOpenSubjectClasswork } from '../../lib/subjectClassworkNavigation';
import { resolveEventSubjectId } from '../../lib/planner/plannerEventSubject';
import { formatDueShort } from '../tutor/tutorHelpUtils';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';

function AssignmentRow({
  assignment,
  linked = false,
  hint = null,
  saving = false,
  onPress,
  actionLabel,
}) {
  const dueLine = formatDueShort(assignment?.due_date);
  return (
    <TouchableOpacity
      style={styles.assignmentRow}
      disabled={saving}
      onPress={onPress}
      {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
    >
      <View style={styles.assignmentIconWrap}>
        <FileText size={14} color="#5F6368" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.lessonTitle} numberOfLines={2}>
          {assignment?.title || 'Assignment'}
        </Text>
        <Text style={styles.unitTitle} numberOfLines={1}>
          {[dueLine, hint].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={[styles.assignmentAction, linked && styles.assignmentActionUnlink]}>
        {actionLabel}
      </Text>
    </TouchableOpacity>
  );
}

export default function LearningDayModal({
  visible,
  onClose,
  onSaved,
  familyId,
  event,
  subjects = [],
  children = [],
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lessons, setLessons] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [linkedLessonId, setLinkedLessonId] = useState(null);
  const [sessionEvent, setSessionEvent] = useState(null);
  const [startTime, setStartTime] = useState('09:00');
  const [durationInput, setDurationInput] = useState('60');
  const [timeDirty, setTimeDirty] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);

  const activeEvent = sessionEvent || event;
  const subjectId = resolveEventSubjectId(activeEvent);
  const subjectName = resolveLearningDaySubjectName(activeEvent, subjects);
  const dateLabel = formatLearningDayDateLabel(activeEvent);
  const timeLabel = formatLearningDayTimeLabel(activeEvent);
  const durationMinutes = resolveLearningDayDurationMinutes(activeEvent);
  const fromSchedule = isGeneratedFromSubjectSchedule(activeEvent);
  const isSkipped = isLearningDaySessionSkipped(activeEvent);
  const eventId = activeEvent?.id;

  const linkedLessonTitle = useMemo(() => {
    const fromEvent = getPlannerLearningDayLessonTitle(activeEvent);
    if (fromEvent) return fromEvent;
    if (!linkedLessonId) return '';
    const row = lessons.find((l) => String(l.lessonId) === String(linkedLessonId));
    return row?.lessonTitle || '';
  }, [activeEvent, lessons, linkedLessonId]);

  const isLinked = eventHasLinkedLesson(activeEvent) || !!linkedLessonId;

  const assignmentGroups = useMemo(
    () => partitionAssignmentsForLearningDay({
      assignments,
      event: activeEvent,
      eventId,
    }),
    [assignments, activeEvent, eventId],
  );

  const sessionChildIds = useMemo(() => {
    const childId = activeEvent?.child_id || activeEvent?.childId;
    if (childId) return [String(childId)];
    return (children || []).map((c) => String(c?.id)).filter(Boolean);
  }, [children, activeEvent?.childId, activeEvent?.child_id]);

  const resetSessionFields = useCallback((row) => {
    if (!row) return;
    setSessionEvent(row);
    setStartTime(eventStartTimeHm(row));
    setDurationInput(String(resolveLearningDayDurationMinutes(row) || 60));
    setTimeDirty(false);
    const lessonId = row?.curriculum_lesson_id != null ? String(row.curriculum_lesson_id) : null;
    setLinkedLessonId(lessonId);
  }, []);

  useEffect(() => {
    if (!visible || !event) return;
    resetSessionFields(event);
  }, [visible, event, resetSessionFields]);

  useEffect(() => {
    if (!visible || !familyId || !subjectId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data }, assignmentRows] = await Promise.all([
          fetchSubjectCurriculumEventsStructure(familyId, subjectId, null),
          fetchSubjectAssignmentsForLearningDay({ familyId, subjectId }),
        ]);
        if (cancelled) return;
        setLessons(flattenCurriculumLessons(data?.units || []));
        setAssignments(assignmentRows || []);
      } catch (err) {
        if (!cancelled) {
          toast.push(err?.message || 'Failed to load session details', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, familyId, subjectId, toast]);

  const notifySaved = useCallback((patch = {}) => {
    onSaved?.({
      event: { ...activeEvent, ...patch },
      lessonId: patch.curriculum_lesson_id ?? linkedLessonId ?? activeEvent?.curriculum_lesson_id ?? null,
    });
  }, [activeEvent, linkedLessonId, onSaved]);

  const reloadAssignments = useCallback(async () => {
    if (!familyId || !subjectId) return;
    const rows = await fetchSubjectAssignmentsForLearningDay({ familyId, subjectId });
    setAssignments(rows || []);
  }, [familyId, subjectId]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const refresh = () => {
      reloadAssignments();
    };
    window.addEventListener('parentAssignmentsNeedRefresh', refresh);
    window.addEventListener('refreshSubjects', refresh);
    return () => {
      window.removeEventListener('parentAssignmentsNeedRefresh', refresh);
      window.removeEventListener('refreshSubjects', refresh);
    };
  }, [visible, reloadAssignments]);

  const handleLinkLesson = async (lessonRow) => {
    if (!eventId || !lessonRow?.lessonId || isSkipped) return;
    setSaving(true);
    try {
      await linkLessonToEvent({
        eventId,
        familyId,
        lessonId: lessonRow.lessonId,
        unitTitle: lessonRow.unitTitle,
        lessonTitle: lessonRow.lessonTitle,
      });
      setLinkedLessonId(String(lessonRow.lessonId));
      const patch = {
        curriculum_lesson_id: lessonRow.lessonId,
        lesson: lessonRow.lessonTitle,
        unit: lessonRow.unitTitle,
        curriculum_metadata: { lesson_label: lessonRow.lessonTitle },
      };
      setSessionEvent((prev) => ({ ...(prev || activeEvent), ...patch }));
      toast.push(`Linked ${lessonRow.lessonTitle}`, 'success');
      notifySaved(patch);
    } catch (err) {
      toast.push(err?.message || 'Failed to link lesson', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkLesson = async () => {
    if (!eventId || !familyId || isSkipped) return;
    setSaving(true);
    try {
      const { error } = await updateEvent(
        eventId,
        {
          curriculum_lesson_id: null,
          curriculum_unit_title: null,
          unit: null,
          lesson: null,
          curriculum_metadata: {},
        },
        familyId,
      );
      if (error) throw error;
      setLinkedLessonId(null);
      const patch = {
        curriculum_lesson_id: null,
        lesson: null,
        unit: null,
        curriculum_metadata: {},
      };
      setSessionEvent((prev) => ({ ...(prev || activeEvent), ...patch }));
      toast.push('Lesson unlinked from this day', 'success');
      notifySaved(patch);
    } catch (err) {
      toast.push(err?.message || 'Failed to unlink lesson', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSessionTime = async () => {
    if (!eventId || !familyId || isSkipped) return;
    setSaving(true);
    try {
      const result = await applyLearningDayTimeOverride({
        eventId,
        familyId,
        event: activeEvent,
        startTimeHm: startTime,
        durationMinutes: durationInput,
      });
      const patch = {
        start_ts: result.start_ts,
        end_ts: result.end_ts,
        minutes: result.minutes,
      };
      setSessionEvent((prev) => ({ ...(prev || activeEvent), ...patch }));
      setTimeDirty(false);
      toast.push('Session time updated', 'success');
      notifySaved(patch);
    } catch (err) {
      toast.push(err?.message || 'Failed to update session time', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSkipSession = async () => {
    if (!eventId || !familyId) return;
    setSaving(true);
    try {
      const { unlinkedLesson } = await skipLearningDaySession({
        eventId,
        familyId,
        event: activeEvent,
      });
      const patch = {
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        ...(unlinkedLesson ? {
          curriculum_lesson_id: null,
          lesson: null,
          unit: null,
          curriculum_metadata: {},
        } : {}),
      };
      if (unlinkedLesson) setLinkedLessonId(null);
      setSessionEvent((prev) => ({ ...(prev || activeEvent), ...patch }));
      setShowSkipConfirm(false);
      toast.push(
        unlinkedLesson ? 'Session skipped and lesson unlinked' : 'Session skipped',
        'success',
      );
      notifySaved(patch);
    } catch (err) {
      toast.push(err?.message || 'Failed to skip session', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddAssignment = () => {
    if (!eventId || isSkipped) return;
    dispatchCreateAssignmentForLearningDay({
      event: activeEvent,
      subjectId,
      childIds: sessionChildIds,
    });
  };

  const handleRestoreSession = async () => {
    if (!eventId || !familyId) return;
    setSaving(true);
    try {
      await restoreLearningDaySession({ eventId, familyId });
      const patch = { status: 'scheduled', canceled_at: null };
      setSessionEvent((prev) => ({ ...(prev || activeEvent), ...patch }));
      toast.push('Session restored', 'success');
      notifySaved(patch);
    } catch (err) {
      toast.push(err?.message || 'Failed to restore session', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLinkAssignment = async (assignment) => {
    if (!eventId || !assignment?.id || isSkipped) return;
    setSaving(true);
    try {
      await linkAssignmentToLearningDay({ assignment, eventId, event: activeEvent });
      await reloadAssignments();
      toast.push('Assignment linked to this session', 'success');
      notifySaved({});
    } catch (err) {
      toast.push(err?.message || 'Failed to link assignment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlinkAssignment = async (assignment) => {
    if (!eventId || !assignment?.id) return;
    setSaving(true);
    try {
      await unlinkAssignmentFromLearningDay({ assignment, eventId });
      await reloadAssignments();
      toast.push('Assignment unlinked', 'success');
      notifySaved({});
    } catch (err) {
      toast.push(err?.message || 'Failed to unlink assignment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenClasswork = () => {
    if (!subjectId) return;
    dispatchOpenSubjectClasswork({
      subjectId,
      lessonId: linkedLessonId || activeEvent?.curriculum_lesson_id || null,
    });
    onClose?.();
  };

  if (!visible || !event) return null;

  const headerMeta = [
    dateLabel,
    timeLabel,
    durationMinutes ? `${durationMinutes} min` : null,
  ].filter(Boolean).join(' · ');

  const attachableRows = [
    ...assignmentGroups.dueOnDay.map((row) => ({ row, hint: 'Due this day' })),
    ...assignmentGroups.available.slice(0, 12).map((row) => ({ row, hint: 'Not linked' })),
  ];

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{subjectName}</Text>
                <Text style={styles.subtitle}>{headerMeta}</Text>
                {sessionChildIds.length > 0 ? (
                  <View style={styles.childrenRow}>
                    <ChildAvatarCluster
                      childIds={sessionChildIds}
                      familyChildren={children || []}
                      size={22}
                    />
                  </View>
                ) : null}
                <View style={styles.badgeRow}>
                  <View style={[styles.badge, fromSchedule ? styles.badgeSchedule : styles.badgeCustom]}>
                    <Text style={styles.badgeText}>
                      {fromSchedule ? 'Generated from subject schedule' : 'Custom learning day'}
                    </Text>
                  </View>
                  {isSkipped ? (
                    <View style={[styles.badge, styles.badgeSkipped]}>
                      <Text style={styles.badgeSkippedText}>Skipped</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityLabel="Close" {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                <X size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
              <Text style={styles.sectionTitle}>Session</Text>
              <Text style={styles.sectionHint}>
                Changes here apply to this day only, not the recurring subject schedule.
              </Text>
              <View style={styles.sessionRow}>
                <View style={styles.sessionField}>
                  <Text style={styles.fieldLabel}>Time</Text>
                  <TextInput
                    value={startTime}
                    onChangeText={(value) => {
                      setStartTime(value);
                      setTimeDirty(true);
                    }}
                    editable={!isSkipped && !saving}
                    style={[styles.input, (isSkipped || saving) && styles.inputDisabled]}
                    placeholder="09:00"
                    {...(Platform.OS === 'web' ? { type: 'time' } : {})}
                  />
                </View>
                <View style={styles.sessionField}>
                  <Text style={styles.fieldLabel}>Duration (min)</Text>
                  <TextInput
                    value={durationInput}
                    onChangeText={(value) => {
                      setDurationInput(value.replace(/[^\d]/g, '').slice(0, 3));
                      setTimeDirty(true);
                    }}
                    editable={!isSkipped && !saving}
                    style={[styles.input, (isSkipped || saving) && styles.inputDisabled]}
                    keyboardType="number-pad"
                    placeholder="60"
                  />
                </View>
              </View>
              <View style={styles.sessionActions}>
                <TouchableOpacity
                  style={[styles.saveTimeBtn, (!timeDirty || isSkipped || saving) && styles.btnDisabled]}
                  disabled={!timeDirty || isSkipped || saving}
                  onPress={handleSaveSessionTime}
                  {...(Platform.OS === 'web' && { cursor: !timeDirty || isSkipped || saving ? 'default' : 'pointer' })}
                >
                  <Text style={styles.saveTimeText}>Save session time</Text>
                </TouchableOpacity>
                {isSkipped ? (
                  <TouchableOpacity
                    style={styles.restoreBtn}
                    disabled={saving}
                    onPress={handleRestoreSession}
                    {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                  >
                    <RotateCcw size={14} color="#1D4ED8" />
                    <Text style={styles.restoreText}>Restore session</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.skipBtn}
                    disabled={saving}
                    onPress={() => setShowSkipConfirm(true)}
                    {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                  >
                    <Ban size={14} color="#B91C1C" />
                    <Text style={styles.skipText}>Skip this day</Text>
                  </TouchableOpacity>
                )}
              </View>

              <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Lesson for this day</Text>
              {isSkipped ? (
                <Text style={styles.emptyText}>Restore this session to plan a lesson.</Text>
              ) : null}
              {!isSkipped && isLinked ? (
                <View style={styles.linkedBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkedTitle}>{linkedLessonTitle || 'Linked lesson'}</Text>
                    <Text style={styles.linkedHint}>Linked to this session</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.unlinkBtn}
                    onPress={handleUnlinkLesson}
                    disabled={saving}
                    {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                  >
                    <Unlink size={14} color="#B91C1C" />
                    <Text style={styles.unlinkText}>Unlink</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {!isSkipped && (loading ? (
                <View style={styles.loadingWrap}>
                  <ActivityIndicator color="#6BB3E8" />
                  <Text style={styles.loadingText}>Loading lessons…</Text>
                </View>
              ) : lessons.length === 0 ? (
                <Text style={styles.emptyText}>
                  No saved lessons yet. Use Edit units to add curriculum first.
                </Text>
              ) : (
                <View style={styles.lessonList}>
                  {lessons.map((row) => {
                    const selected = linkedLessonId && String(linkedLessonId) === String(row.lessonId);
                    return (
                      <TouchableOpacity
                        key={row.lessonId}
                        style={[styles.lessonRow, selected && styles.lessonRowSelected]}
                        disabled={saving}
                        onPress={() => handleLinkLesson(row)}
                        {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.lessonTitle}>{row.lessonTitle}</Text>
                          {row.unitTitle ? <Text style={styles.unitTitle}>{row.unitTitle}</Text> : null}
                        </View>
                        {selected ? (
                          <Check size={16} color="#1D4ED8" />
                        ) : (
                          <Link2 size={16} color="#94A3B8" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}

              <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Work for this day</Text>
              {!isSkipped ? (
                <TouchableOpacity
                  style={styles.addAssignmentBtn}
                  onPress={handleAddAssignment}
                  disabled={saving}
                  {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                >
                  <Plus size={16} color="#1D4ED8" />
                  <Text style={styles.addAssignmentText}>Add assignment for this day</Text>
                </TouchableOpacity>
              ) : null}
              {loading ? (
                <Text style={styles.emptyText}>Loading assignments…</Text>
              ) : assignmentGroups.linked.length === 0 && attachableRows.length === 0 ? (
                <Text style={styles.emptyText}>No assignments for this subject yet.</Text>
              ) : (
                <View style={styles.lessonList}>
                  {assignmentGroups.linked.map((assignment) => (
                    <AssignmentRow
                      key={assignment.id}
                      assignment={assignment}
                      linked
                      hint="Linked to this session"
                      saving={saving}
                      actionLabel="Unlink"
                      onPress={() => handleUnlinkAssignment(assignment)}
                    />
                  ))}
                  {!isSkipped && attachableRows.map(({ row, hint }) => (
                    <AssignmentRow
                      key={row.id}
                      assignment={row}
                      hint={hint}
                      saving={saving}
                      actionLabel="Link"
                      onPress={() => handleLinkAssignment(row)}
                    />
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.footerSecondary}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.footerSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenClasswork}
                style={styles.footerPrimary}
                disabled={!subjectId}
                {...(Platform.OS === 'web' && { cursor: !subjectId ? 'default' : 'pointer' })}
              >
                <BookOpen size={16} color="#FFFFFF" />
                <Text style={styles.footerPrimaryText}>Open Learning Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={showSkipConfirm}
        title="Skip this session?"
        message={
          isLinked
            ? 'This learning day will be marked skipped on the calendar and the linked lesson will be removed from this session. You can restore it later from this modal.'
            : 'This learning day will be marked skipped on the calendar. You can restore it later from this modal.'
        }
        confirmLabel="Skip session"
        cancelLabel="Cancel"
        destructive
        onConfirm={handleSkipSession}
        onCancel={() => setShowSkipConfirm(false)}
      />
    </>
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
    maxWidth: 520,
    maxHeight: '88%',
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
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 4,
  },
  childrenRow: {
    marginTop: 8,
  },
  badgeRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeSchedule: {
    backgroundColor: '#EFF6FF',
  },
  badgeCustom: {
    backgroundColor: '#F1F5F9',
  },
  badgeSkipped: {
    backgroundColor: '#FEF2F2',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  badgeSkippedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
  },
  body: {
    maxHeight: 520,
  },
  bodyContent: {
    padding: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  sectionTitleSpaced: {
    marginTop: 18,
  },
  sectionHint: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 10,
  },
  sessionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  sessionField: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 8,
    fontSize: 15,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  inputDisabled: {
    backgroundColor: '#F8FAFC',
    color: '#94A3B8',
  },
  sessionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  saveTimeBtn: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  saveTimeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  restoreText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  linkedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    marginBottom: 12,
  },
  linkedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  linkedHint: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  unlinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  unlinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748B',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  lessonList: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  lessonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  lessonRowSelected: {
    backgroundColor: '#F8FAFC',
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
  assignmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  assignmentIconWrap: {
    width: 20,
    alignItems: 'center',
  },
  assignmentAction: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  assignmentActionUnlink: {
    color: '#B91C1C',
  },
  addAssignmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  addAssignmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    gap: 12,
  },
  footerSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  footerSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  footerPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#6BB3E8',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  footerPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
