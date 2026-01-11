import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { designTokens } from '../../theme/designTokens';
import { supabase } from '../../lib/supabase';
import GeistCard from '../GeistCard';

export default function SkillRadarChart({ childId, familyId }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSkills();
  }, [childId]);

  const loadSkills = async () => {
    try {
      setLoading(true);
      
      // Try to load from skill_coverage_map first
      const { data: coverageData, error: coverageError } = await supabase
        .from('skill_coverage_map')
        .select(`
          skill_name,
          skill_category,
          coverage_level,
          mastery_level,
          subject:subject_id (id, name)
        `)
        .eq('child_id', childId)
        .order('skill_category', { ascending: true });

      if (!coverageError && coverageData && coverageData.length > 0) {
        // Use coverage data
        const skillsList = coverageData.map(skill => ({
          name: skill.skill_name,
          category: skill.skill_category || 'other',
          value: skill.coverage_level || 0,
          mastery: skill.mastery_level,
          subject: skill.subject?.name || null,
        }));
        setSkills(skillsList);
      } else {
        // Fallback: try skill_grades
        const { data: gradesData, error: gradesError } = await supabase
          .from('skill_grades')
          .select('skill, level, subject:subject_id (id, name)')
          .eq('child_id', childId)
          .order('created_at', { ascending: false });

        if (!gradesError && gradesData && gradesData.length > 0) {
          // Aggregate by skill name
          const skillMap = new Map();
          gradesData.forEach(grade => {
            const skillName = grade.skill;
            if (!skillMap.has(skillName)) {
              skillMap.set(skillName, {
                name: skillName,
                values: [],
                subject: grade.subject?.name || null,
              });
            }
            skillMap.get(skillName).values.push(grade.level);
          });

          const skillsList = Array.from(skillMap.values()).map(skill => ({
            name: skill.name,
            category: 'academic',
            value: Math.round((skill.values.reduce((a, b) => a + b, 0) / skill.values.length) * 20), // Convert 0-5 to 0-100
            mastery: skill.values[skill.values.length - 1] >= 4 ? 'mastered' : skill.values[skill.values.length - 1] >= 3 ? 'practicing' : 'introduced',
            subject: skill.subject,
          }));
          setSkills(skillsList);
        } else {
          // Default empty state
          setSkills([]);
        }
      }
    } catch (error) {
      console.error('Error loading skills:', error);
      setSkills([]);
    } finally {
      setLoading(false);
    }
  };

  // Group skills by category
  const groupedSkills = skills.reduce((acc, skill) => {
    const category = skill.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(skill);
    return acc;
  }, {});

  const getMasteryColor = (mastery) => {
    switch (mastery) {
      case 'mastered':
      case 'exceeded':
        return '#10B981'; // green
      case 'practicing':
        return '#3B82F6'; // blue
      case 'introduced':
        return '#F59E0B'; // orange
      default:
        return tokens.accent;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: tokens.text }]}>Skills Radar Chart</Text>
        <Text style={[styles.subtitle, { color: tokens.textSecondary }]}>
          Visual representation of skill strengths across subjects
        </Text>
      </View>

      {loading ? (
        <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading skills data...</Text>
      ) : skills.length === 0 ? (
        <GeistCard variant="medium">
          <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
            No skills data available yet. Skills will appear here as you track progress and assessments.
          </Text>
        </GeistCard>
      ) : (
        <ScrollView style={styles.content}>
          {/* Skills by Category */}
          {Object.entries(groupedSkills).map(([category, categorySkills]) => (
            <GeistCard key={category} variant="medium" style={styles.categoryCard}>
              <Text style={[styles.categoryTitle, { color: tokens.text }]}>
                {category.charAt(0).toUpperCase() + category.slice(1)} Skills
              </Text>
              
              <View style={styles.skillsList}>
                {categorySkills.map((skill, idx) => {
                  const masteryColor = getMasteryColor(skill.mastery);
                  return (
                    <View key={idx} style={styles.skillItem}>
                      <View style={styles.skillInfo}>
                        <View style={styles.skillHeader}>
                          <Text style={[styles.skillName, { color: tokens.text }]}>{skill.name}</Text>
                          {skill.subject && (
                            <Text style={[styles.skillSubject, { color: tokens.textSecondary }]}>
                              {skill.subject}
                            </Text>
                          )}
                        </View>
                        <View style={styles.skillBar}>
                          <View 
                            style={[
                              styles.skillBarFill,
                              {
                                width: `${Math.min(100, Math.max(0, skill.value))}%`,
                                backgroundColor: masteryColor,
                              }
                            ]}
                          />
                        </View>
                      </View>
                      <View style={styles.skillMetrics}>
                        <Text style={[styles.skillValue, { color: tokens.text }]}>
                          {skill.value}%
                        </Text>
                        {skill.mastery && (
                          <View style={[styles.masteryBadge, { backgroundColor: masteryColor + '20' }]}>
                            <Text style={[styles.masteryText, { color: masteryColor }]}>
                              {skill.mastery}
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </GeistCard>
          ))}

          {/* Summary Stats */}
          <GeistCard variant="medium" style={styles.summaryCard}>
            <Text style={[styles.summaryTitle, { color: tokens.text }]}>Summary</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: tokens.text }]}>
                  {skills.length}
                </Text>
                <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Total Skills</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: tokens.text }]}>
                  {Math.round(skills.reduce((sum, s) => sum + s.value, 0) / skills.length) || 0}%
                </Text>
                <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Average</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryValue, { color: tokens.text }]}>
                  {skills.filter(s => s.mastery === 'mastered' || s.mastery === 'exceeded').length}
                </Text>
                <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Mastered</Text>
              </View>
            </View>
          </GeistCard>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: designTokens.fonts.sans,
  },
  loading: {
    textAlign: 'center',
    padding: spacing.xl,
    fontFamily: designTokens.fonts.sans,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
    fontFamily: designTokens.fonts.sans,
  },
  content: {
    flex: 1,
  },
  categoryCard: {
    marginBottom: spacing.lg,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
    marginBottom: spacing.md,
  },
  skillsList: {
    gap: spacing.md,
  },
  skillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skillInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  skillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  skillName: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: designTokens.fonts.sans,
  },
  skillSubject: {
    fontSize: 12,
    fontFamily: designTokens.fonts.sans,
  },
  skillBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  skillBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  skillMetrics: {
    alignItems: 'flex-end',
    gap: spacing.xs,
    minWidth: 80,
  },
  skillValue: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
  },
  masteryBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  masteryText: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: designTokens.fonts.sans,
    textTransform: 'capitalize',
  },
  summaryCard: {
    marginTop: spacing.md,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: designTokens.fonts.display,
    marginBottom: spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: designTokens.fonts.display,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: designTokens.fonts.sans,
  },
});
