import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlanKey } from '../../constants/subscription';
import { fractionOfMonthlyAiUsed } from '../../constants/aiUsageUnits';

type Props = {
  currentPlan: PlanKey;
  aiUsedUnitsThisMonth: number | null;
  /** Omit when `variant` is `modal` (no link shown). */
  onPressUpgrade?: () => void;
  /** `page` = subscription strip with link; `modal` = meter only inside UsageLimitModal. */
  variant?: 'page' | 'modal';
};

/** Single-line AI usage meter — not a card. */
export function SubscriptionAiUsageInline({
  currentPlan,
  aiUsedUnitsThisMonth,
  onPressUpgrade,
  variant = 'page',
}: Props) {
  const used = aiUsedUnitsThisMonth ?? 0;
  const pct =
    aiUsedUnitsThisMonth == null ? null : Math.round(fractionOfMonthlyAiUsed(used, currentPlan) * 100);
  const barWidth = pct == null ? 0 : Math.min(100, Math.max(0, pct));

  const linkLabel =
    currentPlan === 'familyPlus' ? 'Manage AI add-ons →' : 'Upgrade for higher limits →';

  const isModal = variant === 'modal';

  return (
    <View style={[styles.row, isModal && styles.rowModal]}>
      <Text style={styles.label}>AI usage:</Text>
      <Text style={styles.pct}>{pct == null ? '—' : `${pct}% used`}</Text>
      <View style={[styles.track, isModal && styles.trackModal]}>
        <View style={[styles.fill, { width: `${barWidth}%` }]} />
      </View>
      {!isModal && onPressUpgrade ? (
        <Pressable
          onPress={onPressUpgrade}
          style={({ pressed }) => [styles.linkHit, pressed && styles.linkHitPressed]}
          {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}
        >
          <Text style={styles.link}>{linkLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    marginBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  rowModal: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pct: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    minWidth: 56,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  track: {
    flex: 1,
    minWidth: 120,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  trackModal: {
    minWidth: 160,
    flexGrow: 1,
    flexBasis: 120,
  },
  fill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3B82F6',
    maxWidth: '100%',
  },
  linkHit: {
    paddingVertical: 2,
  },
  linkHitPressed: {
    opacity: 0.85,
  },
  link: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
