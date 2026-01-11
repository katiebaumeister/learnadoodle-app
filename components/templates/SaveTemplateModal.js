import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { X, Save, Tag } from 'lucide-react';
import { colors } from '../../theme/colors';
import { createFromEvents } from '../../lib/services/templatesClient';
import { useToast } from '../Toast';
import { supabase } from '../../lib/supabase';

export default function SaveTemplateModal({ 
  isOpen, 
  onClose, 
  selectedChildren = [], 
  dateRange,
  familyId,
  subjects = []
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState(selectedChildren);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [tags, setTags] = useState('');
  const [visibility, setVisibility] = useState('private');
  const [loading, setLoading] = useState(false);
  const [availableChildren, setAvailableChildren] = useState([]);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const toast = useToast();

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setSelectedChildIds(selectedChildren);
      setSelectedSubjects([]);
      setTags('');
      setVisibility('private');
      loadChildrenAndSubjects();
    }
  }, [isOpen, selectedChildren]);

  const loadChildrenAndSubjects = async () => {
    if (!familyId) return;
    
    try {
      // Load children
      const { data: childrenData } = await supabase
        .from('children')
        // Use first_name only; some databases don't have a generic name column
        .select('id, first_name')
        .eq('family_id', familyId)
        .eq('archived', false);
      
      setAvailableChildren(childrenData || []);

      // Load subjects
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId);
      
      setAvailableSubjects(subjectsData || []);
    } catch (error) {
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.push('Template name is required', 'error');
      return;
    }

    if (selectedChildIds.length === 0) {
      toast.push('Please select at least one child', 'error');
      return;
    }

    if (!dateRange || !dateRange.start || !dateRange.end) {
      toast.push('Date range is required', 'error');
      return;
    }

    setLoading(true);
    try {
      const tagsArray = tags.split(',').map(t => t.trim()).filter(Boolean);
      
      const { data, error } = await createFromEvents({
        name: name.trim(),
        description: description.trim(),
        dateRange: {
          start: dateRange.start,
          end: dateRange.end,
        },
        childIds: selectedChildIds,
        subjects: selectedSubjects.length > 0 ? selectedSubjects : undefined,
        tags: tagsArray,
        visibility,
        familyId,
      });

      if (error) throw error;

      toast.push('Template saved successfully!', 'success');
      onClose();
    } catch (error) {
      toast.push('Failed to save template', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleChild = (childId) => {
    if (selectedChildIds.includes(childId)) {
      setSelectedChildIds(selectedChildIds.filter(id => id !== childId));
    } else {
      setSelectedChildIds([...selectedChildIds, childId]);
    }
  };

  const toggleSubject = (subjectId) => {
    if (selectedSubjects.includes(subjectId)) {
      setSelectedSubjects(selectedSubjects.filter(id => id !== subjectId));
    } else {
      setSelectedSubjects([...selectedSubjects, subjectId]);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Save size={20} color={colors.accent} />
              <Text style={styles.title}>Save as Template</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Template Name */}
            <View style={styles.field}>
              <Text style={styles.label}>Template Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 6-Week Math Sequence"
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </View>

            {/* Description */}
            <View style={styles.field}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Describe what this template covers..."
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Children Selector */}
            <View style={styles.field}>
              <Text style={styles.label}>Children Included *</Text>
              <View style={styles.chipContainer}>
                {availableChildren.map(child => (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.chip,
                      selectedChildIds.includes(child.id) && styles.chipSelected
                    ]}
                    onPress={() => toggleChild(child.id)}
                  >
                    <Text style={[
                      styles.chipText,
                      selectedChildIds.includes(child.id) && styles.chipTextSelected
                    ]}>
                      {child.first_name || child.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Subject Filter (Optional) */}
            {availableSubjects.length > 0 && (
              <View style={styles.field}>
                <Text style={styles.label}>Subject Filter (Optional)</Text>
                <Text style={styles.hint}>Leave empty to include all subjects</Text>
                <View style={styles.chipContainer}>
                  {availableSubjects.map(subject => (
                    <TouchableOpacity
                      key={subject.id}
                      style={[
                        styles.chip,
                        selectedSubjects.includes(subject.id) && styles.chipSelected
                      ]}
                      onPress={() => toggleSubject(subject.id)}
                    >
                      <Text style={[
                        styles.chipText,
                        selectedSubjects.includes(subject.id) && styles.chipTextSelected
                      ]}>
                        {subject.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Tags */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Tag size={16} color={colors.muted} />
                <Text style={styles.label}>Tags</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="math, grade 4, 6-week sequence (comma-separated)"
                value={tags}
                onChangeText={setTags}
              />
            </View>

            {/* Visibility */}
            <View style={styles.field}>
              <Text style={styles.label}>Visibility</Text>
              <View style={styles.radioGroup}>
                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setVisibility('private')}
                >
                  <View style={styles.radio}>
                    {visibility === 'private' && <View style={styles.radioSelected} />}
                  </View>
                  <Text style={styles.radioLabel}>Private (Family Only)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.radioOption}
                  onPress={() => setVisibility('system')}
                >
                  <View style={styles.radio}>
                    {visibility === 'system' && <View style={styles.radioSelected} />}
                  </View>
                  <Text style={styles.radioLabel}>System Template (Coming Soon)</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Date Range Info */}
            {dateRange && (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  This template will include events from {new Date(dateRange.start).toLocaleDateString()} to {new Date(dateRange.end).toLocaleDateString()}
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Save Template</Text>
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
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 600,
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
    maxHeight: 500,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  chipSelected: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  chipText: {
    fontSize: 14,
    color: '#374151',
  },
  chipTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  radioGroup: {
    gap: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
  },
  radioLabel: {
    fontSize: 14,
    color: '#374151',
  },
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  infoText: {
    fontSize: 13,
    color: '#0369a1',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

