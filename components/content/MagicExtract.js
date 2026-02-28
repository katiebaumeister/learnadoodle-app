import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { Sparkles, X, Plus, BookOpen } from 'lucide-react';
import { colors } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';
import { STRINGS } from '../../lib/i18n/strings';

/**
 * Magic Extract Component
 * AI parses PDFs into assignments/lessons
 */
export default function MagicExtract({ uploadId, onExtracted }) {
  const [showModal, setShowModal] = useState(false);
  const [extractType, setExtractType] = useState('both');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleExtract = async () => {
    setLoading(true);
    try {
      const { data, error } = await apiRequest('/api/content/magic-extract', {
        method: 'POST',
        body: JSON.stringify({
          upload_id: uploadId,
          extract_type: extractType,
        }),
      });

      if (error) throw error;

      if (data.success) {
        setResults(data);
      } else {
        Alert.alert('Error', data.error || 'Failed to extract content');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to extract content from PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFromExtracted = (item, type) => {
    if (onExtracted) {
      onExtracted(item, type);
    }
    Alert.alert('Success', `${type === 'assignment' ? 'Assignment' : 'Lesson'} created`);
  };

  return (
    <>
      <TouchableOpacity
        style={styles.extractButton}
        onPress={() => setShowModal(true)}
      >
        <Sparkles size={16} color={colors.text} />
        <Text style={styles.extractButtonText}>Magic Extract</Text>
      </TouchableOpacity>

      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowModal(false);
          setResults(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{STRINGS.magicExtract.modal.title}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  setResults(null);
                }}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            {!results ? (
              <>
                <Text style={styles.modalSubtitle}>{STRINGS.magicExtract.modal.subtitle}</Text>
                <Text style={styles.modalText}>
                  {STRINGS.magicExtract.modal.helper}
                </Text>

                <Text style={styles.label}>Extract Type</Text>
                <View style={styles.typeButtons}>
                  {['assignments', 'lessons', 'both'].map(type => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeButton,
                        extractType === type && styles.typeButtonActive
                      ]}
                      onPress={() => setExtractType(type)}
                    >
                      <Text style={[
                        styles.typeButtonText,
                        extractType === type && styles.typeButtonTextActive
                      ]}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.button, styles.extractButton]}
                  onPress={handleExtract}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.card} />
                  ) : (
                    <>
                      <Sparkles size={16} color={colors.card} />
                      <Text style={styles.extractButtonText}>Extract</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <ScrollView style={styles.resultsContainer}>
                {/* Primary: Attach to course — opens Plan My Year */}
                <TouchableOpacity
                  style={styles.attachToCourseButton}
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('openPlanYearModal', { detail: { from: 'magic_extract' } }));
                    }
                    setShowModal(false);
                    setResults(null);
                  }}
                >
                  <BookOpen size={18} color="#fff" />
                  <Text style={styles.attachToCourseButtonText}>{STRINGS.magicExtract.actions.attachToCourse}</Text>
                </TouchableOpacity>
                <Text style={[styles.modalText, { marginBottom: 16 }]}>Add these drafts to a unit or backlog via Plan My Year.</Text>

                {results.assignments && results.assignments.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{STRINGS.magicExtract.sections.draftAssignments}</Text>
                    {results.assignments.map((assignment, idx) => (
                      <View key={idx} style={styles.itemCard}>
                        <Text style={styles.itemTitle}>{assignment.title}</Text>
                        {assignment.description && (
                          <Text style={styles.itemDescription}>{assignment.description}</Text>
                        )}
                        <View style={styles.itemMeta}>
                          {assignment.estimated_minutes && (
                            <Text style={styles.metaText}>
                              {assignment.estimated_minutes} min
                            </Text>
                          )}
                          {assignment.due_date_hint && (
                            <Text style={styles.metaText}>
                              Due: {assignment.due_date_hint}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.createButtonSecondary}
                          onPress={() => handleCreateFromExtracted(assignment, 'assignment')}
                        >
                          <Plus size={14} color={colors.text} />
                          <Text style={styles.createButtonSecondaryText}>Create assignment (calendar)</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {results.lessons && results.lessons.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>{STRINGS.magicExtract.sections.draftLessons}</Text>
                    {results.lessons.map((lesson, idx) => (
                      <View key={idx} style={styles.itemCard}>
                        <Text style={styles.itemTitle}>{lesson.title}</Text>
                        {lesson.description && (
                          <Text style={styles.itemDescription}>{lesson.description}</Text>
                        )}
                        <View style={styles.itemMeta}>
                          {lesson.estimated_minutes && (
                            <Text style={styles.metaText}>
                              {lesson.estimated_minutes} min
                            </Text>
                          )}
                          {lesson.topics && lesson.topics.length > 0 && (
                            <Text style={styles.metaText}>
                              Topics: {lesson.topics.join(', ')}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.createButtonSecondary}
                          onPress={() => handleCreateFromExtracted(lesson, 'lesson')}
                        >
                          <Plus size={14} color={colors.text} />
                          <Text style={styles.createButtonSecondaryText}>Create lesson (calendar)</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {(!results.assignments || results.assignments.length === 0) &&
                 (!results.lessons || results.lessons.length === 0) && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>
                      {STRINGS.magicExtract.empty.body}
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.button, styles.closeButton]}
              onPress={() => {
                setShowModal(false);
                setResults(null);
              }}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  extractButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  extractButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 700,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 6,
  },
  modalText: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 20,
  },
  attachToCourseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#5b21b6',
    borderRadius: 10,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  attachToCourseButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  createButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  createButtonSecondaryText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 12,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  typeButtonTextActive: {
    color: colors.card,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    backgroundColor: colors.bgSubtle,
    marginTop: 20,
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  resultsContainer: {
    maxHeight: 400,
    marginBottom: 20,
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
  itemCard: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  itemDescription: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 12,
    lineHeight: 20,
  },
  itemMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.text,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  createButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.card,
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
});

