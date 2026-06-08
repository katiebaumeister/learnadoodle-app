export function parseFamilySection(subtab) {
  const raw = String(subtab || 'overview').trim();
  const lower = raw.toLowerCase();

  if (lower.startsWith('child/')) {
    const parts = raw.split('/');
    const childId = parts[1] || '';
    const childTab = (parts[2] || 'overview').toLowerCase();
    const validTabs = ['overview', 'preferences', 'goals'];
    return {
      view: 'child',
      childId,
      childTab: validTabs.includes(childTab) ? childTab : 'overview',
    };
  }

  if (!lower || lower === 'overview') return { view: 'overview' };
  if (lower === 'members') return { view: 'members' };
  if (lower === 'learning-preferences') return { view: 'learning-preferences' };
  if (lower === 'academic-years') return { view: 'academic-years' };
  if (lower.startsWith('academic-year-')) {
    return { view: 'academic-year', yearId: raw.slice('academic-year-'.length) };
  }
  return { view: 'overview' };
}

export function buildAcademicYearSectionKey(yearId) {
  return `academic-year-${String(yearId || '').trim()}`;
}

export function buildChildSectionKey(childId, tab = 'overview') {
  const id = String(childId || '').trim();
  if (!id) return 'overview';
  if (!tab || tab === 'overview') return `child/${id}`;
  return `child/${id}/${tab}`;
}

export function getChildDisplayName(child) {
  if (!child) return 'Child';
  return child.first_name || child.name || 'Child';
}

export function formatSchoolYearLabel(yearRow) {
  if (!yearRow) return 'School year';
  if (yearRow.year_name) return String(yearRow.year_name);
  const start = yearRow.start_date ? String(yearRow.start_date).slice(0, 4) : '';
  const end = yearRow.end_date ? String(yearRow.end_date).slice(0, 4) : '';
  if (start && end) return `${start}–${end}`;
  if (start) return start;
  return 'School year';
}

export const FAMILY_MAIN_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'members', label: 'Members' },
  { key: 'academic-years', label: 'Academic Years' },
  { key: 'learning-preferences', label: 'Learning Preferences' },
];

export const FAMILY_CHILD_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'preferences', label: 'Learning Preferences' },
  { key: 'goals', label: 'Goals' },
];

export function familySectionKeyForTab(view, childId = null) {
  if (view === 'child' && childId) return buildChildSectionKey(childId, 'overview');
  if (view === 'academic-year') return 'academic-years';
  return view || 'overview';
}
