import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Animated } from 'react-native';
import { Sparkles, Check, X, Clock, Star, AlertCircle, Lightbulb, BookOpen, Target, Zap, TrendingUp, Award } from 'lucide-react';
import { getRecommendations, updateRecommendation } from '../lib/services/recordsClient';
import { generatePersonalizedRecommendations, saveRecommendations } from '../lib/services/aiRecommendationsService';
import { useToast } from './Toast';
import { colors } from '../theme/colors';

const RECOMMENDATION_ICONS = {
  learning_strategy: Lightbulb,
  resource: BookOpen,
  schedule_adjustment: Clock,
  subject_suggestion: Target,
  activity_suggestion: Zap,
  support_strategy: AlertCircle,
  goal_setting: Star,
  skill_development: BookOpen,
};

const RECOMMENDATION_COLORS = {
  learning_strategy: '#8B7CF6',
  resource: '#4A90E2',
  schedule_adjustment: '#F59E0B',
  subject_suggestion: '#10B981',
  activity_suggestion: '#EC4899',
  support_strategy: '#EF4444',
  goal_setting: '#F97316',
  skill_development: '#6366F1',
};

export default function RecommendationsPanel({ childId, familyId }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filter, setFilter] = useState('pending'); // 'pending', 'accepted', 'all'
  const [animatingCards, setAnimatingCards] = useState(new Set());
  const toast = useToast();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (childId) {
      loadRecommendations();
    }
  }, [childId, filter]);

  // Animate cards on load
  useEffect(() => {
    if (recommendations.length > 0 && !loading) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [recommendations.length, loading]);

  const loadRecommendations = async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const status = filter === 'all' ? null : filter;
      const recs = await getRecommendations(childId, status);
      setRecommendations(recs || []);
    } catch (error) {
      toast.push('Failed to load recommendations', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateRecommendations = async () => {
    if (!childId || !familyId) return;
    setGenerating(true);
    try {
      const generated = await generatePersonalizedRecommendations(childId, familyId);
      if (generated?.recommendations) {
        await saveRecommendations(generated.recommendations, childId, familyId);
        toast.push('Generated new recommendations!', 'success');
        loadRecommendations();
      }
    } catch (error) {
      toast.push('Failed to generate recommendations', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const handleUpdateStatus = async (recommendationId, newStatus) => {
    // Add animation
    setAnimatingCards(prev => new Set(prev).add(recommendationId));
    
    try {
      await updateRecommendation(recommendationId, { status: newStatus });
      toast.push('Recommendation updated', 'success');
      
      // Delay reload to show animation
      setTimeout(() => {
        loadRecommendations();
        setAnimatingCards(prev => {
          const next = new Set(prev);
          next.delete(recommendationId);
          return next;
        });
      }, 300);
    } catch (error) {
      toast.push('Failed to update recommendation', 'error');
      setAnimatingCards(prev => {
        const next = new Set(prev);
        next.delete(recommendationId);
        return next;
      });
    }
  };

  const getPriorityColor = (priority) => {
    if (priority >= 4) return '#EF4444'; // High
    if (priority >= 3) return '#F59E0B'; // Medium
    return '#10B981'; // Low
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading recommendations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Sparkles size={24} color={colors.accent} />
          <View>
            <Text style={styles.title}>Personalized Recommendations</Text>
            <Text style={styles.subtitle}>
              AI-powered suggestions based on {recommendations.length} profile factors
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={[styles.generateButton, generating && styles.generateButtonDisabled]}
          onPress={handleGenerateRecommendations}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Sparkles size={16} color={colors.white} />
              <Text style={styles.generateButtonText}>Generate New</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'pending' && styles.filterButtonActive]}
          onPress={() => setFilter('pending')}
        >
          <Text style={[styles.filterText, filter === 'pending' && styles.filterTextActive]}>
            Pending ({recommendations.filter(r => r.status === 'pending').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'accepted' && styles.filterButtonActive]}
          onPress={() => setFilter('accepted')}
        >
          <Text style={[styles.filterText, filter === 'accepted' && styles.filterTextActive]}>
            Accepted ({recommendations.filter(r => r.status === 'accepted').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All ({recommendations.length})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {recommendations.length === 0 ? (
          <View style={styles.emptyState}>
            <Sparkles size={48} color={colors.muted} />
            <Text style={styles.emptyTitle}>No recommendations yet</Text>
            <Text style={styles.emptyText}>
              Generate personalized recommendations based on the learner profile
            </Text>
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={handleGenerateRecommendations}
              disabled={generating}
            >
              {generating ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Sparkles size={16} color={colors.white} />
                  <Text style={styles.emptyButtonText}>Generate Recommendations</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          recommendations.map((rec, index) => {
            const Icon = RECOMMENDATION_ICONS[rec.recommendation_type] || Sparkles;
            const iconColor = RECOMMENDATION_COLORS[rec.recommendation_type] || colors.accent;
            const priorityColor = getPriorityColor(rec.priority);
            const isAnimating = animatingCards.has(rec.id);

            return (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                index={index}
                Icon={Icon}
                iconColor={iconColor}
                priorityColor={priorityColor}
                isAnimating={isAnimating}
                onUpdateStatus={handleUpdateStatus}
                colors={colors}
              />
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// Separate component for animated card
function RecommendationCard({ rec, index, Icon, iconColor, priorityColor, isAnimating, onUpdateStatus, colors }) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.95)).current;

  // Animate card entry
  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 50),
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(cardScale, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  // Animate card exit
  useEffect(() => {
    if (isAnimating) {
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isAnimating]);

  return (
    <Animated.View 
      style={[
        styles.recommendationCard,
        {
          opacity: cardOpacity,
          transform: [{ scale: cardScale }],
        },
        isAnimating && styles.cardExiting,
      ]}
    >
      <View style={styles.recommendationHeader}>
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor}20` }]}>
          <Icon size={20} color={iconColor} />
        </View>
        <View style={styles.recommendationContent}>
          <View style={styles.recommendationTitleRow}>
            <Text style={styles.recommendationTitle}>{rec.title}</Text>
            <View style={[styles.priorityBadge, { backgroundColor: `${priorityColor}20` }]}>
              <Text style={[styles.priorityText, { color: priorityColor }]}>
                Priority {rec.priority}
              </Text>
            </View>
          </View>
          <Text style={styles.recommendationType}>
            {rec.recommendation_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </Text>
        </View>
      </View>

      <Text style={styles.recommendationDescription}>{rec.description}</Text>

      {rec.rationale && (
        <View style={styles.rationaleContainer}>
          <Text style={styles.rationaleLabel}>Why this recommendation:</Text>
          <Text style={styles.rationaleText}>{rec.rationale}</Text>
        </View>
      )}

      <View style={styles.recommendationMeta}>
        {rec.estimated_time_minutes && (
          <View style={styles.metaItem}>
            <Clock size={14} color={colors.muted} />
            <Text style={styles.metaText}>{rec.estimated_time_minutes} min</Text>
          </View>
        )}
        {rec.cognitive_load && (
          <View style={styles.metaItem}>
            <Text style={styles.metaText}>
              Cognitive load: {rec.cognitive_load}
            </Text>
          </View>
        )}
        {rec.confidence_score && (
          <View style={styles.metaItem}>
            <Star size={14} color={colors.muted} />
            <Text style={styles.metaText}>
              {Math.round(rec.confidence_score * 100)}% confidence
            </Text>
          </View>
        )}
      </View>

      {rec.status === 'pending' && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={() => onUpdateStatus(rec.id, 'accepted')}
          >
            <Check size={16} color={colors.white} />
            <Text style={styles.actionButtonText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.dismissButton]}
            onPress={() => onUpdateStatus(rec.id, 'dismissed')}
          >
            <X size={16} color={colors.text} />
            <Text style={[styles.actionButtonText, styles.dismissButtonText]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {rec.status === 'accepted' && (
        <View style={[styles.statusBadge, styles.statusBadgeAccepted]}>
          <Award size={14} color={colors.white} />
          <Text style={styles.statusText}>Accepted</Text>
        </View>
      )}

      {rec.priority >= 4 && rec.status === 'pending' && (
        <View style={styles.highPriorityIndicator}>
          <TrendingUp size={12} color={priorityColor} />
          <Text style={[styles.highPriorityText, { color: priorityColor }]}>High Priority</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bg,
  },
  loadingText: {
    marginTop: 16,
    color: colors.muted,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  generateButtonDisabled: {
    opacity: 0.6,
  },
  generateButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  filters: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  filterTextActive: {
    color: colors.white,
  },
  content: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  recommendationCard: {
    margin: 16,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardExiting: {
    opacity: 0.5,
  },
  recommendationHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendationContent: {
    flex: 1,
  },
  recommendationTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  recommendationTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  recommendationType: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'capitalize',
  },
  recommendationDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  rationaleContainer: {
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    marginBottom: 12,
  },
  rationaleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 4,
  },
  rationaleText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  recommendationMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  acceptButton: {
    backgroundColor: colors.accent,
  },
  dismissButton: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  dismissButtonText: {
    color: colors.text,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.accent,
    borderRadius: 16,
    marginTop: 8,
  },
  statusBadgeAccepted: {
    backgroundColor: '#10B981',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.white,
  },
  highPriorityIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    marginTop: 8,
  },
  highPriorityText: {
    fontSize: 11,
    fontWeight: '600',
  },
});

