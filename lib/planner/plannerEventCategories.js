/** Planner calendar filter categories.
 * Neutral-light chip fills with true-color text accents.
 * US public holidays stay blank chips; family day offs use the amber Day off tint.
 */

export const PLANNER_EVENT_CATEGORIES = [
  {
    key: 'Event',
    label: 'Event',
    color: '#F3F4F6',
    chipText: '#1F2937',
    accent: '#1F2937',
    hoverColor: '#E5E7EB',
  },
  {
    key: 'Assignment',
    label: 'Assignment',
    color: '#F5F3FF',
    chipText: '#4C1D95',
    accent: '#4C1D95',
    hoverColor: '#EDE9FE',
  },
  {
    key: 'Learning day',
    label: 'Learning day',
    color: '#EFF6FF',
    chipText: '#1E3A8A',
    accent: '#1E3A8A',
    hoverColor: '#DBEAFE',
  },
  {
    key: 'Day off',
    label: 'Day off',
    color: '#FFFBEB',
    chipText: '#D97706',
    accent: '#D97706',
    hoverColor: '#FEF3C7',
  },
];

/** Shared chip corner radius — soft rectangle, not pill. */
export const PLANNER_CHIP_RADIUS = 6;

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
  'day off': 'Day off',
  dayoff: 'Day off',
  break: 'Day off',
  holiday: 'Day off',
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

/** Family-created day offs / breaks (not US public holidays). */
export function isPlannerFamilyDayOffEvent(event) {
  if (!event) return false;
  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  if (holidayType === 'GLOBAL_HOLIDAY') return false;
  if (holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'CUSTOM_BREAK') return true;
  const typeLower = normalizeTypeLower(event);
  return (
    typeLower === 'day off'
    || typeLower === 'dayoff'
    || typeLower === 'break'
    || (typeLower === 'holiday' && !holidayType)
  );
}

/** US / global public holidays — render as plain text, not a tinted chip. */
export function isPlannerPublicHolidayEvent(event) {
  if (!event) return false;
  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  return holidayType === 'GLOBAL_HOLIDAY';
}

/** Returns one of the planner filter category labels. */
export function getPlannerEventCategory(event) {
  if (!event) return 'Event';

  if (isPlannerDayOffCategoryEvent(event)) {
    return 'Day off';
  }

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
  return {
    chipBg: meta.color,
    chipText: meta.chipText,
    hoverBg: meta.hoverColor,
    accent: meta.accent || meta.chipText,
  };
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
    case 'day off':
      return 'day_off';
    default:
      return 'event';
  }
}

export function getPlannerCalendarLegendItems() {
  return PLANNER_EVENT_CATEGORIES.map(({ label, color }) => ({ label, color }));
}
