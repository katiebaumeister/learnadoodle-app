/**
 * One-Tap Submit Button
 * 
 * Simplified submit button for child view - opens QuickSubmitModal
 * Shows on assignment cards for quick submission
 */

import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { Upload, CheckCircle } from 'lucide-react';
import QuickSubmitModal from '../assignments/QuickSubmitModal';

export default function OneTapSubmitButton({ assignment, childId, familyId, onSubmitted }) {
  const [showModal, setShowModal] = useState(false);

  if (!assignment) return null;

  // Don't show if already submitted/accepted
  const isSubmitted = assignment.status === 'submitted' || 
                      assignment.status === 'reviewed' || 
                      assignment.status === 'accepted' ||
                      assignment.review_status === 'approved';

  if (isSubmitted) {
    return (
      <View style={styles.submittedContainer}>
        <CheckCircle size={16} color="#10b981" />
        <Text style={styles.submittedText}>
          {assignment.review_status === 'approved' ? 'Approved' : 
           assignment.review_status === 'needs_revision' ? 'Needs Revision' :
           'Submitted'}
        </Text>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={styles.submitButton}
        onPress={() => setShowModal(true)}
        activeOpacity={0.8}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Upload size={16} color="#ffffff" />
        <Text style={styles.submitButtonText}>Submit</Text>
      </TouchableOpacity>

      <QuickSubmitModal
        visible={showModal}
        assignment={assignment}
        childId={childId}
        familyId={familyId}
        onClose={() => setShowModal(false)}
        onSubmitted={(assignmentId, evidenceId) => {
          setShowModal(false);
          if (onSubmitted) {
            onSubmitted(assignmentId, evidenceId);
          }
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#887DEE',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  submittedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  submittedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#10b981',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
