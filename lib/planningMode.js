/**
 * Family planning modes — stored on family.default_planning_mode.
 * Feature settings — stored on family.feature_settings (JSONB, nullable).
 *
 * The Family Approach acts as a preset that suggests defaults.
 * Feature toggles (feature_settings) are the actual source of truth for visibility.
 * If feature_settings is NULL, derive from approach defaults (backward-compatible).
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

// ---------------------------------------------------------------------------
// Feature settings & workspace capabilities
// ---------------------------------------------------------------------------

/** Suggested feature defaults for each Family Approach. */
export const APPROACH_DEFAULT_FEATURES = {
  [PLANNING_MODES.HOMESCHOOL_COMPLIANCE]: {
    learningAreas: true,
    assignments: true,
    materials: true,
    attendance: true,
    grades: true,
    complianceRecords: true,
  },
  [PLANNING_MODES.AFTERSCHOOL_GOALS]: {
    learningAreas: true,
    assignments: true,
    materials: true,
    attendance: false,
    grades: false,
    complianceRecords: false,
  },
  [PLANNING_MODES.NONE]: {
    learningAreas: false,
    assignments: false,
    materials: false,
    attendance: false,
    grades: false,
    complianceRecords: false,
  },
};

/** Feature toggle metadata for the settings UI. */
export const FEATURE_TOGGLE_DEFS = [
  { key: 'learningAreas', label: 'Learning areas', description: 'Organize work by subject, activity, or learning area.' },
  { key: 'assignments', label: 'Assignments', description: 'Track assigned work and due dates.' },
  { key: 'materials', label: 'Materials', description: 'Save resources, files, links, and curriculum materials.' },
  { key: 'attendance', label: 'Attendance', description: 'Track instructional days and completed learning time.' },
  { key: 'grades', label: 'Grades', description: 'Record scores, feedback, and progress.' },
  { key: 'complianceRecords', label: 'Compliance & records', description: 'Support homeschool reporting, exports, and recordkeeping.' },
];

/**
 * Resolve effective feature toggles.
 * If featureSettings is explicitly set, use it. Otherwise fall back to approach defaults.
 */
export function resolveFeatureSettings(familyApproach, featureSettings) {
  const defaults = APPROACH_DEFAULT_FEATURES[familyApproach] || APPROACH_DEFAULT_FEATURES[PLANNING_MODES.AFTERSCHOOL_GOALS];
  if (!featureSettings || typeof featureSettings !== 'object') {
    return { ...defaults };
  }
  return {
    learningAreas: featureSettings.learningAreas ?? defaults.learningAreas,
    assignments: featureSettings.assignments ?? defaults.assignments,
    materials: featureSettings.materials ?? defaults.materials,
    attendance: featureSettings.attendance ?? defaults.attendance,
    grades: featureSettings.grades ?? defaults.grades,
    complianceRecords: featureSettings.complianceRecords ?? defaults.complianceRecords,
  };
}

/**
 * Centralized workspace capability resolver.
 * This is the single source of truth for what the app shows.
 * Consumes family approach + explicit feature settings (if any).
 */
export function getWorkspaceCapabilities({ familyApproach, featureSettings }) {
  const features = resolveFeatureSettings(familyApproach, featureSettings);
  return {
    showLearning: features.learningAreas,
    showAssignments: features.assignments,
    showMaterials: features.materials,
    showAttendance: features.attendance,
    showGrades: features.grades,
    showCompliance: features.complianceRecords,
    subjectOnEventRequired: features.learningAreas && familyApproach === PLANNING_MODES.HOMESCHOOL_COMPLIANCE,
  };
}

/**
 * Legacy compatibility wrapper — used by SubjectClassroomTabs and other components
 * that previously consumed getFamilyApproachCapabilities(mode).
 * Now delegates to getWorkspaceCapabilities with null featureSettings (approach-only).
 */
export function getFamilyApproachCapabilities(mode, featureSettings) {
  const caps = getWorkspaceCapabilities({ familyApproach: mode, featureSettings: featureSettings || null });
  return {
    showGrades: caps.showGrades,
    showAttendance: caps.showAttendance,
    subjectsRequired: caps.showLearning && mode === PLANNING_MODES.HOMESCHOOL_COMPLIANCE,
    subjectOnEventRequired: caps.subjectOnEventRequired,
  };
}
