/**
 * Plan My Year flow — incremental rollout (logistics-first, multi-subject cadence, per-subject units).
 * PlanYearModal imports helpers from here to keep navigation consistent.
 */

/** When true, flow order is: logistics (cadence + inline unit methods + slot preview) → unit modal; no separate review step for homeschool. */
export const PLAN_MY_YEAR_LOGISTICS_FIRST = true;

/** When true, show multi-subject cadence hint + sync perSubjectCadenceDraft from blocks (PlanYearModal). */
export const PLAN_MY_YEAR_MULTI_SUBJECT_CADENCE = true;

export const PLAN_STEP_KEYS = {
  SOURCE: 'source',
  UNIT_STRUCTURE: 'unit_structure',
  LOGISTICS: 'logistics',
  PREVIEW: 'preview',
};

/** Initial step when opening a new plan wizard. */
export function getInitialPlanStep(logisticsFirst) {
  return logisticsFirst ? PLAN_STEP_KEYS.LOGISTICS : PLAN_STEP_KEYS.SOURCE;
}

/** After method step: single subject → unit structure; multi → logistics (preview is inline on logistics when logistics-first + homeschool). */
export function getSourceNextStep(_logisticsFirst, singleSubject) {
  if (singleSubject) return PLAN_STEP_KEYS.UNIT_STRUCTURE;
  return PLAN_STEP_KEYS.LOGISTICS;
}

/** After unit structure "Continue" / save: always logistics (review is inline when logistics-first homeschool). */
export function getAfterUnitStructureContinue(_logisticsFirst) {
  return PLAN_STEP_KEYS.LOGISTICS;
}

/** Back from review: classic → logistics; logistics-first → unit structure if any saved content, else logistics. */
export function getPreviewBackStep(logisticsFirst, hasUnitStructureContent) {
  if (!logisticsFirst) return PLAN_STEP_KEYS.LOGISTICS;
  return hasUnitStructureContent ? PLAN_STEP_KEYS.UNIT_STRUCTURE : PLAN_STEP_KEYS.LOGISTICS;
}

/** Whether to show extra copy under Cadence when multiple subjects are in play. */
export function showMultiSubjectCadenceHint(logisticsFirst, subjectCount) {
  return logisticsFirst && subjectCount > 1;
}
