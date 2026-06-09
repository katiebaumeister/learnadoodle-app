export const PLANNER_SECTIONS = [
  { key: 'calendar', label: 'Calendar' },
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
  { key: 'transcripts', label: 'Transcripts' },
  { key: 'documents', label: 'Documents' },
];

/** In-content Family nav uses FamilySectionView; kept for resolveSection routing. */
export const FAMILY_SECTIONS = [
  { key: 'members', label: 'Family' },
  { key: 'academic-years', label: 'Academic years' },
  { key: 'learning-preferences', label: 'Learning preferences' },
];

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
  if (activeSubtab) {
    if (keys.includes(activeSubtab)) return activeSubtab;
    if (tab === 'family') {
      const lower = String(activeSubtab).toLowerCase();
      if (lower === 'overview') return 'members';
      if (lower.startsWith('child/') || lower.startsWith('academic-year-')) {
        return activeSubtab;
      }
    }
    if (tab === 'records') {
      const legacyMap = {
        'learning-log': 'documents',
        exports: 'documents',
      };
      const mapped = legacyMap[activeSubtab] || activeSubtab;
      if (keys.includes(mapped)) return mapped;
    }
    if (tab === 'planner') {
      if (activeSubtab === 'planning-preferences') return 'planning-preferences';
      if (activeSubtab === 'plan-health') return 'calendar';
      const mapped = activeSubtab;
      if (keys.includes(mapped)) return mapped;
    }
  }
  return getDefaultSection(tab);
}

/** Map WebLayout activeTab to section-nav tab key, if any. */
export function getSectionNavTab(activeTab) {
  if (activeTab === 'learning') return 'learning';
  if (activeTab === 'subjects') return 'subjects';
  if (activeTab === 'planner' || activeTab === 'calendar') return 'planner';
  if (activeTab === 'records') return 'records';
  if (activeTab === 'family') return 'family';
  return null;
}
