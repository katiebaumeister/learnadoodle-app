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
import { Check, FileText, Link2, Plus, RotateCcw, Unlink, X, Ban } from 'lucide-react';
import { useToast } from '../Toast';
import ConfirmDialog from '../ConfirmDialog';
import { ModalFooter } from '../ui/ModalFooter';
import MaskedTimeInput from '../ui/MaskedTimeInput';
import { createModalStyles as createStyles } from '../create/shared/createModalStyles';
import { normalizeTimeValue, parseTimeString } from '../../lib/create/eventTimeUtils';
import {
  hmToMaskedTime,
  maskedTimeToHm,
} from '../../lib/subjectConfigureSchedule';
import {
  ACCENT,
  ACCENT_SOFT_BG,
  ACCENT_CHIP_BG,
  ACCENT_CHIP_BORDER,
  BORDER,
  FG,
  MUTED,
} from '../create/shared/createModalStyles';
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

const LEAGUE_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

const BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

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
      style={styles.assignmentCard}
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
  const [maskedStartTime, setMaskedStartTime] = useState('09:00 AM');
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
    const hm = eventStartTimeHm(row);
    setStartTime(hm);
    setMaskedStartTime(hmToMaskedTime(hm));
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
            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.titleRow}>
                <View style={styles.titleBlock}>
                  <Text style={styles.title}>{subjectName}</Text>
                  {headerMeta ? <Text style={styles.subtitle}>{headerMeta}</Text> : null}
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeBtn}
                  accessibilityLabel="Close"
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <X size={18} color="#64748B" strokeWidth={2.25} />
                </TouchableOpacity>
              </View>

              {sessionChildIds.length > 0 || fromSchedule || isSkipped ? (
                <View style={styles.metaRow}>
                  {sessionChildIds.length > 0 ? (
                    <ChildAvatarCluster
                      childIds={sessionChildIds}
                      familyChildren={children || []}
                      size={22}
                    />
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
              ) : null}

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Session</Text>
                <Text style={styles.sectionHint}>
                  Changes here apply to this day only, not the recurring subject schedule.
                </Text>
                <View style={styles.sessionPanel}>
                  <View style={styles.sessionRow}>
                    <View style={styles.sessionField}>
                      <Text style={styles.fieldLabel}>Time</Text>
                      <MaskedTimeInput
                        value={maskedStartTime}
                        onChangeText={(masked) => {
                          setMaskedStartTime(masked);
                          setTimeDirty(true);
                          const parsed = parseTimeString(normalizeTimeValue(masked));
                          if (parsed) {
                            setStartTime(
                              `${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`,
                            );
                          }
                        }}
                        onBlur={(masked) => {
                          const hm = maskedTimeToHm(masked, startTime || '09:00');
                          setStartTime(hm);
                          setMaskedStartTime(hmToMaskedTime(hm));
                        }}
                        disabled={isSkipped || saving}
                        wrapStyle={createStyles.scheduleTimeInputWrap}
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
                        placeholderTextColor="#94A3B8"
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
                        style={styles.textActionBtn}
                        disabled={saving}
                        onPress={handleRestoreSession}
                        {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                      >
                        <RotateCcw size={14} color="#2563EB" />
                        <Text style={styles.restoreText}>Restore session</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={styles.textActionBtn}
                        disabled={saving}
                        onPress={() => setShowSkipConfirm(true)}
                        {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                      >
                        <Ban size={14} color="#B91C1C" />
                        <Text style={styles.skipText}>Skip this day</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Lesson for this day</Text>
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
                {!isSkipped && loading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator color={ACCENT} />
                    <Text style={styles.loadingText}>Loading lessons…</Text>
                  </View>
                ) : null}
                {!isSkipped && !loading && lessons.length === 0 ? (
                  <Text style={styles.emptyText}>
                    No saved lessons yet. Use Edit units to add curriculum first.
                  </Text>
                ) : null}
                {!isSkipped && !loading && lessons.length > 0 ? (
                  <View style={styles.lessonList}>
                    {lessons.map((row) => {
                      const selected = linkedLessonId && String(linkedLessonId) === String(row.lessonId);
                      return (
                        <TouchableOpacity
                          key={row.lessonId}
                          style={[styles.lessonCard, selected && styles.lessonCardSelected]}
                          disabled={saving}
                          onPress={() => handleLinkLesson(row)}
                          {...(Platform.OS === 'web' && { cursor: saving ? 'default' : 'pointer' })}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.lessonTitle}>{row.lessonTitle}</Text>
                            {row.unitTitle ? <Text style={styles.unitTitle}>{row.unitTitle}</Text> : null}
                          </View>
                          {selected ? (
                            <Check size={16} color="#2563EB" />
                          ) : (
                            <Link2 size={16} color="#94A3B8" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>Work for this day</Text>
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
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <ModalFooter
                mode="edit"
                primaryLabel="Open Learning Schedule"
                onCancel={onClose}
                onPrimary={handleOpenClasswork}
                accent={ACCENT}
                disabled={!subjectId || saving}
                loading={saving}
              />
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: Platform.OS === 'web' ? '88vh' : '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#24324A',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)',
    }),
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      minHeight: 0,
    }),
  },
  bodyContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: FG,
    ...LEAGUE_FONT,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    ...BODY_FONT,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  badgeSchedule: {
    backgroundColor: ACCENT_CHIP_BG,
    borderColor: ACCENT_CHIP_BORDER,
  },
  badgeCustom: {
    backgroundColor: '#F3F4F6',
    borderColor: BORDER,
  },
  badgeSkipped: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    ...LEAGUE_FONT,
  },
  badgeSkippedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
    ...LEAGUE_FONT,
  },
  sectionBlock: {
    marginTop: 20,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: FG,
    ...LEAGUE_FONT,
  },
  sectionHint: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 20,
    ...BODY_FONT,
  },
  sessionPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    backgroundColor: '#FAFBFC',
    padding: 14,
    gap: 12,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    }),
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
    fontWeight: '500',
    color: MUTED,
    marginBottom: 6,
    ...BODY_FONT,
  },
  input: {
    fontSize: 16,
    fontWeight: '400',
    color: FG,
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
      ...BODY_FONT,
    }),
  },
  inputDisabled: {
    backgroundColor: '#E5E7EB',
    color: '#94A3B8',
    borderBottomColor: '#CBD5E1',
  },
  sessionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  saveTimeBtn: {
    backgroundColor: ACCENT_CHIP_BG,
    borderWidth: 1,
    borderColor: ACCENT_CHIP_BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  saveTimeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
    ...LEAGUE_FONT,
  },
  textActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 10,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B91C1C',
    ...LEAGUE_FONT,
  },
  restoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
    ...LEAGUE_FONT,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  linkedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: ACCENT_CHIP_BORDER,
    backgroundColor: ACCENT_SOFT_BG,
  },
  linkedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: FG,
    ...LEAGUE_FONT,
  },
  linkedHint: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
    ...BODY_FONT,
  },
  unlinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  unlinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#B91C1C',
    ...LEAGUE_FONT,
  },
  loadingWrap: {
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: MUTED,
    ...BODY_FONT,
  },
  emptyText: {
    fontSize: 14,
    color: MUTED,
    lineHeight: 20,
    ...BODY_FONT,
  },
  lessonList: {
    gap: 8,
  },
  lessonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
      cursor: 'pointer',
    }),
  },
  lessonCardSelected: {
    borderColor: ACCENT_CHIP_BORDER,
    backgroundColor: ACCENT_SOFT_BG,
  },
  lessonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: FG,
    ...LEAGUE_FONT,
  },
  unitTitle: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
    ...BODY_FONT,
  },
  assignmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
      cursor: 'pointer',
    }),
  },
  assignmentIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  assignmentAction: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    ...LEAGUE_FONT,
  },
  assignmentActionUnlink: {
    color: '#B91C1C',
  },
  addAssignmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ACCENT_CHIP_BORDER,
    backgroundColor: ACCENT_CHIP_BG,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  addAssignmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
    ...LEAGUE_FONT,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
    backgroundColor: '#FFFFFF',
  },
});
