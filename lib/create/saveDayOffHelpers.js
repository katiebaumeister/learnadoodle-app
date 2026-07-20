import {
  addExclusion,
  updateExclusion,
  deleteExclusion,
} from '../services/plannerSettingsClient';
import { supabase } from '../supabase';
import { toYmd } from './eventTimeUtils';

const DAY_OFF_EXCLUSION_TYPES = [
  'holiday',
  'break',
  'day_off',
  'dayoff',
  'day-off',
  'no_school',
  'custom_holiday',
  'custom_break',
];

export function normalizeDayOffExclusionType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'break' || raw === 'custom_break') return 'break';
  if (
    raw === 'holiday'
    || raw === 'custom_holiday'
    || raw === 'day_off'
    || raw === 'dayoff'
    || raw === 'day-off'
    || raw === 'no_school'
  ) {
    return 'holiday';
  }
  return raw;
}

/** Match a planner day-off chip to its planner_exclusions row (prefer exclusion_id). */
export function matchPlannerExclusionForDayOffEvent(event, exclusions = []) {
  if (!event || !Array.isArray(exclusions) || exclusions.length === 0) return null;

  const exclusionId = event.exclusion_id || event.exclusionId || event?.data?.exclusion_id;
  if (exclusionId) {
    const byId = exclusions.find((row) => String(row?.id) === String(exclusionId));
    if (byId) return byId;
  }

  const targetDate = String(event.date_local || event.date || '').slice(0, 10)
    || String(event.start_ts || event.start || '').slice(0, 10);
  if (!targetDate) return null;

  const holidayType = String(event.holiday_type || event.holidayType || '').toUpperCase();
  const eventType = String(event.event_type || event.type || '').trim().toLowerCase();
  const targetType = (
    holidayType === 'CUSTOM_BREAK' || eventType === 'break'
  ) ? 'break' : 'holiday';
  const targetLabel = String(event.title || event.name || event.label || '').trim().toLowerCase();

  const covering = exclusions.filter((row) => {
    if (normalizeDayOffExclusionType(row?.exclusion_type) !== targetType) return false;
    const start = String(row?.start_date || '').slice(0, 10);
    const end = String(row?.end_date || row?.start_date || '').slice(0, 10);
    return start && end && start <= targetDate && end >= targetDate;
  });
  if (!covering.length) return null;
  if (targetLabel) {
    const labelMatched = covering.find(
      (row) => String(row?.label || '').trim().toLowerCase() === targetLabel,
    );
    if (labelMatched) return labelMatched;
  }
  return covering[0];
}

/** Fetch the planner_exclusions row for a synthetic day-off / break chip. */
export async function fetchPlannerExclusionForDayOffEvent(event, familyId) {
  const targetDate = String(event?.date_local || event?.date || '').slice(0, 10)
    || String(event?.start_ts || event?.start || '').slice(0, 10);
  if (!familyId || !targetDate) return null;

  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  const eventType = String(event?.event_type || event?.type || '').trim().toLowerCase();
  const targetType = (
    holidayType === 'CUSTOM_BREAK' || eventType === 'break'
  ) ? 'break' : 'holiday';
  const targetLabel = String(event?.title || event?.name || event?.label || '').trim().toLowerCase();

  const { data, error } = await supabase
    .from('planner_exclusions')
    .select('id, exclusion_type, start_date, end_date, label')
    .eq('family_id', familyId)
    .eq('scope_type', 'family_default')
    .or('is_active.is.true,is_active.is.null')
    .in('exclusion_type', DAY_OFF_EXCLUSION_TYPES)
    .lte('start_date', targetDate)
    .gte('end_date', targetDate);
  if (error) return null;

  const rows = Array.isArray(data) ? data : [];
  const typedRows = rows.filter(
    (row) => normalizeDayOffExclusionType(row?.exclusion_type) === targetType,
  );
  if (targetLabel) {
    const labelMatched = typedRows.find(
      (row) => String(row?.label || '').trim().toLowerCase() === targetLabel,
    );
    if (labelMatched) return labelMatched;
  }
  return typedRows[0] || null;
}

