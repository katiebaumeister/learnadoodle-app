import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform } from 'react-native';
import { X } from 'lucide-react';
import AddChildForm from './AddChildForm';
import { addChild } from '../lib/apiClient';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
import { useModalStackElevation } from './hooks/useModalStackElevation';

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
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible);
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

      // Optionally upsert family academic year (target days/hours, school year range)
      const hasTarget = (formData.targetMode === 'days' && formData.targetDays) || (formData.targetMode === 'hours' && formData.targetHours);
      const hasRange = formData.schoolYearStart && formData.schoolYearEnd;
      if (familyId && (hasTarget || hasRange)) {
        const { data: existing } = await supabase
          .from('academic_years')
          .select('id, start_date, end_date')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const startDate = formData.schoolYearStart || existing?.start_date;
        const endDate = formData.schoolYearEnd || existing?.end_date;
        if (existing) {
          const toUpdate = { updated_at: new Date().toISOString() };
          if (formData.targetMode === 'days' && formData.targetDays) toUpdate.target_instructional_days = formData.targetDays;
          if (formData.targetMode === 'hours' && formData.targetHours) toUpdate.target_instructional_hours = formData.targetHours;
          if (startDate) toUpdate.start_date = startDate;
          if (endDate) toUpdate.end_date = endDate;
          await supabase.from('academic_years').update(toUpdate).eq('id', existing.id);
        } else if (startDate && endDate) {
          await supabase.from('academic_years').insert({
            family_id: familyId,
            year_name: 'School year',
            start_date: startDate,
            end_date: endDate,
            target_instructional_days: formData.targetMode === 'days' && formData.targetDays ? formData.targetDays : null,
            target_instructional_hours: formData.targetMode === 'hours' && formData.targetHours ? formData.targetHours : null,
          });
        }
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
      <View ref={overlayRef} style={styles.overlay}>
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
    justifyContent: 'space-between',
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
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      cursor: 'pointer',
    }),
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
});

