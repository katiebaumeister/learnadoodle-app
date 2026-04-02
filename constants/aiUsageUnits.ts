import type { PlanKey } from './subscription';

/**
 * Internal AI “units” per action — not shown in the product UI.
 * Lets us tune costs, swap models, and rate-limit without changing copy.
 */
export const AI_ACTION_UNIT_WEIGHTS = {
  /** Light */
  chatbotSimple: 1,
  chatbotPlannerAware: 2,
  smallEdit: 2,
  /** Medium */
  rebalanceSingleWeek: 10,
  resolveConflicts: 6,
  adjustSubjectPacing: 6,
  /** Heavy */
  parsePlainTextToStructure: 8,
  generatePlanWeek: 12,
  generatePlanMultiWeek: 18,
  /** Very heavy (ranges use midpoint for estimates unless specified) */
  parseUploadedMaterialMin: 20,
  parseUploadedMaterialMax: 30,
  curriculumImportStructuring: 30,
  fullSystemRebalanceMultiWeek: 25,
} as const;

/** Monthly included units per plan (internal). */
export const PLAN_MONTHLY_AI_UNITS: Record<PlanKey, number> = {
  free: 40,
  family: 300,
  familyPlus: 1000,
};

export function fractionOfMonthlyAiUsed(usedUnits: number, plan: PlanKey): number {
  const limit = PLAN_MONTHLY_AI_UNITS[plan];
  if (limit <= 0) return 0;
  return Math.min(1, usedUnits / limit);
}

/** e.g. show soft warning in Subscription when usage crosses this share of the monthly allowance */
export const AI_USAGE_HIGH_FRACTION = 0.8;

export function isAiUsageHigh(usedUnits: number, plan: PlanKey): boolean {
  return fractionOfMonthlyAiUsed(usedUnits, plan) >= AI_USAGE_HIGH_FRACTION;
}
