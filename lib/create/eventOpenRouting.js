import { normalizeWorkEventType } from '../workEventHelpers';

function normalizeHolidayType(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'BREAK') return 'CUSTOM_BREAK';
  if (raw === 'DAY_OFF' || raw === 'DAYOFF' || raw === 'HOLIDAY' || raw === 'NO_SCHOOL') {
    return 'CUSTOM_HOLIDAY';
  }
  return raw;
}

export function isSyntheticPlannerExclusionEvent(event) {
  if (!event || typeof event !== 'object') return false;
  const source = String(event.source || event?.data?.source || '').toLowerCase();
  if (source === 'planner_exclusion') return true;
  const rawId = String(event.id || event._originalId || event.originalId || '').trim();
  if (!rawId) return false;
  return rawId.startsWith('holiday-') && !/^[0-9a-f-]{36}$/i.test(rawId);
}

/** Day off, break, or holiday rows → Edit day off (family) or School Year Settings (public holidays). */
export function isDayOffOrHolidayEvent(event) {
  if (!event || typeof event !== 'object') return false;

  const rawId = String(event.id || event._originalId || event.originalId || '').trim();
  if (rawId.startsWith('holiday-')) return true;

  if (isSyntheticPlannerExclusionEvent(event)) return true;

  const source = String(event.source || event?.data?.source || '').toLowerCase();
  if (source === 'planner_exclusion') return true;

  const type = String(event.event_type || event.type || '').trim();
  const lower = type.toLowerCase();
  if (lower === 'day off' || lower === 'break' || lower === 'holiday') return true;

  const holidayType = normalizeHolidayType(event.holiday_type || event.holidayType);
  if (
    holidayType === 'CUSTOM_HOLIDAY' ||
    holidayType === 'CUSTOM_BREAK' ||
    holidayType === 'GLOBAL_HOLIDAY'
  ) {
    return true;
  }

  return false;
}

export function isWorkAssignmentEditEvent(eventType) {
  const type = normalizeWorkEventType(eventType);
  return type === 'Assignment' || type === 'Project' || type === 'Exam';
}

export function shouldUseLegacyEventModal({
  editScope = 'single',
  openConflictResolution = false,
  childEventFocus = null,
  parentEventFocus = null,
  sendOnlyMode = false,
} = {}) {
  if (sendOnlyMode) return true;
  if (parentEventFocus === 'help' || parentEventFocus === 'send') return true;
  if (childEventFocus === 'submission' || childEventFocus === 'help') return true;
  if (openConflictResolution) return true;
  // Series-scope edits use the same clean focused modal as single edits (recurrence
  // fields become editable and saves apply to every occurrence).
  return false;
}
