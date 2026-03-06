import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, TextInput, Alert } from 'react-native';
import { X, ChevronDown, Plus, Trash2, CheckCircle, BookOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
import { getMaterials } from '../lib/services/materialsClient';
import { useSession } from '../contexts/SessionContext';
import AddMaterialModal from './materials/AddMaterialModal';
import { parseChildIds } from '../lib/services/subjectsClient';
import { useModalStackElevation } from './hooks/useModalStackElevation';
import ConfirmDialog from './ConfirmDialog';
import { STRINGS } from '../lib/i18n/strings';

const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

// School year options: 2025/26 through 2040/41 (16 years)
function getSchoolYearOptions() {
  const options = [];
  for (let y = 2025; y <= 2040; y++) {
    options.push(`${y}/${String(y + 1).slice(-2)}`);
  }
  return options;
}
const SCHOOL_YEAR_OPTIONS = getSchoolYearOptions();

// Default: before May = current year/next (e.g. 2025/26), May or later = next year (e.g. 2026/27)
function getDefaultSchoolYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-11
  if (month < 5) return `${year}/${String(year + 1).slice(-2)}`;
  return `${year + 1}/${String(year + 2).slice(-2)}`;
}

export default function AddSubjectModal({ 
  visible, 
  onClose, 
  onSubjectAdded,
  familyId,
  defaultChildId = null,
  defaultSubjectName = null,
  subject = null, // If provided, edit mode
  children: propChildren = [] // Pre-loaded children from parent
}) {
  const [subjectName, setSubjectName] = useState(defaultSubjectName || '');
  const [summary, setSummary] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [grade, setGrade] = useState(GRADE_OPTIONS[0] || '');
  const [schoolYear, setSchoolYear] = useState(getDefaultSchoolYear());
  const [showSchoolYearDropdown, setShowSchoolYearDropdown] = useState(false);
  const [credits, setCredits] = useState('');
  const [notes, setNotes] = useState('');
  const [children, setChildren] = useState(propChildren || []);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const session = useSession();

  // Materials/attachments state
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [attachedMaterialIds, setAttachedMaterialIds] = useState([]);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const materialDropdownRef = useRef(null);
  const materialButtonRef = useRef(null);
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible);
  const [materialDropdownPosition, setMaterialDropdownPosition] = useState({ top: 0, left: 0, width: 200 });
  const hasSetChildIdsRef = useRef(false);
  const lastSubjectIdRef = useRef(null);
  
  // Event management state
  const [subjectEvents, setSubjectEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [deletingEvents, setDeletingEvents] = useState(false);
  const [deleteEventsConfirm, setDeleteEventsConfirm] = useState({ visible: false });
  const [markingAttended, setMarkingAttended] = useState(false);

  // Update children when prop changes
  useEffect(() => {
    if (propChildren && propChildren.length > 0) {
      setChildren(propChildren);
      setLoadingChildren(false);
    }
  }, [propChildren]);

  useEffect(() => {
    if (visible) {
      // Only fetch children if not provided as prop
      if (!propChildren || propChildren.length === 0) {
        fetchChildren();
      } else {
        setChildren(propChildren);
        setLoadingChildren(false);
      }
      loadMaterials();
      
      // If editing a subject, populate fields (but wait for children to load for child IDs)
      if (subject) {
        setSubjectName(subject.name || '');
        setSummary(subject.summary || '');
        setGrade(subject.grade || GRADE_OPTIONS[0] || '');
        setSchoolYear(subject.school_year || getDefaultSchoolYear());
        setCredits(subject.credits ? String(subject.credits) : '');
        setNotes(subject.notes || '');
        // Child IDs will be set in the next useEffect after children load
        // Load events for this subject
        loadSubjectEvents(subject.id);
      } else {
        // Add mode - use defaults
        setSchoolYear(getDefaultSchoolYear());
        if (defaultSubjectName) {
          setSubjectName(defaultSubjectName);
        }
        if (defaultChildId) {
          setSelectedChildIds([defaultChildId]);
        }
      }
    } else if (!visible) {
      // Reset form when modal closes
      setSubjectName('');
      setSummary('');
      setSelectedChildIds([]);
      setGrade(GRADE_OPTIONS[0] || '');
      setSchoolYear(getDefaultSchoolYear());
      setShowSchoolYearDropdown(false);
      setCredits('');
      setNotes('');
      setError(null);
      setSelectedMaterialId(null);
      setAttachedMaterialIds([]);
      setShowMaterialDropdown(false);
      setSubjectEvents([]);
      setLoadingEvents(false);
      setDeletingEvents(false);
      setMarkingAttended(false);
    }
  }, [visible, defaultChildId, defaultSubjectName, subject]);
  
  // Load events for the subject
  const loadSubjectEvents = async (subjectId) => {
    if (!subjectId || !familyId) return;
    
    setLoadingEvents(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_ts, status, event_type')
        .eq('subject_id', subjectId)
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .order('start_ts', { ascending: false });
      
      if (error) throw error;
      
      setSubjectEvents(data || []);
    } catch (error) {
      console.error('Error loading subject events:', error);
      setSubjectEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };
  
  // Delete all events for this subject
  const performDeleteAllEvents = async () => {
    if (!subject || !subject.id || subjectEvents.length === 0) return;
    setDeletingEvents(true);
    try {
      const eventIds = subjectEvents.map(e => e.id);
      const { error } = await supabase
        .from('events')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', eventIds)
        .eq('family_id', familyId);
      if (error) throw error;
      toast.show('All events deleted successfully', 'success');
      setSubjectEvents([]);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshEvents'));
        window.dispatchEvent(new CustomEvent('subjectUpdated'));
      }
    } catch (error) {
      console.error('Error deleting events:', error);
      toast.show('Failed to delete events', 'error');
    } finally {
      setDeletingEvents(false);
    }
  };

  const handleDeleteAllEvents = async () => {
    if (!subject || !subject.id || subjectEvents.length === 0) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      setDeleteEventsConfirm({ visible: true });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      Alert.alert(
        'Delete All Events',
        `Are you sure you want to delete all ${subjectEvents.length} event${subjectEvents.length === 1 ? '' : 's'} for this subject? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete All', style: 'destructive', onPress: () => resolve(true) }
        ]
      );
    });
    if (!confirmed) return;
    await performDeleteAllEvents();
  };
  
  // Mark all events as attended
  const handleMarkAllAttended = async () => {
    if (!subject || !subject.id || subjectEvents.length === 0) return;
    
    const unattendedEvents = subjectEvents.filter(e => e.status !== 'done');
    if (unattendedEvents.length === 0) {
      toast.show('All events are already marked as attended', 'info');
      return;
    }
    
    // Web-compatible confirmation
    let confirmed = false;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      confirmed = window.confirm(
        `Mark ${unattendedEvents.length} event${unattendedEvents.length === 1 ? '' : 's'} as attended?`
      );
    } else {
      // Native Alert.alert
      confirmed = await new Promise((resolve) => {
        Alert.alert(
          'Mark All Events as Attended',
          `Mark ${unattendedEvents.length} event${unattendedEvents.length === 1 ? '' : 's'} as attended?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Mark All Attended',
              onPress: () => resolve(true),
            }
          ]
        );
      });
    }
    
    if (!confirmed) return;
    
    setMarkingAttended(true);
    try {
      const eventIds = unattendedEvents.map(e => e.id);
      
      // Update events to done status
      const { error } = await supabase
        .from('events')
        .update({ 
          status: 'done',
          updated_at: new Date().toISOString()
        })
        .in('id', eventIds)
        .eq('family_id', familyId);
      
      if (error) throw error;
      
      toast.show(`${unattendedEvents.length} event${unattendedEvents.length === 1 ? '' : 's'} marked as attended`, 'success');
      
      // Reload events
      await loadSubjectEvents(subject.id);
      
      // Refresh events in the app
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshEvents'));
        window.dispatchEvent(new CustomEvent('subjectUpdated'));
      }
    } catch (error) {
      console.error('Error marking events as attended:', error);
      toast.show('Failed to mark events as attended', 'error');
    } finally {
      setMarkingAttended(false);
    }
  };

  // Set child IDs when editing and children are loaded
  useEffect(() => {
    if (visible && subject && children.length > 0) {
      // Reset flag if subject changed
      if (lastSubjectIdRef.current !== subject.id) {
        hasSetChildIdsRef.current = false;
        lastSubjectIdRef.current = subject.id;
      }
      
      // Only set once per subject
      if (!hasSetChildIdsRef.current) {
        // Parse semicolon-separated child_id string
        if (subject.child_id) {
          const childIds = parseChildIds(subject.child_id);
          setSelectedChildIds(childIds);
        } else {
          setSelectedChildIds([]);
        }
        hasSetChildIdsRef.current = true;
      }
    } else if (!visible) {
      // Reset flags when modal closes
      hasSetChildIdsRef.current = false;
      lastSubjectIdRef.current = null;
    }
  }, [visible, subject?.id, children.length]);

  // Set default to first child when children are loaded (if no defaultChildId and no children selected)
  // BUT only in add mode (not edit mode)
  useEffect(() => {
    if (visible && children.length > 0 && selectedChildIds.length === 0 && !defaultChildId && !subject) {
      setSelectedChildIds([children[0].id]);
    }
  }, [children, visible, defaultChildId, selectedChildIds.length, subject]);

  const loadMaterials = async () => {
    if (!familyId) return;
    setLoadingMaterials(true);
    try {
      const materialsData = await getMaterials(familyId, {}, session);
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

      // Create subject record with semicolon-separated child IDs
      // Format: "child1;child2;child3" or empty string for all children
      const childIdString = selectedChildIds.length > 0 
        ? selectedChildIds.join(';')
        : ''; // Empty string means applies to all children

      const subjectData = {
        name: subjectName.trim(),
        summary: summary.trim() || null,
        child_id: childIdString, // Now stores semicolon-separated IDs
        grade: grade || null,
        school_year: schoolYear || getDefaultSchoolYear(),
        credits: credits ? parseFloat(credits) : null,
        notes: notes.trim() || null,
      };

      let newSubjects;
      let insertError;

      if (subject && subject.id) {
        // Edit mode - UPDATE
        const { data, error } = await supabase
          .from('subject')
          .update(subjectData)
          .eq('id', subject.id)
          .eq('family_id', familyId)
          .select();
        newSubjects = data;
        insertError = error;
      } else {
        // Add mode - INSERT
        subjectData.family_id = familyId;
        const { data, error } = await supabase
          .from('subject')
          .insert([subjectData])
          .select();
        newSubjects = data;
        insertError = error;
      }

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
      const isEdit = subject && subject.id;
      const successMessage = isEdit 
        ? `Subject "${subjectName}" updated successfully!`
        : `Subject "${subjectName}" added successfully!`;
      
      if (toast && toast.push) {
        toast.push(successMessage, 'success');
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        alert(successMessage);
      }
      
      if (onSubjectAdded && newSubjects && newSubjects.length > 0) {
        // Call callback with first subject (or all if needed)
        onSubjectAdded(newSubjects[0]);
      }
      
      // Dispatch event to refresh subjects in other components (e.g., IntelligenceHub, SubjectDetailPage)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        // Also dispatch a specific event for subject detail page if we're editing
        if (subject && subject.id) {
          window.dispatchEvent(new CustomEvent('refreshSubjectDetail', {
            detail: { subjectId: subject.id }
          }));
        }
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
          <View style={[styles.header, subject && styles.headerEdit]}>
            <View style={styles.headerTitleRow}>
              {subject ? (
                <View style={styles.headerIconWrap}>
                  <BookOpen size={20} color="#6b7280" />
                </View>
              ) : null}
              <Text style={styles.title}>{subject ? 'Edit Subject' : 'Add Subject'}</Text>
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
          {subject ? <View style={styles.headerDivider} /> : null}

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

            {/* Summary (Optional) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Summary (Optional)</Text>
              <TextInput
                style={styles.input}
                value={summary}
                onChangeText={setSummary}
                placeholder="E.g., Building foundational knowledge on fractions."
                placeholderTextColor="#9ca3af"
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

            {/* School year */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>School year</Text>
              <TouchableOpacity
                style={styles.dropdownButton}
                onPress={() => setShowSchoolYearDropdown(!showSchoolYearDropdown)}
                activeOpacity={0.7}
              >
                <Text style={styles.dropdownButtonText}>{schoolYear}</Text>
                <ChevronDown size={18} color="#6b7280" />
              </TouchableOpacity>
              {showSchoolYearDropdown && (
                <View style={styles.dropdownList}>
                  <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                    {SCHOOL_YEAR_OPTIONS.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.dropdownOption, opt === schoolYear && styles.dropdownOptionSelected]}
                        onPress={() => {
                          setSchoolYear(opt);
                          setShowSchoolYearDropdown(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dropdownOptionText, opt === schoolYear && styles.dropdownOptionTextSelected]}>{opt}</Text>
                        {opt === schoolYear && <CheckCircle size={16} color={colors.accent || '#4F46E5'} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}
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

            {/* Course structure (edit mode only) */}
            {subject && subject.id && (
              <View style={styles.formGroup}>
                <Text style={[styles.label, { marginBottom: 4 }]}>{STRINGS.courseStructure.section.title}</Text>
                <Text style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>{STRINGS.courseStructure.section.subtitle}</Text>
                <View style={{ gap: 8 }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#f5f3ff', borderRadius: 8, borderWidth: 1, borderColor: '#e9e7ed' }}
                    onPress={() => {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('openPlanYearModal', {
                          detail: { subjectId: subject.id, subjectName: subjectName || subject.name || '', from: 'generate_curriculum' },
                        }));
                      }
                      onClose();
                    }}
                    activeOpacity={0.8}
                  >
                    <BookOpen size={18} color="#5b21b6" style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 14, fontWeight: '500', color: '#5b21b6' }}>{STRINGS.courseStructure.actions.generateCurriculum}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}
                    onPress={() => {
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('openMagicExtractModal', { detail: { subjectId: subject.id, subjectName: subjectName || subject.name || '' } }));
                      }
                      onClose();
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 14, color: '#475569' }}>{STRINGS.courseStructure.actions.importAndExtract}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}
                    onPress={() => toast.push('Add unit manually: coming soon. Use Generate curriculum or Import & extract for now.', 'info')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 14, color: '#475569' }}>{STRINGS.courseStructure.actions.addUnitManually}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            {/* Event Management Section (only in edit mode) */}
            {subject && subject.id && (
              <View style={styles.eventManagementSection}>
                <View style={styles.eventManagementHeader}>
                  <Text style={styles.eventManagementTitle}>Event Management</Text>
                  {loadingEvents ? (
                    <Text style={styles.eventCountText}>Loading...</Text>
                  ) : (
                    <Text style={styles.eventCountText}>
                      {subjectEvents.length} event{subjectEvents.length === 1 ? '' : 's'} found
                    </Text>
                  )}
                </View>
                
                {subjectEvents.length > 0 && (
                  <View style={styles.eventActions}>
                    <TouchableOpacity
                      style={[
                        styles.eventActionButton, 
                        styles.markAttendedButton,
                        (markingAttended || deletingEvents) && styles.eventActionButtonDisabled
                      ]}
                      onPress={handleMarkAllAttended}
                      disabled={markingAttended || deletingEvents}
                    >
                      <CheckCircle size={16} color="#10B981" />
                      <Text style={[styles.eventActionButtonText, styles.markAttendedButtonText]}>
                        {markingAttended ? 'Marking...' : 'Mark All as Attended'}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[
                        styles.eventActionButton, 
                        styles.deleteEventsButton,
                        (deletingEvents || markingAttended) && styles.eventActionButtonDisabled
                      ]}
                      onPress={handleDeleteAllEvents}
                      disabled={deletingEvents || markingAttended}
                    >
                      <Trash2 size={16} color="#EF4444" />
                      <Text style={[styles.eventActionButtonText, styles.deleteEventsButtonText]}>
                        {deletingEvents ? 'Deleting...' : 'Delete All Events'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          {subject ? <View style={styles.footerDivider} /> : null}
          {/* Fixed Footer with Save Button */}
          <View style={[styles.footer, subject && styles.footerEdit]}>
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
                {isSubmitting ? 'Saving...' : (subject ? 'Update Subject' : 'Save Subject')}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
      <ConfirmDialog
        visible={deleteEventsConfirm.visible}
        title="Delete All Events"
        message={`Are you sure you want to delete all ${subjectEvents.length} event${subjectEvents.length === 1 ? '' : 's'} for this subject? This action cannot be undone.`}
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={async () => {
          setDeleteEventsConfirm({ visible: false });
          await performDeleteAllEvents();
        }}
        onCancel={() => setDeleteEventsConfirm({ visible: false })}
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
    borderRadius: 24,
    width: 720,
    maxWidth: '100%',
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerEdit: {
    borderBottomWidth: 0,
    paddingBottom: 0,
    paddingTop: 24,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconWrap: {
    marginRight: 2,
  },
  headerDivider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginHorizontal: 20,
    marginTop: 20,
  },
  footerDivider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginHorizontal: 20,
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
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafbfc',
  },
  dropdownButtonText: {
    fontSize: 14,
    color: '#111827',
  },
  dropdownList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    maxHeight: 200,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dropdownOptionSelected: {
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  dropdownOptionTextSelected: {
    color: colors.accent || '#4F46E5',
    fontWeight: '600',
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
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 8,
  },
  childChipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  childChipText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '400',
  },
  childChipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '700',
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  footerEdit: {
    borderTopWidth: 0,
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
  eventManagementSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
  },
  eventManagementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  eventManagementTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eventCountText: {
    fontSize: 13,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eventActions: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  eventActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  markAttendedButton: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  deleteEventsButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  eventActionButtonDisabled: {
    opacity: 0.5,
    ...(Platform.OS === 'web' && {
      cursor: 'not-allowed',
    }),
  },
  eventActionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  markAttendedButtonText: {
    color: '#10B981',
  },
  deleteEventsButtonText: {
    color: '#EF4444',
  },
});

