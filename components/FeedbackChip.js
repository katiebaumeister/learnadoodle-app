import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Modal, TextInput } from 'react-native';
import { MessageSquare } from 'lucide-react';
import { useSensoryMode } from '../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../theme/pastelDesignTokens';

export default function FeedbackChip() {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [showModal, setShowModal] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  // Always show in sidebar footer (no scroll detection needed)
  const isVisible = true;

  const handleSubmit = () => {
    // TODO: Implement feedback submission
    console.log('Feedback submitted:', feedbackText);
    setFeedbackText('');
    setShowModal(false);
    // You can add API call here to submit feedback
  };

  if (!isVisible) return null;

  return (
    <>
      <View style={styles.chipContainer}>
        <TouchableOpacity
          style={[
            styles.chip,
            {
              backgroundColor: tokens.surface,
              borderColor: tokens.border,
              shadowColor: tokens.text,
            },
          ]}
          onPress={() => setShowModal(true)}
          onMouseEnter={(e) => {
            if (Platform.OS === 'web') {
              e.currentTarget.style.transform = 'scale(1.02)';
            }
          }}
          onMouseLeave={(e) => {
            if (Platform.OS === 'web') {
              e.currentTarget.style.transform = 'scale(1)';
            }
          }}
        >
          <MessageSquare size={16} color={tokens.accent} />
          <Text style={[styles.chipText, { color: tokens.text }]}>Give Feedback</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: tokens.surface,
                borderColor: tokens.border,
                shadowColor: tokens.text,
              },
            ]}
          >
            <Text style={[styles.modalTitle, { color: tokens.text }]}>Share Your Feedback</Text>
            <Text style={[styles.modalDescription, { color: tokens.textSecondary }]}>
              We'd love to hear your thoughts, suggestions, or report any issues.
            </Text>
            
            {Platform.OS === 'web' ? (
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Type your feedback here..."
                style={{
                  width: '100%',
                  minHeight: 120,
                  padding: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderStyle: 'solid',
                  fontSize: 14,
                  marginBottom: spacing.lg,
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  backgroundColor: tokens.bgSubtle,
                  borderColor: tokens.border,
                  color: tokens.text,
                }}
                rows={6}
              />
            ) : (
              <TextInput
                multiline
                numberOfLines={6}
                value={feedbackText}
                onChangeText={setFeedbackText}
                placeholder="Type your feedback here..."
                placeholderTextColor={tokens.textMuted}
                style={[
                  styles.textarea,
                  {
                    backgroundColor: tokens.bgSubtle,
                    borderColor: tokens.border,
                    color: tokens.text,
                  },
                ]}
              />
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.buttonSecondary, { borderColor: tokens.border }]}
                onPress={() => setShowModal(false)}
              >
                <Text style={[styles.buttonText, { color: tokens.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.buttonPrimary, { backgroundColor: tokens.accent }]}
                onPress={handleSubmit}
              >
                <Text style={[styles.buttonText, { color: tokens.surface }]}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chipContainer: {
    width: '100%',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          transition: 'transform 200ms ease, box-shadow 200ms ease',
          cursor: 'pointer',
        }
      : {
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        }
    ),
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    width: '100%',
    maxWidth: 500,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
        }
      : {
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.15,
          shadowRadius: 24,
          elevation: 8,
        }
    ),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  modalDescription: {
    fontSize: 14,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  textarea: {
    width: '100%',
    minHeight: 120,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    fontSize: 14,
    marginBottom: spacing.lg,
    ...(Platform.OS === 'web' && {
      resize: 'vertical',
      fontFamily: 'inherit',
    }),
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    minWidth: 80,
    alignItems: 'center',
  },
  buttonSecondary: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  buttonPrimary: {
    // backgroundColor set inline
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

