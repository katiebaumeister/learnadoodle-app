import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, TextInput, Alert } from 'react-native';
import { X, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { colors } from '../theme/colors';

const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const COMMON_SUBJECTS = [
  'Math', 'ELA', 'English', 'Science', 'Social Studies', 'History',
  'Art', 'Music', 'PE', 'Health', 'World Language', 'Spanish', 'French',
  'Technology', 'Coding', 'Handwriting', 'Reading', 'Writing'
];

export default function AddSubjectModal({ 
  visible, 
  onClose, 
  onSubjectAdded,
  familyId,
  defaultChildId = null,
  defaultSubjectName = null
}) {
  const [subjectName, setSubjectName] = useState(defaultSubjectName || '');
  const [selectedChildId, setSelectedChildId] = useState(defaultChildId || '');
  const [grade, setGrade] = useState('');
  const [notes, setNotes] = useState('');
  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (visible) {
      fetchChildren();
      if (defaultSubjectName) {
        setSubjectName(defaultSubjectName);
      }
      if (defaultChildId) {
        setSelectedChildId(defaultChildId);
      }
    } else if (!visible) {
      // Reset form when modal closes
      setSubjectName('');
      setSelectedChildId(defaultChildId || '');
      setGrade('');
      setNotes('');
      setError(null);
    }
  }, [visible, defaultChildId, defaultSubjectName]);

  const fetchChildren = async () => {
    try {
      setLoadingChildren(true);
      setError(null);
      
      // Get user profile to fetch family_id (more reliable than prop)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Silently fail - child selection is optional
        setChildren([]);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .maybeSingle();

      const effectiveFamilyId = profile?.family_id || familyId;
      
      if (!effectiveFamilyId) {
        // Silently fail - child selection is optional
        setChildren([]);
        return;
      }

      // Fetch children - use same pattern as WebLayout
      // Try with archived filter first
      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', effectiveFamilyId)
        .eq('archived', false);
      
      if (childrenError) {
        // If archived column doesn't exist or query fails, try without it
        if (childrenError.code === '42703' || childrenError.message?.includes('archived') || childrenError.code === '400') {
          console.log('Trying to fetch children without archived filter');
          const { data: retryData, error: retryError } = await supabase
            .from('children')
            .select('*')
            .eq('family_id', effectiveFamilyId);
          
          if (retryError) {
            console.error('Error fetching children (retry):', retryError);
            // Log the full error for debugging
            console.error('Retry error details:', {
              code: retryError.code,
              message: retryError.message,
              details: retryError.details,
              hint: retryError.hint
            });
            // Silently fail - child selection is optional
            setChildren([]);
            return;
          }
          setChildren(retryData || []);
          return;
        }
        
        console.error('Error fetching children:', childrenError);
        console.error('Error details:', {
          code: childrenError.code,
          message: childrenError.message,
          details: childrenError.details,
          hint: childrenError.hint
        });
        // Silently fail - child selection is optional
        setChildren([]);
        return;
      }
      
      setChildren(childrenData || []);
      // Clear any previous errors if we successfully loaded (even if empty)
      setError(null);
    } catch (error) {
      console.error('Error fetching children:', error);
      // Silently fail - child selection is optional
      setChildren([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  const handleSubmit = async () => {
    if (!subjectName.trim()) {
      setError('Please enter a subject name');
      return;
    }

    if (!familyId) {
      setError('Family ID not found. Please refresh and try again.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create subject record
      const subjectData = {
        family_id: familyId,
        name: subjectName.trim(),
        grade: grade || null,
        notes: notes.trim() || null,
      };

      // Add child_id if a child is selected
      if (selectedChildId) {
        subjectData.child_id = selectedChildId;
      }

      const { data: newSubject, error: insertError } = await supabase
        .from('subject')
        .insert(subjectData)
        .select()
        .single();

      if (insertError) {
        // Check if it's a duplicate subject error
        if (insertError.code === '23505') {
          throw new Error('A subject with this name already exists for this child/family');
        }
        throw insertError;
      }

      // Success
      if (toast && toast.push) {
        toast.push(`Subject "${subjectName}" added successfully!`, 'success');
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        alert(`Subject "${subjectName}" added successfully!`);
      }
      
      if (onSubjectAdded) {
        onSubjectAdded(newSubject);
      }
      
      // Close modal after a brief delay
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      console.error('Error adding subject:', err);
      setError(err.message || 'Failed to add subject. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = subjectName.trim().length > 0 && !isSubmitting;

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
              <View style={styles.titleRow}>
                <BookOpen size={24} color={colors.accent} />
                <Text style={styles.title}>Add Subject</Text>
              </View>
              <Text style={styles.subtitle}>Create a new subject for your family</Text>
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
            {error && !error.includes('children') && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Subject Name */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Subject Name *</Text>
              <TextInput
                style={styles.input}
                value={subjectName}
                onChangeText={setSubjectName}
                placeholder="e.g., Algebra I, World History, Spanish"
                placeholderTextColor="#9ca3af"
                autoFocus={!defaultSubjectName}
              />
              
              {/* Quick suggestions */}
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsLabel}>Quick add:</Text>
                <View style={styles.suggestionsRow}>
                  {COMMON_SUBJECTS.slice(0, 9).map((subject) => (
                    <TouchableOpacity
                      key={subject}
                      style={styles.suggestionChip}
                      onPress={() => setSubjectName(subject)}
                    >
                      <Text style={styles.suggestionChipText}>{subject}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            {/* Child Selection (Optional) */}
            {loadingChildren ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>For Child (Optional)</Text>
                <Text style={styles.loadingText}>Loading children...</Text>
              </View>
            ) : children.length > 0 ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>For Child (Optional)</Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.childrenScroll}
                >
                  <TouchableOpacity
                    style={[
                      styles.childChip,
                      !selectedChildId && styles.childChipSelected
                    ]}
                    onPress={() => setSelectedChildId('')}
                  >
                    <Text style={[
                      styles.childChipText,
                      !selectedChildId && styles.childChipTextSelected
                    ]}>
                      All Children
                    </Text>
                  </TouchableOpacity>
                  {children.map((child) => (
                    <TouchableOpacity
                      key={child.id}
                      style={[
                        styles.childChip,
                        selectedChildId === child.id && styles.childChipSelected
                      ]}
                      onPress={() => setSelectedChildId(child.id)}
                    >
                      <Text style={[
                        styles.childChipText,
                        selectedChildId === child.id && styles.childChipTextSelected
                      ]}>
                        {child.first_name || child.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Grade (Optional) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Grade Level (Optional)</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.gradeScroll}
              >
                <TouchableOpacity
                  style={[
                    styles.gradeChip,
                    !grade && styles.gradeChipSelected
                  ]}
                  onPress={() => setGrade('')}
                >
                  <Text style={[
                    styles.gradeChipText,
                    !grade && styles.gradeChipTextSelected
                  ]}>
                    Any
                  </Text>
                </TouchableOpacity>
                {GRADE_OPTIONS.map((g) => (
                  <TouchableOpacity
                    key={g}
                    style={[
                      styles.gradeChip,
                      grade === g && styles.gradeChipSelected
                    ]}
                    onPress={() => setGrade(g)}
                  >
                    <Text style={[
                      styles.gradeChipText,
                      grade === g && styles.gradeChipTextSelected
                    ]}>
                      {g}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Notes (Optional) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Notes (Optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Add any additional notes about this subject"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
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
              style={[styles.saveButton, (!canSubmit || isSubmitting) && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit || isSubmitting}
            >
              <Text style={styles.saveButtonText}>
                {isSubmitting ? 'Saving...' : 'Save Subject'}
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
    maxWidth: 600,
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
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
    paddingBottom: 100,
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
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fafbfc',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  suggestionsContainer: {
    marginTop: 12,
  },
  suggestionsLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  suggestionChipText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  childrenScroll: {
    marginTop: 8,
  },
  childChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  childChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  childChipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  childChipTextSelected: {
    color: colors.accentContrast,
    fontWeight: '600',
  },
  gradeScroll: {
    marginTop: 8,
  },
  gradeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  gradeChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  gradeChipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  gradeChipTextSelected: {
    color: colors.accentContrast,
    fontWeight: '600',
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

