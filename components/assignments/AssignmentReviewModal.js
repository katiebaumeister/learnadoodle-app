/**
 * AssignmentReviewModal — parent submission review (Learnadoodle shell, light blue accents).
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { X, Check, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import RubricScoring from '../rubrics/RubricScoring';
import { descriptionWithoutChildHelpBlocks } from '../../lib/assignmentHelpHistory';
import { LD, shellShadow, fontDisplay } from '../parent/parentModalTheme';

function formatSubmittedSummary(ts) {
  if (!ts) return 'Submitted';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'Submitted';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (day.getTime() === today.getTime()) return 'Submitted today';
  if (day.getTime() === yesterday.getTime()) return 'Submitted yesterday';
  return `Submitted ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function formatSubmittedPrecise(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart} at ${timePart}`;
}

function formatDueShort(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function displayAssignmentTitle(raw) {
  if (!raw || typeof raw !== 'string') return 'Schoolwork';
  const t = raw.replace(/^Help:\s*/i, '').trim();
  return t || 'Schoolwork';
}

function firstUuidInText(value) {
  const text = String(value || '');
  const m = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return m ? String(m[0]) : null;
}

function resolveLinkedEventId(assignment) {
  const raw = assignment?.linked_event_ids;
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
      if (parsed && typeof parsed === 'object' && parsed.id) return String(parsed.id);
    } catch (_) {
      const extracted = firstUuidInText(raw);
      if (extracted) return extracted;
    }
  }
  if (raw && typeof raw === 'object' && raw.id) return String(raw.id);
  if (assignment?.linked_event_id) return String(assignment.linked_event_id);
  if (assignment?.event_id) return String(assignment.event_id);
  const extractedFromAlt = firstUuidInText(assignment?.linked_event_ids_text || assignment?.linked_event_ref);
  if (extractedFromAlt) return extractedFromAlt;
  return null;
}

function isMissingColumnError(error, columnName) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  const needle = String(columnName || '').toLowerCase();
  if (!msg || !needle) return false;
  return msg.includes(needle) && (msg.includes('column') || msg.includes('schema cache') || msg.includes('select'));
}

function extractLatestReviewFeedbackFromNotes(notesValue) {
  const text = String(notesValue || '');
  if (!text) return '';
  const re = /Review (?:feedback|update) \([^)]+\):\s*([^\n]+)/g;
  let match = null;
  let latest = '';
  while ((match = re.exec(text)) !== null) {
    const body = String(match[1] || '').trim();
    const feedbackMatch = body.match(/feedback:\s*(.+)$/i);
    latest = String((feedbackMatch && feedbackMatch[1]) || body).trim();
  }
  return latest;
}

function extractReviewHistoryLinesFromNotes(notesValue) {
  const text = String(notesValue || '');
  if (!text) return [];
  const lines = [];
  const re = /Review (?:feedback|update) \(([^)]+)\):\s*([^\n]+)/g;
  let match = null;
  while ((match = re.exec(text)) !== null) {
    const when = String(match[1] || '').trim();
    const body = String(match[2] || '').trim();
    if (!body) continue;
    lines.push(when ? `${when} — ${body}` : body);
  }
  return lines.reverse();
}

