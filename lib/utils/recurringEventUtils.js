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
 * Known linkage ids that can identify the same series across inconsistent rows.
 */
export function resolveSeriesLinkIds(ev, cleanEventId) {
  const values = [
    cleanEventId,
    ev?.id,
    ev?.parent_event_id,
    ev?.recurrence_id,
    resolveSeriesMasterEventId(ev, cleanEventId),
  ];
  const cleaned = values
    .map((value) => (value == null ? '' : String(value)))
    .map((value) => (value.includes('-day-') ? value.split('-day-')[0] : value))
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

function parseRecurrenceRule(ruleRaw) {
  if (!ruleRaw) return null;
  if (typeof ruleRaw === 'object' && !Array.isArray(ruleRaw)) return ruleRaw;
  if (typeof ruleRaw === 'string') {
    try {
      return JSON.parse(ruleRaw);
    } catch (_) {
      return null;
    }
  }
  return null;
}

function recurrenceField(rule, key) {
  if (!rule || typeof rule !== 'object') return null;
  if (rule[key] != null) return rule[key];
  const lower = String(key || '').toLowerCase();
  if (rule[lower] != null) return rule[lower];
  return null;
}

function hhmmUtc(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function durationMinutes(startTs, endTs) {
  const s = new Date(startTs || '');
  const e = new Date(endTs || '');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  return Math.max(0, Math.round((e.getTime() - s.getTime()) / 60000));
}

function normalizedChildIdsKey(value) {
  const arr = Array.isArray(value)
    ? value.map((v) => String(v || '').trim()).filter(Boolean).sort()
    : [];
  return arr.join('|');
}

async function findSplitWeeklySiblingMasterIds(supabase, familyId, ev, cleanEventId) {
  try {
    const anchorMasterId = resolveSeriesMasterEventId(ev, cleanEventId);
    if (!anchorMasterId) return [];
    const { data: anchor, error: anchorErr } = await supabase
      .from('events')
      .select('id, family_id, title, subject_id, event_type, child_id, child_ids, start_ts, end_ts, recurrence_rule, created_at, deleted_at')
      .eq('id', anchorMasterId)
      .maybeSingle();
    if (anchorErr || !anchor || anchor.deleted_at) return [];
    const anchorRule = parseRecurrenceRule(anchor.recurrence_rule);
    const freq = String(recurrenceField(anchorRule, 'frequency') || recurrenceField(anchorRule, 'freq') || '').toUpperCase();
    if (freq !== 'WEEKLY') return [];
    const interval = String(recurrenceField(anchorRule, 'interval') || '1');
    const until = recurrenceField(anchorRule, 'until');
    if (!anchor.created_at) return [];

    const createdAt = new Date(anchor.created_at);
    if (Number.isNaN(createdAt.getTime())) return [];
    const windowStart = new Date(createdAt.getTime() - 5 * 60 * 1000).toISOString();
    const windowEnd = new Date(createdAt.getTime() + 5 * 60 * 1000).toISOString();

    let query = supabase
      .from('events')
      .select('id, recurrence_rule, child_id, child_ids, start_ts, end_ts')
      .eq('family_id', familyId)
      .is('deleted_at', null)
      .eq('title', anchor.title || '')
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)
      .not('recurrence_rule', 'is', null);
    query = anchor.event_type == null ? query.is('event_type', null) : query.eq('event_type', anchor.event_type);
    query = anchor.subject_id == null ? query.is('subject_id', null) : query.eq('subject_id', anchor.subject_id);
    query = anchor.child_id == null ? query.is('child_id', null) : query.eq('child_id', anchor.child_id);
    const { data: candidates, error: candidatesErr } = await query;
    if (candidatesErr || !Array.isArray(candidates)) return [];
    const anchorChildIdsKey = normalizedChildIdsKey(anchor.child_ids);
    const anchorStartKey = hhmmUtc(anchor.start_ts);
    const anchorDuration = durationMinutes(anchor.start_ts, anchor.end_ts);

    return candidates
      .filter((row) => {
        const rule = parseRecurrenceRule(row?.recurrence_rule);
        const rowFreq = String(recurrenceField(rule, 'frequency') || recurrenceField(rule, 'freq') || '').toUpperCase();
        if (rowFreq !== 'WEEKLY') return false;
        const rowInterval = String(recurrenceField(rule, 'interval') || '1');
        if (rowInterval !== interval) return false;
        const rowUntil = recurrenceField(rule, 'until');
        if (String(rowUntil || '') !== String(until || '')) return false;
        if (String(row.child_id || '') !== String(anchor.child_id || '')) return false;
        if (normalizedChildIdsKey(row.child_ids) !== anchorChildIdsKey) return false;
        if (hhmmUtc(row.start_ts) !== anchorStartKey) return false;
        if (durationMinutes(row.start_ts, row.end_ts) !== anchorDuration) return false;
        return true;
      })
      .map((row) => cleanPlannerEventId(String(row?.id || '')))
      .filter(Boolean);
  } catch (_) {
    return [];
  }
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
  const heuristicSiblingIds = await findSplitWeeklySiblingMasterIds(supabase, familyId, ev, cleanEventId);
  const seriesLinkIds = Array.from(
    new Set([
      ...resolveSeriesLinkIds(ev, cleanEventId),
      ...heuristicSiblingIds,
    ])
  );
  const filterClauses = seriesLinkIds.flatMap((id) => [
    `id.eq.${id}`,
    `parent_event_id.eq.${id}`,
    `recurrence_id.eq.${id}`,
  ]);
  const { error } = await supabase
    .from('events')
    .update({ deleted_at: now })
    .eq('family_id', familyId)
    .or(filterClauses.join(','))
    .is('deleted_at', null);
  return { error, logEventId: masterEventId };
}
