/**
 * Background prefetch for Subject detail → Progress (plan slots + curriculum units).
 * Fills subjectProgressPlanCache so first open of a subject avoids skeleton wait when possible.
 */

import {
  findAcademicYearPlanForSubject,
  buildSubjectPlanSlotLines,
} from './subjectPlanSlotLines';
import { fetchSubjectCurriculumEventsStructure } from './services/curriculumClient';
import {
  getSubjectProgressCache,
  mergeSubjectProgressCache,
} from './subjectProgressPlanCache';

function isProgressCacheComplete(entry) {
  if (!entry) return false;
  return Array.isArray(entry.slotLines) && Array.isArray(entry.curriculumUnits);
}

function dispatchCacheUpdated(familyId, subjectId) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('subjectProgressPlanCacheUpdated', {
      detail: { familyId: String(familyId), subjectId: String(subjectId) },
    })
  );
}

const inflight = new Set();

/**
 * @param {string} familyId
 * @param {string} subjectId
 * @param {string} [subjectName]
 */
export async function prefetchSubjectProgressPlanEntry(familyId, subjectId, subjectName = 'Subject') {
  if (!familyId || subjectId == null || subjectId === '') return;

  const k = `${familyId}|${subjectId}`;
  const existing = getSubjectProgressCache(familyId, subjectId);
  if (isProgressCacheComplete(existing)) {
    return;
  }
  if (inflight.has(k)) {
    return;
  }
  inflight.add(k);

  try {
    const { academicYearId: yid, planData: data } = await findAcademicYearPlanForSubject(
      familyId,
      subjectId
    );
    let slotLines = [];
    if (yid && data) {
      slotLines = buildSubjectPlanSlotLines(yid, data, subjectId, subjectName);
    }
    mergeSubjectProgressCache(familyId, subjectId, {
      academicYearId: yid ?? null,
      planData: data ?? null,
      slotLines,
    });

    const { data: curData, error } = await fetchSubjectCurriculumEventsStructure(
      familyId,
      subjectId,
      yid || null
    );
    const units =
      !error && curData?.units && Array.isArray(curData.units) ? curData.units : [];
    const savedContentSource = !error ? (curData?.saved_content_source ?? null) : null;
    mergeSubjectProgressCache(familyId, subjectId, {
      curriculumUnits: units,
      curriculumSavedContentSource: savedContentSource,
    });

    dispatchCacheUpdated(familyId, subjectId);
  } catch (e) {
    console.warn('[prefetchSubjectProgressPlan]', subjectId, e);
    mergeSubjectProgressCache(familyId, subjectId, {
      academicYearId: null,
      planData: null,
      slotLines: [],
      curriculumUnits: [],
      curriculumSavedContentSource: null,
    });
    dispatchCacheUpdated(familyId, subjectId);
  } finally {
    inflight.delete(k);
  }
}

/**
 * Prefetch Progress data for many subjects with limited concurrency (default 3).
 * @param {string} familyId
 * @param {{ id: string, name?: string }[]} subjects
 * @param {{ concurrency?: number }} [opts]
 */
export async function prefetchAllSubjectProgressPlans(familyId, subjects, opts = {}) {
  const { concurrency = 3 } = opts;
  const list = (subjects || []).filter((s) => s && s.id);
  if (!familyId || list.length === 0) return;

  let index = 0;
  async function worker() {
    while (true) {
      const i = index;
      index += 1;
      if (i >= list.length) break;
      const s = list[i];
      await prefetchSubjectProgressPlanEntry(familyId, s.id, s.name || 'Subject');
    }
  }
  const n = Math.min(concurrency, list.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
}
