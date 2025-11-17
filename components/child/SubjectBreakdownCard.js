import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BookOpen, Plus } from 'lucide-react';
import { colors, shadows } from '../../theme/colors';

export default function SubjectBreakdownCard({ goals, onAddActivity }) {
  const chartData = goals?.map(g => ({
    subject: g.subject || g.subject_id || '—',
    done: g.done_min || 0,
    scheduled: Math.max(0, (g.scheduled_min || 0) - (g.done_min || 0)),
    target: g.minutes_per_week || 0,
  })) || [];

  const isEmpty = chartData.length === 0 || chartData.every(d => d.done === 0 && d.scheduled === 0);

  const maxMinutes = Math.max(...chartData.map(d => d.target), 100);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <BookOpen size={18} color={colors.violetBold} />
          <Text style={styles.title}>Subject Breakdown</Text>
        </View>
        <Text style={styles.description}>Minutes by subject this week</Text>
      </View>

      {isEmpty ? (
        <View style={styles.emptyState}>
          <BookOpen size={48} color={colors.muted} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Nothing scheduled yet</Text>
          <Text style={styles.emptyDescription}>
            Add your first activity to see subject breakdown.
          </Text>
          {onAddActivity && (
            <TouchableOpacity style={styles.emptyButton} onPress={onAddActivity}>
              <Plus size={16} color={colors.accentContrast} />
              <Text style={styles.emptyButtonText}>Add activity</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.chart}>
            {chartData.map((item, index) => {
              const doneHeight = maxMinutes > 0 ? (item.done / maxMinutes) * 100 : 0;
              const scheduledHeight = maxMinutes > 0 ? (item.scheduled / maxMinutes) * 100 : 0;
              const totalHeight = Math.max(doneHeight + scheduledHeight, 4);

              return (
                <View key={index} style={styles.barContainer}>
                  <View style={styles.barWrapper}>
                    <View style={[styles.bar, { height: `${totalHeight}%` }]}>
                      {doneHeight > 0 && (
                        <View style={[styles.barDone, { height: `${doneHeight / totalHeight * 100}%` }]} />
                      )}
                      {scheduledHeight > 0 && (
                        <View style={[styles.barScheduled, { height: `${scheduledHeight / totalHeight * 100}%` }]} />
                      )}
                    </View>
                  </View>
                  <Text style={styles.barLabel} numberOfLines={1}>
                    {item.subject}
                  </Text>
                  <Text style={styles.barValue}>
                    {item.done + item.scheduled}m
                  </Text>
                </View>
              );
            })}
          </View>
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.greenBold }]} />
              <Text style={styles.legendText}>Done</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.greenSoft }]} />
              <Text style={styles.legendText}>Scheduled</Text>
            </View>
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
    gap: 12,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 160,
    marginBottom: 8,
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barWrapper: {
    width: '80%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    minHeight: 4,
  },
  barDone: {
    backgroundColor: colors.greenBold,
  },
  barScheduled: {
    backgroundColor: colors.greenSoft,
  },
  barLabel: {
    fontSize: 10,
    color: colors.text,
    textAlign: 'center',
  },
  barValue: {
    fontSize: 9,
    color: colors.muted,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: colors.muted,
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

