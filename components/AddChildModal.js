import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform } from 'react-native';
import { X } from 'lucide-react';
import AddChildForm from './AddChildForm';
import { addChild } from '../lib/apiClient';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { colors } from '../theme/colors';

/**
 * Add Child Modal - Matches Learnadoodle onboarding spec
 * Design: white background, soft gray (#fafbfc), rounded inputs (12px), pastel blue (#B8D7F9) accents
 */
export default function AddChildModal({ 
  visible, 
  onClose, 
  onChildAdded,
  familyId 
}) {
  const formRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [canSubmit, setCanSubmit] = useState(false);
  // Note: ToastProvider wraps the app in WebLayout, so toast should be available
  const toast = useToast();

  // Reset form state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setError(null);
      setIsSubmitting(false);
    }
  }, [visible]);

  const handleSubmit = async (formData) => {
    if (!familyId) {
      setError('Family ID not found. Please refresh and try again.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Get current user to verify authentication
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Prepare payload according to spec
      const payload = {
        family_id: familyId,
        name: formData.name.trim(),
        nickname: formData.nickname?.trim() || null,
        age: formData.age,
        grade_label: formData.grade || null,
        follow_standards: formData.standardsState !== 'None' && formData.standardsState !== null,
        standards_state: formData.standardsState === 'None' || !formData.standardsState ? null : formData.standardsState,
        avatar_url: formData.avatar || null,
        interests: formData.interests || [],
        learning_styles: [], // Learning style removed from form
        // Support profile fields
        diagnoses: formData.diagnoses || null,
        learning_modalities: formData.learningModalities || null,
        support_needs: formData.supportNeeds || null,
        executive_function: formData.executiveFunction || null,
        support_notes: formData.supportNotes || null,
      };

      // Call API endpoint
      const result = await addChild(payload);
      
      if (result.error) {
        throw new Error(result.error.message || 'Failed to add child');
      }

      // Success - show toast and notify parent
      if (toast && toast.push) {
        toast.push(`${formData.name} has been added successfully!`, 'success');
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Fallback to alert if toast not available
        alert(`${formData.name} has been added successfully!`);
      }
      
      if (onChildAdded) {
        onChildAdded(result.data);
      }
      
      // Close modal after a brief delay to show toast
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to add child. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RNModal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.modal}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Child</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityLabel="Close modal"
              accessibilityRole="button"
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Content - Scrollable */}
          <ScrollView 
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
          >
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            
            <AddChildForm
              ref={formRef}
              onSubmit={handleSubmit}
              submitting={isSubmitting}
              onValidationChange={setCanSubmit}
            />
          </ScrollView>

          {/* Fixed Footer with Save Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.cancelButton, isSubmitting && styles.buttonDisabled]}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, (isSubmitting || !canSubmit) && styles.buttonDisabled]}
              onPress={() => {
                if (formRef.current?.submit) {
                  formRef.current.submit();
                }
              }}
              disabled={isSubmitting || !canSubmit}
            >
              <Text style={styles.saveButtonText}>
                {isSubmitting ? 'Saving...' : 'Save Student'}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    </RNModal>
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
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    width: 720,
    maxWidth: '100%',
    maxHeight: '90vh',
    ...Platform.select({
      web: {
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    padding: 4,
    marginLeft: 16,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    padding: 32,
    paddingBottom: 100, // Extra padding for fixed footer
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: '#8B7CF6',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

