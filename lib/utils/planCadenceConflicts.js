/**
 * Plan builder cadence overlap: proposed blocks vs each other and vs calendar events.
 * Aligns with lib/utils/conflictDetection (same assignee, same local day, interval overlap).
 */

function getAssigneeIdsFromEvent(ev) {
  if (!ev) return [];
  const ids = [];
  if (ev.child_id) ids.push(ev.child_id);
  if (Array.isArray(ev.child_ids)) {
    ev.child_ids.forEach((c) => {
      if (c && !ids.includes(c)) ids.push(c);
    });
  }
  return ids.map(String);
}

function isEventSkippedForOverlap(ev) {
  if (!ev) return true;
  if (ev.status === 'canceled' || ev.canceled_at || ev.deleted_at) return true;
  if (ev.is_backlog) return true;
  if (ev.is_flexible) return true;
  if (ev.recurrence_rule) return true;
  return false;
}

/** Skip plan_year events for the academic year being edited (will be replaced). */
export function shouldSkipEventForPlanConflict(ev, academicYearId) {
  if (!ev || !academicYearId) return false;
  if (ev.generated_by === 'plan_year' && String(ev.academic_year_id || '') === String(academicYearId)) {
    return true;
  }
  return false;
}

function dateStringToDate(ymd) {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, d);
}

function toLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getBlockOccurrenceDates(block, startDateYmd, endDateYmd, exclusionRanges) {
  if (!startDateYmd || !endDateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(startDateYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endDateYmd)) {
    return [];
  }
  const weekdays = (block.weekdays || []).map((w) => (w != null ? parseInt(w, 10) : null)).filter((w) => Number.isInteger(w));
  if (weekdays.length === 0) return [];
  const start = dateStringToDate(startDateYmd);
  const end = dateStringToDate(endDateYmd);
  const out = [];
  const cur = new Date(start);
  while (cur <= end) {
    const ymd = toLocalYYYYMMDD(cur);
    const dayOfWeek = cur.getDay();
    if (!weekdays.includes(dayOfWeek)) {
      cur.setDate(cur.getDate() + 1);
      continue;
    }
    const inExclusion = (exclusionRanges || []).some(([s, e]) => ymd >= s && ymd <= e);
    if (!inExclusion) out.push(ymd);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function parseTimeToMinutes(s) {
  if (!s || typeof s !== 'string') return 0;
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const h = Math.min(23, parseInt(m[1], 10));
  const min = Math.min(59, parseInt(m[2], 10));
  return h * 60 + min;
}

function minutesToHHMM(totalMin) {
  let t = totalMin;
  if (t >= 24 * 60) t = t % (24 * 60);
  const h = Math.floor(t / 60);
  const m = t % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function blockSessionMinutes(block) {
  if (!block) return 0;
  if (block.all_day) return 6 * 60;
  const startMin = parseTimeToMinutes(block.start_time || '09:00');
  let endMin = parseTimeToMinutes(block.end_time || '10:00');
  if (endMin <= startMin) endMin += 24 * 60;
  return Math.max(0, endMin - startMin);
}

function getChildIdsForBlock(block, baseSubjectList, children, allFamilyChildIds) {
  const subj = (baseSubjectList || []).find((s) => String(s.id) === String(block.subject_id));
  const familyIds = (children || []).map((c) => c?.id).filter(Boolean);
  if (Array.isArray(block.child_ids) && block.child_ids.length > 0) {
    return block.child_ids.map(String);
  }
  if (!block.subject_id) return (allFamilyChildIds || []).map(String);
  if (!subj) return (allFamilyChildIds || []).map(String);
  const cid = subj.child_id;
  if (cid == null || cid === '') return familyIds.map(String);
  const parsed = String(cid)
    .split(';')
    .map((id) => id.trim())
    .filter(Boolean);
  const matched = parsed.filter((id) => familyIds.some((fid) => String(fid) === String(id)));
  return matched.length > 0 ? matched : familyIds.map(String);
}

function childrenOverlap(a, b) {
  const setA = new Set(a || []);
  return (b || []).some((id) => setA.has(String(id)));
}

function intervalsOverlap(a0, a1, b0, b1) {
  return a0 < b1 && b0 < a1;
}

function buildExclusionRanges(customHolidays, customBreaks) {
  return [
    ...(customHolidays || []).map((h) => [h.date, h.date]),
    ...(customBreaks || [])
      .map((b) => [b.start || b.startDate, b.end || b.endDate].filter(Boolean))
      .filter((r) => r.length === 2),
  ];
}

function eventYmd(ev) {
  const ts = ev.start_ts || ev.start;
  if (!ts) return null;
  const d = new Date(ts);
  if (isNaN(d.getTime())) return null;
  return toLocalYYYYMMDD(d);
}

function eventMinutes(ev) {
  const s = new Date(ev.start_ts || ev.start);
  const e = new Date(ev.end_ts || ev.end || ev.start_ts || ev.start);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return { startMin: 0, endMin: 0 };
  const sh = s.getHours();
  const sm = s.getMinutes();
  const eh = e.getHours();
  const em = e.getMinutes();
  let startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 24 * 60;
  return { startMin, endMin };
}

/**
 * Expand plan blocks to dated session slots in range.
 */
export function expandPlanBlocksToSlots(blocks, startDate, endDate, customHolidays, customBreaks, baseSubjectList, children, allFamilyChildIds) {
  if (!blocks?.length || !startDate || !endDate) return [];
  const exclusionRanges = buildExclusionRanges(customHolidays, customBreaks);
  const slots = [];
  blocks.forEach((block) => {
    const childIds = getChildIdsForBlock(block, baseSubjectList, children, allFamilyChildIds);
    if (!childIds.length) return;
    const subj = (baseSubjectList || []).find((s) => String(s.id) === String(block.subject_id));
    const subjectName = subj?.name || 'Subject';
    const dates = getBlockOccurrenceDates(block, startDate, endDate, exclusionRanges);
    let startMin = parseTimeToMinutes(block.start_time || '09:00');
    let endMin = parseTimeToMinutes(block.end_time || '10:00');
    if (block.all_day) {
      startMin = 9 * 60;
      endMin = 15 * 60;
    } else if (endMin <= startMin) {
      endMin += 24 * 60;
    }
    dates.forEach((ymd) => {
      slots.push({
        ymd,
        startMin,
        endMin,
        childIds,
        blockId: block.block_id,
        subjectId: block.subject_id ?? null,
        subjectName,
      });
    });
  });
  return slots;
}

function slotOverlapsEvent(slot, ev) {
  const ymd = eventYmd(ev);
  if (!ymd || ymd !== slot.ymd) return false;
  const evIds = getAssigneeIdsFromEvent(ev);
  if (!evIds.length || !childrenOverlap(slot.childIds, evIds)) return false;
  const { startMin: es, endMin: ee } = eventMinutes(ev);
  return intervalsOverlap(slot.startMin, slot.endMin, es, ee);
}

/**
 * @returns {{ internal: Array, external: Array, conflictDates: Set<string> }}
 */
export function analyzePlanCadenceConflicts({
  blocks,
  startDate,
  endDate,
  customHolidays,
  customBreaks,
  baseSubjectList,
  children,
  allFamilyChildIds,
  existingEvents,
  academicYearId,
}) {
  const slots = expandPlanBlocksToSlots(
    blocks,
    startDate,
    endDate,
    customHolidays,
    customBreaks,
    baseSubjectList,
    children,
    allFamilyChildIds,
  );
  const internal = [];
  const seenInt = new Set();
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a.ymd !== b.ymd) continue;
      if (a.blockId === b.blockId) continue;
      if (!childrenOverlap(a.childIds, b.childIds)) continue;
      if (!intervalsOverlap(a.startMin, a.endMin, b.startMin, b.endMin)) continue;
      const pairKey = `${a.ymd}|${[String(a.blockId), String(b.blockId)].sort().join(':')}`;
      if (seenInt.has(pairKey)) continue;
      seenInt.add(pairKey);
      const aEnd = a.endMin >= 24 * 60 ? a.endMin - 24 * 60 : a.endMin;
      internal.push({
        kind: 'internal',
        date: a.ymd,
        blockIdA: a.blockId,
        blockIdB: b.blockId,
        subjectA: a.subjectName,
        subjectB: b.subjectName,
        timeLabel: `${minutesToHHMM(a.startMin)}–${minutesToHHMM(aEnd)}`,
      });
    }
  }

  const external = [];
  const seenExt = new Set();
  const events = Array.isArray(existingEvents) ? existingEvents : [];
  events.forEach((ev) => {
    if (isEventSkippedForOverlap(ev)) return;
    if (shouldSkipEventForPlanConflict(ev, academicYearId)) return;
    slots.forEach((slot) => {
      if (slotOverlapsEvent(slot, ev)) {
        const key = `${slot.ymd}|${slot.blockId}|${ev.id}`;
        if (seenExt.has(key)) return;
        seenExt.add(key);
        const endDisp = slot.endMin >= 24 * 60 ? slot.endMin - 24 * 60 : slot.endMin;
        external.push({
          kind: 'external',
          date: slot.ymd,
          blockId: slot.blockId,
          subjectName: slot.subjectName,
          eventId: ev.id,
          eventTitle: ev.title || 'Event',
          slotTimeLabel: `${minutesToHHMM(slot.startMin)}–${minutesToHHMM(endDisp)}`,
        });
      }
    });
  });

  const conflictDates = new Set();
  internal.forEach((c) => conflictDates.add(c.date));
  external.forEach((c) => conflictDates.add(c.date));

  return { internal, external, slots, conflictDates };
}

