/**
 * Skills Tab Component
 * Displays inferred skills with radar chart and recommended next steps
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Target, TrendingUp, Lightbulb, RefreshCw } from 'lucide-react';
import { colors } from '../../../theme/colors';
import { supabase } from '../../../lib/supabase';
import SkillsRadarChart from './SkillsRadarChart';

export default function SkillsTab({ child }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    if (child?.id) {
      loadSkills();
    }
  }, [child?.id]);

  const loadSkills = async () => {
    try {
      setLoading(true);
      setError(null);

      // Call infer_skills RPC
      const { data, error: rpcError } = await supabase.rpc('infer_skills', {
        p_child_id: child.id
      });

      if (rpcError) {
        throw rpcError;
      }

      setSkills(data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading skills:', err);
      setError(err.message || 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  const getLevelColor = (level) => {
    if (level >= 4) return colors.greenBold;
    if (level >= 3) return colors.blueBold;
    if (level >= 2) return colors.orangeBold;
    return colors.redBold;
  };

  const getLevelLabel = (level) => {
    if (level >= 4.5) return 'Expert';
    if (level >= 3.5) return 'Advanced';
    if (level >= 2.5) return 'Proficient';
    if (level >= 1.5) return 'Developing';
    if (level >= 0.5) return 'Beginner';
    return 'Novice';
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Analyzing skills...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSkills}>
            <RefreshCw size={16} color={colors.card} />
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (skills.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Target size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No Skills Detected Yet</Text>
          <Text style={styles.emptyText}>
            Skills will be inferred as your child completes assignments, events, and activities.
          </Text>
          <TouchableOpacity style={styles.refreshButton} onPress={loadSkills}>
            <RefreshCw size={16} color={colors.primary} />
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Group skills by level for recommendations
  const highSkills = skills.filter(s => s.level >= 4);
  const developingSkills = skills.filter(s => s.level >= 2 && s.level < 4);
  const lowSkills = skills.filter(s => s.level < 2);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Target size={24} color={colors.primary} />
          <View>
            <Text style={styles.title}>Skills</Text>
            {lastUpdated && (
              <Text style={styles.subtitle}>
                Updated {lastUpdated.toLocaleTimeString()}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={loadSkills}>
          <RefreshCw size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Radar Chart */}
      {skills.length > 0 && (
        <View style={styles.chartContainer}>
          <SkillsRadarChart skills={skills} />
        </View>
      )}

      {/* Skills List */}
      <View style={styles.skillsList}>
        {skills.map((skill, idx) => (
          <View key={idx} style={styles.skillCard}>
            <View style={styles.skillHeader}>
              <View style={styles.skillInfo}>
                <Text style={styles.skillName}>{skill.skill}</Text>
                <View style={styles.skillMeta}>
                  <View style={[styles.levelBadge, { backgroundColor: getLevelColor(skill.level) }]}>
                    <Text style={styles.levelText}>{getLevelLabel(skill.level)}</Text>
                  </View>
                  <Text style={styles.confidenceText}>
                    {Math.round(skill.confidence * 100)}% confidence
                  </Text>
                </View>
              </View>
              <View style={styles.levelIndicator}>
                <View style={styles.levelBar}>
                  <View 
                    style={[
                      styles.levelFill, 
                      { 
                        width: `${(skill.level / 5) * 100}%`,
                        backgroundColor: getLevelColor(skill.level)
                      }
                    ]} 
                  />
                </View>
                <Text style={styles.levelValue}>{skill.level.toFixed(1)}/5</Text>
              </View>
            </View>

            {/* Recommended Steps */}
            {skill.recommended_steps && skill.recommended_steps.length > 0 && (
              <View style={styles.recommendationsContainer}>
                <View style={styles.recommendationsHeader}>
                  <Lightbulb size={16} color={colors.orangeBold} />
                  <Text style={styles.recommendationsTitle}>Recommended Next Steps</Text>
                </View>
                {skill.recommended_steps.map((step, stepIdx) => (
                  <View key={stepIdx} style={styles.recommendationItem}>
                    <View style={styles.recommendationDot} />
                    <Text style={styles.recommendationText}>{step}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <TrendingUp size={20} color={colors.greenBold} />
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>Strong Areas</Text>
            <Text style={styles.summaryValue}>{highSkills.length} skills</Text>
          </View>
        </View>
        <View style={styles.summaryCard}>
          <Target size={20} color={colors.blueBold} />
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>Developing</Text>
            <Text style={styles.summaryValue}>{developingSkills.length} skills</Text>
          </View>
        </View>
        <View style={styles.summaryCard}>
          <Lightbulb size={20} color={colors.orangeBold} />
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>Need Support</Text>
            <Text style={styles.summaryValue}>{lowSkills.length} skills</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSubtle,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.muted,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 14,
    color: colors.redBold,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.card,
  },
  emptyContainer: {
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 2,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.bgSubtle,
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.primary,
    marginLeft: 6,
  },
  chartContainer: {
    padding: 20,
    backgroundColor: colors.card,
    marginBottom: 12,
  },
  skillsList: {
    padding: 20,
    gap: 12,
  },
  skillCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillHeader: {
    marginBottom: 12,
  },
  skillInfo: {
    marginBottom: 8,
  },
  skillName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  skillMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.card,
  },
  confidenceText: {
    fontSize: 12,
    color: colors.muted,
  },
  levelIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 4,
    overflow: 'hidden',
  },
  levelFill: {
    height: '100%',
    borderRadius: 4,
  },
  levelValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    minWidth: 40,
    textAlign: 'right',
  },
  recommendationsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  recommendationsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  recommendationsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 6,
  },
  recommendationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.orangeBold,
    marginTop: 6,
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingTop: 0,
  },
  summaryCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
});

