/**
 * Doodle setup checklist: persisted per user (localStorage).
 * Steps complete when the user visits the corresponding area (tracked from WebLayout).
 */

export const DOODLE_SETUP_STEPS = [
  {
    id: 'plan_year',
    label: 'Build year plans',
    navigateTarget: 'navigate_setup_plan_year',
  },
  {
    id: 'attendance',
    label: 'Take attendance',
    navigateTarget: 'navigate_setup_attendance',
  },
  {
    id: 'planner_calendar',
    label: 'View events in planner',
    navigateTarget: 'navigate_setup_planner_calendar',
  },
  {
    id: 'library',
    label: 'Browse your Library',
    navigateTarget: 'navigate_setup_library',
  },
];

const STORAGE_PREFIX = 'ld_doodle_setup_v1';

function storageKey(userId) {
  return `${STORAGE_PREFIX}_${userId}`;
}

export function loadSetupProgress(userId) {
  if (!userId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveSetupProgress(userId, progress) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(progress));
  } catch {
    /* ignore quota */
  }
}

function emitChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('doodleSetupProgressChanged'));
  }
}

/** Mark a step complete (idempotent). */
export function markSetupStepComplete(userId, stepId) {
  if (!userId || !stepId) return loadSetupProgress(userId);
  const p = loadSetupProgress(userId);
  if (p[stepId]) return p;
  p[stepId] = true;
  saveSetupProgress(userId, p);
  emitChanged();
  return p;
}

/** Toggle step for users who need to undo from the guide UI. */
export function toggleSetupStep(userId, stepId) {
  if (!userId || !stepId) return loadSetupProgress(userId);
  const p = loadSetupProgress(userId);
  p[stepId] = !p[stepId];
  saveSetupProgress(userId, p);
  emitChanged();
  return p;
}

export function isSetupGuideComplete(userId) {
  if (!userId) return true;
  const p = loadSetupProgress(userId);
  return DOODLE_SETUP_STEPS.every((s) => p[s.id]);
}

export function getSetupCompletedCount(userId) {
  if (!userId) return 0;
  const p = loadSetupProgress(userId);
  return DOODLE_SETUP_STEPS.filter((s) => p[s.id]).length;
}

/**
 * Call from WebLayout when route/view indicates the user visited a checklist area.
 */
export function applySetupProgressFromNavigation(userId, { activeTab, currentView }) {
  if (!userId) return;
  if (activeTab === 'materials') {
    markSetupStepComplete(userId, 'library');
  }
  if (activeTab === 'planner' || activeTab === 'calendar') {
    if (currentView === 'plan-year' || currentView === 'edit-year') {
      markSetupStepComplete(userId, 'plan_year');
    }
    if (currentView === 'attendance') {
      markSetupStepComplete(userId, 'attendance');
    }
    const cal = String(currentView || '').toLowerCase();
    if (['month', 'week', 'board', 'tasks'].includes(cal)) {
      markSetupStepComplete(userId, 'planner_calendar');
    }
  }
}
