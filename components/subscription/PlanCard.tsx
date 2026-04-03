import React from 'react';
import { Check } from 'lucide-react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BillingMode } from './BillingToggle';
import type { PlanKey, SubscriptionPlanDef } from '../../constants/subscription';

type Props = {
  plan: SubscriptionPlanDef;
  billingMode: BillingMode;
  currentPlan: PlanKey;
  renewalLabel?: string;
  onPress: () => void;
};

export function PlanCard({ plan, billingMode, currentPlan, renewalLabel = 'Renews Jan 2026', onPress }: Props) {
  const isCurrent = currentPlan === plan.key;
  const isFree = plan.key === 'free';
  const displayPrice = billingMode === 'monthly' ? plan.monthlyPrice : plan.annualPrice;

  const priceLabel =
    billingMode === 'monthly'
      ? `$${displayPrice}/mo`
      : plan.key === 'free'
        ? '$0'
        : `$${displayPrice}/yr`;

  const ctaLabel = (() => {
    if (plan.key === 'free') return 'Switch to Free';
    if (plan.key === 'family') return 'Choose Family';
    return 'Upgrade to Family+';
  })();

  const isPrimaryCta = plan.key === 'familyPlus' && !isCurrent;
  const isSecondaryCta = (plan.key === 'free' || plan.key === 'family') && !isCurrent;

  const t = plan.tier;

  const allLines = [...plan.topBenefits, ...plan.secondaryFeatures];

  return (
    <View
      style={[
        styles.card,
        t === 'free' && styles.cardFree,
        t === 'family' && styles.cardFamily,
        t === 'premium' && styles.cardPremium,
        isFree && styles.cardFreeQuiet,
        isCurrent && t === 'family' && styles.cardFamilyCurrent,
        isCurrent && t === 'premium' && styles.cardPremiumCurrent,
        isCurrent && t === 'free' && styles.cardFreeCurrent,
      ]}
    >
      <Text style={[styles.planName, isFree && styles.mutedTitle]}>{plan.name}</Text>
      <Text style={[styles.price, isFree && styles.mutedPrice]}>{priceLabel}</Text>
      <Text style={[styles.positioning, isFree && styles.mutedBody]} numberOfLines={2}>
        {plan.positioningLine}
      </Text>

      <View style={styles.divider} />

      <View style={styles.features}>
        {allLines.map((line) => (
          <View key={line} style={styles.benefitRow}>
            <Check size={14} color={isFree ? '#A3A3A3' : '#059669'} strokeWidth={2.5} style={styles.checkIcon} />
            <Text style={[styles.benefitText, isFree && styles.mutedBenefit]}>{line}</Text>
          </View>
        ))}
      </View>

      <View style={styles.flexSpacer} />

      {isCurrent ? (
        <View style={styles.currentFooter}>
          <View style={styles.currentFooterTopRow}>
            <Check size={15} color="#047857" strokeWidth={2.5} style={styles.currentFooterCheck} />
            <Text style={styles.currentFooterTitle}>Current plan</Text>
          </View>
          <Text style={styles.currentFooterRenewal}>{renewalLabel}</Text>
        </View>
      ) : (
        <View style={styles.ctaBlock}>
          <Pressable
            onPress={onPress}
            style={[
              styles.cta,
              isPrimaryCta && styles.ctaPrimary,
              isSecondaryCta && styles.ctaSecondary,
              isFree && styles.ctaFree,
            ]}
            {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}
          >
            <Text
              style={[
                styles.ctaText,
                isPrimaryCta && styles.ctaTextPrimary,
                isFree && styles.ctaTextFree,
              ]}
            >
              {ctaLabel}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    flexDirection: 'column',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardFreeQuiet: {
    opacity: 0.92,
  },
  cardFree: {
    backgroundColor: '#FAFAFA',
    borderColor: '#E5E5E5',
    padding: 12,
    paddingVertical: 12,
  },
  cardFreeCurrent: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    borderColor: '#D1D5DB',
    opacity: 1,
  },
  cardFamily: {
    backgroundColor: '#F5F9FF',
    borderColor: '#BFDBFE',
  },
  cardFamilyCurrent: {
    borderColor: '#60A5FA',
    shadowColor: '#1e40af',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  cardPremium: {
    backgroundColor: '#F7F5FF',
    borderColor: '#A5B4FC',
    shadowColor: '#312e81',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardPremiumCurrent: {
    borderColor: '#818CF8',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 4,
  },
  planName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mutedTitle: {
    color: '#78716C',
  },
  price: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 34,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mutedPrice: {
    color: '#78716C',
  },
  positioning: {
    fontSize: 12,
    lineHeight: 16,
    color: '#525252',
    fontWeight: '500',
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mutedBody: {
    color: '#A8A29E',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 8,
    alignSelf: 'stretch',
  },
  features: {
    gap: 7,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  checkIcon: {
    marginTop: 1,
  },
  benefitText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    color: '#292524',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mutedBenefit: {
    color: '#78716C',
    fontWeight: '500',
  },
  flexSpacer: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 6,
  },
  currentFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 2,
  },
  currentFooterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  currentFooterCheck: {
    flexShrink: 0,
  },
  currentFooterTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentFooterRenewal: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    color: '#059669',
    textAlign: 'center',
    opacity: 0.92,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ctaBlock: {
    gap: 4,
    alignItems: 'stretch',
  },
  cta: {
    height: 40,
    maxHeight: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  ctaFree: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6D3D1',
  },
  ctaSecondary: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  ctaPrimary: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  ctaTextPrimary: {
    color: '#FFFFFF',
  },
  ctaTextFree: {
    color: '#57534E',
    fontWeight: '600',
  },
});
