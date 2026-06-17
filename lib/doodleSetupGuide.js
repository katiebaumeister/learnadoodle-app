/**
 * @deprecated Legacy onboarding flow. Not used by WebLayout/OnboardingModal.
 * Post-onboarding welcome is a seeded Learnadoodle bulletin post (homeWelcomeBulletin.js).
 */

export const DOODLE_SETUP_STEPS = [
  {
    id: 'plan_year',
    label: 'School year settings',
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
    id: 'family',
    label: 'Invite a child or co-parent',
    navigateTarget: 'navigate_family_members',
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
 * True when the user is asking to see the Doodle setup checklist again (or similar).
 * Used by SearchModal before sending to the LLM.
 */
export function messageRequestsSetupGuideUI(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  if (t.length > 200) return false;

  if (/\bsetup\s*guide\b|\bset[\s-]*up\s*guide\b|\bdoodle\s*setup\b|\bonboarding\s*checklist\b/.test(t)) return true;
  if (/\b(show|see|open|bring\s+back|display|bring\s+up)\b[\s\S]{0,48}\b(setup|checklist|guide|steps|onboarding)\b/.test(t))
    return true;
  if (/\b(again)\b[\s\S]{0,36}\b(setup|checklist|guide|steps|onboarding)\b/.test(t)) return true;
  if (/\b(setup|checklist|guide|steps|onboarding)\b[\s\S]{0,24}\b(again)\b/.test(t)) return true;
  if (/what\s+(were\s+you\s+just\s+showing|was\s+that|did\s+you\s+show)/.test(t)) return true;
  if (/what\s+(do\s+i\s+need|should\s+i\s+do)\b[\s\S]{0,40}\b(set\s*up|setup|onboarding)\b/.test(t)) return true;
  if (/show\s+me\s+what\s+was\s+(just\s+)?(here|on\s+screen|that)/.test(t)) return true;
  if (/\bhelp\s+me\s+(with\s+)?set\s*up\b/.test(t)) return true;
  if (/^(setup\s*help|set\s*up\s*help|setup\s*steps|onboarding)$/.test(t.trim())) return true;
  // Short whole-message intents (avoid matching "set up a meeting" etc.)
  if (/^(set\s*up|setup|set-up)$/.test(t)) return true;

  return false;
}

/**
 * Call from WebLayout when route/view indicates the user visited a checklist area.
 */
export function applySetupProgressFromNavigation(userId, { activeTab, currentView, activeSubtab }) {
  if (!userId) return;
  if (activeTab === 'profile' || (activeTab === 'settings' && activeSubtab === 'members')) {
    markSetupStepComplete(userId, 'family');
  }
  if (activeTab === 'settings' && activeSubtab === 'planner-settings') {
    markSetupStepComplete(userId, 'plan_year');
  }
  if (activeTab === 'planner' || activeTab === 'calendar') {
    if (currentView === 'attendance') {
      markSetupStepComplete(userId, 'attendance');
    }
    const cal = String(currentView || '').toLowerCase();
    if (['month', 'week', 'board', 'tasks'].includes(cal)) {
      markSetupStepComplete(userId, 'planner_calendar');
    }
  }
}
