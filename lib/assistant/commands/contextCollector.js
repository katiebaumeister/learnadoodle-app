/**
 * Build DoodleContext from the live app shell.
 */

/** @typedef {import('./types.js').DoodleContext} DoodleContext */

const AREA_BY_TAB = {
  home: 'home',
  messages: 'messages',
  planner: 'planner',
  calendar: 'planner',
  subjects: 'learning',
  learning: 'learning',
  materials: 'materials',
  settings: 'settings',
  profile: 'settings',
};

/**
 * @param {object} input
 * @returns {DoodleContext}
 */
export function collectDoodleContext(input = {}) {
  const {
    activeTab = 'home',
    messagesPaneOpen = false,
    familyId = '',
    schoolYearId = null,
    schoolYearLabel = null,
    selectedChildIds = [],
    selectedSubjectId = null,
    selectedUnitId = null,
    selectedLessonId = null,
    plannerView = null,
    visibleDateStart = null,
    visibleDateEnd = null,
    userId = '',
    userRole = 'parent',
    enabledFeatures = [],
    pathname = null,
  } = input;

  const currentArea = messagesPaneOpen
    ? 'messages'
    : (AREA_BY_TAB[activeTab] || 'home');

  const route =
    (typeof pathname === 'string' && pathname) ||
    (typeof window !== 'undefined' ? window.location?.pathname : '/') ||
    '/';

  return {
    currentRoute: route,
    currentArea,
    householdId: String(familyId || ''),
    schoolYearId: schoolYearId || undefined,
    schoolYearLabel: schoolYearLabel || undefined,
    selectedChildIds: Array.isArray(selectedChildIds)
      ? selectedChildIds.map(String).filter(Boolean)
      : undefined,
    selectedSubjectId: selectedSubjectId || undefined,
    selectedUnitId: selectedUnitId || undefined,
    selectedLessonId: selectedLessonId || undefined,
    plannerView: plannerView || undefined,
    visibleDateStart: visibleDateStart || undefined,
    visibleDateEnd: visibleDateEnd || undefined,
    userId: String(userId || ''),
    userRole: userRole === 'child' || userRole === 'tutor' ? userRole : 'parent',
    enabledFeatures: Array.isArray(enabledFeatures) ? enabledFeatures : [],
  };
}

/** Human-readable context chips for the pane footer. */
export function formatDoodleContextSummary(context, extras = {}) {
  const parts = [];
  if (context?.currentArea) {
    parts.push(context.currentArea.charAt(0).toUpperCase() + context.currentArea.slice(1));
  }
  if (extras.childName) parts.push(extras.childName);
  else if (context?.selectedChildIds?.length === 1) parts.push('1 learner');
  else if (context?.selectedChildIds?.length > 1) parts.push(`${context.selectedChildIds.length} learners`);
  else parts.push('All learners');

  if (extras.subjectName) parts.push(extras.subjectName);
  if (context?.schoolYearLabel) parts.push(`${context.schoolYearLabel} School Year`);
  return parts.join(' · ');
}
