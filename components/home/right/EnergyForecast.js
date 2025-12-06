import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Zap, Coffee } from 'lucide-react';
import { colors, shadows } from '../../../theme/colors';

export default function EnergyForecast({ data = [], onViewIntelligence }) {
  // Limit to 1-2 most helpful forecasts
  const helpfulForecasts = data.slice(0, 2);

  if (helpfulForecasts.length === 0) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
          {onViewIntelligence ? (
            <TouchableOpacity
              style={styles.headerLeft}
              onPress={onViewIntelligence}
              activeOpacity={0.7}
            >
              <Zap size={14} color={colors.text} />
              <Text style={styles.title}>Energy forecast</Text>
            </TouchableOpacity>
          ) : (
        <View style={styles.headerLeft}>
          <Zap size={14} color={colors.text} />
          <Text style={styles.title}>Energy forecast</Text>
            </View>
          )}
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Schedule looks balanced</Text>
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
              <Zap size={14} color={colors.text} />
              <Text style={styles.title}>Energy forecast</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerLeft}>
              <Zap size={14} color={colors.text} />
              <Text style={styles.title}>Energy forecast</Text>
            </View>
          )}
      </View>

      <View style={styles.forecastList}>
        {helpfulForecasts.map((forecast, index) => {
          const Icon = forecast.type === 'heavy' ? Coffee : Zap;

          return (
            <View key={index} style={styles.forecastItem}>
              <Icon size={12} color={colors.muted} />
              <Text style={styles.forecastText}>
                {forecast.message}
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
  forecastList: {
    gap: 6,
  },
  forecastItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  forecastText: {
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

