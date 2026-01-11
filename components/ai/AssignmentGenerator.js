/**
 * AI Assignment Generator Component
 * Generate assignments from syllabus, YouTube, or text
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { X, Sparkles, BookOpen, Youtube, FileText, Link, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { generateAssignment, approveAIAssignment } from '../../lib/services/aiAssignmentClient';

export default function AssignmentGenerator({ visible, childId, familyId, subjectId = null, onClose, onAssignmentCreated }) {
  const [sourceType, setSourceType] = useState('syllabus');
  const [sourceContent, setSourceContent] = useState('');
  const [cognitiveLoad, setCognitiveLoad] = useState('medium');
  const [difficultyLevel, setDifficultyLevel] = useState('medium');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedAssignment, setGeneratedAssignment] = useState(null);
  const [syllabusSections, setSyllabusSections] = useState([]);
  const [loadingSyllabus, setLoadingSyllabus] = useState(false);

  useEffect(() => {
    if (visible && sourceType === 'syllabus') {
      loadSyllabusSections();
    }
  }, [visible, sourceType, subjectId]);

  const loadSyllabusSections = async () => {
    if (!subjectId) return;

    setLoadingSyllabus(true);
    try {
      const { data, error } = await supabase
        .from('syllabus_sections')
        .select('id, title, description')
        .eq('subject_id', subjectId)
        .order('order_index', { ascending: true });

      if (error) throw error;
      setSyllabusSections(data || []);
    } catch (error) {
    } finally {
      setLoadingSyllabus(false);
    }
  };

  const handleGenerate = async () => {
    if (!sourceContent.trim()) {
      Alert.alert('Validation Error', 'Please provide source content.');
      return;
    }

    setGenerating(true);
    try {
      const result = await generateAssignment({
        child_id: childId,
        source_type: sourceType,
        source_content: sourceContent,
        subject_id: subjectId,
        cognitive_load: cognitiveLoad,
        difficulty_level: difficultyLevel,
        estimated_duration_minutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      setGeneratedAssignment(result.assignment || result);
    } catch (error) {
      Alert.alert('Error', `Failed to generate assignment: ${error.message || 'Unknown error'}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    if (!generatedAssignment?.id) return;

    try {
      const result = await approveAIAssignment(generatedAssignment.id);

      if (result.error) {
        throw new Error(result.error);
      }

      Alert.alert('Success', 'Assignment created successfully!');
      
      if (onAssignmentCreated) {
        onAssignmentCreated(result.assignment);
      }

      handleClose();
    } catch (error) {
      Alert.alert('Error', `Failed to create assignment: ${error.message || 'Unknown error'}`);
    }
  };

  const handleClose = () => {
    setSourceType('syllabus');
    setSourceContent('');
    setCognitiveLoad('medium');
    setDifficultyLevel('medium');
    setEstimatedMinutes('');
    setGeneratedAssignment(null);
    onClose();
  };

  const getSourceTypeIcon = (type) => {
    switch (type) {
      case 'syllabus':
        return <BookOpen size={20} color={colors.indigo} />;
      case 'youtube':
        return <Youtube size={20} color={colors.redBold} />;
      case 'text':
        return <FileText size={20} color={colors.text} />;
      case 'url':
        return <Link size={20} color={colors.blueBold} />;
      default:
        return <Sparkles size={20} color={colors.text} />;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Sparkles size={20} color={colors.indigo} />
              <Text style={styles.title}>AI Assignment Generator</Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton} disabled={generating}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {!generatedAssignment ? (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Source Type Selection */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Source Type</Text>
                <View style={styles.typeButtons}>
                  {['syllabus', 'youtube', 'text', 'url'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeButton,
                        sourceType === type && styles.typeButtonActive,
                      ]}
                      onPress={() => setSourceType(type)}
                    >
                      {getSourceTypeIcon(type)}
                      <Text
                        style={[
                          styles.typeButtonText,
                          sourceType === type && styles.typeButtonTextActive,
                        ]}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Source Content Input */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {sourceType === 'syllabus' && 'Select Syllabus Section'}
                  {sourceType === 'youtube' && 'YouTube URL'}
                  {sourceType === 'text' && 'Text Content'}
                  {sourceType === 'url' && 'URL'}
                </Text>

                {sourceType === 'syllabus' ? (
                  <View style={styles.syllabusSelector}>
                    {loadingSyllabus ? (
                      <ActivityIndicator size="small" color={colors.indigo} />
                    ) : syllabusSections.length === 0 ? (
                      <Text style={styles.emptyText}>No syllabus sections available</Text>
                    ) : (
                      syllabusSections.map((section) => (
                        <TouchableOpacity
                          key={section.id}
                          style={[
                            styles.syllabusOption,
                            sourceContent === section.id && styles.syllabusOptionActive,
                          ]}
                          onPress={() => setSourceContent(section.id)}
                        >
                          <Text style={styles.syllabusOptionTitle}>{section.title}</Text>
                          {section.description && (
                            <Text style={styles.syllabusOptionDesc} numberOfLines={2}>
                              {section.description}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))
                    )}
                  </View>
                ) : (
                  <TextInput
                    style={[styles.input, sourceType === 'text' && styles.textArea]}
                    value={sourceContent}
                    onChangeText={setSourceContent}
                    placeholder={
                      sourceType === 'youtube'
                        ? 'https://www.youtube.com/watch?v=...'
                        : sourceType === 'url'
                        ? 'https://example.com/article'
                        : 'Enter text content here...'
                    }
                    placeholderTextColor={colors.textSecondary}
                    multiline={sourceType === 'text'}
                    numberOfLines={sourceType === 'text' ? 6 : 1}
                    textAlignVertical={sourceType === 'text' ? 'top' : 'center'}
                  />
                )}
              </View>

              {/* Options */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Options</Text>

                <View style={styles.field}>
                  <Text style={styles.label}>Cognitive Load</Text>
                  <View style={styles.optionButtons}>
                    {['low', 'medium', 'high'].map((load) => (
                      <TouchableOpacity
                        key={load}
                        style={[
                          styles.optionButton,
                          cognitiveLoad === load && styles.optionButtonActive,
                        ]}
                        onPress={() => setCognitiveLoad(load)}
                      >
                        <Text
                          style={[
                            styles.optionButtonText,
                            cognitiveLoad === load && styles.optionButtonTextActive,
                          ]}
                        >
                          {load.charAt(0).toUpperCase() + load.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Difficulty Level</Text>
                  <View style={styles.optionButtons}>
                    {['easy', 'medium', 'hard'].map((difficulty) => (
                      <TouchableOpacity
                        key={difficulty}
                        style={[
                          styles.optionButton,
                          difficultyLevel === difficulty && styles.optionButtonActive,
                        ]}
                        onPress={() => setDifficultyLevel(difficulty)}
                      >
                        <Text
                          style={[
                            styles.optionButtonText,
                            difficultyLevel === difficulty && styles.optionButtonTextActive,
                          ]}
                        >
                          {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Estimated Duration (minutes)</Text>
                  <TextInput
                    style={styles.input}
                    value={estimatedMinutes}
                    onChangeText={setEstimatedMinutes}
                    placeholder="e.g., 30"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              {/* Generate Button */}
              <TouchableOpacity
                style={[styles.generateButton, generating && styles.buttonDisabled]}
                onPress={handleGenerate}
                disabled={generating || !sourceContent.trim()}
              >
                {generating ? (
                  <>
                    <ActivityIndicator size="small" color={colors.white} />
                    <Text style={styles.generateButtonText}>Generating...</Text>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} color={colors.white} />
                    <Text style={styles.generateButtonText}>Generate Assignment</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Generated Assignment Preview */}
              <View style={styles.previewSection}>
                <Text style={styles.previewTitle}>Generated Assignment</Text>

                <View style={styles.previewCard}>
                  <Text style={styles.previewCardTitle}>
                    {generatedAssignment.generated_title || 'Assignment Title'}
                  </Text>
                  {generatedAssignment.generated_description && (
                    <Text style={styles.previewCardDescription}>
                      {generatedAssignment.generated_description}
                    </Text>
                  )}
                  {generatedAssignment.generated_instructions && (
                    <View style={styles.instructionsSection}>
                      <Text style={styles.instructionsTitle}>Instructions:</Text>
                      <Text style={styles.instructionsText}>
                        {generatedAssignment.generated_instructions}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.previewActions}>
                  <TouchableOpacity
                    style={[styles.button, styles.rejectButton]}
                    onPress={() => setGeneratedAssignment(null)}
                  >
                    <X size={18} color={colors.text} />
                    <Text style={styles.rejectButtonText}>Regenerate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.approveButton]}
                    onPress={handleApprove}
                  >
                    <CheckCircle size={18} color={colors.white} />
                    <Text style={styles.approveButtonText}>Approve & Create</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          )}
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
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 20,
    width: '90%',
    maxWidth: 600,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  typeButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.white,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  textArea: {
    minHeight: 120,
  },
  syllabusSelector: {
    gap: 8,
  },
  syllabusOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  syllabusOptionActive: {
    backgroundColor: colors.blueSoft,
    borderColor: colors.blueBold,
  },
  syllabusOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  syllabusOptionDesc: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  optionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    alignItems: 'center',
  },
  optionButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  optionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  optionButtonTextActive: {
    color: colors.white,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.indigo,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 8,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  previewSection: {
    gap: 16,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  previewCard: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  previewCardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  instructionsSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    whiteSpace: 'pre-line',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  rejectButton: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rejectButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  approveButton: {
    backgroundColor: colors.greenBold,
  },
  approveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 20,
  },
});

