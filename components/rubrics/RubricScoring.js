/**
 * Rubric Scoring Component
 * Score an assignment using a rubric with criterion-by-criterion feedback
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { CheckCircle, X, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function RubricScoring({ assignment, rubric, onSave, onCancel }) {
  const [scores, setScores] = useState({});
  const [feedback, setFeedback] = useState({});
  const [loading, setLoading] = useState(false);
  const [totalScore, setTotalScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);

  useEffect(() => {
    if (rubric && rubric.criteria) {
      // Initialize scores and feedback
      const initialScores = {};
      const initialFeedback = {};
      let max = 0;

      rubric.criteria.forEach((criterion, index) => {
        const criterionId = criterion.id || `criterion_${index}`;
        initialScores[criterionId] = criterion.max_points || 0;
        initialFeedback[criterionId] = '';
        max += criterion.max_points || 0;
      });

      setScores(initialScores);
      setFeedback(initialFeedback);
      setMaxScore(max);
      setTotalScore(max);

      // Load existing rubric scores if assignment has them
      if (assignment?.rubric_scores && Array.isArray(assignment.rubric_scores)) {
        assignment.rubric_scores.forEach((rubricScore) => {
          if (rubricScore.criterion_id && initialScores[rubricScore.criterion_id] !== undefined) {
            initialScores[rubricScore.criterion_id] = rubricScore.points || 0;
            initialFeedback[rubricScore.criterion_id] = rubricScore.feedback || '';
          }
        });
        setScores(initialScores);
        setFeedback(initialFeedback);
        calculateTotal(initialScores);
      }
    }
  }, [rubric, assignment]);

  const calculateTotal = (scoreMap) => {
    const total = Object.values(scoreMap).reduce((sum, score) => sum + (parseFloat(score) || 0), 0);
    setTotalScore(total);
  };

  const updateScore = (criterionId, points) => {
    const newScores = { ...scores, [criterionId]: parseFloat(points) || 0 };
    setScores(newScores);
    calculateTotal(newScores);
  };

  const updateFeedback = (criterionId, text) => {
    setFeedback({ ...feedback, [criterionId]: text });
  };

  const handleSave = async () => {
    if (!assignment || !rubric) return;

    setLoading(true);
    try {
      // Format rubric scores for database
      const rubricScores = rubric.criteria.map((criterion, index) => {
        const criterionId = criterion.id || `criterion_${index}`;
        return {
          criterion_id: criterionId,
          criterion_name: criterion.name,
          points: scores[criterionId] || 0,
          max_points: criterion.max_points || 0,
          feedback: feedback[criterionId] || '',
        };
      });

      // Update assignment with rubric scores
      const { error } = await supabase
        .from('assignments')
        .update({
          rubric_scores: rubricScores,
          score: totalScore,
          max_score: maxScore,
          updated_at: new Date().toISOString(),
        })
        .eq('id', assignment.id);

      if (error) throw error;

      if (onSave) {
        onSave({
          rubric_scores: rubricScores,
          total_score: totalScore,
          max_score: maxScore,
        });
      }
    } catch (error) {
      console.error('Error saving rubric scores:', error);
      alert('Failed to save rubric scores. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!rubric || !rubric.criteria || rubric.criteria.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No rubric criteria found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Award size={20} color={colors.indigo} />
          <Text style={styles.title}>{rubric.title || 'Rubric Scoring'}</Text>
        </View>
        {rubric.description && (
          <Text style={styles.description}>{rubric.description}</Text>
        )}
      </View>

      {/* Total Score Display */}
      <View style={styles.totalScoreContainer}>
        <Text style={styles.totalScoreLabel}>Total Score</Text>
        <Text style={styles.totalScoreValue}>
          {totalScore.toFixed(1)} / {maxScore}
        </Text>
        <View style={styles.totalScoreBar}>
          <View
            style={[
              styles.totalScoreFill,
              { width: `${(totalScore / maxScore) * 100}%` },
            ]}
          />
        </View>
      </View>

      {/* Criteria List */}
      <ScrollView style={styles.criteriaList} showsVerticalScrollIndicator={false}>
        {rubric.criteria.map((criterion, index) => {
          const criterionId = criterion.id || `criterion_${index}`;
          const criterionMax = criterion.max_points || 0;
          const criterionScore = scores[criterionId] || 0;
          const criterionFeedback = feedback[criterionId] || '';

          return (
            <View key={criterionId} style={styles.criterionCard}>
              <View style={styles.criterionHeader}>
                <View style={styles.criterionInfo}>
                  <Text style={styles.criterionName}>{criterion.name}</Text>
                  {criterion.description && (
                    <Text style={styles.criterionDescription}>{criterion.description}</Text>
                  )}
                  <Text style={styles.criterionMax}>
                    Max: {criterionMax} point{criterionMax !== 1 ? 's' : ''}
                    {criterion.weight && ` (Weight: ${criterion.weight})`}
                  </Text>
                </View>
              </View>

              {/* Score Input */}
              <View style={styles.scoreSection}>
                <Text style={styles.scoreLabel}>Points:</Text>
                <TextInput
                  style={styles.scoreInput}
                  value={criterionScore.toString()}
                  onChangeText={(text) => updateScore(criterionId, text)}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={5}
                />
                <Text style={styles.scoreMax}>/ {criterionMax}</Text>
              </View>

              {/* Feedback Input */}
              <View style={styles.feedbackSection}>
                <Text style={styles.feedbackLabel}>Feedback:</Text>
                <TextInput
                  style={styles.feedbackInput}
                  value={criterionFeedback}
                  onChangeText={(text) => updateFeedback(criterionId, text)}
                  placeholder="Add feedback for this criterion..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={onCancel}
          disabled={loading}
        >
          <X size={18} color={colors.text} />
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, styles.saveButton, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <CheckCircle size={18} color={colors.white} />
              <Text style={styles.saveButtonText}>Save Scores</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  totalScoreContainer: {
    padding: 16,
    backgroundColor: colors.panel,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  totalScoreLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  totalScoreValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  totalScoreBar: {
    height: 8,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
  },
  totalScoreFill: {
    height: '100%',
    backgroundColor: colors.greenBold,
    borderRadius: 4,
  },
  criteriaList: {
    flex: 1,
    padding: 16,
  },
  criterionCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  criterionHeader: {
    marginBottom: 12,
  },
  criterionInfo: {
    gap: 4,
  },
  criterionName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  criterionDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  criterionMax: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  scoreSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  scoreInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
    textAlign: 'center',
  },
  scoreMax: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  feedbackSection: {
    gap: 8,
  },
  feedbackLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
    minHeight: 80,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.indigo,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: 20,
  },
});

