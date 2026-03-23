/**
 * Shared caches for Edit plan list: academic year rows + time sublines.
 * Warmed on app load (prefetch) and kept in sync by PlanYearModal.
 */

let academicYearsPickerCache = { familyId: null, rows: null };

export function getAcademicYearsPickerCache(familyId) {
  if (!familyId || academicYearsPickerCache.familyId !== familyId) return null;
  if (!Array.isArray(academicYearsPickerCache.rows)) return null;
  return academicYearsPickerCache.rows;
}

export function setAcademicYearsPickerCache(familyId, rows) {
  academicYearsPickerCache.familyId = familyId;
  academicYearsPickerCache.rows = Array.isArray(rows) ? rows : [];
}

let planEditListTimesCache = { familyId: null, byYearId: {} };

export function getPlanEditListTimesForPlans(familyId, planRows) {
  if (!familyId || !Array.isArray(planRows) || planRows.length === 0) return {};
  if (planEditListTimesCache.familyId !== familyId) return {};
  const out = {};
  planRows.forEach((p) => {
    const id = p?.id;
    const line = id && planEditListTimesCache.byYearId[id];
    if (line) out[id] = line;
  });
  return out;
}

export function mergePlanEditListTimesCache(familyId, partial) {
  if (!familyId || !partial || typeof partial !== 'object') return;
  if (planEditListTimesCache.familyId !== familyId) {
    planEditListTimesCache = { familyId, byYearId: {} };
  }
  Object.keys(partial).forEach((k) => {
    if (partial[k]) planEditListTimesCache.byYearId[k] = partial[k];
  });
}

export function dropPlanEditListTimesCacheEntry(familyId, yearId) {
  if (planEditListTimesCache.familyId !== familyId || !yearId) return;
  delete planEditListTimesCache.byYearId[yearId];
}

/** "09:00" / "10:00" -> "9am–10am" */
export function formatTimeRange(startTime, endTime) {
  const parse = (s) => {
    if (!s || typeof s !== 'string') return { h: 9, m: 0 };
    const parts = s.trim().split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1] ? parseInt(parts[1].replace(/\D/g, ''), 10) : 0;
    return { h: Number.isNaN(h) ? 9 : Math.max(0, Math.min(23, h)), m: Number.isNaN(m) ? 0 : Math.max(0, Math.min(59, m)) };
  };
  const start = parse(startTime || '09:00');
  const end = parse(endTime || '10:00');
  const fmt = (t) => {
    if (t.m === 0) return t.h === 12 ? '12pm' : t.h === 0 ? '12am' : t.h < 12 ? `${t.h}am` : `${t.h - 12}pm`;
    return t.h === 12
      ? `12:${String(t.m).padStart(2, '0')}pm`
      : t.h === 0
        ? `12:${String(t.m).padStart(2, '0')}am`
        : t.h < 12
          ? `${t.h}:${String(t.m).padStart(2, '0')}am`
          : `${t.h - 12}:${String(t.m).padStart(2, '0')}pm`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

/** One-line summary of instructional block times for Edit plan list (under date range). */
export function getPlanBlocksTimesSummary(academicYearData) {
  const blocks = academicYearData?.plan?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  const labels = blocks.map((b) => {
    if (b?.all_day) return 'All day';
    return formatTimeRange(b?.start_time, b?.end_time);
  });
  const unique = [...new Set(labels.filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return unique.join(' · ');
  return `${unique.length} time windows`;
}
