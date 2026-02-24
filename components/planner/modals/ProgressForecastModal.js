/**
 * Progress Forecast Modal
 * Estimates learning progress and completion dates
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { X, TrendingUp, Calendar, AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { colors } from '../../../theme/colors';
import { forecastProgress } from '../../../lib/services/progressForecastClient';

const STATUS_COLORS = {
  on_track: '#10b981',
  at_risk: '#ef4444',
  ahead: '#3b82f6',
};

const STATUS_LABELS = {
  on_track: 'On Track',
  at_risk: 'At Risk',
  ahead: 'Ahead',
};

export default function ProgressForecastModal({
  visible,
  familyId,
  children = [],
  selectedChildIds = null,
  subjectId = null,
  subjectName = null,
  onClose,
  onPlanWeek,
  onQuickReschedule,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [expandedSequences, setExpandedSequences] = useState(new Set());

  // Load forecast when modal opens
  useEffect(() => {
    if (visible && familyId) {
      loadForecast();
    }
  }, [visible, familyId, selectedChildIds, subjectId]);

  const loadForecast = async () => {
    setLoading(true);
    setError(null);

    try {
      const childIds = selectedChildIds || (children.length > 0 ? children.map(c => c.id) : []);
      
      if (childIds.length === 0) {
        setError('Please select at least one child');
        setLoading(false);
        return;
      }

      // Calculate date range (next 4 weeks)
      const today = new Date();
      const startDate = today.toISOString().split('T')[0];
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 28);
      const endDateStr = endDate.toISOString().split('T')[0];

      const { data, error: apiError } = await forecastProgress({
        family_id: familyId,
        child_ids: childIds,
        range: {
          start: startDate,
          end: endDateStr,
        },
        timezone: 'America/New_York',
        subject_id: subjectId || null,
      });

      if (apiError) {
        throw new Error(apiError.message || 'Failed to load forecast');
      }

      setForecast(data);
    } catch (err) {
      setError(err.message || 'Failed to load progress forecast');
    } finally {
      setLoading(false);
    }
  };

  const toggleSequence = (childId, sequenceId) => {
    const key = `${childId}_${sequenceId}`;
    setExpandedSequences(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleAction = (action, childId) => {
    if (action === 'plan_week' && onPlanWeek) {
      onPlanWeek(childId);
    } else if (action === 'quick_reschedule' && onQuickReschedule) {
      onQuickReschedule(childId);
    }
  };

  const renderChildCard = (childData) => {
    const child = children.find(c => c.id === childData.child_id) || {};
    const statusColor = STATUS_COLORS[childData.status] || colors.muted;
    const statusLabel = STATUS_LABELS[childData.status] || childData.status;

    return (
      <View key={childData.child_id} style={styles.childCard}>
        <View style={styles.childHeader}>
          <View style={styles.childInfo}>
            <Text style={styles.childName}>
              {child.first_name || child.name || 'Child'}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor + '20' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Clock size={16} color={colors.muted} />
              <Text style={styles.metricValue}>{childData.pace_minutes_per_day}m/day</Text>
            </View>
            <View style={styles.metric}>
              <TrendingUp size={16} color={colors.muted} />
              <Text style={styles.metricValue}>
                {Math.round(childData.confidence * 100)}%
              </Text>
            </View>
          </View>
        </View>

        {/* Confidence Meter */}
        <View style={styles.confidenceMeter}>
          <View style={styles.confidenceBar}>
            <View
              style={[
                styles.confidenceFill,
                {
                  width: `${childData.confidence * 100}%`,
                  backgroundColor: statusColor,
                },
              ]}
            />
          </View>
          <Text style={styles.confidenceLabel}>
            Confidence: {Math.round(childData.confidence * 100)}%
          </Text>
        </View>

        {/* Sequences */}
        {childData.sequences && childData.sequences.length > 0 ? (
          <View style={styles.sequencesContainer}>
            <Text style={styles.sequencesTitle}>Active Sequences</Text>
            {childData.sequences.map((sequence) => {
              const key = `${childData.child_id}_${sequence.sequence_id}`;
              const isExpanded = expandedSequences.has(key);

              return (
                <View key={sequence.sequence_id} style={styles.sequenceCard}>
                  <TouchableOpacity
                    style={styles.sequenceHeader}
                    onPress={() => toggleSequence(childData.child_id, sequence.sequence_id)}
                  >
                    <View style={styles.sequenceInfo}>
                      <Text style={styles.sequenceTitle}>{sequence.title}</Text>
                      <View style={styles.sequenceMeta}>
                        <Text style={styles.sequenceMinutes}>
                          {sequence.remaining_minutes} min remaining
                        </Text>
                        <View style={styles.sequenceConfidence}>
                          <Text style={styles.sequenceConfidenceText}>
                            {Math.round(sequence.confidence * 100)}% confidence
                          </Text>
                        </View>
                      </View>
                    </View>
                    {isExpanded ? (
                      <ChevronDown size={20} color={colors.muted} />
                    ) : (
                      <ChevronRight size={20} color={colors.muted} />
                    )}
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.sequenceDetails}>
                      <View style={styles.forecastRow}>
                        <Calendar size={16} color={colors.accent} />
                        <Text style={styles.forecastLabel}>Forecast completion:</Text>
                        <Text style={styles.forecastDate}>
                          {new Date(sequence.forecast_completion_date).toLocaleDateString()}
                        </Text>
                      </View>

                      {sequence.risk_reasons && sequence.risk_reasons.length > 0 && (
                        <View style={styles.risksContainer}>
                          <Text style={styles.risksTitle}>Risk Factors:</Text>
                          {sequence.risk_reasons.map((reason, idx) => (
                            <View key={idx} style={styles.riskItem}>
                              <AlertTriangle size={14} color={colors.error} />
                              <Text style={styles.riskText}>{reason}</Text>
                            </View>
                          ))}
                        </View>
                      )}

                      {sequence.recommended_action && (
                        <TouchableOpacity
                          style={styles.actionButton}
                          onPress={() => handleAction(sequence.recommended_action, childData.child_id)}
                        >
                          <Text style={styles.actionButtonText}>
                            {sequence.recommended_action === 'plan_week' && 'Plan the Week'}
                            {sequence.recommended_action === 'quick_reschedule' && 'Quick Reschedule'}
                            {sequence.recommended_action === 'monitor' && 'Monitor Progress'}
                          </Text>
                          <ChevronRight size={16} color={colors.accentContrast} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.noSequences}>
            <Text style={styles.noSequencesText}>No active sequences</Text>
          </View>
        )}
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.modal} activeOpacity={1} onPress={() => {}}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TrendingUp size={24} color={colors.accent} />
              <Text style={styles.title}>
                {subjectId && subjectName ? `${subjectName} Pacing` : 'Progress Forecast'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="large" color={colors.accent} />
              <Text style={styles.loadingText}>Analyzing progress...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContent}>
              <AlertTriangle size={48} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={loadForecast}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : forecast ? (
            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
              {forecast.per_child && forecast.per_child.map(renderChildCard)}

              {forecast.global_insights && forecast.global_insights.length > 0 && (
                <View style={styles.insightsContainer}>
                  <Text style={styles.insightsTitle}>Global Insights</Text>
                  {forecast.global_insights.map((insight, idx) => (
                    <View key={idx} style={styles.insightItem}>
                      <Text style={styles.insightText}>{insight}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.footer}>
                <Text style={styles.footerText}>
                  Generated at {new Date(forecast.generated_at).toLocaleString()}
                </Text>
              </View>
            </ScrollView>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: Platform.OS === 'web' ? '90%' : '100%',
    maxWidth: 900,
    maxHeight: Platform.OS === 'web' ? '90%' : '100%',
    backgroundColor: colors.bg,
    borderRadius: 12,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
  },
  closeButton: {
    padding: 4,
  },
  centerContent: {
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
  errorText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.accent,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.accentContrast,
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  childCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: colors.bg,
  },
  childHeader: {
    marginBottom: 12,
  },
  childInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  childName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  confidenceMeter: {
    marginBottom: 16,
  },
  confidenceBar: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 4,
  },
  confidenceLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  sequencesContainer: {
    marginTop: 8,
  },
  sequencesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  sequenceCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 8,
    overflow: 'hidden',
  },
  sequenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  sequenceInfo: {
    flex: 1,
  },
  sequenceTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  sequenceMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  sequenceMinutes: {
    fontSize: 12,
    color: colors.muted,
  },
  sequenceConfidence: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.accent + '20',
    borderRadius: 4,
  },
  sequenceConfidenceText: {
    fontSize: 11,
    color: colors.accent,
  },
  sequenceDetails: {
    padding: 12,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  forecastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  forecastLabel: {
    fontSize: 13,
    color: colors.muted,
  },
  forecastDate: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
  },
  risksContainer: {
    marginBottom: 12,
  },
  risksTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 6,
  },
  riskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  riskText: {
    fontSize: 12,
    color: colors.error,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: colors.accent,
    borderRadius: 6,
    marginTop: 8,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.accentContrast,
  },
  noSequences: {
    padding: 20,
    alignItems: 'center',
  },
  noSequencesText: {
    fontSize: 14,
    color: colors.muted,
  },
  insightsContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.accent + '10',
    borderRadius: 8,
  },
  insightsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  insightItem: {
    marginBottom: 6,
  },
  insightText: {
    fontSize: 13,
    color: colors.text,
  },
  footer: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerText: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
});





