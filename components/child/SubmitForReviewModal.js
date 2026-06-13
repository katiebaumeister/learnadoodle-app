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
import {
  extractQuizAnswers,
  extractStudentSubmissionText,
  formatQuizAnswersBlock,
  parseWorkSpec,
  resolveQuizAnswerRows,
  resolveStudentSubmissionModes,
} from '../../lib/workEventHelpers';
import { getAssignmentLifecycleLabel } from '../../lib/assignmentLifecycle';
import { logActivityFromAssignment } from '../../lib/services/assignmentActivityClient';
import { ACTIVITY_TYPE } from '../../lib/assignmentLifecycle';
import AssignmentCommentsPanel from '../assignments/AssignmentCommentsPanel';

const STUDENT_TABS = [
  { id: 'instructions', label: 'Instructions' },
  { id: 'work', label: 'My Work' },
  { id: 'comments', label: 'Comments' },
];

const VIEWER_TABS = [
  { id: 'instructions', label: 'Instructions' },
  { id: 'work', label: 'Submission' },
  { id: 'comments', label: 'Comments' },
];

function formatContextLine(startTs, endTs) {
  if (!startTs) return null;
  const start = new Date(startTs);
  if (Number.isNaN(start.getTime())) return null;
  const datePart = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const isUntimedMidnightBounded = (() => {
    if (!startsAtMidnight || !endTs) return false;
    const end = new Date(endTs);
    if (Number.isNaN(end.getTime())) return false;
    const endsAtMidnight = end.getHours() === 0 && end.getMinutes() === 0;
    const endsAtEndOfDay = end.getHours() === 23 && end.getMinutes() === 59;
    return endsAtMidnight || endsAtEndOfDay;
  })();
  if (isUntimedMidnightBounded) return datePart;
  const fmtTime = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  const startT = fmtTime(start);
  if (endTs) {
    const end = new Date(endTs);
    if (!Number.isNaN(end.getTime())) return `${datePart} • ${startT}-${fmtTime(end)}`;
  }
  return `${datePart} • ${startT}`;
}

function appendSubmissionNote(existingDescription, note, linkUrl = null) {
  const parts = [];
  const trimmed = (note || '').trim();
  if (trimmed) parts.push(`[Submission from student]\n${trimmed}`);
  const link = String(linkUrl || '').trim();
  if (link) parts.push(`[Link submission]\n${link}`);
  if (parts.length === 0) return String(existingDescription || '').trim() || null;
  const block = parts.join('\n\n');
  const prev = String(existingDescription || '').trim();
  return prev ? `${prev}\n\n${block}` : block;
}

function mergeSubmissionDescription(currentDescription, { note, linkUrl, quizAnswersById }) {
  let desc = String(currentDescription || '').trim();
  if (desc.includes('[Quiz answers]')) {
    const afterMarker = desc.split('[Quiz answers]')[1] || '';
    const trailing = afterMarker.includes('\n\n[')
      ? afterMarker
        .split('\n\n[')
        .slice(1)
        .map((part) => `[${part}`)
        .join('\n\n[')
        .trim()
      : '';
    const before = desc.split('[Quiz answers]')[0].trim();
    desc = [before, trailing].filter(Boolean).join('\n\n');
  }
  const quizBlock = formatQuizAnswersBlock(quizAnswersById);
  if (quizBlock) {
    desc = desc ? `${desc}\n\n${quizBlock}` : quizBlock;
  }
  if (String(note || '').trim() || String(linkUrl || '').trim()) {
    desc = appendSubmissionNote(desc, note, linkUrl);
  }
  return desc || null;
}

