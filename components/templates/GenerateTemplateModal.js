import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { X, Sparkles, BookOpen, Clock } from 'lucide-react';
import { colors } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';
import { useToast } from '../Toast';
import { supabase } from '../../lib/supabase';

export default function GenerateTemplateModal({ 
  isOpen, 
  onClose,
  onSuccess,
  familyId,
  defaultSubjectId = null,
}) {
  const [topic, setTopic] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState(defaultSubjectId);
  const [gradeLevel, setGradeLevel] = useState('');
  const [duration, setDuration] = useState('45');
  const [includeMaterials, setIncludeMaterials] = useState(true);
  const [includeSteps, setIncludeSteps] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const toast = useToast();

  const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

  useEffect(() => {
    if (isOpen) {
      setTopic('');
      setSelectedSubjectId(defaultSubjectId);
      setGradeLevel('');
      setDuration('45');
      setIncludeMaterials(true);
      setIncludeSteps(true);
      loadSubjects();
    }
  }, [isOpen, defaultSubjectId]);

  const loadSubjects = async () => {
    if (!familyId) return;
    
    try {
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      
      setAvailableSubjects(subjectsData || []);
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.push('Please enter a topic', 'error');
      return;
    }

    const durationNum = duration ? parseInt(duration, 10) : null;
    if (duration && (isNaN(durationNum) || durationNum <= 0)) {
      toast.push('Duration must be a positive number', 'error');
      return;
    }

    setGenerating(true);
    try {
      const { data, error } = await apiRequest('/api/lesson-templates/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          subject_id: selectedSubjectId || null,
          grade_level: gradeLevel || null,
          duration_minutes: durationNum,
          include_materials: includeMaterials,
          include_steps: includeSteps,
        }),
      });

      if (error) throw error;

      toast.push('Template generated successfully!', 'success');
      onSuccess?.();
      onClose();
      resetForm();
    } catch (error) {
      console.error('Error generating template:', error);
      toast.push('Failed to generate template: ' + (error.message || 'Unknown error'), 'error');
    } finally {
      setGenerating(false);
    }
  };

  const resetForm = () => {
    setTopic('');
    setSelectedSubjectId(defaultSubjectId);
    setGradeLevel('');
    setDuration('45');
    setIncludeMaterials(true);
    setIncludeSteps(true);
  };

  const handleClose = () => {
    if (!generating) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Sparkles size={20} color={colors.accent} />
              <Text style={styles.title}>Generate Template with AI</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton} disabled={generating}>
              <X size={20} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {/* Topic Input */}
            <View style={styles.field}>
              <Text style={styles.label}>Topic *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Introduction to Fractions, Ancient Egypt, Photosynthesis"
                value={topic}
                onChangeText={setTopic}
                autoFocus
                editable={!generating}
              />
              <Text style={styles.hint}>Describe what you want to teach</Text>
            </View>

            {/* Subject */}
            <View style={styles.field}>
              <Text style={styles.label}>Subject (Optional)</Text>
              {availableSubjects.length > 0 && (
                <View style={styles.subjectChips}>
                  {availableSubjects.map(subject => (
                    <TouchableOpacity
                      key={subject.id}
                      style={[
                        styles.subjectChip,
                        selectedSubjectId === subject.id && styles.subjectChipSelected
                      ]}
                      onPress={() => setSelectedSubjectId(
                        selectedSubjectId === subject.id ? null : subject.id
                      )}
                      disabled={generating}
                    >
                      <Text style={[
                        styles.subjectChipText,
                        selectedSubjectId === subject.id && styles.subjectChipTextSelected
                      ]}>
                        {subject.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Grade Level */}
            <View style={styles.field}>
              <Text style={styles.label}>Grade Level (Optional)</Text>
              <View style={styles.gradeChips}>
                {GRADE_OPTIONS.map(grade => (
                  <TouchableOpacity
                    key={grade}
                    style={[
                      styles.gradeChip,
                      gradeLevel === grade && styles.gradeChipSelected
                    ]}
                    onPress={() => setGradeLevel(gradeLevel === grade ? '' : grade)}
                    disabled={generating}
                  >
                    <Text style={[
                      styles.gradeChipText,
                      gradeLevel === grade && styles.gradeChipTextSelected
                    ]}>
                      {grade === 'K' ? 'K' : `Grade ${grade}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Duration */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Clock size={16} color={colors.muted} />
                <Text style={styles.label}>Duration (minutes)</Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="45"
                value={duration}
                onChangeText={setDuration}
                keyboardType="numeric"
                editable={!generating}
              />
            </View>

            {/* Options */}
            <View style={styles.field}>
              <Text style={styles.label}>Include in Template</Text>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setIncludeMaterials(!includeMaterials)}
                disabled={generating}
              >
                <View style={[styles.checkbox, includeMaterials && styles.checkboxChecked]}>
                  {includeMaterials && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.optionText}>Materials list</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => setIncludeSteps(!includeSteps)}
                disabled={generating}
              >
                <View style={[styles.checkbox, includeSteps && styles.checkboxChecked]}>
                  {includeSteps && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.optionText}>Step-by-step lesson plan</Text>
              </TouchableOpacity>
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                AI will generate a complete lesson template with objectives, materials, and steps based on your topic.
                You can edit the generated template after creation.
              </Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleClose}
              disabled={generating}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.generateButton, generating && styles.generateButtonDisabled]}
              onPress={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Sparkles size={16} color="#ffffff" />
                  <Text style={styles.generateButtonText}>Generate</Text>
                </>
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
    maxHeight: Platform.OS === 'web' ? 500 : 400,
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
    marginTop: 4,
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
  subjectChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  subjectChipSelected: {
    backgroundColor: '#dbeafe',
    borderColor: colors.accent,
  },
  subjectChipText: {
    fontSize: 13,
    color: '#374151',
  },
  subjectChipTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  gradeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  gradeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  gradeChipSelected: {
    backgroundColor: '#dbeafe',
    borderColor: colors.accent,
  },
  gradeChipText: {
    fontSize: 13,
    color: '#374151',
  },
  gradeChipTextSelected: {
    color: '#1e40af',
    fontWeight: '600',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  optionText: {
    fontSize: 14,
    color: '#374151',
  },
  infoBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginTop: 8,
  },
  infoText: {
    fontSize: 13,
    color: '#0369a1',
    lineHeight: 18,
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
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

