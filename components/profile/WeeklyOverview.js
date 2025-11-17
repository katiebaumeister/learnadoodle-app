import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { colors, shadows } from '../../theme/colors';

export default function WeeklyOverview({ summary, goals }) {
  // Prepare chart data
  const chartData = goals.map(g => ({
    subject: g.subject || '—',
    done: g.done_min || 0,
    scheduled: Math.max(0, (g.scheduled_min || 0) - (g.done_min || 0)),
    target: g.minutes_per_week
  }));

  const maxMinutes = Math.max(...chartData.map(d => d.target), 100);

  return (
    <View style={styles.container}>
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Total minutes</Text>
          <Text style={styles.statValue}>{summary.total_minutes}</Text>
        </View>

        <View style={styles.stat}>
          <Text style={styles.statLabel}>Completion</Text>
          <View style={styles.completionRow}>
            <View style={styles.progressTrack}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${summary.completion_pct}%` }
                ]} 
              />
            </View>
            <Text style={styles.completionPct}>{summary.completion_pct}%</Text>
          </View>
        </View>

        <View style={styles.aiCommentCard}>
          <Text style={styles.aiCommentText}>💡 {summary.ai_comment}</Text>
        </View>
      </View>

      {/* Simple Bar Chart */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Subject minutes (Done vs Scheduled)</Text>
        <View style={styles.chart}>
          {chartData.map((item, index) => {
            const doneHeight = (item.done / maxMinutes) * 100;
            const scheduledHeight = (item.scheduled / maxMinutes) * 100;
            const totalHeight = doneHeight + scheduledHeight;

            return (
              <View key={index} style={styles.barContainer}>
                <View style={styles.barWrapper}>
                  <View style={[styles.bar, { height: `${totalHeight}%` }]}>
                    <View style={[styles.barDone, { height: `${doneHeight / totalHeight * 100}%` }]} />
                    <View style={[styles.barScheduled, { height: `${scheduledHeight / totalHeight * 100}%` }]} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 2,
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
  },
  stat: {
    marginBottom: 16,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.text,
  },
  completionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressTrack: {
    flex: 1,
    height: 8,
    backgroundColor: colors.panel,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.greenBold,
    borderRadius: 4,
  },
  completionPct: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    minWidth: 40,
    textAlign: 'right',
  },
  aiCommentCard: {
    backgroundColor: colors.violetSoft,
    borderRadius: colors.radiusMd,
    padding: 12,
    marginTop: 8,
  },
  aiCommentText: {
    fontSize: 13,
    color: colors.violetBold,
    lineHeight: 18,
  },
  chartCard: {
    flex: 3,
    backgroundColor: colors.card,
    borderRadius: colors.radiusLg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadows.md,
  },
  chartTitle: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 16,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 180,
    marginBottom: 12,
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
    fontSize: 11,
    color: colors.text,
    textAlign: 'center',
  },
  barValue: {
    fontSize: 10,
    color: colors.muted,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 12,
    color: colors.muted,
  },
});