export function dayOffRowFromExclusion(exclusion) {
  if (!exclusion?.id) return null;
  const start = toYmd(exclusion.start_date);
  const end = toYmd(exclusion.end_date) || start;
  const isBreak = exclusion.exclusion_type === 'break' || (start && end && start !== end);
  return {
    id: exclusion.id,
    kind: isBreak ? 'break' : 'holiday',
    name: exclusion.label || '',
    start,
    end,
  };
}

export function dayOffFormFromRow(row) {
  if (!row) {
    return {
      editId: null,
      editKind: null,
      title: '',
      startDate: new Date(),
      endDate: null,
    };
  }
  const startDate = row.start ? new Date(`${row.start}T12:00:00`) : new Date();
  const endDate = row.end && row.end !== row.start ? new Date(`${row.end}T12:00:00`) : null;
  return {
    editId: row.id,
    editKind: row.kind,
    title: row.name || '',
    startDate,
    endDate,
  };
}

function resolveExclusionType(startYmd, endYmd) {
  return startYmd === endYmd ? 'holiday' : 'break';
}

export async function saveDayOff({
  familyId,
  schoolYearLabel,
  title,
  startDate,
  endDate = null,
  editRow = null,
}) {
  if (!familyId) throw new Error('Family is required');
  const startYmd = toYmd(startDate);
  if (!startYmd) throw new Error('Start date is required');
  const endYmd = toYmd(endDate || startDate) || startYmd;
  if (endYmd < startYmd) {
    throw new Error('End date must be on or after start date');
  }
  const label = String(title || '').trim() || 'Day off';
  const exclusionType = resolveExclusionType(startYmd, endYmd);

  if (editRow?.id) {
    const typeChanged = editRow.kind !== exclusionType;
    if (typeChanged) {
      const { error: deleteError } = await deleteExclusion(editRow.id);
      if (deleteError) throw deleteError;
    } else {
      const { data, error } = await updateExclusion(editRow.id, {
        start_date: startYmd,
        end_date: endYmd,
        label,
      });
      if (error) throw error;
      return dayOffRowFromExclusion({ ...data, exclusion_type: exclusionType });
    }
  }

  const { data, error } = await addExclusion({
    family_id: familyId,
    scope_type: 'family_default',
    school_year_label: schoolYearLabel,
    exclusion_type: exclusionType,
    start_date: startYmd,
    end_date: endYmd,
    label,
    source: 'manual',
  });
  if (error) throw error;
  return dayOffRowFromExclusion({ ...data, exclusion_type: exclusionType });
}

export async function deleteDayOff(editRow) {
  if (!editRow?.id) return;
  const { error } = await deleteExclusion(editRow.id);
  if (error) throw error;
}

export function mergeDayOffRows(customHolidays = [], customBreaks = []) {
  const singles = (customHolidays || []).map((row) => ({
    id: row.id,
    kind: 'holiday',
    name: row.name || '',
    start: row.date,
    end: row.date,
  }));
  const ranges = (customBreaks || []).map((row) => ({
    id: row.id,
    kind: 'break',
    name: row.name || '',
    start: row.start,
    end: row.end,
  }));
  return [...singles, ...ranges]
    .filter((row) => row.start)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export function applyDayOffRowToState(prevHolidays, prevBreaks, savedRow, previousRow = null) {
  const holidays = Array.isArray(prevHolidays) ? [...prevHolidays] : [];
  const breaks = Array.isArray(prevBreaks) ? [...prevBreaks] : [];

  if (previousRow?.id) {
    if (previousRow.kind === 'holiday') {
      const idx = holidays.findIndex((row) => row.id === previousRow.id);
      if (idx >= 0) holidays.splice(idx, 1);
    } else {
      const idx = breaks.findIndex((row) => row.id === previousRow.id);
      if (idx >= 0) breaks.splice(idx, 1);
    }
  }

  if (!savedRow?.id) {
    return { customHolidays: holidays, customBreaks: breaks };
  }

  if (savedRow.kind === 'break') {
    breaks.push({
      id: savedRow.id,
      start: savedRow.start,
      end: savedRow.end,
      name: savedRow.name || '',
    });
  } else {
    holidays.push({
      id: savedRow.id,
      date: savedRow.start,
      name: savedRow.name || '',
    });
  }

  holidays.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  breaks.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return { customHolidays: holidays, customBreaks: breaks };
}
