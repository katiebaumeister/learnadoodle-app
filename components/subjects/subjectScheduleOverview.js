const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseWeekdaysFromPlanBlock(block) {
  if (!Array.isArray(block?.weekdays)) return [];
  return block.weekdays
    .map((day) => parseInt(day, 10))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

function formatTimeAmPm(raw) {
  const match = String(raw || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  return minute === '00' ? `${hour}:00 ${period}` : `${hour}:${minute} ${period}`;
}

function durationMinutesFromBlock(block) {
  const start = String(block?.start_time || '').match(/^(\d{1,2}):(\d{2})/);
  const end = String(block?.end_time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!start || !end) return null;
  const startMins = parseInt(start[1], 10) * 60 + parseInt(start[2], 10);
  const endMins = parseInt(end[1], 10) * 60 + parseInt(end[2], 10);
  const diff = endMins - startMins;
  return diff > 0 ? diff : null;
}

export function getSubjectPlanBlocksForSubject(planData, subjectId) {
  if (!planData?.plan || !subjectId) return [];
  const sid = String(subjectId);
  const blocks = Array.isArray(planData.plan.blocks) ? planData.plan.blocks : [];
  return blocks.filter((block) => {
    if (String(block?.subject_id ?? '') === sid) return true;
    const ids = Array.isArray(block?.subject_ids) ? block.subject_ids.map(String) : [];
    return ids.includes(sid);
  });
}

export function computeCurriculumLessonProgress(units = [], subjectEvents = []) {
  const lessonIds = [];
  (units || []).forEach((unit) => {
    (unit?.lessons || []).forEach((lesson) => {
      const id = lesson?.id != null ? String(lesson.id).trim() : '';
      if (id) lessonIds.push(id);
    });
  });
  const total = lessonIds.length;
  if (total === 0) {
    return { completed: 0, scheduled: 0, notScheduled: 0, total: 0 };
  }
  const lessonIdSet = new Set(lessonIds);
  const completedIds = new Set();
  const scheduledIds = new Set();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  (subjectEvents || []).forEach((event) => {
    if (event?.status === 'canceled' || event?.is_backlog) return;
    const lid = event?.curriculum_lesson_id != null ? String(event.curriculum_lesson_id).trim() : '';
    if (!lid || !lessonIdSet.has(lid)) return;
    if (event?.status === 'done') {
      completedIds.add(lid);
      return;
    }
    const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
    if (!raw) return;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime()) && d >= today) {
      scheduledIds.add(lid);
    }
  });

  completedIds.forEach((id) => scheduledIds.delete(id));
  const completed = completedIds.size;
  const scheduled = scheduledIds.size;
  const notScheduled = Math.max(0, total - completed - scheduled);

  return { completed, scheduled, notScheduled, total };
}

function buildLessonTitleLookup(units = []) {
  const map = new Map();
  (units || []).forEach((unit) => {
    (unit?.lessons || []).forEach((lesson) => {
      const id = lesson?.id != null ? String(lesson.id).trim() : '';
      const title = String(lesson?.title || '').trim();
      if (id && title) map.set(id, title);
    });
  });
  return map;
}

function eventStartDate(event) {
  const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildUpcomingSubjectSessions(subjectEvents = [], units = [], { limit = 5 } = {}) {
  const lessonTitles = buildLessonTitleLookup(units);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (subjectEvents || [])
    .filter((event) => event?.status !== 'canceled' && event?.status !== 'done' && !event?.is_backlog)
    .map((event) => {
      const date = eventStartDate(event);
      if (!date || date < today) return null;
      const lessonId = event?.curriculum_lesson_id != null ? String(event.curriculum_lesson_id).trim() : '';
      const linkedTitle = lessonId ? lessonTitles.get(lessonId) : null;
      const title = linkedTitle
        || String(event?.lesson || '').trim()
        || String(event?.title || '').trim()
        || 'Session';
      const isAssignment = String(event?.event_type || '').toLowerCase() === 'assignment';
      const needsLesson = !lessonId && !String(event?.lesson || '').trim();
      return {
        event,
        date,
        dateLabel: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        title,
        isAssignment,
        needsLesson,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, limit);
}

export function getNextLessonLabel(units = [], subjectEvents = []) {
  const upcoming = buildUpcomingSubjectSessions(subjectEvents, units, { limit: 1 });
  if (upcoming[0]?.title && upcoming[0].title !== 'Session') {
    return upcoming[0].title;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lessonIds = new Set();
  (units || []).forEach((unit) => {
    (unit?.lessons || []).forEach((lesson) => {
      const id = lesson?.id != null ? String(lesson.id).trim() : '';
      if (id) lessonIds.add(id);
    });
  });
  const linkedIds = new Set(
    (subjectEvents || [])
      .map((event) => (event?.curriculum_lesson_id != null ? String(event.curriculum_lesson_id).trim() : ''))
      .filter(Boolean)
  );
  for (const unit of units || []) {
    for (const lesson of unit?.lessons || []) {
      const id = lesson?.id != null ? String(lesson.id).trim() : '';
      const title = String(lesson?.title || '').trim();
      if (id && title && lessonIds.has(id) && !linkedIds.has(id)) {
        return title;
      }
    }
  }
  return null;
}

export function extractUnitTitles(units = [], limit = 5) {
  return (units || [])
    .map((unit) => String(unit?.title || '').trim())
    .filter(Boolean)
    .slice(0, limit);
}

export function buildSubjectScheduleOverview({ planData, subjectId, subjectEvents = [] }) {
  const blocks = getSubjectPlanBlocksForSubject(planData, subjectId);
  const block = blocks[0] || null;
  const weekdays = block ? parseWeekdaysFromPlanBlock(block) : [];
  const daysLabel = weekdays.map((day) => WEEKDAY_SHORT[day]).join(' • ') || null;
  const timeLabel = block ? formatTimeAmPm(block.start_time) : null;
  const durationMins = block ? durationMinutesFromBlock(block) : null;
  const timeLine = [timeLabel, durationMins ? `${durationMins} min` : null].filter(Boolean).join(' • ') || null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = (subjectEvents || [])
    .filter((event) => event?.status !== 'canceled' && !event?.is_backlog)
    .map((event) => {
      const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
      if (!raw) return null;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? null : { event, date: d };
    })
    .filter((entry) => entry && entry.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const nextEntry = upcoming[0] || null;
  const nextScheduled = nextEntry
    ? nextEntry.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return {
    hasSchedule: Boolean(daysLabel),
    daysLabel,
    timeLine,
    nextScheduled,
    nextScheduledEvent: nextEntry?.event || null,
  };
}

export function formatSubjectScheduleSummaryLine(planData, subjectId) {
  if (!planData || !subjectId) return null;
  const { daysLabel, timeLine } = buildSubjectScheduleOverview({ planData, subjectId });
  return [daysLabel, timeLine].filter(Boolean).join(' · ') || null;
}
