export const PLANNER_SECTIONS = [
  { key: 'calendar', label: 'Calendar' },
  { key: 'plan-health', label: 'Plan health' },
  { key: 'planning-preferences', label: 'Planning preferences' },
];

export const LEARNING_SECTIONS = [
  { key: 'subjects', label: 'Subjects' },
  { key: 'assignments', label: 'Assignments' },
  { key: 'submissions', label: 'Submissions' },
  { key: 'materials', label: 'Materials' },
  { key: 'grades', label: 'Grades' },
];

export const RECORDS_SECTIONS = [
  { key: 'attendance', label: 'Attendance' },
  { key: 'learning-log', label: 'Learning log' },
  { key: 'portfolio', label: 'Portfolio' },
  { key: 'reports', label: 'Reports' },
  { key: 'transcript', label: 'Transcript', future: true },
  { key: 'exports', label: 'Exports' },
];

export const FAMILY_SECTIONS = [
  { key: 'members', label: 'Members' },
  { key: 'academic-years', label: 'Academic years' },
  { key: 'learning-schedule', label: 'Learning schedule' },
  { key: 'planning-preferences', label: 'Planning preferences' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'subscription', label: 'Subscription' },
];

export const FAMILY_SECTION_TO_PANEL = {
  members: 'members',
  'academic-years': 'planner-settings',
  'learning-schedule': 'planner-settings',
  'planning-preferences': 'planner-settings',
  integrations: 'connections',
  subscription: 'subscription',
};

export const SECTION_NAV_BY_TAB = {
  planner: PLANNER_SECTIONS,
  subjects: LEARNING_SECTIONS,
  learning: LEARNING_SECTIONS,
  records: RECORDS_SECTIONS,
  family: FAMILY_SECTIONS,
};

export const SECTION_TITLE_BY_TAB = {
  planner: 'Planner',
  subjects: 'Learning',
  learning: 'Learning',
  records: 'Records',
  family: 'Family',
};

export function getDefaultSection(tab) {
  switch (tab) {
    case 'planner':
      return 'calendar';
    case 'subjects':
    case 'learning':
      return 'subjects';
    case 'records':
      return 'attendance';
    case 'family':
      return 'members';
    default:
      return null;
  }
}

export function getSectionsForTab(tab) {
  return SECTION_NAV_BY_TAB[tab] || null;
}

export function resolveSection(tab, activeSubtab) {
  const sections = getSectionsForTab(tab);
  if (!sections) return null;
  const keys = sections.map((s) => s.key);
  if (activeSubtab && keys.includes(activeSubtab)) return activeSubtab;
  return getDefaultSection(tab);
}
