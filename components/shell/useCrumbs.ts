import { useMemo } from 'react';
import type { Crumb } from '../ui/Breadcrumb';

type CrumbOptions = {
  activeTab: string | null;
  activeTop?: string | null;
  activeSubtab?: string | null;
  activeChildName?: string | null;
  activeChildSection?: string | null;
  activeLabel?: string | null;
};

const LABEL_MAP: Record<string, string> = {
  home: 'Home',
  calendar: 'Planner',
  planner: 'Planner',
  records: 'Records',
  documents: 'Documents',
  'children-list': 'Members',
  attendance: 'Attendance',
  reports: 'Reports',
  backlog: 'Backlog',
  objectives: 'Objectives',
  board: 'Board',
};

const TOP_LABELS: Record<string, string> = {
  home: 'Home',
  planner: 'Planner',
  upcoming: 'Upcoming',
  filters: 'Filters & Labels',
  family: 'Family',
};

const CHILD_SECTION_LABELS: Record<string, string> = {
  overview: 'Overview',
  schedule: 'Schedule',
  assignments: 'Assignments',
  projects: 'Projects',
  syllabus: 'Syllabus',
  portfolio: 'Portfolio',
  notes: 'Notes',
};

const LABEL_TAGS: Record<string, string> = {
  projects: 'Projects',
  assignments: 'Assignments',
  syllabus: 'Syllabus',
};

export function useCrumbs({
  activeTab,
  activeSubtab,
  activeChildName,
  activeTop,
  activeChildSection,
  activeLabel,
}: CrumbOptions) {
  return useMemo<Crumb[]>(() => {
    const crumbs: Crumb[] = [{ label: 'Home', href: '/' }];

    const topKey = activeTop ?? (activeTab === 'home' ? 'home' : undefined);

    if (topKey && topKey !== 'home') {
      const topLabel = TOP_LABELS[topKey] ?? startCase(topKey);
      crumbs.push({ label: topLabel });
    }

    if (activeTab && activeTab !== 'home' && (!activeTop || activeTop === 'home')) {
      const autoLabel = LABEL_MAP[activeTab] ?? startCase(activeTab);
      const alreadyHasPrimary = crumbs.some((crumb) => crumb.label === autoLabel);
      if (!alreadyHasPrimary && activeTab !== 'children-list') {
        crumbs.push({ label: autoLabel });
      }
    }

    const showFamily =
      activeTop === 'family' || activeTab === 'children-list' || !!activeChildName;

    if (showFamily) {
      if (!crumbs.some((crumb) => crumb.label === 'Family')) {
        crumbs.push({ label: 'Family' });
      }
      if (activeChildName) {
        crumbs.push({ label: activeChildName });
      } else if (activeSubtab) {
        crumbs.push({ label: startCase(activeSubtab) });
      }
      if (activeChildSection && activeChildSection !== 'overview') {
        const sectionLabel =
          CHILD_SECTION_LABELS[activeChildSection] ?? startCase(activeChildSection);
        crumbs.push({ label: sectionLabel });
      }
    }

    if (activeTop === 'filters' && activeLabel) {
      const labelName = LABEL_TAGS[activeLabel] ?? startCase(activeLabel);
      crumbs.push({ label: labelName });
    }

    return crumbs;
  }, [activeTab, activeTop, activeSubtab, activeChildName, activeChildSection, activeLabel]);
}

function startCase(value: string) {
  return value
    .replace(/[:]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

