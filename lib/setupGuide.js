/**
 * Mode-aware post-onboarding setup guide (Home Bulletin area — not chatbot).
 * Progress is stored per user/family in localStorage.
 */

export const SETUP_GUIDES = {
  HOMESCHOOL_COMPLIANCE: {
    title: 'Set up your homeschool year',
    subtitle: 'Add subjects, classwork, and schedule your first learning days.',
    primaryCta: {
      label: 'Add your first subject',
      route: '/subjects',
      action: 'add_subject',
    },
    items: [
      {
        key: 'add_subject',
        label: 'Add subjects',
        description: 'Create the subjects you want to teach this year.',
        route: '/subjects',
      },
      {
        key: 'configure_school_year',
        label: 'Review school year settings',
        description: 'Set dates, terms, and compliance targets.',
        route: '/family',
      },
      {
        key: 'schedule_class_days',
        label: 'Schedule class days',
        description: 'Add recurring learning blocks to the planner.',
        route: '/planner',
      },
      {
        key: 'add_unit_or_lesson',
        label: 'Add units or lessons',
        description: 'Build classwork inside a subject.',
        route: '/subjects',
      },
      {
        key: 'open_planner',
        label: 'Open planner',
        description: 'See your week and adjust the schedule.',
        route: '/planner',
      },
    ],
  },

  AFTERSCHOOL_GOALS: {
    title: 'Set up your family rhythm',
    subtitle: 'Add activities, routines, goals, and afterschool plans.',
    primaryCta: {
      label: 'Add an activity',
      route: '/planner',
      action: 'create_activity',
    },
    items: [
      {
        key: 'add_activity',
        label: 'Add an activity',
        description: 'Create sports, clubs, tutoring, music, or enrichment activities.',
        route: '/planner',
      },
      {
        key: 'schedule_activity',
        label: 'Schedule recurring activities',
        description: 'Put regular practices, lessons, or routines on the calendar.',
        route: '/planner',
      },
      {
        key: 'add_goal',
        label: 'Add a goal',
        description: 'Track reading, practice, homework, or enrichment goals.',
        route: '/subjects',
      },
      {
        key: 'invite_family',
        label: 'Invite family members',
        description: 'Coordinate with another parent, student, or tutor.',
        route: '/family',
      },
    ],
  },

  NONE: {
    title: 'Start scheduling',
    subtitle: 'Create your first event and organize the family calendar.',
    primaryCta: {
      label: 'Create event',
      route: '/planner',
      action: 'create_event',
    },
    items: [
      {
        key: 'create_event',
        label: 'Create your first event',
        description: 'Add an appointment, activity, trip, or reminder.',
        route: '/planner',
      },
      {
        key: 'add_recurring_event',
        label: 'Add recurring events',
        description: 'Set up weekly routines or repeating commitments.',
        route: '/planner',
      },
      {
        key: 'connect_calendar',
        label: 'Connect a calendar',
        description: 'Sync with Google, Apple, or Outlook if available.',
        route: '/settings',
      },
      {
        key: 'invite_family',
        label: 'Invite family members',
        description: 'Coordinate the schedule with your household.',
        route: '/family',
      },
    ],
  },
};

const DEFAULT_MODE = 'HOMESCHOOL_COMPLIANCE';
const STORAGE_PREFIX = 'ld_setup_guide_v2';
const DISMISS_PREFIX = 'ld_setup_guide_dismiss_v2';

const PROGRESS_EVENT = 'setupGuideProgressChanged';

function normalizeMode(mode) {
  if (mode && SETUP_GUIDES[mode]) return mode;
  return DEFAULT_MODE;
}

export function getSetupGuideForMode(mode) {
  return SETUP_GUIDES[normalizeMode(mode)];
}

export function getSetupProgressKey(userId, familyId) {
  return `${STORAGE_PREFIX}_${userId || 'anon'}_${familyId || 'none'}`;
}

export function getSetupDismissKey(userId, familyId, mode) {
  return `${DISMISS_PREFIX}_${userId || 'anon'}_${familyId || 'none'}_${normalizeMode(mode)}`;
}

function emitProgressChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROGRESS_EVENT));
  }
}

