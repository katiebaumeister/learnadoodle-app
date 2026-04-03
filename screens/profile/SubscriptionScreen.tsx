import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PlanKey } from '../../constants/subscription';
import type { BillingMode } from '../../components/subscription/BillingToggle';
import { SubscriptionPlansSection } from '../../components/subscription/SubscriptionPlansSection';
import { SubscriptionSupportStrip } from '../../components/subscription/SubscriptionSupportStrip';
import { UpgradeConfirmModal } from '../../components/subscription/UpgradeConfirmModal';
import { UsageLimitModal } from '../../components/subscription/UsageLimitModal';

type SubscriptionScreenProps = {
  /**
   * When set (e.g. from Family settings), plan CTAs, billing, usage, and app-store footer
   * open the host “coming soon” flow instead of real checkout / modals.
   */
  onComingSoon?: () => void;
  aiUsedUnitsThisMonth?: number | null;
  /** When set with the app shell (e.g. Family panel), keeps plan in sync with sidebar. */
  currentPlan?: PlanKey;
  onCurrentPlanChange?: (plan: PlanKey) => void;
};

function PressableFooterHint({ onPress }: { onPress?: () => void }) {
  const body = (
    <Text style={footerHintStyles.text}>Available on iOS & Android</Text>
  );
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={footerHintStyles.wrap}
        {...(Platform.OS === 'web' && { cursor: 'pointer' as const })}
      >
        {body}
      </Pressable>
    );
  }
  return <View style={footerHintStyles.wrap}>{body}</View>;
}

const footerHintStyles = StyleSheet.create({
  wrap: {
    marginTop: 6,
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

export default function SubscriptionScreen({
  onComingSoon,
  aiUsedUnitsThisMonth = null,
  currentPlan: currentPlanProp,
  onCurrentPlanChange,
}: SubscriptionScreenProps) {
  const [billingMode, setBillingMode] = useState<BillingMode>('monthly');
  const [internalPlan, setInternalPlan] = useState<PlanKey>('family');
  const planControlled = currentPlanProp !== undefined;
  const currentPlan = planControlled ? currentPlanProp! : internalPlan;
  const setCurrentPlan = (plan: PlanKey) => {
    onCurrentPlanChange?.(plan);
    if (!planControlled) setInternalPlan(plan);
  };
  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showUsageLimitModal, setShowUsageLimitModal] = useState(false);

  const handleSelectPlan = (planKey: PlanKey) => {
    if (planKey === currentPlan) return;
    if (onComingSoon) {
      onComingSoon();
      return;
    }
    setSelectedPlan(planKey);
    setShowUpgradeModal(true);
  };

  const openBillingPortal = () => {
    if (onComingSoon) {
      onComingSoon();
      return;
    }
    /* Stripe customer portal */
  };

  const openUsageOptions = () => {
    if (onComingSoon) {
      onComingSoon();
      return;
    }
    setShowUsageLimitModal(true);
  };

  return (
    <View
      style={[
        styles.root,
        Platform.OS === 'web' && ({ maxHeight: 'calc(100vh - 160px)' } as Record<string, string>),
      ]}
    >
      <View style={styles.zoneTop}>
        <Text style={styles.pageTitle}>Subscription</Text>
        <Text style={styles.sectionHeading}>Choose your family plan</Text>
        <View style={styles.sectionRule} />
      </View>

      <View style={styles.zonePlans}>
        <SubscriptionPlansSection
          billingMode={billingMode}
          onBillingChange={setBillingMode}
          currentPlan={currentPlan}
          onSelectPlan={handleSelectPlan}
          renewalLabel="Renews Jan 2026"
        />
      </View>

      <View style={styles.zoneFooter}>
        <SubscriptionSupportStrip
          currentPlan={currentPlan}
          aiUsedUnitsThisMonth={aiUsedUnitsThisMonth}
          onOpenBilling={openBillingPortal}
          onViewUsageOptions={openUsageOptions}
        />
        <PressableFooterHint onPress={onComingSoon} />
      </View>

      <UpgradeConfirmModal
        visible={showUpgradeModal}
        selectedPlan={selectedPlan}
        billingMode={billingMode}
        onClose={() => setShowUpgradeModal(false)}
        onConfirm={() => {
          if (selectedPlan) setCurrentPlan(selectedPlan);
          setShowUpgradeModal(false);
        }}
      />

      <UsageLimitModal
        visible={showUsageLimitModal}
        currentPlan={currentPlan}
        aiUsedUnitsThisMonth={aiUsedUnitsThisMonth}
        onClose={() => setShowUsageLimitModal(false)}
        onUpgrade={() => {
          setShowUsageLimitModal(false);
          setSelectedPlan('familyPlus');
          setShowUpgradeModal(true);
        }}
        onContinueWithOverage={() => {
          setShowUsageLimitModal(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    flexGrow: 1,
    gap: 0,
  },
  zoneTop: {
    width: '100%',
  },
  pageTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 32,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 0,
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionRule: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: 20,
  },
  zonePlans: {
    width: '100%',
    flexShrink: 0,
  },
  zoneFooter: {
    width: '100%',
    flexShrink: 0,
    gap: 0,
    paddingTop: 16,
    paddingBottom: 8,
  },
});
