/**
 * Standards Coverage Analytics Dashboard
 * Shows coverage analytics for standards per student/subject
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { BarChart3, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';
import { getStandardsCoverage } from '../../lib/services/gradebookClient';
import { colors } from '../../theme/colors';

export default function StandardsCoverageDashboard({ childId, subject = null, stateCode = null, gradeLevel = null }) {
  const [coverage, setCoverage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ subject, state_code: stateCode, grade_level: gradeLevel });

  useEffect(() => {
    loadCoverage();
  }, [childId, filters]);

  const loadCoverage = async () => {
    setLoading(true);
    try {
      const result = await getStandardsCoverage(childId, filters);
      
      // Handle apiRequest format: { data, error }
      const coverageData = result?.data || (result?.error ? null : result);
      
      // Ensure coverage is always an array
      setCoverage(Array.isArray(coverageData) ? coverageData : []);
      
      if (result?.error) {
      }
    } catch (error) {
      setCoverage([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.text} />
        <Text style={styles.loadingText}>Loading standards coverage...</Text>
      </View>
    );
  }

  // Safety checks - ensure coverage is always an array
  const safeCoverage = Array.isArray(coverage) ? coverage : [];
  
  const mastered = safeCoverage.filter(s => s.is_mastered).length;
  const total = safeCoverage.length;
  const coveragePercentage = total > 0 ? Math.round((mastered / total) * 100) : 0;
  const needsWork = safeCoverage.filter(s => s.mastery_records_count > 0 && !s.is_mastered).length;
  const notAttempted = safeCoverage.filter(s => s.mastery_records_count === 0).length;

  // Group by subject
  const bySubject = {};
  safeCoverage.forEach(standard => {
    const subj = standard.subject || 'Other';
    if (!bySubject[subj]) {
      bySubject[subj] = { total: 0, mastered: 0, needsWork: 0, notAttempted: 0 };
    }
    bySubject[subj].total++;
    if (standard.is_mastered) {
      bySubject[subj].mastered++;
    } else if (standard.mastery_records_count > 0) {
      bySubject[subj].needsWork++;
    } else {
      bySubject[subj].notAttempted++;
    }
  });

  return (
    <ScrollView style={styles.container}>
      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{coveragePercentage}%</Text>
          <Text style={styles.summaryLabel}>Coverage</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{mastered}</Text>
          <Text style={styles.summaryLabel}>Mastered</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{needsWork}</Text>
          <Text style={styles.summaryLabel}>Needs Work</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{notAttempted}</Text>
          <Text style={styles.summaryLabel}>Not Started</Text>
        </View>
      </View>

      {/* Coverage Bar */}
      <View style={styles.coverageBarContainer}>
        <View style={styles.coverageBar}>
          <View 
            style={[styles.coverageBarFill, { width: `${coveragePercentage}%`, backgroundColor: colors.greenBold }]} 
          />
        </View>
        <Text style={styles.coverageText}>{mastered} of {total} standards mastered</Text>
      </View>

      {/* By Subject Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Coverage by Subject</Text>
        {Object.entries(bySubject).map(([subjectName, stats]) => {
          const subjectPercentage = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
          return (
            <View key={subjectName} style={styles.subjectCard}>
              <View style={styles.subjectHeader}>
                <Text style={styles.subjectName}>{subjectName}</Text>
                <Text style={styles.subjectPercentage}>{subjectPercentage}%</Text>
              </View>
              <View style={styles.subjectBar}>
                <View 
                  style={[
                    styles.subjectBarFill, 
                    { width: `${subjectPercentage}%`, backgroundColor: colors.greenBold }
                  ]} 
                />
              </View>
              <View style={styles.subjectStats}>
                <View style={styles.statItem}>
                  <CheckCircle size={14} color={colors.greenBold} />
                  <Text style={styles.statText}>{stats.mastered} mastered</Text>
                </View>
                <View style={styles.statItem}>
                  <AlertCircle size={14} color={colors.orangeBold} />
                  <Text style={styles.statText}>{stats.needsWork} needs work</Text>
                </View>
                <View style={styles.statItem}>
                  <BarChart3 size={14} color={colors.muted} />
                  <Text style={styles.statText}>{stats.notAttempted} not started</Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Standards List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Standards Details</Text>
        {safeCoverage.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No standards data available</Text>
            <Text style={styles.emptySubtext}>Standards coverage will appear here once data is available</Text>
          </View>
        ) : (
          safeCoverage.map((standard) => (
          <View key={standard.standard_id} style={styles.standardCard}>
            <View style={styles.standardHeader}>
              <Text style={styles.standardCode}>{standard.standard_code}</Text>
              {standard.is_mastered ? (
                <View style={[styles.statusBadge, { backgroundColor: colors.greenSoft }]}>
                  <CheckCircle size={14} color={colors.greenBold} />
                  <Text style={[styles.statusText, { color: colors.greenBold }]}>Mastered</Text>
                </View>
              ) : standard.mastery_records_count > 0 ? (
                <View style={[styles.statusBadge, { backgroundColor: colors.orangeSoft }]}>
                  <AlertCircle size={14} color={colors.orangeBold} />
                  <Text style={[styles.statusText, { color: colors.orangeBold }]}>Needs Work</Text>
                </View>
              ) : (
                <View style={[styles.statusBadge, { backgroundColor: colors.bgSubtle }]}>
                  <BarChart3 size={14} color={colors.muted} />
                  <Text style={[styles.statusText, { color: colors.muted }]}>Not Started</Text>
                </View>
              )}
            </View>
            <Text style={styles.standardText}>{standard.standard_text}</Text>
            <View style={styles.standardMeta}>
              <Text style={styles.metaText}>
                {standard.lessons_covering_count} lesson{standard.lessons_covering_count !== 1 ? 's' : ''} covering
              </Text>
              {standard.highest_score !== null && (
                <Text style={styles.metaText}>Score: {standard.highest_score}%</Text>
              )}
            </View>
          </View>
          ))
        )}
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
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  coverageBarContainer: {
    padding: 16,
    paddingTop: 0,
  },
  coverageBar: {
    height: 8,
    backgroundColor: colors.bgSubtle,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  coverageBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  coverageText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
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
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  subjectBar: {
    height: 6,
    backgroundColor: colors.bgSubtle,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  subjectBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  subjectStats: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12,
    color: colors.muted,
  },
  standardCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  standardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  standardCode: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    fontFamily: 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  standardText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 8,
  },
  standardMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  metaText: {
    fontSize: 12,
    color: colors.muted,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 12,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
});

