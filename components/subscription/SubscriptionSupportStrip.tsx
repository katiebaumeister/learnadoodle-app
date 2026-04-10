import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlanKey } from '../../constants/subscription';
import {
  PLAN_MONTHLY_AI_UNITS,
  fractionOfMonthlyAiUsed,
  isAiUsageHigh,
} from '../../constants/aiUsageUnits';

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
  const limit = PLAN_MONTHLY_AI_UNITS[currentPlan];
  const used = aiUsedUnitsThisMonth ?? null;
  const hasUsageData = used != null;
  const pct = hasUsageData ? Math.round(fractionOfMonthlyAiUsed(used, currentPlan) * 100) : null;
  const barWidth = pct == null ? 0 : Math.min(100, Math.max(0, pct));
  const high = hasUsageData && isAiUsageHigh(used, currentPlan);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Manage subscription</Text>
      <View style={styles.sectionRule} />

      <View style={[styles.card, styles.cardGap]}>
        <Text style={styles.cardTitle}>Billing</Text>
        <Text style={styles.cardSub}>Payment & renewal</Text>
        <Pressable
          onPress={onOpenBilling}
          hitSlop={6}
          {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}
        >
          <Text style={styles.link}>Open billing →</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI usage</Text>
        <Text style={styles.cardSub}>Limits & upgrades</Text>

        {hasUsageData ? (
          <View style={styles.meterBlock}>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${barWidth}%` },
                  high && styles.fillWarn,
                ]}
              />
            </View>
            <Text style={[styles.meterCaption, high && styles.meterCaptionWarn]}>
              {used} / {limit} actions this month
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={onViewUsageOptions}
          hitSlop={6}
          {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}
        >
          <Text style={styles.link}>View usage →</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    marginBottom: 8,
    paddingTop: 20,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 0,
    marginBottom: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionRule: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: 24,
    alignSelf: 'stretch',
  },
  card: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#F0F0F0',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  cardGap: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1c1917',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cardSub: {
    fontSize: 12,
    lineHeight: 16,
    color: '#78716C',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  meterBlock: {
    gap: 8,
    marginTop: 2,
    marginBottom: 2,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#85C4F2',
  },
  fillWarn: {
    backgroundColor: '#D97706',
  },
  meterCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#57534E',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  meterCaptionWarn: {
    color: '#B45309',
  },
  link: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6BB3E8',
    marginTop: 2,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