/**
 * Try shifting one block's start/end later in 15m steps (same duration) until no conflicts.
 */
export function suggestTimeShiftForBlock(blockIndex, blocks, ctx) {
  const {
    startDate,
    endDate,
    customHolidays,
    customBreaks,
    baseSubjectList,
    children,
    allFamilyChildIds,
    existingEvents,
    academicYearId,
  } = ctx;
  const block = blocks[blockIndex];
  if (!block || block.all_day) return null;
  const duration = blockSessionMinutes(block);
  if (duration <= 0) return null;
  let startMin = parseTimeToMinutes(block.start_time || '09:00');
  let endMin = parseTimeToMinutes(block.end_time || '10:00');
  if (endMin <= startMin) endMin += 24 * 60;

  for (let delta = 15; delta <= 12 * 60; delta += 15) {
    const ns = startMin + delta;
    const ne = ns + duration;
    if (ne > 22 * 60 + 59) break;
    const trial = {
      ...block,
      start_time: minutesToHHMM(ns),
      end_time: minutesToHHMM(ne),
    };
    const trialBlocks = blocks.map((b, i) => (i === blockIndex ? trial : b));
    const { internal, external } = analyzePlanCadenceConflicts({
      blocks: trialBlocks,
      startDate,
      endDate,
      customHolidays,
      customBreaks,
      baseSubjectList,
      children,
      allFamilyChildIds,
      existingEvents,
      academicYearId,
    });
    if (internal.length === 0 && external.length === 0) {
      return { start_time: trial.start_time, end_time: trial.end_time };
    }
  }
  return null;
}

/**
 * One suggested time adjustment for the first unresolved conflict (internal first), or null.
 */
export function getNextCadenceTimeShift(blocks, ctx) {
  if (!blocks?.length) return null;
  const report = analyzePlanCadenceConflicts({ ...ctx, blocks });
  if (report.internal.length === 0 && report.external.length === 0) return null;

  if (report.internal.length > 0) {
    const c = report.internal[0];
    const idxB = blocks.findIndex((b) => b.block_id === c.blockIdB);
    const idxA = blocks.findIndex((b) => b.block_id === c.blockIdA);
    const preferIdx = idxB >= 0 ? idxB : idxA;
    if (preferIdx < 0) return null;
    const sug = suggestTimeShiftForBlock(preferIdx, blocks, ctx);
    if (sug) return { blockIndex: preferIdx, ...sug };
    return null;
  }
  if (report.external.length > 0) {
    const bid = report.external[0].blockId;
    const idx = blocks.findIndex((b) => b.block_id === bid);
    if (idx < 0) return null;
    const sug = suggestTimeShiftForBlock(idx, blocks, ctx);
    if (sug) return { blockIndex: idx, ...sug };
  }
  return null;
}

/**
 * Repeatedly apply {@link getNextCadenceTimeShift} until clear or no progress. Returns same reference if nothing changed.
 */
export function applyCadenceTimeShiftsUntilStable(blocks, ctx, maxSteps = 40) {
  if (!blocks?.length) return blocks;
  let next = blocks.map((b) => ({ ...b }));
  let changed = false;
  for (let step = 0; step < maxSteps; step++) {
    const shift = getNextCadenceTimeShift(next, ctx);
    if (!shift) break;
    changed = true;
    const { blockIndex, start_time, end_time } = shift;
    next = next.map((b, i) => (i === blockIndex ? { ...b, start_time, end_time } : b));
  }
  return changed ? next : blocks;
}
