/**
 * AI Recommendations Panel Component
 * Display and manage AI-generated recommendations
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Sparkles, CheckCircle, X, Target, TrendingUp, BookOpen, Clock } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getRecommendations, acceptRecommendation, dismissRecommendation } from '../../lib/services/recommendationsClient';

export default function RecommendationsPanel({ childId, familyId, onRecommendationAccepted }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recommendations, setRecommendations] = useState([]);
  const [filterType, setFilterType] = useState(null);

  useEffect(() => {
    loadRecommendations();
  }, [childId, filterType]);

  const loadRecommendations = async () => {
    if (!childId) return;

    setLoading(true);
    try {
      const result = await getRecommendations(childId, filterType);

      if (result.error) {
        console.error('Error loading recommendations:', result.error);
        setRecommendations([]);
      } else {
        setRecommendations(result.data || result || []);
      }
    } catch (error) {
      console.error('Error loading recommendations:', error);
      setRecommendations([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRecommendations();
  };

  const handleAccept = async (recommendationId) => {
    try {
      const result = await acceptRecommendation(recommendationId);

      if (result.error) {
        throw new Error(result.error);
      }

      // Reload recommendations
      await loadRecommendations();

      if (onRecommendationAccepted) {
        onRecommendationAccepted(recommendationId);
      }
    } catch (error) {
      console.error('Error accepting recommendation:', error);
      alert('Failed to accept recommendation. Please try again.');
    }
  };

  const handleDismiss = async (recommendationId) => {
    try {
      const result = await dismissRecommendation(recommendationId);

      if (result.error) {
        throw new Error(result.error);
      }

      // Reload recommendations
      await loadRecommendations();
    } catch (error) {
      console.error('Error dismissing recommendation:', error);
      alert('Failed to dismiss recommendation. Please try again.');
    }
  };

  const getRecommendationIcon = (type) => {
    switch (type) {
      case 'review_task':
        return <Target size={20} color={colors.orangeBold} />;
      case 'practice_set':
        return <TrendingUp size={20} color={colors.greenBold} />;
      case 'assignment':
        return <BookOpen size={20} color={colors.indigo} />;
      case 'study_session':
        return <Clock size={20} color={colors.blueBold} />;
      default:
        return <Sparkles size={20} color={colors.textSecondary} />;
    }
  };

  const getRecommendationTypeLabel = (type) => {
    switch (type) {
      case 'review_task':
        return 'Review Task';
      case 'practice_set':
        return 'Practice Set';
      case 'assignment':
        return 'Assignment';
      case 'study_session':
        return 'Study Session';
      default:
        return 'Recommendation';
    }
  };

  const getPriorityColor = (priority) => {
    if (priority >= 4) return colors.redBold;
    if (priority >= 3) return colors.orangeBold;
    return colors.textSecondary;
  };

  if (loading && recommendations.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Sparkles size={20} color={colors.indigo} />
          <Text style={styles.title}>AI Recommendations</Text>
        </View>
      </View>

      {/* Filter Buttons */}
      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterButton, !filterType && styles.filterButtonActive]}
          onPress={() => setFilterType(null)}
        >
          <Text style={[styles.filterButtonText, !filterType && styles.filterButtonTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {['review_task', 'practice_set', 'assignment', 'study_session'].map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterButton, filterType === type && styles.filterButtonActive]}
            onPress={() => setFilterType(type)}
          >
            <Text style={[styles.filterButtonText, filterType === type && styles.filterButtonTextActive]}>
              {getRecommendationTypeLabel(type)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Recommendations List */}
      <ScrollView
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {recommendations.length === 0 ? (
          <View style={styles.emptyState}>
            <Sparkles size={48} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No recommendations</Text>
            <Text style={styles.emptySubtext}>
              AI will suggest review tasks and practice sets based on your learning progress
            </Text>
          </View>
        ) : (
          recommendations.map((recommendation) => (
            <View key={recommendation.id} style={styles.recommendationCard}>
              <View style={styles.recommendationHeader}>
                <View style={styles.recommendationLeft}>
                  {getRecommendationIcon(recommendation.recommendation_type)}
                  <View style={styles.recommendationInfo}>
                    <View style={styles.recommendationTitleRow}>
                      <Text style={styles.recommendationTitle}>{recommendation.title}</Text>
                      {recommendation.priority >= 4 && (
                        <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(recommendation.priority) }]}>
                          <Text style={styles.priorityText}>High</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.recommendationType}>
                      {getRecommendationTypeLabel(recommendation.recommendation_type)}
                    </Text>
                  </View>
                </View>
              </View>

              {recommendation.description && (
                <Text style={styles.recommendationDescription}>{recommendation.description}</Text>
              )}

              {recommendation.reason && (
                <View style={styles.reasonBox}>
                  <Text style={styles.reasonLabel}>Why this was recommended:</Text>
                  <Text style={styles.reasonText}>{recommendation.reason}</Text>
                </View>
              )}

              {recommendation.estimated_benefit && (
                <Text style={styles.benefitText}>
                  Expected benefit: {recommendation.estimated_benefit}
                </Text>
              )}

              <View style={styles.recommendationActions}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => handleAccept(recommendation.id)}
                >
                  <CheckCircle size={16} color={colors.white} />
                  <Text style={styles.acceptButtonText}>Accept</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dismissButton}
                  onPress={() => handleDismiss(recommendation.id)}
                >
                  <X size={16} color={colors.textSecondary} />
                  <Text style={styles.dismissButtonText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
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
  filters: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexWrap: 'wrap',
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
  },
  filterButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  filterButtonTextActive: {
    color: colors.white,
  },
  list: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  recommendationCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recommendationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  recommendationLeft: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
  },
  recommendationInfo: {
    flex: 1,
    gap: 4,
  },
  recommendationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  recommendationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
  },
  recommendationType: {
    fontSize: 12,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priorityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
  },
  recommendationDescription: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 12,
  },
  reasonBox: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  benefitText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  recommendationActions: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.greenBold,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  dismissButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  dismissButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});

