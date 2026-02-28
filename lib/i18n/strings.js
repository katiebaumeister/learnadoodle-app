/**
 * Curriculum & planning copy — dot-path access and {param} interpolation.
 * Source: lib/constants/curriculumPlanningCopy.json
 * Use t('planMyYear.modal.title') or t('planMyYear.toasts.generatedWithCounts', { count: 128 })
 */

import COPY from '../constants/curriculumPlanningCopy.json';

export const STRINGS = COPY;

function getByPath(obj, path) {
  if (!path || typeof path !== 'string') return undefined;
  return path.split('.').reduce((acc, key) => (acc != null && typeof acc === 'object' ? acc[key] : undefined), obj);
}

function interpolate(template, params) {
  if (!template || typeof template !== 'string') return template;
  if (!params || typeof params !== 'object') return template;
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    const v = params[key];
    return v === undefined || v === null ? `{${key}}` : String(v);
  });
}

/**
 * Get string at dot-path and optionally interpolate {key} placeholders.
 * @param {string} path - e.g. 'planMyYear.modal.title', 'planMyYear.toasts.generatedWithCounts'
 * @param {Record<string, string|number>} [params] - e.g. { count: 128 }
 * @returns {string}
 */
export function t(path, params) {
  const raw = getByPath(COPY, path);
  if (typeof raw !== 'string') return path;
  return interpolate(raw, params);
}

/**
 * Get raw string at dot-path (no interpolation).
 */
export function s(path) {
  const raw = getByPath(COPY, path);
  return typeof raw === 'string' ? raw : path;
}
