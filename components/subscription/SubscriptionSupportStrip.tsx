import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlanKey } from '../../constants/subscription';
import { isAiUsageHigh } from '../../constants/aiUsageUnits';

type Props = {
  currentPlan: PlanKey;
  aiUsedUnitsThisMonth?: number | null;
  onOpenBilling: () => void;
  onViewUsageOptions: () => void;
};

export function SubscriptionSupportStrip({
  currentPlan,
  aiUsedUnitsThisMonth,
  onOpenBilling,
  onViewUsageOptions,
}: Props) {
  const showHighUsage =
    aiUsedUnitsThisMonth != null && isAiUsageHigh(aiUsedUnitsThisMonth, currentPlan);

  return (
    <View style={styles.footerRow}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Billing</Text>
        <Text style={styles.cardBody}>Payment & renewal</Text>
        <Pressable onPress={onOpenBilling} hitSlop={6} {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}>
          <Text style={styles.link}>Open billing →</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI usage</Text>
        {showHighUsage ? (
          <Text style={styles.warn}>Most of included AI used this month.</Text>
        ) : (
          <Text style={styles.cardBody}>Limits & upgrades</Text>
        )}
        <Pressable onPress={onViewUsageOptions} hitSlop={6} {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}>
          <Text style={styles.link}>View usage →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'stretch',
    marginTop: 4,
    marginBottom: 8,
  },
  card: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E5E4',
    gap: 4,
    justifyContent: 'flex-start',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1c1917',
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cardBody: {
    fontSize: 11,
    lineHeight: 15,
    color: '#78716C',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  warn: {
    fontSize: 11,
    lineHeight: 15,
    color: '#B45309',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  link: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
