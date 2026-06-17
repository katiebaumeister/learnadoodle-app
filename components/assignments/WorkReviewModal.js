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
  ActivityIndicator,
} from 'react-native';
import { X, Check, RotateCcw, Save, Link, Upload, Paperclip } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { assignmentIsSubmittedLifecycle } from '../../lib/assignmentLifecycle';
import { reviewAssignmentWork } from '../../lib/workAssignmentClient';
import {
  extractStudentSubmissionText,
  getWorkStatusLabel,
  normalizeWorkEventType,
  parseWorkSpec,
  resolveQuizAnswerRows,
} from '../../lib/workEventHelpers';
import { createFileMaterial } from '../../lib/services/materialsClient';
import FormattedInstructionText from '../create/shared/FormattedInstructionText';
import { LD, shellShadow, fontDisplay } from '../parent/parentModalTheme';
import AssignmentCommentsPanel from './AssignmentCommentsPanel';
import { modalButtonStyles, MODAL_ACCENT_TEXT } from '../ui/modalButtonStyles';

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
  const [reviewAttachments, setReviewAttachments] = useState([]);
  const [uploadingMarkup, setUploadingMarkup] = useState(false);
  const [markupError, setMarkupError] = useState(null);

  const linkedEventId = useMemo(() => resolveLinkedEventId(assignment), [assignment]);
  const workSpec = useMemo(
    () => parseWorkSpec(linkedEvent?.work_spec, linkedEvent?.event_type || assignment?.event_type),
    [linkedEvent, assignment?.event_type]
  );
  const eventType = normalizeWorkEventType(linkedEvent?.event_type || assignment?.event_type);
  const statusLabel = getWorkStatusLabel(assignment);
  const instructions =
    String(workSpec?.instructions || '').trim() || 'No instructions provided.';
  const studentSubmissionText = extractStudentSubmissionText(assignment?.description);
  const submittedLink = useMemo(() => {
    const desc = String(assignment?.description || '');
    const match = desc.match(/\[Link submission\]\s*\n?\s*(https?:\/\/\S+)/i);
    return match ? match[1].trim() : null;
  }, [assignment?.description]);
  const progressPercent =
    assignment?.progress_percent != null ? Math.round(Number(assignment.progress_percent)) : null;
  const quizAnswerRows = useMemo(
    () => resolveQuizAnswerRows(workSpec, assignment?.description),
    [workSpec, assignment?.description]
  );
  const familyId = assignment?.family_id || null;
  const childId = assignment?.child_id || null;

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
        if (!cancelled) setAttachments([]);
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

  useEffect(() => {
    let cancelled = false;
    const loadReviewAttachments = async () => {
      const rawIds = assignment?.linked_review_attachment_ids;
      const ids = Array.isArray(rawIds) ? rawIds.map(String).filter(Boolean) : [];
      if (ids.length === 0) {
        if (!cancelled) setReviewAttachments([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('materials')
          .select('id, title, provider_url, url, storage_path')
          .in('id', ids);
        if (cancelled || error) return;
        const byId = new Map((data || []).map((row) => [String(row.id), row]));
        setReviewAttachments(ids.map((id) => byId.get(String(id))).filter(Boolean));
      } catch (_) {
        if (!cancelled) setReviewAttachments([]);
      }
    };
    loadReviewAttachments();
    return () => {
      cancelled = true;
    };
  }, [assignment?.id, assignment?.linked_review_attachment_ids]);

  const runReview = async (action) => {
    if (!assignment?.id || submitting) return;
    setSubmitting(true);
    try {
      const reviewAttachmentIds = reviewAttachments.map((file) => String(file.id)).filter(Boolean);
      await reviewAssignmentWork({
        assignmentId: assignment.id,
        action,
        feedback,
        gradeDisplay: gradeDisplay.trim() || null,
        gradeValue: gradeValue.trim() === '' ? null : Number(gradeValue),
        reviewerId: user?.id || null,
        reviewAttachmentIds,
      });
      onReviewed?.();
      onClose?.();
    } catch (err) {
      console.warn('[WorkReviewModal] review failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const pickMarkedUpFile = async () => {
    if (Platform.OS !== 'web') {
      setMarkupError('Marked-up file upload is available on web.');
      return;
    }
    if (!familyId || !childId) {
      setMarkupError('Missing family context for upload.');
      return;
    }
    setMarkupError(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';
    input.onchange = async (e) => {
      const file = e?.target?.files?.[0];
      if (!file) return;
      setUploadingMarkup(true);
      try {
        const ext = String(file.name || '').split('.').pop() || 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const filePath = `${familyId}/${childId}/review-markup/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('uploads')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(filePath);
        const mat = await createFileMaterial({
          familyId,
          childId,
          storagePath: filePath,
          title: file.name || 'Marked-up file',
          mime: file.type || 'application/octet-stream',
          bytes: file.size || 0,
          eventId: linkedEventId || null,
          url: publicUrl,
          tags: ['review_markup'],
        });
        if (mat?.id) {
          setReviewAttachments((prev) => [...prev, mat]);
        }
      } catch (err) {
        setMarkupError(err?.message || 'Could not upload marked-up file.');
      } finally {
        setUploadingMarkup(false);
      }
    };
    input.click();
  };

  const openAttachment = (file) => {
    const url = String(file?.provider_url || file?.url || '').trim();
    if (!url) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
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
              <FormattedInstructionText text={instructions} style={styles.bodyText} />
            </View>

            {eventType === 'Project' && progressPercent != null ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Progress</Text>
                <Text style={styles.progressText}>{progressPercent}% complete</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Student submission</Text>
              {assignment?.submitted_at ? (
                <Text style={styles.metaLine}>
                  Submitted{' '}
                  {new Date(assignment.submitted_at).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              ) : (
                <Text style={styles.bodyText}>Not submitted yet</Text>
              )}
              {studentSubmissionText ? (
                <Text style={[styles.bodyText, { marginTop: 8 }]}>{studentSubmissionText}</Text>
              ) : null}
              {submittedLink ? (
                <TouchableOpacity
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.open(submittedLink, '_blank', 'noopener,noreferrer');
                    }
                  }}
                  style={styles.linkRow}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Link size={14} color="#2563EB" />
                  <Text style={styles.linkText} numberOfLines={2}>{submittedLink}</Text>
                </TouchableOpacity>
              ) : null}
              {quizAnswerRows.length > 0 ? (
                <View style={styles.quizBlock}>
                  {quizAnswerRows.map((row, index) => (
                    <View key={row.id} style={styles.quizRow}>
                      <Text style={styles.quizPrompt}>
                        {index + 1}. {row.prompt}
                      </Text>
                      <Text style={styles.quizAnswer}>
                        {row.answer || '—'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>

            {attachments.length > 0 ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Uploaded files</Text>
                {attachments.map((file) => (
                  <TouchableOpacity
                    key={file.id}
                    onPress={() => openAttachment(file)}
                    style={styles.attachmentRow}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.attachmentLine}>
                      {String(file.title || file.storage_path || 'Attachment')}
                    </Text>
                  </TouchableOpacity>
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
              <Text style={styles.sectionLabel}>Marked-up file (optional)</Text>
              <TouchableOpacity
                style={styles.markupUploadButton}
                onPress={pickMarkedUpFile}
                disabled={uploadingMarkup || submitting}
                {...(Platform.OS === 'web' && { cursor: uploadingMarkup || submitting ? 'default' : 'pointer' })}
              >
                {uploadingMarkup ? (
                  <ActivityIndicator size="small" color="#64748B" />
                ) : (
                  <>
                    <Upload size={14} color="#64748B" />
                    <Text style={styles.markupUploadText}>Attach marked-up file</Text>
                  </>
                )}
              </TouchableOpacity>
              {markupError ? <Text style={styles.markupError}>{markupError}</Text> : null}
              {reviewAttachments.length > 0 ? (
                <View style={styles.markupList}>
                  {reviewAttachments.map((file) => (
                    <TouchableOpacity
                      key={file.id}
                      onPress={() => openAttachment(file)}
                      style={styles.markupRow}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Paperclip size={14} color="#64748B" />
                      <Text style={styles.attachmentLine}>
                        {String(file.title || file.storage_path || 'Marked-up file')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Review feedback</Text>
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

            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Assignment comments</Text>
              <AssignmentCommentsPanel
                assignmentId={assignment?.id}
                assignment={assignment}
                isParentViewer
              />
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {assignmentIsSubmittedLifecycle(assignment) ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.sendBackButton]}
                onPress={() => runReview('send_back')}
                disabled={submitting}
                {...(Platform.OS === 'web' && { cursor: submitting ? 'default' : 'pointer' })}
              >
                <RotateCcw size={15} color="#B45309" />
                <Text style={styles.sendBackText}>Return for changes</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={[styles.actionButton, styles.approveButton]}
              onPress={() => runReview('approve')}
              disabled={submitting}
              {...(Platform.OS === 'web' && { cursor: submitting ? 'default' : 'pointer' })}
            >
              <Check size={15} color="#15803D" />
              <Text style={styles.approveText}>Mark complete</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, modalButtonStyles.secondaryButtonCompact]}
              onPress={() => runReview('save')}
              disabled={submitting}
              {...(Platform.OS === 'web' && { cursor: submitting ? 'default' : 'pointer' })}
            >
              <Save size={15} color={MODAL_ACCENT_TEXT} />
              <Text style={modalButtonStyles.secondaryButtonCompactText}>Save submission</Text>
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
  metaLine: {
    fontSize: 13,
    color: '#64748B',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  linkText: {
    flex: 1,
    fontSize: 13,
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  attachmentRow: {
    paddingVertical: 4,
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
  quizBlock: {
    marginTop: 10,
    gap: 10,
  },
  quizRow: {
    gap: 4,
  },
  quizPrompt: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  quizAnswer: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1E293B',
  },
  markupUploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  markupUploadText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  markupError: {
    fontSize: 12,
    color: '#DC2626',
  },
  markupList: {
    marginTop: 8,
    gap: 6,
  },
  markupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
});
