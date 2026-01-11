import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { CheckCircle, Clock, FileText, TrendingUp, AlertCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getReadinessMeter } from '../../lib/apiClient';
import { useToast } from '../Toast';

export default function ReadinessMeter({ childId, childName }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, [childId]);

  const loadData = async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const { data: result, error } = await getReadinessMeter(childId);
      if (error) throw error;
      setData(result);
    } catch (error) {
      toast.push('Failed to load readiness data', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  if (!data) {
    return null;
  }

  const creditsBySubject = data.credits_by_subject || {};
  const evidenceBySubject = data.evidence_by_subject || {};
  const velocityBySubject = data.velocity_by_subject || {};

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Readiness Meter</Text>
        <Text style={styles.subtitle}>You're doing enough</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Attendance */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Clock size={18} color={colors.accent} />
            <Text style={styles.sectionTitle}>Attendance</Text>
          </View>
          <Text style={styles.message}>{data.attendance_message}</Text>
          <View style={styles.metricRow}>
            <Text style={styles.metricValue}>{data.attendance_percentage.toFixed(1)}%</Text>
            <Text style={styles.metricLabel}>logged this year</Text>
          </View>
        </View>

        {/* Credits / Subjects */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <CheckCircle size={18} color={colors.accent} />
            <Text style={styles.sectionTitle}>Credits / Subjects</Text>
          </View>
          {Object.keys(creditsBySubject).length > 0 ? (
            Object.entries(creditsBySubject).map(([subject, creditData]) => {
              const credits = creditData?.credits || 0;
              const status = creditData?.status || 'building';
              return (
                <View key={subject} style={styles.subjectRow}>
                  <Text style={styles.subjectName}>{subject}:</Text>
                  <View style={styles.subjectStatus}>
                    <Text style={styles.creditValue}>{credits.toFixed(1)} credits</Text>
                    <View style={[styles.statusBadge, styles[`status_${status}`]]}>
                      <Text style={styles.statusText}>
                        {status === 'strong' ? 'Strong' : status === 'on_track' ? 'On track' : 'Building'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>No credits logged yet</Text>
          )}
        </View>

        {/* Evidence Depth */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FileText size={18} color={colors.accent} />
            <Text style={styles.sectionTitle}>Evidence Depth</Text>
          </View>
          {Object.keys(evidenceBySubject).length > 0 ? (
            Object.entries(evidenceBySubject).map(([subject, evidenceData]) => {
              const totalArtifacts = evidenceData?.total_artifacts || 0;
              const confidence = evidenceData?.confidence || 'low';
              return (
                <View key={subject} style={styles.subjectRow}>
                  <Text style={styles.subjectName}>{subject}:</Text>
                  <View style={styles.subjectStatus}>
                    <Text style={styles.artifactCount}>{totalArtifacts} artifacts</Text>
                    <View style={[styles.confidenceBadge, styles[`confidence_${confidence}`]]}>
                      <Text style={styles.confidenceText}>
                        {confidence === 'high' ? 'High confidence' : confidence === 'medium' ? 'Medium confidence' : 'Consider capturing more'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.emptyText}>No evidence artifacts yet</Text>
          )}
        </View>

        {/* Pacing vs Plan */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <TrendingUp size={18} color={colors.accent} />
            <Text style={styles.sectionTitle}>Pacing vs Plan</Text>
          </View>
          <Text style={styles.message}>{data.pacing_message}</Text>
          {data.pacing_data && (
            <View style={styles.pacingMetrics}>
              <View style={styles.pacingMetric}>
                <Text style={styles.pacingValue}>{data.pacing_data.planned_modules || 0}</Text>
                <Text style={styles.pacingLabel}>Planned modules</Text>
              </View>
              <View style={styles.pacingMetric}>
                <Text style={styles.pacingValue}>{data.pacing_data.current_module || 0}</Text>
                <Text style={styles.pacingLabel}>Current module</Text>
              </View>
              <View style={styles.pacingMetric}>
                <Text style={styles.pacingValue}>{data.pacing_data.completed_modules || 0}</Text>
                <Text style={styles.pacingLabel}>Completed</Text>
              </View>
            </View>
          )}
        </View>

        {/* Learning Velocity */}
        {Object.keys(velocityBySubject).length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={18} color={colors.accent} />
              <Text style={styles.sectionTitle}>Learning Velocity</Text>
            </View>
            {Object.entries(velocityBySubject).map(([subject, velocityData]) => {
              const velocity = velocityData?.velocity || 1.0;
              const status = velocityData?.status || 'on_track';
              return (
                <View key={subject} style={styles.subjectRow}>
                  <Text style={styles.subjectName}>{subject}:</Text>
                  <View style={styles.subjectStatus}>
                    <Text style={styles.velocityValue}>{(velocity * 100).toFixed(0)}%</Text>
                    <View style={[styles.statusBadge, styles[`status_${status}`]]}>
                      <Text style={styles.statusText}>
                        {status === 'ahead' ? 'Ahead' : status === 'on_track' ? 'On track' : 'Behind'}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
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
    marginBottom: 20,
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
    fontStyle: 'italic',
  },
  content: {
    maxHeight: 600,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  message: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  metricLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  subjectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  subjectStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creditValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  artifactCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  velocityValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  status_strong: {
    backgroundColor: '#d1fae5',
  },
  status_on_track: {
    backgroundColor: '#dbeafe',
  },
  status_building: {
    backgroundColor: '#fef3c7',
  },
  status_ahead: {
    backgroundColor: '#d1fae5',
  },
  status_behind: {
    backgroundColor: '#fee2e2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  confidence_high: {
    backgroundColor: '#d1fae5',
  },
  confidence_medium: {
    backgroundColor: '#dbeafe',
  },
  confidence_low: {
    backgroundColor: '#fef3c7',
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
  },
  pacingMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  pacingMetric: {
    alignItems: 'center',
  },
  pacingValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  pacingLabel: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
  },
});

