/**
 * Parent work review panel — instructions, submission, approve / send back / grade.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  Platform,
} from 'react-native';
import { X, Check, RotateCcw, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { reviewAssignmentWork } from '../../lib/workAssignmentClient';
import {
  getWorkStatusLabel,
  normalizeWorkEventType,
  parseWorkSpec,
} from '../../lib/workEventHelpers';
import { LD, shellShadow, fontDisplay } from '../parent/parentModalTheme';

function resolveLinkedEventId(assignment) {
  const raw = assignment?.linked_event_ids;
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
    } catch (_) {
      /* ignore */
    }
  }
  return assignment?.linked_event_id || assignment?.event_id || null;
}

export default function WorkReviewModal({
  visible,
  assignment,
  onClose,
  onReviewed,
}) {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [gradeDisplay, setGradeDisplay] = useState('');
  const [gradeValue, setGradeValue] = useState('');
  const [linkedEvent, setLinkedEvent] = useState(null);
  const [attachments, setAttachments] = useState([]);

  const linkedEventId = useMemo(() => resolveLinkedEventId(assignment), [assignment]);
  const workSpec = useMemo(
    () => parseWorkSpec(linkedEvent?.work_spec, linkedEvent?.event_type || assignment?.event_type),
    [linkedEvent, assignment?.event_type]
  );
  const eventType = normalizeWorkEventType(linkedEvent?.event_type || assignment?.event_type);
  const statusLabel = getWorkStatusLabel(assignment);
  const instructions =
    String(workSpec?.instructions || '').trim()
    || String(assignment?.description || '').trim()
    || 'No instructions provided.';
  const progressPercent =
    assignment?.progress_percent != null ? Math.round(Number(assignment.progress_percent)) : null;

  useEffect(() => {
    setFeedback(String(assignment?.review_feedback || ''));
    setGradeDisplay(String(assignment?.grade_display || '').trim());
    setGradeValue(
      assignment?.grade_value != null && Number.isFinite(Number(assignment.grade_value))
        ? String(Math.round(Number(assignment.grade_value)))
        : ''
    );
  }, [assignment?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadEvent = async () => {
      if (!linkedEventId) {
        setLinkedEvent(null);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, title, event_type, work_spec, start_ts, date_local')
          .eq('id', linkedEventId)
          .maybeSingle();
        if (!cancelled && !error) setLinkedEvent(data || null);
      } catch (_) {
        if (!cancelled) setLinkedEvent(null);
      }
    };
    loadEvent();
    return () => {
      cancelled = true;
    };
  }, [linkedEventId, assignment?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadAttachments = async () => {
      const rawIds = assignment?.linked_evidence_ids;
      const ids = Array.isArray(rawIds) ? rawIds.map(String).filter(Boolean) : [];
      if (ids.length === 0) {
        setAttachments([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('materials')
          .select('id, title, provider_url, url, storage_path')
          .in('id', ids);
        if (cancelled || error) return;
        const byId = new Map((data || []).map((row) => [String(row.id), row]));
        setAttachments(ids.map((id) => byId.get(String(id))).filter(Boolean));
      } catch (_) {
        if (!cancelled) setAttachments([]);
      }
    };
    loadAttachments();
    return () => {
      cancelled = true;
    };
  }, [assignment?.id, assignment?.linked_evidence_ids]);

  const runReview = async (action) => {
    if (!assignment?.id || submitting) return;
    setSubmitting(true);
    try {
      await reviewAssignmentWork({
        assignmentId: assignment.id,
        action,
        feedback,
        gradeDisplay: gradeDisplay.trim() || null,
        gradeValue: gradeValue.trim() === '' ? null : Number(gradeValue),
        reviewerId: user?.id || null,
      });
      onReviewed?.();
      onClose?.();
    } catch (err) {
      console.warn('[WorkReviewModal] review failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!assignment) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.shell, shellShadow]}>
          <View style={styles.header}>
            <View style={styles.headerTextWrap}>
              <Text style={[styles.kicker, fontDisplay]}>Review work</Text>
              <Text style={[styles.title, fontDisplay]} numberOfLines={2}>
                {String(assignment.title || linkedEvent?.title || 'Schoolwork')}
              </Text>
              <Text style={styles.meta}>
                {[eventType, statusLabel].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Instructions</Text>
              <Text style={styles.bodyText}>{instructions}</Text>
            </View>

            {eventType === 'Project' && progressPercent != null ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Progress</Text>
                <Text style={styles.progressText}>{progressPercent}% complete</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Student submission</Text>
              <Text style={styles.bodyText}>
                {assignment?.submitted_at
                  ? `Submitted ${new Date(assignment.submitted_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}`
                  : 'Not submitted yet'}
              </Text>
            </View>

            {attachments.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Attachments</Text>
                {attachments.map((file) => (
                  <Text key={file.id} style={styles.attachmentLine}>
                    {String(file.title || file.storage_path || 'Attachment')}
                  </Text>
                ))}
              </View>
            ) : null}

            {workSpec?.graded !== false ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Grade</Text>
                <View style={styles.gradeRow}>
                  <TextInput
                    style={styles.gradeInput}
                    value={gradeDisplay}
                    onChangeText={setGradeDisplay}
                    placeholder="A, Pass, etc."
                    placeholderTextColor={LD.placeholder}
                  />
                  <TextInput
                    style={[styles.gradeInput, styles.gradeInputPercent]}
                    value={gradeValue}
                    onChangeText={setGradeValue}
                    placeholder="%"
                    placeholderTextColor={LD.placeholder}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Comments</Text>
              <TextInput
                style={styles.feedbackInput}
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Feedback for the student…"
                placeholderTextColor={LD.placeholder}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.sendBackButton]}
              onPress={() => runReview('send_back')}
              disabled={submitting}
              {...(Platform.OS === 'web' && { cursor: submitting ? 'default' : 'pointer' })}
            >
              <RotateCcw size={15} color="#B45309" />
              <Text style={styles.sendBackText}>Send back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => runReview('approve')}
              disabled={submitting}
              {...(Platform.OS === 'web' && { cursor: submitting ? 'default' : 'pointer' })}
            >
              <Check size={15} color="#15803D" />
              <Text style={styles.approveText}>Approve</Text>
            </TouchableOpacity>
            {workSpec?.graded !== false ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.gradeButton]}
                onPress={() => runReview('grade')}
                disabled={submitting}
                {...(Platform.OS === 'web' && { cursor: submitting ? 'default' : 'pointer' })}
              >
                <Award size={15} color="#1D4ED8" />
                <Text style={styles.gradeText}>Grade</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  shell: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF1F6',
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '700',
    color: LD.blueMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  meta: {
    marginTop: 6,
    fontSize: 13,
    color: '#64748B',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    gap: 16,
  },
  section: {
    gap: 6,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#1E293B',
  },
  progressText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0369A1',
  },
  attachmentLine: {
    fontSize: 13,
    color: '#334155',
    marginTop: 2,
  },
  gradeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gradeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  gradeInputPercent: {
    maxWidth: 88,
    flexGrow: 0,
  },
  feedbackInput: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: '#EEF1F6',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  sendBackButton: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  sendBackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B45309',
  },
  approveButton: {
    borderColor: '#BBF7D0',
    backgroundColor: '#F0FDF4',
  },
  approveText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  gradeButton: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  gradeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
});
