/**
 * PacingGenerator Component
 * Generates and displays pacing recommendations for syllabus units
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Calendar, CheckCircle, ArrowLeft, Clock } from 'lucide-react';
import { colors } from '../../theme/colors';
import { generatePacing, getParsedSyllabus } from '../../lib/services/curriculumAIClient';

export default function PacingGenerator({ syllabusId, startDate, endDate, onComplete, onBack }) {
  const [pacing, setPacing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [units, setUnits] = useState([]);

  useEffect(() => {
    loadPacing();
  }, [syllabusId, startDate, endDate]);

  const loadPacing = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load units first
      const { data: syllabusData, error: syllabusError } = await getParsedSyllabus(syllabusId);
      if (syllabusError) throw syllabusError;
      if (syllabusData?.units) {
        setUnits(syllabusData.units);
      }

      // Generate pacing if dates provided
      if (startDate && endDate) {
        const { data, error: pacingError } = await generatePacing(syllabusId, startDate, endDate);
        if (pacingError) throw pacingError;
        setPacing(data);
      }
    } catch (err) {
      setError(err.message || 'Failed to generate pacing');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Not scheduled';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Generating pacing recommendations...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadPacing}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pacing Recommendations</Text>
      <Text style={styles.description}>
        Based on your start and end dates, here's a recommended pacing schedule for your curriculum.
      </Text>

      {!startDate || !endDate ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>
            Start and end dates are required to generate pacing. You can add these later in the syllabus settings.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.pacingList} showsVerticalScrollIndicator={false}>
          {units.map((unit, idx) => {
            const unitPacing = pacing?.units?.find((u) => u.unit_id === unit.id);
            const suggestedStart = unitPacing?.suggested_start_date || unit.suggested_due_ts;
            const suggestedEnd = unitPacing?.suggested_end_date;

            return (
              <View key={unit.id} style={styles.pacingCard}>
                <View style={styles.pacingHeader}>
                  <View style={styles.pacingHeaderLeft}>
                    <Calendar size={20} color={colors.primary} />
                    <View style={styles.pacingInfo}>
                      <Text style={styles.pacingUnitTitle}>{unit.heading || `Unit ${idx + 1}`}</Text>
                      <View style={styles.pacingMeta}>
                        <Clock size={12} color={colors.muted} />
                        <Text style={styles.pacingMetaText}>
                          {unit.estimated_minutes || 0} min
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.pacingContent}>
                  <View style={styles.pacingRow}>
                    <Text style={styles.pacingLabel}>Suggested Start:</Text>
                    <Text style={styles.pacingValue}>{formatDate(suggestedStart)}</Text>
                  </View>
                  {suggestedEnd && (
                    <View style={styles.pacingRow}>
                      <Text style={styles.pacingLabel}>Suggested End:</Text>
                      <Text style={styles.pacingValue}>{formatDate(suggestedEnd)}</Text>
                    </View>
                  )}
                  {unitPacing?.weekly_hours && (
                    <View style={styles.pacingRow}>
                      <Text style={styles.pacingLabel}>Weekly Hours:</Text>
                      <Text style={styles.pacingValue}>{unitPacing.weekly_hours}h/week</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <ArrowLeft size={16} color={colors.text} />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.completeButton} onPress={onComplete}>
          <CheckCircle size={16} color={colors.card} />
          <Text style={styles.completeButtonText}>Complete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 24,
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.redBold,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignSelf: 'center',
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.card,
  },
  warningBox: {
    padding: 16,
    backgroundColor: colors.orangeSoft,
    borderRadius: 8,
    marginBottom: 20,
  },
  warningText: {
    fontSize: 14,
    color: colors.orangeBold,
    lineHeight: 20,
  },
  pacingList: {
    flex: 1,
    marginBottom: 20,
  },
  pacingCard: {
    backgroundColor: colors.bgSubtle,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pacingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  pacingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  pacingInfo: {
    flex: 1,
  },
  pacingUnitTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  pacingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pacingMetaText: {
    fontSize: 12,
    color: colors.muted,
  },
  pacingContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pacingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pacingLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  pacingValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  completeButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  completeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.card,
  },
});

