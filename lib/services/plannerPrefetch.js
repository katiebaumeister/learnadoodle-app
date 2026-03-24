/**
 * Background prefetch for planner views: week offline cache, tasks backlog/trash, attendance year bundle.
 * Adjacent months are prefetched by WebContent via refreshCalendarData(..., { background: true }).
 */
import { supabase } from '../supabase';
import {
  setAcademicYearsPickerCache,
  mergePlanEditListTimesCache,
  mergePlanYearFullDataCache,
  getPlanBlocksTimesSummary,
} from '../planEditListCache';
import { getAcademicYear } from './academicYearClient';
import * as offlineStorage from './offlineStorage';
import { getAttendanceLogs } from './recordsClient';

function startOfWeekSunday(d) {
  const x = new Date(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function getLocalDateString(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateStringToDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return new Date();
  return new Date(`${ymd}T12:00:00`);
}

function getDefaultYearRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = month >= 8 ? new Date(year, 7, 1) : new Date(year - 1, 8, 1);
  const end = month >= 8 ? new Date(year + 1, 5, 30) : new Date(year, 5, 30);
  return { start, end };
}

export async function prefetchWeekViewIntoOffline(familyId, anchorDate = new Date()) {
  if (!familyId) return;
  if (typeof window === 'undefined' || !window.indexedDB) return;
  try {
    const weekStart = startOfWeekSunday(anchorDate instanceof Date ? anchorDate : new Date(anchorDate));
    const from = getLocalDateString(weekStart);
    const to = getLocalDateString(addDays(weekStart, 7));
    const { data: res, error } = await supabase.rpc('get_week_view', {
      _family_id: familyId,
      _from: from,
      _to: to,
      _child_ids: null,
    });
    if (error || !res?.events) return;
    for (const event of res.events) {
      await offlineStorage.storeEvent({ ...event, family_id: familyId }, { sync_status: 'synced' });
    }
  } catch (_) {
    /* ignore prefetch errors */
  }
}

export async function prefetchBacklogAndTrash(familyId) {
  if (!familyId) return { backlog: [], trash: [] };
  try {
    const [backlogRes, trashRes] = await Promise.all([
      supabase
        .from('events')
        .select('*')
        .eq('is_backlog', true)
        .neq('status', 'done')
        .neq('status', 'canceled')
        .is('canceled_at', null)
        .is('deleted_at', null)
        .eq('family_id', familyId)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('events')
        .select('*')
        .not('deleted_at', 'is', null)
        .eq('family_id', familyId)
        .order('deleted_at', { ascending: false })
        .limit(100),
    ]);
    return {
      backlog: backlogRes.data || [],
      trash: trashRes.data || [],
    };
  } catch (_) {
    return { backlog: [], trash: [] };
  }
}

/**
 * Matches AttendanceView’s academic-year (or default) range plus logs + instructional-range events.
 */
export async function prefetchPlannerAttendanceSnapshot(familyId, childrenList = []) {
  if (!familyId) return null;
  const childIds = (childrenList || []).map((c) => c.id).filter(Boolean);
  try {
    const { data: years } = await supabase
      .from('academic_years')
      .select('id, year_name, start_date, end_date')
      .eq('family_id', familyId)
      .order('start_date', { ascending: false })
      .limit(1);

    const defaultRange = getDefaultYearRange();
    let rangeStart;
    let rangeEnd;
    let academicYear = null;
    if (years?.[0]) {
      const ay = years[0];
      academicYear = ay;
      const ayStart = new Date(`${ay.start_date}T12:00:00`);
      const ayEnd = new Date(`${ay.end_date}T12:00:00`);
      rangeStart = new Date(ayStart.getFullYear(), ayStart.getMonth(), 1);
      rangeEnd = ayEnd;
    } else {
      rangeStart = defaultRange.start;
      rangeEnd = defaultRange.end;
    }

    const yearStartKey = toLocalYYYYMMDD(rangeStart);
    const yearEndKey = toLocalYYYYMMDD(rangeEnd);
    const fetchStart = dateStringToDate(yearStartKey);
    const fetchEnd = dateStringToDate(yearEndKey);

    const [logs, eventsRes] = await Promise.all([
      getAttendanceLogs(familyId, childIds.length ? childIds : null, { start: yearStartKey, end: yearEndKey }),
      supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .gte('start_ts', fetchStart.toISOString())
        .lte('start_ts', fetchEnd.toISOString())
        .neq('status', 'canceled')
        .is('deleted_at', null)
        .order('start_ts', { ascending: true }),
    ]);

    return {
      familyId,
      childCount: childrenList.length,
      academicYear,
      yearRange: { start: rangeStart, end: rangeEnd },
      yearStartKey,
      yearEndKey,
      attendanceRecords: logs || [],
      yearEvents: eventsRes?.data || [],
    };
  } catch (_) {
    return null;
  }
}

/**
 * Warm Edit plan list caches (academic year rows + instructional time sublines) on initial load
 * so the first open of Edit plan shows times without waiting on extra round trips.
 */
export async function prefetchPlanEditListForFamily(familyId) {
  if (!familyId) return;
  try {
    const { data: rows, error } = await supabase
      .from('academic_years')
      .select('id, year_name, start_date, end_date, updated_at')
      .eq('family_id', familyId)
      .order('start_date', { ascending: false });
    if (error) return;
    const next = Array.isArray(rows) ? rows : [];
    setAcademicYearsPickerCache(familyId, next);
    if (next.length === 0) return;
    const ids = next.map((r) => r.id).filter(Boolean);
    const pairs = await Promise.all(
      ids.map(async (id) => {
        try {
          const { data } = await getAcademicYear(id);
          if (data) mergePlanYearFullDataCache(familyId, id, data);
          const s = data ? getPlanBlocksTimesSummary(data) : '';
          return s ? [id, s] : null;
        } catch {
          return null;
        }
      })
    );
    const partial = Object.fromEntries(pairs.filter(Boolean));
    if (Object.keys(partial).length > 0) {
      mergePlanEditListTimesCache(familyId, partial);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('planEditListPrefetchComplete', { detail: { familyId } }));
    }
  } catch (_) {
    /* non-blocking */
  }
}