function formatDateYmd(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const needle = String(columnName || '').toLowerCase();
  if (!msg || !needle) return false;
  return msg.includes(needle) && (msg.includes('column') || msg.includes('schema cache') || msg.includes('select'));
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
        ? 'Complete'
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
  const [linkUrl, setLinkUrl] = useState('');
  const [quizAnswers, setQuizAnswers] = useState({});
  const [sending, setSending] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState(null);
  const [attachment, setAttachment] = useState(null); // {id, name}
  const [reviewSnapshot, setReviewSnapshot] = useState(null);
  const [linkedEventRow, setLinkedEventRow] = useState(null);
  const [subjectName, setSubjectName] = useState(null);
  const [reviewMarkupFiles, setReviewMarkupFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('instructions');
  const [resourceMaterials, setResourceMaterials] = useState([]);

  useEffect(() => {
    if (!visible) return;
    setNote('');
    setLinkUrl('');
    setQuizAnswers({});
    setError(null);
    setUploadingAttachment(false);
    setAttachment(null);
    setReviewSnapshot(null);
    setLinkedEventRow(null);
    setSubjectName(null);
    setReviewMarkupFiles([]);
    setActiveTab('instructions');
    setResourceMaterials([]);
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

  const resolvedEvent = eventContext || linkedEventRow;
  const eventType = resolvedEvent?.event_type || 'Assignment';
  const workSpec = useMemo(
    () => parseWorkSpec(resolvedEvent?.work_spec, eventType),
    [resolvedEvent?.work_spec, eventType]
  );
  const submissionModes = useMemo(
    () => resolveStudentSubmissionModes(workSpec, eventType),
    [workSpec, eventType]
  );
  const parentInstructions = String(workSpec?.instructions || '').trim();
  const assignmentDesc = String(assignment?.description || '').trim();
  const instructions = parentInstructions
    || (assignmentDesc.includes('[Submission from student]') || assignmentDesc.includes('[Link submission]')
      ? ''
      : assignmentDesc);
  const startWorkByLabel = formatDateYmd(assignment?.start_work_by);
  const dueDateLabel = useMemo(() => {
    if (resolvedEvent?.start_ts) return formatDateYmd(resolvedEvent.start_ts);
    return formatDateYmd(assignment?.due_date);
  }, [resolvedEvent?.start_ts, assignment?.due_date]);
  const statusLabel = getAssignmentLifecycleLabel(assignment);
  const submitCtaLabel = submissionModes.parentCheckoff && !submissionModes.text && !submissionModes.file && !submissionModes.photo && !submissionModes.link && !submissionModes.quiz
    ? 'Mark ready for parent review'
    : 'Submit';
  const assignmentTabs = viewOnly ? VIEWER_TABS : STUDENT_TABS;
  const studentSubmissionText = extractStudentSubmissionText(assignment?.description);
  const quizAnswerRows = useMemo(
    () => resolveQuizAnswerRows(workSpec, assignment?.description),
    [workSpec, assignment?.description]
  );

  useEffect(() => {
    if (!visible) return;
    setQuizAnswers(extractQuizAnswers(assignment?.description));
  }, [visible, assignment?.id, assignment?.description]);

  useEffect(() => {
    let cancelled = false;
    const loadReviewMarkup = async () => {
      if (!visible || !assignment?.id) {
        if (!cancelled) setReviewMarkupFiles([]);
        return;
      }
      const rawIds = assignment?.linked_review_attachment_ids;
      const ids = Array.isArray(rawIds) ? rawIds.map(String).filter(Boolean) : [];
      if (ids.length === 0) {
        if (!cancelled) setReviewMarkupFiles([]);
        return;
      }
      try {
        const { data, error: matErr } = await supabase
          .from('materials')
          .select('id, title, provider_url, url')
          .in('id', ids);
        if (cancelled || matErr) return;
        setReviewMarkupFiles(data || []);
      } catch (_) {
        if (!cancelled) setReviewMarkupFiles([]);
      }
    };
    loadReviewMarkup();
    return () => {
      cancelled = true;
    };
  }, [visible, assignment?.id, assignment?.linked_review_attachment_ids]);

  useEffect(() => {
    if (!visible || viewOnly || activeTab !== 'work' || !assignment?.id) return;
    const status = String(assignment.status || '').toLowerCase();
    if (status !== 'assigned' && status !== 'not_started') return;
    updateAssignment(assignment.id, { status: 'in_progress' }).catch(() => {});
  }, [visible, viewOnly, activeTab, assignment?.id, assignment?.status]);

  useEffect(() => {
    let cancelled = false;
    const loadResources = async () => {
      if (!visible) return;
      const eventRow = eventContext || linkedEventRow;
      const rawIds = eventRow?.materials_attachment_ids;
      const ids = Array.isArray(rawIds) ? rawIds.map(String).filter(Boolean) : [];
      if (ids.length === 0) {
        if (!cancelled) setResourceMaterials([]);
        return;
      }
      try {
        const { data } = await supabase
          .from('materials')
          .select('id, title, provider_url, url')
          .in('id', ids);
        if (!cancelled) setResourceMaterials(data || []);
      } catch (_) {
        if (!cancelled) setResourceMaterials([]);
      }
    };
    loadResources();
    return () => { cancelled = true; };
  }, [visible, eventContext, linkedEventRow?.materials_attachment_ids]);

  useEffect(() => {
    let cancelled = false;
    const loadEventBrief = async () => {
      if (!visible) return;
      const ctx = eventContext || null;
      if (ctx?.work_spec != null || ctx?.id) {
        if (!cancelled) setLinkedEventRow(ctx);
        if (ctx?.subject_id) {
          const { data } = await supabase.from('subjects').select('name').eq('id', ctx.subject_id).maybeSingle();
          if (!cancelled) setSubjectName(data?.name || null);
        }
        return;
      }
      if (!linkedEventId || !isUuid(linkedEventId)) return;
      try {
        const { data, error: evErr } = await supabase
          .from('events')
          .select('id, title, event_type, work_spec, start_ts, end_ts, subject_id, description, materials_attachment_ids')
          .eq('id', linkedEventId)
          .maybeSingle();
        if (cancelled || evErr) return;
        setLinkedEventRow(data || null);
        if (data?.subject_id) {
          const { data: subRow } = await supabase
            .from('subjects')
            .select('name')
            .eq('id', data.subject_id)
            .maybeSingle();
          if (!cancelled) setSubjectName(subRow?.name || null);
        }
      } catch (_) {
        if (!cancelled) setLinkedEventRow(null);
      }
    };
    loadEventBrief();
    return () => {
      cancelled = true;
    };
  }, [visible, eventContext, linkedEventId]);
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
          let { data, error } = await supabase
            .from('events')
            .select('id, grade, percent_of_total_grade')
            .eq('id', linkedEventId)
            .maybeSingle();
          if (error && isMissingColumnError(error, 'percent_of_total_grade')) {
            const fallback = await supabase
              .from('events')
              .select('id, grade')
              .eq('id', linkedEventId)
              .maybeSingle();
            data = fallback.data;
            error = fallback.error;
          }
          eventGrade = error ? null : (data || null);
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

  const pickAttachment = async ({ photoOnly = false } = {}) => {
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
    input.accept = photoOnly ? 'image/*' : '*/*';
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

    const noteBlock = note.trim();
    const linkBlock = linkUrl.trim();
    const needsText = submissionModes.text && !submissionModes.parentCheckoff;
    const needsFile = submissionModes.file;
    const needsPhoto = submissionModes.photo;
    const needsLink = submissionModes.link;
    const needsQuiz = submissionModes.quiz;
    const needsAttachment = needsFile || needsPhoto;

    const offlineOnly =
      submissionModes.parentCheckoff &&
      !submissionModes.text &&
      !submissionModes.file &&
      !submissionModes.photo &&
      !submissionModes.link &&
      !submissionModes.quiz;

    if (needsQuiz) {
      for (let i = 0; i < submissionModes.quizQuestions.length; i += 1) {
        const q = submissionModes.quizQuestions[i];
        if (!String(quizAnswers[q.id] || '').trim()) {
          setError(`Answer question ${i + 1} before submitting.`);
          return;
        }
      }
    }

    if (!offlineOnly && !needsQuiz) {
      if (needsText && !noteBlock && !needsAttachment && !needsLink) {
        setError('Add your response before submitting.');
        return;
      }
      if (needsLink && !linkBlock && !noteBlock && !attachment?.id) {
        setError('Paste a link before submitting.');
        return;
      }
      if (needsAttachment && !attachment?.id && !noteBlock && !linkBlock) {
        setError(needsPhoto ? 'Upload a photo before submitting.' : 'Upload a file before submitting.');
        return;
      }
    }

    setSending(true);
    setError(null);

    try {
      const nowIso = new Date().toISOString();
      const evidenceIds = attachment?.id ? [String(attachment.id)] : [];
      const buildDescription = (currentDescription) => {
        if (offlineOnly && !noteBlock && !linkBlock) return currentDescription;
        return mergeSubmissionDescription(currentDescription, {
          note: noteBlock,
          linkUrl: linkBlock,
          quizAnswersById: needsQuiz ? quizAnswers : null,
        });
      };

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
          description: buildDescription(currentRow?.description),
        };
        if (evidenceIds.length > 0) {
          updates.linked_evidence_ids = mergedEvidence;
        }
        const { error: upErr } = await updateAssignment(assignment.id, updates);
        if (upErr) throw upErr;
        await logActivityFromAssignment(
          { ...assignment, ...updates, status: 'submitted' },
          ACTIVITY_TYPE.SUBMITTED,
        );
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
            description: buildDescription(linked?.description),
          });
          if (upErr) throw upErr;
          await logActivityFromAssignment(
            { ...linked, status: 'submitted', submitted_at: nowIso },
            ACTIVITY_TYPE.SUBMITTED,
          );
        } else {
          const { error: insErr } = await createAssignment({
            family_id: familyId,
            child_id: childId,
            title: `Submission: ${eventContext.title || 'Schoolwork'}`.slice(0, 200),
            description: buildDescription(''),
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
            {subjectName ? <Text style={styles.contextMeta}>{subjectName}</Text> : null}
            {contextSubtitle ? <Text style={styles.contextWhen}>{contextSubtitle}</Text> : null}
            {dueDateLabel ? <Text style={styles.contextWhen}>Due {dueDateLabel}</Text> : null}
            {startWorkByLabel ? (
              <Text style={styles.contextWhen}>Start work by {startWorkByLabel}</Text>
            ) : null}
            {!viewOnly && statusLabel ? (
              <View style={styles.statusPill}>
                <Text style={styles.statusPillText}>{statusLabel}</Text>
              </View>
            ) : null}

            <View style={styles.tabBar}>
              {assignmentTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    style={[styles.tabChip, isActive && styles.tabChipActive]}
                    onPress={() => setActiveTab(tab.id)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={[styles.tabChipText, isActive && styles.tabChipTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {activeTab === 'instructions' ? (
              <>
                {instructions ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Instructions</Text>
                    <Text style={styles.instructionsText}>{instructions}</Text>
                  </>
                ) : (
                  <Text style={styles.instructionsText}>No instructions provided.</Text>
                )}

                {resourceMaterials.length > 0 ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Resources</Text>
                    {resourceMaterials.map((mat) => (
                      <TouchableOpacity
                        key={mat.id}
                        onPress={() => {
                          const url = String(mat.provider_url || mat.url || '').trim();
                          if (url && Platform.OS === 'web' && typeof window !== 'undefined') {
                            window.open(url, '_blank', 'noopener,noreferrer');
                          }
                        }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.markupLink}>{mat.title || 'Resource'}</Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}

                {(assignment?.max_score != null || assignment?.rubric_id || workSpec?.points_possible) ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Points</Text>
                    <Text style={styles.instructionsText}>
                      {workSpec?.points_possible
                        ? `${workSpec.points_possible} points possible`
                        : assignment?.max_score != null
                          ? `${assignment.max_score} points possible`
                          : 'Graded with rubric'}
                    </Text>
                  </>
                ) : null}

                {submissionHistoryLines.length > 0 ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>History</Text>
                    <View style={styles.historyBox}>
                      {submissionHistoryLines.map((line, idx) => (
                        <Text key={`submission-history-${idx}`} style={styles.historyText}>
                          {line}
                        </Text>
                      ))}
                    </View>
                  </>
                ) : null}

                {reviewMarkupFiles.length > 0 ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Marked-up files from parent</Text>
                    <View style={styles.historyBox}>
                      {reviewMarkupFiles.map((file) => (
                        <TouchableOpacity
                          key={file.id}
                          onPress={() => {
                            const url = String(file.provider_url || file.url || '').trim();
                            if (url && Platform.OS === 'web' && typeof window !== 'undefined') {
                              window.open(url, '_blank', 'noopener,noreferrer');
                            }
                          }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.markupLink}>{file.title || 'Marked-up file'}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : null}

                {String(reviewSnapshot?.review_feedback || assignment?.review_feedback || '').trim() ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Parent feedback</Text>
                    <Text style={styles.instructionsText}>
                      {String(reviewSnapshot?.review_feedback || assignment?.review_feedback || '').trim()}
                    </Text>
                  </>
                ) : null}
              </>
            ) : null}

            {activeTab === 'comments' ? (
              <AssignmentCommentsPanel
                assignmentId={assignment?.id}
                assignment={assignment}
                isParentViewer={viewOnly}
                readOnly={viewOnly && !assignment?.id}
              />
            ) : null}

            {activeTab === 'work' && viewOnly ? (
              <>
                {!assignment?.submitted_at && !studentSubmissionText && quizAnswerRows.every((r) => !r.answer) ? (
                  <Text style={styles.instructionsText}>Not submitted yet.</Text>
                ) : null}
                {assignment?.submitted_at ? (
                  <Text style={styles.contextWhen}>
                    Submitted {formatWhenShort(assignment.submitted_at)}
                  </Text>
                ) : null}
                {studentSubmissionText ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Student response</Text>
                    <Text style={styles.instructionsText}>{studentSubmissionText}</Text>
                  </>
                ) : null}
                {quizAnswerRows.length > 0 ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Quiz answers</Text>
                    {quizAnswerRows.map((row, index) => (
                      <View key={row.id} style={styles.quizField}>
                        <Text style={styles.quizPrompt}>
                          {index + 1}. {row.prompt}
                        </Text>
                        <Text style={styles.instructionsText}>{row.answer || '—'}</Text>
                      </View>
                    ))}
                  </>
                ) : null}
                {String(reviewSnapshot?.review_feedback || assignment?.review_feedback || '').trim() ? (
                  <>
                    <Text style={[styles.sectionLabel, { marginTop: 14 }]}>Your feedback</Text>
                    <Text style={styles.instructionsText}>
                      {String(reviewSnapshot?.review_feedback || assignment?.review_feedback || '').trim()}
                    </Text>
                  </>
                ) : null}
              </>
            ) : null}

            {activeTab === 'work' && !viewOnly ? (
              <>
            {!submissionModes.quiz && !submissionModes.text && !submissionModes.file
              && !submissionModes.photo && !submissionModes.link && !submissionModes.parentCheckoff ? (
              <Text style={styles.instructionsText}>No submission required for this assignment.</Text>
            ) : null}
            {submissionModes.quiz ? (
              <>
                <Text style={styles.sectionLabel}>Questions</Text>
                {submissionModes.quizQuestions.map((q, index) => (
                  <View key={q.id} style={styles.quizField}>
                    <Text style={styles.quizPrompt}>
                      {index + 1}. {q.prompt || `Question ${index + 1}`}
                    </Text>
                    {q.question_type === 'multiple_choice' && Array.isArray(q.options) && q.options.length > 0 ? (
                      <View style={styles.quizOptions}>
                        {q.options.map((option) => {
                          const selected = String(quizAnswers[q.id] || '') === String(option.id);
                          return (
                            <TouchableOpacity
                              key={option.id}
                              style={[styles.quizOptionRow, selected && styles.quizOptionRowSelected]}
                              onPress={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: option.id }))}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <View style={[styles.quizOptionRadio, selected && styles.quizOptionRadioSelected]}>
                                {selected ? <View style={styles.quizOptionRadioInner} /> : null}
                              </View>
                              <Text style={styles.quizOptionText}>{option.text || 'Option'}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <TextInput
                        style={styles.input}
                        placeholder="Your answer"
                        placeholderTextColor={colors.muted}
                        value={String(quizAnswers[q.id] || '')}
                        onChangeText={(text) => setQuizAnswers((prev) => ({ ...prev, [q.id]: text }))}
                        multiline
                        textAlignVertical="top"
                      />
                    )}
                  </View>
                ))}
              </>
            ) : null}

            {!viewOnly && submissionModes.text ? (
              <>
                <Text style={styles.sectionLabel}>
                  {submissionModes.parentCheckoff ? 'Notes (optional)' : 'Your response'}
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    submissionModes.responseFormat === 'long' && styles.inputLong,
                  ]}
                  placeholder={
                    submissionModes.responseFormat === 'long'
                      ? 'Write your response…'
                      : 'Type your answer or notes...'
                  }
                  placeholderTextColor={colors.muted}
                  value={note}
                  onChangeText={setNote}
                  multiline
                  textAlignVertical="top"
                />
              </>
            ) : null}

            {!viewOnly && submissionModes.link ? (
              <>
                <Text style={styles.sectionLabel}>Link</Text>
                <TextInput
                  style={styles.linkInput}
                  placeholder="https://..."
                  placeholderTextColor={colors.muted}
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            ) : null}

            {!viewOnly && submissionModes.file ? (
              <>
                <Text style={styles.sectionLabel}>Upload file</Text>
                <TouchableOpacity
                  style={[styles.uploadButton, uploadingAttachment && styles.uploadButtonDisabled]}
                  onPress={() => pickAttachment({ photoOnly: false })}
                  disabled={uploadingAttachment || sending}
                  {...(Platform.OS === 'web' && { cursor: uploadingAttachment || sending ? 'not-allowed' : 'pointer' })}
                >
                  {uploadingAttachment ? (
                    <ActivityIndicator size="small" color="#5B6880" />
                  ) : (
                    <View style={styles.uploadRow}>
                      <View style={styles.uploadIconWrap}>
                        {attachment?.id ? <Paperclip size={12} color="#5B6880" /> : <Upload size={12} color="#5B6880" />}
                      </View>
                      <Text style={styles.uploadText}>
                        {attachment?.name ? attachment.name : 'Choose file'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            ) : null}

            {!viewOnly && submissionModes.photo ? (
              <>
                <Text style={styles.sectionLabel}>Upload photo</Text>
                <TouchableOpacity
                  style={[styles.uploadButton, uploadingAttachment && styles.uploadButtonDisabled]}
                  onPress={() => pickAttachment({ photoOnly: true })}
                  disabled={uploadingAttachment || sending}
                  {...(Platform.OS === 'web' && { cursor: uploadingAttachment || sending ? 'not-allowed' : 'pointer' })}
                >
                  {uploadingAttachment ? (
                    <ActivityIndicator size="small" color="#5B6880" />
                  ) : (
                    <View style={styles.uploadRow}>
                      <View style={styles.uploadIconWrap}>
                        {attachment?.id ? <Paperclip size={12} color="#5B6880" /> : <Upload size={12} color="#5B6880" />}
                      </View>
                      <Text style={styles.uploadText}>
                        {attachment?.name ? attachment.name : 'Choose photo'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              </>
            ) : null}

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
                    <Text style={styles.ctaText}>{viewOnly ? 'Close' : submitCtaLabel}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
              </>
            ) : null}
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
  contextMeta: {
    marginTop: 4,
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
    marginBottom: 4,
  },
  tabChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  tabChipActive: {
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
  },
  tabChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabChipTextActive: {
    color: '#4338CA',
  },
  instructionsText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  linkInput: {
    borderWidth: 1,
    borderColor: '#D6DCE8',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  quizField: {
    marginBottom: 10,
    gap: 6,
  },
  quizPrompt: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    lineHeight: 20,
  },
  quizOptions: {
    gap: 8,
  },
  quizOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  quizOptionRowSelected: {
    borderColor: '#9ECFFB',
    backgroundColor: 'rgba(158, 207, 251, 0.12)',
  },
  quizOptionRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizOptionRadioSelected: {
    borderColor: '#6BB3E8',
  },
  quizOptionRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6BB3E8',
  },
  quizOptionText: {
    flex: 1,
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  markupLink: {
    fontSize: 13,
    color: '#2563EB',
    textDecorationLine: 'underline',
    marginBottom: 4,
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
  inputLong: {
    minHeight: 180,
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
