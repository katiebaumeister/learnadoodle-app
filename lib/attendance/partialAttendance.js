import { getEventChildIdsForDisplay } from '../utils/eventChildIds';
import { updateEventStatus } from '../services/attendanceClient';

export function getAssignedChildIds(event, familyChildren = []) {
  return getEventChildIdsForDisplay(event, familyChildren).map(String);
}

export function isSharedMultiChildEvent(event, familyChildren = []) {
  return getAssignedChildIds(event, familyChildren).length > 1;
}

export function normalizeAttendanceDayKey(dayDate) {
  return String(dayDate || '').slice(0, 10);
}

export function isAttendanceRecordPresent(record) {
  if (!record) return false;
  const status = String(record.status || '').trim().toLowerCase();
  const minutes = Number(record.minutes ?? record.minutes_present ?? 0);
  return status === 'present' || status === 'partial' || minutes > 0;
}

export function getAttendanceRecordForChild(records, eventId, childId, dayKey) {
  const dk = normalizeAttendanceDayKey(dayKey);
  return (records || []).find(
    (r) =>
      String(r?.event_id || '') === String(eventId)
      && String(r?.child_id || '') === String(childId)
      && normalizeAttendanceDayKey(r?.day_date) === dk
  );
}

export function childHasPresentAttendance(records, eventId, childId, dayKey) {
  return isAttendanceRecordPresent(getAttendanceRecordForChild(records, eventId, childId, dayKey));
}

export function allAssignedChildrenPresent(records, event, dayKey, familyChildren = []) {
  const assigned = getAssignedChildIds(event, familyChildren);
  if (assigned.length === 0) return false;
  return assigned.every((childId) => childHasPresentAttendance(records, event.id, childId, dayKey));
}

export function isEventGloballyDone(event) {
  const status = String(event?.status || event?.data?.status || '').trim().toLowerCase();
  if (status === 'done' || status === 'completed') return true;
  const instructional = String(
    event?.instructional_status || event?.data?.instructional_status || ''
  ).trim().toUpperCase();
  return instructional === 'MANUAL_COUNTS';
}

export function getAttendanceTargetChildIds(
  event,
  { contextChildId = null, viewingAllChildren = false, familyChildren = [] } = {}
) {
  const assigned = getAssignedChildIds(event, familyChildren);
  if (viewingAllChildren || !contextChildId) return assigned;
  const cid = String(contextChildId);
  return assigned.includes(cid) ? [cid] : assigned;
}

export function resolveEventDoneStatusForPlanner(
  event,
  attendanceRecords,
  familyChildren,
  contextChildId = null
) {
  const assigned = getAssignedChildIds(event, familyChildren);
  const dayKey = normalizeAttendanceDayKey(event?.date_local || event?.start_ts || event?.start_local);
  const recordsForEvent = (attendanceRecords || []).filter(
    (r) => String(r?.event_id || '') === String(event?.id)
  );

  if (contextChildId) {
    return childHasPresentAttendance(recordsForEvent, event.id, contextChildId, dayKey)
      ? 'done'
      : 'scheduled';
  }

  if (recordsForEvent.length > 0) {
    if (assigned.length > 1) {
      return allAssignedChildrenPresent(recordsForEvent, event, dayKey, familyChildren)
        ? 'done'
        : 'scheduled';
    }
    const anyPresent = recordsForEvent.some(isAttendanceRecordPresent);
    return anyPresent || isEventGloballyDone(event) ? 'done' : 'scheduled';
  }

  if (assigned.length > 1) {
    return 'scheduled';
  }
  return isEventGloballyDone(event) ? 'done' : 'scheduled';
}

export function mergeAttendanceRecords(records, patches = []) {
  const next = Array.isArray(records) ? [...records] : [];
  (patches || []).forEach((patch) => {
    if (!patch) return;
    if (patch._delete && patch.id) {
      const idx = next.findIndex((row) => String(row.id) === String(patch.id));
      if (idx >= 0) next.splice(idx, 1);
      return;
    }
    const idx = next.findIndex((row) => {
      if (patch.id && row.id) return String(row.id) === String(patch.id);
      return (
        String(row?.event_id || '') === String(patch?.event_id || '')
        && String(row?.child_id || '') === String(patch?.child_id || '')
        && normalizeAttendanceDayKey(row?.day_date) === normalizeAttendanceDayKey(patch?.day_date)
      );
    });
    if (idx >= 0) next[idx] = { ...next[idx], ...patch };
    else next.push(patch);
  });
  return next;
}

export async function syncEventDoneStatusAfterAttendanceWrites(
  event,
  dayKey,
  attendanceRecords,
  familyChildren = []
) {
  if (!event?.id) return { data: null, error: null, status: null };
  const shouldBeDone = allAssignedChildrenPresent(attendanceRecords, event, dayKey, familyChildren);
  const currentlyDone = isEventGloballyDone(event);
  if (shouldBeDone && !currentlyDone) {
    const result = await updateEventStatus(event.id, 'done', { clearAttendance: false });
    return { ...result, status: 'done' };
  }
  if (!shouldBeDone && currentlyDone) {
    const result = await updateEventStatus(event.id, 'scheduled', { clearAttendance: false });
    return { ...result, status: 'scheduled' };
  }
  return { data: null, error: null, status: currentlyDone ? 'done' : 'scheduled' };
}
