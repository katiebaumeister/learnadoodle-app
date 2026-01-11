/**
 * AI Template Generation Tab Component
 * Generate templates from topics, syllabi, curriculum, etc.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { 
  FileText, 
  Sparkles, 
  Plus, 
  Clock, 
  BookOpen,
  X,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { generateTemplate, getTemplateGenerationQueue, getGeneratedTemplates } from '../../lib/services/aiTemplateGenerationClient';

const SOURCE_TYPES = {
  TOPIC: 'topic',
  SYLLABUS: 'syllabus',
  CURRICULUM: 'curriculum',
  LEARNING_GOAL: 'learning_goal',
  SUBJECT: 'subject',
};

const TEMPLATE_TYPES = {
  LESSON: 'lesson',
  UNIT: 'unit',
  SEQUENCE: 'sequence',
  PLAN: 'plan',
};

export default function TemplateGenerationTab({ familyId }) {
  const [templates, setTemplates] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  // Form state
  const [sourceType, setSourceType] = useState(SOURCE_TYPES.TOPIC);
  const [sourceText, setSourceText] = useState('');
  const [templateType, setTemplateType] = useState(TEMPLATE_TYPES.LESSON);
  const [subjects, setSubjects] = useState('');
  const [gradeLevels, setGradeLevels] = useState('');

  useEffect(() => {
    loadTemplates();
    loadQueue();
  }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await getGeneratedTemplates();
      if (!error && data) {
        setTemplates(data);
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const loadQueue = async () => {
    try {
      const { data, error } = await getTemplateGenerationQueue();
      if (!error && data) {
        setQueue(data);
      }
    } catch (err) {
    }
  };

  const handleGenerate = async () => {
    if (!sourceText.trim()) return;

    setGenerating(true);
    try {
      const sourceData = {
        text: sourceText.trim(),
        content: sourceText.trim(),
      };

      const subjectsArray = subjects.split(',').map(s => s.trim()).filter(Boolean);
      const gradeLevelsArray = gradeLevels.split(',').map(g => g.trim()).filter(Boolean);

      const { data, error } = await generateTemplate(
        sourceType,
        sourceData,
        templateType,
        subjectsArray.length > 0 ? subjectsArray : null,
        gradeLevelsArray.length > 0 ? gradeLevelsArray : null,
        null
      );

      if (error) {
        return;
      }

      // Reset form and reload
      setSourceText('');
      setSubjects('');
      setGradeLevels('');
      setShowGenerateModal(false);
      await loadTemplates();
      await loadQueue();
    } catch (err) {
    } finally {
      setGenerating(false);
    }
  };

  const getSourceTypeLabel = (type) => {
    const labels = {
      [SOURCE_TYPES.TOPIC]: 'Topic',
      [SOURCE_TYPES.SYLLABUS]: 'Syllabus',
      [SOURCE_TYPES.CURRICULUM]: 'Curriculum',
      [SOURCE_TYPES.LEARNING_GOAL]: 'Learning Goal',
      [SOURCE_TYPES.SUBJECT]: 'Subject',
    };
    return labels[type] || type;
  };

  const getTemplateTypeLabel = (type) => {
    const labels = {
      [TEMPLATE_TYPES.LESSON]: 'Lesson',
      [TEMPLATE_TYPES.UNIT]: 'Unit',
      [TEMPLATE_TYPES.SEQUENCE]: 'Sequence',
      [TEMPLATE_TYPES.PLAN]: 'Plan',
    };
    return labels[type] || type;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return colors.green;
      case 'processing':
        return colors.blue;
      case 'failed':
        return colors.red;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <FileText size={20} color={colors.indigo} />
            <Text style={styles.headerTitle}>AI Template Generation</Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowGenerateModal(true)}
            style={styles.generateButton}
          >
            <Plus size={16} color={colors.white} />
            <Text style={styles.generateButtonText}>Generate</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Queue Status */}
      {queue.length > 0 && (
        <View style={styles.queueSection}>
          <Text style={styles.sectionTitle}>Generation Queue</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {queue.map((item) => (
              <View key={item.id} style={styles.queueCard}>
                <View style={styles.queueHeader}>
                  <Text style={styles.queueSourceType}>{getSourceTypeLabel(item.source_type)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                      {item.status}
                    </Text>
                  </View>
                </View>
                {item.error_message && (
                  <Text style={styles.errorText}>{item.error_message}</Text>
                )}
                {item.status === 'processing' && (
                  <ActivityIndicator size="small" color={colors.indigo} style={styles.queueLoader} />
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Templates List */}
      <ScrollView style={styles.templatesList} contentContainerStyle={styles.templatesContent}>
        {loading && (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.indigo} />
            <Text style={styles.emptyStateText}>Loading templates...</Text>
          </View>
        )}

        {!loading && templates.length === 0 && (
          <View style={styles.emptyState}>
            <FileText size={48} color={colors.textSecondary} />
            <Text style={styles.emptyStateTitle}>No templates yet</Text>
            <Text style={styles.emptyStateText}>
              Generate templates from topics, syllabi, or curriculum to get started.
            </Text>
          </View>
        )}

        {!loading && templates.map((template) => (
          <View key={template.id} style={styles.templateCard}>
            <View style={styles.templateHeader}>
              <View style={styles.templateIcon}>
                <BookOpen size={20} color={colors.indigo} />
              </View>
              <View style={styles.templateHeaderText}>
                <Text style={styles.templateName}>{template.template_name}</Text>
                <View style={styles.templateMeta}>
                  <Text style={styles.templateBadge}>{getSourceTypeLabel(template.source_type)}</Text>
                  <Text style={styles.templateBadge}>{getTemplateTypeLabel(template.template_type)}</Text>
                  {template.confidence_score && (
                    <Text style={styles.templateBadge}>
                      {Math.round(template.confidence_score * 100)}% confidence
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {template.template_description && (
              <Text style={styles.templateDescription}>{template.template_description}</Text>
            )}

            {template.subjects && template.subjects.length > 0 && (
              <View style={styles.templateTags}>
                <Text style={styles.tagsLabel}>Subjects: </Text>
                {template.subjects.map((subject, idx) => (
                  <Text key={idx} style={styles.tag}>{subject}</Text>
                ))}
              </View>
            )}

            {template.grade_levels && template.grade_levels.length > 0 && (
              <View style={styles.templateTags}>
                <Text style={styles.tagsLabel}>Grades: </Text>
                {template.grade_levels.map((grade, idx) => (
                  <Text key={idx} style={styles.tag}>{grade}</Text>
                ))}
              </View>
            )}

            {template.estimated_duration_days && (
              <View style={styles.templateMetaRow}>
                <Clock size={14} color={colors.textSecondary} />
                <Text style={styles.metaText}>{template.estimated_duration_days} days</Text>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Generate Modal */}
      <Modal
        visible={showGenerateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowGenerateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Generate Template</Text>
              <TouchableOpacity onPress={() => setShowGenerateModal(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={styles.label}>Source Type</Text>
                <View style={styles.optionGroup}>
                  {Object.values(SOURCE_TYPES).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.optionButton,
                        sourceType === type && styles.optionButtonActive
                      ]}
                      onPress={() => setSourceType(type)}
                    >
                      <Text style={[
                        styles.optionText,
                        sourceType === type && styles.optionTextActive
                      ]}>
                        {getSourceTypeLabel(type)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Template Type</Text>
                <View style={styles.optionGroup}>
                  {Object.values(TEMPLATE_TYPES).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.optionButton,
                        templateType === type && styles.optionButtonActive
                      ]}
                      onPress={() => setTemplateType(type)}
                    >
                      <Text style={[
                        styles.optionText,
                        templateType === type && styles.optionTextActive
                      ]}>
                        {getTemplateTypeLabel(type)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Source Content</Text>
                <TextInput
                  style={styles.textArea}
                  placeholder="Enter topic, syllabus text, curriculum description, etc."
                  value={sourceText}
                  onChangeText={setSourceText}
                  multiline
                  numberOfLines={8}
                  textAlignVertical="top"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Subjects (comma-separated, optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Math, Science, History"
                  value={subjects}
                  onChangeText={setSubjects}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Grade Levels (comma-separated, optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Grade 3, Grade 4"
                  value={gradeLevels}
                  onChangeText={setGradeLevels}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowGenerateModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton, (!sourceText.trim() || generating) && styles.submitButtonDisabled]}
                onPress={handleGenerate}
                disabled={!sourceText.trim() || generating}
              >
                {generating ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Sparkles size={16} color={colors.white} />
                    <Text style={styles.submitButtonText}>Generate</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.indigo,
    borderRadius: 8,
  },
  generateButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  queueSection: {
    backgroundColor: colors.white,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  queueCard: {
    width: 200,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  queueSourceType: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  errorText: {
    fontSize: 11,
    color: colors.red,
    marginTop: 4,
  },
  queueLoader: {
    marginTop: 8,
  },
  templatesList: {
    flex: 1,
  },
  templatesContent: {
    padding: 16,
    gap: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  templateCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  templateHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  templateIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.indigo + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateHeaderText: {
    flex: 1,
    gap: 4,
  },
  templateName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  templateMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  templateBadge: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.background,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  templateDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  templateTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  tagsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tag: {
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.indigo + '20',
    color: colors.indigo,
    borderRadius: 4,
    fontWeight: '500',
  },
  templateMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalBody: {
    padding: 16,
    maxHeight: 500,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionButtonActive: {
    backgroundColor: colors.indigo + '20',
    borderColor: colors.indigo,
  },
  optionText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  optionTextActive: {
    color: colors.indigo,
    fontWeight: '600',
  },
  textArea: {
    minHeight: 120,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
  input: {
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  submitButton: {
    backgroundColor: colors.indigo,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
});

