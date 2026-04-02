import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { fractionOfMonthlyAiUsed } from '../../constants/aiUsageUnits';
import { OVERAGE_CONFIG } from '../../constants/subscription';
import type { PlanKey } from '../../constants/subscription';
import { SubscriptionAiUsageInline } from './SubscriptionAiUsageInline';

type Props = {
  visible: boolean;
  currentPlan: PlanKey;
  aiUsedUnitsThisMonth?: number | null;
  onClose: () => void;
  onUpgrade: () => void;
  onContinueWithOverage: () => void;
};

export function UsageLimitModal({
  visible,
  currentPlan,
  aiUsedUnitsThisMonth = null,
  onClose,
  onUpgrade,
  onContinueWithOverage,
}: Props) {
  const tier = currentPlan === 'familyPlus' ? 'familyPlus' : 'family';
  const config = OVERAGE_CONFIG[tier];
  const isPlus = currentPlan === 'familyPlus';

  const used = aiUsedUnitsThisMonth ?? 0;
  const pctRounded =
    aiUsedUnitsThisMonth == null ? null : Math.round(fractionOfMonthlyAiUsed(used, currentPlan) * 100);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close dialog">
        <View
          style={styles.sheet}
          {...(Platform.OS === 'web'
            ? {
                onClick: (e: { stopPropagation?: () => void }) => e.stopPropagation?.(),
              }
            : {})}
        >
          <Text style={styles.intro}>
            {pctRounded == null
              ? 'Included AI usage is shown below. View upgrade options below:'
              : `You’ve used ${pctRounded}% of your included total usage. View upgrade options below:`}
          </Text>

          <View style={styles.meterWrap}>
            <SubscriptionAiUsageInline
              variant="modal"
              currentPlan={currentPlan}
              aiUsedUnitsThisMonth={aiUsedUnitsThisMonth}
            />
          </View>

          {!isPlus && (
            <Pressable style={[styles.option, styles.featured]} onPress={onUpgrade}>
              <Text style={styles.featuredTitle}>Upgrade to Family+</Text>
              <Text style={styles.featuredBody}>
                Get higher included AI usage plus compliance, records, and advanced forecasting.
              </Text>
            </Pressable>
          )}

          <Pressable
            style={[styles.option, isPlus && styles.featured]}
            onPress={onContinueWithOverage}
          >
            <Text style={isPlus ? styles.featuredTitle : styles.optionTitle}>
              {isPlus ? `Add ${config.overagePackName}` : `Add ${config.overagePackName} — $${config.overagePrice}`}
            </Text>
            <Text style={isPlus ? styles.featuredBody : styles.optionBody}>
              {isPlus ? `$${config.overagePrice} — ${config.description}` : config.description}
            </Text>
          </Pressable>

          <Pressable style={styles.option} onPress={onClose}>
            <Text style={styles.optionTitle}>Wait until monthly reset</Text>
            <Text style={styles.optionBody}>
              Your included usage will refresh automatically next month.
            </Text>
          </Pressable>

          <Text style={styles.footer}>We’ll always confirm any additional charge before billing.</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(18, 24, 32, 0.32)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    gap: 12,
  },
  intro: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: '#18202A',
    marginBottom: 2,
  },
  meterWrap: {
    width: '100%',
    marginTop: 4,
    marginBottom: 4,
  },
  option: {
    borderWidth: 1,
    borderColor: '#E8EBF0',
    borderRadius: 18,
    padding: 14,
    backgroundColor: '#FFFFFF',
  },
  featured: {
    backgroundColor: '#F8FBFF',
    borderColor: '#B9D8FF',
  },
  featuredTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1B3550',
    marginBottom: 4,
  },
  featuredBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#556476',
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#253041',
    marginBottom: 4,
  },
  optionBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#667284',
  },
  footer: {
    fontSize: 12,
    lineHeight: 18,
    color: '#8A94A6',
    marginTop: 2,
  },
});
