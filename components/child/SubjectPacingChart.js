import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';

export default function SubjectPacingChart({ data, weekStart }) {
  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No pacing data available</Text>
      </View>
    );
  }

  const maxMinutes = Math.max(
    ...data.map(d => Math.max(d.done_minutes || 0, d.scheduled_minutes || 0, d.expected_weekly_minutes || 0))
  );

  return (
    <View style={styles.container}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: colors.blueBold }]} />
          <Text style={styles.legendText}>Done</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, { backgroundColor: colors.greenBold }]} />
          <Text style={styles.legendText}>Scheduled</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendColor, styles.legendLine]} />
          <Text style={styles.legendText}>Expected</Text>
        </View>
      </View>

      <View style={styles.chart}>
        {data.map((item, index) => {
          const doneHeight = maxMinutes > 0 ? ((item.done_minutes || 0) / maxMinutes) * 100 : 0;
          const scheduledHeight = maxMinutes > 0 ? ((item.scheduled_minutes || 0) / maxMinutes) * 100 : 0;
          const expectedHeight = maxMinutes > 0 ? ((item.expected_weekly_minutes || 0) / maxMinutes) * 100 : 0;
          
          return (
            <View key={item.subject_id || index} style={styles.barGroup}>
              <View style={styles.bars}>
                <View style={[styles.bar, styles.doneBar, { height: `${doneHeight}%` }]} />
                <View style={[styles.bar, styles.scheduledBar, { height: `${scheduledHeight}%` }]} />
                <View 
                  style={[
                    styles.expectedLine, 
                    { 
                      bottom: `${expectedHeight}%`,
                      width: '100%',
                    }
                  ]} 
                />
              </View>
              <Text style={styles.barLabel} numberOfLines={2}>
                {item.subject_name || item.subject_id || 'Unknown'}
              </Text>
              <View style={styles.barValues}>
                <Text style={styles.barValue}>
                  {item.done_minutes || 0}m / {item.expected_weekly_minutes || 0}m
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // Chart content only
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
  },
  legendLine: {
    backgroundColor: 'transparent',
    borderTopWidth: 2,
    borderTopColor: colors.muted,
    height: 0,
  },
  legendText: {
    fontSize: 12,
    color: colors.muted,
  },
  chart: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-end',
    minHeight: 200,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
  },
  bars: {
    width: '100%',
    height: 200,
    position: 'relative',
    marginBottom: 8,
  },
  bar: {
    position: 'absolute',
    bottom: 0,
    width: '45%',
    borderRadius: 4,
  },
  doneBar: {
    backgroundColor: colors.blueBold,
    left: '2.5%',
  },
  scheduledBar: {
    backgroundColor: colors.greenBold,
    right: '2.5%',
  },
  expectedLine: {
    position: 'absolute',
    borderTopWidth: 2,
    borderTopColor: colors.muted,
    borderStyle: 'dashed',
  },
  barLabel: {
    fontSize: 10,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
    minHeight: 28,
  },
  barValues: {
    alignItems: 'center',
  },
  barValue: {
    fontSize: 10,
    color: colors.muted,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
});

