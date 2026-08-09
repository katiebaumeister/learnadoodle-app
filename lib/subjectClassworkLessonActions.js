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

  return commitSubjectCurriculumDraft({
    familyId,
    subjectId,
    subjectName,
    draft,
  });
}

function tempId(prefix = 'temp') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultLessonDraft(lessonIndex = 0) {
  return {
    temp_id: tempId('l'),
    title: `Lesson ${lessonIndex + 1}`,
    objective: null,
    notes: null,
    sequence_index: lessonIndex + 1,
    minutes_est: 60,
    modality: null,
    lesson_type: 'lesson',
    materials: null,
    is_placeholder: false,
    cadence_metadata: null,
    reference_date: null,
  };
}

/** Curriculum always nests lessons under a unit; this bucket is the UI "No unit" section. */
export const NO_UNIT_BUCKET_TITLE = 'No unit';

export function isNoUnitBucketTitle(title) {
  return String(title || '').trim().toLowerCase() === NO_UNIT_BUCKET_TITLE.toLowerCase();
}

function defaultUnitDraft(unitIndex = 0, { includeLesson = true, title = null } = {}) {
  const lessons = includeLesson ? [defaultLessonDraft(0)] : [];
  const resolvedTitle = title != null && String(title).trim()
    ? String(title).trim()
    : `Unit ${unitIndex + 1}`;
  return {
    temp_id: tempId('u'),
    title: resolvedTitle,
    description: null,
    sequence_index: unitIndex + 1,
    inferred: false,
    lessons,
  };
}

async function commitSubjectCurriculumDraft({
  familyId,
  subjectId,
  subjectName,
  draft,
}) {
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
    throw new Error(commitError?.message || 'Could not update curriculum');
  }

  return data;
}

export function buildDraftWithAddedUnit(units, { includeLesson = false, title = null } = {}) {
  const existing = draftFromCurriculumStructure({ units });
  const realUnitCount = (existing?.units || []).filter((unit) => !isNoUnitBucketTitle(unit?.title)).length;
  const nextUnit = defaultUnitDraft(realUnitCount, { includeLesson, title });
  if (!existing) {
    return { draft: { title: null, units: [nextUnit] } };
  }
  return {
    draft: {
      ...existing,
      units: [...existing.units, nextUnit].map((unit, unitIndex) => ({
        ...unit,
        sequence_index: unitIndex + 1,
      })),
    },
  };
}

/** Add a lesson under the "No unit" bucket (create the bucket if needed). */
export function buildDraftWithNoUnitLesson(units) {
  const list = Array.isArray(units) ? units : [];
  const noUnitIndex = list.findIndex((unit) => isNoUnitBucketTitle(unit?.title));
  if (noUnitIndex >= 0) {
    const unitId = list[noUnitIndex]?.id != null
      ? String(list[noUnitIndex].id)
      : `idx-${noUnitIndex}`;
    return buildDraftWithAddedLesson(list, unitId);
  }
  return buildDraftWithAddedUnit(list, {
    includeLesson: true,
    title: NO_UNIT_BUCKET_TITLE,
  });
}

export function buildDraftWithAddedLesson(units, unitId) {
  const draft = draftFromCurriculumStructure({ units });
  if (!draft?.units?.length) {
    return { error: 'No curriculum to update.' };
  }

  const unitIndex = units.findIndex((unit, index) => resolveUnitId(unit, index) === String(unitId));
  if (unitIndex < 0) {
    return { error: 'Unit not found.' };
  }

  const draftUnit = draft.units[unitIndex];
  const nextLessons = [...(draftUnit.lessons || []), defaultLessonDraft(draftUnit.lessons?.length || 0)];
  const nextUnits = draft.units.map((unit, index) => (
    index === unitIndex
      ? {
        ...unit,
        lessons: nextLessons.map((lesson, lessonIndex) => ({
          ...lesson,
          sequence_index: lessonIndex + 1,
        })),
      }
      : unit
  ));

  return { draft: { ...draft, units: nextUnits } };
}

export function buildDraftWithoutUnit(units, unitId) {
  const draft = draftFromCurriculumStructure({ units });
  if (!draft?.units?.length) {
    return { error: 'No curriculum to update.' };
  }

  const unitIndex = units.findIndex((unit, index) => resolveUnitId(unit, index) === String(unitId));
  if (unitIndex < 0) {
    return { error: 'Unit not found.' };
  }

  const nextUnits = draft.units
    .filter((_, index) => index !== unitIndex)
    .map((unit, index) => ({
      ...unit,
      sequence_index: index + 1,
      lessons: (unit.lessons || []).map((le, j) => ({ ...le, sequence_index: j + 1 })),
    }));

  return { draft: { ...draft, units: nextUnits } };
}

