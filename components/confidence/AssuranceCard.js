import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { CheckCircle, TrendingUp, Clock } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getAssuranceCard } from '../../lib/apiClient';
import { useToast } from '../Toast';

export default function AssuranceCard({ weekStart, onViewDetails }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const toast = useToast();

  useEffect(() => {
    loadData();
  }, [weekStart]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: result, error } = await getAssuranceCard(weekStart);
      if (error) throw error;
      setData(result);
    } catch (error) {
      toast.push('Failed to load assurance data', 'error');
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

  const toneColors = {
    encouraging: { bg: '#d1fae5', text: '#065f46', icon: CheckCircle },
    supportive: { bg: '#dbeafe', text: '#1e40af', icon: TrendingUp },
    reassuring: { bg: '#fef3c7', text: '#92400e', icon: Clock },
  };

  const toneStyle = toneColors[data.tone] || toneColors.reassuring;
  const IconComponent = toneStyle.icon;

  return (
    <TouchableOpacity 
      style={[styles.container, { backgroundColor: toneStyle.bg }]}
      onPress={onViewDetails}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <IconComponent size={24} color={toneStyle.text} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.message, { color: toneStyle.text }]}>
            {data.message}
          </Text>
          {data.metrics && (
            <View style={styles.metrics}>
              {data.metrics.sessions_completed !== undefined && (
                <Text style={[styles.metric, { color: toneStyle.text }]}>
                  {data.metrics.sessions_completed} sessions completed
                </Text>
              )}
              {data.metrics.attendance_days !== undefined && (
                <Text style={[styles.metric, { color: toneStyle.text }]}>
                  {data.metrics.attendance_days} days with attendance
                </Text>
              )}
            </View>
          )}
        </View>
      </View>
      {onViewDetails && (
        <Text style={[styles.viewDetails, { color: toneStyle.text }]}>
          Tap to view details →
        </Text>
      )}
    </TouchableOpacity>
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
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconContainer: {
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 8,
  },
  metrics: {
    gap: 4,
  },
  metric: {
    fontSize: 14,
    opacity: 0.9,
  },
  viewDetails: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'right',
    opacity: 0.8,
  },
});

