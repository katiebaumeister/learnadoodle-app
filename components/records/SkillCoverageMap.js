/**
 * Skill Coverage Map Component
 * Visual map of skill coverage across subjects
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Map, Target, TrendingUp, BookOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function SkillCoverageMap({ childId, familyId, subjectId }) {
  const [loading, setLoading] = useState(true);
  const [skillsData, setSkillsData] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [viewMode, setViewMode] = useState('coverage'); // 'coverage' or 'mastery'

  useEffect(() => {
    loadSkillsData();
  }, [childId, familyId, subjectId]);

  const loadSkillsData = async () => {
    if (!childId || !familyId) return;

    setLoading(true);
    try {
      // Get skill coverage data
      let query = supabase
        .from('skill_coverage_map')
        .select(`
          id,
          subject_id,
          skill_name,
          skill_category,
          coverage_level,
          mastery_level,
          evidence_count,
          last_assessed_at,
          subject:subject_id (
            id,
            name
          )
        `)
        .eq('child_id', childId);

      if (subjectId) {
        query = query.eq('subject_id', subjectId);
      }

      const { data, error } = await query.order('skill_category', { ascending: true });

      if (error) throw error;

      // Group by category
      const categoryMap = {};
      data?.forEach((skill) => {
        const category = skill.skill_category || 'other';
        if (!categoryMap[category]) {
          categoryMap[category] = [];
        }
        categoryMap[category].push(skill);
      });

      setSkillsData(Object.entries(categoryMap).map(([category, skills]) => ({
        category,
        skills,
        avgCoverage: skills.reduce((sum, s) => sum + (s.coverage_level || 0), 0) / skills.length,
        avgMastery: skills.filter(s => s.mastery_level === 'mastered').length / skills.length,
      })));
    } catch (error) {
      console.error('Error loading skills data:', error);
      // If table doesn't exist, show empty state
      setSkillsData([]);
    } finally {
      setLoading(false);
    }
  };

  const getMasteryColor = (masteryLevel) => {
    switch (masteryLevel) {
      case 'mastered':
        return colors.greenBold;
      case 'exceeded':
        return colors.violetBold;
      case 'practicing':
        return colors.blueBold;
      case 'introduced':
        return colors.orangeBold;
      default:
        return colors.textSecondary;
    }
  };

  const getMasteryLabel = (masteryLevel) => {
    switch (masteryLevel) {
      case 'mastered':
        return 'Mastered';
      case 'exceeded':
        return 'Exceeded';
      case 'practicing':
        return 'Practicing';
      case 'introduced':
        return 'Introduced';
      default:
        return 'Not Started';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* View Mode Toggle */}
      <View style={styles.viewModeSelector}>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'coverage' && styles.viewModeButtonActive]}
          onPress={() => setViewMode('coverage')}
        >
          <Target size={16} color={viewMode === 'coverage' ? colors.white : colors.textSecondary} />
          <Text style={[styles.viewModeText, viewMode === 'coverage' && styles.viewModeTextActive]}>
            Coverage
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'mastery' && styles.viewModeButtonActive]}
          onPress={() => setViewMode('mastery')}
        >
          <TrendingUp size={16} color={viewMode === 'mastery' ? colors.white : colors.textSecondary} />
          <Text style={[styles.viewModeText, viewMode === 'mastery' && styles.viewModeTextActive]}>
            Mastery
          </Text>
        </TouchableOpacity>
      </View>

      {skillsData.length === 0 ? (
        <View style={styles.emptyState}>
          <Map size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No skill coverage data</Text>
          <Text style={styles.emptySubtext}>
            Skill coverage data will appear as you track learning activities
          </Text>
        </View>
      ) : (
        skillsData.map((categoryData) => (
          <View key={categoryData.category} style={styles.categorySection}>
            <TouchableOpacity
              style={styles.categoryHeader}
              onPress={() =>
                setSelectedCategory(
                  selectedCategory === categoryData.category ? null : categoryData.category
                )
              }
            >
              <Text style={styles.categoryTitle}>
                {categoryData.category.charAt(0).toUpperCase() + categoryData.category.slice(1)}
              </Text>
              <View style={styles.categoryStats}>
                {viewMode === 'coverage' ? (
                  <Text style={styles.categoryStat}>
                    {Math.round(categoryData.avgCoverage)}% coverage
                  </Text>
                ) : (
                  <Text style={styles.categoryStat}>
                    {Math.round(categoryData.avgMastery * 100)}% mastered
                  </Text>
                )}
              </View>
            </TouchableOpacity>

            {selectedCategory === categoryData.category && (
              <View style={styles.skillsList}>
                {categoryData.skills.map((skill) => (
                  <View key={skill.id} style={styles.skillCard}>
                    <View style={styles.skillHeader}>
                      <Text style={styles.skillName}>{skill.skill_name}</Text>
                      {skill.subject && (
                        <Text style={styles.skillSubject}>{skill.subject.name}</Text>
                      )}
                    </View>

                    {viewMode === 'coverage' ? (
                      <View style={styles.coverageBar}>
                        <View
                          style={[
                            styles.coverageFill,
                            {
                              width: `${skill.coverage_level || 0}%`,
                              backgroundColor:
                                (skill.coverage_level || 0) >= 80
                                  ? colors.greenBold
                                  : (skill.coverage_level || 0) >= 50
                                  ? colors.blueBold
                                  : colors.orangeBold,
                            },
                          ]}
                        />
                        <Text style={styles.coverageText}>{skill.coverage_level || 0}%</Text>
                      </View>
                    ) : (
                      <View style={styles.masteryBadge}>
                        <View
                          style={[
                            styles.masteryDot,
                            { backgroundColor: getMasteryColor(skill.mastery_level) },
                          ]}
                        />
                        <Text style={styles.masteryText}>
                          {getMasteryLabel(skill.mastery_level)}
                        </Text>
                      </View>
                    )}

                    {skill.evidence_count > 0 && (
                      <Text style={styles.evidenceText}>
                        {skill.evidence_count} piece{skill.evidence_count !== 1 ? 's' : ''} of
                        evidence
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        ))
      )}
    </ScrollView>
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
  viewModeSelector: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    paddingBottom: 0,
  },
  viewModeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewModeButtonActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  viewModeText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  viewModeTextActive: {
    color: colors.white,
  },
  emptyState: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  categorySection: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  categoryStats: {
    alignItems: 'flex-end',
  },
  categoryStat: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.indigo,
  },
  skillsList: {
    marginTop: 8,
    gap: 8,
  },
  skillCard: {
    backgroundColor: colors.panel,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  skillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  skillName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
  },
  skillSubject: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  coverageBar: {
    height: 24,
    backgroundColor: colors.background,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 4,
  },
  coverageFill: {
    height: '100%',
    borderRadius: 4,
  },
  coverageText: {
    position: 'absolute',
    right: 8,
    top: 4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  masteryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  masteryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  masteryText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  evidenceText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
});

