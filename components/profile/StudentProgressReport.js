import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Calendar, TrendingUp, BookOpen, Award, Clock } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { supabase } from '../../lib/supabase';
import { getGrades, getAttendanceTimeline } from '../../lib/services/recordsClient';
import GeistCard from '../GeistCard';

export default function StudentProgressReport({ childId, familyId }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [childId]);

  const loadReport = async () => {
    try {
      setLoading(true);
      
      // Get current school year period
      const now = new Date();
      const currentYear = now.getFullYear();
      const month = now.getMonth();
      const schoolYear = month >= 8 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;
      const period = `${schoolYear} School Year`;
      
      // Calculate date range for this school year
      const yearStart = month >= 8 
        ? new Date(currentYear, 8, 1) // September
        : new Date(currentYear - 1, 8, 1);
      const yearEnd = month >= 8
        ? new Date(currentYear + 1, 5, 30) // June
        : new Date(currentYear, 5, 30);
      
      // Load attendance data
      const attendanceData = await getAttendanceTimeline(
        childId,
        yearStart.toISOString().split('T')[0],
        yearEnd.toISOString().split('T')[0]
      );
      
      // Calculate attendance stats
      const totalDays = attendanceData.length;
      const presentDays = attendanceData.filter(a => a.status === 'present' || a.status === 'excused').length;
      const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
      const totalMinutes = attendanceData.reduce((sum, a) => sum + (a.minutes_present || 0), 0);
      const totalHours = Math.round(totalMinutes / 60);
      
      // Load grades
      const grades = await getGrades(childId);
      
      // Group grades by subject
      const subjectMap = new Map();
      grades.forEach(grade => {
        const subjectName = grade.subject?.name || 'Unnamed Subject';
        if (!subjectMap.has(subjectName)) {
          subjectMap.set(subjectName, {
            name: subjectName,
            grades: [],
            averageScore: null,
            averageGrade: null,
          });
        }
        subjectMap.get(subjectName).grades.push(grade);
      });
      
      // Calculate subject progress
      const subjects = Array.from(subjectMap.values()).map(subject => {
        const scores = subject.grades
          .map(g => g.score)
          .filter(s => s != null && !isNaN(s));
        const averageScore = scores.length > 0
          ? scores.reduce((sum, s) => sum + s, 0) / scores.length
          : null;
        
        // Convert average score to percentage if needed
        const progress = averageScore != null 
          ? Math.min(100, Math.max(0, averageScore > 1 ? averageScore : averageScore * 100))
          : 0;
        
        return {
          ...subject,
          averageScore,
          progress: Math.round(progress),
        };
      });
      
      // Load achievements/badges
      const { data: badgesData } = await supabase
        .from('college_readiness')
        .select('readiness_data')
        .eq('child_id', childId)
        .single();
      
      const badges = badgesData?.readiness_data?.badges || [];
      const achievements = Array.isArray(badges) ? badges : [];
      
      setReport({
        period,
        totalHours,
        attendanceRate,
        totalDays,
        presentDays,
        subjects,
        achievements,
        grades: grades.length,
      });
    } catch (error) {
      console.error('Error loading progress report:', error);
      setReport({
        period: '2024-2025 School Year',
        totalHours: 0,
        attendanceRate: 0,
        totalDays: 0,
        presentDays: 0,
        subjects: [],
        achievements: [],
        grades: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: tokens.text }]}>Progress Report</Text>
          <Text style={[styles.subtitle, { color: tokens.textSecondary }]}>
            Personalized student progress and achievement summary
          </Text>
        </View>
      </View>

      {loading ? (
        <Text style={[styles.loading, { color: tokens.textSecondary }]}>Generating report...</Text>
      ) : (
        <ScrollView style={styles.content}>
          <GeistCard variant="medium" style={styles.reportCard}>
            <Text style={[styles.reportTitle, { color: tokens.text }]}>
              {report?.period || 'Progress Report'}
            </Text>
            
            {/* Summary Stats */}
            <View style={styles.statsGrid}>
              <View style={[styles.statBox, { backgroundColor: tokens.bg }]}>
                <Calendar size={24} color={tokens.accent} />
                <Text style={[styles.statValue, { color: tokens.text }]}>
                  {report?.attendanceRate || 0}%
                </Text>
                <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>Attendance</Text>
                <Text style={[styles.statSubtext, { color: tokens.textSecondary }]}>
                  {report?.presentDays || 0} of {report?.totalDays || 0} days
                </Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: tokens.bg }]}>
                <Clock size={24} color={tokens.accent} />
                <Text style={[styles.statValue, { color: tokens.text }]}>
                  {report?.totalHours || 0}
                </Text>
                <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>Hours</Text>
                <Text style={[styles.statSubtext, { color: tokens.textSecondary }]}>
                  This school year
                </Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: tokens.bg }]}>
                <BookOpen size={24} color={tokens.accent} />
                <Text style={[styles.statValue, { color: tokens.text }]}>
                  {report?.grades || 0}
                </Text>
                <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>Grades</Text>
                <Text style={[styles.statSubtext, { color: tokens.textSecondary }]}>
                  Recorded
                </Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: tokens.bg }]}>
                <Award size={24} color={tokens.accent} />
                <Text style={[styles.statValue, { color: tokens.text }]}>
                  {report?.achievements?.length || 0}
                </Text>
                <Text style={[styles.statLabel, { color: tokens.textSecondary }]}>Achievements</Text>
                <Text style={[styles.statSubtext, { color: tokens.textSecondary }]}>
                  Badges earned
                </Text>
              </View>
            </View>

            {/* Subject Progress */}
            {report?.subjects && report.subjects.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: tokens.text }]}>Subject Progress</Text>
                {report.subjects.map((subject, idx) => (
                  <View key={idx} style={styles.subjectRow}>
                    <Text style={[styles.subjectName, { color: tokens.text }]}>
                      {subject.name}
                    </Text>
                    <View style={styles.progressBar}>
                      <View 
                        style={[
                          styles.progressFill, 
                          { 
                            width: `${subject.progress || 0}%`,
                            backgroundColor: tokens.accent,
                          }
                        ]} 
                      />
                    </View>
                    <Text style={[styles.progressText, { color: tokens.textSecondary }]}>
                      {subject.progress || 0}%
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {(!report?.subjects || report.subjects.length === 0) && (
              <View style={styles.emptySection}>
                <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
                  No subject progress data available yet. Start recording grades to see progress here.
                </Text>
              </View>
            )}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
  },
  loading: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  content: {
    flex: 1,
  },
  reportCard: {
    padding: spacing.xl,
  },
  reportTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.xl,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statBox: {
    flex: 1,
    minWidth: 140,
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  statSubtext: {
    fontSize: 11,
  },
  section: {
    marginTop: spacing.lg,
    gap: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '500',
    minWidth: 120,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '500',
    minWidth: 50,
    textAlign: 'right',
  },
  emptySection: {
    marginTop: spacing.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
