import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform } from 'react-native';
import { X } from 'lucide-react';
import AddChildForm from './AddChildForm';
import { addChild } from '../lib/apiClient';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';

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
        learning_styles: formData.learningStyle ? [formData.learningStyle] : [],
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
      console.error('Error adding child:', err);
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
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Add Child</Text>
              <Text style={styles.subtitle}>Complete your child's learning profile</Text>
            </View>
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
        </View>
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
    borderRadius: 16,
    maxWidth: 800,
    width: '100%',
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
    alignItems: 'flex-start',
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#fafbfc',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      default: 'System',
    }),
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '400',
    fontFamily: Platform.select({
      web: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      default: 'System',
    }),
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  cancelButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: '#B8D7F9',
  },
  saveButtonText: {
    color: '#1e40af',
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});

