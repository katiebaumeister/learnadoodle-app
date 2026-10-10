/**
 * Launch Doodle from app CTAs with an optional prefilled prompt.
 * Prefers the left Doodle pane; falls back to Search modal event.
 */

import { dispatchOpenSubjectUnitsEditor } from './subjectUnitsEditor';

/**
 * @param {{
 *   prompt?: string|null,
 *   autoSubmit?: boolean,
 *   context?: string|null,
 * }} opts
 */
export function openDoodleWithPrompt(opts = {}) {
  const prompt = typeof opts.prompt === 'string' && opts.prompt.trim()
    ? opts.prompt.trim()
    : null;
  const autoSubmit = opts.autoSubmit !== false && Boolean(prompt);
  const context = opts.context || null;

  if (typeof window === 'undefined') return false;

  window.dispatchEvent(new CustomEvent('openDoodleCommandBar', {
    detail: {
      context,
      initialPrompt: prompt,
      autoSubmit,
    },
  }));
  return true;
}

/**
 * Primary Classwork / Materials CTA — open magic Create step-through wizard.
 */
export function openMagicCreateWizard({
  subjectId,
  subjectName,
  academicYearId = null,
  childIds = [],
  materialId = null,
} = {}) {
  if (!subjectId) return false;
  return dispatchOpenSubjectUnitsEditor({
    subjectId,
    subjectName: subjectName || null,
    academicYearId,
    childIds,
    initialMaterialId: materialId,
    method: 'magic',
    autoContinueOnOpen: false,
    headerTitle: 'Create',
  });
}

/**
 * Open a specific curriculum import method (generate / upload / paste).
 */
export function openBuildFromMaterialEditor({
  subjectId,
  subjectName,
  academicYearId = null,
  materialId = null,
  childIds = [],
  method = 'upload',
  autoContinueOnOpen,
  headerTitle = null,
  withDates = false,
} = {}) {
  if (!subjectId) return false;
  return dispatchOpenSubjectUnitsEditor({
    subjectId,
    subjectName: subjectName || null,
    academicYearId,
    initialMaterialId: materialId,
    childIds,
    method,
    autoContinueOnOpen: autoContinueOnOpen === true || (autoContinueOnOpen !== false && Boolean(materialId)),
    headerTitle,
    withDates,
  });
}

/** Doodle prompt for units/lessons from material (when not opening the import modal directly). */
export function buildFromMaterialPrompt({ subjectName, childName, materialTitle } = {}) {
  const parts = ['Build units and lessons'];
  if (subjectName) parts.push(`for ${subjectName}`);
  if (materialTitle) parts.push(`from “${materialTitle}”`);
  else parts.push('from this material');
  if (childName) parts.push(`for ${childName}`);
  return parts.join(' ');
}

export function quizFromMaterialPrompt({ subjectName, childName, materialTitle } = {}) {
  const subj = subjectName ? ` ${subjectName}` : '';
  const who = childName ? ` for ${childName}` : '';
  const mat = materialTitle ? ` based on material “${materialTitle}”` : ' based on this material';
  return `Create an assignment${subj}${who}${mat}`;
}

export function lessonFromVideoPrompt({ subjectName, childName, url } = {}) {
  const subj = subjectName ? ` for ${subjectName}` : '';
  const who = childName ? ` for ${childName}` : '';
  const link = url ? ` ${url}` : ' this YouTube video';
  return `Build a lesson around${link}${subj}${who}`.replace(/\s+/g, ' ').trim();
}

export function themeWeekPrompt({ theme = 'ocean', childName } = {}) {
  const who = childName ? ` for ${childName}` : '';
  return `Plan a ${theme}-themed project week${who}`;
}

export function packWeekPrompt({ childName } = {}) {
  const who = childName ? ` for ${childName}` : '';
  return `Plan my week${who}`;
}

export function portfolioOrganizePrompt({ childName } = {}) {
  const who = childName ? ` for ${childName}` : '';
  return `Organize portfolio evidence${who}`;
}

export function adaptivePracticePrompt({ childName, subjectName } = {}) {
  const who = childName ? ` for ${childName}` : '';
  const subj = subjectName ? ` on ${subjectName}` : '';
  return `Adaptive practice${subj}${who}`;
}
