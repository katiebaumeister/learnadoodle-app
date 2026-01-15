import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, TextInput, Alert } from 'react-native';
import { X, ChevronDown, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
import { getMaterials } from '../lib/services/materialsClient';
import AddMaterialModal from './materials/AddMaterialModal';

const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export default function AddSubjectModal({ 
  visible, 
  onClose, 
  onSubjectAdded,
  familyId,
  defaultChildId = null,
  defaultSubjectName = null
}) {
  const [subjectName, setSubjectName] = useState(defaultSubjectName || '');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [grade, setGrade] = useState(GRADE_OPTIONS[0] || '');
  const [credits, setCredits] = useState('');
  const [notes, setNotes] = useState('');
  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  // Materials/attachments state
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [attachedMaterialIds, setAttachedMaterialIds] = useState([]);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const materialDropdownRef = useRef(null);
  const materialButtonRef = useRef(null);
  const [materialDropdownPosition, setMaterialDropdownPosition] = useState({ top: 0, left: 0, width: 200 });

  useEffect(() => {
    if (visible) {
      fetchChildren();
      loadMaterials();
      if (defaultSubjectName) {
        setSubjectName(defaultSubjectName);
      }
      if (defaultChildId) {
        setSelectedChildIds([defaultChildId]);
      }
    } else if (!visible) {
      // Reset form when modal closes
      setSubjectName('');
      setSelectedChildIds([]);
      setGrade(GRADE_OPTIONS[0] || '');
      setCredits('');
      setNotes('');
      setError(null);
      setSelectedMaterialId(null);
      setAttachedMaterialIds([]);
      setShowMaterialDropdown(false);
    }
  }, [visible, defaultChildId, defaultSubjectName]);

  // Set default to first child when children are loaded (if no defaultChildId and no children selected)
  useEffect(() => {
    if (visible && children.length > 0 && selectedChildIds.length === 0 && !defaultChildId) {
      setSelectedChildIds([children[0].id]);
    }
  }, [children, visible, defaultChildId, selectedChildIds.length]);

  const loadMaterials = async () => {
    if (!familyId) return;
    setLoadingMaterials(true);
    try {
      const materialsData = await getMaterials(familyId);
      setMaterials(materialsData || []);
    } catch (error) {
      console.error('Error loading materials:', error);
      setMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  };

  const handleMaterialDropdownToggle = () => {
    const willShow = !showMaterialDropdown;
    
    if (willShow && Platform.OS === 'web' && materialButtonRef.current) {
      // Calculate position before showing dropdown
      const node = materialButtonRef.current._nativeNode || materialButtonRef.current;
      if (node && typeof node.getBoundingClientRect === 'function') {
        const rect = node.getBoundingClientRect();
        const dropdownMaxHeight = 300;
        
        // Position below the button
        const top = rect.bottom + 4;
        
        const newPosition = {
          top: top,
          left: rect.left,
          width: rect.width, // Match the selector box width exactly
          maxHeight: dropdownMaxHeight,
        };
        setMaterialDropdownPosition(newPosition);
      }
    }
    
    setShowMaterialDropdown(willShow);
  };

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
          const { data: retryData, error: retryError } = await supabase
            .from('children')
            .select('*')
            .eq('family_id', effectiveFamilyId);
          
          if (retryError) {
            // Log the full error for debugging

            // Silently fail - child selection is optional
            setChildren([]);
            return;
          }
          setChildren(retryData || []);
          return;
        }

        // Silently fail - child selection is optional
        setChildren([]);
        return;
      }
      
      setChildren(childrenData || []);
      // Clear any previous errors if we successfully loaded (even if empty)
      setError(null);
    } catch (error) {
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

    if (selectedChildIds.length === 0) {
      setError('Please select at least one student');
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

      // Create subject records - one for each selected child (required)
      const subjectsToCreate = selectedChildIds.map(childId => ({
        family_id: familyId,
        name: subjectName.trim(),
        child_id: childId,
        grade: grade || null,
        credits: credits ? parseFloat(credits) : null,
        notes: notes.trim() || null,
      }));

      const { data: newSubjects, error: insertError } = await supabase
        .from('subject')
        .insert(subjectsToCreate)
        .select();

      if (insertError) {
        // Check if it's a duplicate subject error
        if (insertError.code === '23505') {
          throw new Error('A subject with this name already exists for this child/family');
        }
        throw insertError;
      }

      // Link materials to the newly created subjects
      if (attachedMaterialIds.length > 0 && newSubjects && newSubjects.length > 0) {
        try {
          // Update each material to link to the first subject (or all subjects if multiple)
          // For simplicity, link to the first subject created
          const subjectId = newSubjects[0].id;
          
          const { error: materialUpdateError } = await supabase
            .from('materials')
            .update({ subject_id: subjectId })
            .in('id', attachedMaterialIds);

          if (materialUpdateError) {
            console.warn('Failed to link materials to subject:', materialUpdateError);
            // Don't throw - subject creation succeeded, material linking is secondary
          }
        } catch (materialError) {
          console.warn('Error linking materials to subject:', materialError);
          // Don't throw - subject creation succeeded
        }
      }

      // Success
      const subjectCount = newSubjects?.length || 1;
      if (toast && toast.push) {
        toast.push(`Subject "${subjectName}" added successfully!`, 'success');
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        alert(`Subject "${subjectName}" added successfully!`);
      }
      
      if (onSubjectAdded && newSubjects && newSubjects.length > 0) {
        // Call callback with first subject (or all if needed)
        onSubjectAdded(newSubjects[0]);
      }
      
      // Close modal after a brief delay
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to add subject. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = subjectName.trim().length > 0 && selectedChildIds.length > 0 && !isSubmitting;

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
              <Text style={styles.title}>Add Subject</Text>
              <Text style={styles.subtitle}>Create a new subject for your learning plan</Text>
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
              <Text style={styles.label}>
                Subject Name <Text style={{ color: '#dc2626' }}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={subjectName}
                onChangeText={setSubjectName}
                placeholder="e.g., Algebra I, World History, Spanish"
                placeholderTextColor="#9ca3af"
                autoFocus={!defaultSubjectName}
              />
            </View>

            {/* Students Selection */}
            {loadingChildren ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Students<Text style={styles.required}> *</Text></Text>
                <Text style={styles.loadingText}>Loading children...</Text>
              </View>
            ) : children.length > 0 ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Students<Text style={styles.required}> *</Text></Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.childrenScroll}
                >
                  {children.map((child) => {
                    const isSelected = selectedChildIds.includes(child.id);
                    return (
                      <TouchableOpacity
                        key={child.id}
                        style={[
                          styles.childChip,
                          isSelected && styles.childChipSelected
                        ]}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedChildIds(selectedChildIds.filter(id => id !== child.id));
                          } else {
                            setSelectedChildIds([...selectedChildIds, child.id]);
                          }
                        }}
                      >
                        <Text style={[
                          styles.childChipText,
                          isSelected && styles.childChipTextSelected
                        ]}>
                          {child.first_name || child.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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

            {/* Credits (Optional) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Credits (Optional)</Text>
              <TextInput
                style={styles.input}
                value={credits}
                onChangeText={(text) => {
                  // Allow only numbers and decimal point
                  const numericValue = text.replace(/[^0-9.]/g, '');
                  // Prevent multiple decimal points
                  const parts = numericValue.split('.');
                  const filteredValue = parts.length > 2 
                    ? parts[0] + '.' + parts.slice(1).join('')
                    : numericValue;
                  setCredits(filteredValue);
                }}
                placeholder="e.g., 0.5, 1.0, 1.5"
                placeholderTextColor="#9ca3af"
                keyboardType="numeric"
              />
            </View>

            {/* Attachments (Optional) */}
            {familyId && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Attachments (optional)</Text>
                <View style={styles.materialSelectorContainer}>
                  <TouchableOpacity
                    ref={materialButtonRef}
                    style={styles.materialSelector}
                    onPress={handleMaterialDropdownToggle}
                  >
                    <Text style={[
                      styles.materialSelectorText,
                      !selectedMaterialId && styles.materialSelectorPlaceholder
                    ]}>
                      {selectedMaterialId
                        ? (materials.find(m => m.id === selectedMaterialId)?.title || materials.find(m => m.id === selectedMaterialId)?.provider_name || 'Select attachment...')
                        : 'Select attachment...'}
                    </Text>
                    <ChevronDown size={16} color="#6b7280" />
                  </TouchableOpacity>
                  {selectedMaterialId && (
                    <TouchableOpacity
                      style={styles.clearMaterialButton}
                      onPress={() => {
                        setSelectedMaterialId(null);
                        setAttachedMaterialIds([]);
                      }}
                    >
                      <Text style={styles.clearMaterialText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.addMaterialButton}
                    onPress={() => setShowAddMaterialModal(true)}
                  >
                    <Plus size={14} color="#B8D7F9" />
                    <Text style={styles.addMaterialText}>Add New</Text>
                  </TouchableOpacity>
                </View>
                {showMaterialDropdown && Platform.OS === 'web' && (() => {
                  let ReactDOM;
                  try {
                    ReactDOM = require('react-dom');
                  } catch (e) {
                  }
                  
                  const dropdownContent = (
                    <View
                      ref={materialDropdownRef}
                      style={{
                        position: 'fixed',
                        top: materialDropdownPosition.top,
                        left: materialDropdownPosition.left,
                        width: materialDropdownPosition.width || 400,
                        backgroundColor: '#FFFFFF',
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: 'rgba(15,23,42,0.08)',
                        padding: 4,
                        minWidth: 400,
                        maxHeight: materialDropdownPosition.maxHeight || 300,
                        zIndex: 99999,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        ...(Platform.OS === 'web' && {
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                        }),
                      }}
                    >
                      <ScrollView 
                        style={{ 
                          maxHeight: (materialDropdownPosition.maxHeight || 300) - 8,
                          ...(Platform.OS === 'web' && {
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            WebkitOverflowScrolling: 'touch',
                          }),
                        }} 
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={Platform.OS !== 'web'}
                      >
                        {loadingMaterials ? (
                          <View style={{ padding: 12 }}>
                            <Text style={{ fontSize: 13, color: '#6b7280' }}>Loading...</Text>
                          </View>
                        ) : materials.length === 0 ? (
                          <View style={{ padding: 12 }}>
                            <Text style={{ fontSize: 13, color: '#6b7280' }}>No materials yet</Text>
                          </View>
                        ) : (
                          <>
                            <TouchableOpacity
                              style={{
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderRadius: 4,
                              }}
                              onPress={() => {
                                setSelectedMaterialId(null);
                                setAttachedMaterialIds([]);
                                setShowMaterialDropdown(false);
                              }}
                            >
                              <Text style={{ fontSize: 13, color: '#111827' }}>None</Text>
                            </TouchableOpacity>
                            {materials.map((material) => (
                              <TouchableOpacity
                                key={material.id}
                                style={{
                                  paddingVertical: 6,
                                  paddingHorizontal: 10,
                                  borderRadius: 4,
                                  backgroundColor: selectedMaterialId === material.id ? 'rgba(184, 215, 249, 0.1)' : 'transparent',
                                }}
                                onPress={() => {
                                  setSelectedMaterialId(material.id);
                                  setAttachedMaterialIds([material.id]);
                                  setShowMaterialDropdown(false);
                                }}
                              >
                                <Text style={{
                                  fontSize: 13,
                                  color: selectedMaterialId === material.id ? '#1e40af' : '#111827',
                                  fontWeight: selectedMaterialId === material.id ? '600' : '400',
                                }}>
                                  {material.title || material.provider_name || 'Untitled Material'}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </>
                        )}
                      </ScrollView>
                    </View>
                  );
                  
                  if (ReactDOM && typeof document !== 'undefined' && document.body) {
                    return ReactDOM.createPortal(dropdownContent, document.body);
                  }
                  
                  return dropdownContent;
                })()}
              </View>
            )}

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

      {/* Add Material Modal */}
      <AddMaterialModal
        visible={showAddMaterialModal}
        onClose={() => setShowAddMaterialModal(false)}
        onSaved={(newMaterial) => {
          loadMaterials();
          if (newMaterial?.id) {
            setSelectedMaterialId(newMaterial.id);
            setAttachedMaterialIds([newMaterial.id]);
          }
        }}
        familyId={familyId}
        children={children}
      />
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
    maxHeight: '85vh',
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
    position: 'relative',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    padding: 32,
    paddingBottom: 100, // Extra padding for fixed footer
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
    ...Platform.select({
      web: {
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      },
    }),
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '400',
    ...Platform.select({
      web: {
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      },
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
    marginBottom: 20,
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
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    marginRight: 8,
  },
  childChipSelected: {
    backgroundColor: '#e8f0fe',
    borderColor: '#4285f4',
  },
  childChipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '400',
  },
  childChipTextSelected: {
    color: '#4285f4',
    fontWeight: '500',
  },
  gradeScroll: {
    marginTop: 8,
  },
  gradeChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    marginRight: 8,
  },
  gradeChipSelected: {
    backgroundColor: '#e8f0fe',
    borderColor: '#4285f4',
  },
  gradeChipText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '400',
  },
  gradeChipTextSelected: {
    color: '#4285f4',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
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
  required: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  materialSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  materialSelector: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafbfc',
  },
  materialSelectorText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  materialSelectorPlaceholder: {
    color: '#9ca3af',
  },
  clearMaterialButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  clearMaterialText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  addMaterialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#B8D7F9',
  },
  addMaterialText: {
    fontSize: 13,
    color: '#1e40af',
    fontWeight: '600',
  },
});

