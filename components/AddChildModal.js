import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import AddChildForm from './AddChildForm';
import { addChild } from '../lib/apiClient';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { useModalStackElevation } from './hooks/useModalStackElevation';
import AppModalOverlay from './ui/AppModalOverlay';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import { MODAL_SIZE } from './ui/modalSystem';

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
    <AppModalOverlay
      visible={visible}
      onClose={onClose}
      size={MODAL_SIZE.standard}
      overlayRef={overlayRef}
    >
      <AppModalShell
        title="New Child"
        description="Add a student to your family."
        onClose={onClose}
        onGenerate={() => {
          if (toast?.push) toast.push('AI child setup suggestions are coming soon.', 'info');
        }}
        size={MODAL_SIZE.standard}
        footer={(
          <ModalFooter
            mode="add"
            primaryLabel={isSubmitting ? 'Creating…' : 'Create'}
            onCancel={onClose}
            onPrimary={() => {
              if (formRef.current?.submit) formRef.current.submit();
            }}
            onBlockedPrimary={() => {
              setError('Please complete all required fields before saving.');
            }}
            disabled={isSubmitting}
            visuallyDisabled={!canSubmit}
            loading={isSubmitting}
          />
        )}
      >
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <AddChildForm
          ref={formRef}
          onSubmit={handleSubmit}
          submitting={isSubmitting}
          onValidationChange={setCanSubmit}
        />
      </AppModalShell>
    </AppModalOverlay>
  );
}

const styles = StyleSheet.create({
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
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
  },
});

