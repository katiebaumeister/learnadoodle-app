export function mapStoredLessonTypeToManualBuilder(type) {
  const raw = String(type || 'lesson').trim().toLowerCase();
  if (raw === 'assessment' || raw === 'exam') return 'exam';
  if (raw === 'quiz') return 'exam';
  if (['lesson', 'project', 'assignment', 'activity'].includes(raw)) return raw;
  return 'lesson';
}

function tempId(prefix = 'temp') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function draftFromCurriculumStructure(struct) {
  const units = Array.isArray(struct?.units) ? struct.units : [];
  if (!units.length) return null;
  return {
    title: null,
    units: units.map((unit, unitIndex) => ({
      temp_id: unit?.id ? `existing-u-${unit.id}` : tempId('u'),
      title: String(unit?.title || '').trim() || `Unit ${unitIndex + 1}`,
      description: null,
      sequence_index: unitIndex + 1,
      inferred: false,
      lessons: (unit?.lessons || []).map((lesson, lessonIndex) => {
        const cadence = lesson?.cadence_metadata && typeof lesson.cadence_metadata === 'object'
          ? lesson.cadence_metadata
          : {};
        const referenceDate = lesson?.date
          || cadence?.reference_date
          || null;
        return {
          temp_id: lesson?.id ? `existing-l-${lesson.id}` : tempId('l'),
          title: String(lesson?.title || '').trim() || `Lesson ${lessonIndex + 1}`,
          objective: lesson?.objective || null,
          notes: lesson?.notes || null,
          sequence_index: lessonIndex + 1,
          minutes_est: typeof lesson?.minutes === 'number' ? lesson.minutes : (lesson?.minutes_est ?? 60),
          modality: lesson?.modality || null,
          lesson_type: mapStoredLessonTypeToManualBuilder(lesson?.type || lesson?.lesson_type),
          materials: lesson?.materials || null,
          is_placeholder: !!lesson?.is_placeholder,
          cadence_metadata: cadence,
          reference_date: referenceDate,
        };
      }),
    })),
  };
}

export function curriculumStructureHasContent(struct) {
  const units = Array.isArray(struct?.units) ? struct.units : [];
  return units.some((unit) => (unit?.lessons || []).length > 0 || String(unit?.title || '').trim());
}

function idFromDraftTempId(tempId, prefix) {
  const raw = String(tempId || '').trim();
  if (!raw) return null;
  const existingPrefix = `existing-${prefix}-`;
  if (raw.startsWith(existingPrefix)) return raw.slice(existingPrefix.length);
  return raw;
}

/** Convert editor draft back to curriculum units for optimistic classwork UI. */
export function unitsFromCurriculumDraft(draft) {
  const units = Array.isArray(draft?.units) ? draft.units : [];
  return units.map((unit, unitIndex) => ({
    id: idFromDraftTempId(unit?.temp_id, 'u') || `idx-${unitIndex}`,
    title: String(unit?.title || '').trim() || `Unit ${unitIndex + 1}`,
    lessons: (unit?.lessons || []).map((lesson, lessonIndex) => ({
      id: idFromDraftTempId(lesson?.temp_id, 'l') || `lesson-${unitIndex}-${lessonIndex}`,
      title: String(lesson?.title || '').trim() || `Lesson ${lessonIndex + 1}`,
    })),
  }));
}
