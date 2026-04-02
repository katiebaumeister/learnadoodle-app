import React, { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import type { PlanKey } from '../../constants/subscription';
import type { BillingMode } from '../../components/subscription/BillingToggle';
import { SubscriptionAppDownloadBanner } from '../../components/subscription/SubscriptionAppDownloadBanner';
import { SubscriptionPlansSection } from '../../components/subscription/SubscriptionPlansSection';
import { SubscriptionSupportStrip } from '../../components/subscription/SubscriptionSupportStrip';
import { UpgradeConfirmModal } from '../../components/subscription/UpgradeConfirmModal';
import { UsageLimitModal } from '../../components/subscription/UsageLimitModal';

type SubscriptionScreenProps = {
  onStoreLinksComingSoon?: () => void;
  aiUsedUnitsThisMonth?: number | null;
};

export default function SubscriptionScreen({
  onStoreLinksComingSoon,
  aiUsedUnitsThisMonth = null,
}: SubscriptionScreenProps) {
  const [billingMode, setBillingMode] = useState<BillingMode>('monthly');
  const [currentPlan, setCurrentPlan] = useState<PlanKey>('family');
  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showUsageLimitModal, setShowUsageLimitModal] = useState(false);

  const handleSelectPlan = (planKey: PlanKey) => {
    if (planKey === currentPlan) return;
    setSelectedPlan(planKey);
    setShowUpgradeModal(true);
  };

  const openBillingPortal = () => {
    /* Stripe customer portal */
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
          onViewUsageOptions={() => setShowUsageLimitModal(true)}
        />
        <SubscriptionAppDownloadBanner onComingSoon={onStoreLinksComingSoon} />
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
    ...(Platform.OS === 'web' && {
      justifyContent: 'space-between',
    }),
    gap: 0,
  },
  zoneTop: {
    marginBottom: 8,
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
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 0,
    width: '100%',
  },
  zoneFooter: {
    gap: 8,
    marginTop: 4,
    paddingBottom: 4,
  },
});
