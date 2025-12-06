/**
 * PlannerHealthPanel
 * Displays planner health metrics, warnings, and insights
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { TrendingUp, TrendingDown, AlertTriangle, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { usePlannerHealthStore } from '../../state/usePlannerHealthStore';
import { PlannerHealth } from '../../services/plannerHealth';

interface PlannerHealthPanelProps {
  childId?: string;
  familyId?: string;
  onRefresh?: () => void;
}

export default function PlannerHealthPanel({ 
  childId, 
  familyId,
  onRefresh 
}: PlannerHealthPanelProps) {
  const { health, loading, error, fetchHealth, refreshHealth } = usePlannerHealthStore();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchHealth(childId);
  }, [childId, fetchHealth]);

  const handleRefresh = async () => {
    await refreshHealth(childId);
    if (onRefresh) {
      onRefresh();
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return '#10B981'; // Green
    if (score >= 60) return '#F59E0B'; // Yellow
    return '#EF4444'; // Red
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Attention';
  };

  if (loading && !health) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366F1" />
          <Text style={styles.loadingText}>Analyzing planner health...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <AlertTriangle size={24} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!health) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No health data available</Text>
      </View>
    );
  }

  const score = Math.round(health.score);
  const scoreColor = getScoreColor(score);

  return (
    <View style={styles.container}>
      {/* Header with Score */}
      <View style={styles.header}>
        <View style={styles.scoreSection}>
          <Text style={styles.scoreLabel}>Planner Health</Text>
          <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
            <Text style={[styles.scoreValue, { color: scoreColor }]}>{score}</Text>
          </View>
          <Text style={[styles.scoreStatus, { color: scoreColor }]}>
            {getScoreLabel(score)}
          </Text>
        </View>
        
        <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {/* Warnings */}
      {health.warnings && health.warnings.length > 0 && (
        <View style={styles.warningsSection}>
          <View style={styles.sectionHeader}>
            <AlertTriangle size={18} color="#EF4444" />
            <Text style={styles.sectionTitle}>Warnings</Text>
          </View>
          {health.warnings.map((warning, index) => (
            <View key={index} style={styles.warningItem}>
              <Text style={styles.warningText}>{warning}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Insights */}
      {health.insights && health.insights.length > 0 && (
        <View style={styles.insightsSection}>
          <View style={styles.sectionHeader}>
            <Lightbulb size={18} color="#F59E0B" />
            <Text style={styles.sectionTitle}>Insights</Text>
          </View>
          {health.insights.map((insight, index) => (
            <View key={index} style={styles.insightItem}>
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Expandable Metrics Grid */}
      <TouchableOpacity
        style={styles.expandButton}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.expandButtonText}>
          {expanded ? 'Hide' : 'Show'} Detailed Metrics
        </Text>
        {expanded ? (
          <ChevronUp size={20} color="#6B7280" />
        ) : (
          <ChevronDown size={20} color="#6B7280" />
        )}
      </TouchableOpacity>

      {expanded && health.metrics && (
        <View style={styles.metricsGrid}>
          <MetricCard
            label="Load Balance"
            value={health.metrics.daily_load_balance}
            format="percent"
            higherIsBetter
          />
          <MetricCard
            label="Heavy Subject Violations"
            value={health.metrics.heavy_subject_limit_violations}
            format="count"
            higherIsBetter={false}
          />
          <MetricCard
            label="Cognitive Mismatches"
            value={health.metrics.cognitive_load_mismatches}
            format="count"
            higherIsBetter={false}
          />
          <MetricCard
            label="Theme Alignment"
            value={health.metrics.theme_alignment_score}
            format="percent"
            higherIsBetter
          />
          <MetricCard
            label="Backlog Pressure"
            value={health.metrics.backlog_pressure_score}
            format="percent"
            higherIsBetter={false}
          />
          <MetricCard
            label="Overdue Tasks"
            value={health.metrics.overdue_task_count}
            format="count"
            higherIsBetter={false}
          />
          <MetricCard
            label="Reschedule Rate"
            value={health.metrics.reschedule_rate_7_days}
            format="percent"
            higherIsBetter={false}
          />
          <MetricCard
            label="Unavailability"
            value={health.metrics.unavailability_density}
            format="percent"
            higherIsBetter={false}
          />
          <MetricCard
            label="Override Frequency"
            value={health.metrics.override_frequency}
            format="percent"
            higherIsBetter={false}
          />
          <MetricCard
            label="Blackout Frequency"
            value={health.metrics.blackout_frequency}
            format="percent"
            higherIsBetter={false}
          />
          <MetricCard
            label="Catch-Up Items"
            value={health.metrics.catch_up_mode_count}
            format="count"
            higherIsBetter={false}
          />
        </View>
      )}
    </View>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  format: 'percent' | 'count';
  higherIsBetter: boolean;
}

function MetricCard({ label, value, format, higherIsBetter }: MetricCardProps) {
  const displayValue = format === 'percent' 
    ? `${Math.round(value * 100)}%`
    : value.toString();
  
  const isGood = format === 'percent' 
    ? (higherIsBetter ? value > 0.7 : value < 0.3)
    : (higherIsBetter ? value > 0 : value === 0);
  
  const color = isGood ? '#10B981' : '#EF4444';
  
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricValueContainer}>
        <Text style={[styles.metricValue, { color }]}>{displayValue}</Text>
        {format === 'percent' && (
          isGood ? (
            <TrendingUp size={16} color={color} />
          ) : (
            <TrendingDown size={16} color={color} />
          )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    marginBottom: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#6366F1',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreSection: {
    alignItems: 'center',
    flex: 1,
  },
  scoreLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    fontWeight: '500',
  },
  scoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: '700',
  },
  scoreStatus: {
    fontSize: 16,
    fontWeight: '600',
  },
  refreshButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
  },
  refreshButtonText: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '600',
  },
  warningsSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
  },
  insightsSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  warningItem: {
    marginBottom: 6,
  },
  warningText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 20,
  },
  insightItem: {
    marginBottom: 6,
  },
  insightText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 20,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  expandButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricCard: {
    width: '48%',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 6,
    fontWeight: '500',
  },
  metricValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
  },
});

