/**
 * Family planning modes — stored on family.default_planning_mode.
 * NONE ("Just scheduling") uses the afterschool app experience in the UI.
 */

export const PLANNING_MODES = {
  HOMESCHOOL_COMPLIANCE: 'HOMESCHOOL_COMPLIANCE',
  AFTERSCHOOL_GOALS: 'AFTERSCHOOL_GOALS',
  NONE: 'NONE',
};

export const FAMILY_APPROACH_OPTIONS = [
  { id: PLANNING_MODES.HOMESCHOOL_COMPLIANCE, label: 'Homeschooling' },
  { id: PLANNING_MODES.AFTERSCHOOL_GOALS, label: 'Afterschooling' },
  { id: PLANNING_MODES.NONE, label: 'Just scheduling' },
];

export function getPlanningModeLabel(mode) {
  return FAMILY_APPROACH_OPTIONS.find((option) => option.id === mode)?.label || 'Not set';
}

/** Mode used for app shell / planner / subjects UX. NONE matches afterschool. */
export function getEffectivePlanningMode(mode) {
  if (mode === PLANNING_MODES.HOMESCHOOL_COMPLIANCE) {
    return PLANNING_MODES.HOMESCHOOL_COMPLIANCE;
  }
  if (mode === PLANNING_MODES.AFTERSCHOOL_GOALS || mode === PLANNING_MODES.NONE) {
    return PLANNING_MODES.AFTERSCHOOL_GOALS;
  }
  return PLANNING_MODES.AFTERSCHOOL_GOALS;
}

/** @returns {'homeschool' | 'afterschool'} */
export function normalizePlanningModeForUi(mode) {
  return getEffectivePlanningMode(mode) === PLANNING_MODES.HOMESCHOOL_COMPLIANCE
    ? 'homeschool'
    : 'afterschool';
}

export function isHomeschoolPlanningMode(mode) {
  return normalizePlanningModeForUi(mode) === 'homeschool';
}
