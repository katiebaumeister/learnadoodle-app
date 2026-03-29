/**
 * Subject detail lists materials by subject_id OR subject_key (name). Library delete/restore must refresh
 * every subject row that could show the material — not only when subject_id is set.
 */

/**
 * @param {object} materialRow - materials row (subject_id, subject_key)
 * @param {{ id: string, name?: string }[]} subjectList
 * @returns {string[]} distinct subject ids
 */
export function getSubjectIdsAffectedByMaterial(materialRow, subjectList) {
  const ids = new Set();
  if (materialRow?.subject_id != null && String(materialRow.subject_id).trim() !== '') {
    ids.add(String(materialRow.subject_id));
  }
  const raw = (materialRow?.subject_key || '').trim();
  const list = Array.isArray(subjectList) ? subjectList : [];
  if (!raw || list.length === 0) return [...ids];
  const parts = raw.split(/[,&]|(?:\s+and\s+)/i).map((p) => p.trim()).filter(Boolean);
  const names = parts.length ? parts : [raw];
  const byLower = new Map();
  for (const s of list) {
    if (s?.id == null || !s?.name) continue;
    byLower.set(String(s.name).trim().toLowerCase(), String(s.id));
  }
  for (const n of names) {
    const id = byLower.get(n.toLowerCase());
    if (id) ids.add(id);
  }
  return [...ids];
}
