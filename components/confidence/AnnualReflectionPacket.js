import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Download, FileText, Award, Clock, TrendingUp, BookOpen } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getReadinessMeter, getStudentStreak } from '../../lib/apiClient';
import { useToast } from '../Toast';
import { supabase } from '../../lib/supabase';

/**
 * Annual Reflection Packet Component
 * Combines attendance, credits, artifacts, strengths, progress summaries,
 * year-plan achievement, learning velocity history, and material engagement
 * into a polished end-of-year confidence report
 */
export default function AnnualReflectionPacket({ childId, childName, familyId, year = null }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [generating, setGenerating] = useState(false);
  const toast = useToast();

  const reportYear = year || new Date().getFullYear();
  const yearStart = new Date(reportYear, 0, 1);
  const yearEnd = new Date(reportYear, 11, 31);

  useEffect(() => {
    loadData();
  }, [childId, reportYear]);

  const loadData = async () => {
    if (!childId || !familyId) return;
    setLoading(true);
    try {
      // Load readiness meter data
      const { data: readinessData, error: readinessError } = await getReadinessMeter(childId);
      if (readinessError) throw readinessError;

      // Load streak data
      const { data: streakData, error: streakError } = await getStudentStreak(childId, 365);
      if (streakError) throw streakError;

      // Load additional year data
      const [attendanceRes, eventsRes, outcomesRes, uploadsRes, gradesRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('day_date, minutes, status')
          .eq('child_id', childId)
          .gte('day_date', yearStart.toISOString().split('T')[0])
          .lte('day_date', yearEnd.toISOString().split('T')[0]),
        supabase
          .from('events')
          .select('id, title, status, subject_id, start_ts, end_ts')
          .eq('child_id', childId)
          .gte('start_ts', yearStart.toISOString())
          .lte('start_ts', yearEnd.toISOString()),
        supabase
          .from('event_outcomes')
          .select('rating, strengths, struggles, note')
          .eq('child_id', childId)
          .gte('created_at', yearStart.toISOString())
          .lte('created_at', yearEnd.toISOString()),
        supabase
          .from('uploads')
          .select('id, subject_id, caption, created_at')
          .eq('child_id', childId)
          .gte('created_at', yearStart.toISOString())
          .lte('created_at', yearEnd.toISOString()),
        supabase
          .from('grades')
          .select('subject_id, grade, credits, term_label, notes')
          .eq('child_id', childId)
          .gte('created_at', yearStart.toISOString())
          .lte('created_at', yearEnd.toISOString()),
      ]);

      // Aggregate strengths and struggles
      const allStrengths = [];
      const allStruggles = [];
      (outcomesRes.data || []).forEach(outcome => {
        if (outcome.strengths) allStrengths.push(...outcome.strengths);
        if (outcome.struggles) allStruggles.push(...outcome.struggles);
      });

      // Count strengths/struggles
      const strengthCounts = {};
      const struggleCounts = {};
      allStrengths.forEach(s => strengthCounts[s] = (strengthCounts[s] || 0) + 1);
      allStruggles.forEach(s => struggleCounts[s] = (struggleCounts[s] || 0) + 1);

      const topStrengths = Object.entries(strengthCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([strength]) => strength);

      const completedEvents = (eventsRes.data || []).filter(e => e.status === 'done');
      const totalMinutes = completedEvents.reduce((sum, e) => {
        if (e.start_ts && e.end_ts) {
          const start = new Date(e.start_ts);
          const end = new Date(e.end_ts);
          return sum + Math.round((end - start) / 1000 / 60);
        }
        return sum;
      }, 0);

      setData({
        readiness: readinessData,
        streak: streakData,
        attendance: {
          days: (attendanceRes.data || []).filter(a => a.status === 'present').length,
          minutes: (attendanceRes.data || []).reduce((sum, a) => sum + (a.minutes || 0), 0),
        },
        events: {
          total: (eventsRes.data || []).length,
          completed: completedEvents.length,
          totalMinutes,
        },
        outcomes: {
          total: (outcomesRes.data || []).length,
          avgRating: (outcomesRes.data || []).reduce((sum, o) => sum + (o.rating || 0), 0) / Math.max(1, (outcomesRes.data || []).length),
          topStrengths,
        },
        uploads: {
          total: (uploadsRes.data || []).length,
        },
        grades: gradesRes.data || [],
      });
    } catch (error) {
      console.error('Error loading annual reflection data:', error);
      toast.push('Failed to load reflection data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    setGenerating(true);
    try {
      // TODO: Implement PDF generation service
      toast.push('PDF generation coming soon!', 'info');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.push('Failed to generate PDF', 'error');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading reflection data...</Text>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No data available for {reportYear}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>End of Year Confidence Report</Text>
          <Text style={styles.subtitle}>{childName} • {reportYear}</Text>
        </View>
        <TouchableOpacity 
          style={styles.downloadButton}
          onPress={generatePDF}
          disabled={generating}
        >
          <Download size={18} color="#ffffff" />
          <Text style={styles.downloadText}>Export PDF</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Summary</Text>
        <Text style={styles.summaryText}>
          This year, {childName} completed {data.events.completed} learning sessions, 
          logged {data.attendance.days} days of attendance, and added {data.uploads.total} portfolio artifacts. 
          {data.outcomes.avgRating > 0 && ` Average session rating: ${data.outcomes.avgRating.toFixed(1)}/5.`}
        </Text>
      </View>

      {/* Attendance */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Clock size={20} color={colors.accent} />
          <Text style={styles.sectionTitle}>Attendance</Text>
        </View>
        <View style={styles.metricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{data.attendance.days}</Text>
            <Text style={styles.metricLabel}>Days logged</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{Math.round(data.attendance.minutes / 60)}</Text>
            <Text style={styles.metricLabel}>Hours total</Text>
          </View>
        </View>
      </View>

      {/* Credits */}
      {data.readiness?.credits_by_subject && Object.keys(data.readiness.credits_by_subject).length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Award size={20} color={colors.accent} />
            <Text style={styles.sectionTitle}>Credits by Subject</Text>
          </View>
          {Object.entries(data.readiness.credits_by_subject).map(([subject, creditData]) => (
            <View key={subject} style={styles.subjectRow}>
              <Text style={styles.subjectName}>{subject}</Text>
              <Text style={styles.creditValue}>{(creditData?.credits || 0).toFixed(1)} credits</Text>
            </View>
          ))}
        </View>
      )}

      {/* Notable Strengths */}
      {data.outcomes.topStrengths.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <TrendingUp size={20} color={colors.accent} />
            <Text style={styles.sectionTitle}>Notable Strengths</Text>
          </View>
          {data.outcomes.topStrengths.map((strength, idx) => (
            <View key={idx} style={styles.strengthItem}>
              <Text style={styles.strengthText}>• {strength}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Portfolio Artifacts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <FileText size={20} color={colors.accent} />
          <Text style={styles.sectionTitle}>Portfolio Evidence</Text>
        </View>
        <Text style={styles.artifactCount}>{data.uploads.total} artifacts captured</Text>
        {data.readiness?.evidence_by_subject && Object.keys(data.readiness.evidence_by_subject).length > 0 && (
          <View style={styles.evidenceBreakdown}>
            {Object.entries(data.readiness.evidence_by_subject).map(([subject, evidenceData]) => (
              <View key={subject} style={styles.evidenceRow}>
                <Text style={styles.evidenceSubject}>{subject}</Text>
                <Text style={styles.evidenceCount}>{evidenceData?.total_artifacts || 0} artifacts</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Year Plan Achievement */}
      {data.readiness?.pacing_data && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <BookOpen size={20} color={colors.accent} />
            <Text style={styles.sectionTitle}>Year Plan Achievement</Text>
          </View>
          <Text style={styles.pacingText}>
            Completed {data.readiness.pacing_data.completed_modules || 0} of {data.readiness.pacing_data.planned_modules || 0} planned modules.
          </Text>
        </View>
      )}

      {/* Learning Velocity */}
      {data.readiness?.velocity_by_subject && Object.keys(data.readiness.velocity_by_subject).length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <TrendingUp size={20} color={colors.accent} />
            <Text style={styles.sectionTitle}>Learning Velocity</Text>
          </View>
          {Object.entries(data.readiness.velocity_by_subject).map(([subject, velocityData]) => (
            <View key={subject} style={styles.velocityRow}>
              <Text style={styles.velocitySubject}>{subject}</Text>
              <Text style={styles.velocityValue}>
                {(velocityData?.velocity || 1.0) * 100}% pace
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Closing Message */}
      <View style={styles.closingSection}>
        <Text style={styles.closingText}>
          You accomplished a lot this year. Every session, every artifact, every moment of growth matters. 
          You're doing enough, and you're doing great.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  downloadText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  summaryText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  metric: {
    alignItems: 'flex-start',
  },
  metricValue: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  creditValue: {
    fontSize: 14,
    color: '#374151',
  },
  strengthItem: {
    marginBottom: 8,
  },
  strengthText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  artifactCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  evidenceBreakdown: {
    gap: 8,
  },
  evidenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  evidenceSubject: {
    fontSize: 14,
    color: '#374151',
  },
  evidenceCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  pacingText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  velocityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  velocitySubject: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  velocityValue: {
    fontSize: 14,
    color: '#374151',
  },
  closingSection: {
    padding: 20,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    margin: 20,
  },
  closingText: {
    fontSize: 16,
    color: '#92400e',
    lineHeight: 24,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    padding: 20,
  },
});

