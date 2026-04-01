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

function mergeAcademicYearPickerRowFromFullData(familyId, yearId, data) {
  if (!familyId || !yearId || !data) return;
  if (academicYearsPickerCache.familyId !== familyId || !Array.isArray(academicYearsPickerCache.rows)) return;
  const idx = academicYearsPickerCache.rows.findIndex((row) => row && String(row.id) === String(yearId));
  if (idx === -1) return;
  const existing = academicYearsPickerCache.rows[idx] || {};
  academicYearsPickerCache.rows[idx] = {
    ...existing,
    id: yearId,
    year_name: data.year_name ?? existing.year_name,
    start_date: data.start_date ?? data.plan?.start_date ?? existing.start_date,
    end_date: data.end_date ?? data.plan?.end_date ?? existing.end_date,
    updated_at: data.updated_at ?? data.plan?.updated_at ?? existing.updated_at,
  };
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

/** Full `getAcademicYear` payloads for instant plan summary + edit logistics (warmed on app/planner load). */
let planYearFullDataCache = { familyId: null, byYearId: {} };

export function mergePlanYearFullDataCache(familyId, yearId, data) {
  if (!familyId || !yearId || !data) return;
  if (planYearFullDataCache.familyId !== familyId) {
    planYearFullDataCache = { familyId, byYearId: {} };
  }
  planYearFullDataCache.byYearId[yearId] = data;
  mergeAcademicYearPickerRowFromFullData(familyId, yearId, data);
}

export function getPlanYearFullDataFromCache(familyId, yearId) {
  if (!familyId || !yearId) return null;
  if (planYearFullDataCache.familyId !== familyId) return null;
  return planYearFullDataCache.byYearId[yearId] || null;
}

/** Drop one year's full payload so the next open/summary fetch hits the server (after plan or curriculum changes). */
export function dropPlanYearFullDataCacheEntry(familyId, yearId) {
  if (!familyId || !yearId) return;
  if (planYearFullDataCache.familyId !== familyId) return;
  delete planYearFullDataCache.byYearId[yearId];
}

/** After subject delete or other family-wide plan changes: force all Edit plan / summary fetches to hit the server. */
export function dropAllPlanYearCachesForFamily(familyId) {
  if (!familyId) return;
  if (planYearFullDataCache.familyId === familyId) {
    planYearFullDataCache.byYearId = {};
  }
  if (planEditListTimesCache.familyId === familyId) {
    planEditListTimesCache.byYearId = {};
  }
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

const WEEKDAY_SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatWeekdayCadence(weekdays) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) return '';
  const labels = [...new Set(
    weekdays
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_SHORT_LABELS[d])
      .filter(Boolean)
  )];
  if (labels.length === 0) return '';
  if (labels.length <= 3) return labels.join('/');
  return `${labels.length} days`;
}

/** One-line summary of instructional block times for Edit plan list (under date range). */
export function getPlanBlocksTimesSummary(academicYearData) {
  const blocks = academicYearData?.plan?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  const labels = blocks.map((b) => {
    const weekdayLabel = formatWeekdayCadence(b?.weekdays);
    const timeLabel = b?.all_day ? 'All day' : formatTimeRange(b?.start_time, b?.end_time);
    if (weekdayLabel && timeLabel) return `${weekdayLabel} ${timeLabel}`;
    return weekdayLabel || timeLabel;
  });
  const unique = [...new Set(labels.filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return unique.join(' · ');
  return `${unique.length} time windows`;
}
