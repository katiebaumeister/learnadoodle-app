/** Optional CSV columns for planner export — aligned with CalendarEventCreateModal fields. */

export const PLANNER_EXPORT_OPTIONAL_COLUMN_DEFS = [
  { key: 'endDate', label: 'End date' },
  { key: 'location', label: 'Location' },
  { key: 'repeat', label: 'Repeat' },
  { key: 'attachmentTitle', label: 'Attachment' },
  { key: 'notes', label: 'Notes' },
];

export function defaultPlannerExportColumnSelection() {
  return PLANNER_EXPORT_OPTIONAL_COLUMN_DEFS.reduce((acc, { key }) => {
    acc[key] = false;
    return acc;
  }, {});
}

function parseRecurrenceRule(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function formatRepeatLabel(ev) {
  const rule = parseRecurrenceRule(ev.recurrence_rule || ev._recurrence_rule);
  if (!rule) return '';
  const freq = String(rule.freq || rule.recurrenceType || '').toLowerCase();
  if (freq === 'daily') return 'Daily';
  if (freq === 'weekly') return 'Weekly';
  if (freq === 'monthly') return 'Monthly';
  return 'Repeating';
}

function formatEndDate(ev) {
  if (ev.end_date) return String(ev.end_date).slice(0, 10);
  if (ev.end_ts) {
    const d = new Date(ev.end_ts);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }
  return '';
}

export function buildPlannerExportOptionalColumns(selectedColumns = {}) {
  const cols = selectedColumns || {};
  const defs = [
    { key: 'endDate', label: 'End date', get: formatEndDate },
    { key: 'location', label: 'Location', get: (ev) => ev.location || '' },
    { key: 'repeat', label: 'Repeat', get: formatRepeatLabel },
    {
      key: 'attachmentTitle',
      label: 'Attachment',
      get: (ev) => ev.material_title || ev.attachment_title
        || (ev.materials_attachment_title
          || (Array.isArray(ev.materials_attachment_ids) && ev.materials_attachment_ids.length ? '(attachment)' : ''))
        || '',
    },
    { key: 'notes', label: 'Notes', get: (ev) => ev.description || ev.notes || '' },
  ];
  return defs.filter((c) => cols[c.key]);
}
