import { RECURRENCE_WEEKDAY_OPTIONS } from './saveEventHelpers';
import { toYmd } from './eventTimeUtils';

function parseRecurrenceRule(ruleRaw) {
  if (!ruleRaw) return null;
  if (typeof ruleRaw === 'object' && !Array.isArray(ruleRaw)) return ruleRaw;
  if (typeof ruleRaw === 'string') {
    try {
      return JSON.parse(ruleRaw);
    } catch (_) {
      return null;
    }
  }
  return null;
}

function rruleToWeekdayValue(rrule) {
  const token = String(rrule || '').toUpperCase();
  return RECURRENCE_WEEKDAY_OPTIONS.find((opt) => opt.rrule === token)?.value;
}

function formatHmFromDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return '';
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function resolveAssigneeIds(event) {
  if (Array.isArray(event?.child_ids) && event.child_ids.length > 0) {
    return event.child_ids.map((id) => String(id)).filter(Boolean);
  }
  if (event?.child_id) return [String(event.child_id)];
  return [];
}

function resolveMaterialId(event) {
  if (event?.material_id) return String(event.material_id);
  const ids = event?.materials_attachment_ids;
  if (Array.isArray(ids) && ids.length > 0) return String(ids[0]);
  return null;
}

export { resolveMaterialId };

export function isSimpleCalendarEvent(event) {
  if (!event?.id) return false;
  const type = String(event.event_type || 'Other').trim();
  if (type !== 'Other') return false;
  if (event.subject_id) return false;
  if (event.curriculum_lesson_id) return false;
  if (event.source_syllabus_id) return false;
  if (event.unit || event.lesson) return false;
  const meta = event.curriculum_metadata;
  if (meta && typeof meta === 'object' && Object.keys(meta).length > 0) return false;
  return true;
}

export function recurrenceRuleToFormState(ruleRaw, startDate) {
  const rule = parseRecurrenceRule(ruleRaw);
  const anchor = startDate instanceof Date ? startDate : new Date();
  if (!rule) {
    return {
      isRepeating: false,
      recurrenceType: 'weekly',
      recurrenceWeekdays: [anchor.getDay()],
      recurrenceEndType: 'never',
      recurrenceEndAfterText: '',
      recurrenceEndDate: null,
    };
  }

  const freq = String(rule.frequency || rule.freq || 'weekly').toLowerCase();
  const recurrenceType = ['daily', 'weekly', 'monthly'].includes(freq) ? freq : 'weekly';
  const byweekday = rule.byweekday || rule.byWeekday || [];
  let recurrenceWeekdays = Array.isArray(byweekday)
    ? byweekday.map(rruleToWeekdayValue).filter((v) => v != null)
    : [];
  if (!recurrenceWeekdays.length) recurrenceWeekdays = [anchor.getDay()];

  let recurrenceEndType = 'never';
  let recurrenceEndAfterText = '';
  let recurrenceEndDate = null;
  if (rule.count != null && Number(rule.count) > 0) {
    recurrenceEndType = 'after';
    recurrenceEndAfterText = String(rule.count);
  } else if (rule.until) {
    recurrenceEndType = 'on';
    const parsed = new Date(rule.until);
    recurrenceEndDate = Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return {
    isRepeating: true,
    recurrenceType,
    recurrenceWeekdays,
    recurrenceEndType,
    recurrenceEndAfterText,
    recurrenceEndDate,
  };
}

export function hydrateCalendarEventForm(event) {
  const start = event?.start_ts ? new Date(event.start_ts) : new Date();
  const end = event?.end_ts ? new Date(event.end_ts) : null;
  let endDate = null;
  if (end && !Number.isNaN(end.getTime()) && toYmd(end) !== toYmd(start)) {
    endDate = end;
  }

  const recurrence = recurrenceRuleToFormState(event?.recurrence_rule, start);

  const startHasClockTime = !Number.isNaN(start.getTime())
    && (start.getHours() !== 0 || start.getMinutes() !== 0);
  const shouldShowEmptyTime = event?.is_flexible === true && !startHasClockTime;

  return {
    title: String(event?.title || ''),
    assigneeIds: resolveAssigneeIds(event),
    startDate: start,
    endDate,
    startTime: shouldShowEmptyTime ? '' : formatHmFromDate(start),
    endTime: shouldShowEmptyTime || !end || endDate ? '' : formatHmFromDate(end),
    location: String(event?.location || ''),
    notes: String(event?.description || ''),
    materialId: resolveMaterialId(event),
    ...recurrence,
  };
}
