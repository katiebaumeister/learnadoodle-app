import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { TrendingUp, Calendar, AlertCircle } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getPacingPrediction } from '../../lib/apiClient';
import { useToast } from '../Toast';

export default function PacingPrediction({ childId, subjectId = null }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, [childId, subjectId]);

  const loadData = async () => {
    if (!childId) return;
    setLoading(true);
    try {
      const { data: result, error } = await getPacingPrediction(childId, subjectId);
      if (error) throw error;
      setData(result);
    } catch (error) {
      console.error('Error loading pacing prediction:', error);
      toast.push('Failed to load prediction', 'error');
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

  if (!data || data.status === 'no_plan') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Calendar size={18} color={colors.muted} />
          <Text style={styles.title}>Pacing Prediction</Text>
        </View>
        <Text style={styles.emptyText}>No year plan found. Create one to see pacing predictions.</Text>
      </View>
    );
  }

  const statusColors = {
    on_track: { bg: '#d1fae5', text: '#065f46', icon: TrendingUp },
    slightly_behind: { bg: '#fef3c7', text: '#92400e', icon: AlertCircle },
    adjusted: { bg: '#dbeafe', text: '#1e40af', icon: Calendar },
  };

  const statusStyle = statusColors[data.status] || statusColors.on_track;
  const IconComponent = statusStyle.icon;

  return (
    <View style={[styles.container, { backgroundColor: statusStyle.bg }]}>
      <View style={styles.header}>
        <IconComponent size={18} color={statusStyle.text} />
        <Text style={[styles.title, { color: statusStyle.text }]}>Pacing Prediction</Text>
      </View>
      <Text style={[styles.prediction, { color: statusStyle.text }]}>
        {data.prediction}
      </Text>
      {data.projected_completion && (
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={[styles.metricLabel, { color: statusStyle.text }]}>Projected completion:</Text>
            <Text style={[styles.metricValue, { color: statusStyle.text }]}>
              {new Date(data.projected_completion).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </Text>
          </View>
          {data.weeks_remaining !== undefined && (
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: statusStyle.text }]}>Weeks remaining:</Text>
              <Text style={[styles.metricValue, { color: statusStyle.text }]}>{data.weeks_remaining}</Text>
            </View>
          )}
          {data.velocity !== undefined && (
            <View style={styles.metric}>
              <Text style={[styles.metricLabel, { color: statusStyle.text }]}>Learning velocity:</Text>
              <Text style={[styles.metricValue, { color: statusStyle.text }]}>
                {(data.velocity * 100).toFixed(0)}%
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  prediction: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  metrics: {
    gap: 8,
  },
  metric: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    opacity: 0.8,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
});