export function loadSetupProgress(userId, familyId) {
  if (!userId || typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(getSetupProgressKey(userId, familyId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function saveSetupProgress(userId, familyId, completedKeys) {
  if (!userId || typeof window === 'undefined') return;
  const progress = {};
  (completedKeys || []).forEach((key) => {
    if (key) progress[key] = true;
  });
  try {
    window.localStorage.setItem(getSetupProgressKey(userId, familyId), JSON.stringify(progress));
    emitProgressChanged();
  } catch {
    /* ignore quota */
  }
}

export function markSetupItemComplete(userId, familyId, key) {
  if (!userId || !key) return loadSetupProgress(userId, familyId);
  const progress = loadSetupProgress(userId, familyId);
  if (progress[key]) return progress;
  progress[key] = true;
  saveSetupProgress(userId, familyId, Object.keys(progress).filter((k) => progress[k]));
  return progress;
}

export function isSetupGuideDismissed(userId, familyId, mode) {
  if (!userId || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(getSetupDismissKey(userId, familyId, mode)) === '1';
  } catch {
    return false;
  }
}

export function dismissSetupGuide(userId, familyId, mode) {
  if (!userId || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getSetupDismissKey(userId, familyId, mode), '1');
    emitProgressChanged();
  } catch {
    /* ignore */
  }
}

export const SETUP_GUIDE_PROGRESS_EVENT = PROGRESS_EVENT;

/**
 * Infer completed checklist keys from app data where available.
 * @param {object} appData
 * @param {string} appData.mode
 * @param {number} appData.subjectCount
 * @param {number} appData.eventCount
 * @param {boolean} appData.hasRecurringEvents
 * @param {boolean} appData.hasAcademicYearConfigured
 * @param {boolean} appData.hasUnitsOrLessons
 * @param {number} appData.assignmentCount
 * @param {number} appData.familyMemberCount
 * @param {boolean} appData.hasCalendarIntegration
 */
export function detectCompletedKeysFromData(mode, appData = {}) {
  const keys = new Set();
  const m = normalizeMode(mode);
  const subjects = Number(appData.subjectCount || 0);
  const events = Number(appData.eventCount || 0);
  const members = Number(appData.familyMemberCount || 0);
  const assignments = Number(appData.assignmentCount || 0);

  if (m === 'HOMESCHOOL_COMPLIANCE') {
    if (subjects > 0) keys.add('add_subject');
    if (appData.hasAcademicYearConfigured) keys.add('configure_school_year');
    if (events > 0 || appData.hasRecurringEvents) keys.add('schedule_class_days');
    if (appData.hasUnitsOrLessons || assignments > 0) keys.add('add_unit_or_lesson');
    if (appData.visitedPlanner) keys.add('open_planner');
  } else if (m === 'AFTERSCHOOL_GOALS') {
    if (events > 0) keys.add('add_activity');
    if (appData.hasRecurringEvents) keys.add('schedule_activity');
    if (assignments > 0 || subjects > 0) keys.add('add_goal');
    if (members > 1) keys.add('invite_family');
  } else {
    if (events > 0) keys.add('create_event');
    if (appData.hasRecurringEvents) keys.add('add_recurring_event');
    if (appData.hasCalendarIntegration) keys.add('connect_calendar');
    if (members > 1) keys.add('invite_family');
  }

  return keys;
}

export function getEffectiveCompletedKeys(userId, familyId, mode, appData = {}) {
  const stored = loadSetupProgress(userId, familyId);
  const fromData = detectCompletedKeysFromData(mode, appData);
  const keys = new Set([
    ...Object.keys(stored).filter((k) => stored[k]),
    ...fromData,
  ]);
  return keys;
}

export function isSetupGuideFullyComplete(mode, completedKeys) {
  const guide = getSetupGuideForMode(mode);
  const set = completedKeys instanceof Set ? completedKeys : new Set(completedKeys || []);
  return guide.items.every((item) => set.has(item.key));
}

/** Map checklist item keys to navigation side-effects when user clicks a row. */
const KEY_TO_TAB = {
  add_subject: { tab: 'subjects' },
  configure_school_year: { tab: 'settings', subtab: 'planner-settings' },
  schedule_class_days: { tab: 'planner' },
  add_unit_or_lesson: { tab: 'subjects' },
  open_planner: { tab: 'planner' },
  add_activity: { tab: 'planner' },
  schedule_activity: { tab: 'planner' },
  add_goal: { tab: 'subjects' },
  invite_family: { tab: 'settings', subtab: 'members' },
  create_event: { tab: 'planner' },
  add_recurring_event: { tab: 'planner' },
  connect_calendar: { tab: 'settings' },
};

export function resolveSetupItemNavigation(key) {
  return KEY_TO_TAB[key] || null;
}

/** Primary CTA action ids → window events (WebLayout listens where needed). */
export function dispatchSetupGuideAction(action) {
  if (typeof window === 'undefined' || !action) return;
  if (action === 'add_subject') {
    window.dispatchEvent(new CustomEvent('openAddSubjectModal'));
    return;
  }
  if (action === 'create_activity' || action === 'create_event') {
    window.dispatchEvent(new CustomEvent('openTaskModal', { detail: { date: new Date() } }));
  }
}

/**
 * Auto-complete checklist keys when the user visits related areas.
 * Call from WebLayout on tab/view changes.
 */
export function applySetupProgressFromNavigation(userId, familyId, mode, { activeTab, activeSubtab, currentView } = {}) {
  if (!userId || !familyId) return;
  const m = normalizeMode(mode);

  if (activeTab === 'subjects' || (activeTab && activeTab.startsWith('subject-'))) {
    if (m === 'HOMESCHOOL_COMPLIANCE') {
      markSetupItemComplete(userId, familyId, 'add_subject');
      markSetupItemComplete(userId, familyId, 'add_unit_or_lesson');
    }
    if (m === 'AFTERSCHOOL_GOALS') {
      markSetupItemComplete(userId, familyId, 'add_goal');
    }
  }

  if (activeTab === 'settings' && activeSubtab === 'planner-settings') {
    if (m === 'HOMESCHOOL_COMPLIANCE') {
      markSetupItemComplete(userId, familyId, 'configure_school_year');
    }
  }

  if (activeTab === 'settings' && activeSubtab === 'members') {
    markSetupItemComplete(userId, familyId, 'invite_family');
  }

  if (activeTab === 'settings' && (activeSubtab === 'integrations' || activeSubtab === 'calendar')) {
    markSetupItemComplete(userId, familyId, 'connect_calendar');
  }

  if (activeTab === 'planner' || activeTab === 'calendar') {
    if (m === 'HOMESCHOOL_COMPLIANCE') {
      markSetupItemComplete(userId, familyId, 'schedule_class_days');
      markSetupItemComplete(userId, familyId, 'open_planner');
    }
    if (m === 'AFTERSCHOOL_GOALS') {
      markSetupItemComplete(userId, familyId, 'add_activity');
      markSetupItemComplete(userId, familyId, 'schedule_activity');
    }
    if (m === 'NONE') {
      markSetupItemComplete(userId, familyId, 'create_event');
      markSetupItemComplete(userId, familyId, 'add_recurring_event');
    }
  }

  if (activeTab === 'profile' || activeTab === 'family') {
    markSetupItemComplete(userId, familyId, 'invite_family');
    if (m === 'HOMESCHOOL_COMPLIANCE') {
      markSetupItemComplete(userId, familyId, 'configure_school_year');
    }
  }
}

/**
 * Lightweight bulletin nudge when setup card is hidden/dismissed.
 * Returns null when setup guide card is visible or no nudge applies.
 */
export function getSetupGuideBulletinNudge(mode, appData = {}, { setupGuideVisible = false } = {}) {
  if (setupGuideVisible) return null;
  const m = normalizeMode(mode);
  const events = Number(appData.eventCount || 0);
  const subjects = Number(appData.subjectCount || 0);

  if (m === 'HOMESCHOOL_COMPLIANCE' && subjects === 0) {
    return {
      id: 'setup-nudge-add-subject',
      title: 'Add your first subject',
      body: 'Subjects help organize lessons, assignments, grades, and compliance.',
      ctaLabel: 'Add subject',
      action: 'add_subject',
      tab: 'subjects',
    };
  }

  if (m === 'AFTERSCHOOL_GOALS' && events === 0) {
    return {
      id: 'setup-nudge-add-activity',
      title: 'Add your first activity',
      body: 'Start with a practice, tutoring session, club, or recurring routine.',
      ctaLabel: 'Add activity',
      action: 'create_activity',
      tab: 'planner',
    };
  }

  if (m === 'NONE' && events === 0) {
    return {
      id: 'setup-nudge-create-event',
      title: 'Create your first event',
      body: 'Add an appointment, trip, activity, or reminder to your planner.',
      ctaLabel: 'Create event',
      action: 'create_event',
      tab: 'planner',
    };
  }

  return null;
}

/** Post-onboarding landing tab by planning mode. */
export function getPostOnboardingRoute(planningMode) {
  const mode = normalizeMode(planningMode);
  if (mode === 'HOMESCHOOL_COMPLIANCE') return { tab: 'subjects' };
  if (mode === 'AFTERSCHOOL_GOALS') return { tab: 'home' };
  return { tab: 'planner' };
}
