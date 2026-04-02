export type PlanKey = 'free' | 'family' | 'familyPlus';

export type SubscriptionPlanDef = {
  key: PlanKey;
  name: string;
  monthlyPrice: number;
  annualPrice: number;
  /** Legacy full list; UI uses merged feature lines. */
  tagline: string;
  features: string[];
  tier: 'free' | 'family' | 'premium';
  comparisonAnchor: string;
  positioningLine: string;
  topBenefits: readonly [string, string, string];
  secondaryFeatures: string[];
};

export const SUBSCRIPTION_PLANS: Record<PlanKey, SubscriptionPlanDef> = {
  free: {
    key: 'free',
    name: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    tagline: 'For trying Learnadoodle with one child',
    tier: 'free',
    comparisonAnchor: 'Starter',
    positioningLine: 'Try with one learner',
    topBenefits: ['1 child', 'Daily planner', 'Basic scheduling'],
    secondaryFeatures: ['Light AI help'],
    features: ['1 child', 'Daily planner', 'Basic scheduling', 'Light AI help'],
  },
  family: {
    key: 'family',
    name: 'Family',
    monthlyPrice: 12,
    annualPrice: 115,
    tagline: 'Best for most families',
    tier: 'family',
    comparisonAnchor: 'Most popular',
    positioningLine: 'For growing families',
    topBenefits: ['Up to 5 children', 'Shared family planner', 'AI-powered planning'],
    secondaryFeatures: ['2 parent accounts', 'Progress tracking'],
    features: [
      'Up to 5 children',
      '2 parent accounts',
      'Shared family planner',
      'AI-powered planning',
      'Progress tracking',
    ],
  },
  familyPlus: {
    key: 'familyPlus',
    name: 'Family+',
    monthlyPrice: 22,
    annualPrice: 211,
    tagline: 'For records, compliance, and heavier AI use',
    tier: 'premium',
    comparisonAnchor: 'Best for compliance',
    positioningLine: 'Records & compliance',
    topBenefits: ['Everything in Family', 'Attendance + transcripts', 'State compliance tracking'],
    secondaryFeatures: ['Advanced forecasting & planning insights', 'Extended AI usage'],
    features: [
      'Everything in Family',
      'Attendance and transcripts',
      'State compliance tools',
      'Advanced forecasting',
      'Extended AI access',
    ],
  },
};

export const OVERAGE_CONFIG = {
  family: {
    overagePackName: 'Extended AI Access',
    overagePrice: 6,
    description:
      'Continue using AI this month without interrupting your planning flow.',
  },
  familyPlus: {
    overagePackName: 'Extended AI Access',
    overagePrice: 8,
    description:
      'Keep using advanced AI tools this month without interruption.',
  },
};
