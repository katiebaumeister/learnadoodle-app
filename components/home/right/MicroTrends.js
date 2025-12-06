import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Sparkles } from 'lucide-react';
import { colors, shadows } from '../../../theme/colors';

export default function MicroTrends({ data = [], onViewIntelligence }) {
  // Limit to 2-3 most meaningful trends
  const meaningfulTrends = data.slice(0, 3);

  if (meaningfulTrends.length === 0) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
          {onViewIntelligence ? (
            <TouchableOpacity
              style={styles.headerLeft}
              onPress={onViewIntelligence}
              activeOpacity={0.7}
            >
              <Sparkles size={14} color={colors.text} />
              <Text style={styles.title}>Micro trends</Text>
            </TouchableOpacity>
          ) : (
        <View style={styles.headerLeft}>
          <Sparkles size={14} color={colors.text} />
          <Text style={styles.title}>Micro trends</Text>
        </View>
          )}
          <Text style={styles.subtitle}>3-day lookback</Text>
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No trends detected yet</Text>
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
              <Sparkles size={14} color={colors.text} />
              <Text style={styles.title}>Micro trends</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerLeft}>
              <Sparkles size={14} color={colors.text} />
              <Text style={styles.title}>Micro trends</Text>
            </View>
          )}
        <Text style={styles.subtitle}>3-day lookback</Text>
      </View>

      <View style={styles.trendsList}>
        {meaningfulTrends.map((trend, index) => {
          return (
            <View key={index} style={styles.trendItem}>
              <Text style={styles.trendText}>
                {trend.child_name} {trend.message}
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
  subtitle: {
    fontSize: 11,
    color: colors.muted,
  },
  trendsList: {
    gap: 6,
  },
  trendItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  trendText: {
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