async function unlinkEventsFromUnitLessons({ familyId, units, unitId }) {
  const unitIndex = units.findIndex((unit, index) => resolveUnitId(unit, index) === String(unitId));
  if (unitIndex < 0) return;
  const lessons = units[unitIndex]?.lessons || [];
  for (const lesson of lessons) {
    if (lesson?.id != null) {
      await unlinkEventsFromLesson({ familyId, lessonId: lesson.id });
    }
  }
}

export function buildDraftWithRenamedLesson(units, lessonId, newTitle) {
  const draft = draftFromCurriculumStructure({ units });
  if (!draft?.units?.length) {
    return { error: 'No curriculum to update.' };
  }

  const location = findLessonLocation(units, lessonId);
  if (!location) {
    return { error: 'Lesson not found.' };
  }

  const trimmed = String(newTitle || '').trim();
  if (!trimmed) {
    return { error: 'Lesson title is required.' };
  }

  const nextUnits = draft.units.map((unit, unitIndex) => ({
    ...unit,
    lessons: (unit.lessons || []).map((lesson, lessonIndex) => (
      unitIndex === location.unitIndex && lessonIndex === location.lessonIndex
        ? { ...lesson, title: trimmed }
        : lesson
    )),
  }));

  return { draft: { ...draft, units: nextUnits } };
}

export async function saveSubjectCurriculumFromUnits({
  familyId,
  subjectId,
  subjectName,
  units,
}) {
  if (!familyId || !subjectId) {
    throw new Error('Missing subject');
  }

  const draft = draftFromCurriculumStructure({ units });
  if (!draft?.units?.length) {
    throw new Error('No curriculum to save');
  }

  return commitSubjectCurriculumDraft({
    familyId,
    subjectId,
    subjectName,
    draft,
  });
}

function applyLessonTitleToLastLesson(draft, lessonTitle) {
  const title = String(lessonTitle || '').trim();
  if (!title || !draft?.units?.length) return draft;
  const unit = draft.units[draft.units.length - 1];
  const lessons = unit?.lessons || [];
  if (!lessons.length) return draft;
  lessons[lessons.length - 1] = { ...lessons[lessons.length - 1], title };
  return draft;
}

export async function addUnitToSubjectCurriculum({
  familyId,
  subjectId,
  subjectName,
  units,
  lessonTitle = null,
}) {
  if (!familyId || !subjectId) {
    throw new Error('Missing subject');
  }

  const { draft, error } = buildDraftWithAddedUnit(units);
  if (error) throw new Error(error);
  if (!draft) throw new Error('Could not update curriculum');

  return commitSubjectCurriculumDraft({
    familyId,
    subjectId,
    subjectName,
    draft: applyLessonTitleToLastLesson(draft, lessonTitle),
  });
}

export async function addLessonToSubjectCurriculum({
  familyId,
  subjectId,
  subjectName,
  units,
  unitId,
  lessonTitle = null,
}) {
  if (!familyId || !subjectId || unitId == null) {
    throw new Error('Missing subject or unit');
  }

  const { draft, error } = buildDraftWithAddedLesson(units, unitId);
  if (error) throw new Error(error);
  if (!draft) throw new Error('Could not update curriculum');

  const unitIndex = units.findIndex((unit, index) => resolveUnitId(unit, index) === String(unitId));
  if (lessonTitle && unitIndex >= 0 && draft.units?.[unitIndex]?.lessons?.length) {
    const lessons = draft.units[unitIndex].lessons;
    lessons[lessons.length - 1] = {
      ...lessons[lessons.length - 1],
      title: String(lessonTitle).trim(),
    };
  }

  return commitSubjectCurriculumDraft({
    familyId,
    subjectId,
    subjectName,
    draft,
  });
}

export async function renameLessonInSubjectCurriculum({
  familyId,
  subjectId,
  subjectName,
  units,
  lessonId,
  newTitle,
}) {
  if (!familyId || !subjectId || !lessonId) {
    throw new Error('Missing lesson or subject');
  }

  const { draft, error } = buildDraftWithRenamedLesson(units, lessonId, newTitle);
  if (error) throw new Error(error);
  if (!draft) throw new Error('Could not update curriculum');

  return commitSubjectCurriculumDraft({
    familyId,
    subjectId,
    subjectName,
    draft,
  });
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

  return commitSubjectCurriculumDraft({
    familyId,
    subjectId,
    subjectName,
    draft,
  });
}

export async function deleteUnitFromSubjectCurriculum({
  familyId,
  subjectId,
  subjectName,
  units,
  unitId,
}) {
  if (!familyId || !subjectId || unitId == null) {
    throw new Error('Missing unit or subject');
  }

  const { draft, error } = buildDraftWithoutUnit(units, unitId);
  if (error) throw new Error(error);
  if (!draft) throw new Error('Could not update curriculum');

  await unlinkEventsFromUnitLessons({ familyId, units, unitId });

  // Empty draft still commits with replace_existing so the last unit can be cleared.
  return commitSubjectCurriculumDraft({
    familyId,
    subjectId,
    subjectName,
    draft: draft.units?.length ? draft : { title: null, units: [] },
  });
}
