/**
 * In-memory stale-while-revalidate cache for Subject detail → Progress (plan + curriculum units).
 * Keyed by family + subject. Invalidate when plan is deleted or when external callers need a hard reset.
 */

const cache = new Map();

function key(familyId, subjectId) {
  return `${String(familyId)}|${String(subjectId)}`;
}

/**
 * @returns {null | {
 *   academicYearId: string | null,
 *   planData: object | null,
 *   slotLines: Array,
 *   curriculumUnits: Array,
 *   updatedAt?: number
 * }}
 */
export function getSubjectProgressCache(familyId, subjectId) {
  if (!familyId || subjectId == null || subjectId === '') return null;
  return cache.get(key(familyId, subjectId)) ?? null;
}

/** Merge partial fields into the entry for this subject (last write wins per field). */
export function mergeSubjectProgressCache(familyId, subjectId, partial) {
  if (!familyId || subjectId == null || subjectId === '') return;
  const k = key(familyId, subjectId);
  const prev = cache.get(k) || {};
  cache.set(k, {
    ...prev,
    ...partial,
    updatedAt: Date.now(),
  });
}

export function invalidateSubjectProgressCache(familyId, subjectId) {
  if (!familyId || subjectId == null || subjectId === '') return;
  cache.delete(key(familyId, subjectId));
}

/** Clear all Progress cache rows for a family (e.g. family switch). */
export function invalidateSubjectProgressCacheForFamily(familyId) {
  if (!familyId) return;
  const prefix = `${String(familyId)}|`;
  for (const k of [...cache.keys()]) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}
