/**
 * Resolve next / matching curriculum lessons for Doodle confirmable creates.
 * Sequence is unit → lesson (sequence_index); no separate “level” entity.
 */

/**
 * First lesson in unit order that is not already linked on a non-canceled event.
 * @returns {{ unitId: string, unitTitle: string, lessonId: string, lessonTitle: string, sequence: number|null, minutes: number|null }|null}
 */
export function findNextUnscheduledLesson(units = [], subjectEvents = []) {
  const linkedIds = new Set(
    (subjectEvents || [])
      .filter((ev) => String(ev?.status || '') !== 'canceled')
      .map((ev) => (ev?.curriculum_lesson_id != null ? String(ev.curriculum_lesson_id).trim() : ''))
      .filter(Boolean),
  );

  for (const unit of units || []) {
    const unitId = unit?.id != null ? String(unit.id) : null;
    const unitTitle = String(unit?.title || unit?.name || 'Unit').trim() || 'Unit';
    const lessons = [...(unit?.lessons || [])].sort((a, b) => {
      const sa = Number(a?.sequence ?? a?.sequence_index ?? 0);
      const sb = Number(b?.sequence ?? b?.sequence_index ?? 0);
      return sa - sb;
    });
    for (const lesson of lessons) {
      const lessonId = lesson?.id != null ? String(lesson.id).trim() : '';
      const lessonTitle = String(lesson?.title || '').trim();
      if (!lessonId || !lessonTitle) continue;
      if (linkedIds.has(lessonId)) continue;
      return {
        unitId,
        unitTitle,
        lessonId,
        lessonTitle,
        sequence: lesson.sequence ?? lesson.sequence_index ?? null,
        minutes: lesson.minutes ?? lesson.minutes_est ?? null,
        objective: lesson.objective || lesson.description || null,
      };
    }
  }
  return null;
}

/**
 * Match lessons/units by query (e.g. “fractions”).
 * @returns {Array<{ unitId: string, unitTitle: string, lessonId: string, lessonTitle: string, score: number, objective?: string|null }>}
 */
export function findLessonsByQuery(units = [], query = '') {
  const q = String(query || '').trim().toLowerCase();
  if (!q || q.length < 2) return [];
  const hits = [];
  for (const unit of units || []) {
    const unitId = unit?.id != null ? String(unit.id) : null;
    const unitTitle = String(unit?.title || unit?.name || 'Unit').trim() || 'Unit';
    const unitLower = unitTitle.toLowerCase();
    for (const lesson of unit?.lessons || []) {
      const lessonId = lesson?.id != null ? String(lesson.id).trim() : '';
      const lessonTitle = String(lesson?.title || '').trim();
      if (!lessonId || !lessonTitle) continue;
      const titleLower = lessonTitle.toLowerCase();
      let score = 0;
      if (titleLower === q) score = 100;
      else if (titleLower.includes(q)) score = 80;
      else if (unitLower.includes(q)) score = 50;
      else if (q.split(/\s+/).every((w) => w.length > 2 && (titleLower.includes(w) || unitLower.includes(w)))) {
        score = 40;
      }
      if (score > 0) {
        hits.push({
          unitId,
          unitTitle,
          lessonId,
          lessonTitle,
          score,
          sequence: lesson.sequence ?? lesson.sequence_index ?? null,
          objective: lesson.objective || lesson.description || null,
        });
      }
    }
  }
  return hits.sort((a, b) => b.score - a.score || String(a.lessonTitle).localeCompare(String(b.lessonTitle)));
}

/**
 * Load subject curriculum units + events that may link lessons.
 * @param {object} opts
 * @param {object} [opts.bundle] - test inject { units, events }
 */
export async function loadSubjectCurriculumBundle({
  familyId,
  subjectId,
  academicYearId = null,
} = {}, opts = {}) {
  if (opts.bundle) {
    return {
      units: opts.bundle.units || [],
      events: opts.bundle.events || [],
      error: null,
    };
  }
  if (!familyId || !subjectId) {
    return { units: [], events: [], error: new Error('familyId and subjectId required') };
  }

  let units = [];
  let events = [];
  try {
    const { fetchSubjectCurriculumEventsStructure } = await import('../../services/curriculumClient.js');
    const { data, error } = await fetchSubjectCurriculumEventsStructure(
      familyId,
      subjectId,
      academicYearId,
    );
    if (!error && data?.units) units = data.units;
  } catch (_) {
    // leave empty
  }

  try {
    const { supabase } = await import('../../supabase.js');
    const { data, error } = await supabase
      .from('events')
      .select('id, title, status, curriculum_lesson_id, subject_id, start_ts')
      .eq('family_id', familyId)
      .eq('subject_id', subjectId)
      .is('deleted_at', null)
      .not('curriculum_lesson_id', 'is', null)
      .limit(200);
    if (!error && Array.isArray(data)) events = data;
  } catch (_) {
    // leave empty
  }

  return { units, events, error: null };
}
