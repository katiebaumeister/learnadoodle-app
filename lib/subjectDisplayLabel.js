/**
 * Disambiguate subject display names only when needed.
 * e.g. unique → "Math"; cross-year → "Math - 26/27"; same year, different kids → "Math - Lilly"
 */
import { parseChildIds } from './services/subjectsClient.js';

function normalizeName(name) {
  return String(name || '').trim().toLowerCase() || 'subject';
}

export function shortSchoolYearLabel(year) {
  const raw = String(year || '').trim();
  const m = raw.match(/^(\d{2})?(\d{2})\/(\d{2})$/);
  if (m) return `${m[2]}/${m[3]}`;
  if (/^\d{2}\/\d{2}$/.test(raw)) return raw;
  return raw || null;
}

function resolveYear(subject) {
  const raw = subject?.school_year ?? subject?.schoolYear ?? null;
  const s = String(raw || '').trim();
  return s || null;
}

function childIdsForSubject(subject) {
  if (Array.isArray(subject?.assignedChildren) && subject.assignedChildren.length) {
    return subject.assignedChildren.map(String).filter(Boolean);
  }
  return parseChildIds(subject?.child_id ?? '').map(String);
}

function childLabelForSubject(subject, childNameById) {
  const ids = childIdsForSubject(subject);
  if (!ids.length) return null;
  const names = ids
    .map((id) => childNameById.get(String(id)))
    .filter(Boolean);
  if (!names.length) return null;
  return names.join(', ');
}

/**
 * @param {Array<object>} subjects
 * @param {{ children?: Array<{id:string, first_name?:string, name?:string}> }} [opts]
 * @returns {Map<string, string>} subjectId → display label
 */
export function buildSubjectDisplayLabels(subjects, opts = {}) {
  const list = Array.isArray(subjects) ? subjects : [];
  const children = Array.isArray(opts.children) ? opts.children : [];
  const childNameById = new Map();
  children.forEach((c) => {
    const id = c?.id != null ? String(c.id) : '';
    if (!id) return;
    const name = String(c.first_name || c.name || '').trim();
    if (name) childNameById.set(id, name);
  });

  const byName = new Map();
  list.forEach((subject) => {
    if (!subject?.id) return;
    const key = normalizeName(subject.name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(subject);
  });

  const labels = new Map();

  byName.forEach((group) => {
    if (group.length === 1) {
      const s = group[0];
      labels.set(String(s.id), String(s.name || 'Subject').trim() || 'Subject');
      return;
    }

    const years = group.map(resolveYear).filter(Boolean);
    const distinctYears = new Set(years);
    const useYear = distinctYears.size > 1;

    const tentative = new Map();
    group.forEach((s) => {
      const base = String(s.name || 'Subject').trim() || 'Subject';
      const year = resolveYear(s);
      const short = year ? shortSchoolYearLabel(year) : null;
      const label = useYear && short ? `${base} - ${short}` : base;
      tentative.set(String(s.id), label);
    });

    const byTentative = new Map();
    tentative.forEach((label, id) => {
      if (!byTentative.has(label)) byTentative.set(label, []);
      byTentative.get(label).push(id);
    });

    byTentative.forEach((ids, label) => {
      if (ids.length === 1) {
        labels.set(ids[0], label);
        return;
      }
      const childLabels = ids.map((id) => {
        const subject = group.find((s) => String(s.id) === id);
        return childLabelForSubject(subject, childNameById);
      });
      const distinctChildren = new Set(childLabels.filter(Boolean));
      const useChild = distinctChildren.size > 1;
      ids.forEach((id, idx) => {
        const childBit = useChild ? childLabels[idx] : null;
        labels.set(id, childBit ? `${label} - ${childBit}` : label);
      });
    });
  });

  return labels;
}

/** Convenience: label for one subject given the full peer set. */
export function getSubjectDisplayLabel(subject, subjects, opts = {}) {
  if (!subject?.id) return String(subject?.name || 'Subject').trim() || 'Subject';
  const map = buildSubjectDisplayLabels(subjects || [subject], opts);
  return map.get(String(subject.id)) || String(subject.name || 'Subject').trim() || 'Subject';
}
