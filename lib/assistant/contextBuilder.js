/**
 * Builds a compressed, semantic family context for the assistant.
 * Smaller prompts, fewer hallucinations, easier reasoning.
 */

import { getSubjectsWithOverview } from '../services/subjectsClient.js';

/**
 * @param {string} familyId
 * @param {Object} rawContext - from getFamilyContext: children, subjects, subjectTracks, activities, academicYear
 * @returns {Promise<Object>} compressed context
 */
export async function buildCompressedContext(familyId, rawContext) {
  const { children = [], subjects = [], academicYear } = rawContext;
  const familyName = 'Your family'; // could come from profile later

  const childrenSummary = await Promise.all(
    (children || []).map(async (child) => {
      let subjectProgress = [];
      try {
        const subs = await getSubjectsWithOverview(familyId, child.id, null);
        subjectProgress = (subs || [])
          .filter((s) => s.progressPercent != null && !Number.isNaN(s.progressPercent))
          .map((s) => ({
            name: s.name || s.subject_name || 'Subject',
            progress: Math.round(s.progressPercent),
          }))
          .slice(0, 20);
      } catch {
        // keep empty
      }
      return {
        id: child.id,
        name: child.first_name || 'Child',
        grade: child.grade,
        subjects: subjectProgress,
      };
    })
  );

  const academicYearLabel = academicYear?.label || academicYear?.school_year || null;

  return {
    family: familyName,
    children: childrenSummary,
    academic_year: academicYearLabel,
    total_subjects: (subjects || []).length,
  };
}

/**
 * Serialize compressed context for inclusion in a system prompt.
 */
export function formatContextForPrompt(compressed) {
  const lines = [
    `Family: ${compressed.family}`,
    `Academic year: ${compressed.academic_year || 'Not set'}`,
    '',
    'Children:',
  ];
  for (const c of compressed.children || []) {
    lines.push(`  - ${c.name} (grade ${c.grade})`);
    if (c.subjects?.length) {
      lines.push(`    Subjects: ${c.subjects.map((s) => `${s.name}: ${s.progress}%`).join(', ')}`);
    }
  }
  return lines.join('\n');
}
