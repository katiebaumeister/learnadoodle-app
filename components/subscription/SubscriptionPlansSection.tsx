import React, { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SUBSCRIPTION_PLANS, type PlanKey } from '../../constants/subscription';
import { BillingToggle, type BillingMode } from './BillingToggle';
import { PlanCard } from './PlanCard';

type Props = {
  billingMode: BillingMode;
  onBillingChange: (m: BillingMode) => void;
  currentPlan: PlanKey;
  onSelectPlan: (key: PlanKey) => void;
  renewalLabel?: string;
};

export function SubscriptionPlansSection({
  billingMode,
  onBillingChange,
  currentPlan,
  onSelectPlan,
  renewalLabel = 'Renews Jan 2026',
}: Props) {
  const { width } = useWindowDimensions();
  const gridLayout = useMemo(() => {
    if (width < 560) return 'single' as const;
    if (width < 992) return 'double' as const;
    return 'triple' as const;
  }, [width]);

  const orderedPlans = useMemo(
    () => [SUBSCRIPTION_PLANS.free, SUBSCRIPTION_PLANS.family, SUBSCRIPTION_PLANS.familyPlus],
    []
  );

  const anchorRow = gridLayout === 'triple';
  const anchorPerCard = gridLayout === 'single' || gridLayout === 'double';

  return (
    <View style={styles.section}>
      <View style={styles.billingCenter}>
        <BillingToggle
          value={billingMode}
          onChange={onBillingChange}
          style={styles.toggleCentered}
        />
      </View>

      {anchorRow ? (
        <View style={styles.anchorRow}>
          {orderedPlans.map((plan) => (
            <View
              key={`anchor-${plan.key}`}
              style={[
                styles.anchorCell,
                gridLayout === 'double' && styles.anchorCellDouble,
                gridLayout === 'triple' && styles.anchorCellTriple,
              ]}
            >
              <Text style={styles.anchorText}>{plan.comparisonAnchor}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View
        style={[
          styles.plansGrid,
          gridLayout === 'triple' && styles.plansGridTripleAlign,
        ]}
      >
        {orderedPlans.map((plan) => (
          <View
            key={plan.key}
            style={[
              styles.cardCell,
              gridLayout === 'single' && styles.cardCellSingle,
              gridLayout === 'double' && styles.cardCellDouble,
              gridLayout === 'triple' && styles.cardCellTriple,
              gridLayout === 'triple' && staggerCell(plan.key),
            ]}
          >
            {anchorPerCard ? (
              <Text style={styles.anchorAboveCard}>{plan.comparisonAnchor}</Text>
            ) : null}
            <PlanCard
              plan={plan}
              billingMode={billingMode}
              currentPlan={currentPlan}
              renewalLabel={renewalLabel}
              onPress={() => onSelectPlan(plan.key)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function staggerCell(key: PlanKey) {
  if (key === 'free') return { marginTop: 6 };
  if (key === 'family') return { marginTop: 0 };
  if (key === 'familyPlus') return { marginTop: 4 };
  return {};
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
    flexShrink: 0,
  },
  anchorRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 12,
    marginBottom: 4,
    alignItems: 'flex-end',
  },
  anchorCell: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  anchorCellDouble: {
    flexBasis: 0,
    minWidth: 220,
    maxWidth: '50%',
  },
  anchorCellTriple: {
    flexBasis: 0,
    minWidth: 220,
  },
  anchorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  anchorAboveCard: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 4,
  },
  plansGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    alignItems: 'stretch',
  },
  plansGridTripleAlign: {
    alignItems: 'flex-end',
  },
  cardCell: {
    flexGrow: 1,
    flexShrink: 1,
  },
  cardCellSingle: {
    flexBasis: '100%',
    minWidth: '100%',
    maxWidth: '100%',
  },
  cardCellDouble: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 220,
    maxWidth: '50%',
  },
  cardCellTriple: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 220,
  },
  billingCenter: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  toggleCentered: {
    alignSelf: 'center',
  },
});
