import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { BookOpen, TrendingUp, Lightbulb, Award, Sparkles } from 'lucide-react';
import { useToast } from '../Toast';

export default function LearningStoryCard({ familyId, weekStart }) {
  const [loading, setLoading] = useState(true);
  const [story, setStory] = useState(null);
  const toast = useToast();

  useEffect(() => {
    loadStory();
  }, [weekStart]);

  const loadStory = async () => {
    if (!familyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { getLearningStory } = await import('../../lib/apiClient');
      const { data, error } = await getLearningStory(weekStart);
      
      if (error) {
        // Don't show error toast for network errors (backend might be down)
        const isNetworkError = error.message?.includes('Cannot connect') || error.message?.includes('Failed to fetch');
        if (!isNetworkError) {
          toast.push('Failed to load learning story', 'error');
        }
        setStory(null);
        return;
      }
      setStory(data);
    } catch (error) {
      console.error('Error loading learning story:', error);
      const isNetworkError = error.message?.includes('Cannot connect') || error.message?.includes('Failed to fetch');
      if (!isNetworkError) {
        toast.push('Failed to load learning story', 'error');
      }
      setStory(null);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#3b82f6" />
      </View>
    );
  }

  if (!story) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Sparkles size={20} color="#8b5cf6" />
        <Text style={styles.title}>This Week's Learning Story</Text>
      </View>

      {/* LLM-Generated Family Summary */}
      {story.family_summary && (
        <View style={styles.narrativeSection}>
          <Text style={styles.narrativeText}>{story.family_summary}</Text>
        </View>
      )}

      {/* Per-Child Narratives */}
      {story.per_child_summaries && story.per_child_summaries.length > 0 && (
        <View style={styles.section}>
          {story.per_child_summaries.map((childNarrative, idx) => (
            <View key={idx} style={styles.childNarrativeCard}>
              <Text style={styles.childNarrativeName}>{childNarrative.child_name}</Text>
              <Text style={styles.childNarrativeText}>{childNarrative.summary}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Children Summary */}
      {story.children_summary && story.children_summary.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress</Text>
          {story.children_summary.map((child) => (
            <View key={child.child_id} style={styles.childCard}>
              <View style={styles.childRow}>
                <Text style={styles.childName}>{child.child_name}:</Text>
                <View style={styles.childStats}>
                  <Text style={styles.statValue}>{child.completed_this_week}/{child.total_this_week}</Text>
                  <Text style={styles.statLabel}> completed</Text>
                </View>
                {child.best_subject && (
                  <View style={styles.subjectBadge}>
                    <TrendingUp size={14} color="#10b981" />
                    <Text style={styles.subjectText}>{child.best_subject}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Insights */}
      {story.insights && story.insights.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <BookOpen size={16} color="#3b82f6" />
            <Text style={styles.sectionTitle}>Insights</Text>
          </View>
          {story.insights.map((insight, idx) => (
            <Text key={idx} style={styles.insightText}>• {insight}</Text>
          ))}
        </View>
      )}

      {/* Suggestions */}
      {story.suggestions && story.suggestions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Lightbulb size={16} color="#f59e0b" />
            <Text style={styles.sectionTitle}>Try This Next Week</Text>
          </View>
          {story.suggestions.map((suggestion, idx) => (
            <View key={idx} style={styles.suggestionCard}>
              <Text style={styles.suggestionText}>{suggestion.suggestion}</Text>
              {suggestion.subject && (
                <Text style={styles.suggestionMeta}>{suggestion.subject} • {suggestion.child_name}</Text>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Wins */}
      {story.wins && story.wins.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Award size={16} color="#f59e0b" />
            <Text style={styles.sectionTitle}>Your Wins</Text>
          </View>
          {story.wins.map((win, idx) => (
            <View key={idx} style={styles.winCard}>
              <Text style={styles.winText}>{win.description}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 20,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  childCard: {
    marginBottom: 12,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  childName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  childStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  statLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  subjectText: {
    fontSize: 14,
    color: '#374151',
  },
  insightText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
    lineHeight: 20,
    paddingLeft: 4,
  },
  suggestionCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  suggestionText: {
    fontSize: 14,
    color: '#111827',
    marginBottom: 6,
    lineHeight: 20,
  },
  suggestionMeta: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  winCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  winText: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '500',
  },
  narrativeSection: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  narrativeText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#1e293b',
    fontStyle: 'italic',
  },
  childNarrativeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  childNarrativeName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  childNarrativeText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#374151',
  },
});

