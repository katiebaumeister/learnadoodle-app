/**
 * Assignment submissions review — same shell/layout as assignment create modal.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Modal,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Link, Upload, Paperclip } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { reviewAssignmentWork } from '../../lib/workAssignmentClient';
import { assignmentIsSubmittedLifecycle } from '../../lib/assignmentLifecycle';
import {
  extractStudentSubmissionText,
  getWorkStatusLabel,
  normalizeWorkEventType,
  parseWorkSpec,
  resolveQuizAnswerRows,
} from '../../lib/workEventHelpers';
import { createFileMaterial } from '../../lib/services/materialsClient';
import { fetchAssignmentsForEvent } from '../../lib/create/assignmentEditHelpers';
import CreateModalShell from './shared/CreateModalShell';
import FamilyMemberPicker from './shared/FamilyMemberPicker';
import { SectionHeading } from './shared/assignmentFormParts';
import AssignmentSubmissionsFooter from './assignment/AssignmentSubmissionsFooter';
import AssignmentCommentsPanel from '../assignments/AssignmentCommentsPanel';
import FormattedInstructionText from './shared/FormattedInstructionText';
import { createModalStyles as styles, CREATE_ASSIGNMENT_MODAL_MAX_WIDTH, PLACEHOLDER } from './shared/createModalStyles';

export default function AssignmentSubmissionsModal({
  visible,
  onClose,
  onReviewed,
  familyId,
  familyMembers = [],
  linkedEvent = null,
  assignment = null,
  eventId = null,
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [assignmentRows, setAssignmentRows] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [linkedEventRow, setLinkedEventRow] = useState(linkedEvent);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [gradeDisplay, setGradeDisplay] = useState('');
  const [gradeValue, setGradeValue] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [reviewAttachments, setReviewAttachments] = useState([]);
  const [uploadingMarkup, setUploadingMarkup] = useState(false);
  const [markupError, setMarkupError] = useState(null);

  const resolvedEventId = linkedEventRow?.id || eventId || null;

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        let eventRow = linkedEvent;
        if (!eventRow && resolvedEventId) {
          const { data } = await supabase
            .from('events')
            .select('*')
            .eq('id', resolvedEventId)
            .maybeSingle();
          eventRow = data || null;
        }
        if (!cancelled) setLinkedEventRow(eventRow);

        let rows = [];
        if (familyId && resolvedEventId) {
          rows = await fetchAssignmentsForEvent({ familyId, eventId: resolvedEventId });
        } else if (assignment?.id) {
          rows = [assignment];
        }

        if (!cancelled) {
          setAssignmentRows(rows);
          const seedChild =
            assignment?.child_id ||
            rows[0]?.child_id ||
            (Array.isArray(eventRow?.child_ids) ? eventRow.child_ids[0] : eventRow?.child_id) ||
            null;
          setSelectedChildId(seedChild ? String(seedChild) : null);
        }
      } catch (err) {
        console.warn('[AssignmentSubmissionsModal] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [visible, familyId, resolvedEventId, assignment?.id, linkedEvent]);

  const activeAssignment = useMemo(() => {
    if (!selectedChildId) return assignmentRows[0] || assignment || null;
    return (
      assignmentRows.find((row) => String(row.child_id) === String(selectedChildId)) ||
      assignment ||
      null
    );
  }, [assignmentRows, selectedChildId, assignment]);

  const workSpec = useMemo(
    () => parseWorkSpec(linkedEventRow?.work_spec, linkedEventRow?.event_type || 'Assignment'),
    [linkedEventRow],
  );
  const eventType = normalizeWorkEventType(linkedEventRow?.event_type || 'Assignment');
  const statusLabel = getWorkStatusLabel(activeAssignment);
  const instructions = String(workSpec?.instructions || linkedEventRow?.description || '').trim()
    || 'No instructions provided.';
  const studentSubmissionText = extractStudentSubmissionText(activeAssignment?.description);
  const submittedLink = useMemo(() => {
    const desc = String(activeAssignment?.description || '');
    const match = desc.match(/\[Link submission\]\s*\n?\s*(https?:\/\/\S+)/i);
    return match ? match[1].trim() : null;
  }, [activeAssignment?.description]);
  const quizAnswerRows = useMemo(
    () => resolveQuizAnswerRows(workSpec, activeAssignment?.description),
    [workSpec, activeAssignment?.description],
  );
  const showReturnForChanges = assignmentIsSubmittedLifecycle(activeAssignment);

  useEffect(() => {
    setFeedback(String(activeAssignment?.review_feedback || ''));
    setGradeDisplay(String(activeAssignment?.grade_display || '').trim());
    setGradeValue(
      activeAssignment?.grade_value != null && Number.isFinite(Number(activeAssignment.grade_value))
        ? String(Math.round(Number(activeAssignment.grade_value)))
        : '',
    );
  }, [activeAssignment?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadAttachments = async () => {
      const rawIds = activeAssignment?.linked_evidence_ids;
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
  }, [activeAssignment?.id, activeAssignment?.linked_evidence_ids]);

  useEffect(() => {
    let cancelled = false;
    const loadReviewAttachments = async () => {
      const rawIds = activeAssignment?.linked_review_attachment_ids;
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
  }, [activeAssignment?.id, activeAssignment?.linked_review_attachment_ids]);

  const childPickerMembers = useMemo(() => {
    const childIds = new Set(
      assignmentRows.map((row) => String(row.child_id)).filter(Boolean),
    );
    if (childIds.size === 0 && activeAssignment?.child_id) {
      childIds.add(String(activeAssignment.child_id));
    }
    return familyMembers.filter((member) => childIds.has(String(member.id || member.child_id)));
  }, [assignmentRows, activeAssignment?.child_id, familyMembers]);

  const runReview = useCallback(async (action) => {
    if (!activeAssignment?.id || submitting) return;
    setSubmitting(true);
    try {
      const reviewAttachmentIds = reviewAttachments.map((file) => String(file.id)).filter(Boolean);
      await reviewAssignmentWork({
        assignmentId: activeAssignment.id,
        action,
        feedback,
        gradeDisplay: gradeDisplay.trim() || null,
        gradeValue: gradeValue.trim() === '' ? null : Number(gradeValue),
        reviewerId: user?.id || null,
        reviewAttachmentIds,
      });
      onReviewed?.();
    } catch (err) {
      console.warn('[AssignmentSubmissionsModal] review failed:', err);
    } finally {
      setSubmitting(false);
    }
  }, [
    activeAssignment?.id,
    submitting,
    reviewAttachments,
    feedback,
    gradeDisplay,
    gradeValue,
    user?.id,
    onReviewed,
  ]);

  const pickMarkedUpFile = async () => {
    if (Platform.OS !== 'web') {
      setMarkupError('Marked-up file upload is available on web.');
      return;
    }
    const childId = activeAssignment?.child_id;
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
          eventId: resolvedEventId || null,
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
    if (!url || Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  if (!visible) return null;

  const titleDisplay = String(
    activeAssignment?.title || linkedEventRow?.title || 'Assignment',
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <CreateModalShell
        title="Submissions"
        onClose={onClose}
        maxWidth={CREATE_ASSIGNMENT_MODAL_MAX_WIDTH}
        shellStyle={styles.assignmentModalShell}
        bodyStyle={styles.assignmentModalBody}
        disableShellScroll
        footer={(
          <AssignmentSubmissionsFooter
            onCancel={onClose}
            onReturnForChanges={() => runReview('send_back')}
            onMarkComplete={() => runReview('approve')}
            onSaveSubmission={() => runReview('save')}
            submitting={submitting}
            showReturnForChanges={showReturnForChanges}
          />
        )}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color="#9ECFFB" />
          </View>
        ) : (
          <View style={styles.assignmentFormRow}>
            <View style={styles.assignmentFormColumnMain}>
              <View style={styles.assignmentContentPanelMain}>
                <ScrollView
                  style={styles.assignmentContentPanelScroll}
                  contentContainerStyle={styles.assignmentContentPanelScrollInner}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  <Text style={submissionStyles.assignmentTitle}>{titleDisplay}</Text>
                  <Text style={submissionStyles.statusMeta}>
                    {[eventType, statusLabel].filter(Boolean).join(' · ')}
                  </Text>

                  <View style={styles.assignmentPanelFormGroup}>
                    <SectionHeading>Instructions</SectionHeading>
                    <FormattedInstructionText
                      text={instructions}
                      style={submissionStyles.bodyText}
                    />
                  </View>

                  <View style={styles.assignmentPanelFormGroup}>
                    <SectionHeading>Student submission</SectionHeading>
                    {activeAssignment?.submitted_at ? (
                      <Text style={submissionStyles.metaLine}>
                        Submitted{' '}
                        {new Date(activeAssignment.submitted_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </Text>
                    ) : (
                      <Text style={submissionStyles.bodyText}>Not submitted yet</Text>
                    )}
                    {studentSubmissionText ? (
                      <Text style={[submissionStyles.bodyText, { marginTop: 8 }]}>
                        {studentSubmissionText}
                      </Text>
                    ) : null}
                    {submittedLink ? (
                      <TouchableOpacity
                        onPress={() => {
                          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                            window.open(submittedLink, '_blank', 'noopener,noreferrer');
                          }
                        }}
                        style={submissionStyles.linkRow}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Link size={14} color="#2563EB" />
                        <Text style={submissionStyles.linkText} numberOfLines={2}>{submittedLink}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {quizAnswerRows.length > 0 ? (
                      <View style={submissionStyles.quizBlock}>
                        {quizAnswerRows.map((row, index) => (
                          <View key={row.id} style={submissionStyles.quizRow}>
                            <Text style={submissionStyles.quizPrompt}>
                              {index + 1}. {row.prompt}
                            </Text>
                            <Text style={submissionStyles.quizAnswer}>
                              {row.answer || '—'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                    {attachments.length > 0 ? (
                      <View style={submissionStyles.attachmentList}>
                        {attachments.map((file) => (
                          <TouchableOpacity
                            key={file.id}
                            onPress={() => openAttachment(file)}
                            style={submissionStyles.attachmentRow}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={submissionStyles.attachmentLine}>
                              {String(file.title || file.storage_path || 'Attachment')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.assignmentPanelFormGroup}>
                    <SectionHeading>Assignment comments</SectionHeading>
                    <AssignmentCommentsPanel
                      assignmentId={activeAssignment?.id}
                      assignment={activeAssignment}
                      isParentViewer
                    />
                  </View>
                </ScrollView>
              </View>
            </View>

            <View style={styles.assignmentFormColumnSide}>
              <View style={styles.assignmentSidePanel}>
                <SectionHeading>Review</SectionHeading>
                <View style={styles.assignmentSideFields}>
                  {childPickerMembers.length > 1 ? (
                    <FamilyMemberPicker
                      familyMembers={childPickerMembers}
                      selectedIds={selectedChildId ? [selectedChildId] : []}
                      onChange={(ids) => {
                        const next = ids.length ? String(ids[ids.length - 1]) : null;
                        setSelectedChildId(next);
                      }}
                      label="Student"
                      required={false}
                    />
                  ) : null}

                  {workSpec?.graded !== false ? (
                    <View style={styles.assignmentPanelFormGroup}>
                      <Text style={styles.fieldLabel}>Grade</Text>
                      <View style={submissionStyles.gradeRow}>
                        <TextInput
                          style={[styles.fieldInput, submissionStyles.gradeInput]}
                          value={gradeDisplay}
                          onChangeText={setGradeDisplay}
                          placeholder="A, Pass, etc."
                          placeholderTextColor={PLACEHOLDER}
                        />
                        <TextInput
                          style={[styles.fieldInput, submissionStyles.gradeInputPercent]}
                          value={gradeValue}
                          onChangeText={setGradeValue}
                          placeholder="%"
                          placeholderTextColor={PLACEHOLDER}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.assignmentPanelFormGroup}>
                    <Text style={styles.fieldLabel}>Marked-up file (optional)</Text>
                    <TouchableOpacity
                      style={submissionStyles.markupUploadButton}
                      onPress={pickMarkedUpFile}
                      disabled={uploadingMarkup || submitting}
                      {...(Platform.OS === 'web' && { cursor: uploadingMarkup || submitting ? 'default' : 'pointer' })}
                    >
                      {uploadingMarkup ? (
                        <ActivityIndicator size="small" color="#64748B" />
                      ) : (
                        <>
                          <Upload size={14} color="#64748B" />
                          <Text style={submissionStyles.markupUploadText}>Attach marked-up file</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    {markupError ? <Text style={submissionStyles.markupError}>{markupError}</Text> : null}
                    {reviewAttachments.length > 0 ? (
                      <View style={submissionStyles.markupList}>
                        {reviewAttachments.map((file) => (
                          <TouchableOpacity
                            key={file.id}
                            onPress={() => openAttachment(file)}
                            style={submissionStyles.markupRow}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Paperclip size={14} color="#64748B" />
                            <Text style={submissionStyles.attachmentLine}>
                              {String(file.title || file.storage_path || 'Marked-up file')}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.assignmentPanelFormGroup}>
                    <Text style={styles.fieldLabel}>Review feedback</Text>
                    <TextInput
                      style={[styles.fieldInput, submissionStyles.feedbackInput]}
                      value={feedback}
                      onChangeText={setFeedback}
                      placeholder="Feedback for the student…"
                      placeholderTextColor={PLACEHOLDER}
                      multiline
                      numberOfLines={5}
                      textAlignVertical="top"
                    />
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
      </CreateModalShell>
    </Modal>
  );
}

const submissionStyles = {
  assignmentTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  statusMeta: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#1E293B',
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
  attachmentList: {
    marginTop: 10,
    gap: 4,
  },
  attachmentRow: {
    paddingVertical: 4,
  },
  attachmentLine: {
    fontSize: 13,
    color: '#334155',
  },
  gradeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gradeInput: {
    flex: 1,
  },
  gradeInputPercent: {
    maxWidth: 88,
    flexGrow: 0,
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
    marginTop: 6,
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
    minHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
};
