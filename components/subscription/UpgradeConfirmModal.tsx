import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SUBSCRIPTION_PLANS } from '../../constants/subscription';
import type { BillingMode } from './BillingToggle';
import type { PlanKey } from '../../constants/subscription';

type Props = {
  visible: boolean;
  selectedPlan: PlanKey | null;
  billingMode: BillingMode;
  onClose: () => void;
  onConfirm: () => void;
};

export function UpgradeConfirmModal({ visible, selectedPlan, billingMode, onClose, onConfirm }: Props) {
  if (!selectedPlan) return null;

  const plan = SUBSCRIPTION_PLANS[selectedPlan];
  const amount =
    billingMode === 'monthly'
      ? plan.monthlyPrice === 0
        ? '$0'
        : `$${plan.monthlyPrice}/month`
      : plan.annualPrice === 0
        ? '$0'
        : `$${plan.annualPrice}/year`;

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
          <Text style={styles.title}>Confirm your plan</Text>
          <Text style={styles.body}>
            You’re switching to <Text style={styles.bold}>{plan.name}</Text> for{' '}
            <Text style={styles.bold}>{amount}</Text>.
          </Text>
          <Text style={styles.subbody}>
            Billing will continue through Stripe. You can manage or cancel anytime from your subscription
            settings.
          </Text>

          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primary} onPress={onConfirm}>
              <Text style={styles.primaryText}>Continue to billing</Text>
            </Pressable>
          </View>
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
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#18202A',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#465365',
  },
  subbody: {
    fontSize: 14,
    lineHeight: 21,
    color: '#677285',
  },
  bold: {
    fontWeight: '800',
    color: '#18202A',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
    flexWrap: 'wrap',
  },
  secondary: {
    backgroundColor: '#F3F5F8',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryText: {
    fontWeight: '700',
    color: '#253041',
  },
  primary: {
    backgroundColor: '#1F2D3D',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryText: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