export default function AssignmentReviewModal({
  visible,
  assignment,
  onClose,
  onReviewed,
  submissionReview = true,
}) {
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rubric, setRubric] = useState(null);
  const [showRubricScoring, setShowRubricScoring] = useState(false);
  const [feedbackFocused, setFeedbackFocused] = useState(false);
  const [submissionAttachments, setSubmissionAttachments] = useState([]);
  const [gradeValue, setGradeValue] = useState('');
  const [percentGradeValue, setPercentGradeValue] = useState('');
  const [linkedEventId, setLinkedEventId] = useState(null);
  const [linkedEventNotes, setLinkedEventNotes] = useState('');
  const [reviewHistoryLines, setReviewHistoryLines] = useState([]);

  useEffect(() => {
    loadRubric();
  }, [assignment]);

  useEffect(() => {
    setLinkedEventId(resolveLinkedEventId(assignment));
  }, [assignment?.id, assignment?.linked_event_ids]);

  useEffect(() => {
    let cancelled = false;
    const hydrateLinkedEventFields = async () => {
      if (!assignment) {
        setGradeValue('');
        setPercentGradeValue('');
        setLinkedEventNotes('');
        setFeedback('');
        setReviewHistoryLines([]);
        return;
      }
      try {
        // Always seed feedback from saved assignment review values.
        let { data: assignmentRow, error: assignmentErr } = await supabase
          .from('assignments')
          .select('id, review_feedback, linked_event_ids')
          .eq('id', assignment.id)
          .maybeSingle();
        if (assignmentErr && isMissingColumnError(assignmentErr, 'review_feedback')) {
          const fallback = await supabase
            .from('assignments')
            .select('id, linked_event_ids')
            .eq('id', assignment.id)
            .maybeSingle();
          assignmentRow = fallback.data;
          assignmentErr = fallback.error;
        }
        if (cancelled) return;
        const seedFeedback = String(assignmentRow?.review_feedback || assignment?.review_feedback || '');
        setFeedback(seedFeedback);

        const resolvedEventId =
          resolveLinkedEventId({ ...assignment, linked_event_ids: assignmentRow?.linked_event_ids ?? assignment?.linked_event_ids }) ||
          linkedEventId;
        if (!resolvedEventId) return;

        const { data, error } = await supabase
          .from('events')
          .select('id, grade, percent_of_total_grade, notes')
          .eq('id', resolvedEventId)
          .maybeSingle();
        let eventRow = data;
        let eventErr = error;
        if (eventErr && isMissingColumnError(eventErr, 'percent_of_total_grade')) {
          const fallback = await supabase
            .from('events')
            .select('id, grade, notes')
            .eq('id', resolvedEventId)
            .maybeSingle();
          eventRow = fallback.data;
          eventErr = fallback.error;
        }
        if (cancelled || eventErr || !eventRow) return;
        setLinkedEventId(String(resolvedEventId));
        setGradeValue(String(eventRow?.grade || '').trim());
        setPercentGradeValue(
          eventRow?.percent_of_total_grade != null && eventRow?.percent_of_total_grade !== ''
            ? String(eventRow.percent_of_total_grade)
            : ''
        );
        const hydratedNotes = String(eventRow?.notes || '');
        setLinkedEventNotes(hydratedNotes);
        const parsedHistory = extractReviewHistoryLinesFromNotes(hydratedNotes);
        if (parsedHistory.length > 0) {
          setReviewHistoryLines(parsedHistory);
        } else {
          const seededParts = [];
          const existingGrade = String(eventRow?.grade || '').trim();
          const existingPercent = eventRow?.percent_of_total_grade;
          if (existingGrade) seededParts.push(`Grade: ${existingGrade}`);
          if (existingPercent != null && String(existingPercent).trim() !== '') {
            seededParts.push(`%: ${existingPercent}`);
          }
          const existingFeedback = String(assignmentRow?.review_feedback || assignment?.review_feedback || '').trim();
          if (existingFeedback) seededParts.push(`Feedback: ${existingFeedback}`);
          setReviewHistoryLines(seededParts.length > 0 ? [`Most recent saved review — ${seededParts.join(' · ')}`] : []);
        }
        if (!seedFeedback) {
          const feedbackFromNotes = extractLatestReviewFeedbackFromNotes(eventRow?.notes);
          if (feedbackFromNotes) {
            setFeedback(feedbackFromNotes);
          }
        }
      } catch (_) {
        if (!cancelled) {
          setGradeValue('');
          setPercentGradeValue('');
          setLinkedEventNotes('');
          setFeedback(String(assignment?.review_feedback || ''));
          setReviewHistoryLines([]);
        }
      }
    };
    hydrateLinkedEventFields();
    return () => {
      cancelled = true;
    };
  }, [assignment?.id, linkedEventId]);

  useEffect(() => {
    let cancelled = false;
    const loadSubmissionAttachments = async () => {
      const rawIds = assignment?.linked_evidence_ids;
      const ids = Array.isArray(rawIds)
        ? rawIds.map((id) => String(id)).filter(Boolean)
        : [];
      if (ids.length === 0) {
        setSubmissionAttachments([]);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('materials')
          .select('id, title, provider_url, url, storage_path')
          .in('id', ids);
        if (cancelled || error) return;
        const byId = new Map((data || []).map((row) => [String(row.id), row]));
        const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);
        setSubmissionAttachments(ordered);
      } catch (_) {
        if (!cancelled) setSubmissionAttachments([]);
      }
    };
    loadSubmissionAttachments();
    return () => {
      cancelled = true;
    };
  }, [assignment?.id, assignment?.linked_evidence_ids]);

  const loadRubric = async () => {
    if (!assignment?.rubric_id) {
      setRubric(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('rubrics')
        .select('*')
        .eq('id', assignment.rubric_id)
        .single();

      if (error && error.code !== 'PGRST116') {
      } else if (data) {
        setRubric(data);
      }
    } catch (error) {
    }
  };

  const handleSubmit = async () => {
    if (!assignment) return;

    setSubmitting(true);
    try {
      const reviewStatus = 'approved';
      const cleanedGrade = String(gradeValue || '').trim();
      const cleanedPercent = String(percentGradeValue || '').trim();
      const parsedPercent = cleanedPercent === '' ? null : Number(cleanedPercent);
      const feedbackTrim = String(feedback || '').trim();
      const now = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      let eventPersisted = false;
      let reviewPersisted = false;
      let reviewApiError = null;
      let targetLinkedEventId = linkedEventId || resolveLinkedEventId(assignment);

      // If linked event id was not hydrated yet, resolve directly from DB at submit time.
      if (!targetLinkedEventId) {
        try {
          const { data: assignmentRow } = await supabase
            .from('assignments')
            .select('id, linked_event_ids')
            .eq('id', assignment.id)
            .maybeSingle();
          targetLinkedEventId = resolveLinkedEventId({
            ...assignment,
            linked_event_ids: assignmentRow?.linked_event_ids ?? assignment?.linked_event_ids,
          });
          if (targetLinkedEventId) {
            setLinkedEventId(String(targetLinkedEventId));
          }
        } catch (_) {
          // best effort — review fields can still persist
        }
      }

      // Persist grade + feedback into the linked event regardless of review API success.
      if (targetLinkedEventId) {
        // Always read latest notes before appending review feedback to avoid overwriting
        // when submit happens before hydrateLinkedEventFields has finished.
        let nextNotes = String(linkedEventNotes || '').trim();
        let previousGrade = '';
        let previousPercent = '';
        try {
          let { data: latestEventRow, error: latestEventErr } = await supabase
            .from('events')
            .select('id, grade, percent_of_total_grade, notes')
            .eq('id', targetLinkedEventId)
            .maybeSingle();
          if (latestEventErr && isMissingColumnError(latestEventErr, 'percent_of_total_grade')) {
            const fallback = await supabase
              .from('events')
              .select('id, grade, notes')
              .eq('id', targetLinkedEventId)
              .maybeSingle();
            latestEventRow = fallback.data;
            latestEventErr = fallback.error;
          }
          if (latestEventRow?.notes != null) {
            nextNotes = String(latestEventRow.notes || '').trim();
          }
          previousGrade = String(latestEventRow?.grade || '').trim();
          if (latestEventRow?.percent_of_total_grade != null && String(latestEventRow?.percent_of_total_grade).trim() !== '') {
            previousPercent = String(latestEventRow.percent_of_total_grade).trim();
          }
        } catch (_) {
          // best effort
        }
        const previousParts = [];
        if (previousGrade) previousParts.push(`Grade: ${previousGrade}`);
        if (previousPercent) previousParts.push(`%: ${previousPercent}`);
        const previousFeedback = extractLatestReviewFeedbackFromNotes(nextNotes);
        if (previousFeedback) previousParts.push(`Feedback: ${previousFeedback}`);

        const reviewSummaryParts = [];
        if (cleanedGrade) reviewSummaryParts.push(`Grade: ${cleanedGrade}`);
        if (Number.isFinite(parsedPercent)) reviewSummaryParts.push(`%: ${parsedPercent}`);
        if (feedbackTrim) reviewSummaryParts.push(`Feedback: ${feedbackTrim}`);
        const hasPreviousAndChanged =
          previousParts.length > 0 &&
          previousParts.join(' · ') !== reviewSummaryParts.join(' · ');
        if (hasPreviousAndChanged) {
          const previousLine = `Review update (${now}): Previous values — ${previousParts.join(' · ')}`;
          nextNotes = nextNotes ? `${nextNotes}\n\n${previousLine}` : previousLine;
        }
        if (reviewSummaryParts.length > 0) {
          const reviewLine = `Review update (${now}): ${reviewSummaryParts.join(' · ')}`;
          nextNotes = nextNotes ? `${nextNotes}\n\n${reviewLine}` : reviewLine;
        }
        const eventUpdates = {
          grade: cleanedGrade || null,
          percent_of_total_grade: Number.isFinite(parsedPercent) ? parsedPercent : null,
        };
        if (reviewSummaryParts.length > 0) {
          eventUpdates.notes = nextNotes;
        }
        let { data: eventUpRow, error: eventUpErr } = await supabase
          .from('events')
          .update(eventUpdates)
          .eq('id', targetLinkedEventId)
          .select('id')
          .maybeSingle();
        if (eventUpErr && isMissingColumnError(eventUpErr, 'percent_of_total_grade')) {
          const fallbackUpdates = { ...eventUpdates };
          delete fallbackUpdates.percent_of_total_grade;
          ({ data: eventUpRow, error: eventUpErr } = await supabase
            .from('events')
            .update(fallbackUpdates)
            .eq('id', targetLinkedEventId)
            .select('id')
            .maybeSingle());
        }
        if (!eventUpErr && eventUpRow?.id) {
          eventPersisted = true;
          setLinkedEventNotes(nextNotes);
          setReviewHistoryLines(extractReviewHistoryLinesFromNotes(nextNotes));
        }
      }

      // Persist review fields directly (avoids noisy API 400 on environments
      // where /api/gradebook/assignments/review is not configured consistently).
      const { error: assignmentUpErr } = await supabase
        .from('assignments')
        .update({
          review_status: reviewStatus,
          review_feedback: feedbackTrim || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', assignment.id);
      if (!assignmentUpErr) {
        reviewPersisted = true;
      } else {
        reviewApiError = assignmentUpErr?.message || 'Failed to submit review';
      }

      if (eventPersisted || reviewPersisted) {
        Alert.alert('Success', 'Review submitted successfully!');
        if (onReviewed) {
          onReviewed(assignment.id, {
            feedback: feedbackTrim,
            review_status: reviewStatus,
            grade: cleanedGrade || null,
            percent_of_total_grade: cleanedPercent || null,
          });
        }
        handleClose();
      } else {
        Alert.alert('Error', reviewApiError || 'Failed to submit review');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (submitting) return;
    setFeedback('');
    setFeedbackFocused(false);
    setGradeValue('');
    setPercentGradeValue('');
    setLinkedEventNotes('');
    setLinkedEventId(null);
    setReviewHistoryLines([]);
    onClose();
  };

  const submissionBody =
    submissionReview && assignment?.description
      ? descriptionWithoutChildHelpBlocks(assignment.description)
      : assignment?.description || '';

  const childName = assignment?.child?.first_name || assignment?.child?.name || 'Student';
  const subjectName = String(assignment?.subject?.name || '').trim();
  const percentPlaceholder = subjectName ? `% total ${subjectName} grade` : '% total grade';
  const submittedTs = useMemo(() => {
    if (!assignment) return null;
    return assignment.submitted_at || assignment.updated_at || null;
  }, [assignment]);

  const contextPrimary = useMemo(() => {
    const sum = formatSubmittedSummary(submittedTs);
    return `${childName} · ${sum}`;
  }, [childName, submittedTs]);

  const contextDateLine = useMemo(() => {
    if (!assignment) return null;
    if (assignment.due_date) {
      return formatDueShort(assignment.due_date);
    }
    if (submittedTs) {
      const precise = formatSubmittedPrecise(submittedTs);
      return precise ? `Submitted ${precise}` : null;
    }
    return null;
  }, [assignment, submittedTs]);

  const titleDisplay = displayAssignmentTitle(assignment?.title);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        />
        <View style={styles.modalContent}>
          <TouchableOpacity
            onPress={handleClose}
            style={styles.closeFab}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <X size={20} color={LD.ink} />
          </TouchableOpacity>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.modalTitle}>Review submission</Text>

            <View style={styles.contextCard}>
              <View style={styles.contextCardInner}>
                <Text style={styles.contextMainTitle}>
                  {contextDateLine ? `${titleDisplay} · ${contextDateLine}` : titleDisplay}
                </Text>
                <Text style={styles.contextMetaLine}>{contextPrimary}</Text>
                {submissionReview ? (
                  <>
                    {submissionBody?.trim() ? (
                      <Text style={styles.assignmentDescription}>{submissionBody}</Text>
                    ) : (
                      <Text style={[styles.assignmentDescription, { fontStyle: 'italic' }]}>
                        No written notes were included with this submission.
                      </Text>
                    )}
                    {submissionAttachments.length > 0 ? (
                      <View style={styles.submissionAttachmentList}>
                        {submissionAttachments.map((item) => {
                          const href = item?.provider_url || item?.url || null;
                          const label = item?.title || 'Attachment';
                          return (
                            <TouchableOpacity
                              key={item.id}
                              style={styles.submissionAttachmentRow}
                              onPress={() => {
                                if (Platform.OS === 'web' && href) {
                                  window.open(href, '_blank', 'noopener,noreferrer');
                                }
                              }}
                              disabled={!href}
                              {...(Platform.OS === 'web' && { cursor: href ? 'pointer' : 'default' })}
                            >
                              <FileText size={14} color={LD.blueMuted} />
                              <Text style={styles.submissionAttachmentText} numberOfLines={1}>
                                {label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </>
                ) : (
                  assignment?.description ? (
                    <Text style={[styles.assignmentDescription, { marginTop: 8 }]}>{assignment.description}</Text>
                  ) : null
                )}
              </View>
            </View>
            {reviewHistoryLines.length > 0 ? (
              <View style={styles.reviewHistoryCard}>
                <Text style={styles.reviewHistoryLabel}>Review history</Text>
                {reviewHistoryLines.map((line, idx) => (
                  <Text key={`review-history-${idx}`} style={styles.reviewHistoryLine}>
                    {line}
                  </Text>
                ))}
              </View>
            ) : null}

            {rubric && (
              <View style={styles.sectionRubric}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.labelCalm}>Rubric</Text>
                  <TouchableOpacity
                    style={styles.rubricToggle}
                    onPress={() => setShowRubricScoring(!showRubricScoring)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <FileText size={16} color={LD.blueMuted} />
                    <Text style={styles.rubricToggleText}>
                      {showRubricScoring ? 'Hide' : 'Show'} rubric
                    </Text>
                  </TouchableOpacity>
                </View>
                {showRubricScoring && (
                  <View style={styles.rubricContainer}>
                    <RubricScoring
                      assignment={assignment}
                      rubric={rubric}
                      onSave={() => setShowRubricScoring(false)}
                      onCancel={() => setShowRubricScoring(false)}
                    />
                  </View>
                )}
              </View>
            )}

            <View style={styles.sectionGrades}>
              <Text style={styles.labelCalm}>Grade</Text>
              <View style={styles.gradeFieldsRow}>
                <TextInput
                  style={[styles.gradeInput, styles.gradeInputPrimary]}
                  value={gradeValue}
                  onChangeText={setGradeValue}
                  placeholder="Grade"
                  placeholderTextColor={LD.placeholder}
                />
                <TextInput
                  style={[styles.gradeInput, styles.gradeInputSecondary]}
                  value={percentGradeValue}
                  onChangeText={setPercentGradeValue}
                  placeholder={percentPlaceholder}
                  placeholderTextColor={LD.placeholder}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.sectionFeedback}>
              <Text style={styles.labelCalm}>Feedback for student</Text>
              <TextInput
                style={[
                  styles.feedbackInput,
                  feedbackFocused && styles.feedbackInputFocused,
                  Platform.OS === 'web' && feedbackFocused && styles.feedbackInputFocusedWeb,
                ]}
                value={feedback}
                onChangeText={setFeedback}
                onFocus={() => setFeedbackFocused(true)}
                onBlur={() => setFeedbackFocused(false)}
                placeholder="Explain what to improve or what was done well…"
                placeholderTextColor={LD.placeholder}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[
                  styles.footerPillButton,
                  styles.footerSaveButton,
                  submitting && styles.footerSaveButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitting}
                {...(Platform.OS === 'web' && {
                  cursor: submitting ? 'not-allowed' : 'pointer',
                })}
              >
                <Check size={16} color="#5B6880" />
                <Text style={styles.footerSaveButtonText}>
                  {submitting ? 'Saving…' : 'Save feedback'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxWidth: 680,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: LD.shellBorder,
    overflow: 'hidden',
    position: 'relative',
    ...shellShadow,
  },
  closeFab: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: LD.border,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: LD.ink,
    marginBottom: 14,
    ...fontDisplay('600'),
  },
  contextCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DCE8',
  },
  contextCardInner: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  contextMainTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: LD.ink,
    marginBottom: 8,
    lineHeight: 24,
    ...fontDisplay('600'),
  },
  contextMetaLine: {
    fontSize: 13,
    fontWeight: '400',
    color: LD.muted,
    lineHeight: 19,
    marginTop: 4,
  },
  contextMetaSecondary: {
    fontSize: 12,
    color: LD.mutedLight,
    marginTop: 2,
    lineHeight: 17,
  },
  assignmentDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: LD.muted,
    lineHeight: 21,
    marginTop: 10,
  },
  reviewHistoryCard: {
    marginTop: -8,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LD.border,
    backgroundColor: '#F8FAFC',
  },
  reviewHistoryLabel: {
    fontSize: 12,
    color: LD.muted,
    marginBottom: 6,
    ...fontDisplay('600'),
  },
  reviewHistoryLine: {
    fontSize: 12,
    color: LD.inkSoft,
    lineHeight: 17,
    marginBottom: 3,
    ...fontDisplay('400'),
  },
  submissionAttachmentList: {
    marginTop: 10,
    gap: 8,
  },
  submissionAttachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: LD.border,
    backgroundColor: '#FFFFFF',
  },
  submissionAttachmentText: {
    flex: 1,
    fontSize: 13,
    color: LD.blueMuted,
    lineHeight: 16,
  },
  sectionDecision: {
    marginBottom: 20,
  },
  labelCalm: {
    fontSize: 14,
    fontWeight: '600',
    color: LD.inkSoft,
    marginBottom: 10,
    letterSpacing: 0.15,
    ...fontDisplay('600'),
  },
  decisionContainer: {
    flexDirection: 'row',
    gap: 10,
  },
  decisionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LD.border,
    backgroundColor: LD.fillSoft,
  },
  decisionButtonApproveSelected: {
    borderWidth: 2,
    borderColor: 'rgba(137, 181, 228, 0.75)',
    backgroundColor: LD.fillWash,
  },
  decisionButtonNeedsSelected: {
    borderWidth: 2,
    borderColor: colors.orangeBold,
    backgroundColor: colors.orangeSoft,
  },
  decisionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: LD.muted,
  },
  decisionButtonTextSelected: {
    color: LD.inkSoft,
    fontWeight: '600',
  },
  decisionNeedsTextSelected: {
    color: colors.orangeBold,
    fontWeight: '600',
  },
  decisionExplainer: {
    fontSize: 12,
    fontWeight: '400',
    color: LD.muted,
    marginTop: 10,
    lineHeight: 17,
  },
  decisionExplainerMuted: {
    fontSize: 12,
    color: LD.mutedLight,
    marginTop: 10,
    lineHeight: 17,
  },
  sectionRubric: {
    marginBottom: 20,
  },
  sectionGrades: {
    marginBottom: 18,
  },
  gradeFieldsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  gradeInput: {
    borderWidth: 1,
    borderColor: '#D6DCE8',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: LD.ink,
    backgroundColor: '#FFFFFF',
  },
  gradeInputPrimary: {
    flex: 1,
  },
  gradeInputSecondary: {
    flex: 1,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rubricToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: LD.fillWash,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(137, 181, 228, 0.25)',
  },
  rubricToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: LD.inkSoft,
  },
  rubricContainer: {
    marginTop: 8,
    maxHeight: 400,
  },
  sectionFeedback: {
    marginBottom: 26,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: LD.border,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 15,
    fontWeight: '400',
    color: LD.ink,
    minHeight: 128,
    backgroundColor: '#FFFFFF',
  },
  feedbackInputFocused: {
    borderColor: LD.ring,
    backgroundColor: '#ffffff',
  },
  feedbackInputFocusedWeb: {
    outlineStyle: 'solid',
    outlineWidth: 3,
    outlineColor: LD.ringSoft,
  },
  feedbackHint: {
    fontSize: 12,
    fontWeight: '400',
    color: LD.muted,
    marginTop: 8,
    lineHeight: 17,
  },
  footer: {
    marginTop: 10,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerPillButton: {
    minHeight: 44,
    paddingVertical: 15,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 168,
  },
  footerSaveButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DCE8',
  },
  footerSaveButtonDisabled: {
    opacity: 0.8,
  },
  footerSaveButtonText: {
    fontSize: 14,
    color: '#5B6880',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
