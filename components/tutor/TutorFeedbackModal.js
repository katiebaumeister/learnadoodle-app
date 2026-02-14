/**
 * Tutor Feedback Modal
 * 
 * Allows tutors to provide feedback on assignments.
 * Key difference from parent review: NO approve/reject buttons.
 * Tutors can only comment/feedback, not make final decisions.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, TextInput, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { X, MessageSquare, Star } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { useToast } from '../Toast';

export default function TutorFeedbackModal({
  visible,
  assignment,
  onClose,
  onFeedbackSubmitted,
}) {
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();

  const handleSubmit = async () => {
    if (!assignment || !feedback.trim()) {
      toast.push('Please provide feedback', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Add comment to assignment_comments table
      const { error: commentError } = await supabase
        .from('assignment_comments')
        .insert({
          assignment_id: assignment.id,
          family_id: assignment.family_id,
          author_id: user.id,
          comment_text: feedback.trim(),
          comment_type: 'tutor_feedback',
          is_internal: false, // Visible to child and parent
          metadata: rating > 0 ? { rating } : null,
        });

      if (commentError) throw commentError;

      toast.push('Feedback submitted successfully!', 'success');
      
      if (onFeedbackSubmitted) {
        onFeedbackSubmitted(assignment.id, { feedback, rating });
      }
      
      handleClose();
    } catch (error) {
      console.error('[TutorFeedbackModal] Error submitting feedback:', error);
      toast.push('Failed to submit feedback: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setFeedback('');
    setRating(0);
    onClose();
  };

  if (!assignment) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <MessageSquare size={24} color={colors.primary} />
              <Text style={styles.title}>Provide Feedback</Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              disabled={submitting}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Assignment Info */}
          <View style={styles.assignmentInfo}>
            <Text style={styles.assignmentTitle}>{assignment.title}</Text>
            {assignment.description && (
              <Text style={styles.assignmentDescription} numberOfLines={2}>
                {assignment.description}
              </Text>
            )}
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={true}>
            {/* Rating (Optional) */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Rating (Optional)</Text>
              <View style={styles.ratingContainer}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={styles.starButton}
                    onPress={() => setRating(value)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Star
                      size={32}
                      color={value <= rating ? colors.yellowBold : colors.border}
                      fill={value <= rating ? colors.yellowBold : 'transparent'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Feedback Text */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Feedback *</Text>
              <TextInput
                style={styles.feedbackInput}
                placeholder="Provide constructive feedback for the student..."
                multiline
                numberOfLines={6}
                value={feedback}
                onChangeText={setFeedback}
                maxLength={2000}
                {...(Platform.OS === 'web' && {
                  // outline: 'none',
                })}
              />
              <Text style={styles.charCount}>
                {feedback.length} / 2000
              </Text>
            </View>

            {/* Note */}
            <View style={styles.noteBox}>
              <Text style={styles.noteText}>
                Note: This feedback will be visible to the student and parent. 
                Only parents can approve or reject assignments.
              </Text>
            </View>
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={submitting}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.submitButton,
                (!feedback.trim() || submitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!feedback.trim() || submitting}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <MessageSquare size={18} color={colors.white} />
                  <Text style={styles.submitButtonText}>Submit Feedback</Text>
                </>
              )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    padding: 4,
  },
  assignmentInfo: {
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  assignmentTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  assignmentDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ratingContainer: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  starButton: {
    padding: 4,
  },
  feedbackInput: {
    minHeight: 120,
    backgroundColor: colors.bgOffset,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: colors.border,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  charCount: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  noteBox: {
    backgroundColor: colors.blueSoft,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  noteText: {
    fontSize: 12,
    color: colors.blueBold,
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  cancelButton: {
    backgroundColor: colors.bgOffset,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  submitButton: {
    backgroundColor: colors.primary,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(136, 125, 238, 0.3)',
    }),
  },
  submitButtonDisabled: {
    backgroundColor: colors.muted,
    opacity: 0.6,
    ...(Platform.OS === 'web' && {
      boxShadow: 'none',
    }),
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
