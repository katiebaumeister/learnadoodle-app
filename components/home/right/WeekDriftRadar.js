import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TrendingDown, TrendingUp, CheckCircle } from 'lucide-react';
import { colors, shadows } from '../../../theme/colors';

export default function WeekDriftRadar({ data = [], onViewIntelligence }) {
  // Limit to 2-3 most significant flags
  const significantDrifts = data
    .filter(item => Math.abs(item.drift_minutes) >= 20 || item.status === 'needs_attention')
    .slice(0, 3);

  if (significantDrifts.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          {onViewIntelligence ? (
            <TouchableOpacity
              style={styles.headerLeft}
              onPress={onViewIntelligence}
              activeOpacity={0.7}
            >
              <TrendingDown size={14} color={colors.text} />
              <Text style={styles.title}>Week drift radar</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerLeft}>
              <TrendingDown size={14} color={colors.text} />
              <Text style={styles.title}>Week drift radar</Text>
            </View>
          )}
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No drift detected this week</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
          {onViewIntelligence ? (
            <TouchableOpacity
              style={styles.headerLeft}
              onPress={onViewIntelligence}
              activeOpacity={0.7}
            >
              <TrendingDown size={14} color={colors.text} />
              <Text style={styles.title}>Week drift radar</Text>
            </TouchableOpacity>
          ) : (
        <View style={styles.headerLeft}>
          <TrendingDown size={14} color={colors.text} />
          <Text style={styles.title}>Week drift radar</Text>
        </View>
          )}
      </View>

      <View style={styles.driftList}>
        {significantDrifts.map((item, index) => {
          const isUnder = item.drift_minutes < 0;
          const isOver = item.drift_minutes > 0;
          const isOnTrack = item.status === 'on_track';

          return (
            <View key={index} style={styles.driftItem}>
              {isUnder && <TrendingDown size={12} color={colors.orangeBold} />}
              {isOver && <TrendingUp size={12} color={colors.blueBold} />}
              {isOnTrack && <CheckCircle size={12} color={colors.greenBold} />}
              <Text style={styles.driftText}>
                {item.subject}: {isUnder ? `${Math.abs(item.drift_minutes)} min under plan` : isOver ? `${item.drift_minutes} min over plan` : 'On track'}
                {item.needs_session && ' — Needs 1 short session'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: colors.radiusMd,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  driftList: {
    gap: 6,
  },
  driftItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  driftText: {
    fontSize: 11,
    color: colors.text,
    flex: 1,
    lineHeight: 16,
  },
  emptyState: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 11,
    color: colors.muted,
    fontStyle: 'italic',
  },
});

