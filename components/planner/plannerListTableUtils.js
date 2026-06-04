const SUBLINE_SEPARATOR = ' · ';

export function resolveEventDateValue(ev) {
  if (!ev) return null;
  const direct = ev.start || ev.start_ts || ev.start_local || ev.due_ts;
  if (direct) return direct;
  const ymd = String(ev.date_local || ev.date || '').slice(0, 10);
  if (!ymd) return null;
  return `${ymd}T12:00:00.000Z`;
}

export function parseLinkedEventIds(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((id) => String(id)).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((id) => String(id)).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function mergeAssignmentsByEventId(rows) {
  const map = {};
  for (const row of rows || []) {
    for (const id of parseLinkedEventIds(row?.linked_event_ids)) {
      if (!map[id]) map[id] = [];
      map[id].push(row);
    }
  }
  return map;
}

export function formatEventTypeLabel(event) {
  if (!event) return 'Lesson';
  const holidayType = String(event?.holiday_type || event?.holidayType || '').trim().toUpperCase();
  if (holidayType === 'CUSTOM_BREAK') return 'Break';
  if (holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'GLOBAL_HOLIDAY') return 'Day Off';
  const raw = String(event?.event_type || event?.type || '').trim();
  if (!raw) return 'Lesson';
  const lower = raw.toLowerCase();
  if (lower === 'schedule block' || lower === 'scheduled class day' || lower === 'classday') return 'Class Day';
  if (lower === 'custom_break' || lower === 'break') return 'Break';
  if (lower === 'custom_holiday' || lower === 'global_holiday' || lower === 'holiday' || lower === 'day off' || lower === 'dayoff') return 'Day Off';
  const knownLabels = {
    lesson: 'Lesson',
    assignment: 'Assignment',
    activity: 'Activity',
    project: 'Project',
    exam: 'Exam',
    assessment: 'Assessment',
    appointment: 'Appointment',
  };
  return knownLabels[lower] || raw;
}

const ALL_DAY_TIME_LABEL = 'All Day';
const NO_TIME_ADDED_LABEL = 'No time added';

export function isPlannerHolidayOrBreakType(event) {
  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  const typeLower = String(event?.event_type || event?.type || '').trim().toLowerCase();
  return (
    typeLower === 'holiday' ||
    typeLower === 'day off' ||
    typeLower === 'dayoff' ||
    typeLower === 'break' ||
    holidayType === 'CUSTOM_HOLIDAY' ||
    holidayType === 'CUSTOM_BREAK' ||
    holidayType === 'GLOBAL_HOLIDAY'
  );
}

function isMidnightLocalTimeString(str) {
  const match = String(str || '').match(/(\d{1,2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
  if (!match) return false;
  const minutes = (match[2] ?? '00').padStart(2, '0');
  if (minutes !== '00') return false;
  const hours = parseInt(match[1], 10);
  const period = match[3]?.toUpperCase();
  if (period === 'AM' && hours === 12) return true;
  if (period === 'PM') return false;
  if (!period) return hours === 0 || hours === 12;
  return period === 'AM' && hours === 12;
}

function hasExplicitWallClockStart(event) {
  const sl = event?.start_local;
  if (sl == null || sl === '') return false;
  if (typeof sl !== 'string') return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(sl.trim())) return false;
  if (!/(\d{1,2})(?::\d{2})?\s*(AM|PM)?/i.test(sl)) return false;
  return !isMidnightLocalTimeString(sl);
}

function hasMidnightToEndOfDayBounds(event) {
  const startMs = event?.start_ts || event?.start;
  const endMs = event?.end_ts || event?.end;
  if (!startMs || !endMs) return false;
  const start = new Date(startMs);
  const end = new Date(endMs);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;

  const durationMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  if (durationMinutes >= 23 * 60) return true;

  const startsAtMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const endsAtEndOfDay = end.getHours() === 23 && end.getMinutes() >= 59;
  const endsAtMidnight = end.getHours() === 0 && end.getMinutes() === 0;
  return startsAtMidnight && (endsAtEndOfDay || endsAtMidnight);
}

/** Saved with optional/blank start time (flexible), not an explicit all-day event. */
export function isTimelessUntimedEvent(event) {
  if (!event || isPlannerHolidayOrBreakType(event)) return false;
  if (event.all_day === true || event.allDay === true) return false;
  return event.is_flexible === true;
}

/** Explicit all-day (toggle, holiday/break types, or non-flexible full-day bounds). */
export function isAllDayEvent(event) {
  if (!event) return false;
  if (event.all_day === true || event.allDay === true) return true;
  if (isPlannerHolidayOrBreakType(event)) return true;
  if (event.is_flexible === false && hasMidnightToEndOfDayBounds(event)) {
    return true;
  }
  return false;
}

function isMidnightSpanTimeLabel(startLabel, endLabel) {
  if (!startLabel || !endLabel) return false;
  const startMidnight = /^12:00\s*AM$/i.test(String(startLabel).trim());
  const endLate =
    /^11:59\s*PM$/i.test(String(endLabel).trim()) ||
    /^12:00\s*AM$/i.test(String(endLabel).trim());
  return startMidnight && endLate;
}

function formatTimedRangeLabel(event) {
  const startValue = resolveEventDateValue(event);
  const endValue = event?.end_ts || event?.end || event?.end_local;
  const formatTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };
  const startLabel = formatTime(startValue);
  const endLabel = formatTime(endValue);
  if (!startLabel && !endLabel) return '';
  if (startLabel && endLabel) return `${startLabel} - ${endLabel}`;
  return startLabel || endLabel || '';
}

function formatSingleStartTimeLabel(event) {
  if (typeof event?.start_local === 'string') {
    const match = event.start_local.match(/(\d{1,2})(?::(\d{2}))?(?:\s*(AM|PM))?/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = (match[2] ?? '00').padStart(2, '0');
      const periodRaw = match[3];
      if (periodRaw) {
        const period = periodRaw.toUpperCase();
        return minutes === '00' ? `${hours} ${period}` : `${hours}:${minutes} ${period}`;
      }
      const derivedPeriod = hours >= 12 ? 'PM' : 'AM';
      if (hours > 12) hours -= 12;
      else if (hours === 0) hours = 12;
      return minutes === '00' ? `${hours} ${derivedPeriod}` : `${hours}:${minutes} ${derivedPeriod}`;
    }
  }

  const startValue = resolveEventDateValue(event);
  if (!startValue) return '';
  const d = new Date(startValue);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** Month/week calendar chips: start time only; blank for untimed; "All Day" for all-day. */
export function formatEventChipTimeLabel(event) {
  if (!event) return '';
  if (isTimelessUntimedEvent(event)) return '';
  if (isAllDayEvent(event)) return ALL_DAY_TIME_LABEL;

  const range = formatTimedRangeLabel(event);
  if (range) {
    const [startPart, endPart] = range.split(/\s*-\s*/);
    if (isMidnightSpanTimeLabel(startPart?.trim(), endPart?.trim()) && !hasExplicitWallClockStart(event)) {
      return '';
    }
    if (startPart?.trim()) return startPart.trim();
  }

  return formatSingleStartTimeLabel(event);
}

/** Chip/list/home schedule label for event time. */
export function formatEventScheduleTimeLabel(event) {
  if (!event) return '';
  if (isTimelessUntimedEvent(event)) return NO_TIME_ADDED_LABEL;
  if (isAllDayEvent(event)) return ALL_DAY_TIME_LABEL;

  const timed = formatTimedRangeLabel(event);
  if (timed) {
    const [startPart, endPart] = timed.split(/\s*-\s*/);
    if (isMidnightSpanTimeLabel(startPart?.trim(), endPart?.trim()) && !hasExplicitWallClockStart(event)) {
      return NO_TIME_ADDED_LABEL;
    }
  }
  return timed;
}

export function formatTimeRangeLabel(event) {
  return formatEventScheduleTimeLabel(event);
}

export function formatChildNamesSentence(names) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list[0]}, ${list.slice(1, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export function resolveChildIdsForEvent(event) {
  const ids = [];
  if (event?.child_id) ids.push(String(event.child_id));
  if (Array.isArray(event?.child_ids)) {
    event.child_ids.forEach((id) => {
      if (id != null && String(id).trim()) ids.push(String(id));
    });
  }
  return [...new Set(ids.filter(Boolean))];
}

export function formatChildNamesCommaLine(childIds, children = []) {
  const names = (Array.isArray(childIds) ? childIds : [])
    .map((id) => {
      const match = (children || []).find((child) => String(child?.id) === String(id));
      return String(match?.first_name || match?.name || '').trim() || null;
    })
    .filter(Boolean);
  return names.join(', ');
}

export function resolveChildNamesForEvent(event, children = []) {
  const ids = resolveChildIdsForEvent(event);
  const names = ids
    .map((id) => {
      const match = (children || []).find((child) => String(child?.id) === id);
      return String(match?.first_name || match?.name || '').trim() || null;
    })
    .filter(Boolean);
  return formatChildNamesSentence(names);
}

export function getEventUnitLessonLabel(event) {
  const unitTitle = String(event?.curriculum_unit_title || event?.unit || event?.unit_name || '').trim();
  const meta = event?.curriculum_metadata && typeof event.curriculum_metadata === 'object'
    ? event.curriculum_metadata
    : {};
  const lessonTitle = String(meta?.lesson_label || event?.lesson || event?.lesson_name || '').trim();
  if (unitTitle && lessonTitle) return `${unitTitle}${SUBLINE_SEPARATOR}${lessonTitle}`;
  if (lessonTitle) return lessonTitle;
  if (unitTitle) return unitTitle;
  return '';
}

export function getEventMaterialIds(event) {
  const ids = [];
  const attachmentIds = Array.isArray(event?.materials_attachment_ids)
    ? event.materials_attachment_ids
    : [];
  attachmentIds.forEach((id) => {
    const normalized = String(id || '').trim();
    if (normalized) ids.push(normalized);
  });
  const primaryId = String(event?.material_id || '').trim();
  if (primaryId && !ids.includes(primaryId)) ids.unshift(primaryId);
  return ids;
}

export function resolveMaterialDisplayLabel(material, materialId, event) {
  const title = String(material?.title || '').trim();
  if (title) return title;
  const providerName = String(material?.provider_name || '').trim();
  if (providerName) return providerName;
  const primaryId = String(event?.material_id || '').trim();
  if (primaryId && primaryId === String(materialId || '')) {
    const eventTitle = String(event?.material_title || event?.attachment_title || '').trim();
    if (eventTitle) return eventTitle;
  }
  const storagePath = String(material?.storage_path || '').trim();
  if (storagePath) {
    const base = storagePath.split('/').pop();
    if (base) {
      try {
        return decodeURIComponent(base);
      } catch {
        return base;
      }
    }
  }
  return 'Attachment';
}

export function formatEventGradeLabel(event) {
  if (!event) return '';
  if (event.grade != null && event.grade !== '') return String(event.grade);
  if (event.score != null && event.possible != null && Number(event.possible) > 0) {
    const percent = Math.round((Number(event.score) / Number(event.possible)) * 100);
    return `${event.score}/${event.possible} (${percent}%)`;
  }
  if (event.score != null && event.score !== '') return String(event.score);
  return '';
}

export function pickAssignmentForEvent(event, assignments = []) {
  if (!Array.isArray(assignments) || assignments.length === 0) return null;
  const childId = String(
    event?.child_id || event?.childId || (Array.isArray(event?.child_ids) ? event.child_ids[0] : '') || ''
  ).trim();
  if (childId) {
    const match = assignments.find((row) => String(row?.child_id || '') === childId);
    if (match) return match;
  }
  return assignments[0];
}

export function getPlannerEventTypeColors(event) {
  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  const eventType = String(event?.event_type || event?.type || '').trim().toLowerCase();
  if (holidayType === 'CUSTOM_BREAK' || eventType === 'break') {
    return { chipBg: '#FFF7D6', chipText: '#A16207' };
  }
  if (holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'GLOBAL_HOLIDAY' || eventType === 'day off' || eventType === 'holiday') {
    return { chipBg: '#FFEDE2', chipText: '#9A3412' };
  }
  if (eventType === 'lesson' || eventType === 'schedule block' || eventType === 'scheduled class day' || eventType === 'classday' || eventType === 'class day') {
    return { chipBg: '#E3F0FF', chipText: '#4C7ED9' };
  }
  if (eventType === 'activity') return { chipBg: '#EDE6FF', chipText: '#7A5CD6' };
  if (eventType === 'assignment') return { chipBg: '#DFF7E3', chipText: '#4FAF75' };
  if (eventType === 'project') return { chipBg: '#D6F0ED', chipText: '#0D9488' };
  if (eventType === 'exam' || eventType === 'assessment') return { chipBg: '#FCE7F3', chipText: '#BE185D' };
  return { chipBg: '#F2F4F7', chipText: '#6B7280' };
}
