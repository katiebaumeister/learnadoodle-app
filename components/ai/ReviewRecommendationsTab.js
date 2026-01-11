/**
 * AI Review Recommendations Tab Component
 * Advanced recommendation system for review tasks
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { 
  RotateCcw, 
  Target, 
  Clock, 
  CheckCircle, 
  XCircle,
  Calendar,
  Sparkles,
  Brain,
  Star,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { 
  generateReviewRecommendations, 
  getReviewRecommendations, 
  scheduleReview, 
  completeReview, 
  dismissReview 
} from '../../lib/services/aiReviewRecommendationsClient';

const RECOMMENDATION_TYPES = {
  SPACED_REVIEW: 'spaced_review',
  MASTERY_CHECK: 'mastery_check',
  SKILL_PRACTICE: 'skill_practice',
  CONCEPT_REINFORCEMENT: 'concept_reinforcement',
  ASSIGNMENT_REVIEW: 'assignment_review',
};

const TYPE_LABELS = {
  [RECOMMENDATION_TYPES.SPACED_REVIEW]: 'Spaced Review',
  [RECOMMENDATION_TYPES.MASTERY_CHECK]: 'Mastery Check',
  [RECOMMENDATION_TYPES.SKILL_PRACTICE]: 'Skill Practice',
  [RECOMMENDATION_TYPES.CONCEPT_REINFORCEMENT]: 'Concept Reinforcement',
  [RECOMMENDATION_TYPES.ASSIGNMENT_REVIEW]: 'Assignment Review',
};

export default function ReviewRecommendationsTab({ familyId, children = [] }) {
  const [selectedChildId, setSelectedChildId] = useState(children.length > 0 ? children[0].id : null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [showCompleteModal, setShowCompleteModal] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [completionData, setCompletionData] = useState({
    actualTimeMinutes: '',
    effectivenessRating: null,
    notes: '',
  });

  useEffect(() => {
    if (selectedChildId) {
      loadRecommendations();
    }
  }, [selectedChildId, selectedType]);

  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const { data, error } = await getReviewRecommendations(
        selectedChildId,
        selectedType,
        'pending',
        null,
        50
      );

      if (error) {
        return;
      }

      setRecommendations(data || []);
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedChildId) return;

    setGenerating(true);
    try {
      const { data, error } = await generateReviewRecommendations(selectedChildId);

      if (error) {
        return;
      }

      await loadRecommendations();
    } catch (err) {
    } finally {
      setGenerating(false);
    }
  };

  const handleSchedule = async (recommendationId) => {
    if (!scheduledDate) return;

    const { error } = await scheduleReview(recommendationId, scheduledDate);
    if (!error) {
      setShowScheduleModal(null);
      setScheduledDate('');
      await loadRecommendations();
    }
  };

  const handleComplete = async (recommendationId) => {
    const { error } = await completeReview(
      recommendationId,
      completionData.actualTimeMinutes ? parseInt(completionData.actualTimeMinutes) : null,
      completionData.effectivenessRating,
      completionData.notes || null
    );

    if (!error) {
      setShowCompleteModal(null);
      setCompletionData({ actualTimeMinutes: '', effectivenessRating: null, notes: '' });
      await loadRecommendations();
    }
  };

  const handleDismiss = async (recommendationId) => {
    const { error } = await dismissReview(recommendationId);
    if (!error) {
      await loadRecommendations();
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case RECOMMENDATION_TYPES.SPACED_REVIEW:
        return RotateCcw;
      case RECOMMENDATION_TYPES.MASTERY_CHECK:
        return Target;
      case RECOMMENDATION_TYPES.SKILL_PRACTICE:
        return Brain;
      case RECOMMENDATION_TYPES.CONCEPT_REINFORCEMENT:
        return Sparkles;
      case RECOMMENDATION_TYPES.ASSIGNMENT_REVIEW:
        return CheckCircle;
      default:
        return Target;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case RECOMMENDATION_TYPES.SPACED_REVIEW:
        return '#8b5cf6';
      case RECOMMENDATION_TYPES.MASTERY_CHECK:
        return '#3b82f6';
      case RECOMMENDATION_TYPES.SKILL_PRACTICE:
        return '#10b981';
      case RECOMMENDATION_TYPES.CONCEPT_REINFORCEMENT:
        return '#f59e0b';
      case RECOMMENDATION_TYPES.ASSIGNMENT_REVIEW:
        return '#ec4899';
      default:
        return colors.textSecondary;
    }
  };

  const getPriorityColor = (priority) => {
    if (priority >= 4) return colors.red;
    if (priority >= 3) return colors.orange;
    return colors.blue;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <RotateCcw size={20} color={colors.indigo} />
            <Text style={styles.headerTitle}>Review Recommendations</Text>
          </View>
          <TouchableOpacity
            onPress={handleGenerate}
            style={[styles.generateButton, generating && styles.generateButtonDisabled]}
            disabled={generating || !selectedChildId}
          >
            {generating ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Sparkles size={16} color={colors.white} />
                <Text style={styles.generateButtonText}>Generate</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Child Selector */}
        {children.length > 0 && (
          <View style={styles.childSelector}>
            <Text style={styles.selectorLabel}>Child:</Text>
            {children.map(child => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.childButton,
                  selectedChildId === child.id && styles.childButtonActive
                ]}
                onPress={() => setSelectedChildId(child.id)}
              >
                <Text style={[
                  styles.childButtonText,
                  selectedChildId === child.id && styles.childButtonTextActive
                ]}>
                  {child.first_name || child.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Type Filter */}
        <View style={styles.typeFilter}>
          <TouchableOpacity
            style={[styles.typeFilterButton, !selectedType && styles.typeFilterButtonActive]}
            onPress={() => setSelectedType(null)}
          >
            <Text style={[styles.typeFilterText, !selectedType && styles.typeFilterTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <TouchableOpacity
              key={type}
              style={[
                styles.typeFilterButton,
                selectedType === type && styles.typeFilterButtonActive,
                selectedType === type && { backgroundColor: getTypeColor(type) + '20', borderColor: getTypeColor(type) }
              ]}
              onPress={() => setSelectedType(type)}
            >
              <Text style={[
                styles.typeFilterText,
                selectedType === type && { color: getTypeColor(type), fontWeight: '600' }
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Recommendations List */}
      <ScrollView style={styles.recommendationsList} contentContainerStyle={styles.recommendationsContent}>
        {loading && (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={colors.indigo} />
            <Text style={styles.emptyStateText}>Loading recommendations...</Text>
          </View>
        )}

        {!loading && recommendations.length === 0 && (
          <View style={styles.emptyState}>
            <Target size={48} color={colors.textSecondary} />
            <Text style={styles.emptyStateTitle}>No recommendations yet</Text>
            <Text style={styles.emptyStateText}>
              Generate recommendations to see personalized review tasks based on spaced repetition and mastery.
            </Text>
          </View>
        )}

        {!loading && recommendations.map((rec) => {
          const Icon = getTypeIcon(rec.recommendation_type);
          const iconColor = getTypeColor(rec.recommendation_type);
          const priorityColor = getPriorityColor(rec.priority);

          return (
            <View key={rec.id} style={styles.recommendationCard}>
              <View style={styles.recommendationHeader}>
                <View style={[styles.recommendationIcon, { backgroundColor: iconColor + '20' }]}>
                  <Icon size={20} color={iconColor} />
                </View>
                <View style={styles.recommendationHeaderText}>
                  <Text style={styles.recommendationTitle}>{rec.title}</Text>
                  <View style={styles.recommendationMeta}>
                    <Text style={[styles.recommendationBadge, { color: iconColor }]}>
                      {TYPE_LABELS[rec.recommendation_type]}
                    </Text>
                    <View style={[styles.priorityBadge, { backgroundColor: priorityColor + '20' }]}>
                      <Star size={12} color={priorityColor} />
                      <Text style={[styles.priorityText, { color: priorityColor }]}>
                        {rec.priority}
                      </Text>
                    </View>
                    {rec.cognitive_load && (
                      <Text style={styles.recommendationBadge}>
                        {rec.cognitive_load} load
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              <Text style={styles.recommendationDescription}>{rec.description}</Text>

              {rec.reason && (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonLabel}>Why:</Text>
                  <Text style={styles.reasonText}>{rec.reason}</Text>
                </View>
              )}

              {rec.estimated_time_minutes && (
                <View style={styles.metaRow}>
                  <Clock size={14} color={colors.textSecondary} />
                  <Text style={styles.metaText}>{rec.estimated_time_minutes} minutes</Text>
                </View>
              )}

              {rec.mastery_level !== undefined && (
                <View style={styles.masteryRow}>
                  <Text style={styles.masteryLabel}>Mastery: </Text>
                  <View style={styles.masteryBar}>
                    <View 
                      style={[
                        styles.masteryFill,
                        { width: `${rec.mastery_level * 100}%`, backgroundColor: iconColor }
                      ]}
                    />
                  </View>
                  <Text style={styles.masteryValue}>{Math.round(rec.mastery_level * 100)}%</Text>
                </View>
              )}

              <View style={styles.recommendationActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.scheduleButton]}
                  onPress={() => setShowScheduleModal(rec.id)}
                >
                  <Calendar size={14} color={colors.white} />
                  <Text style={styles.actionButtonText}>Schedule</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.completeButton]}
                  onPress={() => setShowCompleteModal(rec.id)}
                >
                  <CheckCircle size={14} color={colors.white} />
                  <Text style={styles.actionButtonText}>Complete</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.dismissButton]}
                  onPress={() => handleDismiss(rec.id)}
                >
                  <XCircle size={14} color={colors.textSecondary} />
                  <Text style={[styles.actionButtonText, styles.dismissButtonText]}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Schedule Modal */}
      <Modal
        visible={showScheduleModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowScheduleModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Schedule Review</Text>
            <TextInput
              style={styles.dateInput}
              value={scheduledDate}
              onChangeText={setScheduledDate}
              placeholder="YYYY-MM-DD"
            />
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowScheduleModal(null);
                  setScheduledDate('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={() => handleSchedule(showScheduleModal)}
                disabled={!scheduledDate}
              >
                <Text style={styles.submitButtonText}>Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Complete Modal */}
      <Modal
        visible={showCompleteModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCompleteModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Complete Review</Text>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Time Spent (minutes)</Text>
              <TextInput
                style={styles.input}
                value={completionData.actualTimeMinutes}
                onChangeText={(text) => setCompletionData(prev => ({ ...prev, actualTimeMinutes: text }))}
                keyboardType="numeric"
                placeholder="30"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Effectiveness (1-5)</Text>
              <View style={styles.ratingButtons}>
                {[1, 2, 3, 4, 5].map(rating => (
                  <TouchableOpacity
                    key={rating}
                    style={[
                      styles.ratingButton,
                      completionData.effectivenessRating === rating && styles.ratingButtonActive
                    ]}
                    onPress={() => setCompletionData(prev => ({ ...prev, effectivenessRating: rating }))}
                  >
                    <Star 
                      size={20} 
                      color={completionData.effectivenessRating === rating ? colors.orange : colors.textSecondary}
                      fill={completionData.effectivenessRating === rating ? colors.orange : 'none'}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Notes</Text>
              <TextInput
                style={styles.textArea}
                value={completionData.notes}
                onChangeText={(text) => setCompletionData(prev => ({ ...prev, notes: text }))}
                multiline
                numberOfLines={4}
                placeholder="Optional notes about the review..."
                textAlignVertical="top"
              />
            </View>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowCompleteModal(null);
                  setCompletionData({ actualTimeMinutes: '', effectivenessRating: null, notes: '' });
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={() => handleComplete(showCompleteModal)}
              >
                <Text style={styles.submitButtonText}>Complete</Text>
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
    marginBottom: 16,
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
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  childSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  childButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  childButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  childButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  childButtonTextActive: {
    color: colors.white,
    fontWeight: '500',
  },
  typeFilter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeFilterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  typeFilterButtonActive: {
    borderWidth: 2,
  },
  typeFilterText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  typeFilterTextActive: {
    color: colors.indigo,
    fontWeight: '600',
  },
  recommendationsList: {
    flex: 1,
  },
  recommendationsContent: {
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
  recommendationCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recommendationHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  recommendationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recommendationHeaderText: {
    flex: 1,
    gap: 4,
  },
  recommendationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  recommendationMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  recommendationBadge: {
    fontSize: 11,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.background,
    fontWeight: '500',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
  },
  recommendationDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  reasonBox: {
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    marginBottom: 12,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  masteryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  masteryLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  masteryBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  masteryFill: {
    height: '100%',
    borderRadius: 4,
  },
  masteryValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    minWidth: 40,
  },
  recommendationActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scheduleButton: {
    backgroundColor: colors.blue,
  },
  completeButton: {
    backgroundColor: colors.green,
  },
  dismissButton: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.white,
  },
  dismissButtonText: {
    color: colors.textSecondary,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 20,
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
  input: {
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
  dateInput: {
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
    marginBottom: 20,
  },
  textArea: {
    minHeight: 100,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 14,
    color: colors.text,
  },
  ratingButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ratingButtonActive: {
    backgroundColor: colors.orange + '20',
    borderColor: colors.orange,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  submitButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
});

