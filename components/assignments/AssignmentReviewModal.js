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
import { X, CheckCircle, XCircle, FileText } from 'lucide-react';
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
  return `Due ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function displayAssignmentTitle(raw) {
  if (!raw || typeof raw !== 'string') return 'Schoolwork';
  const t = raw.replace(/^Help:\s*/i, '').trim();
  return t || 'Schoolwork';
}

export default function AssignmentReviewModal({
  visible,
  assignment,
  onClose,
  onReviewed,
  submissionReview = true,
}) {
  const [feedback, setFeedback] = useState('');
  const [decision, setDecision] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [rubric, setRubric] = useState(null);
  const [showRubricScoring, setShowRubricScoring] = useState(false);
  const [feedbackFocused, setFeedbackFocused] = useState(false);

  useEffect(() => {
    loadRubric();
  }, [assignment]);

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
    if (!assignment || decision == null) return;

    setSubmitting(true);
    try {
      const reviewStatus = decision === 'approve' ? 'approved' : 'needs_revision';

      const { reviewAssignment } = await import('../../lib/services/gradebookClient');
      const result = await reviewAssignment(assignment.id, {
        review_status: reviewStatus,
        rating: null,
        feedback: feedback || null,
        reviewed_by: null,
      });

      if (result.success) {
        Alert.alert('Success', 'Review submitted successfully!');
        if (onReviewed) {
          onReviewed(assignment.id, { feedback, review_status: reviewStatus });
        }
        handleClose();
      } else {
        Alert.alert('Error', result.error || 'Failed to submit review');
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
    setDecision(null);
    setFeedbackFocused(false);
    onClose();
  };

  const submissionBody =
    submissionReview && assignment?.description
      ? descriptionWithoutChildHelpBlocks(assignment.description)
      : assignment?.description || '';

  const childName = assignment?.child?.first_name || assignment?.child?.name || 'Student';
  const subjectName = assignment?.subject?.name || '—';

  const submittedTs = useMemo(() => {
    if (!assignment) return null;
    return assignment.submitted_at || assignment.updated_at || null;
  }, [assignment]);

  const contextPrimary = useMemo(() => {
    const sum = formatSubmittedSummary(submittedTs);
    return `${childName} · ${subjectName} · ${sum}`;
  }, [childName, subjectName, submittedTs]);

  const contextSecondary = useMemo(() => {
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

  const isApprove = decision === 'approve';
  const isNeedsChanges = decision === 'needs_changes';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <TouchableOpacity style={styles.modalContent} activeOpacity={1} onPress={() => {}}>
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
              <View style={styles.contextAccent} />
              <View style={styles.contextCardInner}>
                <Text style={styles.contextEyebrow}>Reading response</Text>
                <Text style={styles.contextMainTitle}>{titleDisplay}</Text>
                <Text style={styles.contextMetaLine}>{contextPrimary}</Text>
                {contextSecondary ? (
                  <Text style={styles.contextMetaSecondary}>{contextSecondary}</Text>
                ) : null}
                {submissionReview ? (
                  <>
                    <Text style={styles.submittedWorkLabel}>Submitted work</Text>
                    {submissionBody?.trim() ? (
                      <Text style={styles.assignmentDescription}>{submissionBody}</Text>
                    ) : (
                      <Text style={[styles.assignmentDescription, { fontStyle: 'italic' }]}>
                        No written notes were included with this submission.
                      </Text>
                    )}
                  </>
                ) : (
                  assignment?.description ? (
                    <Text style={[styles.assignmentDescription, { marginTop: 8 }]}>{assignment.description}</Text>
                  ) : null
                )}
              </View>
            </View>

            <View style={styles.sectionDecision}>
              <Text style={styles.labelCalm}>Decision</Text>
              <View style={styles.decisionContainer}>
                <TouchableOpacity
                  style={[
                    styles.decisionButton,
                    isApprove && styles.decisionButtonApproveSelected,
                  ]}
                  onPress={() => setDecision('approve')}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <CheckCircle size={20} color={isApprove ? LD.blueMuted : LD.muted} />
                  <Text style={[styles.decisionButtonText, isApprove && styles.decisionButtonTextSelected]}>
                    Approve
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.decisionButton,
                    isNeedsChanges && styles.decisionButtonNeedsSelected,
                  ]}
                  onPress={() => setDecision('needs_changes')}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <XCircle size={20} color={isNeedsChanges ? colors.orangeBold : LD.muted} />
                  <Text style={[styles.decisionButtonText, isNeedsChanges && styles.decisionNeedsTextSelected]}>
                    Needs changes
                  </Text>
                </TouchableOpacity>
              </View>
              {isApprove ? (
                <Text style={styles.decisionExplainer}>This submission will be marked complete.</Text>
              ) : isNeedsChanges ? (
                <Text style={styles.decisionExplainer}>This submission will be returned for revision.</Text>
              ) : (
                <Text style={styles.decisionExplainerMuted}>Choose Approve or Needs changes.</Text>
              )}
            </View>

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
              {isNeedsChanges ? (
                <Text style={styles.feedbackHint}>Tell the student what to revise before resubmitting.</Text>
              ) : isApprove ? (
                <Text style={styles.feedbackHint}>Optional: leave encouragement or a short note.</Text>
              ) : null}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (submitting || decision == null) && styles.primaryButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitting || decision == null}
                {...(Platform.OS === 'web' && {
                  cursor: submitting || decision == null ? 'not-allowed' : 'pointer',
                })}
              >
                <Text style={styles.primaryButtonText}>
                  {submitting ? 'Sending…' : 'Send review'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleClose}
                disabled={submitting}
                {...(Platform.OS === 'web' && { cursor: submitting ? 'not-allowed' : 'pointer' })}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
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
    backgroundColor: LD.shell,
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
    flexDirection: 'row',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: LD.fillWash,
    borderWidth: 1,
    borderColor: LD.border,
  },
  contextAccent: {
    width: 3,
    backgroundColor: LD.accentBar,
    opacity: 0.85,
  },
  contextCardInner: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    paddingLeft: 13,
  },
  contextEyebrow: {
    fontSize: 12,
    fontWeight: '500',
    color: LD.muted,
    marginBottom: 6,
    ...fontDisplay('500'),
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
  },
  contextMetaSecondary: {
    fontSize: 12,
    color: LD.mutedLight,
    marginTop: 4,
    lineHeight: 17,
  },
  submittedWorkLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: LD.muted,
    marginTop: 12,
    marginBottom: 6,
  },
  assignmentDescription: {
    fontSize: 14,
    fontWeight: '400',
    color: LD.muted,
    lineHeight: 21,
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
    backgroundColor: LD.fillSoft,
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
  },
  primaryButton: {
    backgroundColor: LD.black,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0 2px 8px rgba(17, 24, 39, 0.12)' },
      default: {},
    }),
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    ...fontDisplay('600'),
  },
  cancelButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '400',
    color: LD.mutedLight,
  },
});
