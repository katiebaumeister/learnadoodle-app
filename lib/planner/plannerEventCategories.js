/** Planner calendar uses three filter categories; day-offs and holidays count as Event. */

export const PLANNER_EVENT_CATEGORIES = [
  { key: 'Event', label: 'Event', color: '#EDE6FF', chipText: '#7A5CD6', hoverColor: '#DDD0FF' },
  { key: 'Assignment', label: 'Assignment', color: '#DFF7E3', chipText: '#4FAF75', hoverColor: '#C5F0D1' },
  { key: 'Learning day', label: 'Learning day', color: '#E3F0FF', chipText: '#4C7ED9', hoverColor: '#C7E1FF' },
];

const LEARNING_DAY_TYPES = new Set([
  'lesson',
  'schedule block',
  'scheduled class day',
  'classday',
  'class day',
]);

const ASSIGNMENT_TYPES = new Set([
  'assignment',
  'project',
  'exam',
  'assessment',
]);

const LEGACY_FILTER_KEY_MAP = {
  lesson: 'Learning day',
  'learning day': 'Learning day',
  'day off': 'Event',
  break: 'Event',
  event: 'Event',
  assignment: 'Assignment',
};

function normalizeTypeLower(event) {
  return String(event?.event_type || event?.type || '').trim().toLowerCase();
}

function isPlanGeneratedLearningDay(event, typeLower) {
  const generatedByPlan = String(event?.generated_by || event?.data?.generated_by || '').toLowerCase() === 'plan_year';
  const hasAcademicYear = !!(event?.academic_year_id || event?.data?.academic_year_id);
  if (!generatedByPlan && !hasAcademicYear) return false;
  if (!typeLower) return true;
  return LEARNING_DAY_TYPES.has(typeLower);
}

export function isPlannerDayOffCategoryEvent(event) {
  if (!event) return false;
  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  if (holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'CUSTOM_BREAK' || holidayType === 'GLOBAL_HOLIDAY') {
    return true;
  }
  const typeLower = normalizeTypeLower(event);
  return (
    typeLower === 'holiday'
    || typeLower === 'day off'
    || typeLower === 'dayoff'
    || typeLower === 'break'
  );
}

/** Returns one of the three planner filter category labels. */
export function getPlannerEventCategory(event) {
  if (!event) return 'Event';

  const typeLower = normalizeTypeLower(event);

  if (LEARNING_DAY_TYPES.has(typeLower) || isPlanGeneratedLearningDay(event, typeLower)) {
    return 'Learning day';
  }

  if (ASSIGNMENT_TYPES.has(typeLower)) {
    return 'Assignment';
  }

  return 'Event';
}

export function getPlannerCategoryMeta(category) {
  const normalized = String(category || '').trim();
  const found = PLANNER_EVENT_CATEGORIES.find(
    (row) => row.key.toLowerCase() === normalized.toLowerCase(),
  );
  return found || PLANNER_EVENT_CATEGORIES[0];
}

export function getPlannerEventTypeColors(event) {
  const meta = getPlannerCategoryMeta(getPlannerEventCategory(event));
  return { chipBg: meta.color, chipText: meta.chipText, hoverBg: meta.hoverColor };
}

export function normalizePlannerFilterKeys(selectedKeys = []) {
  return (selectedKeys || [])
    .map((key) => {
      const raw = String(key || '').trim();
      if (!raw) return null;
      const mapped = LEGACY_FILTER_KEY_MAP[raw.toLowerCase()];
      if (mapped) return mapped;
      const match = PLANNER_EVENT_CATEGORIES.find(
        (row) => row.key.toLowerCase() === raw.toLowerCase(),
      );
      return match?.key || raw;
    })
    .filter(Boolean);
}

export function eventMatchesPlannerCategoryFilter(event, selectedKeys) {
  if (!Array.isArray(selectedKeys) || selectedKeys.length === 0) return true;
  const normalized = normalizePlannerFilterKeys(selectedKeys);
  const category = getPlannerEventCategory(event);
  return normalized.some((key) => key.toLowerCase() === category.toLowerCase());
}

/** Internal chip color keys used by EventChip. */
export function getPlannerCategoryColorKey(category) {
  switch (String(category || '').toLowerCase()) {
    case 'learning day':
      return 'learning_day';
    case 'assignment':
      return 'assignment';
    default:
      return 'event';
  }
}

export function getPlannerCalendarLegendItems() {
  return PLANNER_EVENT_CATEGORIES.map(({ label, color }) => ({ label, color }));
}
