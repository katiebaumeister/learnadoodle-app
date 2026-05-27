import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { X, Send, Paperclip, Upload } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createAssignment, updateAssignment } from '../../lib/services/assignmentsClient';
import { createFileMaterial } from '../../lib/services/materialsClient';
import { colors } from '../../theme/colors';
import { assignmentRowLinksEventId } from '../../lib/assignmentLinkedEventUtils';

function formatContextLine(startTs, endTs) {
  if (!startTs) return null;
  const start = new Date(startTs);
  if (Number.isNaN(start.getTime())) return null;
  const datePart = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const fmtTime = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const startT = fmtTime(start);
  if (endTs) {
    const end = new Date(endTs);
    if (!Number.isNaN(end.getTime())) return `${datePart} • ${startT}-${fmtTime(end)}`;
  }
  return `${datePart} • ${startT}`;
}

function appendSubmissionNote(existingDescription, note) {
  const block = `[Submission from student]\n${(note || '').trim()}`.trim();
  const prev = String(existingDescription || '').trim();
  return prev ? `${prev}\n\n${block}` : block;
}

function formatWhenShort(value) {
  if (!value) return 'recently';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'recently';
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function linkedEventIdFromSources(assignment, eventContext) {
  const raw = assignment?.linked_event_ids;
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
    } catch (_) {
      return eventContext?.id ? String(eventContext.id) : null;
    }
  }
  return eventContext?.id ? String(eventContext.id) : null;
}

