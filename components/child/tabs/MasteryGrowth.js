/**
 * Mastery Growth Component
 * Shows year-over-year mastery growth tracking
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { TrendingUp, Target, BarChart3 } from 'lucide-react';
import { colors } from '../../../theme/colors';
import { supabase } from '../../../lib/supabase';

export default function MasteryGrowth({ childId }) {
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentMastery, setCurrentMastery] = useState(null);

  useEffect(() => {
    if (childId) {
      loadGrowthData();
    }
  }, [childId]);

  const loadGrowthData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all mastery snapshots
      const { data: snapshotsData, error: snapshotsError } = await supabase
        .from('mastery_snapshots')
        .select('*')
        .eq('child_id', childId)
        .order('snapshot_date', { ascending: true });

      if (snapshotsError) throw snapshotsError;

      setSnapshots(snapshotsData || []);

      // Get current mastery data
      const { data: currentMasteryData } = await supabase
        .from('student_standard_mastery')
        .select(`
          *,
          standard:standards!student_standard_mastery_standard_id_fkey(
            id,
            subject_id,
            subject
          )
        `)
        .eq('student_id', childId);

      // Calculate current mastery stats
      if (currentMasteryData && currentMasteryData.length > 0) {
        const mastered = currentMasteryData.filter(m => m.mastery_level === 'mastered').length;
        const total = currentMasteryData.length;
        const avgScore = currentMasteryData
          .filter(m => m.score !== null)
          .reduce((sum, m) => sum + (m.score || 0), 0) / 
          currentMasteryData.filter(m => m.score !== null).length || 0;

        // Group by subject
        const subjectMap = {};
        currentMasteryData.forEach(m => {
          const subject = m.standard?.subject || 'Other';
          if (!subjectMap[subject]) {
            subjectMap[subject] = { total: 0, mastered: 0, scores: [] };
          }
          subjectMap[subject].total++;
          if (m.mastery_level === 'mastered') {
            subjectMap[subject].mastered++;
          }
          if (m.score !== null) {
            subjectMap[subject].scores.push(m.score);
          }
        });

        const subjectStats = Object.entries(subjectMap).map(([subject, stats]) => ({
          subject,
          masteryRate: stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0,
          avgScore: stats.scores.length > 0 
            ? Math.round(stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length) 
            : null
        }));

        setCurrentMastery({
          mastered,
          total,
          masteryRate: total > 0 ? Math.round((mastered / total) * 100) : 0,
          avgScore: avgScore ? Math.round(avgScore) : null,
          subjectStats
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load growth data');
    } finally {
      setLoading(false);
    }
  };

  const getYearFromDate = (dateString) => {
    return new Date(dateString).getFullYear();
  };

  const groupSnapshotsByYear = () => {
    const grouped = {};
    snapshots.forEach(snapshot => {
      const year = getYearFromDate(snapshot.snapshot_date);
      if (!grouped[year]) {
        grouped[year] = [];
      }
      grouped[year].push(snapshot);
    });
    return grouped;
  };

  const calculateYearStats = (yearSnapshots) => {
    if (yearSnapshots.length === 0) return null;

    // Get the latest snapshot for the year
    const latest = yearSnapshots[yearSnapshots.length - 1];
    const masteryData = latest.mastery_data || {};

    // Calculate overall stats
    const skills = masteryData.skills || {};
    const skillCount = Object.keys(skills).length;
    const avgMastery = skillCount > 0
      ? Object.values(skills).reduce((sum, skill) => sum + (skill.mastery_level || 0), 0) / skillCount
      : 0;

    const subjects = masteryData.subjects || {};
    const subjectCount = Object.keys(subjects).length;
    const avgSubjectMastery = subjectCount > 0
      ? Object.values(subjects).reduce((sum, subj) => sum + (subj.avg_mastery || 0), 0) / subjectCount
      : 0;

    return {
      year: getYearFromDate(latest.snapshot_date),
      skillCount,
      avgMastery: Math.round(avgMastery * 10) / 10,
      subjectCount,
      avgSubjectMastery: Math.round(avgSubjectMastery * 10) / 10,
      snapshotDate: latest.snapshot_date
    };
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading growth data...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  const groupedByYear = groupSnapshotsByYear();
  const yearStats = Object.values(groupedByYear)
    .map(yearSnapshots => calculateYearStats(yearSnapshots))
    .filter(Boolean)
    .sort((a, b) => b.year - a.year);

  // Calculate growth trends
  const growthTrends = [];
  for (let i = 1; i < yearStats.length; i++) {
    const current = yearStats[i - 1];
    const previous = yearStats[i];
    const skillGrowth = current.avgMastery - previous.avgMastery;
    const subjectGrowth = current.avgSubjectMastery - previous.avgSubjectMastery;
    growthTrends.push({
      year: current.year,
      skillGrowth: Math.round(skillGrowth * 10) / 10,
      subjectGrowth: Math.round(subjectGrowth * 10) / 10,
      skillCountChange: current.skillCount - previous.skillCount
    });
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TrendingUp size={24} color={colors.primary} />
          <View>
            <Text style={styles.title}>Mastery Growth</Text>
            <Text style={styles.subtitle}>Year-over-year progress tracking</Text>
          </View>
        </View>
      </View>

      {/* Current Mastery */}
      {currentMastery && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Mastery Status</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Target size={20} color={colors.greenBold} />
              <Text style={styles.statValue}>{currentMastery.mastered}</Text>
              <Text style={styles.statLabel}>Standards Mastered</Text>
            </View>
            <View style={styles.statCard}>
              <BarChart3 size={20} color={colors.blueBold} />
              <Text style={styles.statValue}>{currentMastery.masteryRate}%</Text>
              <Text style={styles.statLabel}>Mastery Rate</Text>
            </View>
            {currentMastery.avgScore !== null && (
              <View style={styles.statCard}>
                <TrendingUp size={20} color={colors.orangeBold} />
                <Text style={styles.statValue}>{currentMastery.avgScore}%</Text>
                <Text style={styles.statLabel}>Average Score</Text>
              </View>
            )}
          </View>

          {/* Subject Breakdown */}
          {currentMastery.subjectStats.length > 0 && (
            <View style={styles.subjectSection}>
              <Text style={styles.subsectionTitle}>By Subject</Text>
              {currentMastery.subjectStats.map((stat, index) => (
                <View key={index} style={styles.subjectCard}>
                  <View style={styles.subjectHeader}>
                    <Text style={styles.subjectName}>{stat.subject}</Text>
                    <Text style={styles.subjectRate}>{stat.masteryRate}%</Text>
                  </View>
                  <View style={styles.progressBar}>
                    <View 
                      style={[
                        styles.progressBarFill, 
                        { 
                          width: `${stat.masteryRate}%`,
                          backgroundColor: stat.masteryRate >= 80 ? colors.greenBold : 
                                          stat.masteryRate >= 60 ? colors.blueBold : 
                                          colors.orangeBold
                        }
                      ]} 
                    />
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Year-over-Year Growth */}
      {yearStats.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Year-over-Year Growth</Text>
          {yearStats.map((yearStat, index) => {
            const trend = growthTrends.find(t => t.year === yearStat.year);
            return (
              <View key={yearStat.year} style={styles.yearCard}>
                <View style={styles.yearHeader}>
                  <Text style={styles.yearLabel}>{yearStat.year}</Text>
                  {trend && (
                    <View style={[
                      styles.trendBadge,
                      trend.skillGrowth > 0 ? styles.trendPositive : styles.trendNegative
                    ]}>
                      <TrendingUp 
                        size={14} 
                        color={trend.skillGrowth > 0 ? colors.greenBold : colors.redBold} 
                      />
                      <Text style={[
                        styles.trendText,
                        trend.skillGrowth > 0 ? styles.trendTextPositive : styles.trendTextNegative
                      ]}>
                        {trend.skillGrowth > 0 ? '+' : ''}{trend.skillGrowth}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.yearStats}>
                  <View style={styles.yearStatItem}>
                    <Text style={styles.yearStatLabel}>Avg Skill Mastery</Text>
                    <Text style={styles.yearStatValue}>{yearStat.avgMastery}/5.0</Text>
                  </View>
                  <View style={styles.yearStatItem}>
                    <Text style={styles.yearStatLabel}>Skills Tracked</Text>
                    <Text style={styles.yearStatValue}>{yearStat.skillCount}</Text>
                  </View>
                  <View style={styles.yearStatItem}>
                    <Text style={styles.yearStatLabel}>Subjects</Text>
                    <Text style={styles.yearStatValue}>{yearStat.subjectCount}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {yearStats.length === 0 && (
        <View style={styles.emptySection}>
          <Target size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No Growth Data Yet</Text>
          <Text style={styles.emptyText}>
            Mastery snapshots will appear here as they are created. 
            Create snapshots to track year-over-year growth.
          </Text>
        </View>
      )}
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
  section: {
    padding: 20,
    backgroundColor: colors.card,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    padding: 16,
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
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
    textAlign: 'center',
  },
  subjectSection: {
    marginTop: 16,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  subjectCard: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  subjectRate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  progressBar: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  yearCard: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  yearHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  yearLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  trendPositive: {
    backgroundColor: colors.greenSoft,
  },
  trendNegative: {
    backgroundColor: colors.redSoft,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  trendTextPositive: {
    color: colors.greenBold,
  },
  trendTextNegative: {
    color: colors.redBold,
  },
  yearStats: {
    flexDirection: 'row',
    gap: 12,
  },
  yearStatItem: {
    flex: 1,
  },
  yearStatLabel: {
    fontSize: 11,
    color: colors.muted,
    marginBottom: 4,
  },
  yearStatValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptySection: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
});

