import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { deleteEvent } from '../services/plannerClientWithOffline';
import { RECURRENCE_WEEKDAY_OPTIONS } from './saveEventHelpers';

function parseTimeLabelFromTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  if (d.getHours() === 0 && d.getMinutes() === 0) return '';
  return d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s/g, ' ')
    .trim();
}

/**
 * Detect an "untimed" event (no specific clock time) so the edit modal leaves the
 * time fields blank instead of surfacing a spurious time.
 *
 * Untimed events are stored as is_flexible=true spanning the whole day(s)
 * (local midnight -> 23:59). We key off that full-day span rather than the start
 * clock or the is_flexible flag alone because:
 *   - is_flexible is ALSO set on real timed events saved through a conflict override,
 *     so "flexible => blank" would erase a genuine time.
 *   - the start clock can drift off midnight across a DST boundary for generated
 *     recurring instances, so "start === midnight" can miss legitimately untimed rows.
 * The full-day span (>= ~23h, DST-tolerant) cleanly separates untimed events from
 * short, real timed events.
 */
function isUntimedFlexibleEvent(event, startTs, endTs) {
  if (!event || event.all_day) return false;
  const start = new Date(startTs || '');
  const end = new Date(endTs || '');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const spanMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (spanMinutes < 23 * 60) return false;
  // Flexible full-day placeholder (incl. DST drift off exact midnight).
  if (event.is_flexible === true) return true;
  // Legacy rows: midnight→EOD without all_day means "no time", not a 12:00 AM event.
  const startsMidnight = start.getHours() === 0 && start.getMinutes() === 0;
  const endsLate = end.getHours() === 23 && end.getMinutes() >= 59;
  return startsMidnight && endsLate;
}

function parseRecurrenceRule(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (_) {
    return null;
  }
}

export async function fetchCalendarEventForEdit(eventId) {
  if (!eventId) return null;
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/**
 * Recurring instances created before recurrence_rule was stored on instances don't
 * carry the rule themselves. When editing such an occurrence, fall back to the series
 * master's rule so the modal correctly shows it as repeating.
 */
export async function ensureSeriesRecurrenceRule(eventRow) {
  if (!eventRow || eventRow.recurrence_rule) return eventRow;
  const seriesId = eventRow.recurrence_id || eventRow.parent_event_id;
  if (!seriesId || String(seriesId) === String(eventRow.id)) return eventRow;
  try {
    const { data } = await supabase
      .from('events')
      .select('recurrence_rule')
      .eq('id', seriesId)
      .maybeSingle();
    if (data?.recurrence_rule) {
      return { ...eventRow, recurrence_rule: data.recurrence_rule };
    }
  } catch (_) {
    // Non-fatal: fall back to treating it as a one-off event.
  }
  return eventRow;
}

export function calendarEventFormFromEvent(event) {
  if (!event) {
    return {
      eventId: null,
      title: '',
      assigneeIds: [],
      startDate: new Date(),
      endDate: null,
      startTime: '',
      endTime: '',
      location: '',
      notes: '',
      materialId: null,
      isRepeating: false,
      recurrenceType: 'weekly',
      recurrenceWeekdays: [],
      recurrenceEndType: 'never',
      recurrenceEndAfterText: '',
      recurrenceEndDate: null,
      subjectId: null,
      subjectName: '',
      unitId: null,
      unitTitle: '',
      curriculumLessonId: null,
      lessonLabel: '',
    };
  }

  const startTs = event.start_ts || event.start_local;
  const endTs = event.end_ts || event.end_local;
  const startDate = startTs
    ? new Date(startTs)
    : (event.date_local ? new Date(`${String(event.date_local).slice(0, 10)}T12:00:00`) : new Date());

  let endDate = null;
  if (endTs && startTs) {
    const end = new Date(endTs);
    const start = new Date(startTs);
    const startYmd = String(startTs).slice(0, 10);
    const endYmd = String(endTs).slice(0, 10);
    if (endYmd !== startYmd) {
      endDate = end;
    }
  }

  const childIds = Array.isArray(event.child_ids) && event.child_ids.length > 0
    ? event.child_ids.map((id) => String(id))
    : (event.child_id ? [String(event.child_id)] : []);

  const materialIds = Array.isArray(event.materials_attachment_ids)
    ? event.materials_attachment_ids
    : [];

  const rule = parseRecurrenceRule(event.recurrence_rule);
  const isRepeating = !!rule;
  let recurrenceType = 'weekly';
  let recurrenceWeekdays = [];
  let recurrenceEndType = 'never';
  let recurrenceEndAfterText = '';
  let recurrenceEndDate = null;

  if (rule) {
    const freq = String(rule.frequency || rule.freq || 'WEEKLY').toUpperCase();
    if (freq === 'DAILY') recurrenceType = 'daily';
    else if (freq === 'MONTHLY') recurrenceType = 'monthly';
    else recurrenceType = 'weekly';

    if (Array.isArray(rule.byweekday)) {
      recurrenceWeekdays = rule.byweekday
        .map((token) => RECURRENCE_WEEKDAY_OPTIONS.find((opt) => opt.rrule === token)?.value)
        .filter((value) => value != null);
    }

    if (rule.count) {
      recurrenceEndType = 'after';
      recurrenceEndAfterText = String(rule.count);
    } else if (rule.until) {
      recurrenceEndType = 'on';
      const untilYmd = String(rule.until).slice(0, 10);
      recurrenceEndDate = /^\d{4}-\d{2}-\d{2}$/.test(untilYmd)
        ? new Date(`${untilYmd}T12:00:00`)
        : null;
    }
  }

  const isUntimed = event.all_day || isUntimedFlexibleEvent(event, startTs, endTs);

  return {
    eventId: event.id,
    title: String(event.title || ''),
    assigneeIds: childIds,
    startDate: Number.isNaN(startDate.getTime()) ? new Date() : startDate,
    endDate: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
    startTime: isUntimed ? '' : parseTimeLabelFromTs(startTs),
    endTime: isUntimed ? '' : parseTimeLabelFromTs(endTs),
    location: String(event.location || ''),
    notes: String(event.description || event.notes || ''),
    materialId: materialIds[0] || event.material_id || null,
    isRepeating,
    recurrenceType,
    recurrenceWeekdays,
    recurrenceEndType,
    recurrenceEndAfterText,
    recurrenceEndDate,
    subjectId: event.subject_id != null ? String(event.subject_id) : null,
    subjectName: String(event.subject_name || event.subjectName || event.subject || '').trim()
      || (event.subject_id ? String(event.title || '').trim() : ''),
    unitId: null,
    unitTitle: String(event.curriculum_unit_title || event.unit || '').trim(),
    curriculumLessonId: event.curriculum_lesson_id != null ? String(event.curriculum_lesson_id) : null,
    lessonLabel: String(
      event.lesson
      || (event.curriculum_metadata && typeof event.curriculum_metadata === 'object'
        ? event.curriculum_metadata.lesson_label
        : '')
      || ''
    ).trim(),
  };
}

export async function deleteCalendarEvent({ eventId, familyId }) {
  if (!eventId || !familyId) throw new Error('Missing event');
  const { error } = await deleteEvent(eventId, familyId);
  if (error) throw error;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('refreshCalendar'));
    window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId } }));
  }
}
