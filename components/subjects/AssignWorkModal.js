import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, CheckCircle2, X } from 'lucide-react';
import { LearningSubmissionMethodsField } from '../events/WorkDetailsSection';
import { useToast } from '../Toast';
import {
  applyWorkAssignmentToEvents,
  filterAssignWorkEligibleEvents,
} from '../../lib/assignWorkClient';
import {
  defaultWorkSpec,
  parseWorkSpec,
} from '../../lib/workEventHelpers';
import {
  formatEventTypeLabel,
  getPlannerEventTypeColors,
} from '../planner/plannerListTableUtils';

const WEB_HEADING_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

function resolveEventDateValue(ev) {
  const direct = ev?.start_ts || ev?.due_ts || ev?.start_local;
  if (direct) return direct;
  const ymd = String(ev?.date_local || '').slice(0, 10);
  return ymd ? `${ymd}T12:00:00.000Z` : null;
}

function formatRowDate(event) {
  const dateValue = resolveEventDateValue(event);
  const ymd = String(event?.date_local || '').slice(0, 10) || String(dateValue || '').slice(0, 10);
  if (!ymd) return '—';
  const d = new Date(dateValue || `${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function sortEventsByDate(events) {
  return [...events].sort((a, b) => {
    const aTs = new Date(resolveEventDateValue(a) || 0).getTime();
    const bTs = new Date(resolveEventDateValue(b) || 0).getTime();
    return aTs - bTs;
  });
}

export default function AssignWorkModal({
  visible = false,
  onClose,
  familyId = null,
  events = [],
  filterSummary = '',
  onCompleted,
}) {
  const toast = useToast();
  const [step, setStep] = useState('select');
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draftWorkSpec, setDraftWorkSpec] = useState(() => ({
    ...defaultWorkSpec('Assignment'),
    require_final_deliverable: true,
  }));

  const eligibleEvents = useMemo(
    () => sortEventsByDate(filterAssignWorkEligibleEvents(events)),
    [events]
  );

  const selectedEvent = useMemo(
    () => eligibleEvents.find((e) => String(e.id) === String(selectedEventId)) || null,
    [eligibleEvents, selectedEventId]
  );

  useEffect(() => {
    if (!visible) {
      setStep('select');
      setSelectedEventId(null);
      setSaving(false);
      setDraftWorkSpec({
        ...defaultWorkSpec('Assignment'),
        require_final_deliverable: true,
      });
      return;
    }
    setStep('select');
    setSelectedEventId(null);
    setSaving(false);
    setDraftWorkSpec({
      ...defaultWorkSpec('Assignment'),
      require_final_deliverable: true,
    });
  }, [visible]);

  const selectEvent = useCallback((eventId) => {
    const key = String(eventId || '').trim();
    if (!key) return;
    setSelectedEventId(key);
  }, []);

  const handleContinue = useCallback(() => {
    if (!selectedEvent) {
      toast.push('Select an event.', 'error');
      return;
    }
    const eventType = selectedEvent.event_type || 'Assignment';
    setDraftWorkSpec({
      ...parseWorkSpec(selectedEvent.work_spec, eventType),
      require_final_deliverable: true,
    });
    setStep('methods');
  }, [selectedEvent, toast]);

  const handleApply = useCallback(async () => {
    if (!familyId || saving || !selectedEvent) return;
    const eventType = selectedEvent.event_type || 'Assignment';
    const spec = parseWorkSpec(draftWorkSpec, eventType);
    const methods = spec.submission_methods || {};
    if (!Object.values(methods).some(Boolean)) {
      toast.push('Select at least one submission method.', 'error');
      return;
    }
    setSaving(true);
    try {
      const { updated, failed } = await applyWorkAssignmentToEvents({
        familyId,
        events: [selectedEvent],
        submissionMethods: methods,
      });
      if (updated > 0) {
        await onCompleted?.();
        const label = String(selectedEvent.title || 'event').trim();
        toast.push(
          `Assigned work on ${label}.${failed ? ' Update failed — try again.' : ''}`,
          failed ? 'info' : 'success'
        );
        onClose?.();
      } else if (failed > 0) {
        toast.push('Could not assign work. Try again or edit the event in the planner.', 'error');
      } else {
        toast.push('No changes were saved.', 'info');
        onClose?.();
      }
    } catch (err) {
      toast.push(err?.message || 'Something went wrong.', 'error');
    } finally {
      setSaving(false);
    }
  }, [familyId, saving, selectedEvent, draftWorkSpec, onCompleted, onClose, toast]);

  const showSelectStep = step === 'select';
  const methodCount = Object.values(
    parseWorkSpec(draftWorkSpec, selectedEvent?.event_type || 'Assignment').submission_methods || {}
  ).filter(Boolean).length;

  const selectedEventLabel = selectedEvent
    ? `${String(selectedEvent.title || 'Untitled')} · ${formatRowDate(selectedEvent)}`
    : '';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.card} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>
                {showSelectStep ? 'Assign work' : 'Submission methods'}
              </Text>
              <Text style={styles.subtitle}>
                {showSelectStep
                  ? `Choose one event${filterSummary ? ` (${filterSummary})` : ''}. Reopen this flow to assign work on another event.`
                  : `Set submission methods for ${selectedEventLabel || 'this event'}.`}
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
            eligibleEvents.length > 0 ? (
              <ScrollView style={styles.listScroll} nestedScrollEnabled>
                <View style={styles.list}>
                  {eligibleEvents.map((event, index) => {
                    const id = String(event.id);
                    const isActive = selectedEventId === id;
                    const typeLabel = formatEventTypeLabel(event);
                    const { chipBg, chipText } = getPlannerEventTypeColors(event);
                    return (
                      <TouchableOpacity
                        key={`assign-work-${id}`}
                        style={[
                          styles.optionRow,
                          index === eligibleEvents.length - 1 && styles.optionRowLast,
                          isActive && styles.optionRowActive,
                        ]}
                        onPress={() => selectEvent(id)}
                        activeOpacity={0.75}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isActive }}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <View style={styles.optionTextWrap}>
                          <Text style={[styles.optionTitle, isActive && styles.optionTitleActive]} numberOfLines={1}>
                            {String(event?.title || 'Untitled')}
                          </Text>
                          <View style={styles.optionMetaRow}>
                            <View style={[styles.typeChip, { backgroundColor: chipBg }]}>
                              <Text style={[styles.typeChipText, { color: chipText }]} numberOfLines={1}>
                                {typeLabel}
                              </Text>
                            </View>
                            <Text style={styles.optionMeta} numberOfLines={1}>
                              {formatRowDate(event)}
                            </Text>
                          </View>
                        </View>
                        {isActive ? (
                          <CheckCircle2 size={18} color="#6BB3E8" />
                        ) : (
                          <View style={styles.uncheckedCircle} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No events match your current filters.</Text>
              </View>
            )
          ) : (
            <View style={styles.methodsBox}>
              <LearningSubmissionMethodsField
                workSpec={draftWorkSpec}
                eventType={selectedEvent?.event_type || 'Assignment'}
                onChange={setDraftWorkSpec}
              />
              <Text style={styles.methodsHint}>
                Submission will be turned on for this event. Open Assign work again to update another event.
              </Text>
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
                  style={[
                    styles.primaryBtn,
                    (!selectedEventId || eligibleEvents.length === 0) && styles.primaryBtnDisabled,
                  ]}
                  onPress={handleContinue}
                  disabled={!selectedEventId || eligibleEvents.length === 0}
                  {...(Platform.OS === 'web' ? { cursor: !selectedEventId ? 'default' : 'pointer' } : {})}
                >
                  <Text style={styles.primaryText}>Continue</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setStep('select')}
                  disabled={saving}
                  {...(Platform.OS === 'web' ? { cursor: saving ? 'default' : 'pointer' } : {})}
                >
                  <Text style={styles.cancelText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, (saving || methodCount === 0) && styles.primaryBtnDisabled]}
                  onPress={handleApply}
                  disabled={saving || methodCount === 0}
                  {...(Platform.OS === 'web' ? { cursor: saving || methodCount === 0 ? 'default' : 'pointer' } : {})}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Check size={16} color="#FFFFFF" />
                  )}
                  <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
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
    maxWidth: 520,
    maxHeight: '90%',
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
  listScroll: {
    marginTop: 14,
    maxHeight: 320,
  },
  list: {
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
  optionRowActive: {
    backgroundColor: 'rgba(107, 179, 232, 0.12)',
    borderColor: '#6BB3E8',
  },
  optionTextWrap: { flex: 1, minWidth: 0, marginRight: 10 },
  optionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    ...WEB_HEADING_FONT,
  },
  optionTitleActive: { color: '#6BB3E8' },
  optionMetaRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    maxWidth: 120,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '700',
    ...WEB_HEADING_FONT,
  },
  optionMeta: {
    flex: 1,
    fontSize: 13,
    color: '#94A3B8',
    ...WEB_BODY_FONT,
  },
  uncheckedCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
  },
  emptyWrap: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },
  emptyText: { fontSize: 14, color: '#6B7280', ...WEB_BODY_FONT },
  methodsBox: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  methodsHint: {
    marginTop: 10,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    ...WEB_BODY_FONT,
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  cancelBtn: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...WEB_HEADING_FONT,
  },
  primaryBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#9ECFFB',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    ...WEB_HEADING_FONT,
  },
});