function isUuid(value) {
  const v = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function extractSubmissionHistoryLines(assignment, reviewSnapshot = null) {
  const lines = [];
  const submittedTs = assignment?.submitted_at || assignment?.updated_at || assignment?.created_at || null;
  if (submittedTs) {
    lines.push(`Submitted on ${formatWhenShort(submittedTs)}`);
  }
  const reviewStatus = String(reviewSnapshot?.review_status || assignment?.review_status || '').trim().toLowerCase();
  const reviewedAt = reviewSnapshot?.reviewed_at || assignment?.reviewed_at || null;
  if (reviewStatus) {
    const reviewLabel =
      reviewStatus === 'approved'
        ? 'Approved'
        : reviewStatus === 'needs_revision'
          ? 'Needs changes'
          : 'Reviewed';
    lines.push(`${reviewLabel}${reviewedAt ? ` on ${formatWhenShort(reviewedAt)}` : ''}`);
  }
  const gradeLabel = String(reviewSnapshot?.grade || '').trim();
  const percentLabel =
    reviewSnapshot?.percent_of_total_grade != null && reviewSnapshot?.percent_of_total_grade !== ''
      ? String(reviewSnapshot.percent_of_total_grade).trim()
      : '';
  if (gradeLabel || percentLabel) {
    const gradeParts = [];
    if (gradeLabel) gradeParts.push(gradeLabel);
    if (percentLabel) gradeParts.push(`${percentLabel}%`);
    lines.push(`Grade: ${gradeParts.join(' · ')}`);
  }
  const reviewFeedback = String(reviewSnapshot?.review_feedback || assignment?.review_feedback || '').trim();
  if (reviewFeedback) {
    lines.push(`Parent feedback: "${reviewFeedback}"`);
  }
  const desc = String(assignment?.description || '');
  if (desc.includes('[Submission from student]')) {
    const blocks = desc
      .split('[Submission from student]')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    blocks.forEach((block) => {
      const singleLine = block.replace(/\s+/g, ' ').trim();
      if (!singleLine) return;
      lines.push(`Student note: "${singleLine}"`);
    });
  }
  return lines;
}

export default function SubmitForReviewModal({
  visible,
  onClose,
  onSubmitted,
  familyId,
  childId,
  assignment = null,
  eventContext = null,
  viewOnly = false,
}) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState(null);
  const [attachment, setAttachment] = useState(null); // {id, name}
  const [reviewSnapshot, setReviewSnapshot] = useState(null);

  useEffect(() => {
    if (!visible) return;
    setNote('');
    setError(null);
    setUploadingAttachment(false);
    setAttachment(null);
    setReviewSnapshot(null);
  }, [visible, assignment?.id, eventContext?.id]);

  const contextSubtitle = useMemo(() => {
    if (eventContext?.start_ts) return formatContextLine(eventContext.start_ts, eventContext.end_ts);
    if (assignment?.due_date) {
      const d = new Date(assignment.due_date);
      if (!Number.isNaN(d.getTime())) {
        return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      }
    }
    return null;
  }, [eventContext?.start_ts, eventContext?.end_ts, assignment?.due_date]);

  const titleRef = assignment?.title || eventContext?.title || 'this work';
  const linkedEventId = useMemo(
    () => linkedEventIdFromSources(assignment, eventContext),
    [assignment?.linked_event_ids, eventContext?.id]
  );
  useEffect(() => {
    let cancelled = false;
    const loadReviewSnapshot = async () => {
      if (!visible) return;
      try {
        let assignmentReview = null;
        if (assignment?.id) {
          const { data } = await supabase
            .from('assignments')
            .select('id, review_status, review_feedback, reviewed_at')
            .eq('id', assignment.id)
            .maybeSingle();
          assignmentReview = data || null;
        }
        let eventGrade = null;
        if (linkedEventId && isUuid(linkedEventId)) {
          const { data } = await supabase
            .from('events')
            .select('id, grade, percent_of_total_grade')
            .eq('id', linkedEventId)
            .maybeSingle();
          eventGrade = data || null;
        }
        if (cancelled) return;
        setReviewSnapshot({
          review_status: assignmentReview?.review_status || null,
          review_feedback: assignmentReview?.review_feedback || null,
          reviewed_at: assignmentReview?.reviewed_at || null,
          grade: eventGrade?.grade || null,
          percent_of_total_grade: eventGrade?.percent_of_total_grade ?? null,
        });
      } catch (_) {
        if (!cancelled) setReviewSnapshot(null);
      }
    };
    loadReviewSnapshot();
    return () => {
      cancelled = true;
    };
  }, [visible, assignment?.id, linkedEventId]);
  const submissionHistoryLines = useMemo(
    () => extractSubmissionHistoryLines(assignment, reviewSnapshot),
    [
      assignment?.id,
      assignment?.description,
      assignment?.submitted_at,
      assignment?.updated_at,
      assignment?.created_at,
      assignment?.review_status,
      assignment?.review_feedback,
      assignment?.reviewed_at,
      reviewSnapshot?.review_status,
      reviewSnapshot?.review_feedback,
      reviewSnapshot?.reviewed_at,
      reviewSnapshot?.grade,
      reviewSnapshot?.percent_of_total_grade,
    ]
  );

  const pickAttachment = async () => {
    if (Platform.OS !== 'web') {
      Alert.alert('Not available', 'Attachment upload is currently available on web.');
      return;
    }
    if (!familyId || !childId) {
      setError('Missing account context.');
      return;
    }

    setError(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';
    input.onchange = async (e) => {
      const file = e?.target?.files?.[0];
      if (!file) return;
      setUploadingAttachment(true);
      try {
        const ext = String(file.name || '').split('.').pop() || 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const filePath = `${familyId}/${childId}/submissions/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('uploads')
          .upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(filePath);
        const mat = await createFileMaterial({
          familyId,
          childId,
          storagePath: filePath,
          title: file.name || 'Submission attachment',
          mime: file.type || 'application/octet-stream',
          bytes: file.size || 0,
          eventId: eventContext?.id || null,
          url: publicUrl,
        });
        setAttachment({ id: mat?.id, name: file.name || 'Attachment' });
      } catch (e2) {
        setError(e2?.message || 'Could not upload attachment.');
      } finally {
        setUploadingAttachment(false);
      }
    };
    input.click();
  };

  const handleSubmit = async () => {
    if (!familyId || !childId) {
      setError('Missing account context.');
      return;
    }
    setSending(true);
    setError(null);

    try {
      const nowIso = new Date().toISOString();
      const noteBlock = note.trim();
      const evidenceIds = attachment?.id ? [String(attachment.id)] : [];

      if (assignment?.id) {
        const { data: currentRow, error: currentErr } = await supabase
          .from('assignments')
          .select('description, linked_evidence_ids')
          .eq('id', assignment.id)
          .maybeSingle();
        if (currentErr) throw currentErr;
        const currentEvidence = Array.isArray(currentRow?.linked_evidence_ids)
          ? currentRow.linked_evidence_ids.map(String)
          : [];
        const mergedEvidence = Array.from(
          new Set([...currentEvidence, ...evidenceIds])
        );
        const updates = {
          status: 'submitted',
          submitted_at: nowIso,
          review_status: null,
          need_help: false,
          description: noteBlock ? appendSubmissionNote(currentRow?.description, noteBlock) : currentRow?.description,
        };
        if (evidenceIds.length > 0) {
          updates.linked_evidence_ids = mergedEvidence;
        }
        const { error: upErr } = await updateAssignment(assignment.id, updates);
        if (upErr) throw upErr;
        onSubmitted?.();
        onClose?.();
        return;
      }

      if (eventContext?.id) {
        const eventIdStr = String(eventContext.id);
        const { data: rows, error: findErr } = await supabase
          .from('assignments')
          .select('id, title, description, linked_event_ids, linked_evidence_ids')
          .eq('family_id', familyId)
          .eq('child_id', childId)
          .order('updated_at', { ascending: false })
          .limit(200);
        if (findErr) throw findErr;

        const linked = (rows || []).find((r) => assignmentRowLinksEventId(r, eventIdStr)) || null;
        if (linked?.id) {
          const mergedEvidence = Array.from(
            new Set([...(linked?.linked_evidence_ids || []).map(String), ...evidenceIds])
          );
          const { error: upErr } = await updateAssignment(linked.id, {
            status: 'submitted',
            submitted_at: nowIso,
            review_status: null,
            need_help: false,
            linked_evidence_ids: mergedEvidence,
            description: noteBlock ? appendSubmissionNote(linked?.description, noteBlock) : linked?.description,
          });
          if (upErr) throw upErr;
        } else {
          const { error: insErr } = await createAssignment({
            family_id: familyId,
            child_id: childId,
            title: `Submission: ${eventContext.title || 'Schoolwork'}`.slice(0, 200),
            description: noteBlock ? appendSubmissionNote('', noteBlock) : null,
            related_subject: eventContext.subject_id || null,
            due_date: eventContext.start_ts ? new Date(eventContext.start_ts).toISOString().split('T')[0] : null,
            status: 'submitted',
            submitted_at: nowIso,
            review_status: null,
            linked_event_ids: [eventIdStr],
            linked_evidence_ids: evidenceIds,
            need_help: false,
          });
          if (insErr) throw insErr;
        }
        onSubmitted?.();
        onClose?.();
        return;
      }

      setError('Nothing to submit.');
    } catch (e) {
      setError(e?.message || 'Could not submit. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e?.stopPropagation?.()}
          style={styles.sheet}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <X size={20} color={colors.text} />
          </TouchableOpacity>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <Text style={styles.contextTitle} numberOfLines={3}>{titleRef}</Text>
            {contextSubtitle ? <Text style={styles.contextWhen}>{contextSubtitle}</Text> : null}

            <Text style={[styles.sectionLabel, { marginTop: 10 }]}>Add a message</Text>
            {submissionHistoryLines.length > 0 ? (
              <View style={styles.historyBox}>
                {submissionHistoryLines.map((line, idx) => (
                  <Text key={`submission-history-${idx}`} style={styles.historyText}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder={viewOnly ? 'Submission is locked after the saved date.' : 'Optional note for your parent...'}
              placeholderTextColor={colors.muted}
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
              editable={!viewOnly}
            />

            <Text style={styles.sectionLabel}>Optional attachment</Text>
            <TouchableOpacity
              style={[styles.uploadButton, uploadingAttachment && styles.uploadButtonDisabled]}
              onPress={pickAttachment}
              disabled={viewOnly || uploadingAttachment || sending}
              {...(Platform.OS === 'web' && { cursor: viewOnly || uploadingAttachment || sending ? 'not-allowed' : 'pointer' })}
            >
              {uploadingAttachment ? (
                <ActivityIndicator size="small" color="#5B6880" />
              ) : (
                <View style={styles.uploadRow}>
                  <View style={styles.uploadIconWrap}>
                    {attachment?.id ? <Paperclip size={12} color="#5B6880" /> : <Upload size={12} color="#5B6880" />}
                  </View>
                  <Text style={styles.uploadText}>
                    {attachment?.name ? attachment.name : 'Upload file'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {error ? <Text style={styles.err}>{error}</Text> : null}

            <View style={styles.ctaWrap}>
              <TouchableOpacity
                style={[styles.cta, sending && styles.ctaDisabled]}
                onPress={viewOnly ? onClose : handleSubmit}
                disabled={sending || uploadingAttachment}
                {...(Platform.OS === 'web' && { cursor: sending || uploadingAttachment ? 'not-allowed' : 'pointer' })}
              >
                {sending ? (
                  <ActivityIndicator color="#5B6880" />
                ) : (
                  <View style={styles.ctaRow}>
                    {!viewOnly ? (
                      <View style={styles.ctaIconWrap}>
                        <Send size={12} color="#5B6880" />
                      </View>
                    ) : null}
                    <Text style={styles.ctaText}>{viewOnly ? 'Close' : 'Submit for review'}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: '90%',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#D6DCE8',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  scrollContent: {
    paddingTop: 56,
    paddingBottom: 4,
  },
  contextTitle: {
    fontSize: 18,
    lineHeight: 24,
    color: '#1F2937',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  contextWhen: {
    marginTop: 4,
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    color: '#5B6880',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  historyBox: {
    borderWidth: 1,
    borderColor: '#D6DCE8',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 6,
  },
  historyText: {
    fontSize: 12,
    color: '#5B6880',
    lineHeight: 17,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  input: {
    borderWidth: 1,
    borderColor: '#D6DCE8',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    minHeight: 110,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  uploadButton: {
    borderWidth: 1,
    borderColor: '#D6DCE8',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  uploadButtonDisabled: {
    opacity: 0.7,
  },
  uploadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  uploadIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  uploadText: {
    fontSize: 14,
    color: '#5B6880',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  err: {
    marginTop: 10,
    color: '#DC2626',
    fontSize: 13,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ctaWrap: {
    marginTop: 22,
    alignItems: 'center',
  },
  cta: {
    alignSelf: 'center',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D6DCE8',
    backgroundColor: '#FFFFFF',
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  ctaText: {
    fontSize: 14,
    color: '#5B6880',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
