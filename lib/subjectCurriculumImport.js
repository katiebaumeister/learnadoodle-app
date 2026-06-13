export function manualDraftFromGeneratedDraft(draft) {
  const units = Array.isArray(draft?.units) ? draft.units : [];
  const seed = Date.now();
  return {
    title:
      draft?.course_title != null && String(draft.course_title).trim() !== ''
        ? String(draft.course_title).trim()
        : null,
    units: units.map((u, ui) => ({
      temp_id: `gen-u-${seed}-${ui}`,
      title: (u?.title != null && String(u.title).trim() !== '') ? String(u.title).trim() : `Unit ${ui + 1}`,
      sequence_index: ui + 1,
      description:
        u?.description != null && String(u.description).trim() !== ''
          ? String(u.description).trim()
          : null,
      inferred: true,
      lessons: (Array.isArray(u?.lessons) ? u.lessons : []).map((le, li) => {
        const rawType = String(le?.lesson_type || '').trim().toLowerCase();
        const normalizedType =
          rawType === 'quiz' || rawType === 'assessment'
            ? 'exam'
            : ['lesson', 'assignment', 'project', 'exam', 'review', 'activity', 'reading', 'lab', 'placeholder'].includes(rawType)
              ? rawType
              : (le?.assessment_idea ? 'exam' : 'lesson');
        const rawMinutes = Number(le?.minutes_est);
        return {
          temp_id: `gen-l-${seed}-${ui}-${li}`,
          title:
            le?.title != null && String(le.title).trim() !== ''
              ? String(le.title).trim()
              : `Lesson ${li + 1}`,
          objective:
            le?.objective != null && String(le.objective).trim() !== ''
              ? String(le.objective).trim()
              : null,
          notes:
            le?.notes != null && String(le.notes).trim() !== ''
              ? String(le.notes).trim()
              : (le?.assessment_idea != null && String(le.assessment_idea).trim() !== ''
                ? String(le.assessment_idea).trim()
                : null),
          lesson_type: normalizedType,
          sequence_index: li + 1,
          minutes_est: Number.isFinite(rawMinutes) ? Math.max(1, Math.round(rawMinutes)) : 60,
          reference_date: null,
        };
      }),
    })),
  };
}

export function summarizeDraftUnits(draft) {
  const units = Array.isArray(draft?.units) ? draft.units : [];
  const lessonCount = units.reduce((sum, unit) => sum + ((unit?.lessons || []).length || 0), 0);
  return {
    unitCount: units.length,
    lessonCount,
    lines: units.map((unit) => {
      const title = String(unit?.title || 'Unit').trim();
      const count = (unit?.lessons || []).length;
      return `${title} (${count} ${count === 1 ? 'lesson' : 'lessons'})`;
    }),
  };
}
