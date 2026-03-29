/**
 * Heading for subject plan slots, e.g. "Lilly's plan for Math" or "Lilly and Max's plan for Math & Science".
 * @param {string[]} childFirstNames - First names (or display names) of students attached to the subject/plan
 * @param {string|string[]} subjectNameOrNames - One subject name, or multiple names (joined with " & ")
 * @returns {string}
 */
export function formatSubjectPlanHeading(childFirstNames, subjectNameOrNames) {
  const subjectLabel = (() => {
    if (Array.isArray(subjectNameOrNames)) {
      const parts = subjectNameOrNames.map((s) => String(s || '').trim()).filter(Boolean);
      return parts.length ? parts.join(' & ') : '';
    }
    return String(subjectNameOrNames || '').trim();
  })();
  const subj = subjectLabel || 'this subject';

  const names = Array.isArray(childFirstNames)
    ? childFirstNames.map((n) => String(n || '').trim()).filter(Boolean)
    : [];

  if (names.length === 1 && names[0] === 'Whole family') {
    return `Family plan for ${subj}`;
  }

  let possessive;
  if (names.length === 0) {
    possessive = 'Your';
  } else if (names.length === 1) {
    possessive = `${names[0]}'s`;
  } else if (names.length === 2) {
    possessive = `${names[0]} and ${names[1]}'s`;
  } else {
    possessive = `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}'s`;
  }

  return `${possessive} plan for ${subj}`;
}
