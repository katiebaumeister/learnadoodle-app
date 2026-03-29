/**
 * Attendance via same RPCs as components/records/Attendance.js
 */

import { supabase } from '../supabase.js';

const WEEKDAYS = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Next occurrence of named weekday from fromDate (local midnight base). */
export function parseWeekdayInMessage(userMessage, fromDate = new Date()) {
  const lower = userMessage.toLowerCase();
  let targetName = null;
  for (const name of Object.keys(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(lower)) {
      targetName = name;
      break;
    }
  }
  if (!targetName) return null;
  const targetDow = WEEKDAYS[targetName];
  const useNext = /\bnext\s+(?:week\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(userMessage);

  const start = new Date(fromDate);
  start.setHours(0, 0, 0, 0);
  const cur = start.getDay();
  let add = (targetDow - cur + 7) % 7;
  // "next Monday": skip the nearest occurrence unless today is that day (then following week).
  if (useNext) {
    add = add === 0 ? 7 : add + 7;
  }
  start.setDate(start.getDate() + add);
  return start;
}

/** YYYY-MM-DD for attendance RPC */
export function parseAttendanceDate(userMessage) {
  const iso = userMessage.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  const lower = userMessage.toLowerCase();
  const d = new Date();
  if (/\byesterday\b/.test(lower)) {
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }
  if (/\btoday\b/.test(lower)) {
    return d.toISOString().split('T')[0];
  }

  const wd = parseWeekdayInMessage(userMessage, d);
  if (wd) return wd.toISOString().split('T')[0];

  return d.toISOString().split('T')[0];
}

/**
 * @param {string} messageLower
 * @param {{ id: string, first_name?: string, name?: string }[]} children
 */
export function pickChildFromMessage(messageLower, children) {
  if (!children?.length) return null;
  for (const c of children) {
    const n = (c.first_name || c.name || '').trim().toLowerCase();
    if (n.length >= 2 && messageLower.includes(n)) return c;
  }
  if (children.length === 1) return children[0];
  return null;
}

/**
 * UI present/absent → RPC params (matches Attendance.js setQuick)
 */
export async function executeMarkAttendanceRpc(familyId, childId, dateISO, uiStatus) {
  let mappedStatus = uiStatus === 'absent' ? 'absent' : 'excused';
  let minutes = uiStatus === 'absent' ? 0 : 300;

  const { data, error } = await supabase.rpc('upsert_attendance_exception', {
    p_family_id: familyId,
    p_child_id: childId,
    p_date: dateISO,
    p_status: mappedStatus,
    p_minutes_present: minutes,
    p_notes: null,
  });

  if (error) return { success: false, error: error.message || String(error) };
  return { success: true, data, userMessage: `Saved ${uiStatus} for ${dateISO}.` };
}

/**
 * @returns {Promise<{ lines: string[], error?: string }>}
 */
export async function fetchAttendanceSummaryForChild(childId, familyId) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const rangeFrom = from.toISOString().split('T')[0];
  const rangeTo = to.toISOString().split('T')[0];

  const { data: att, error } = await supabase.rpc('get_child_attendance', {
    p_child_id: childId,
    p_start_date: rangeFrom,
    p_end_date: rangeTo,
  });

  if (error) return { lines: [], error: error.message || String(error) };

  const arr = Array.isArray(att) ? att : [];
  if (arr.length === 0) {
    return { lines: [`No attendance rows yet for ${rangeFrom} → ${rangeTo}.`] };
  }

  const byStatus = {};
  for (const row of arr) {
    const st = row.status || 'unknown';
    byStatus[st] = (byStatus[st] || 0) + 1;
  }
  const summary = Object.entries(byStatus)
    .map(([k, v]) => `${k}: ${v} day(s)`)
    .join(', ');
  const sample = arr
    .slice(-8)
    .map((r) => `• ${r.date}: ${r.status}${r.minutes_present != null ? ` (${r.minutes_present} min)` : ''}`)
    .join('\n');

  return { lines: [`This month (${rangeFrom} → ${rangeTo}): ${summary}`, sample] };
}
