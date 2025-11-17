import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Clock, Plus } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function WeeklyMinutesCard({ summary, onAddSession }) {
  const totalMinutes = summary?.total_minutes || 0;
  const doneMinutes = summary?.done_minutes || 0;
  const completionPct = summary?.completion_pct || 0;

  const isEmpty = totalMinutes === 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Clock size={18} color={colors.greenBold} />
          <Text style={styles.title}>Weekly Minutes</Text>
        </View>
        <Text style={styles.description}>Total time completed this week</Text>
      </View>

      {isEmpty ? (
        <View style={styles.emptyState}>
          <Clock size={48} color={colors.muted} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>No minutes logged yet</Text>
          <Text style={styles.emptyDescription}>
            Start with a 20-min activity to begin tracking progress.
          </Text>
          {onAddSession && (
            <TouchableOpacity style={styles.emptyButton} onPress={onAddSession}>
              <Plus size={16} color={colors.accentContrast} />
              <Text style={styles.emptyButtonText}>Add a session</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{doneMinutes}</Text>
              <Text style={styles.metricLabel}>Done</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{totalMinutes}</Text>
              <Text style={styles.metricLabel}>Scheduled</Text>
            </View>
          </View>
          <View style={styles.progressSection}>
            <View style={styles.progressTrack}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${Math.min(100, completionPct)}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>{completionPct}% complete</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    ...shadows.md,
  },
  header: {
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  description: {
    fontSize: 12,
    color: colors.muted,
  },
  content: {
    gap: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  metric: {
    gap: 4,
  },
  metricValue: {
    fontSize: 32,
    fontWeight: '600',
    color: colors.text,
  },
  metricLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  progressSection: {
    gap: 8,
  },
  progressTrack: {
    height: 10,
    backgroundColor: colors.panel,
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.greenBold,
    borderRadius: 5,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  emptyDescription: {
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accentContrast,
  },
});

