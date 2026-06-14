import { Platform } from 'react-native';
import { getFixTargetGapHistory, undoFixTargetGap } from './services/academicYearClient';
import { formatDateDisplayYmd } from './subjectPlanSlotLines';

const FIX_GAP_HISTORY_STORAGE_PREFIX = 'ld_fix_gap_history_v1:';

function normalizeFamilyKey(familyId) {
  return String(familyId || '').trim();
}

function toAmPm(hhmm = '09:00') {
  const safe = String(hhmm || '').slice(0, 5);
  const [hRaw = '09', mRaw = '00'] = safe.split(':');
  const hour = Number(hRaw);
  const mins = Number(mRaw);
  if (!Number.isFinite(hour) || !Number.isFinite(mins)) return safe;
  const suffix = hour >= 12 ? 'pm' : 'am';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(mins).padStart(2, '0')}${suffix}`;
}

export function formatFixGapHistoryTimestamp(tsRaw) {
  const d = new Date(tsRaw || '');
  if (Number.isNaN(d.getTime())) return 'recently';
  const dateLabel = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase();
  return `${dateLabel} at ${timeLabel}`;
}

export function formatFixGapHistorySlotLabel(slot = {}) {
  const dayLabel = formatDateDisplayYmd(String(slot?.date || '').slice(0, 10))
    || String(slot?.date || '').slice(0, 10);
  const startLabel = toAmPm(String(slot?.start_time || '').slice(0, 5) || '09:00');
  const endLabel = toAmPm(String(slot?.end_time || '').slice(0, 5) || '10:00');
  const subjectLabel = String(slot?.subject_name || '').trim();
  const timeLabel = `${startLabel} - ${endLabel}`;
  return subjectLabel ? `${dayLabel} · ${timeLabel} · ${subjectLabel}` : `${dayLabel} · ${timeLabel}`;
}

export function formatFixGapHistorySlotVerb(slot = {}, fallbackVerb = 'Added') {
  const action = String(slot?.action || '').trim().toLowerCase();
  if (action === 'extended') return 'Extended';
  if (action === 'removed') return 'Removed';
  if (action === 'added') return 'Added';
  return fallbackVerb;
}

export function isFixGapHistoryUndone(entry) {
  return Boolean(String(entry?.undone_at || '').trim());
}

function buildFixGapHistoryStorageKey(familyId, academicYearId) {
  const familyKey = normalizeFamilyKey(familyId);
  const yearKey = String(academicYearId || '').trim();
  if (!familyKey || !yearKey) return '';
  return `${FIX_GAP_HISTORY_STORAGE_PREFIX}${familyKey}|${yearKey}`;
}

export function readFixGapHistoryGrouped(familyId, academicYearId) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return {};
  const key = buildFixGapHistoryStorageKey(familyId, academicYearId);
  if (!key) return {};
  try {
    const raw = window.localStorage?.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

export function writeFixGapHistoryGrouped(familyId, academicYearId, groupedHistory) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const key = buildFixGapHistoryStorageKey(familyId, academicYearId);
  if (!key) return;
  try {
    window.localStorage?.setItem(
      key,
      JSON.stringify(groupedHistory && typeof groupedHistory === 'object' ? groupedHistory : {}),
    );
  } catch (_) {}
}

export function mergeFixGapHistoryGrouped(primaryGrouped, secondaryGrouped) {
  const out = {};
  const allKeys = new Set([
    ...Object.keys(primaryGrouped || {}),
    ...Object.keys(secondaryGrouped || {}),
  ]);
  allKeys.forEach((key) => {
    const merged = [];
    const seenIndexByKey = new Map();
    const pushEntry = (entry) => {
      if (!entry || typeof entry !== 'object') return;
      const dedupeKey = String(entry?.id || '').trim()
        || `${String(entry?.created_at || '').trim()}|${String(entry?.scope || '').trim()}|${String(entry?.subject_id || '').trim()}|${String(entry?.created_events || 0)}|${String(entry?.removed_events || 0)}`;
      const existingIdx = seenIndexByKey.get(dedupeKey);
      if (Number.isInteger(existingIdx) && existingIdx >= 0 && existingIdx < merged.length) {
        const existing = merged[existingIdx] || {};
        const existingUndoneAt = String(existing?.undone_at || '').trim();
        const incomingUndoneAt = String(entry?.undone_at || '').trim();
        if (!existingUndoneAt && incomingUndoneAt) {
          merged[existingIdx] = { ...existing, undone_at: incomingUndoneAt };
        }
        return;
      }
      seenIndexByKey.set(dedupeKey, merged.length);
      merged.push(entry);
    };
    (Array.isArray(primaryGrouped?.[key]) ? primaryGrouped[key] : []).forEach(pushEntry);
    (Array.isArray(secondaryGrouped?.[key]) ? secondaryGrouped[key] : []).forEach(pushEntry);
    merged.sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
    if (merged.length > 0) out[key] = merged;
  });
  return out;
}

function normalizeHistoryIds(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function historyEntryMatchesUndoSignature(entry, signature) {
  if (!entry || typeof entry !== 'object' || !signature || typeof signature !== 'object') return false;
  const sigId = String(signature?.historyId || '').trim();
  const entryId = String(entry?.id || '').trim();
  if (sigId && entryId && sigId === entryId) return true;
  const sigCreated = normalizeHistoryIds(signature?.createdEventIds);
  const sigRemoved = normalizeHistoryIds(signature?.removedEventIds);
  const entryCreated = normalizeHistoryIds(entry?.created_event_ids);
  const entryRemoved = normalizeHistoryIds(entry?.removed_event_ids);
  const sameCreated = sigCreated.length > 0
    && sigCreated.length === entryCreated.length
    && sigCreated.every((id) => entryCreated.includes(id));
  const sameRemoved = sigRemoved.length > 0
    && sigRemoved.length === entryRemoved.length
    && sigRemoved.every((id) => entryRemoved.includes(id));
  if (sameCreated && (sigRemoved.length === 0 || sameRemoved)) return true;
  if (sameRemoved && (sigCreated.length === 0 || sameCreated)) return true;
  return false;
}

export function normalizeFixGapSlots(rawSlots = [], { subjectId = '', subjectName = '' } = {}) {
  const sid = String(subjectId || '').trim();
  const fallbackName = String(subjectName || '').trim();
  return (Array.isArray(rawSlots) ? rawSlots : [])
    .map((slot) => {
      const slotSubjectId = String(slot?.subject_id || sid || '').trim();
      return {
        date: String(slot?.date || '').slice(0, 10),
        start_time: String(slot?.start_time || '').slice(0, 5) || '09:00',
        end_time: String(slot?.end_time || '').slice(0, 5) || '10:00',
        subject_id: slotSubjectId,
        subject_name: String(slot?.subject_name || '').trim() || fallbackName,
        action: String(slot?.action || '').trim() || undefined,
      };
    })
    .filter((slot) => /^\d{4}-\d{2}-\d{2}$/.test(slot.date));
}

export function extractFixGapSlotsFromResult(fixResult = null) {
  if (!fixResult) return [];
  return normalizeFixGapSlots(
    Array.isArray(fixResult?.selectedAssignments)
      ? fixResult.selectedAssignments
      : (Array.isArray(fixResult?.debugSelectedSlots) ? fixResult.debugSelectedSlots : []),
    {
      subjectId: fixResult?.subject_id,
      subjectName: fixResult?.subject_name,
    },
  );
}

export function buildLocalFixGapHistoryEntry({
  fixResult = null,
  subjectId = '',
  subjectName = '',
}) {
  const normalizedSlots = extractFixGapSlotsFromResult(fixResult);
  if (normalizedSlots.length === 0) return null;
  const sessionsAdded = Math.max(
    0,
    Number(
      fixResult?.successfulInsertCount
      ?? fixResult?.insertedCount
      ?? fixResult?.createdEvents
      ?? normalizedSlots.length,
    ),
  );
  return {
    id: `local-${Date.now()}`,
    created_at: new Date().toISOString(),
    scope: 'per_subject',
    subject_id: String(subjectId || '').trim() || null,
    assignment_slots: normalizedSlots,
    created_events: sessionsAdded,
    removed_events: Math.max(0, Number(fixResult?.removedEvents ?? 0)),
    created_event_ids: Array.isArray(fixResult?.createdEventIds) ? fixResult.createdEventIds : [],
    removed_event_ids: Array.isArray(fixResult?.removedEventIds) ? fixResult.removedEventIds : [],
    requested_gap: Number(fixResult?.requestedGap ?? 0) || 0,
    assigned_count: Number(fixResult?.assignedCount ?? normalizedSlots.length) || normalizedSlots.length,
    successful_insert_count: sessionsAdded,
    failed_insert_count: Number(fixResult?.failedInsertCount ?? 0) || 0,
    message: String(fixResult?.message || '').trim() || null,
    subject_name: String(subjectName || '').trim() || null,
  };
}

export function appendLocalFixGapHistoryEntry({
  familyId,
  academicYearId,
  subjectId,
  entry,
}) {
  const sid = String(subjectId || '').trim();
  const yearId = String(academicYearId || '').trim();
  if (!sid || !yearId || !entry) return null;
  const grouped = readFixGapHistoryGrouped(familyId, yearId);
  const existing = Array.isArray(grouped[sid]) ? grouped[sid] : [];
  const next = {
    ...grouped,
    [sid]: [entry, ...existing],
  };
  writeFixGapHistoryGrouped(familyId, yearId, next);
  return next[sid];
}

export function buildFixGapHistoryRunDetails(runs = [], subjectId = '') {
  const sid = String(subjectId || '').trim();
  return (Array.isArray(runs) ? runs : [])
    .map((run, idx) => {
      const createdCount = Math.max(0, Number(run?.created_events ?? 0));
      const removedCount = Math.max(0, Number(run?.removed_events ?? 0));
      const actionVerb = removedCount > 0 ? 'Removed' : 'Added';
      const slotLines = (Array.isArray(run?.assignment_slots) ? run.assignment_slots : [])
        .map((slot) => {
          const line = formatFixGapHistorySlotLabel({
            ...slot,
            subject_name: slot?.subject_name || run?.subject_name || '',
          });
          if (!line) return null;
          return {
            line,
            verb: formatFixGapHistorySlotVerb(slot, actionVerb),
          };
        })
        .filter(Boolean);
      return {
        key: String(run?.id || '').trim() || `run-${sid}-${idx}`,
        createdAt: run?.created_at,
        actionVerb,
        createdCount,
        removedCount,
        slotLines,
        message: String(run?.message || '').trim() || '',
        isUndone: isFixGapHistoryUndone(run),
        raw: run,
      };
    })
    .filter((run) => run.slotLines.length > 0 || run.createdCount > 0 || run.removedCount > 0);
}

export function getLatestUndoableFixGapEntry(runs = []) {
  const undoable = (Array.isArray(runs) ? runs : []).filter((entry) => !isFixGapHistoryUndone(entry));
  const latestServerEntry = undoable.find((entry) => {
    const id = String(entry?.id || '').trim();
    return Boolean(id) && !id.startsWith('local-');
  }) || null;
  return latestServerEntry || undoable[0] || null;
}

export function canUndoFixGapEntry(entry) {
  if (!entry || isFixGapHistoryUndone(entry)) return false;
  const createdEventIds = Array.isArray(entry?.created_event_ids) ? entry.created_event_ids : [];
  const removedEventIds = Array.isArray(entry?.removed_event_ids) ? entry.removed_event_ids : [];
  return createdEventIds.length > 0 || removedEventIds.length > 0;
}

export async function loadSubjectFixGapHistory({
  familyId,
  academicYearId,
  subjectId,
}) {
  const sid = String(subjectId || '').trim();
  const yearId = String(academicYearId || '').trim();
  if (!sid || !yearId) {
    return { runs: [], grouped: {} };
  }
  const localGrouped = readFixGapHistoryGrouped(familyId, yearId);
  let grouped = { ...localGrouped };
  try {
    const { data, error } = await getFixTargetGapHistory({ academicYearId: yearId });
    if (!error) {
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      const serverGrouped = {};
      rows.forEach((entry) => {
        const scope = String(entry?.scope || '').trim().toLowerCase();
        if (scope === 'overall') {
          if (!serverGrouped.overall) serverGrouped.overall = [];
          serverGrouped.overall.push(entry);
          return;
        }
        const subjectKey = String(entry?.subject_id || '').trim();
        if (subjectKey) {
          if (!serverGrouped[subjectKey]) serverGrouped[subjectKey] = [];
          serverGrouped[subjectKey].push(entry);
        }
      });
      grouped = mergeFixGapHistoryGrouped(serverGrouped, localGrouped);
      writeFixGapHistoryGrouped(familyId, yearId, grouped);
    }
  } catch (_) {}
  const runs = Array.isArray(grouped[sid]) ? grouped[sid] : [];
  return { runs, grouped };
}

function markHistoryUndoneLocally({
  familyId,
  academicYearId,
  subjectId,
  latestEntry,
  undoMarkedAt,
}) {
  const sid = String(subjectId || '').trim();
  const yearId = String(academicYearId || '').trim();
  if (!sid || !yearId || !latestEntry) return [];
  const grouped = readFixGapHistoryGrouped(familyId, yearId);
  const runs = Array.isArray(grouped[sid]) ? grouped[sid] : [];
  const undoSignature = {
    historyId: String(latestEntry?.id || '').trim(),
    createdEventIds: Array.isArray(latestEntry?.created_event_ids) ? latestEntry.created_event_ids : [],
    removedEventIds: Array.isArray(latestEntry?.removed_event_ids) ? latestEntry.removed_event_ids : [],
  };
  const updated = runs.map((entry) => {
    if (!historyEntryMatchesUndoSignature(entry, undoSignature)) return entry;
    return {
      ...entry,
      undone_at: String(entry?.undone_at || '').trim() || undoMarkedAt,
    };
  });
  const nextGrouped = { ...grouped, [sid]: updated };
  writeFixGapHistoryGrouped(familyId, yearId, nextGrouped);
  return updated;
}

function dispatchRefreshEvents() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('refreshSubjects'));
  window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
  window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
}

export async function undoSubjectFixGapLatest({
  familyId,
  academicYearId,
  subjectId,
  historyRuns = [],
}) {
  const sid = String(subjectId || '').trim();
  const yearId = String(academicYearId || '').trim();
  const latestEntry = getLatestUndoableFixGapEntry(historyRuns);
  if (!latestEntry) {
    throw new Error('No active gap action to undo.');
  }
  if (!canUndoFixGapEntry(latestEntry)) {
    throw new Error('This gap action cannot be undone (missing event ids).');
  }
  const createdEventIds = (latestEntry.created_event_ids || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const removedEventIds = (latestEntry.removed_event_ids || [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const payload = {
    academic_year_id: yearId,
    scope: 'per_subject',
    subject_id: sid,
    ...(String(latestEntry?.id || '').trim() && !String(latestEntry.id).startsWith('local-')
      ? { history_id: String(latestEntry.id).trim() }
      : {}),
    created_event_ids: createdEventIds,
    removed_event_ids: removedEventIds,
  };
  const { data, error } = await undoFixTargetGap(payload);
  if (error) throw error;
  const undoMarkedAt = String(data?.history_undone_at || new Date().toISOString()).trim();
  let runs = markHistoryUndoneLocally({
    familyId,
    academicYearId: yearId,
    subjectId: sid,
    latestEntry,
    undoMarkedAt,
  });
  const reloaded = await loadSubjectFixGapHistory({ familyId, academicYearId: yearId, subjectId: sid });
  runs = reloaded.runs;
  dispatchRefreshEvents();
  return {
    restoredCount: Number(data?.restored_count ?? 0) || 0,
    removedCount: Number(data?.removed_count ?? 0) || 0,
    runs,
    summary: `Undid last gap action (${Number(data?.restored_count ?? 0) || 0} restored, ${Number(data?.removed_count ?? 0) || 0} removed).`,
  };
}

export function buildGapSlotPreviewLines(dryRunPreview = null, { maxLines = 12 } = {}) {
  const rawSlots = Array.isArray(dryRunPreview?.selectedAssignments)
    ? dryRunPreview.selectedAssignments
    : (Array.isArray(dryRunPreview?.debugSelectedSlots) ? dryRunPreview.debugSelectedSlots : []);
  return normalizeFixGapSlots(rawSlots)
    .slice(0, maxLines)
    .map((slot) => `- ${formatFixGapHistorySlotLabel(slot)}`);
}
