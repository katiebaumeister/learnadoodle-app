export const RECORDS_MAIN_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'progress-reports', label: 'Progress Reports' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'transcripts', label: 'Transcripts' },
  { key: 'portfolios', label: 'Portfolios' },
  { key: 'achievements', label: 'Achievements' },
  { key: 'documents', label: 'Documents' },
];

/** Hidden until these sections are ready. Flip keys out of this set to re-enable. */
export const RECORDS_HIDDEN_SECTIONS = new Set([
  'overview',
  'progress-reports',
  'portfolios',
  'achievements',
]);

export const RECORDS_DEFAULT_SECTION = 'attendance';

export const RECORDS_VISIBLE_TABS = RECORDS_MAIN_TABS.filter(
  (tab) => !RECORDS_HIDDEN_SECTIONS.has(tab.key)
);

const LEGACY_SECTION_MAP = {
  'learning-log': 'documents',
  exports: 'documents',
};

export function normalizeRecordsSectionKey(subtab) {
  const raw = String(subtab || RECORDS_DEFAULT_SECTION).trim().toLowerCase();
  const mapped = LEGACY_SECTION_MAP[raw] || raw;
  if (RECORDS_HIDDEN_SECTIONS.has(mapped)) return RECORDS_DEFAULT_SECTION;
  const valid = RECORDS_VISIBLE_TABS.map((tab) => tab.key);
  if (valid.includes(mapped)) return mapped;
  return RECORDS_DEFAULT_SECTION;
}

export function parseRecordsSection(subtab) {
  return { view: normalizeRecordsSectionKey(subtab) };
}

export function formatShortDate(dateLike) {
  if (!dateLike) return '';
  const date = new Date(typeof dateLike === 'string' && !dateLike.includes('T')
    ? `${dateLike.slice(0, 10)}T12:00:00`
    : dateLike);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatActivityTime(dateLike) {
  if (!dateLike) return '';
  const date = new Date(typeof dateLike === 'string' && !dateLike.includes('T')
    ? `${dateLike.slice(0, 10)}T12:00:00`
    : dateLike);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatActivityDayLabel(dateLike) {
  if (!dateLike) return '';
  const date = new Date(typeof dateLike === 'string' && !dateLike.includes('T')
    ? `${dateLike.slice(0, 10)}T12:00:00`
    : dateLike);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  const dayLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (sameDay(date, today)) return `Today — ${dayLabel}`;
  if (sameDay(date, yesterday)) return `Yesterday — ${dayLabel}`;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatYearRange(startDate, endDate) {
  const start = formatShortDate(startDate);
  const end = formatShortDate(endDate);
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}
