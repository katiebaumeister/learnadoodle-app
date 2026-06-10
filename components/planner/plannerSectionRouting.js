import { addDays, startOfWeek } from './utils/date';

export const PLANNER_MAIN_TABS = [
  { key: 'calendar', label: 'Calendar' },
];

const LEGACY_SECTION_MAP = {};

export function parsePlannerSection(subtab) {
  const raw = String(subtab || 'calendar').trim().toLowerCase();
  if (raw === 'planning-preferences') return { view: 'planning-preferences' };
  if (raw === 'plan-health') return { view: 'calendar' };
  const mapped = LEGACY_SECTION_MAP[raw] || raw;
  const valid = PLANNER_MAIN_TABS.map((t) => t.key);
  if (valid.includes(mapped)) return { view: mapped };
  return { view: 'calendar' };
}

export function formatWeekRangeLabel(anchorDate) {
  const date = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
    ? anchorDate
    : new Date();
  const day = date.getDay();
  const start = new Date(date);
  start.setDate(date.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  if (startYear === endYear) {
    return `${fmt(start)} – ${fmt(end)}, ${startYear}`;
  }
  return `${fmt(start)}, ${startYear} – ${fmt(end)}, ${endYear}`;
}

export function formatPlannerWeekHeaderLabel(anchorDate) {
  const date = anchorDate instanceof Date && !Number.isNaN(anchorDate.getTime())
    ? anchorDate
    : new Date();
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return `${fmt(start)} - ${fmt(end)}`;
}
