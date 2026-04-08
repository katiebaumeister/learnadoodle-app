/**
 * Recurring / series detection and master id resolution (planner + EventDetails).
 */

export function isPartOfRecurringSeries(ev) {
  if (!ev) return false;
  return !!(ev.recurrence_rule || ev.recurrence_id || ev.parent_event_id);
}

/** Plan apply creates one row per day sharing source_block_id + academic_year_id (not RRULE). */
export function isPlanYearBlockSeries(ev) {
  if (!ev) return false;
  return ev.generated_by === 'plan_year' && !!ev.source_block_id && !!ev.academic_year_id;
}

/** Show "delete occurrence" vs "delete all in series" (recurring or plan-block group). */
export function isDeletableSeriesGroup(ev) {
  return isPartOfRecurringSeries(ev) || isPlanYearBlockSeries(ev);
}

/** UUID part only (month grid uses `${id}-day-${i}` for multi-day projects). */
export function cleanPlannerEventId(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  return raw.includes('-day-') ? raw.split('-day-')[0] : raw;
}

/**
 * Series master id for soft-deleting all rows in a recurring series.
 */
export function resolveSeriesMasterEventId(ev, cleanEventId) {
  let master = ev?.parent_event_id || ev?.recurrence_id;
  if (master && typeof master === 'string' && master.includes('-day-')) {
    master = master.split('-day-')[0];
  }
  if (ev?.recurrence_rule && !master) master = cleanEventId;
  if (!master) master = cleanEventId;
  return master;
}

/**
 * Soft-delete every row in a recurring series or a plan-year block group.
 * Returns logEventId for analytics / parent callbacks (master id for RRULE, occurrence id for plan blocks).
 */
export async function softDeleteEventSeries(supabase, familyId, ev, cleanEventId) {
  if (!familyId) {
    return { error: new Error('Missing family'), logEventId: null };
  }
  const now = new Date().toISOString();

  if (isPlanYearBlockSeries(ev) && ev.source_block_id && ev.academic_year_id) {
    const { error } = await supabase
      .from('events')
      .update({ deleted_at: now })
      .eq('family_id', familyId)
      .eq('source_block_id', ev.source_block_id)
      .eq('academic_year_id', ev.academic_year_id)
      .eq('generated_by', 'plan_year')
      .is('deleted_at', null);
    return { error, logEventId: cleanEventId };
  }

  const masterEventId = resolveSeriesMasterEventId(ev, cleanEventId);
  const { error } = await supabase
    .from('events')
    .update({ deleted_at: now })
    .eq('family_id', familyId)
    .or(`id.eq.${masterEventId},parent_event_id.eq.${masterEventId},recurrence_id.eq.${masterEventId}`)
    .is('deleted_at', null);
  return { error, logEventId: masterEventId };
}
