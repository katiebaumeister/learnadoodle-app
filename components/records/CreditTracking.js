/**
 * Credit Tracking Component
 * Dedicated UI for high school credit tracking with detailed breakdown
 */
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Award, TrendingUp, BookOpen, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';

export default function CreditTracking({ childId, familyId, dateRange }) {
  const [loading, setLoading] = useState(true);
  const [creditsData, setCreditsData] = useState([]);
  const [totalEarned, setTotalEarned] = useState(0);
  const [totalPlanned, setTotalPlanned] = useState(0);
  const [gpa, setGpa] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState(null);

  useEffect(() => {
    loadCreditsData();
  }, [childId, familyId, dateRange]);

  const loadCreditsData = async () => {
    if (!childId || !familyId) return;

    setLoading(true);
    try {
      // Get grades with credits
      const { data: grades, error } = await supabase
        .from('grades')
        .select(`
          id,
          subject_id,
          term_label,
          grade,
          score,
          credits,
          gpa_type,
          weight_multiplier,
          course_rigor_notes,
          created_at,
          subject:subject_id (
            id,
            name
          )
        `)
        .eq('child_id', childId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by subject
      const subjectMap = {};
      let totalEarnedCredits = 0;
      let totalPlannedCredits = 0;

      grades?.forEach((grade) => {
        const subjectId = grade.subject_id || 'unassigned';
        const subjectName = grade.subject?.name || 'Unassigned';
        const credits = parseFloat(grade.credits) || 0;

        if (!subjectMap[subjectId]) {
          subjectMap[subjectId] = {
            subjectId,
            subjectName,
            earned: 0,
            planned: 0,
            grades: [],
            gpaType: grade.gpa_type || 'unweighted',
            weightMultiplier: grade.weight_multiplier || 1.0,
          };
        }

        subjectMap[subjectId].earned += credits;
        subjectMap[subjectId].grades.push(grade);
        totalEarnedCredits += credits;
      });

      // Calculate planned credits (estimate as 20% more than earned, or use a target)
      Object.keys(subjectMap).forEach((subjectId) => {
        const subject = subjectMap[subjectId];
        subject.planned = Math.max(subject.earned * 1.2, subject.earned);
        totalPlannedCredits += subject.planned;
      });

      setCreditsData(Object.values(subjectMap));
      setTotalEarned(totalEarnedCredits);
      setTotalPlanned(totalPlannedCredits);

      // Calculate GPA
      const gpaResult = await supabase.rpc('calculate_gpa', {
        p_child_id: childId,
        p_start_date: dateRange?.start?.toISOString().split('T')[0] || null,
        p_end_date: dateRange?.end?.toISOString().split('T')[0] || null,
        p_gpa_type: 'unweighted',
      });

      if (gpaResult.data) {
        setGpa(parseFloat(gpaResult.data));
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercentage = (earned, planned) => {
    if (planned === 0) return 0;
    return Math.min(100, Math.round((earned / planned) * 100));
  };

  const getStatusColor = (percentage) => {
    if (percentage >= 100) return colors.greenBold;
    if (percentage >= 75) return colors.blueBold;
    if (percentage >= 50) return colors.orangeBold;
    return colors.redBold;
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
      {/* Summary Cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Award size={24} color={colors.indigo} />
          <Text style={styles.summaryValue}>{totalEarned.toFixed(1)}</Text>
          <Text style={styles.summaryLabel}>Credits Earned</Text>
        </View>
        <View style={styles.summaryCard}>
          <TrendingUp size={24} color={colors.greenBold} />
          <Text style={styles.summaryValue}>{totalPlanned.toFixed(1)}</Text>
          <Text style={styles.summaryLabel}>Credits Planned</Text>
        </View>
        {gpa && (
          <View style={styles.summaryCard}>
            <BookOpen size={24} color={colors.violetBold} />
            <Text style={styles.summaryValue}>{gpa.toFixed(2)}</Text>
            <Text style={styles.summaryLabel}>GPA</Text>
          </View>
        )}
      </View>

      {/* Credits by Subject */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Credits by Subject</Text>
        {creditsData.length === 0 ? (
          <View style={styles.emptyState}>
            <AlertCircle size={48} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No credits recorded yet</Text>
            <Text style={styles.emptySubtext}>Add grades to start tracking credits</Text>
          </View>
        ) : (
          creditsData.map((subject) => {
            const progress = getProgressPercentage(subject.earned, subject.planned);
            const statusColor = getStatusColor(progress);

            return (
              <TouchableOpacity
                key={subject.subjectId}
                style={styles.subjectCard}
                onPress={() => setSelectedSubject(selectedSubject === subject.subjectId ? null : subject.subjectId)}
              >
                <View style={styles.subjectHeader}>
                  <View style={styles.subjectInfo}>
                    <Text style={styles.subjectName}>{subject.subjectName}</Text>
                    <Text style={styles.subjectCredits}>
                      {subject.earned.toFixed(1)} / {subject.planned.toFixed(1)} credits
                    </Text>
                  </View>
                  <View style={styles.progressCircle}>
                    <Text style={[styles.progressText, { color: statusColor }]}>{progress}%</Text>
                  </View>
                </View>

                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${progress}%`, backgroundColor: statusColor },
                    ]}
                  />
                </View>

                {selectedSubject === subject.subjectId && (
                  <View style={styles.subjectDetails}>
                    <Text style={styles.detailsTitle}>Grade Details</Text>
                    {subject.grades.map((grade, idx) => (
                      <View key={idx} style={styles.gradeRow}>
                        <Text style={styles.gradeTerm}>{grade.term_label || 'No term'}</Text>
                        <Text style={styles.gradeValue}>{grade.grade || 'N/A'}</Text>
                        <Text style={styles.gradeCredits}>{grade.credits || 0} credits</Text>
                        {grade.course_rigor_notes && (
                          <Text style={styles.rigorNotes}>{grade.course_rigor_notes}</Text>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </View>

      {/* Credit Requirements Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>High School Credit Requirements</Text>
        <Text style={styles.infoText}>
          Typical high school graduation requires 20-24 credits total, including:
        </Text>
        <View style={styles.requirementsList}>
          <Text style={styles.requirementItem}>• English: 4 credits</Text>
          <Text style={styles.requirementItem}>• Mathematics: 3-4 credits</Text>
          <Text style={styles.requirementItem}>• Science: 3-4 credits</Text>
          <Text style={styles.requirementItem}>• Social Studies: 3-4 credits</Text>
          <Text style={styles.requirementItem}>• Electives: 6-8 credits</Text>
        </View>
        <Text style={styles.infoNote}>
          Check your state and school district requirements for specific credit requirements.
        </Text>
      </View>
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
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 0,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
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
  },
  subjectCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  subjectHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subjectInfo: {
    flex: 1,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subjectCredits: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  progressCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.panel,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    backgroundColor: colors.panel,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  subjectDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  gradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  gradeTerm: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  gradeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginRight: 16,
  },
  gradeCredits: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  rigorNotes: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: 4,
    width: '100%',
  },
  infoCard: {
    backgroundColor: colors.panel,
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginTop: 0,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  requirementsList: {
    marginBottom: 12,
  },
  requirementItem: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoNote: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});

