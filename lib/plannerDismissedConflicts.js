import { cleanPlannerEventId } from './utils/recurringEventUtils';

export const DISMISSED_CONFLICTS_STORAGE_KEY = 'ld_planner_dismissed_conflicts';
const MAX_STORED = 12;

export function normalizeConflictEventId(rawId) {
  const trimmed = String(rawId || '').trim();
  if (!trimmed) return '';
  return cleanPlannerEventId(trimmed) || trimmed;
}

function normalizeItem(item) {
  if (!item?.eventId) return null;
  return {
    eventId: normalizeConflictEventId(item.eventId),
    eventTitle: item.eventTitle || 'Event',
    conflictCount: Number(item.conflictCount || 0),
    conflictMessage: item.conflictMessage || null,
    movedEvent: item.movedEvent || null,
    conflictEvent: item.conflictEvent || null,
    timestamp: Number(item.timestamp || Date.now()),
  };
}

export function loadDismissedConflicts() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(DISMISSED_CONFLICTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeItem).filter(Boolean).slice(0, MAX_STORED);
  } catch (_) {
    return [];
  }
}

export function saveDismissedConflicts(list) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      DISMISSED_CONFLICTS_STORAGE_KEY,
      JSON.stringify((list || []).slice(0, MAX_STORED)),
    );
  } catch (_) {
  }
}

export function upsertDismissedConflict(item) {
  const normalized = normalizeItem(item);
  if (!normalized) return loadDismissedConflicts();
  const remaining = loadDismissedConflicts().filter(
    (entry) => normalizeConflictEventId(entry.eventId) !== normalized.eventId,
  );
  const next = [normalized, ...remaining].slice(0, MAX_STORED);
  saveDismissedConflicts(next);
  return next;
}

export function removeDismissedConflictByEventId(eventId) {
  const key = normalizeConflictEventId(eventId);
  if (!key) return loadDismissedConflicts();
  const next = loadDismissedConflicts().filter(
    (entry) => normalizeConflictEventId(entry.eventId) !== key,
  );
  saveDismissedConflicts(next);
  return next;
}
