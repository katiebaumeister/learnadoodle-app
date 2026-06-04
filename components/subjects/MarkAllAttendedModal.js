import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';
import { completeEvent } from '../../lib/services/attendanceClient';
import { cleanPlannerEventId } from '../../lib/utils/recurringEventUtils';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import { useToast } from '../Toast';

const WEB_HEADING_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

function eventMatchesChildIds(entity, childIds) {
  if (!Array.isArray(childIds) || childIds.length === 0) return true;
  const idSet = new Set(childIds.map((id) => String(id)));
  const childId = entity?.child_id || entity?.childId || null;
  if (childId && idSet.has(String(childId))) return true;
  const childIdsArr = entity?.child_ids || entity?.childIds || [];
  if (Array.isArray(childIdsArr) && childIdsArr.some((id) => idSet.has(String(id)))) return true;
  if (!childId && (!childIdsArr || childIdsArr.length === 0)) return true;
  return false;
}

function eventPrimaryMs(event) {
  const raw = event?.start_ts || event?.due_ts || event?.end_ts;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

function isPastEvent(event, nowMs = Date.now()) {
  const t = eventPrimaryMs(event);
  if (t == null) return false;
  return t < nowMs;
}

function isUnattendedEvent(event) {
  const status = String(event?.status || '').toLowerCase();
  if (status === 'done' || status === 'canceled') return false;
  const instructional = String(event?.instructional_status || '').toUpperCase();
  if (instructional === 'MANUAL_COUNTS') return false;
  if (event?.hasAttendancePresent === true) return false;
  return true;
}

function eventDateKey(event) {
  const raw = String(event?.start_ts || event?.due_ts || event?.end_ts || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
}

function notifyAttendanceRefresh(patchedAttendances = [], subjectIds = []) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const latestByEventId = new Map();
  (Array.isArray(patchedAttendances) ? patchedAttendances : []).forEach((item) => {
    const rawEventId = String(item?.eventId || '').trim();
    if (!rawEventId) return;
    const normalizedEventId = cleanPlannerEventId(rawEventId);
    latestByEventId.set(rawEventId, 'done');
    if (normalizedEventId) latestByEventId.set(normalizedEventId, 'done');
  });
  latestByEventId.forEach((status, eventId) => {
    window.dispatchEvent(new CustomEvent('eventAttendancePatched', { detail: { eventId, status } }));
  });
  const monthTargets = new Set();
  patchedAttendances.forEach((item) => {
    const key = String(item?.dateKey || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
    const parsed = new Date(`${key}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    monthTargets.add(`${parsed.getFullYear()}-${parsed.getMonth()}`);
    window.dispatchEvent(new CustomEvent('refreshCalendar', {
      detail: {
        skipCacheClear: true,
        forceInvalidate: true,
        targetYear: parsed.getFullYear(),
        targetMonth: parsed.getMonth(),
      },
    }));
  });
  if (monthTargets.size === 0) {
    window.dispatchEvent(new CustomEvent('refreshCalendar', {
      detail: { skipCacheClear: true, forceInvalidate: true },
    }));
  }
  window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
  window.dispatchEvent(new CustomEvent('refreshSubjects'));
  (Array.isArray(subjectIds) ? subjectIds : []).forEach((subjectId) => {
    if (subjectId) {
      window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }));
    }
  });
}

export default function MarkAllAttendedModal({
  visible = false,
  onClose,
  familyId = null,
  subjectDetails = [],
  subjectOptions = [],
  children = [],
  resolvedActiveChildIds = null,
  fixedSubjectId = null,
  onCompleted,
}) {
  const toast = useToast();
  const [step, setStep] = useState('select');
  const [selectAllSubjects, setSelectAllSubjects] = useState(true);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState(() => new Set());
  const [saving, setSaving] = useState(false);

  const scopedSubjectOptions = useMemo(() => {
    if (fixedSubjectId) {
      return (subjectOptions || []).filter((row) => String(row?.id) === String(fixedSubjectId));
    }
    return subjectOptions || [];
  }, [fixedSubjectId, subjectOptions]);

  useEffect(() => {
    if (!visible) {
      setStep(fixedSubjectId ? 'confirm' : 'select');
      setSelectAllSubjects(!fixedSubjectId);
      setSelectedSubjectIds(fixedSubjectId ? new Set([String(fixedSubjectId)]) : new Set());
      setSaving(false);
      return;
    }
    if (fixedSubjectId) {
      setStep('confirm');
      setSelectAllSubjects(false);
      setSelectedSubjectIds(new Set([String(fixedSubjectId)]));
    } else {
      setStep('select');
      setSelectAllSubjects(true);
      setSelectedSubjectIds(new Set());
    }
    setSaving(false);
  }, [visible, fixedSubjectId]);

  const activeSubjectIdSet = useMemo(() => {
    if (selectAllSubjects) {
      return new Set(scopedSubjectOptions.map((row) => String(row?.id || '').trim()).filter(Boolean));
    }
    return new Set([...selectedSubjectIds].map((id) => String(id).trim()).filter(Boolean));
  }, [selectAllSubjects, selectedSubjectIds, scopedSubjectOptions]);

  const targetEvents = useMemo(() => {
    const rows = [];
    const seen = new Set();
    (subjectDetails || []).forEach(({ subject, detail }) => {
      const subjectId = String(subject?.id || '').trim();
      if (!subjectId || !activeSubjectIdSet.has(subjectId)) return;
      (detail?.events || []).forEach((event) => {
        if (!event?.id || event?.is_backlog) return;
        if (!isPastEvent(event)) return;
        if (!isUnattendedEvent(event)) return;
        if (!eventMatchesChildIds(event, resolvedActiveChildIds)) return;
        const eventId = String(event.id).trim();
        if (seen.has(eventId)) return;
        seen.add(eventId);
        rows.push({ event, subjectId });
      });
    });
    return rows;
  }, [subjectDetails, activeSubjectIdSet, resolvedActiveChildIds]);

  const selectedSubjectLabels = useMemo(() => {
    if (selectAllSubjects && !fixedSubjectId) return 'All subjects';
    return scopedSubjectOptions
      .filter((row) => activeSubjectIdSet.has(String(row?.id || '').trim()))
      .map((row) => row?.name || 'Subject')
      .join(', ');
  }, [selectAllSubjects, fixedSubjectId, scopedSubjectOptions, activeSubjectIdSet]);

  const toggleSubject = useCallback((subjectId) => {
    const key = String(subjectId || '').trim();
    if (!key) return;
    setSelectAllSubjects(false);
    setSelectedSubjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    if (!selectAllSubjects && selectedSubjectIds.size === 0) {
      toast.push('Select at least one subject, or choose All subjects.', 'error');
      return;
    }
    if (targetEvents.length === 0) {
      toast.push('No past unattended lessons match your selection.', 'info');
      return;
    }
    setStep('confirm');
  }, [selectAllSubjects, selectedSubjectIds.size, targetEvents.length, toast]);

  const handleCommit = useCallback(async () => {
    if (!familyId || saving || targetEvents.length === 0) return;
    setSaving(true);
    const patchedAttendances = [];
    const touchedSubjectIds = new Set();
    let failed = 0;
    try {
      for (const { event, subjectId } of targetEvents) {
        if (event?.status === 'done') continue;
        const { error } = await completeEvent(event.id, null, { requirePersist: true });
        if (error) {
          failed += 1;
          continue;
        }
        patchedAttendances.push({
          eventId: event.id,
          status: 'done',
          dateKey: eventDateKey(event),
        });
        if (subjectId) touchedSubjectIds.add(String(subjectId));
      }
      const succeeded = patchedAttendances.length;
      if (succeeded > 0) {
        notifyAttendanceRefresh(patchedAttendances, [...touchedSubjectIds]);
        await onCompleted?.([...touchedSubjectIds]);
        toast.push(
          `Marked ${succeeded} lesson${succeeded !== 1 ? 's' : ''} as attended.${failed ? ` ${failed} could not be updated.` : ''}`,
          failed ? 'info' : 'success'
        );
        onClose?.();
      } else if (failed > 0) {
        toast.push('Could not mark lessons as attended. Try again or open an event in the planner.', 'error');
      } else {
        toast.push('No lessons needed updating.', 'info');
        onClose?.();
      }
    } catch (err) {
      toast.push(err?.message || 'Something went wrong.', 'error');
    } finally {
      setSaving(false);
    }
  }, [familyId, onClose, onCompleted, saving, targetEvents, toast]);

  const eventCount = targetEvents.length;
  const showSelectStep = step === 'select' && !fixedSubjectId;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>
                {showSelectStep ? 'Mark all as attended' : 'Confirm mark all as attended'}
              </Text>
              <Text style={styles.subtitle}>
                {showSelectStep
                  ? 'Choose which subjects to include. Only past, unattended lessons will be updated.'
                  : `Mark ${eventCount} past lesson${eventCount === 1 ? '' : 's'} as attended for ${selectedSubjectLabels || 'the selected subjects'}?`}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              disabled={saving}
              {...(Platform.OS === 'web' ? { cursor: saving ? 'default' : 'pointer' } : {})}
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {showSelectStep ? (
            <>
              <TouchableOpacity
                style={[styles.allSubjectsRow, selectAllSubjects && styles.optionRowActive]}
                onPress={() => {
                  setSelectAllSubjects(true);
                  setSelectedSubjectIds(new Set());
                }}
                activeOpacity={0.75}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={[styles.optionTitle, selectAllSubjects && styles.optionTitleActive]}>
                  All subjects
                </Text>
                {selectAllSubjects ? <CheckCircle2 size={18} color="#4C7ED9" /> : null}
              </TouchableOpacity>
              {scopedSubjectOptions.length > 0 ? (
                <View style={styles.list}>
                  {scopedSubjectOptions.map((option, index) => {
                    const id = String(option?.id || '').trim();
                    const isActive = !selectAllSubjects && selectedSubjectIds.has(id);
                    return (
                      <TouchableOpacity
                        key={`mark-all-subject-${id}`}
                        style={[
                          styles.optionRow,
                          index === scopedSubjectOptions.length - 1 && styles.optionRowLast,
                          isActive && styles.optionRowActive,
                        ]}
                        onPress={() => toggleSubject(id)}
                        activeOpacity={0.75}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <View style={styles.optionTextWrap}>
                          <Text style={[styles.optionTitle, isActive && styles.optionTitleActive]}>
                            {option.name}
                          </Text>
                          {option.studentLabel ? (
                            <View style={styles.studentsRow}>
                              <ChildAvatarCluster
                                childIds={option.childIds || []}
                                familyChildren={children}
                                size={28}
                                overlap={-8}
                              />
                              <Text style={styles.studentsText}>{option.studentLabel}</Text>
                            </View>
                          ) : null}
                        </View>
                        {isActive ? <CheckCircle2 size={18} color="#4C7ED9" /> : <ChevronRight size={16} color="#9CA3AF" />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>No subjects available.</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.confirmBox}>
              <Text style={styles.confirmCount}>
                {eventCount} lesson{eventCount === 1 ? '' : 's'} will be marked attended
              </Text>
              <Text style={styles.confirmMeta}>{selectedSubjectLabels}</Text>
            </View>
          )}

          <View style={styles.actions}>
            {showSelectStep ? (
              <>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={onClose}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={handleContinue}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <Text style={styles.primaryText}>Continue</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => (fixedSubjectId ? onClose?.() : setStep('select'))}
                  disabled={saving}
                  {...(Platform.OS === 'web' ? { cursor: saving ? 'default' : 'pointer' } : {})}
                >
                  <Text style={styles.cancelText}>{fixedSubjectId ? 'Cancel' : 'Back'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, (saving || eventCount === 0) && styles.primaryBtnDisabled]}
                  onPress={handleCommit}
                  disabled={saving || eventCount === 0}
                  {...(Platform.OS === 'web' ? { cursor: saving || eventCount === 0 ? 'default' : 'pointer' } : {})}
                >
                  {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <CheckCircle2 size={16} color="#FFFFFF" />}
                  <Text style={styles.primaryText}>{saving ? 'Marking…' : 'Mark all as attended'}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 32,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    ...WEB_HEADING_FONT,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 20,
    ...WEB_BODY_FONT,
  },
  allSubjectsRow: {
    marginTop: 14,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  optionRow: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  optionRowLast: { borderBottomWidth: 0 },
  optionRowActive: { backgroundColor: '#F8FBFF' },
  optionTextWrap: { flex: 1, minWidth: 0 },
  optionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1F2937',
    ...WEB_HEADING_FONT,
  },
  optionTitleActive: { color: '#1E40AF' },
  studentsRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  studentsText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    color: '#94A3B8',
    ...WEB_BODY_FONT,
  },
  emptyWrap: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },
  emptyText: { fontSize: 14, color: '#6B7280', ...WEB_BODY_FONT },
  confirmBox: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    padding: 16,
    gap: 6,
  },
  confirmCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    ...WEB_HEADING_FONT,
  },
  confirmMeta: {
    fontSize: 14,
    color: '#6B7280',
    ...WEB_BODY_FONT,
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...WEB_BODY_FONT,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#4C7ED9',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    ...WEB_BODY_FONT,
  },
});
