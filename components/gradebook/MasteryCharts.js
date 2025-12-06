/**
 * Mastery Charts Component
 * Visualizes mastery progress per student/per unit
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { TrendingUp, BarChart3, PieChart, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function MasteryCharts({ childId, subjectId = null, unitId = null }) {
  const [masteryData, setMasteryData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMasteryData();
  }, [childId, subjectId, unitId]);

  const loadMasteryData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('student_standard_mastery')
        .select(`
          *,
          standard:standards!student_standard_mastery_standard_id_fkey(
            id,
            standard_code,
            standard_text,
            subject,
            grade_level
          ),
          lesson:events!student_standard_mastery_lesson_id_fkey(
            id,
            title
          )
        `)
        .eq('student_id', childId);

      if (subjectId) {
        // Filter by subject through standards
        query = query.eq('standard.subject_id', subjectId);
      }

      const { data, error } = await query.order('updated_at', { ascending: false });

      if (error) throw error;
      setMasteryData(data || []);
    } catch (error) {
      console.error('Error loading mastery data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  // Calculate statistics
  const mastered = masteryData.filter(m => m.mastery_level === 'mastered').length;
  const developing = masteryData.filter(m => m.mastery_level === 'developing').length;
  const needsWork = masteryData.filter(m => m.mastery_level === 'needs_work').length;
  const notAttempted = masteryData.filter(m => m.mastery_level === 'not_attempted').length;
  const total = masteryData.length;

  // Group by subject
  const bySubject = {};
  masteryData.forEach(m => {
    const subj = m.standard?.subject || 'Other';
    if (!bySubject[subj]) {
      bySubject[subj] = { mastered: 0, developing: 0, needsWork: 0, notAttempted: 0, total: 0 };
    }
    bySubject[subj][m.mastery_level]++;
    bySubject[subj].total++;
  });

  // Calculate average score
  const scores = masteryData.filter(m => m.score !== null).map(m => m.score);
  const avgScore = scores.length > 0 
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) 
    : null;

  return (
    <ScrollView style={styles.container}>
      {/* Summary Stats */}
      <View style={styles.summaryRow}>
        <View style={styles.statCard}>
          <Target size={24} color={colors.greenBold} />
          <Text style={styles.statValue}>{mastered}</Text>
          <Text style={styles.statLabel}>Mastered</Text>
        </View>
        <View style={styles.statCard}>
          <TrendingUp size={24} color={colors.blueBold} />
          <Text style={styles.statValue}>{developing}</Text>
          <Text style={styles.statLabel}>Developing</Text>
        </View>
        <View style={styles.statCard}>
          <BarChart3 size={24} color={colors.orangeBold} />
          <Text style={styles.statValue}>{needsWork}</Text>
          <Text style={styles.statLabel}>Needs Work</Text>
        </View>
        {avgScore !== null && (
          <View style={styles.statCard}>
            <PieChart size={24} color={colors.purpleBold} />
            <Text style={styles.statValue}>{avgScore}%</Text>
            <Text style={styles.statLabel}>Avg Score</Text>
          </View>
        )}
      </View>

      {/* Mastery Distribution Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mastery Distribution</Text>
        <View style={styles.chartContainer}>
          {total > 0 && (
            <>
              <View style={styles.chartBar}>
                <View style={styles.chartBarLabel}>
                  <Text style={styles.chartLabel}>Mastered</Text>
                  <Text style={styles.chartValue}>{mastered}</Text>
                </View>
                <View style={styles.chartBarTrack}>
                  <View 
                    style={[
                      styles.chartBarFill, 
                      { 
                        width: `${(mastered / total) * 100}%`, 
                        backgroundColor: colors.greenBold 
                      }
                    ]} 
                  />
                </View>
              </View>
              <View style={styles.chartBar}>
                <View style={styles.chartBarLabel}>
                  <Text style={styles.chartLabel}>Developing</Text>
                  <Text style={styles.chartValue}>{developing}</Text>
                </View>
                <View style={styles.chartBarTrack}>
                  <View 
                    style={[
                      styles.chartBarFill, 
                      { 
                        width: `${(developing / total) * 100}%`, 
                        backgroundColor: colors.blueBold 
                      }
                    ]} 
                  />
                </View>
              </View>
              <View style={styles.chartBar}>
                <View style={styles.chartBarLabel}>
                  <Text style={styles.chartLabel}>Needs Work</Text>
                  <Text style={styles.chartValue}>{needsWork}</Text>
                </View>
                <View style={styles.chartBarTrack}>
                  <View 
                    style={[
                      styles.chartBarFill, 
                      { 
                        width: `${(needsWork / total) * 100}%`, 
                        backgroundColor: colors.orangeBold 
                      }
                    ]} 
                  />
                </View>
              </View>
              <View style={styles.chartBar}>
                <View style={styles.chartBarLabel}>
                  <Text style={styles.chartLabel}>Not Attempted</Text>
                  <Text style={styles.chartValue}>{notAttempted}</Text>
                </View>
                <View style={styles.chartBarTrack}>
                  <View 
                    style={[
                      styles.chartBarFill, 
                      { 
                        width: `${(notAttempted / total) * 100}%`, 
                        backgroundColor: colors.muted 
                      }
                    ]} 
                  />
                </View>
              </View>
            </>
          )}
        </View>
      </View>

      {/* By Subject Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mastery by Subject</Text>
        {Object.entries(bySubject).map(([subjectName, stats]) => {
          const masteredPct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
          return (
            <View key={subjectName} style={styles.subjectCard}>
              <View style={styles.subjectHeader}>
                <Text style={styles.subjectName}>{subjectName}</Text>
                <Text style={styles.subjectPercentage}>{masteredPct}% mastered</Text>
              </View>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { width: `${masteredPct}%`, backgroundColor: colors.greenBold }
                  ]} 
                />
              </View>
              <View style={styles.subjectStats}>
                <View style={styles.statBadge}>
                  <Text style={styles.statBadgeText}>{stats.mastered} mastered</Text>
                </View>
                <View style={styles.statBadge}>
                  <Text style={styles.statBadgeText}>{stats.developing} developing</Text>
                </View>
                <View style={styles.statBadge}>
                  <Text style={styles.statBadgeText}>{stats.needsWork} needs work</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Recent Mastery Updates */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Updates</Text>
        {masteryData.slice(0, 10).map((mastery) => (
          <View key={mastery.id} style={styles.masteryCard}>
            <View style={styles.masteryHeader}>
              <Text style={styles.masteryCode}>{mastery.standard?.standard_code || 'N/A'}</Text>
              <View style={[
                styles.masteryBadge,
                mastery.mastery_level === 'mastered' && { backgroundColor: colors.greenSoft },
                mastery.mastery_level === 'developing' && { backgroundColor: colors.blueSoft },
                mastery.mastery_level === 'needs_work' && { backgroundColor: colors.orangeSoft },
                mastery.mastery_level === 'not_attempted' && { backgroundColor: colors.bgSubtle },
              ]}>
                <Text style={[
                  styles.masteryBadgeText,
                  mastery.mastery_level === 'mastered' && { color: colors.greenBold },
                  mastery.mastery_level === 'developing' && { color: colors.blueBold },
                  mastery.mastery_level === 'needs_work' && { color: colors.orangeBold },
                  mastery.mastery_level === 'not_attempted' && { color: colors.muted },
                ]}>
                  {mastery.mastery_level.replace('_', ' ')}
                </Text>
              </View>
            </View>
            <Text style={styles.masteryText} numberOfLines={2}>
              {mastery.standard?.standard_text || 'No description'}
            </Text>
            {mastery.score !== null && (
              <Text style={styles.masteryScore}>Score: {mastery.score}%</Text>
            )}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  summaryRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    padding: 16,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  chartContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  chartBar: {
    marginBottom: 16,
  },
  chartBarLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chartLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  chartValue: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '600',
  },
  chartBarTrack: {
    height: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 4,
    overflow: 'hidden',
  },
  chartBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  subjectCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  subjectPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.bgSubtle,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  subjectStats: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  statBadge: {
    backgroundColor: colors.bgSubtle,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statBadgeText: {
    fontSize: 12,
    color: colors.muted,
  },
  masteryCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  masteryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  masteryCode: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'monospace',
  },
  masteryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  masteryBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  masteryText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  masteryScore: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
});

