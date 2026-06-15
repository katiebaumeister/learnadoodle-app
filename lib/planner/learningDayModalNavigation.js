import { Platform } from 'react-native';
import { isPlanYearBlockSeries, cleanPlannerEventId } from '../utils/recurringEventUtils';
import { getEventStartDate } from '../subjectLessonLinking';
import { resolveEventSubjectId, resolveEventSubjectName } from './plannerEventSubject';

export const OPEN_LEARNING_DAY_MODAL_EVENT = 'openLearningDayModal';
export const OPEN_LEARNING_DAY_CHOICE_EVENT = 'openLearningDayChoiceModal';

export function dispatchOpenLearningDayModal({ event = null, eventId = null } = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_LEARNING_DAY_MODAL_EVENT, {
    detail: {
      event,
      eventId: eventId || event?.id || null,
    },
  }));
}

export function dispatchOpenLearningDayChoiceModal({ event = null, eventId = null } = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_LEARNING_DAY_CHOICE_EVENT, {
    detail: {
      event,
      eventId: eventId || event?.id || null,
    },
  }));
}

export function resolveLearningDaySubjectName(event, subjects = []) {
  const fromEvent = resolveEventSubjectName(event);
  if (fromEvent) return fromEvent;
  const subjectId = resolveEventSubjectId(event);
  if (!subjectId) return String(event?.title || '').trim() || 'Subject';
  const row = (subjects || []).find((s) => String(s?.id) === String(subjectId));
  return String(row?.name || event?.title || '').trim() || 'Subject';
}

export function formatLearningDayDateLabel(event) {
  const d = getEventStartDate(event);
  if (!d) return 'Date TBD';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatLearningDayTimeLabel(event) {
  const raw = event?.start_ts || event?.start || event?.start_local || event?.start_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function resolveLearningDayDurationMinutes(event) {
  const startRaw = event?.start_ts || event?.start || event?.start_local;
  const endRaw = event?.end_ts || event?.end || event?.end_local;
  if (startRaw && endRaw) {
    const start = new Date(startRaw);
    const end = new Date(endRaw);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const mins = Math.round((end.getTime() - start.getTime()) / 60000);
      if (mins > 0) return mins;
    }
  }
  const fallback = event?.duration_minutes ?? event?.durationMinutes;
  if (fallback != null && Number.isFinite(Number(fallback))) return Number(fallback);
  return null;
}

export function isGeneratedFromSubjectSchedule(event) {
  return isPlanYearBlockSeries(event);
}

export function learningDayEventSelectFields() {
  return 'id, subject_id, title, subject_name, generated_by, source_block_id, academic_year_id, curriculum_lesson_id, curriculum_metadata, event_type, start_ts, end_ts, child_id, status, canceled_at, minutes, lesson, unit';
}

export function isUuidLike(value) {
  if (value == null || typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/** Fetch planner row fields when the grid payload is incomplete. */
export async function enrichLearningDayEvent({ supabase, familyId, event }) {
  if (!event?.id || !supabase) return event;
  const cleanId = cleanPlannerEventId(String(event.id || ''));
  if (!cleanId || !isUuidLike(cleanId)) return event;

  const needsFetch = !resolveEventSubjectId(event)
    || (event.generated_by == null && event.source_block_id == null)
    || !event.start_ts;

  if (!needsFetch) return event;

  try {
    let query = supabase
      .from('events')
      .select(learningDayEventSelectFields())
      .eq('id', cleanId);
    if (familyId) query = query.eq('family_id', familyId);
    const { data: fetched, error } = await query.maybeSingle();
    if (!error && fetched) {
      return { ...event, ...fetched, id: fetched.id || cleanId };
    }
  } catch (_) {
    // Best effort — use grid payload.
  }
  return event;
}

/** Open assignment create flow prefilled for a learning day session. */
export function dispatchCreateAssignmentForLearningDay({
  event,
  subjectId,
  childIds = [],
} = {}) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !event?.id) return;
  const sessionDate = getEventStartDate(event);
  const ids = (childIds || []).map(String).filter(Boolean);
  const childId = event?.child_id || event?.childId || ids[0] || null;
  window.dispatchEvent(new CustomEvent('openTaskModal', {
    detail: {
      date: sessionDate || new Date(),
      eventType: 'Assignment',
      subjectId: subjectId || event?.subject_id || null,
      childIds: ids.length > 0 ? ids : (childId ? [String(childId)] : []),
      childId: childId ? String(childId) : null,
      linkedLearningDayEventId: String(event.id),
      curriculumLessonId: event?.curriculum_lesson_id != null
        ? String(event.curriculum_lesson_id)
        : null,
    },
  }));
}
