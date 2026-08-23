export function getCurrentSchoolYearLabel(refDate = new Date()) {
  const month = refDate.getMonth() + 1;
  const startYear = month >= 8 ? refDate.getFullYear() : refDate.getFullYear() - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

export function resolveSubjectSchoolYearLabel(subject) {
  const raw = String(subject?.school_year || '').trim();
  return raw || '2025/26';
}

/** Prefer subjects in the active school year; fall back to all if none match. */
export function filterSubjectsForSchoolYear(subjects, schoolYearLabel) {
  const target = String(schoolYearLabel || '').trim() || getCurrentSchoolYearLabel();
  const filtered = (subjects || []).filter(
    (subject) => resolveSubjectSchoolYearLabel(subject) === target,
  );
  return filtered.length ? filtered : (subjects || []);
}
