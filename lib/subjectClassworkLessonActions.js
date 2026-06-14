import { draftFromCurriculumStructure } from './subjectUnitsEditorDraft';
import { commitManualDraft } from './services/curriculumClient';
import { supabase } from './supabase';
import { updateEvent } from './services/plannerClientWithOffline';

function buildCommitDraft(draft) {
  return {
    title: draft.title,
    units: draft.units.map((u, i) => ({
      temp_id: u.temp_id,
      title: (u.title || '').trim() || `Unit ${i + 1}`,
      description: null,
      sequence_index: i + 1,
      inferred: !!u.inferred,
      lessons: (u.lessons || []).map((le, j) => ({
        temp_id: le.temp_id,
        title: (le.title || '').trim() || `Lesson ${j + 1}`,
        objective: (le.objective || '').trim() || null,
        notes: (le.notes || '').trim() || null,
        sequence_index: j + 1,
        minutes_est: le.minutes_est ?? 60,
        modality: le.modality || null,
        lesson_type: (le.lesson_type === 'exam' ? 'assessment' : le.lesson_type) || 'lesson',
        materials: le.materials || null,
        is_placeholder: !!le.is_placeholder,
        cadence_metadata: le.cadence_metadata || null,
      })),
    })),
  };
}

export function buildDraftWithoutLesson(units, lessonId) {
  const draft = draftFromCurriculumStructure({ units });
  if (!draft?.units?.length) {
    return { error: 'No curriculum to update.' };
  }

  const nextUnits = [];
  for (let unitIndex = 0; unitIndex < draft.units.length; unitIndex += 1) {
    const sourceUnit = units[unitIndex];
    const draftUnit = draft.units[unitIndex];
    if (!draftUnit) continue;
    const nextLessons = (draftUnit.lessons || []).filter((_, li) => {
      const sourceLesson = sourceUnit?.lessons?.[li];
      return sourceLesson?.id == null || String(sourceLesson.id) !== String(lessonId);
    });
    if (nextLessons.length === 0) continue;
    nextUnits.push({
      ...draftUnit,
      lessons: nextLessons.map((le, j) => ({ ...le, sequence_index: j + 1 })),
    });
  }

  if (!nextUnits.length) {
    return { error: 'Cannot remove the last lesson. Use Edit units to change the curriculum.' };
  }

  return { draft: { ...draft, units: nextUnits } };
}

async function unlinkEventsFromLesson({ familyId, lessonId }) {
  if (!familyId || !lessonId) return;
  const { data: events, error } = await supabase
    .from('events')
    .select('id')
    .eq('family_id', familyId)
    .eq('curriculum_lesson_id', String(lessonId));
  if (error || !events?.length) return;
  await Promise.all(
    events.map((row) =>
      updateEvent(row.id, {
        family_id: familyId,
        curriculum_lesson_id: null,
        lesson: null,
      }),
    ),
  );
}

function findLessonLocation(units, lessonId) {
  const lid = String(lessonId);
  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const lessons = units[unitIndex]?.lessons || [];
    for (let lessonIndex = 0; lessonIndex < lessons.length; lessonIndex += 1) {
      if (lessons[lessonIndex]?.id != null && String(lessons[lessonIndex].id) === lid) {
        return { unitIndex, lessonIndex };
      }
    }
  }
  return null;
}

function resolveUnitId(unit, unitIndex) {
  return unit?.id != null ? String(unit.id) : `idx-${unitIndex}`;
}

export function buildDraftAfterMovingLesson(units, { lessonId, toUnitId, beforeLessonId = null }) {
  const draft = draftFromCurriculumStructure({ units });
  if (!draft?.units?.length) {
    return { error: 'No curriculum to update.' };
  }

  const from = findLessonLocation(units, lessonId);
  if (!from) {
    return { error: 'Lesson not found.' };
  }

  const toUnitIndex = units.findIndex((unit, index) => resolveUnitId(unit, index) === String(toUnitId));
  if (toUnitIndex < 0) {
    return { error: 'Unit not found.' };
  }

  let insertBeforeIndex = null;
  if (beforeLessonId != null) {
    const targetLessons = units[toUnitIndex]?.lessons || [];
    insertBeforeIndex = targetLessons.findIndex(
      (lesson) => lesson?.id != null && String(lesson.id) === String(beforeLessonId),
    );
    if (insertBeforeIndex < 0) insertBeforeIndex = targetLessons.length;
  }

  const draftUnits = draft.units.map((unit) => ({ ...unit, lessons: [...(unit.lessons || [])] }));
  const fromLessons = draftUnits[from.unitIndex].lessons;
  const [moved] = fromLessons.splice(from.lessonIndex, 1);
  draftUnits[from.unitIndex] = { ...draftUnits[from.unitIndex], lessons: fromLessons };

  const toLessons = [...draftUnits[toUnitIndex].lessons];
  let insertAt = insertBeforeIndex === null ? toLessons.length : insertBeforeIndex;
  if (insertAt < 0) insertAt = 0;
  if (insertAt > toLessons.length) insertAt = toLessons.length;
  if (from.unitIndex === toUnitIndex && from.lessonIndex < insertAt) insertAt -= 1;
  toLessons.splice(insertAt, 0, moved);
  draftUnits[toUnitIndex] = { ...draftUnits[toUnitIndex], lessons: toLessons };

  const nextUnits = draftUnits.map((unit, unitIndex) => ({
    ...unit,
    sequence_index: unitIndex + 1,
    lessons: (unit.lessons || []).map((lesson, lessonIndex) => ({
      ...lesson,
      sequence_index: lessonIndex + 1,
    })),
  }));

  return { draft: { ...draft, units: nextUnits } };
}

export async function moveLessonInSubjectCurriculum({
  familyId,
  subjectId,
  subjectName,
  units,
  lessonId,
  toUnitId,
  beforeLessonId = null,
}) {
  if (!familyId || !subjectId || !lessonId || toUnitId == null) {
    throw new Error('Missing lesson or unit');
  }

  const { draft, error } = buildDraftAfterMovingLesson(units, { lessonId, toUnitId, beforeLessonId });
  if (error) throw new Error(error);
  if (!draft) throw new Error('Could not update curriculum');

  const { data, error: commitError } = await commitManualDraft({
    subject_id: subjectId,
    family_id: familyId,
    subject_name: subjectName || 'Subject',
    builder_mode: 'rich_units',
    draft: buildCommitDraft(draft),
    replace_existing: true,
    create_calendar_events: false,
  });

  if (commitError || !data) {
    throw new Error(commitError?.message || 'Could not move lesson');
  }

  return data;
}

export async function deleteLessonFromSubjectCurriculum({
  familyId,
  subjectId,
  subjectName,
  units,
  lessonId,
}) {
  if (!familyId || !subjectId || !lessonId) {
    throw new Error('Missing lesson or subject');
  }

  const { draft, error } = buildDraftWithoutLesson(units, lessonId);
  if (error) throw new Error(error);
  if (!draft) throw new Error('Could not update curriculum');

  await unlinkEventsFromLesson({ familyId, lessonId });

  const { data, error: commitError } = await commitManualDraft({
    subject_id: subjectId,
    family_id: familyId,
    subject_name: subjectName || 'Subject',
    builder_mode: 'rich_units',
    draft: buildCommitDraft(draft),
    replace_existing: true,
    create_calendar_events: false,
  });

  if (commitError || !data) {
    throw new Error(commitError?.message || 'Could not delete lesson');
  }

  return data;
}
