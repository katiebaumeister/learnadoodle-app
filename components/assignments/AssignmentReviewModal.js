/**
 * AssignmentReviewModal Component
 * Modal for parents to review submitted assignments
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, TextInput, Alert } from 'react-native';
import { X, Star, CheckCircle, XCircle, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import RubricScoring from '../rubrics/RubricScoring';

export default function AssignmentReviewModal({
  visible,
  assignment,
  onClose,
  onReviewed,
}) {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rubric, setRubric] = useState(null);
  const [showRubricScoring, setShowRubricScoring] = useState(false);
  const [useRubric, setUseRubric] = useState(false);

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
        setUseRubric(true);
      }
    } catch (error) {
    }
  };

  const handleSubmit = async () => {
    if (!assignment) return;

    setSubmitting(true);
    try {
      // Determine review_status based on accepted state
      let reviewStatus = 'approved';
      if (accepted === false) {
        reviewStatus = 'needs_revision';
      }

      // Use the gradebook client which calls the backend API
      const { reviewAssignment } = await import('../../lib/services/gradebookClient');
      const result = await reviewAssignment(assignment.id, {
        review_status: reviewStatus,
        rating: rating > 0 ? rating : null,
        feedback: feedback || null,
        reviewed_by: null, // Will be set by backend from auth
      });

      if (result.success) {
        Alert.alert('Success', 'Review submitted successfully!');
        if (onReviewed) {
          onReviewed(assignment.id, { rating, feedback, review_status: reviewStatus });
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
    setRating(0);
    setFeedback('');
    setAccepted(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Review Assignment</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Assignment Info */}
            <View style={styles.section}>
              <Text style={styles.assignmentTitle}>{assignment?.title}</Text>
              {assignment?.description && (
                <Text style={styles.assignmentDescription}>{assignment.description}</Text>
              )}
            </View>

            {/* Rating */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Rating</Text>
              <View style={styles.ratingContainer}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <TouchableOpacity
                    key={value}
                    onPress={() => setRating(value)}
                    style={styles.starButton}
                  >
                    <Star
                      size={32}
                      color={value <= rating ? colors.yellowBold : colors.border}
                      fill={value <= rating ? colors.yellowBold : 'none'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              {rating > 0 && (
                <Text style={styles.ratingText}>
                  {rating === 1 && 'Needs Improvement'}
                  {rating === 2 && 'Below Expectations'}
                  {rating === 3 && 'Meets Expectations'}
                  {rating === 4 && 'Exceeds Expectations'}
                  {rating === 5 && 'Outstanding'}
                </Text>
              )}
            </View>

            {/* Feedback */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Feedback</Text>
              <TextInput
                style={styles.feedbackInput}
                value={feedback}
                onChangeText={setFeedback}
                placeholder="Provide feedback on the work..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            {/* Rubric Scoring */}
            {rubric && (
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Rubric Scoring</Text>
                  <TouchableOpacity
                    style={styles.rubricToggle}
                    onPress={() => setShowRubricScoring(!showRubricScoring)}
                  >
                    <FileText size={16} color={colors.indigo} />
                    <Text style={styles.rubricToggleText}>
                      {showRubricScoring ? 'Hide' : 'Show'} Rubric
                    </Text>
                  </TouchableOpacity>
                </View>
                {showRubricScoring && (
                  <View style={styles.rubricContainer}>
                    <RubricScoring
                      assignment={assignment}
                      rubric={rubric}
                      onSave={(rubricData) => {
                        setShowRubricScoring(false);
                        // Rubric scores are saved directly to assignment
                      }}
                      onCancel={() => setShowRubricScoring(false)}
                    />
                  </View>
                )}
              </View>
            )}

            {/* Review Decision */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Review Decision</Text>
              <View style={styles.decisionContainer}>
                <TouchableOpacity
                  style={[
                    styles.decisionButton,
                    accepted === true && styles.decisionButtonActive,
                    accepted === true && { backgroundColor: colors.greenSoft },
                  ]}
                  onPress={() => setAccepted(true)}
                >
                  <CheckCircle size={20} color={accepted === true ? colors.greenBold : colors.muted} />
                  <Text style={[
                    styles.decisionButtonText,
                    accepted === true && { color: colors.greenBold, fontWeight: '600' },
                  ]}>
                    Approve
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.decisionButton,
                    accepted === false && styles.decisionButtonActive,
                    accepted === false && { backgroundColor: colors.orangeSoft },
                  ]}
                  onPress={() => setAccepted(false)}
                >
                  <XCircle size={20} color={accepted === false ? colors.orangeBold : colors.muted} />
                  <Text style={[
                    styles.decisionButtonText,
                    accepted === false && { color: colors.orangeBold, fontWeight: '600' },
                  ]}>
                    Needs Revision
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.helperText}>
                {accepted === true && 'Assignment will be marked as approved'}
                {accepted === false && 'Assignment will be returned for revision'}
              </Text>
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting || accepted === null}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Submitting...' : 'Submit Review'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    width: '90%',
    maxWidth: 500,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  assignmentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  assignmentDescription: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ratingContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  starButton: {
    padding: 4,
  },
  ratingText: {
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
    marginTop: 8,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    minHeight: 120,
    backgroundColor: colors.bgSubtle,
  },
  decisionContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  decisionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
  },
  decisionButtonActive: {
    borderWidth: 2,
  },
  decisionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted,
  },
  helperText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
    fontStyle: 'italic',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rubricToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: colors.blueSoft,
    borderRadius: 6,
  },
  rubricToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.blueBold,
  },
  rubricContainer: {
    marginTop: 12,
    maxHeight: 400,
  },
  submitButton: {
    backgroundColor: colors.text,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.card,
  },
});

