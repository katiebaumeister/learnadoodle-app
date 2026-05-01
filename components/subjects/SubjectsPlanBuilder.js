import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Plus, Sparkles, Upload, X } from 'lucide-react';
import { completeEvent, updateEventStatus } from '../../lib/services/attendanceClient';
import { applyToCalendar, getAcademicYear, getPlanHealth } from '../../lib/services/academicYearClient';
import { supabase } from '../../lib/supabase';
import { getAcademicYearExclusions, getFamilyPlannerSettings } from '../../lib/services/plannerSettingsClient';
import { useToast } from '../Toast';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import SubjectPastEventsAttendanceModal from './SubjectPastEventsAttendanceModal';

const FG = '#111827';
const SUB = '#64748b';
const MUTED = '#94a3b8';
const ACCENT = '#6BB3E8';
const BORDER = '#e5e7eb';
const BORDER_SUBTLE = 'rgba(148, 163, 184, 0.24)';
const CHIP_SELECTED_BG = 'rgba(133, 196, 242, 0.2)';
const CHIP_SELECTED_BORDER = '#6BB3E8';
const CHIP_SELECTED_TEXT = '#6BB3E8';
const WEEKDAY_NUMBERS = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_FULL_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TERM_OPTIONS = [
  { id: 'full_year', label: 'Full year' },
  { id: 'fall_term', label: 'Fall term' },
  { id: 'spring_term', label: 'Spring term' },
];
const OVERVIEW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const overviewCacheByFamily = new Map();
const overviewInflightByFamily = new Map();
const SCHEDULE_SUPPLEMENT_TTL_MS = 10 * 60 * 1000;
const scheduleSupplementCacheByKey = new Map();
const scheduleSupplementInflightByKey = new Map();
let schoolYearTemplateCache = null;

function getPresentAcademicScope(now = new Date()) {
  const month = now.getMonth() + 1;
  const startYear = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    startYear,
    endYear: startYear + 1,
    termId: month >= 8 ? 'fall_term' : 'spring_term',
  };
}

function formatScheduleScopeLabel(scopeId) {
  if (scopeId === 'fall_term') return 'Fall Term';
  if (scopeId === 'spring_term') return 'Spring Term';
  if (scopeId === 'full_year') return 'Full Year';
  return '';
}

function formatScheduleScopeChipLabel(scopeId) {
  if (scopeId === 'fall_term') return 'Fall term';
  if (scopeId === 'spring_term') return 'Spring term';
  return '';
}

function normalizePlanningMode(mode) {
  const raw = String(mode || '').trim().toLowerCase();
  if (!raw) return 'afterschool';
  if (raw.includes('home')) return 'homeschool';
  if (raw.includes('after')) return 'afterschool';
  return 'afterschool';
}

function formatYmdFromTemplateYear(startYear, endYear, scope) {
  const safeStart = Number(startYear);
  const safeEnd = Number(endYear);
  if (!Number.isFinite(safeStart) || !Number.isFinite(safeEnd)) return null;
  if (scope === 'fall_term') return { start_date: `${safeStart}-08-01`, end_date: `${safeStart}-12-31` };
  if (scope === 'spring_term') return { start_date: `${safeEnd}-01-01`, end_date: `${safeEnd}-05-31` };
  return { start_date: `${safeStart}-08-01`, end_date: `${safeEnd}-05-31` };
}

function getClientTimezone() {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && typeof tz === 'string') return tz.trim();
    }
  } catch (_) {}
  return 'America/New_York';
}

function countOccurrencesInRange(startYmd, endYmd, weekdays = []) {
  if (!startYmd || !endYmd || !Array.isArray(weekdays) || weekdays.length === 0) return 0;
  const start = new Date(`${startYmd}T12:00:00`);
  const end = new Date(`${endYmd}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  const target = new Set(weekdays.map((d) => Number(d)));
  let n = 0;
  const d = new Date(start);
  while (d <= end) {
    if (target.has(d.getDay())) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

function timeRangeHours(startTime = '09:00', endTime = '10:00') {
  const [sh, sm] = String(startTime).split(':').map((x) => Number(x));
  const [eh, em] = String(endTime).split(':').map((x) => Number(x));
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) return 0;
  return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
}

function toAmPm(hhmm = '09:00') {
  const [h, m] = String(hhmm).split(':').map((v) => Number(v));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatEventDateTime(ts) {
  const d = new Date(ts || '');
  if (Number.isNaN(d.getTime())) return 'Date not set';
  const dateLabel = d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dateLabel} · ${timeLabel}`;
}

function addDaysToYmd(ymd, daysToAdd = 0) {
  const base = String(ymd || '').trim();
  if (!base) return null;
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(daysToAdd || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDisplayYmd(ymd) {
  const base = String(ymd || '').trim();
  if (!base) return '';
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function listDatesForWeekdaysInRange(startYmd, endYmd, weekdays = []) {
  if (!startYmd || !endYmd) return [];
  const daySet = new Set(
    (Array.isArray(weekdays) ? weekdays : [])
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  );
  if (daySet.size === 0) return [];
  const start = new Date(`${String(startYmd).slice(0, 10)}T12:00:00`);
  const end = new Date(`${String(endYmd).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
  const dates = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (daySet.has(cursor.getDay())) {
      dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function formatWeekdaySummary(dayNums = []) {
  const unique = [...new Set((dayNums || []).map((d) => Number(d)).filter((d) => Number.isInteger(d)))].sort((a, b) => a - b);
  if (unique.length === 0) return 'No days set';
  const monToFri = [1, 2, 3, 4, 5];
  const isMonToFri = monToFri.every((d) => unique.includes(d)) && unique.length === 5;
  if (isMonToFri) return 'Mon-Fri';
  return unique.map((d) => WEEKDAY_LABELS[d] || '').filter(Boolean).join(', ');
}

function formatCadenceDayPhrase(dayNums = []) {
  const unique = [...new Set((dayNums || []).map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  if (unique.length === 0) return '';
  const dayNames = unique.map((d) => `${WEEKDAY_FULL_LABELS[d] || WEEKDAY_LABELS[d] || 'Day'}s`);
  if (dayNames.length === 1) return dayNames[0];
  if (dayNames.length === 2) return `${dayNames[0]} and ${dayNames[1]}`;
  return `${dayNames.slice(0, -1).join(', ')}, and ${dayNames[dayNames.length - 1]}`;
}

function formatSubjectCadence(blocks = []) {
  const dayNums = [
    ...new Set(
      (blocks || []).flatMap((block) =>
        Array.isArray(block?.weekdays)
          ? block.weekdays.map((d) => Number(d)).filter((d) => Number.isInteger(d))
          : []
      )
    ),
  ].sort((a, b) => a - b);
  if (dayNums.length === 0) return '';
  const dayPhrase = formatCadenceDayPhrase(dayNums);
  const startTimes = [...new Set((blocks || []).map((block) => String(block?.start_time || '').trim()).filter(Boolean))];
  if (!dayPhrase) return '';
  if (startTimes.length === 1) {
    return `${dayPhrase} at ${toAmPm(startTimes[0]).toLowerCase()}`;
  }
  return `${dayPhrase} (mixed times)`;
}

function formatSubjectCadenceCompact(blocks = []) {
  const dayNums = [
    ...new Set(
      (blocks || []).flatMap((block) =>
        Array.isArray(block?.weekdays)
          ? block.weekdays.map((d) => Number(d)).filter((d) => Number.isInteger(d))
          : []
      )
    ),
  ].sort((a, b) => a - b);
  if (dayNums.length === 0) return '';
  return formatWeekdaySummary(dayNums);
}

function extractCadenceTimeLabel(cadenceText = '') {
  const text = String(cadenceText || '').trim();
  if (!text) return '';
  const match = text.match(/\bat\s+(.+)$/i);
  if (!match) return '';
  const raw = String(match[1] || '').trim();
  return raw ? raw.toUpperCase() : '';
}

function isInstructionalEvent(eventRow) {
  if (!eventRow || typeof eventRow !== 'object') return false;
  const status = eventRow.instructional_status;
  if (status === 'MANUAL_COUNTS' || status === 'PLAN_PLACEHOLDER') return true;
  return eventRow.counts_toward_plan === true;
}

function normalizeFamilyKey(familyId) {
  return String(familyId || '').trim();
}

function buildScheduleSupplementKey(familyId, schoolYearLabel) {
  const familyKey = normalizeFamilyKey(familyId);
  const yearKey = String(schoolYearLabel || '').trim();
  if (!familyKey || !yearKey) return '';
  return `${familyKey}|${yearKey}`;
}

function getCachedScheduleSupplement(familyId, schoolYearLabel, { allowStale = true } = {}) {
  const key = buildScheduleSupplementKey(familyId, schoolYearLabel);
  if (!key) return null;
  const cached = scheduleSupplementCacheByKey.get(key);
  if (!cached) return null;
  if (allowStale) return cached;
  if (Date.now() - Number(cached.updatedAt || 0) > SCHEDULE_SUPPLEMENT_TTL_MS) return null;
  return cached;
}

function isUuidLike(value) {
  const normalized = normalizeFamilyKey(value).toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized);
}

function extractSubjectIdsFromBlock(block) {
  const ids = [];
  if (block?.subject_id != null && String(block.subject_id).trim()) {
    ids.push(String(block.subject_id));
  }
  if (Array.isArray(block?.subject_ids)) {
    block.subject_ids.forEach((id) => {
      if (id != null && String(id).trim()) ids.push(String(id));
    });
  }
  return [...new Set(ids)];
}

function normalizeSubjectName(value) {
  return String(value || '').trim().toLowerCase();
}

function parseYearFromYmd(ymd) {
  const year = Number(String(ymd || '').slice(0, 4));
  return Number.isFinite(year) ? year : null;
}

function resolveScheduleStartYear(row, scopeId) {
  const startYear = parseYearFromYmd(row?.start_date);
  const endYear = parseYearFromYmd(row?.end_date);
  if (scopeId === 'spring_term' && Number.isFinite(endYear)) return endYear - 1;
  return Number.isFinite(startYear) ? startYear : null;
}

function inferScopeFromDates(row) {
  const start = String(row?.start_date || '').slice(0, 10);
  const end = String(row?.end_date || '').slice(0, 10);
  const startMonth = Number(start.slice(5, 7));
  const endMonth = Number(end.slice(5, 7));
  const startYear = parseYearFromYmd(start);
  const endYear = parseYearFromYmd(end);
  if (startYear && endYear && endYear > startYear) return 'full_year';
  if (Number.isFinite(startMonth) && Number.isFinite(endMonth)) {
    if (startMonth >= 8 && endMonth <= 12) return 'fall_term';
    if (startMonth >= 1 && startMonth <= 3 && endMonth >= 4 && endMonth <= 6) return 'spring_term';
  }
  return '';
}

function buildPlanSlotKey(startYear, scopeId) {
  const year = Number(startYear);
  const scope = String(scopeId || '').trim();
  if (!Number.isFinite(year) || !scope) return null;
  return `${year}::${scope}`;
}

function normalizeSubjectTerm(term) {
  const raw = String(term || '').trim().toLowerCase();
  if (raw === 'full year' || raw === 'fullyear' || raw === 'year') return 'full_year';
  if (raw === 'fall_term') return 'fall_term';
  if (raw === 'fall term' || raw === 'fall') return 'fall_term';
  if (raw === 'spring_term') return 'spring_term';
  if (raw === 'spring term' || raw === 'spring') return 'spring_term';
  return 'full_year';
}

function parsePositiveInt(value) {
  const parsed = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveFloat(value) {
  const parsed = parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveTargetStatusFromPlanned({ actualValue, targetValue }) {
  const actual = Number(actualValue);
  const target = Number(targetValue);
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return null;
  const tolerance = Math.max(1, target * 0.08);
  const delta = actual - target;
  if (delta > tolerance) return 'ahead';
  if (delta < -tolerance) return 'behind';
  return 'on_track';
}

function daysBetweenInclusive(startYmd, endYmd) {
  const start = new Date(`${String(startYmd || '').slice(0, 10)}T12:00:00`);
  const end = new Date(`${String(endYmd || '').slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  return Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1;
}

function toOneDecimal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function subjectMatchesYearTerm(subject, yearLabel, termId) {
  const subjectYear = String(subject?.school_year || '').trim();
  const slotYear = String(yearLabel || '').trim();
  if (!subjectYear || !slotYear || subjectYear !== slotYear) return false;
  const subjectTerm = normalizeSubjectTerm(subject?.school_term);
  const slotTerm = normalizeSubjectTerm(termId);
  if (slotTerm === 'full_year') return subjectTerm === 'full_year';
  // Subjects tagged full_year should appear in both fall and spring planning slots.
  return subjectTerm === slotTerm || subjectTerm === 'full_year';
}

function extractSubjectNamesFromBlock(block) {
  const names = [];
  if (block?.subject_name != null && String(block.subject_name).trim()) {
    names.push(String(block.subject_name));
  }
  if (block?.subject_title != null && String(block.subject_title).trim()) {
    names.push(String(block.subject_title));
  }
  return [...new Set(names)];
}

function getCachedOverview(familyId, { allowStale = true } = {}) {
  const key = normalizeFamilyKey(familyId);
  if (!key) return null;
  const cached = overviewCacheByFamily.get(key);
  if (!cached) return null;
  if (allowStale) return cached;
  if (Date.now() - Number(cached.updatedAt || 0) > OVERVIEW_CACHE_TTL_MS) return null;
  return cached;
}

export function getSubjectsPlanOverviewFromCache(familyId, { allowStale = true } = {}) {
  return getCachedOverview(familyId, { allowStale });
}

async function fetchAndCacheOverview(familyId, { force = false } = {}) {
  const key = normalizeFamilyKey(familyId);
  if (!key || !isUuidLike(key)) {
    return {
      activeScheduleCore: null,
      planCores: [],
      planSubjectIdsBySlot: {},
      planSubjectNamesBySlot: {},
      subjectsWithAnyPlan: [],
      subjectsWithAnyPlanNames: [],
      otherPlans: [],
      updatedAt: Date.now(),
    };
  }
  if (!force) {
    const fresh = getCachedOverview(key, { allowStale: false });
    if (fresh) return fresh;
  }
  const inflight = overviewInflightByFamily.get(key);
  if (inflight) return inflight;
  const request = (async () => {
    const [{ data: rows, error }, healthResult] = await Promise.all([
      supabase
        .from('academic_years')
        .select('id, year_name, start_date, end_date, updated_at')
        .eq('family_id', familyId)
        .order('updated_at', { ascending: false }),
      getPlanHealth(familyId),
    ]);
    if (error) throw error;
    const allPlanRows = Array.isArray(rows) ? rows : [];
    const health = healthResult?.data || null;
    const activePlanId = health?.academic_year_id || allPlanRows[0]?.id || null;
    const activeRow = activePlanId ? allPlanRows.find((r) => String(r.id) === String(activePlanId)) || null : null;
    const yearDetailById = {};
    await Promise.all(
      allPlanRows.map(async (row) => {
        const yearId = row?.id;
        if (!yearId) return;
        try {
          const { data } = await getAcademicYear(yearId);
          yearDetailById[String(yearId)] = data || null;
        } catch (_) {
          yearDetailById[String(yearId)] = null;
        }
      })
    );
    const planCores = allPlanRows.map((row) => {
      const detail = yearDetailById[String(row?.id)] || null;
      const plan = detail?.plan || {};
      const planBlocks = Array.isArray(detail?.plan?.blocks) ? detail.plan.blocks : [];
      const dayNums = [...new Set(planBlocks.flatMap((b) => Array.isArray(b.weekdays) ? b.weekdays : []))];
      const timePairs = [...new Set(planBlocks.map((b) => `${b?.start_time || '09:00'}-${b?.end_time || '10:00'}`))];
      const uniformTime = timePairs.length === 1 ? timePairs[0] : null;
      const scopeId = String(detail?.school_duration_scope || row?.school_duration_scope || inferScopeFromDates(row)).trim();
      const subjectIdSet = new Set(planBlocks.flatMap((b) => extractSubjectIdsFromBlock(b)));
      const labels = Array.isArray(plan?.plan_slot_labels) ? plan.plan_slot_labels : [];
      labels.forEach((label) => {
        if (label?.subject_id != null && String(label.subject_id).trim()) {
          subjectIdSet.add(String(label.subject_id));
        }
      });
      const eventDates = Array.isArray(plan?.plan_event_dates) ? plan.plan_event_dates : [];
      eventDates.forEach((entry) => {
        if (entry?.subject_id != null && String(entry.subject_id).trim()) {
          subjectIdSet.add(String(entry.subject_id));
        }
      });
      const slotDates = Array.isArray(plan?.plan_slot_dates) ? plan.plan_slot_dates : [];
      slotDates.forEach((entry) => {
        if (entry?.subject_id != null && String(entry.subject_id).trim()) {
          subjectIdSet.add(String(entry.subject_id));
        }
      });
      const targets = (
        plan?.subject_targets && typeof plan.subject_targets === 'object' && !Array.isArray(plan.subject_targets)
          ? plan.subject_targets
          : plan?.subject_targets_override
      );
      if (targets && typeof targets === 'object' && !Array.isArray(targets)) {
        Object.keys(targets).forEach((sid) => {
          if (sid != null && String(sid).trim()) subjectIdSet.add(String(sid));
        });
      }
      const planConstraintMode = String(plan?.constraint_mode || '').trim().toLowerCase();
      const planTargetDays = parsePositiveInt(plan?.target_days);
      const planTargetHours = parsePositiveFloat(plan?.target_hours);
      const settingsConstraintMode = String(detail?.settings?.default_constraint_mode || '').trim().toLowerCase();
      const settingsTargetDays = parsePositiveInt(detail?.settings?.default_target_days);
      const settingsTargetHours = parsePositiveFloat(detail?.settings?.default_target_hours);
      const normalizedPlanTarget = (() => {
        if (planConstraintMode === 'days' && planTargetDays != null) {
          return { mode: 'days', target_days: planTargetDays, target_hours: null, source: 'plan_level' };
        }
        if (planConstraintMode === 'hours' && planTargetHours != null) {
          return { mode: 'hours', target_days: null, target_hours: planTargetHours, source: 'plan_level' };
        }
        if (planTargetDays != null && planTargetHours == null) {
          return { mode: 'days', target_days: planTargetDays, target_hours: null, source: 'plan_level' };
        }
        if (planTargetHours != null && planTargetDays == null) {
          return { mode: 'hours', target_days: null, target_hours: planTargetHours, source: 'plan_level' };
        }
        if (settingsConstraintMode === 'days' && settingsTargetDays != null) {
          return { mode: 'days', target_days: settingsTargetDays, target_hours: null, source: 'plan_settings' };
        }
        if (settingsConstraintMode === 'hours' && settingsTargetHours != null) {
          return { mode: 'hours', target_days: null, target_hours: settingsTargetHours, source: 'plan_settings' };
        }
        if (settingsTargetDays != null && settingsTargetHours == null) {
          return { mode: 'days', target_days: settingsTargetDays, target_hours: null, source: 'plan_settings' };
        }
        if (settingsTargetHours != null && settingsTargetDays == null) {
          return { mode: 'hours', target_days: null, target_hours: settingsTargetHours, source: 'plan_settings' };
        }
        return null;
      })();
      const normalizedSubjectTargets = {};
      if (targets && typeof targets === 'object' && !Array.isArray(targets)) {
        Object.entries(targets).forEach(([sid, entry]) => {
          const subjectKey = String(sid || '').trim();
          if (!subjectKey) return;
          const days = parsePositiveInt(entry?.target_days);
          const hours = parsePositiveFloat(entry?.target_hours);
          if (days == null && hours == null) return;
          normalizedSubjectTargets[subjectKey] = {
            mode: days != null ? 'days' : 'hours',
            target_days: days,
            target_hours: hours,
          };
        });
      }
      const subjectIds = [...subjectIdSet];
      return {
        row,
        startYear: resolveScheduleStartYear(row, scopeId),
        scopeId,
        subjectIds,
        planTarget: normalizedPlanTarget,
        subjectTargets: normalizedSubjectTargets,
        blocksLite: planBlocks.map((block) => ({
          subject_ids: extractSubjectIdsFromBlock(block),
          weekdays: Array.isArray(block?.weekdays) ? block.weekdays.map((d) => Number(d)).filter((d) => Number.isInteger(d)) : [],
          start_time: block?.start_time || '09:00',
          end_time: block?.end_time || '10:00',
        })).filter((block) => Array.isArray(block.subject_ids) && block.subject_ids.length > 0),
        weekdaySummary: formatWeekdaySummary(dayNums),
        timeSummary: uniformTime
          ? `${toAmPm(uniformTime.split('-')[0])}-${toAmPm(uniformTime.split('-')[1])}`
          : 'Mixed times',
      };
    });
    const planSubjectIdsBySlot = {};
    const planSubjectNamesBySlot = {};
    planCores.forEach((core) => {
      const slotKey = buildPlanSlotKey(core?.startYear, core?.scopeId);
      if (!slotKey) return;
      planSubjectIdsBySlot[slotKey] = Array.isArray(core?.subjectIds) ? core.subjectIds.map(String) : [];
      const detail = yearDetailById[String(core?.row?.id)] || null;
      const plan = detail?.plan || {};
      const names = new Set();
      const planBlocks = Array.isArray(plan?.blocks) ? plan.blocks : [];
      planBlocks.forEach((block) => {
        extractSubjectNamesFromBlock(block).forEach((name) => {
          const normalized = normalizeSubjectName(name);
          if (normalized) names.add(normalized);
        });
      });
      const labels = Array.isArray(plan?.plan_slot_labels) ? plan.plan_slot_labels : [];
      labels.forEach((label) => {
        const normalized = normalizeSubjectName(label?.subject_name || label?.subject_key);
        if (normalized) names.add(normalized);
      });
      planSubjectNamesBySlot[slotKey] = [...names];
    });
    const activePlanCore = activePlanId
      ? planCores.find((core) => String(core?.row?.id || '') === String(activePlanId))
      : null;
    const subjectsWithAnyPlanSet = new Set();
    const subjectsWithAnyPlanNameSet = new Set();
    allPlanRows.forEach((row) => {
      const detail = yearDetailById[String(row?.id)] || null;
      const plan = detail?.plan || {};
      const planBlocks = Array.isArray(plan?.blocks) ? plan.blocks : [];
      planBlocks.forEach((block) => {
        extractSubjectIdsFromBlock(block).forEach((sid) => subjectsWithAnyPlanSet.add(sid));
        extractSubjectNamesFromBlock(block).forEach((name) => {
          const normalized = normalizeSubjectName(name);
          if (normalized) subjectsWithAnyPlanNameSet.add(normalized);
        });
      });
      const labels = Array.isArray(plan?.plan_slot_labels) ? plan.plan_slot_labels : [];
      labels.forEach((label) => {
        if (label?.subject_id != null && String(label.subject_id).trim()) {
          subjectsWithAnyPlanSet.add(String(label.subject_id));
        }
        const normalizedName = normalizeSubjectName(label?.subject_name || label?.subject_key);
        if (normalizedName) subjectsWithAnyPlanNameSet.add(normalizedName);
      });
      const eventDates = Array.isArray(plan?.plan_event_dates) ? plan.plan_event_dates : [];
      eventDates.forEach((entry) => {
        if (entry?.subject_id != null && String(entry.subject_id).trim()) {
          subjectsWithAnyPlanSet.add(String(entry.subject_id));
        }
      });
      const slotDates = Array.isArray(plan?.plan_slot_dates) ? plan.plan_slot_dates : [];
      slotDates.forEach((entry) => {
        if (entry?.subject_id != null && String(entry.subject_id).trim()) {
          subjectsWithAnyPlanSet.add(String(entry.subject_id));
        }
      });
      const targets = (
        plan?.subject_targets && typeof plan.subject_targets === 'object' && !Array.isArray(plan.subject_targets)
          ? plan.subject_targets
          : plan?.subject_targets_override
      );
      if (targets && typeof targets === 'object' && !Array.isArray(targets)) {
        Object.keys(targets).forEach((sid) => {
          if (sid != null && String(sid).trim()) subjectsWithAnyPlanSet.add(String(sid));
        });
      }
    });
    const payload = {
      activeScheduleCore: activePlanCore ? { ...activePlanCore, health } : null,
      planCores,
      planSubjectIdsBySlot,
      planSubjectNamesBySlot,
      subjectsWithAnyPlan: [...subjectsWithAnyPlanSet],
      subjectsWithAnyPlanNames: [...subjectsWithAnyPlanNameSet],
      otherPlans: allPlanRows.filter((r) => String(r.id) !== String(activePlanId || '')),
      updatedAt: Date.now(),
    };
    overviewCacheByFamily.set(key, payload);
    return payload;
  })().finally(() => {
    overviewInflightByFamily.delete(key);
  });
  overviewInflightByFamily.set(key, request);
  return request;
}

export async function preloadSubjectsPlanOverview(familyId, { force = false } = {}) {
  try {
    await fetchAndCacheOverview(familyId, { force });
    return true;
  } catch (_) {
    return false;
  }
}

async function fetchAndCacheScheduleSupplement({
  familyId,
  schoolYearLabel,
  startYear,
  endYear,
  subjectIds = [],
  force = false,
} = {}) {
  const key = buildScheduleSupplementKey(familyId, schoolYearLabel);
  if (!key || !isUuidLike(normalizeFamilyKey(familyId))) {
    return {
      familyPlannerSettings: {
        target_scope: 'overall',
        default_constraint_mode: 'none',
        default_target_days: null,
        default_target_hours: null,
      },
      subjectTargetSettingsById: {},
      instructionalEventsBySubject: {},
      attendedDayKeysBySubject: {},
      updatedAt: Date.now(),
    };
  }
  const normalizedSubjectIds = [...new Set((subjectIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  const subjectIdsSignature = normalizedSubjectIds.slice().sort().join(',');
  if (!force) {
    const fresh = getCachedScheduleSupplement(familyId, schoolYearLabel, { allowStale: false });
    if (fresh && String(fresh.subjectIdsSignature || '') === subjectIdsSignature) return fresh;
  }
  const inflight = scheduleSupplementInflightByKey.get(key);
  if (inflight && !force) return inflight;

  const request = (async () => {
    const familySettingsPromise = getFamilyPlannerSettings(familyId, schoolYearLabel || null)
      .then(({ data }) => ({
        target_scope: String(data?.target_scope || 'overall').trim().toLowerCase(),
        default_constraint_mode: String(data?.default_constraint_mode || 'none').trim().toLowerCase(),
        default_target_days: parsePositiveInt(data?.default_target_days),
        default_target_hours: parsePositiveFloat(data?.default_target_hours),
      }))
      .catch(() => ({
        target_scope: 'overall',
        default_constraint_mode: 'none',
        default_target_days: null,
        default_target_hours: null,
      }));

    const subjectTargetsPromise = (!schoolYearLabel
      ? Promise.resolve({})
      : supabase
          .from('subject')
          .select('id, default_constraint_mode, default_target_days, default_target_hours')
          .eq('family_id', familyId)
          .eq('school_year', schoolYearLabel)
          .then(({ data, error }) => {
            if (error) throw error;
            const next = {};
            (data || []).forEach((row) => {
              const id = String(row?.id || '').trim();
              if (!id) return;
              next[id] = {
                default_constraint_mode: String(row?.default_constraint_mode || '').trim().toLowerCase(),
                default_target_days: parsePositiveInt(row?.default_target_days),
                default_target_hours: parsePositiveFloat(row?.default_target_hours),
              };
            });
            return next;
          })
          .catch(() => ({})));

    const instructionalPromise = (async () => {
      if (normalizedSubjectIds.length === 0 || !Number.isFinite(Number(startYear)) || !Number.isFinite(Number(endYear))) {
        return { instructionalEventsBySubject: {}, attendedDayKeysBySubject: {} };
      }
      const schoolYearRange = formatYmdFromTemplateYear(startYear, endYear, 'full_year');
      if (!schoolYearRange?.start_date || !schoolYearRange?.end_date) {
        return { instructionalEventsBySubject: {}, attendedDayKeysBySubject: {} };
      }
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .in('subject_id', normalizedSubjectIds)
        .gte('start_ts', `${schoolYearRange.start_date}T00:00:00`)
        .lte('start_ts', `${schoolYearRange.end_date}T23:59:59`)
        .is('deleted_at', null)
        .neq('is_backlog', true)
        .neq('status', 'canceled');
      if (error) throw error;
      const eventMetaById = {};
      (data || []).forEach((row) => {
        if (!isInstructionalEvent(row)) return;
        const eventId = row?.id ? String(row.id) : '';
        const subjectId = String(row?.subject_id || '').trim();
        if (!eventId || !subjectId) return;
        eventMetaById[eventId] = {
          subjectId,
          startDay: String(row?.start_ts || row?.due_ts || '').slice(0, 10),
        };
      });
      let attendanceRows = [];
      const attendanceEventIds = Object.keys(eventMetaById);
      if (attendanceEventIds.length > 0) {
        const { data: rawAttendanceRows } = await supabase
          .from('attendance_records')
          .select('event_id, day_date, status')
          .in('event_id', attendanceEventIds);
        attendanceRows = Array.isArray(rawAttendanceRows) ? rawAttendanceRows : [];
      }
      const nextBySubject = {};
      const attendedSetsBySubject = {};
      const attendedEventIds = new Set();
      attendanceRows.forEach((row) => {
        const eventId = String(row?.event_id || '').trim();
        const meta = eventMetaById[eventId];
        if (!meta?.subjectId) return;
        const status = String(row?.status || '').trim().toLowerCase();
        if (!(status === 'present' || status === 'partial')) return;
        attendedEventIds.add(eventId);
        const dayKey = String(row?.day_date || meta.startDay || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
        if (!attendedSetsBySubject[meta.subjectId]) attendedSetsBySubject[meta.subjectId] = new Set();
        attendedSetsBySubject[meta.subjectId].add(dayKey);
      });
      (data || []).forEach((row) => {
        if (!isInstructionalEvent(row)) return;
        const subjectId = String(row?.subject_id || '').trim();
        if (!subjectId) return;
        const tsMs = new Date(row?.start_ts || '').getTime();
        if (!Number.isFinite(tsMs)) return;
        const unitName = String(
          row?.unit || row?.curriculum_unit_title || row?.unit_name || row?.unit_topic || ''
        ).trim();
        const fromPlan = row?.generated_by === 'plan_year'
          || row?.instructional_status === 'PLAN_PLACEHOLDER'
          || Boolean(row?.source_block_id);
        if (!nextBySubject[subjectId]) nextBySubject[subjectId] = [];
        nextBySubject[subjectId].push({
          id: row?.id ? String(row.id) : `ev-${subjectId}-${tsMs}-${nextBySubject[subjectId].length}`,
          subject_id: subjectId,
          title: String(row?.title || row?.lesson_name || row?.event_type || 'Event').trim(),
          startTs: row?.start_ts || row?.due_ts || null,
          start_ts: row?.start_ts || row?.due_ts || null,
          due_ts: row?.due_ts || row?.start_ts || null,
          end_ts: row?.end_ts || null,
          startMs: tsMs,
          status: String(row?.status || '').trim().toLowerCase(),
          instructional_status: String(row?.instructional_status || '').trim().toUpperCase(),
          hasAttendancePresent: attendedEventIds.has(String(row?.id || '')),
          is_backlog: row?.is_backlog === true,
          sourceBlockId: String(row?.source_block_id || '').trim() || null,
          durationHours: Number.isFinite(Number(row?.duration_minutes)) && Number(row.duration_minutes) > 0
            ? Number(row.duration_minutes) / 60
            : (
              row?.start_ts && row?.end_ts
                ? Math.max(0, (new Date(row.end_ts).getTime() - new Date(row.start_ts).getTime()) / 3600000)
                : 0
            ),
          fromPlan,
          unitName: unitName || null,
        });
      });
      Object.keys(nextBySubject).forEach((subjectId) => {
        nextBySubject[subjectId].sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
      });
      const nextAttendedBySubject = {};
      Object.keys(attendedSetsBySubject).forEach((subjectId) => {
        nextAttendedBySubject[subjectId] = [...attendedSetsBySubject[subjectId]].sort();
      });
      return {
        instructionalEventsBySubject: nextBySubject,
        attendedDayKeysBySubject: nextAttendedBySubject,
      };
    })().catch(() => ({ instructionalEventsBySubject: {}, attendedDayKeysBySubject: {} }));

    const [familyPlannerSettings, subjectTargetSettingsById, instructional] = await Promise.all([
      familySettingsPromise,
      subjectTargetsPromise,
      instructionalPromise,
    ]);

    const payload = {
      familyPlannerSettings,
      subjectTargetSettingsById,
      instructionalEventsBySubject: instructional.instructionalEventsBySubject || {},
      attendedDayKeysBySubject: instructional.attendedDayKeysBySubject || {},
      subjectIdsSignature,
      updatedAt: Date.now(),
    };
    scheduleSupplementCacheByKey.set(key, payload);
    return payload;
  })().finally(() => {
    scheduleSupplementInflightByKey.delete(key);
  });

  scheduleSupplementInflightByKey.set(key, request);
  return request;
}

export async function preloadSubjectsScheduleData(
  familyId,
  {
    schoolYearLabel,
    startYear,
    endYear,
    subjectIds = [],
    force = false,
  } = {}
) {
  try {
    await fetchAndCacheScheduleSupplement({
      familyId,
      schoolYearLabel,
      startYear,
      endYear,
      subjectIds,
      force,
    });
    return true;
  } catch (_) {
    return false;
  }
}

export default function SubjectsPlanBuilder({
  familyId,
  planningMode = null,
  selectedYearFilter = 'all',
  selectedTermFilter = 'all',
  children = [],
  visibleSubjects = [],
  allSubjects = [],
  onDone,
  onOpenPlannerSettings,
}) {
  const toast = useToast();
  const presentScope = useMemo(() => getPresentAcademicScope(new Date()), []);
  const [surfaceMode, setSurfaceMode] = useState('home'); // home | builder
  const [overviewReloadKey, setOverviewReloadKey] = useState(0);
  const [overviewLoading, setOverviewLoading] = useState(() => !getCachedOverview(familyId));
  const [activeScheduleCore, setActiveScheduleCore] = useState(() => getCachedOverview(familyId)?.activeScheduleCore || null);
  const [subjectsWithAnyPlan, setSubjectsWithAnyPlan] = useState(() => getCachedOverview(familyId)?.subjectsWithAnyPlan || []);
  const [subjectsWithAnyPlanNames, setSubjectsWithAnyPlanNames] = useState(() => getCachedOverview(familyId)?.subjectsWithAnyPlanNames || []);
  const [otherPlans, setOtherPlans] = useState(() => getCachedOverview(familyId)?.otherPlans || []);
  const [planCores, setPlanCores] = useState(() => getCachedOverview(familyId)?.planCores || []);
  const [planSubjectIdsBySlot, setPlanSubjectIdsBySlot] = useState(() => getCachedOverview(familyId)?.planSubjectIdsBySlot || {});
  const [planSubjectNamesBySlot, setPlanSubjectNamesBySlot] = useState(() => getCachedOverview(familyId)?.planSubjectNamesBySlot || {});
  const hasValidFamilyId = useMemo(() => isUuidLike(familyId), [familyId]);
  const [loadingYears, setLoadingYears] = useState(() => !Array.isArray(schoolYearTemplateCache) || schoolYearTemplateCache.length === 0);
  const [schoolYearOptions, setSchoolYearOptions] = useState(() => (Array.isArray(schoolYearTemplateCache) ? schoolYearTemplateCache : []));
  const [selectedSchoolYearId, setSelectedSchoolYearId] = useState(() => {
    if (!Array.isArray(schoolYearTemplateCache) || schoolYearTemplateCache.length === 0) return null;
    const present = getPresentAcademicScope(new Date());
    const matching = schoolYearTemplateCache.find(
      (opt) => Number(opt?.start_year) === present.startYear && Number(opt?.end_year) === present.endYear
    );
    return matching?.id || schoolYearTemplateCache[0]?.id || null;
  });
  const [selectedTerm, setSelectedTerm] = useState(() => presentScope.termId);
  const lastAppliedScopeYearFilterRef = useRef(null);
  const [buildWithDefaults, setBuildWithDefaults] = useState(true);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showTermDropdown, setShowTermDropdown] = useState(false);
  const [showFullSchedulePreview, setShowFullSchedulePreview] = useState(false);
  const [showSubjectPickerModal, setShowSubjectPickerModal] = useState(false);
  const [subjectPickerAction, setSubjectPickerAction] = useState('add'); // add | edit
  const [saving, setSaving] = useState(false);
  const [applyingSuggestionSubjectId, setApplyingSuggestionSubjectId] = useState(null);
  const [expandedYearTargetSuggestionId, setExpandedYearTargetSuggestionId] = useState(null);
  const yearTargetChevronAnimByIdRef = useRef({});
  const yearTargetSuggestionAnimByIdRef = useRef({});
  const [blocksBySubject, setBlocksBySubject] = useState({});
  const [instructionalEventsBySubject, setInstructionalEventsBySubject] = useState({});
  const [attendedDayKeysBySubject, setAttendedDayKeysBySubject] = useState({});
  const [showSubjectEventsModal, setShowSubjectEventsModal] = useState(false);
  const [subjectEventsModalData, setSubjectEventsModalData] = useState({
    subjectName: '',
    termTitle: '',
    events: [],
  });
  const [showPastEventsAttendanceModal, setShowPastEventsAttendanceModal] = useState(false);
  const [attendanceModalData, setAttendanceModalData] = useState({
    subjectId: null,
    subjectName: '',
    events: [],
  });
  const [showUpcomingEventsModal, setShowUpcomingEventsModal] = useState(false);
  const [showApplySuggestionConfirmModal, setShowApplySuggestionConfirmModal] = useState(false);
  const [pendingSuggestionToApply, setPendingSuggestionToApply] = useState(null);
  const [markingAttendanceEventId, setMarkingAttendanceEventId] = useState(null);
  const [upcomingEventsModalData, setUpcomingEventsModalData] = useState({
    subjectId: null,
    subjectName: '',
    termTitle: '',
    events: [],
    hasPlan: false,
    schoolTermId: 'full_year',
  });
  const [eventsRefreshKey, setEventsRefreshKey] = useState(0);
  const [familyPlannerSettings, setFamilyPlannerSettings] = useState({
    target_scope: 'overall',
    default_constraint_mode: 'none',
    default_target_days: null,
    default_target_hours: null,
  });
  const [subjectTargetSettingsById, setSubjectTargetSettingsById] = useState({});

  const baseSubjects = useMemo(() => {
    if (Array.isArray(allSubjects) && allSubjects.length > 0) return allSubjects;
    if (Array.isArray(visibleSubjects)) return visibleSubjects;
    return [];
  }, [visibleSubjects, allSubjects]);
  const allSubjectPool = useMemo(() => (Array.isArray(allSubjects) ? allSubjects : baseSubjects), [allSubjects, baseSubjects]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hasCachedYears = Array.isArray(schoolYearTemplateCache) && schoolYearTemplateCache.length > 0;
      if (!hasCachedYears) setLoadingYears(true);
      const { data, error } = await supabase
        .from('school_year_templates')
        .select('id, start_year, end_year, label')
        .order('start_year', { ascending: true });
      if (cancelled) return;
      if (error || !Array.isArray(data) || data.length === 0) {
        const now = new Date();
        const y = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
        const fallback = [{ id: `${y}-${y + 1}`, label: `${y}/${String(y + 1).slice(-2)}`, start_year: y, end_year: y + 1 }];
        schoolYearTemplateCache = fallback;
        setSchoolYearOptions(fallback);
        setSelectedSchoolYearId(fallback[0].id);
        setLoadingYears(false);
        return;
      }
      const mapped = data.map((row) => ({
        id: String(row.id),
        label: String(row.label || `${row.start_year}/${String(row.end_year).slice(-2)}`),
        start_year: Number(row.start_year),
        end_year: Number(row.end_year),
      }));
      schoolYearTemplateCache = mapped;
      setSchoolYearOptions(mapped);
      setSelectedSchoolYearId((prev) => {
        if (prev) return prev;
        const matching = mapped.find(
          (opt) => Number(opt?.start_year) === presentScope.startYear && Number(opt?.end_year) === presentScope.endYear
        );
        return matching?.id || mapped[0]?.id || null;
      });
      setLoadingYears(false);
    })();
    return () => { cancelled = true; };
  }, [presentScope.startYear, presentScope.endYear]);

  useEffect(() => {
    const ids = baseSubjects.map((s) => String(s?.id)).filter(Boolean);
    setSelectedSubjectIds(ids);
  }, [baseSubjects]);

  useEffect(() => {
    setBlocksBySubject((prev) => {
      const next = { ...prev };
      (selectedSubjectIds || []).forEach((sid) => {
        if (!next[sid]) next[sid] = { weekdays: [1], start_time: '09:00', end_time: '10:00' };
      });
      Object.keys(next).forEach((sid) => {
        if (!selectedSubjectIds.includes(sid)) delete next[sid];
      });
      return next;
    });
  }, [selectedSubjectIds]);

  const selectedSchoolYear = useMemo(
    () => schoolYearOptions.find((opt) => String(opt.id) === String(selectedSchoolYearId || '')) || null,
    [schoolYearOptions, selectedSchoolYearId]
  );
  const selectedTermOption = useMemo(() => TERM_OPTIONS.find((x) => x.id === selectedTerm) || TERM_OPTIONS[0], [selectedTerm]);
  const currentUserMode = useMemo(() => normalizePlanningMode(planningMode), [planningMode]);
  const isHomeschoolMode = currentUserMode === 'homeschool';
  const displaySchoolYear = useMemo(() => selectedSchoolYear, [selectedSchoolYear]);
  const displayTerm = useMemo(() => {
    if (selectedTermFilter === 'fall_term' || selectedTermFilter === 'spring_term' || selectedTermFilter === 'full_year') {
      return selectedTermFilter;
    }
    return selectedTerm;
  }, [selectedTermFilter, selectedTerm]);
  const slotScopedSubjects = useMemo(() => (
    (baseSubjects || []).filter((subject) => subjectMatchesYearTerm(subject, selectedSchoolYear?.label, selectedTerm))
  ), [baseSubjects, selectedSchoolYear?.label, selectedTerm]);
  const homeSlotScopedSubjects = useMemo(() => (
    (baseSubjects || []).filter((subject) => subjectMatchesYearTerm(subject, displaySchoolYear?.label, displayTerm))
  ), [baseSubjects, displaySchoolYear?.label, displayTerm]);
  const dateRange = useMemo(
    () => (selectedSchoolYear ? formatYmdFromTemplateYear(selectedSchoolYear.start_year, selectedSchoolYear.end_year, selectedTerm) : null),
    [selectedSchoolYear, selectedTerm]
  );

  const selectedSubjectRows = useMemo(
    () => baseSubjects.filter((s) => selectedSubjectIds.includes(String(s?.id))),
    [baseSubjects, selectedSubjectIds]
  );
  const childNameById = useMemo(() => {
    const map = {};
    (children || []).forEach((child) => {
      const id = String(child?.id || '').trim();
      if (!id) return;
      map[id] = String(child?.first_name || child?.name || 'Student').trim();
    });
    return map;
  }, [children]);
  const allChildIds = useMemo(
    () => (children || []).map((child) => String(child?.id || '').trim()).filter(Boolean),
    [children]
  );

  useEffect(() => {
    let cancelled = false;
    const schoolYearLabel = String(displaySchoolYear?.label || '').trim();
    const subjectIds = (baseSubjects || []).map((s) => String(s?.id || '').trim()).filter(Boolean);
    const subjectIdsSignature = [...new Set(subjectIds)].sort().join(',');

    const hydrateFromCache = () => {
      const cached = getCachedScheduleSupplement(familyId, schoolYearLabel);
      if (!cached) return false;
      setFamilyPlannerSettings(cached.familyPlannerSettings || {
        target_scope: 'overall',
        default_constraint_mode: 'none',
        default_target_days: null,
        default_target_hours: null,
      });
      setSubjectTargetSettingsById(cached.subjectTargetSettingsById || {});
      setInstructionalEventsBySubject(cached.instructionalEventsBySubject || {});
      setAttendedDayKeysBySubject(cached.attendedDayKeysBySubject || {});
      return String(cached.subjectIdsSignature || '') === subjectIdsSignature;
    };

    const sync = async ({ force = false } = {}) => {
      if (!hasValidFamilyId || !schoolYearLabel) return;
      const payload = await fetchAndCacheScheduleSupplement({
        familyId,
        schoolYearLabel,
        startYear: displaySchoolYear?.start_year,
        endYear: displaySchoolYear?.end_year,
        subjectIds,
        force,
      });
      if (cancelled) return;
      setFamilyPlannerSettings(payload.familyPlannerSettings || {
        target_scope: 'overall',
        default_constraint_mode: 'none',
        default_target_days: null,
        default_target_hours: null,
      });
      setSubjectTargetSettingsById(payload.subjectTargetSettingsById || {});
      setInstructionalEventsBySubject(payload.instructionalEventsBySubject || {});
      setAttendedDayKeysBySubject(payload.attendedDayKeysBySubject || {});
    };

    (async () => {
      if (!hasValidFamilyId || !schoolYearLabel) {
        setFamilyPlannerSettings({
          target_scope: 'overall',
          default_constraint_mode: 'none',
          default_target_days: null,
          default_target_hours: null,
        });
        setSubjectTargetSettingsById({});
        setInstructionalEventsBySubject({});
        setAttendedDayKeysBySubject({});
        return;
      }
      const cacheMatchesSubjects = hydrateFromCache();
      const mustForce = overviewReloadKey > 0 || eventsRefreshKey > 0 || !cacheMatchesSubjects;
      try {
        await sync({ force: mustForce });
      } catch (_) {
        if (!cancelled && !cacheMatchesSubjects) {
          setSubjectTargetSettingsById({});
          setInstructionalEventsBySubject({});
          setAttendedDayKeysBySubject({});
        }
      }
    })();

    return () => { cancelled = true; };
  }, [
    familyId,
    hasValidFamilyId,
    displaySchoolYear?.label,
    displaySchoolYear?.start_year,
    displaySchoolYear?.end_year,
    baseSubjects,
    overviewReloadKey,
    eventsRefreshKey,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const bump = () => setEventsRefreshKey((prev) => prev + 1);
    window.addEventListener('eventCreated', bump);
    window.addEventListener('eventUpdated', bump);
    window.addEventListener('eventDeleted', bump);
    window.addEventListener('refreshSubjects', bump);
    return () => {
      window.removeEventListener('eventCreated', bump);
      window.removeEventListener('eventUpdated', bump);
      window.removeEventListener('eventDeleted', bump);
      window.removeEventListener('refreshSubjects', bump);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrateFromCache = () => {
      const cached = getCachedOverview(familyId);
      if (!cached) return false;
      setActiveScheduleCore(cached.activeScheduleCore || null);
      setSubjectsWithAnyPlan(Array.isArray(cached.subjectsWithAnyPlan) ? cached.subjectsWithAnyPlan : []);
      setSubjectsWithAnyPlanNames(Array.isArray(cached.subjectsWithAnyPlanNames) ? cached.subjectsWithAnyPlanNames : []);
      setOtherPlans(Array.isArray(cached.otherPlans) ? cached.otherPlans : []);
      setPlanCores(Array.isArray(cached.planCores) ? cached.planCores : []);
      setPlanSubjectIdsBySlot(cached.planSubjectIdsBySlot && typeof cached.planSubjectIdsBySlot === 'object' ? cached.planSubjectIdsBySlot : {});
      setPlanSubjectNamesBySlot(cached.planSubjectNamesBySlot && typeof cached.planSubjectNamesBySlot === 'object' ? cached.planSubjectNamesBySlot : {});
      setOverviewLoading(false);
      return true;
    };
    const syncOverview = async ({ force = false } = {}) => {
      if (!hasValidFamilyId) return;
      try {
        const payload = await fetchAndCacheOverview(familyId, { force });
        if (cancelled) return;
        setActiveScheduleCore(payload.activeScheduleCore || null);
        setSubjectsWithAnyPlan(Array.isArray(payload.subjectsWithAnyPlan) ? payload.subjectsWithAnyPlan : []);
        setSubjectsWithAnyPlanNames(Array.isArray(payload.subjectsWithAnyPlanNames) ? payload.subjectsWithAnyPlanNames : []);
        setOtherPlans(Array.isArray(payload.otherPlans) ? payload.otherPlans : []);
        setPlanCores(Array.isArray(payload.planCores) ? payload.planCores : []);
        setPlanSubjectIdsBySlot(payload.planSubjectIdsBySlot && typeof payload.planSubjectIdsBySlot === 'object' ? payload.planSubjectIdsBySlot : {});
        setPlanSubjectNamesBySlot(payload.planSubjectNamesBySlot && typeof payload.planSubjectNamesBySlot === 'object' ? payload.planSubjectNamesBySlot : {});
        setOverviewLoading(false);
      } catch (_) {
        if (cancelled) return;
        const hasCache = hydrateFromCache();
        if (!hasCache) {
          setActiveScheduleCore(null);
          setSubjectsWithAnyPlan([]);
          setSubjectsWithAnyPlanNames([]);
          setOtherPlans([]);
          setPlanCores([]);
          setPlanSubjectIdsBySlot({});
          setPlanSubjectNamesBySlot({});
          setOverviewLoading(false);
        }
      }
    };
    (async () => {
      if (!hasValidFamilyId) {
        setActiveScheduleCore(null);
        setSubjectsWithAnyPlan([]);
        setSubjectsWithAnyPlanNames([]);
        setOtherPlans([]);
        setPlanCores([]);
        setPlanSubjectIdsBySlot({});
        setPlanSubjectNamesBySlot({});
        setOverviewLoading(false);
        return;
      }
      const hadCache = hydrateFromCache();
      if (!hadCache) setOverviewLoading(true);
      await syncOverview({ force: !hadCache || overviewReloadKey > 0 });
    })();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleOverviewInvalidation = () => {
        syncOverview({ force: true });
      };
      window.addEventListener('planAppliedToCalendar', handleOverviewInvalidation);
      window.addEventListener('refreshPlanHealth', handleOverviewInvalidation);
      return () => {
        cancelled = true;
        window.removeEventListener('planAppliedToCalendar', handleOverviewInvalidation);
        window.removeEventListener('refreshPlanHealth', handleOverviewInvalidation);
      };
    }
    return () => { cancelled = true; };
  }, [familyId, hasValidFamilyId, overviewReloadKey]);

  const activeSchedule = useMemo(() => {
    if (!activeScheduleCore) return null;
    const subjectNames = (activeScheduleCore.subjectIds || [])
      .map((sid) => baseSubjects.find((s) => String(s?.id) === String(sid))?.name)
      .filter(Boolean);
    return {
      ...activeScheduleCore,
      subjectNames,
    };
  }, [activeScheduleCore, baseSubjects]);

  const viewedScheduleCore = useMemo(() => {
    if (!displaySchoolYear) return null;
    const selectedStartYear = Number(displaySchoolYear?.start_year);
    const selectedScope = String(displayTerm || '').trim();
    if (!Number.isFinite(selectedStartYear) || !selectedScope) return null;
    return (planCores || []).find((core) => (
      Number(core?.startYear) === selectedStartYear
      && String(core?.scopeId || '').trim() === selectedScope
    )) || null;
  }, [planCores, displaySchoolYear, displayTerm]);

  const buildDayRowsFromBlocks = useCallback((blocksLite = []) => (
    WEEKDAY_NUMBERS.map((dayNum) => {
      const dayEntries = (blocksLite || [])
        .filter((block) => Array.isArray(block.weekdays) && block.weekdays.includes(dayNum))
        .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
        .flatMap((block) => {
          const ids = Array.isArray(block.subject_ids) ? block.subject_ids : [];
          const scopeId = normalizeSubjectTerm(block?.scopeId);
          const termLabel = formatScheduleScopeChipLabel(scopeId);
          if (ids.length === 0) return [];
          return ids.map((sid) => {
            const subjectName = allSubjectPool.find((s) => String(s?.id) === String(sid))?.name || 'Subject';
            return { subjectName, startTime: block.start_time || '09:00', termLabel };
          });
        });
      return {
        key: `day-${dayNum}`,
        dayLabel: WEEKDAY_FULL_LABELS[dayNum] || WEEKDAY_LABELS[dayNum] || `Day ${dayNum}`,
        dayEntries,
      };
    })
  ), [allSubjectPool]);

  useEffect(() => {
    if (selectedYearFilter === 'all') return;
    const scopeYearKey = String(selectedYearFilter).trim();
    if (!scopeYearKey) return;
    if (lastAppliedScopeYearFilterRef.current === scopeYearKey) return;
    const matched = schoolYearOptions.find(
      (opt) => String(opt?.label || '').trim() === scopeYearKey
    );
    if (!matched?.id) return;
    if (String(matched.id) !== String(selectedSchoolYearId || '')) {
      setSelectedSchoolYearId(matched.id);
    }
    lastAppliedScopeYearFilterRef.current = scopeYearKey;
  }, [selectedYearFilter, schoolYearOptions, selectedSchoolYearId]);

  const termSections = useMemo(() => {
    if (!displaySchoolYear) return [];
    const selectedStartYear = Number(displaySchoolYear?.start_year);
    const selectedEndYear = Number(displaySchoolYear?.end_year);
    if (!Number.isFinite(selectedStartYear)) return [];
    const now = new Date();
    const nowMs = now.getTime();
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (!Number.isFinite(selectedEndYear)) return [];
    const yearRange = formatYmdFromTemplateYear(selectedStartYear, selectedEndYear, 'full_year');
    const fallRange = formatYmdFromTemplateYear(selectedStartYear, selectedEndYear, 'fall_term');
    const springRange = formatYmdFromTemplateYear(selectedStartYear, selectedEndYear, 'spring_term');
    const scopeRangeById = {
      full_year: yearRange,
      fall_term: fallRange,
      spring_term: springRange,
    };
    const todayCapYmd = yearRange
      ? (todayYmd > yearRange.end_date ? yearRange.end_date : (todayYmd < yearRange.start_date ? yearRange.start_date : todayYmd))
      : todayYmd;
    const totalWeeksInYear = yearRange
      ? Math.max(1, daysBetweenInclusive(yearRange.start_date, yearRange.end_date) / 7)
      : 1;
    const elapsedWeeksInYear = yearRange
      ? Math.max(0, daysBetweenInclusive(yearRange.start_date, todayCapYmd) / 7)
      : 0;
    const remainingWeeksInYear = Math.max(0, totalWeeksInYear - elapsedWeeksInYear);
    const relevantScopeIds = ['fall_term', 'spring_term', 'full_year'];
    const relevantCores = (planCores || []).filter((row) => (
      Number(row?.startYear) === selectedStartYear
      && relevantScopeIds.includes(String(row?.scopeId || '').trim())
    ));
    const blocks = relevantCores.flatMap((core) => {
      const scopeId = String(core?.scopeId || '').trim();
      return (Array.isArray(core?.blocksLite) ? core.blocksLite : []).map((block) => ({ ...block, scopeId }));
    });
    const dayRows = buildDayRowsFromBlocks(blocks);
    const daySet = new Set(
      blocks.flatMap((block) => (
        Array.isArray(block?.weekdays)
          ? block.weekdays.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
          : []
      ))
    );
    const scheduledWeekdays = [...daySet];
    const rangeStartMs = yearRange?.start_date ? new Date(`${yearRange.start_date}T00:00:00`).getTime() : null;
    const rangeEndMs = yearRange?.end_date ? new Date(`${yearRange.end_date}T23:59:59`).getTime() : null;
    const plannedDays = yearRange
      ? countOccurrencesInRange(yearRange.start_date, yearRange.end_date, scheduledWeekdays)
      : 0;
    const completedDays = yearRange
      ? countOccurrencesInRange(yearRange.start_date, todayYmd > yearRange.end_date ? yearRange.end_date : todayYmd, scheduledWeekdays)
      : 0;
    const status = !yearRange
      ? 'Unknown'
      : (todayYmd > yearRange.end_date ? 'Complete' : (todayYmd < yearRange.start_date ? 'Upcoming' : 'In progress'));

    const slotSubjectIds = relevantScopeIds.flatMap((scopeId) => {
      const slotKey = buildPlanSlotKey(selectedStartYear, scopeId);
      return slotKey ? (planSubjectIdsBySlot?.[slotKey] || []) : [];
    });
    const slotSubjectNames = relevantScopeIds.flatMap((scopeId) => {
      const slotKey = buildPlanSlotKey(selectedStartYear, scopeId);
      return slotKey ? (planSubjectNamesBySlot?.[slotKey] || []) : [];
    });
    const healthSubjectTargetsRaw = activeScheduleCore?.health?.subject_targets;
    const healthSubjectTargets = (
      healthSubjectTargetsRaw && typeof healthSubjectTargetsRaw === 'object' && !Array.isArray(healthSubjectTargetsRaw)
    ) ? healthSubjectTargetsRaw : {};
    const healthConstraintMode = String(activeScheduleCore?.health?.constraint_mode || '').trim().toLowerCase();
    const healthTargetDays = parsePositiveInt(activeScheduleCore?.health?.target_days);
    const healthTargetHours = parsePositiveFloat(activeScheduleCore?.health?.target_hours);
    const healthPlanTarget = healthConstraintMode === 'days'
      ? (healthTargetDays != null ? { mode: 'days', target_days: healthTargetDays, target_hours: null } : null)
      : (healthConstraintMode === 'hours'
        ? (healthTargetHours != null ? { mode: 'hours', target_days: null, target_hours: healthTargetHours } : null)
        : null);
    const settingsScope = String(familyPlannerSettings?.target_scope || 'overall').trim().toLowerCase();
    const settingsMode = String(familyPlannerSettings?.default_constraint_mode || '').trim().toLowerCase();
    const settingsTargetDays = parsePositiveInt(familyPlannerSettings?.default_target_days);
    const settingsTargetHours = parsePositiveFloat(familyPlannerSettings?.default_target_hours);
    const familySettingsTarget = settingsScope === 'overall'
      ? (
        settingsMode === 'days'
          ? (settingsTargetDays != null ? { mode: 'days', target_days: settingsTargetDays, target_hours: null } : null)
          : (settingsMode === 'hours'
            ? (settingsTargetHours != null ? { mode: 'hours', target_days: null, target_hours: settingsTargetHours } : null)
            : null)
      )
      : null;
    const plannedSet = new Set((slotSubjectIds || []).map((id) => String(id)));
    const plannedNameSet = new Set((slotSubjectNames || []).map((name) => normalizeSubjectName(name)));
    const subjectsInYear = (baseSubjects || []).filter(
      (subject) => String(subject?.school_year || '').trim() === String(displaySchoolYear?.label || '').trim()
    );
    const subjectPlans = subjectsInYear.map((subject) => {
      const subjectId = String(subject?.id || '');
      const normalizedName = normalizeSubjectName(subject?.name);
      const subjectTermId = normalizeSubjectTerm(subject?.school_term);
      const subjectSettings = subjectTargetSettingsById?.[subjectId] || null;
      const blocksForSubject = blocks.filter((block) =>
        Array.isArray(block?.subject_ids) && block.subject_ids.some((sid) => String(sid) === subjectId)
      );
      const weekdaysByScope = {};
      const cadenceDayNums = [
        ...new Set(
          (blocksForSubject || []).flatMap((block) =>
            Array.isArray(block?.weekdays)
              ? block.weekdays.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
              : []
          )
        ),
      ].sort((a, b) => a - b);
      blocksForSubject.forEach((block) => {
        const scopeId = normalizeSubjectTerm(block?.scopeId || subjectTermId || 'full_year');
        if (!weekdaysByScope[scopeId]) weekdaysByScope[scopeId] = new Set();
        (Array.isArray(block?.weekdays) ? block.weekdays : []).forEach((day) => {
          const asInt = Number(day);
          if (Number.isInteger(asInt) && asInt >= 0 && asInt <= 6) weekdaysByScope[scopeId].add(asInt);
        });
      });
      const plannedCapacityDays = Object.entries(weekdaysByScope).reduce((sum, [scopeId, weekdays]) => {
        const range = scopeRangeById[scopeId] || yearRange;
        if (!range?.start_date || !range?.end_date) return sum;
        return sum + countOccurrencesInRange(range.start_date, range.end_date, [...weekdays]);
      }, 0);
      const attachedIds = Array.isArray(subject?.assignedChildren)
        ? subject.assignedChildren.map((id) => String(id)).filter(Boolean)
        : [];
      const effectiveAttachedIds = attachedIds.length > 0 ? attachedIds : allChildIds;
      const attachedStudentNames = effectiveAttachedIds
        .map((childId) => childNameById[String(childId)] || null)
        .filter(Boolean);
      const eventItems = instructionalEventsBySubject?.[subjectId] || [];
      const attendedDaySet = new Set();
      const upcomingDaySet = new Set();
      const yearEventItemsByDay = new Map();
      const attendanceDayKeys = Array.isArray(attendedDayKeysBySubject?.[subjectId])
        ? attendedDayKeysBySubject[subjectId]
        : [];
      attendanceDayKeys.forEach((dayKey) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dayKey || ''))) return;
        const dayMs = new Date(`${String(dayKey).slice(0, 10)}T12:00:00`).getTime();
        if (!Number.isFinite(dayMs)) return;
        if (Number.isFinite(rangeStartMs) && dayMs < rangeStartMs) return;
        if (Number.isFinite(rangeEndMs) && dayMs > rangeEndMs) return;
        if (dayMs > nowMs) return;
        attendedDaySet.add(String(dayKey).slice(0, 10));
      });
      eventItems.forEach((eventItem) => {
        const eventMs = Number(eventItem?.startMs);
        if (!Number.isFinite(eventMs)) return;
        if (Number.isFinite(rangeStartMs) && eventMs < rangeStartMs) return;
        if (Number.isFinite(rangeEndMs) && eventMs > rangeEndMs) return;
        const dayKey = new Date(eventMs).toISOString().slice(0, 10);
        if (!dayKey) return;
        if (!yearEventItemsByDay.has(dayKey)) yearEventItemsByDay.set(dayKey, eventItem);
        if (eventMs >= nowMs) upcomingDaySet.add(dayKey);
      });
      const yearEventItems = [...yearEventItemsByDay.values()]
        .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
      const pastEventsCount = attendedDaySet.size;
      const plannedEventsCount = upcomingDaySet.size;
      const plannedLessonsCountForTarget = yearEventItems.length;
      const plannedLessonsHoursForTarget = yearEventItems.reduce(
        (sum, item) => sum + (Number(item?.durationHours) || 0),
        0
      );
      const scopePriority = [...new Set([subjectTermId, 'full_year', 'fall_term', 'spring_term'])];
      const targetFromPlan = scopePriority.reduce((found, scopeId) => {
        if (found) return found;
        const matchingCore = relevantCores.find((core) => String(core?.scopeId || '').trim() === scopeId);
        if (!matchingCore || !matchingCore?.subjectTargets || typeof matchingCore.subjectTargets !== 'object') return null;
        return matchingCore.subjectTargets[subjectId] || null;
      }, null);
      const planLevelTarget = scopePriority.reduce((found, scopeId) => {
        if (found) return found;
        const matchingCore = relevantCores.find((core) => String(core?.scopeId || '').trim() === scopeId);
        if (!matchingCore || !matchingCore?.planTarget) return null;
        return matchingCore.planTarget;
      }, null);
      const healthSubjectTargetRaw = healthSubjectTargets?.[subjectId];
      const healthSubjectTarget = (
        healthSubjectTargetRaw && typeof healthSubjectTargetRaw === 'object' && !Array.isArray(healthSubjectTargetRaw)
      )
        ? {
          mode: healthSubjectTargetRaw?.target_days != null ? 'days' : (healthSubjectTargetRaw?.target_hours != null ? 'hours' : null),
          target_days: parsePositiveInt(healthSubjectTargetRaw?.target_days),
          target_hours: parsePositiveFloat(healthSubjectTargetRaw?.target_hours),
        }
        : null;
      const subjectSettingsMode = String(subjectSettings?.default_constraint_mode || subject?.default_constraint_mode || '').trim().toLowerCase();
      const subjectSettingsDays = parsePositiveInt(subjectSettings?.default_target_days ?? subject?.default_target_days);
      const subjectSettingsHours = parsePositiveFloat(subjectSettings?.default_target_hours ?? subject?.default_target_hours);
      const perSubjectSettingsTarget = settingsScope === 'per_subject'
        ? (
          subjectSettingsMode === 'days'
            ? (subjectSettingsDays != null ? { mode: 'days', target_days: subjectSettingsDays, target_hours: null } : null)
            : (subjectSettingsMode === 'hours'
              ? (subjectSettingsHours != null ? { mode: 'hours', target_days: null, target_hours: subjectSettingsHours } : null)
              : (subjectSettingsDays != null && subjectSettingsHours == null
                ? { mode: 'days', target_days: subjectSettingsDays, target_hours: null }
                : (subjectSettingsHours != null && subjectSettingsDays == null
                  ? { mode: 'hours', target_days: null, target_hours: subjectSettingsHours }
                  : null)))
        )
        : null;
      const targetMode = String(
        targetFromPlan?.mode
        || perSubjectSettingsTarget?.mode
        || familySettingsTarget?.mode
        || planLevelTarget?.mode
        || healthSubjectTarget?.mode
        || healthPlanTarget?.mode
        || subjectSettingsMode
        || ''
      ).trim().toLowerCase();
      const targetDays = parsePositiveInt(
        targetFromPlan?.target_days
        ?? perSubjectSettingsTarget?.target_days
        ?? familySettingsTarget?.target_days
        ?? planLevelTarget?.target_days
        ?? healthSubjectTarget?.target_days
        ?? healthPlanTarget?.target_days
        ?? subjectSettingsDays
      );
      const targetHours = parsePositiveFloat(
        targetFromPlan?.target_hours
        ?? perSubjectSettingsTarget?.target_hours
        ?? familySettingsTarget?.target_hours
        ?? planLevelTarget?.target_hours
        ?? healthSubjectTarget?.target_hours
        ?? healthPlanTarget?.target_hours
        ?? subjectSettingsHours
      );
      const statusMode = targetMode === 'hours'
        ? 'hours'
        : (targetMode === 'days'
          ? 'days'
          : (targetDays != null && targetHours == null
            ? 'days'
            : (targetHours != null && targetDays == null ? 'hours' : null)));
      const targetValue = statusMode === 'hours' ? targetHours : (statusMode === 'days' ? targetDays : null);
      const actualValue = statusMode === 'hours'
        ? plannedLessonsHoursForTarget
        : (statusMode === 'days' ? plannedLessonsCountForTarget : null);
      const actualDays = pastEventsCount;
      const projectedDays = plannedCapacityDays > 0 ? plannedCapacityDays : plannedLessonsCountForTarget;
      const targetProgressStatus = resolveTargetStatusFromPlanned({
        actualValue: statusMode === 'days' ? projectedDays : actualValue,
        targetValue,
      });
      const targetDaysValue = statusMode === 'days' ? Number(targetValue) : null;
      const shortfallDays = targetDaysValue != null ? Math.max(0, targetDaysValue - projectedDays) : null;
      const actualShortfallDays = targetDaysValue != null ? Math.max(0, targetDaysValue - actualDays) : null;
      const currentPaceDaysPerWeek = elapsedWeeksInYear > 0 ? toOneDecimal(actualDays / elapsedWeeksInYear) : 0;
      const requiredPaceDaysPerWeek = targetDaysValue != null ? toOneDecimal(targetDaysValue / totalWeeksInYear) : 0;
      const catchUpDaysPerWeek = targetDaysValue != null && remainingWeeksInYear > 0
        ? Math.max(1, Math.ceil(Math.max(0, targetDaysValue - actualDays) / remainingWeeksInYear))
        : 0;
      const weeksBehind = targetDaysValue != null && requiredPaceDaysPerWeek > 0
        ? Math.max(0, Math.round((Math.max(0, targetDaysValue - actualDays) / requiredPaceDaysPerWeek)))
        : 0;
      let actionType = 'set_target';
      let actionLabel = 'Set target';
      let statusLabel = 'Target needed';
      if (targetDaysValue != null) {
        if (!blocksForSubject.length && actualDays <= 0) {
          actionType = 'generate_plan';
          actionLabel = 'Generate plan';
          statusLabel = 'Not started';
        } else if ((shortfallDays || 0) <= 0) {
          actionType = 'keep_plan';
          actionLabel = 'Keep plan';
          statusLabel = 'On track';
        } else if (remainingWeeksInYear > 0 && (shortfallDays / remainingWeeksInYear) <= 2) {
          actionType = 'increase_pace';
          actionLabel = `Add ${Math.max(1, Math.ceil(shortfallDays / remainingWeeksInYear))} day/week`;
          statusLabel = 'Behind but recoverable';
        } else {
          actionType = 'rebaseline';
          actionLabel = 'Extend end date or reduce target';
          statusLabel = 'Unrecoverable at current cadence';
        }
      }
      const schoolTermId = subjectTermId;
      const subjectRange = scopeRangeById[schoolTermId] || yearRange;
      const schoolTermLabel = schoolTermId === 'full_year' ? '' : formatScheduleScopeLabel(schoolTermId);
      return {
        id: subjectId,
        name: subject?.name || 'Subject',
        schoolTermId,
        schoolTermLabel,
        rangeStartYmd: subjectRange?.start_date || yearRange?.start_date || null,
        rangeEndYmd: subjectRange?.end_date || yearRange?.end_date || null,
        cadenceDayNums,
        hasPlan: (subjectId ? plannedSet.has(subjectId) : false) || (normalizedName ? plannedNameSet.has(normalizedName) : false),
        cadenceText: formatSubjectCadence(blocksForSubject),
        cadenceCompactLabel: formatSubjectCadenceCompact(blocksForSubject),
        pastEventsCount,
        plannedEventsCount,
        eventItems: yearEventItems,
        targetProgressStatus,
        targetUnit: statusMode,
        targetValue,
        actualDays,
        projectedDays,
        plannedCapacityDays: projectedDays,
        shortfallDays,
        actualShortfallDays,
        currentPaceDaysPerWeek,
        requiredPaceDaysPerWeek,
        catchUpDaysPerWeek,
        weeksBehind,
        totalWeeksInYear,
        elapsedWeeksInYear,
        remainingWeeksInYear,
        statusLabel,
        actionType,
        actionLabel,
        attachedStudentIds: effectiveAttachedIds,
        attachedStudentsLabel: attachedStudentNames.join(', '),
      };
    });

    return [{
      id: 'school_year',
      title: 'Weekly Cadence',
      status,
      plannedDays,
      completedDays,
      dayRows,
      subjectPlans,
    }];
  }, [displaySchoolYear, planCores, buildDayRowsFromBlocks, planSubjectIdsBySlot, planSubjectNamesBySlot, baseSubjects, allChildIds, childNameById, instructionalEventsBySubject, attendedDayKeysBySubject, activeScheduleCore, familyPlannerSettings, subjectTargetSettingsById]);

  const trackingMode = useMemo(() => {
    const scope = String(familyPlannerSettings?.target_scope || 'overall').trim().toLowerCase();
    return scope === 'per_subject' ? 'per_subject' : 'overall';
  }, [familyPlannerSettings?.target_scope]);

  const yearTargetSummary = useMemo(() => {
    const perSubjectRows = (termSections || [])
      .flatMap((section) => section?.subjectPlans || [])
      .filter((row) => row?.targetUnit === 'days' && Number.isFinite(Number(row?.targetValue)) && Number(row?.targetValue) > 0)
      .map((row) => {
        const targetDays = Number(row.targetValue);
        const completedDays = Math.max(0, Number(row.actualDays || 0));
        const plannedProjectedDays = Math.max(0, Number(row.plannedCapacityDays || row.projectedDays || 0));
        const projectedDays = Math.max(completedDays, plannedProjectedDays);
        const upcomingDays = Math.max(0, projectedDays - completedDays);
        const gapDays = projectedDays - targetDays;
        const requiredPace = Number(row.requiredPaceDaysPerWeek || 0);
        const currentPace = Number(row.currentPaceDaysPerWeek || 0);
        return {
          ...row,
          targetDays,
          completedDays,
          upcomingDays,
          projectedDays,
          gapDays,
          shortDays: Math.max(0, targetDays - projectedDays),
          requiredPace,
          currentPace,
          progressPct: Math.max(0, Math.min(100, Math.round((completedDays / targetDays) * 100))),
        };
      });

    if (perSubjectRows.length === 0) return null;
    const first = perSubjectRows[0] || {};
    const overallTargetFromSettings = parsePositiveInt(familyPlannerSettings?.default_target_days);
    const totalTargetDays = perSubjectRows.reduce((sum, row) => sum + Number(row.targetDays || 0), 0);
    const totalCompletedDays = perSubjectRows.reduce((sum, row) => sum + Number(row.completedDays || 0), 0);
    const totalUpcomingDays = perSubjectRows.reduce((sum, row) => sum + Number(row.upcomingDays || 0), 0);
    const totalProjectedDays = perSubjectRows.reduce((sum, row) => sum + Number(row.projectedDays || 0), 0);
    const totalGapDays = totalProjectedDays - totalTargetDays;
    const elapsedWeeks = Math.max(0.1, Number(first.elapsedWeeksInYear || 0.1));
    const planningWeeks = Math.max(
      1,
      ...perSubjectRows.map((row) => Math.max(1, Number(row.totalWeeksInYear || 0)))
    );
    const remainingWeeks = Math.max(0, Number(first.remainingWeeksInYear || 0));
    const currentPaceDaysPerWeek = toOneDecimal(totalCompletedDays / elapsedWeeks);
    const projectedFinishDays = Math.round(totalCompletedDays + (currentPaceDaysPerWeek * remainingWeeks));
    const totalShortfall = Math.max(0, totalTargetDays - projectedFinishDays);
    const gapShortfallDays = Math.max(0, totalTargetDays - totalProjectedDays);
    const additionalDaysPerWeekRaw = gapShortfallDays / planningWeeks;
    const catchUpDaysPerWeek = additionalDaysPerWeekRaw > 0 ? Math.min(7, Math.max(1, Math.floor(additionalDaysPerWeekRaw))) : 0;
    const catchUpDaysPerWeekHigh = additionalDaysPerWeekRaw > 0 ? Math.min(7, Math.max(catchUpDaysPerWeek, Math.ceil(additionalDaysPerWeekRaw))) : 0;
    const extendWeeks = additionalDaysPerWeekRaw > 0 ? Math.min(52, Math.max(1, Math.ceil(gapShortfallDays / Math.max(1, currentPaceDaysPerWeek || 1)))) : 0;
    const projectedCompletionPct = totalTargetDays > 0 ? Math.round((totalProjectedDays / totalTargetDays) * 100) : 0;
    const approxProjectedCompletionPct = Math.max(0, Math.round(projectedCompletionPct / 5) * 5);
    const nowMs = Date.now();
    const completedDaySet = new Set();
    const upcomingDaySet = new Set();
    const projectedDaySet = new Set();
    perSubjectRows.forEach((row) => {
      (Array.isArray(row?.eventItems) ? row.eventItems : []).forEach((eventItem) => {
        const eventMs = Number(eventItem?.startMs || new Date(eventItem?.startTs || '').getTime());
        if (!Number.isFinite(eventMs)) return;
        const dayKey = new Date(eventMs).toISOString().slice(0, 10);
        projectedDaySet.add(dayKey);
        if (eventMs < nowMs) completedDaySet.add(dayKey);
        else upcomingDaySet.add(dayKey);
      });
    });
    const overallCompletedDays = completedDaySet.size;
    const overallUpcomingDays = upcomingDaySet.size;
    const overallProjectedDays = projectedDaySet.size;
    const overallTargetDays = overallTargetFromSettings != null ? overallTargetFromSettings : totalTargetDays;
    const overallGapDays = overallProjectedDays - overallTargetDays;
    const overallShortfallDays = Math.max(0, -overallGapDays);
    const overallAdditionalDaysPerWeekRaw = overallShortfallDays / planningWeeks;
    const overallCatchUpDaysPerWeek = overallAdditionalDaysPerWeekRaw > 0 ? Math.min(7, Math.max(1, Math.floor(overallAdditionalDaysPerWeekRaw))) : 0;
    const overallCatchUpDaysPerWeekHigh = overallAdditionalDaysPerWeekRaw > 0 ? Math.min(7, Math.max(overallCatchUpDaysPerWeek, Math.ceil(overallAdditionalDaysPerWeekRaw))) : 0;
    const overallExtendWeeks = overallAdditionalDaysPerWeekRaw > 0 ? Math.min(52, Math.max(1, Math.ceil(overallShortfallDays / Math.max(1, currentPaceDaysPerWeek || 1)))) : 0;
    const overallCompletionPct = overallTargetDays > 0 ? Math.round((overallProjectedDays / overallTargetDays) * 100) : 0;
    const overallApproxCompletionPct = Math.max(0, Math.round(overallCompletionPct / 5) * 5);
    const perSubjectCatchUp = perSubjectRows
      .map((row) => {
        const shortDays = Math.max(0, Number(row.shortDays || 0));
        const perSubjectWeeks = Math.max(1, planningWeeks);
        const raw = shortDays / perSubjectWeeks;
        const low = raw > 0 ? Math.min(7, Math.max(1, Math.floor(raw))) : 0;
        const high = raw > 0 ? Math.min(7, Math.max(low, Math.ceil(raw))) : 0;
        const otherSubjects = perSubjectRows.filter((otherRow) => String(otherRow?.id || '') !== String(row?.id || ''));
        const weekdayConflictCounts = [1, 2, 3, 4, 5].reduce((acc, weekday) => ({ ...acc, [weekday]: 0 }), {});
        otherSubjects.forEach((otherRow) => {
          (Array.isArray(otherRow?.cadenceDayNums) ? otherRow.cadenceDayNums : []).forEach((day) => {
            const asInt = Number(day);
            if (Number.isInteger(asInt) && asInt >= 1 && asInt <= 5) {
              weekdayConflictCounts[asInt] = Number(weekdayConflictCounts[asInt] || 0) + 3;
            }
          });
          (Array.isArray(otherRow?.eventItems) ? otherRow.eventItems : []).forEach((eventItem) => {
            const eventMs = Number(eventItem?.startMs || new Date(eventItem?.startTs || '').getTime());
            if (!Number.isFinite(eventMs)) return;
            const weekday = new Date(eventMs).getDay();
            if (weekday >= 1 && weekday <= 5) {
              weekdayConflictCounts[weekday] = Number(weekdayConflictCounts[weekday] || 0) + 1;
            }
          });
        });
        const existingDayNums = [...new Set(
          (Array.isArray(row?.cadenceDayNums) ? row.cadenceDayNums : [])
            .map((day) => Number(day))
            .filter((day) => Number.isInteger(day) && day >= 1 && day <= 5)
        )].sort((a, b) => a - b);
        const missingWeekdays = [1, 2, 3, 4, 5]
          .filter((day) => !existingDayNums.includes(day))
          .sort((a, b) => {
            const conflictDelta = Number(weekdayConflictCounts[a] || 0) - Number(weekdayConflictCounts[b] || 0);
            if (conflictDelta !== 0) return conflictDelta;
            return a - b;
          });
        const suggestedAddedDayCount = raw > 0 ? Math.min(missingWeekdays.length, Math.max(1, high)) : 0;
        const suggestedAddedDayNums = suggestedAddedDayCount > 0 ? missingWeekdays.slice(0, suggestedAddedDayCount) : [];
        const suggestedAddedDaysLabel = suggestedAddedDayNums.length > 0 ? formatWeekdaySummary(suggestedAddedDayNums) : '';
        const baselineSessionsPerWeek = Number(row.projectedDays || 0) > 0
          ? (Number(row.projectedDays || 0) / Math.max(1, Number(row.totalWeeksInYear || planningWeeks)))
          : 0;
        const extendWeeksForSubject = raw > 0
          ? (
            baselineSessionsPerWeek > 0
              ? Math.min(52, Math.max(1, Math.ceil(shortDays / baselineSessionsPerWeek)))
              : Math.min(52, Math.max(1, Math.ceil(shortDays / Math.max(1, Number(row.currentPaceDaysPerWeek || 1)))))
          )
          : 0;
        const suggestedEndYmd = extendWeeksForSubject > 0 && row.rangeEndYmd
          ? addDaysToYmd(row.rangeEndYmd, extendWeeksForSubject * 7)
          : null;
        const extensionStartYmd = suggestedEndYmd ? addDaysToYmd(row.rangeEndYmd, 1) : null;
        const extensionAddedDates = extensionStartYmd && suggestedEndYmd
          ? listDatesForWeekdaysInRange(extensionStartYmd, suggestedEndYmd, row.cadenceDayNums || [])
          : [];
        const extensionAddedDatesLabel = (() => {
          if (!Array.isArray(extensionAddedDates) || extensionAddedDates.length === 0) return '';
          const shown = extensionAddedDates.slice(0, 8).map((ymd) => formatDateDisplayYmd(ymd)).filter(Boolean);
          if (shown.length === 0) return '';
          const remaining = extensionAddedDates.length - shown.length;
          return remaining > 0 ? `${shown.join(', ')} (+${remaining} more)` : shown.join(', ');
        })();
        const planStartLabel = formatDateDisplayYmd(row.rangeStartYmd);
        const planEndLabel = formatDateDisplayYmd(row.rangeEndYmd);
        const hasAnyCadenceDays = existingDayNums.length > 0;
        const hasPlan = row?.hasPlan === true;
        const suggestionSummaryText = (!hasPlan && !hasAnyCadenceDays && suggestedAddedDaysLabel)
          ? `Create plan from ${planStartLabel || 'start of year'} to ${planEndLabel || 'end of year'} on ${suggestedAddedDaysLabel}.`
          : (suggestedEndYmd && suggestedAddedDaysLabel
            ? 'Extend term length and add multiple class days a week.'
            : (suggestedEndYmd
              ? 'Extend term length or add class days per week.'
              : (suggestedAddedDaysLabel
                ? 'Add class days per week.'
                : '')));
        return {
          id: row.id,
          name: row.name,
          schoolTermId: row.schoolTermId || 'full_year',
          shortDays,
          lowSessionsPerWeek: low,
          highSessionsPerWeek: high,
          baselineSessionsPerWeek: toOneDecimal(baselineSessionsPerWeek),
          extendWeeks: extendWeeksForSubject,
          suggestedEndYmd,
          extensionAddedDatesLabel,
          suggestedAddedDaysLabel,
          suggestionSummaryText,
        };
      })
      .filter((row) => row.shortDays > 0);
    return {
      trackingMode,
      perSubjectRows,
      totalTargetDays,
      totalCompletedDays,
      totalUpcomingDays,
      totalProjectedDays,
      totalGapDays,
      projectedFinishDays,
      totalShortfall,
      gapShortfallDays,
      catchUpDaysPerWeek,
      catchUpDaysPerWeekHigh,
      extendWeeks,
      approxProjectedCompletionPct,
      remainingWeeks,
      currentPaceDaysPerWeek,
      overallCompletedDays,
      overallUpcomingDays,
      overallProjectedDays,
      overallTargetDays,
      overallGapDays,
      overallShortfallDays,
      overallCatchUpDaysPerWeek,
      overallCatchUpDaysPerWeekHigh,
      overallExtendWeeks,
      overallApproxCompletionPct,
      perSubjectCatchUp,
      progressPct: totalTargetDays > 0 ? Math.max(0, Math.min(100, Math.round((totalCompletedDays / totalTargetDays) * 100))) : 0,
    };
  }, [termSections, familyPlannerSettings?.default_target_days, trackingMode]);

  const subjectPlans = useMemo(() => {
    const selectedStartYear = Number(displaySchoolYear?.start_year);
    const slotKey = buildPlanSlotKey(selectedStartYear, displayTerm);
    const slotSubjectIds = slotKey ? (planSubjectIdsBySlot?.[slotKey] || []) : [];
    const slotSubjectNames = slotKey ? (planSubjectNamesBySlot?.[slotKey] || []) : [];
    const plannedSet = new Set((slotSubjectIds || []).map((id) => String(id)));
    const plannedNameSet = new Set((slotSubjectNames || []).map((name) => normalizeSubjectName(name)));
    const blocks = Array.isArray(viewedScheduleCore?.blocksLite) ? viewedScheduleCore.blocksLite : [];
    return (homeSlotScopedSubjects || []).map((subject) => {
      const subjectId = String(subject?.id || '');
      const normalizedName = normalizeSubjectName(subject?.name);
      const blocksForSubject = blocks.filter((block) =>
        Array.isArray(block?.subject_ids) && block.subject_ids.some((sid) => String(sid) === subjectId)
      );
      const cadenceText = formatSubjectCadence(blocksForSubject);
      const cadenceCompactLabel = formatSubjectCadenceCompact(blocksForSubject);
      const attachedIds = Array.isArray(subject?.assignedChildren)
        ? subject.assignedChildren.map((id) => String(id)).filter(Boolean)
        : [];
      const effectiveAttachedIds = attachedIds.length > 0
        ? attachedIds
        : allChildIds;
      const attachedStudentNames = effectiveAttachedIds
        .map((childId) => childNameById[String(childId)] || null)
        .filter(Boolean);
      return {
        id: subjectId,
        name: subject?.name || 'Subject',
        hasPlan: (subjectId ? plannedSet.has(subjectId) : false) || (normalizedName ? plannedNameSet.has(normalizedName) : false),
        cadenceText,
        cadenceCompactLabel,
        attachedStudentIds: effectiveAttachedIds,
        attachedStudentsLabel: attachedStudentNames.join(', '),
      };
    });
  }, [homeSlotScopedSubjects, displaySchoolYear?.start_year, displayTerm, planSubjectIdsBySlot, planSubjectNamesBySlot, viewedScheduleCore, childNameById, allChildIds]);

  const step4Preview = useMemo(() => {
    if (!dateRange || selectedSubjectRows.length === 0) return null;
    let sessionCount = 0;
    let daySet = new Set();
    let totalHoursPerSession = 0;
    const details = [];
    selectedSubjectRows.forEach((subject) => {
      const sid = String(subject.id);
      const block = blocksBySubject[sid] || { weekdays: [], start_time: '09:00', end_time: '10:00' };
      const perSubjectSessions = countOccurrencesInRange(dateRange.start_date, dateRange.end_date, block.weekdays);
      sessionCount += perSubjectSessions;
      (block.weekdays || []).forEach((d) => daySet.add(d));
      totalHoursPerSession += timeRangeHours(block.start_time, block.end_time);
      details.push({
        subjectName: subject.name || 'Subject',
        weekdays: block.weekdays || [],
        start_time: block.start_time || '09:00',
        end_time: block.end_time || '10:00',
        sessions: perSubjectSessions,
      });
    });
    return {
      sessionCount,
      daysPerWeek: daySet.size,
      hoursPerDay: selectedSubjectRows.length > 0 ? (totalHoursPerSession / selectedSubjectRows.length) : 0,
      rangeLabel: selectedTermOption.label.includes('term')
        ? selectedTermOption.label.replace(/\b\w/g, (x) => x.toUpperCase())
        : 'Aug -> May',
      details,
    };
  }, [dateRange, selectedSubjectRows, blocksBySubject, selectedTermOption.label]);

  const toggleSubject = (subjectId) => {
    const id = String(subjectId);
    setSelectedSubjectIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const updateBlock = (subjectId, patch) => {
    const id = String(subjectId);
    setBlocksBySubject((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  };

  const toggleBlockWeekday = (subjectId, weekday) => {
    const id = String(subjectId);
    const current = blocksBySubject[id] || { weekdays: [] };
    const weekdays = current.weekdays || [];
    const next = weekdays.includes(weekday)
      ? weekdays.filter((w) => w !== weekday)
      : [...weekdays, weekday].sort((a, b) => a - b);
    updateBlock(id, { weekdays: next });
  };

  const handleCurriculumAction = (subject, method) => {
    const subjectId = subject?.id;
    if (!subjectId || Platform.OS !== 'web' || typeof window === 'undefined') {
      toast?.push?.('Curriculum actions are available in web mode.', 'info');
      return;
    }
    const assignedChildIds = Array.isArray(subject?.assignedChildren) ? subject.assignedChildren.filter(Boolean) : [];
    const fallbackChildIds = (children || []).map((c) => c?.id).filter(Boolean);
    const selectedChildIds = assignedChildIds.length > 0 ? assignedChildIds : fallbackChildIds;
    window.dispatchEvent(
      new CustomEvent('openPlanYearModal', {
        detail: {
          from: 'subject_detail',
          openAsModal: true,
          skipPlanSummary: true,
          openDirectlyToScope: true,
          subjectId: String(subjectId),
          subjectName: subject?.name || null,
          childIds: selectedChildIds,
          initialUnitStructureMethod: method,
        },
      })
    );
  };

  const handleSave = async () => {
    if (!familyId) return toast?.push?.('Missing family context.', 'error');
    if (!dateRange?.start_date || !dateRange?.end_date) return toast?.push?.('Pick school year and term first.', 'error');
    if (selectedSubjectRows.length === 0) return toast?.push?.('Pick at least one subject.', 'error');
    for (const subject of selectedSubjectRows) {
      const sid = String(subject.id);
      const block = blocksBySubject[sid];
      if (!block || !Array.isArray(block.weekdays) || block.weekdays.length === 0) {
        return toast?.push?.(`Pick learning days for ${subject.name || 'subject'}.`, 'error');
      }
      if (!/^\d{2}:\d{2}$/.test(block.start_time || '') || !/^\d{2}:\d{2}$/.test(block.end_time || '')) {
        return toast?.push?.(`Use HH:MM times for ${subject.name || 'subject'}.`, 'error');
      }
    }

    setSaving(true);
    try {
      const allChildIds = (children || []).map((c) => c?.id).filter(Boolean);
      const blocks = selectedSubjectRows.map((subject, idx) => {
        const sid = String(subject.id);
        const block = blocksBySubject[sid];
        const assigned = Array.isArray(subject?.assignedChildren) ? subject.assignedChildren.filter(Boolean) : [];
        return {
          block_id: `subjects-plan-${sid}-${idx}`,
          subject_id: sid,
          child_ids: assigned.length > 0 ? assigned : allChildIds,
          weekdays: block.weekdays,
          start_time: block.start_time,
          end_time: block.end_time,
          all_day: false,
        };
      });
      const payload = {
        family_id: familyId,
        start_date: dateRange.start_date,
        end_date: dateRange.end_date,
        follow_public_holidays: true,
        holiday_region: 'US',
        subjects: selectedSubjectIds,
        replace_placeholders: true,
        create_calendar_events: true,
        blocks,
        run_scope_type: selectedTerm === 'full_year' ? 'full_year' : 'term',
        school_duration_scope: selectedTerm,
        target_instructional_days: 180,
        use_defaults: buildWithDefaults,
        timezone: getClientTimezone(),
        year_name: `${selectedSchoolYear?.label || 'School Year'} · Subjects schedule`,
      };
      const { data, error } = await applyToCalendar(payload);
      if (error) throw error;
      setSurfaceMode('home');
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
        window.dispatchEvent(new CustomEvent('planAppliedToCalendar'));
      }
      setOverviewReloadKey((k) => k + 1);
      toast?.push?.(`Saved plan (${data?.created ?? 0} events).`, 'success');
    } catch (err) {
      toast?.push?.(err?.message || 'Failed to save plan.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const applySuggestedTermExtension = useCallback(async (suggestionRow) => {
    const subjectId = String(suggestionRow?.id || '');
    const subjectName = suggestionRow?.name || 'Subject';
    const suggestedEndYmd = String(suggestionRow?.suggestedEndYmd || '').slice(0, 10);
    if (!subjectId || !suggestedEndYmd) return;
    if (!familyId) {
      toast?.push?.('Missing family context.', 'error');
      return;
    }
    const selectedStartYear = Number(displaySchoolYear?.start_year);
    const preferredScope = normalizeSubjectTerm(suggestionRow?.schoolTermId || 'full_year');
    const eligibleCores = (planCores || []).filter((core) => (
      Number(core?.startYear) === selectedStartYear
      && [preferredScope, 'full_year', 'fall_term', 'spring_term'].includes(String(core?.scopeId || '').trim())
    ));
    const matchedCore = eligibleCores.find((core) => (
      Array.isArray(core?.subjectIds) && core.subjectIds.map(String).includes(subjectId)
    )) || eligibleCores[0] || activeScheduleCore || null;
    const academicYearId = String(matchedCore?.row?.id || activeScheduleCore?.row?.id || '').trim();
    if (!academicYearId) {
      toast?.push?.('No saved plan found. Create a plan first.', 'info');
      return;
    }

    setApplyingSuggestionSubjectId(subjectId);
    try {
      const { data: yearDetail, error: yearError } = await getAcademicYear(academicYearId);
      if (yearError) throw yearError;
      const plan = yearDetail?.plan || {};
      const startDate = String(plan?.start_date || yearDetail?.start_date || '').slice(0, 10);
      const currentEndDate = String(plan?.end_date || yearDetail?.end_date || '').slice(0, 10);
      if (!startDate) throw new Error('Plan start date is missing.');
      const nextEndDate = suggestedEndYmd > currentEndDate ? suggestedEndYmd : currentEndDate;
      if (!nextEndDate) throw new Error('Suggested end date is missing.');

      const holidaySettings = yearDetail?.holiday_settings || {};
      const holidayRegion = holidaySettings.holiday_region
        || (holidaySettings.holiday_country_code
          ? `${holidaySettings.holiday_country_code}${holidaySettings.holiday_region ? `:${holidaySettings.holiday_region}` : ''}`
          : 'US');
      const customHolidays = Array.isArray(yearDetail?.holidays)
        ? yearDetail.holidays
            .filter((h) => (h?.type || 'CUSTOM_HOLIDAY') === 'CUSTOM_HOLIDAY')
            .map((h) => ({
              date: typeof h?.date === 'string' ? h.date.slice(0, 10) : String(h?.date || '').slice(0, 10),
              name: h?.name || '',
              type: h?.type || 'CUSTOM_HOLIDAY',
            }))
        : [];
      const { data: exclusions } = await getAcademicYearExclusions(academicYearId);
      const customBreaks = Array.isArray(exclusions)
        ? exclusions
            .filter((entry) => entry?.exclusion_type === 'break')
            .map((entry) => ({
              start: typeof entry?.start_date === 'string' ? entry.start_date.slice(0, 10) : String(entry?.start_date || '').slice(0, 10),
              end: typeof entry?.end_date === 'string' ? entry.end_date.slice(0, 10) : String(entry?.end_date || '').slice(0, 10),
              name: entry?.label || 'Break',
            }))
        : [];
      const blocks = Array.isArray(plan?.blocks)
        ? plan.blocks.map((block) => ({
            block_id: block?.block_id || undefined,
            subject_id: block?.subject_id ?? null,
            placeholder_label: block?.placeholder_label || undefined,
            child_ids: Array.isArray(block?.child_ids) ? block.child_ids : [],
            weekdays: Array.isArray(block?.weekdays) ? block.weekdays : [],
            start_time: block?.start_time || '09:00',
            end_time: block?.end_time || '10:00',
            all_day: !!block?.all_day,
          }))
        : [];
      const payload = {
        academic_year_id: academicYearId,
        family_id: familyId,
        start_date: startDate,
        end_date: nextEndDate,
        follow_public_holidays: holidaySettings.follow_global_holidays !== false,
        holiday_region: holidayRegion,
        excluded_holiday_dates: holidaySettings.excluded_holiday_dates || [],
        custom_holidays: customHolidays,
        custom_breaks: customBreaks,
        target_instructional_days: (plan?.constraint_mode === 'days' ? plan?.target_days : null) ?? 180,
        subjects: [...new Set(blocks.map((b) => b?.subject_id).filter(Boolean))],
        constraint_mode: plan?.constraint_mode || 'none',
        target_days: plan?.target_days ?? null,
        target_hours: plan?.target_hours ?? null,
        replace_placeholders: true,
        blocks,
        year_name: yearDetail?.year_name || undefined,
        timezone: getClientTimezone(),
      };
      const { data, error } = await applyToCalendar(payload);
      if (error) throw error;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
        window.dispatchEvent(new CustomEvent('planAppliedToCalendar'));
      }
      setEventsRefreshKey((prev) => prev + 1);
      setOverviewReloadKey((prev) => prev + 1);
      toast?.push?.(
        `Applied suggestion for ${subjectName}: extended term to ${formatDateDisplayYmd(nextEndDate)} (${data?.created ?? 0} events).`,
        'success'
      );
    } catch (err) {
      toast?.push?.(err?.message || 'Failed to apply suggestion.', 'error');
    } finally {
      setApplyingSuggestionSubjectId(null);
    }
  }, [familyId, displaySchoolYear?.start_year, planCores, activeScheduleCore, toast]);

  const openApplySuggestionConfirmModal = useCallback((suggestionRow) => {
    if (!suggestionRow?.suggestedEndYmd) return;
    setPendingSuggestionToApply(suggestionRow);
    setShowApplySuggestionConfirmModal(true);
  }, []);

  const closeApplySuggestionConfirmModal = useCallback(() => {
    if (applyingSuggestionSubjectId) return;
    setShowApplySuggestionConfirmModal(false);
    setPendingSuggestionToApply(null);
  }, [applyingSuggestionSubjectId]);

  const confirmApplySuggestionFromModal = useCallback(async () => {
    if (!pendingSuggestionToApply) return;
    const targetSuggestion = pendingSuggestionToApply;
    setShowApplySuggestionConfirmModal(false);
    setPendingSuggestionToApply(null);
    await applySuggestedTermExtension(targetSuggestion);
  }, [pendingSuggestionToApply, applySuggestedTermExtension]);

  const openPlannerView = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (activeSchedule?.row?.id) {
      window.dispatchEvent(
        new CustomEvent('openPlanYearModal', {
          detail: {
            from: 'subjects_builder',
            academicYearId: activeSchedule.row.id,
            openAsModal: false,
            openToEditList: false,
          },
        })
      );
      return;
    }
    window.history.pushState({}, '', '/planner?view=plan-year');
    window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'plan-year' }));
  };

  const openBuilderForSubject = (subjectId, action = 'edit', termIdOverride = null) => {
    const safeId = String(subjectId || '');
    if (!safeId) return;
    const effectiveTerm = String(termIdOverride || selectedTerm || '').trim() || 'fall_term';
    if (termIdOverride && String(termIdOverride).trim()) {
      setSelectedTerm(String(termIdOverride).trim());
    }
    if (action === 'add') {
      const subject = (baseSubjects || []).find((s) => String(s?.id) === safeId) || null;
      const assignedChildIds = Array.isArray(subject?.assignedChildren)
        ? subject.assignedChildren.filter(Boolean)
        : [];
      const fallbackChildIds = (children || []).map((c) => c?.id).filter(Boolean);
      const childIds = assignedChildIds.length > 0 ? assignedChildIds : fallbackChildIds;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('openPlanYearModal', {
            detail: {
              from: 'subject_detail',
              openAsModal: true,
              skipPlanSummary: true,
              openDirectlyToScope: true,
              subjectId: safeId,
              subjectName: subject?.name || null,
              childIds,
            },
          })
        );
        return;
      }
    }
    if (action === 'edit') {
      let academicYearId = null;
      const selectedStartYear = Number(displaySchoolYear?.start_year);
      const eligibleCores = (planCores || []).filter((core) => (
        Number(core?.startYear) === selectedStartYear
        && [effectiveTerm, 'full_year'].includes(String(core?.scopeId || '').trim())
      ));
      const matchedCore = eligibleCores.find((core) => (
        Array.isArray(core?.subjectIds) && core.subjectIds.map(String).includes(safeId)
      )) || eligibleCores.find((core) => (
        Array.isArray(core?.subjectNames)
        && (baseSubjects || []).find((s) => String(s?.id) === safeId)?.name
        && core.subjectNames.map((name) => normalizeSubjectName(name)).includes(
          normalizeSubjectName((baseSubjects || []).find((s) => String(s?.id) === safeId)?.name)
        )
      )) || eligibleCores[0] || null;
      academicYearId = matchedCore?.row?.id || null;

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('openPlanYearModal', {
            detail: {
              from: 'subject_detail',
              subjectId: safeId,
              academicYearId,
              openAsModal: true,
              openToEditList: !academicYearId,
              skipPlanSummary: true,
            },
          })
        );
        return;
      }
    }
    if (action === 'delete') {
      const nextIds = (activeSchedule?.subjectIds || []).map(String).filter((id) => id !== safeId);
      if (nextIds.length === 0) {
        toast?.push?.('Open the schedule builder to remove the last subject plan.', 'info');
        setSelectedSubjectIds([safeId]);
        setSurfaceMode('builder');
        return;
      }
      setSelectedSubjectIds(nextIds);
      toast?.push?.('Review and save to apply plan removal.', 'info');
      setSurfaceMode('builder');
      return;
    }
    setSelectedSubjectIds([safeId]);
    setSurfaceMode('builder');
  };

  const subjectPickerPool = useMemo(
    () => (homeSlotScopedSubjects.length > 0 ? homeSlotScopedSubjects : baseSubjects),
    [homeSlotScopedSubjects, baseSubjects]
  );

  const subjectPickerHasAnyPlan = useMemo(
    () => (subjectPlans || []).some((row) => row?.hasPlan),
    [subjectPlans]
  );

  const subjectPickerHasAnyWithoutPlan = useMemo(
    () => (subjectPlans || []).some((row) => !row?.hasPlan),
    [subjectPlans]
  );

  const subjectPickerOptions = useMemo(() => {
    const pool = subjectPickerPool;
    const plannedSet = new Set((subjectPlans || []).filter((row) => row?.hasPlan).map((row) => String(row.id)));
    if (subjectPickerAction === 'edit') {
      return (pool || []).filter((subject) => plannedSet.has(String(subject?.id || '')));
    }
    return (pool || []).filter((subject) => !plannedSet.has(String(subject?.id || '')));
  }, [subjectPickerAction, subjectPickerPool, subjectPlans]);

  const subjectPickerEmptyMessage = useMemo(() => {
    if (subjectPickerAction === 'edit') {
      if ((subjectPickerPool || []).length === 0) {
        return "You don't have any subjects for this year and term, please add a new subject to create a plan";
      }
      if (!subjectPickerHasAnyPlan) {
        return "You don't have any plans for this year and term yet, please create a new plan first.";
      }
      return '';
    }
    if ((subjectPickerPool || []).length === 0) {
      return "You don't have any subjects for this year and term, please add a new subject to create a plan";
    }
    if (!subjectPickerHasAnyWithoutPlan && subjectPickerHasAnyPlan) {
      return "All of your family's subjects for this year and term have plans created, please create a new subject if you want to create a new plan.";
    }
    return '';
  }, [subjectPickerAction, subjectPickerPool, subjectPickerHasAnyWithoutPlan, subjectPickerHasAnyPlan]);

  const openSubjectPicker = useCallback((action = 'add') => {
    const mode = action === 'edit' ? 'edit' : 'add';
    setSubjectPickerAction(mode);
    setShowSubjectPickerModal(true);
  }, []);

  const handlePickSubjectFromModal = useCallback((subjectId) => {
    const mode = subjectPickerAction === 'edit' ? 'edit' : 'add';
    setShowSubjectPickerModal(false);
    openBuilderForSubject(subjectId, mode);
  }, [subjectPickerAction, openBuilderForSubject]);

  const getSubjectStudentMeta = useCallback((subject) => {
    const attachedIds = Array.isArray(subject?.assignedChildren)
      ? subject.assignedChildren.map((id) => String(id)).filter(Boolean)
      : [];
    const effectiveIds = attachedIds.length > 0 ? attachedIds : allChildIds;
    const label = effectiveIds
      .map((childId) => childNameById[String(childId)] || null)
      .filter(Boolean)
      .join(', ');
    return { ids: effectiveIds, label };
  }, [allChildIds, childNameById]);

  const openAddSubjectForCurrentSlot = useCallback((termId = null) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const resolvedTerm = termId || displayTerm || null;
    window.dispatchEvent(
      new CustomEvent('openAddSubjectModal', {
        detail: {
          schoolYear: displaySchoolYear?.label || null,
          schoolTerm: resolvedTerm,
        },
      })
    );
  }, [displaySchoolYear?.label, displayTerm]);

  const openPlanningPreferences = useCallback(() => {
    if (typeof onOpenPlannerSettings === 'function') {
      onOpenPlannerSettings(displaySchoolYear?.label || null);
    }
  }, [onOpenPlannerSettings, displaySchoolYear?.label]);

  const openSubjectEditModal = useCallback((subjectId) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const safeId = String(subjectId || '').trim();
    if (!safeId) return;
    const subject = (baseSubjects || []).find((item) => String(item?.id || '') === safeId) || null;
    if (!subject) return;
    window.dispatchEvent(
      new CustomEvent('openAddSubjectModal', {
        detail: { subject },
      })
    );
  }, [baseSubjects]);

  const openSubjectEventsModal = useCallback((row, termSectionTitle) => {
    setSubjectEventsModalData({
      subjectName: row?.name || 'Subject',
      termTitle: termSectionTitle || '',
      events: Array.isArray(row?.eventItems) ? row.eventItems : [],
    });
    setShowSubjectEventsModal(true);
  }, []);

  const openEventDetails = useCallback((eventId, initialEvent = null) => {
    const safeEventId = String(eventId || '').trim();
    if (!safeEventId || Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('openEventModal', {
        detail: {
          eventId: safeEventId,
          ...(initialEvent ? { initialEvent } : {}),
        },
      })
    );
  }, []);

  const openAttendanceBulkActionsModal = useCallback((row) => {
    const subjectId = String(row?.id || '').trim();
    const isAggregate = row?.isAggregate === true;
    const normalizedEvents = (Array.isArray(row?.eventItems) ? row.eventItems : []).map((eventItem) => ({
      id: eventItem?.id ? String(eventItem.id) : null,
      subject_id: eventItem?.subject_id ? String(eventItem.subject_id) : (subjectId || null),
      title: eventItem?.title || 'Event',
      start_ts: eventItem?.start_ts || eventItem?.startTs || null,
      due_ts: eventItem?.due_ts || eventItem?.start_ts || eventItem?.startTs || null,
      end_ts: eventItem?.end_ts || null,
      status: eventItem?.status || null,
      is_backlog: eventItem?.is_backlog === true,
    })).filter((eventItem) => Boolean(eventItem?.id));
    setAttendanceModalData({
      subjectId: isAggregate ? null : subjectId,
      subjectName: row?.name || (isAggregate ? 'All subjects' : 'Subject'),
      events: normalizedEvents,
    });
    setShowPastEventsAttendanceModal(true);
  }, []);

  const openUpcomingEventsListModal = useCallback((row, termSectionTitle = '') => {
    const subjectId = String(row?.id || '').trim();
    const isAggregate = row?.isAggregate === true;
    if (!isAggregate && !subjectId) return;
    const allEvents = (Array.isArray(row?.eventItems) ? row.eventItems : [])
      .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
    setUpcomingEventsModalData({
      subjectId: isAggregate ? null : subjectId,
      subjectName: row?.name || (isAggregate ? 'All subjects' : 'Subject'),
      termTitle: termSectionTitle || '',
      events: allEvents,
      hasPlan: !isAggregate && row?.hasPlan === true,
      schoolTermId: row?.schoolTermId || 'full_year',
    });
    setShowUpcomingEventsModal(true);
  }, []);

  const markEventAsAttendedFromAllEventsModal = useCallback(async (eventItem) => {
    const eventId = String(eventItem?.id || '').trim();
    if (!eventId) return;
    setMarkingAttendanceEventId(eventId);
    try {
      const { error } = await completeEvent(eventId, null, { requirePersist: true });
      if (error) throw error;
      setUpcomingEventsModalData((prev) => ({
        ...prev,
        events: (prev?.events || []).map((entry) => (
          String(entry?.id || '') === eventId
            ? { ...entry, status: 'done', instructional_status: 'MANUAL_COUNTS', hasAttendancePresent: true }
            : entry
        )),
      }));
      setEventsRefreshKey((prev) => prev + 1);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      }
      toast?.push?.('Marked as attended.', 'success');
    } catch (err) {
      toast?.push?.(err?.message || 'Could not mark attended.', 'error');
    } finally {
      setMarkingAttendanceEventId(null);
    }
  }, [toast]);

  const markEventAsUnattendedFromAllEventsModal = useCallback(async (eventItem) => {
    const eventId = String(eventItem?.id || '').trim();
    if (!eventId) return;
    setMarkingAttendanceEventId(eventId);
    try {
      const { error } = await updateEventStatus(eventId, 'scheduled');
      if (error) throw error;
      setUpcomingEventsModalData((prev) => ({
        ...prev,
        events: (prev?.events || []).map((entry) => (
          String(entry?.id || '') === eventId
            ? { ...entry, status: 'scheduled', instructional_status: null, hasAttendancePresent: false }
            : entry
        )),
      }));
      setEventsRefreshKey((prev) => prev + 1);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
      }
      toast?.push?.('Marked as unattended.', 'success');
    } catch (err) {
      toast?.push?.(err?.message || 'Could not mark unattended.', 'error');
    } finally {
      setMarkingAttendanceEventId(null);
    }
  }, [toast]);

  const markAllPastEventsAsAttendedFromAllEventsModal = useCallback(async () => {
    const nowMs = Date.now();
    const events = Array.isArray(upcomingEventsModalData?.events) ? upcomingEventsModalData.events : [];
    const targetEvents = events.filter((eventItem) => {
      const eventId = String(eventItem?.id || '').trim();
      const startMs = Number(eventItem?.startMs || 0);
      const isPastEvent = startMs > 0 && startMs < nowMs;
      const isAttended = eventItem?.hasAttendancePresent === true
        || String(eventItem?.status || '').toLowerCase() === 'done'
        || String(eventItem?.instructional_status || '').toUpperCase() === 'MANUAL_COUNTS';
      return Boolean(eventId) && isPastEvent && !isAttended;
    });
    if (!targetEvents.length) return;
    setMarkingAttendanceEventId('__bulk_mark_all_past_attended__');
    const succeededIds = [];
    let failedCount = 0;
    try {
      for (const eventItem of targetEvents) {
        const eventId = String(eventItem?.id || '').trim();
        if (!eventId) continue;
        try {
          const { error } = await completeEvent(eventId, null, { requirePersist: true });
          if (error) throw error;
          succeededIds.push(eventId);
        } catch (err) {
          failedCount += 1;
        }
      }
      if (succeededIds.length > 0) {
        setUpcomingEventsModalData((prev) => ({
          ...prev,
          events: (prev?.events || []).map((entry) => (
            succeededIds.includes(String(entry?.id || ''))
              ? { ...entry, status: 'done', instructional_status: 'MANUAL_COUNTS', hasAttendancePresent: true }
              : entry
          )),
        }));
        setEventsRefreshKey((prev) => prev + 1);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
        }
      }
      if (succeededIds.length > 0 && failedCount === 0) {
        toast?.push?.(`Marked ${succeededIds.length} past event${succeededIds.length === 1 ? '' : 's'} as attended.`, 'success');
      } else if (succeededIds.length > 0) {
        toast?.push?.(`Marked ${succeededIds.length} past event${succeededIds.length === 1 ? '' : 's'} as attended. ${failedCount} failed.`, 'success');
      } else {
        toast?.push?.('Could not mark past events as attended.', 'error');
      }
    } finally {
      setMarkingAttendanceEventId(null);
    }
  }, [toast, upcomingEventsModalData]);

  const yearTargetTotalsInteractionRow = useMemo(() => {
    if (!yearTargetSummary) return null;
    const mergedEvents = (yearTargetSummary.perSubjectRows || [])
      .flatMap((row) => (Array.isArray(row?.eventItems) ? row.eventItems : []))
      .filter((eventItem) => eventItem?.id)
      .sort((a, b) => Number(a?.startMs || 0) - Number(b?.startMs || 0));
    return {
      id: null,
      isAggregate: true,
      name: 'All subjects',
      eventItems: mergedEvents,
      schoolTermId: 'full_year',
      hasPlan: false,
    };
  }, [yearTargetSummary]);

  const yearTargetCatchUpById = useMemo(() => {
    const out = {};
    (yearTargetSummary?.perSubjectCatchUp || []).forEach((row) => {
      const key = String(row?.id || '').trim();
      if (!key) return;
      out[key] = row;
    });
    return out;
  }, [yearTargetSummary]);
  const hasAnySubjectPlans = useMemo(
    () => (termSections || []).some((section) => Array.isArray(section?.subjectPlans) && section.subjectPlans.length > 0),
    [termSections]
  );

  const getYearTargetChevronAnim = useCallback((subjectId) => {
    const key = String(subjectId || '').trim();
    if (!key) return null;
    if (!yearTargetChevronAnimByIdRef.current[key]) {
      yearTargetChevronAnimByIdRef.current[key] = new Animated.Value(0);
    }
    return yearTargetChevronAnimByIdRef.current[key];
  }, []);

  const getYearTargetSuggestionAnim = useCallback((subjectId) => {
    const key = String(subjectId || '').trim();
    if (!key) return null;
    if (!yearTargetSuggestionAnimByIdRef.current[key]) {
      yearTargetSuggestionAnimByIdRef.current[key] = new Animated.Value(0);
    }
    return yearTargetSuggestionAnimByIdRef.current[key];
  }, []);

  const animateYearTargetDisclosure = useCallback((subjectId, toOpen) => {
    const chevronAnim = getYearTargetChevronAnim(subjectId);
    const suggestionAnim = getYearTargetSuggestionAnim(subjectId);
    if (!chevronAnim || !suggestionAnim) return;
    Animated.timing(chevronAnim, {
      toValue: toOpen ? 1 : 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
    Animated.timing(suggestionAnim, {
      toValue: toOpen ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [getYearTargetChevronAnim, getYearTargetSuggestionAnim]);

  const toggleYearTargetSuggestion = useCallback((subjectId) => {
    const key = String(subjectId || '').trim();
    if (!key) return;
    setExpandedYearTargetSuggestionId((prev) => {
      if (prev === key) {
        animateYearTargetDisclosure(key, false);
        return null;
      }
      if (prev) animateYearTargetDisclosure(prev, false);
      const suggestionAnim = getYearTargetSuggestionAnim(key);
      if (suggestionAnim) suggestionAnim.setValue(0);
      animateYearTargetDisclosure(key, true);
      return key;
    });
  }, [animateYearTargetDisclosure, getYearTargetSuggestionAnim]);

  if (surfaceMode === 'home') {
    return (
      <View style={styles.wrap}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.emptyScheduleSection}>
            {termSections.map((termSection, index) => {
              return (
                <View
                  key={termSection.id}
                  style={[
                    styles.termCard,
                    index === 0 && styles.termCardFirstSpaced,
                    index > 0 && styles.termCardSpaced,
                  ]}
                >
                  <View style={styles.termSectionHeaderRow}>
                    <Text style={styles.termHeaderCompactTitle}>{termSection.title}</Text>
                  </View>
                  <View style={styles.termHeaderDivider} />
                  {termSection.subjectPlans.length === 0 ? (
                    <View style={styles.scheduleEmptyCard}>
                      <Text style={styles.scheduleEmptyText}>
                        No subjects for this school year yet. Add a subject, then create a plan to build weekly cadence.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.subjectSection}>
                        <View style={styles.cadenceStatusTable}>
                          <View style={styles.cadenceStatusHeaderRow}>
                            <Text style={[styles.cadenceStatusHeaderText, styles.cadenceStatusSubjectCol]}>Subject</Text>
                            <Text style={[styles.cadenceStatusHeaderText, styles.cadenceStatusStudentsCol]}>Students</Text>
                            <Text style={[styles.cadenceStatusHeaderText, styles.cadenceStatusSavedCol]}>Cadence</Text>
                            <Text style={[styles.cadenceStatusHeaderText, styles.cadenceStatusProgressCol]}>Progress vs. Target</Text>
                            <Text style={[styles.cadenceStatusHeaderText, styles.cadenceStatusActionsCol, styles.cadenceStatusActionsHeaderText]}>Actions</Text>
                          </View>
                        </View>
                        <View style={styles.subjectRows}>
                          {termSection.subjectPlans.length === 0 ? (
                            <View style={[styles.subjectRow, styles.subjectRowLast]}>
                              <View style={styles.subjectCadence}>
                                <Text style={styles.subjectCadenceText}>No subjects for this school year yet. Create a new subject, then add a plan.</Text>
                              </View>
                            </View>
                          ) : (
                            termSection.subjectPlans.map((row, index) => {
                              const hasCadence = Boolean(String(row?.cadenceText || '').trim());
                              const cadenceTime = extractCadenceTimeLabel(row?.cadenceText || '');
                              const cadenceSummary = hasCadence
                                ? [row.schoolTermLabel || null, row.cadenceCompactLabel || null, cadenceTime || null].filter(Boolean).join(' · ')
                                : 'No saved weekly cadence yet';
                              const targetDays = row.targetUnit === 'days' && Number.isFinite(Number(row.targetValue))
                                ? Number(row.targetValue)
                                : null;
                              const completedDays = Math.max(0, Number(row.actualDays || 0));
                              const progressSummary = targetDays != null
                                ? `${completedDays} completed / ${targetDays} target`
                                : `${completedDays} completed / ${Math.max(completedDays, Number(row.projectedDays || 0))} planned`;
                              const deltaDays = targetDays != null ? (completedDays - targetDays) : null;
                              const statusLabel = !hasCadence
                                ? 'No plan'
                                : (deltaDays == null
                                  ? 'On track'
                                  : (deltaDays < 0 ? 'Behind target' : (deltaDays > 0 ? 'Ahead target' : 'On target')));
                              const statusTone = !hasCadence
                                ? 'no_cadence'
                                : (deltaDays == null
                                  ? 'on_track'
                                  : (deltaDays < 0 ? 'behind' : (deltaDays > 0 ? 'ahead' : 'on_track')));
                              const canToggleYearTargetSuggestion = (
                                (statusTone === 'behind' || statusTone === 'ahead')
                                && Boolean(yearTargetCatchUpById[String(row?.id || '').trim()])
                              );
                              const canCreatePlanFromStatusChip = statusTone === 'no_cadence' && Boolean(String(row?.id || '').trim());
                              const statusDetail = !hasCadence
                                ? 'Completed events can still count toward the yearly target.'
                                : (deltaDays == null
                                  ? 'Target not set yet.'
                                  : (deltaDays < 0 ? `Behind by ${Math.abs(deltaDays)}` : (deltaDays > 0 ? `Ahead by ${deltaDays}` : 'On target')));
                              return (
                                <View
                                  key={`plan-${termSection.id}-${row.id}`}
                                  style={[
                                    styles.subjectRow,
                                    index === termSection.subjectPlans.length - 1 && styles.subjectRowLast,
                                  ]}
                                >
                                  <View style={[styles.subjectMain, styles.cadenceStatusSubjectCol]}>
                                    <Text style={styles.subjectName}>{row.name}</Text>
                                  </View>

                                  <View style={[styles.subjectStudentsCol, styles.cadenceStatusStudentsCol]}>
                                    {Array.isArray(row.attachedStudentIds) && row.attachedStudentIds.length > 0 ? (
                                      <View style={styles.subjectMetaRow}>
                                        <ChildAvatarCluster
                                          childIds={row.attachedStudentIds}
                                          familyChildren={children}
                                          size={30}
                                          overlap={-9}
                                        />
                                        <Text style={styles.subjectMeta}>
                                          {row.attachedStudentsLabel || 'Whole family'}
                                        </Text>
                                      </View>
                                    ) : (
                                      <Text style={styles.subjectMeta}>Whole family</Text>
                                    )}
                                  </View>

                                  <View style={[styles.subjectCadence, styles.cadenceStatusSavedCol]}>
                                    <View style={styles.subjectCadencePill}>
                                      <Text style={styles.subjectCadenceText}>{cadenceSummary}</Text>
                                    </View>
                                  </View>

                                  <View style={[styles.subjectProgressCol, styles.cadenceStatusProgressCol]}>
                                    <Text style={styles.subjectProgressMetric}>{progressSummary}</Text>
                                    <View style={styles.subjectProgressMetaRow}>
                                      <TouchableOpacity
                                        style={[
                                          styles.subjectProgressChip,
                                          statusTone === 'behind' && styles.subjectProgressChipBehind,
                                          statusTone === 'ahead' && styles.subjectProgressChipAhead,
                                          statusTone === 'on_track' && styles.subjectProgressChipOnTrack,
                                          statusTone === 'no_cadence' && styles.subjectProgressChipNoCadence,
                                        ]}
                                        onPress={() => {
                                          const subjectId = String(row?.id || '').trim();
                                          if (!subjectId) return;
                                          if (canToggleYearTargetSuggestion) {
                                            toggleYearTargetSuggestion(subjectId);
                                            return;
                                          }
                                          if (canCreatePlanFromStatusChip) {
                                            openBuilderForSubject(subjectId, 'add', row.schoolTermId || 'full_year');
                                          }
                                        }}
                                        activeOpacity={(canToggleYearTargetSuggestion || canCreatePlanFromStatusChip) ? 0.8 : 1}
                                        disabled={!(canToggleYearTargetSuggestion || canCreatePlanFromStatusChip)}
                                        accessibilityLabel={
                                          canCreatePlanFromStatusChip
                                            ? `Create plan for ${row.name || 'subject'}`
                                            : undefined
                                        }
                                        {...(Platform.OS === 'web' && (canToggleYearTargetSuggestion || canCreatePlanFromStatusChip) && { cursor: 'pointer' })}
                                      >
                                        <Text
                                          style={[
                                            styles.subjectProgressChipText,
                                            statusTone === 'behind' && styles.subjectProgressChipTextBehind,
                                            statusTone === 'ahead' && styles.subjectProgressChipTextAhead,
                                            statusTone === 'on_track' && styles.subjectProgressChipTextOnTrack,
                                            statusTone === 'no_cadence' && styles.subjectProgressChipTextNoCadence,
                                          ]}
                                        >
                                          {statusLabel}
                                        </Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>

                                  <View style={[styles.subjectRowActions, styles.cadenceStatusActionsCol]}>
                                    <TouchableOpacity
                                      style={styles.subjectRowActionLink}
                                      onPress={() => openUpcomingEventsListModal(row, termSection.title)}
                                      activeOpacity={0.8}
                                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                    >
                                      <Text style={styles.subjectRowActionLinkText}>View schedule</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.subjectRowActionLink}
                                      onPress={() => openBuilderForSubject(row.id, row.hasPlan ? 'edit' : 'add', row.schoolTermId || 'full_year')}
                                      accessibilityLabel={row.hasPlan ? `Edit plan for ${row.name || 'subject'}` : `Create plan for ${row.name || 'subject'}`}
                                      activeOpacity={0.8}
                                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                    >
                                      <Text style={styles.subjectRowActionLinkText}>{row.hasPlan ? 'Edit plan' : 'Add plan'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.subjectRowActionLink}
                                      onPress={() => openSubjectEditModal(row.id)}
                                      accessibilityLabel={`Edit ${row.name || 'subject'}`}
                                      activeOpacity={0.8}
                                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                    >
                                      <Text style={styles.subjectRowActionLinkText}>Edit subject</Text>
                                    </TouchableOpacity>
                                  </View>

                                </View>
                              );
                            })
                          )}
                        </View>
                      </View>
                    </>
                  )}
                </View>
              );
            })}
            {!hasAnySubjectPlans ? (
              <View style={styles.yearTargetsSection}>
                <View style={styles.yearTargetsSectionHeaderRow}>
                  <Text style={styles.termHeaderCompactTitle}>Year Targets</Text>
                </View>
                <View style={styles.termHeaderDivider} />
                <View style={styles.scheduleEmptyCard}>
                  <Text style={styles.scheduleEmptyText}>
                    No plan targets yet. Add a subject and create a plan to see year target progress.
                  </Text>
                </View>
              </View>
            ) : yearTargetSummary ? (
              <View style={styles.yearTargetsSection}>
                <View style={styles.yearTargetsSectionHeaderRow}>
                  <Text style={styles.termHeaderCompactTitle}>Year Targets</Text>
                </View>
                <View style={styles.termHeaderDivider} />
                <View style={styles.yearTargetsCard}>
                  <View style={styles.yearTargetsSubjectCardsWrap}>
                    <View style={styles.yearTargetsTable}>
                      <View style={[styles.yearTargetsTableRow, styles.yearTargetsTableHeaderRow]}>
                        <View style={[styles.yearTargetsHeaderCellWrap, styles.yearTargetsSubjectCol]}>
                          <Text style={[styles.yearTargetsTableHeaderCell, styles.yearTargetsHeaderCellLeft]}>Subject</Text>
                        </View>
                        <View style={[styles.yearTargetsHeaderCellWrap, styles.yearTargetsTargetCol]}>
                          <Text style={[styles.yearTargetsTableHeaderCell, styles.yearTargetsHeaderCellLeft]}>Target</Text>
                        </View>
                        <View style={[styles.yearTargetsHeaderCellWrap, styles.yearTargetsDoneCol]}>
                          <Text style={[styles.yearTargetsTableHeaderCell, styles.yearTargetsHeaderCellLeft]}>Done</Text>
                        </View>
                        <View style={[styles.yearTargetsHeaderCellWrap, styles.yearTargetsUpcomingCol]}>
                          <Text style={[styles.yearTargetsTableHeaderCell, styles.yearTargetsHeaderCellLeft]}>Upcoming</Text>
                        </View>
                        <View style={[styles.yearTargetsHeaderCellWrap, styles.yearTargetsProjectedCol]}>
                          <Text style={[styles.yearTargetsTableHeaderCell, styles.yearTargetsHeaderCellLeft]}>Projected (Done + Upcoming)</Text>
                        </View>
                        <View style={[styles.yearTargetsHeaderCellWrap, styles.yearTargetsBalanceCol, styles.yearTargetsHeaderGapCellWrap]}>
                          <Text style={[styles.yearTargetsTableHeaderCell, styles.yearTargetsHeaderCellRight]}>Gap</Text>
                        </View>
                      </View>
                      {(yearTargetSummary.perSubjectRows || []).map((row) => {
                        const catchUpRow = yearTargetCatchUpById[String(row?.id || '').trim()] || null;
                        const showSuggestion = Boolean(catchUpRow);
                        const suggestionSummary = String(catchUpRow?.suggestionSummaryText || '').trim();
                        const suggestedDaysText = catchUpRow?.extensionAddedDatesLabel || catchUpRow?.suggestedAddedDaysLabel || '';
                        const rowId = String(row?.id || '').trim();
                        const isExpanded = expandedYearTargetSuggestionId === rowId;
                        const chevronAnim = showSuggestion ? getYearTargetChevronAnim(rowId) : null;
                        const suggestionAnim = showSuggestion ? getYearTargetSuggestionAnim(rowId) : null;
                        const chevronRotate = chevronAnim
                          ? chevronAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: ['0deg', '180deg'],
                          })
                          : '0deg';
                        const suggestionAnimatedStyle = suggestionAnim ? {
                          maxHeight: suggestionAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, 180],
                          }),
                          opacity: suggestionAnim.interpolate({
                            inputRange: [0, 0.15, 1],
                            outputRange: [0, 0.35, 1],
                          }),
                        } : null;
                        return (
                        <React.Fragment key={`year-target-row-${row.id}`}>
                        <View
                          style={[
                            styles.yearTargetsTableRow,
                            styles.yearTargetsTableBodyRow,
                            isExpanded && styles.yearTargetsTableBodyRowExpanded,
                          ]}
                        >
                          <View style={[styles.yearTargetsSubjectCol, styles.yearTargetsSubjectCell]}>
                            <Text style={styles.yearTargetsSubjectCellName}>{row.name}</Text>
                            <View style={styles.yearTargetsSubjectCadenceSlot}>
                              {row.cadenceCompactLabel ? (
                                <View style={styles.yearTargetsSubjectCadenceBadge}>
                                  <Text style={styles.yearTargetsSubjectCadenceHint}>{row.cadenceCompactLabel}</Text>
                                </View>
                              ) : (
                                <View style={styles.yearTargetsSubjectCadenceSpacer} />
                              )}
                            </View>
                          </View>
                          <View style={[styles.yearTargetsCellWrap, styles.yearTargetsTargetCol]}>
                            <Text style={[styles.yearTargetsMetricCellLinkText, styles.yearTargetsTargetCellText, styles.yearTargetsCellLeft]}>{row.targetDays}</Text>
                          </View>
                          <View style={[styles.yearTargetsCellWrap, styles.yearTargetsDoneCol]}>
                            <Text style={[styles.yearTargetsMetricCellLinkText, styles.yearTargetsMetricCellEmphasisText, styles.yearTargetsCellLeft]}>{row.completedDays}</Text>
                          </View>
                          {row.upcomingDays > 0 ? (
                            <View style={[styles.yearTargetsCellWrap, styles.yearTargetsUpcomingCol]}>
                              <Text style={[styles.yearTargetsMetricCellLinkText, styles.yearTargetsCellLeft]}>{row.upcomingDays}</Text>
                            </View>
                          ) : (
                            <View style={[styles.yearTargetsCellWrap, styles.yearTargetsUpcomingCol]}>
                              <Text style={[styles.yearTargetsMetricCellLinkText, styles.yearTargetsMetricCellMutedText, styles.yearTargetsCellLeft]}>
                                -
                              </Text>
                            </View>
                          )}
                          <View style={[styles.yearTargetsCellWrap, styles.yearTargetsProjectedCol]}>
                            <Text style={[styles.yearTargetsMetricCellLinkText, styles.yearTargetsCellLeft]}>
                              {row.projectedDays}
                            </Text>
                          </View>
                          <View style={[styles.yearTargetsCellWrap, styles.yearTargetsBalanceCol, styles.yearTargetsGapCellWrap]}>
                            <Pressable
                              onPress={() => {
                                if (!showSuggestion) return;
                                toggleYearTargetSuggestion(rowId);
                              }}
                              disabled={!showSuggestion}
                              style={({ hovered }) => [
                                styles.yearTargetsGapChipButton,
                                row.gapDays < 0 && styles.yearTargetsNegativeBalancePill,
                                row.gapDays > 0 && styles.yearTargetsPositiveGapPill,
                                showSuggestion && styles.yearTargetsGapChipButtonInteractive,
                                hovered && showSuggestion && styles.yearTargetsGapChipButtonHover,
                                hovered && showSuggestion && row.gapDays < 0 && styles.yearTargetsGapChipButtonNegativeHover,
                                hovered && showSuggestion && row.gapDays > 0 && styles.yearTargetsGapChipButtonPositiveHover,
                              ]}
                            >
                              <View style={styles.yearTargetsGapChipContent}>
                                <Text
                                  style={[
                                    styles.yearTargetsBalancePill,
                                    row.gapDays < 0 && styles.yearTargetsNegativeBalanceText,
                                    row.gapDays > 0 && styles.yearTargetsPositiveGapText,
                                  ]}
                                >
                                  {`${row.gapDays > 0 ? `+${row.gapDays}` : row.gapDays} days`}
                                </Text>
                                {showSuggestion ? (
                                  <Animated.View style={[styles.yearTargetsGapChipChevronWrap, { transform: [{ rotate: chevronRotate }] }]}>
                                    <Text
                                      style={[
                                        styles.yearTargetsGapChipChevron,
                                        row.gapDays < 0 && styles.yearTargetsNegativeBalanceText,
                                        row.gapDays > 0 && styles.yearTargetsPositiveGapText,
                                      ]}
                                    >
                                      ▾
                                    </Text>
                                  </Animated.View>
                                ) : null}
                              </View>
                            </Pressable>
                          </View>
                        </View>
                        {showSuggestion && isExpanded ? (
                          <View style={[styles.yearTargetsTableRow, styles.yearTargetsExpandedSuggestionRow]}>
                            <Animated.View style={[styles.yearTargetsExpandedSuggestionWrap, suggestionAnimatedStyle]}>
                            <View style={styles.yearTargetsExpandedSuggestionContainer}>
                              <View style={styles.yearTargetsExpandedSuggestionTopLine}>
                                <Text style={styles.yearTargetsPredictiveItemGap}>{`${catchUpRow.shortDays} days short`}</Text>
                                <View style={styles.yearTargetsPredictiveItemPaceWrap}>
                                  <Text style={styles.yearTargetsPredictiveItemArrow}>→</Text>
                                  <Text style={styles.yearTargetsPredictiveItemPace}>
                                    {`+${catchUpRow.lowSessionsPerWeek}${catchUpRow.highSessionsPerWeek > catchUpRow.lowSessionsPerWeek ? `-${catchUpRow.highSessionsPerWeek}` : ''}/week`}
                                  </Text>
                                </View>
                              </View>
                              <View style={styles.yearTargetsSavedTargetRow}>
                                <Text style={styles.yearTargetsSavedTargetText}>
                                  {`Gap is based on saved subject planning preferences: ${row.targetDays} days.`}
                                </Text>
                                <TouchableOpacity
                                  onPress={openPlanningPreferences}
                                  style={styles.yearTargetsSavedTargetButton}
                                  activeOpacity={0.85}
                                  accessibilityRole="button"
                                  accessibilityLabel="Change saved target"
                                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                >
                                  <Text style={styles.yearTargetsSavedTargetButtonText}>Change saved target</Text>
                                </TouchableOpacity>
                              </View>
                              {suggestionSummary ? (
                                <View style={styles.yearTargetsExpandedSuggestionLineRow}>
                                  <Text style={styles.yearTargetsPredictiveSuggestionLine}>
                                    {`Suggestion: ${suggestionSummary}`}
                                  </Text>
                                </View>
                              ) : null}
                              {suggestedDaysText ? (
                                <View style={styles.yearTargetsExpandedSuggestionLineRow}>
                                  <Text style={styles.yearTargetsPredictiveSuggestionLine}>
                                    {`Suggested days: ${suggestedDaysText}.`}
                                  </Text>
                                  {catchUpRow.suggestedEndYmd ? (
                                    <TouchableOpacity
                                      onPress={() => openApplySuggestionConfirmModal(catchUpRow)}
                                      activeOpacity={0.85}
                                      disabled={applyingSuggestionSubjectId === catchUpRow.id}
                                      style={[
                                        styles.yearTargetsPredictiveSuggestionButton,
                                        applyingSuggestionSubjectId === catchUpRow.id && styles.yearTargetsPredictiveSuggestionButtonDisabled,
                                      ]}
                                      {...(Platform.OS === 'web' && { cursor: applyingSuggestionSubjectId === catchUpRow.id ? 'default' : 'pointer' })}
                                    >
                                      <Text
                                        style={[
                                          styles.yearTargetsPredictiveSuggestionButtonText,
                                          applyingSuggestionSubjectId === catchUpRow.id && styles.yearTargetsPredictiveSuggestionButtonTextDisabled,
                                        ]}
                                      >
                                        {applyingSuggestionSubjectId === catchUpRow.id ? 'Applying...' : 'Apply'}
                                      </Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                            </Animated.View>
                          </View>
                        ) : null}
                        </React.Fragment>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </ScrollView>
        <Modal
          visible={showApplySuggestionConfirmModal}
          transparent
          animationType="fade"
          onRequestClose={closeApplySuggestionConfirmModal}
        >
          <TouchableOpacity
            style={styles.subjectPickerOverlay}
            activeOpacity={1}
            onPress={closeApplySuggestionConfirmModal}
          >
            <TouchableOpacity style={styles.applySuggestionConfirmModal} activeOpacity={1} onPress={() => {}}>
              <View style={styles.applySuggestionConfirmHeader}>
                <Text style={styles.applySuggestionConfirmTitle}>Apply suggestion</Text>
                <TouchableOpacity
                  onPress={closeApplySuggestionConfirmModal}
                  style={styles.subjectPickerClose}
                  disabled={Boolean(applyingSuggestionSubjectId)}
                  {...(Platform.OS === 'web' && { cursor: applyingSuggestionSubjectId ? 'default' : 'pointer' })}
                >
                  <X size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>
              <Text style={styles.applySuggestionConfirmBodyText}>
                {`This will update ${pendingSuggestionToApply?.name || 'this subject'} to end on ${formatDateDisplayYmd(pendingSuggestionToApply?.suggestedEndYmd || '')} and regenerate the plan events.`}
              </Text>
              <View style={styles.applySuggestionConfirmActions}>
                <TouchableOpacity
                  style={styles.subjectPickerCancelBtn}
                  onPress={closeApplySuggestionConfirmModal}
                  disabled={Boolean(applyingSuggestionSubjectId)}
                  {...(Platform.OS === 'web' && { cursor: applyingSuggestionSubjectId ? 'default' : 'pointer' })}
                >
                  <Text style={styles.subjectPickerCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.applySuggestionConfirmActionBtn,
                    applyingSuggestionSubjectId && styles.applySuggestionConfirmActionBtnDisabled,
                  ]}
                  onPress={confirmApplySuggestionFromModal}
                  disabled={Boolean(applyingSuggestionSubjectId)}
                  {...(Platform.OS === 'web' && { cursor: applyingSuggestionSubjectId ? 'default' : 'pointer' })}
                >
                  <CheckCircle2 size={16} color="#FFFFFF" strokeWidth={2.2} />
                  <Text
                    style={[
                      styles.applySuggestionConfirmActionBtnText,
                      applyingSuggestionSubjectId && styles.applySuggestionConfirmActionBtnTextDisabled,
                    ]}
                  >
                    {applyingSuggestionSubjectId ? 'Applying...' : 'Apply'}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        <Modal
          visible={showSubjectPickerModal}
          transparent
          animationType="none"
          onRequestClose={() => setShowSubjectPickerModal(false)}
        >
          <TouchableOpacity
            style={styles.subjectPickerOverlay}
            activeOpacity={1}
            onPress={() => setShowSubjectPickerModal(false)}
          >
            <TouchableOpacity style={styles.subjectPickerModal} activeOpacity={1} onPress={() => {}}>
              <View style={styles.subjectPickerHeader}>
                <View style={styles.subjectPickerHeaderTextWrap}>
                  <Text style={styles.subjectPickerTitle}>
                    {subjectPickerAction === 'edit' ? 'Choose a subject to edit' : 'Choose a subject to add to plan'}
                  </Text>
                  <Text style={styles.subjectPickerSubtitle}>
                    {subjectPickerAction === 'edit'
                      ? 'Select a subject with an existing plan.'
                      : 'Select the subject you want to create or update a plan for.'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.subjectPickerClose}
                  onPress={() => setShowSubjectPickerModal(false)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <X size={20} color="#6b7280" />
                </TouchableOpacity>
              </View>

              {subjectPickerOptions.length > 0 ? (
                <View style={styles.subjectPickerList}>
                  {subjectPickerOptions.map((subject, index) => {
                    const studentMeta = getSubjectStudentMeta(subject);
                    return (
                    <TouchableOpacity
                      key={String(subject?.id || index)}
                      style={[
                        styles.subjectPickerItem,
                        index === subjectPickerOptions.length - 1 && styles.subjectPickerItemLast,
                      ]}
                      onPress={() => handlePickSubjectFromModal(subject?.id)}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <View style={styles.subjectPickerItemTextWrap}>
                        <Text style={styles.subjectPickerItemText}>{subject?.name || 'Subject'}</Text>
                        {studentMeta.label ? (
                          <View style={styles.subjectPickerStudentsRow}>
                            <ChildAvatarCluster
                              childIds={studentMeta.ids}
                              familyChildren={children}
                              size={28}
                              overlap={-8}
                            />
                            <Text style={styles.subjectPickerStudentsText}>{studentMeta.label}</Text>
                          </View>
                        ) : null}
                      </View>
                      <ChevronRight size={16} color="#6b7280" />
                    </TouchableOpacity>
                    );
                  })}
                </View>
              ) : subjectPickerEmptyMessage ? (
                <View style={styles.subjectPickerEmptyWrap}>
                  <Text style={styles.subjectPickerEmptyText}>{subjectPickerEmptyMessage}</Text>
                </View>
              ) : null}
              <View style={styles.subjectPickerActions}>
                <TouchableOpacity
                  style={styles.subjectPickerCancelBtn}
                  onPress={() => setShowSubjectPickerModal(false)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.subjectPickerCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.subjectPickerNewSubjectBtn}
                  onPress={() => {
                    setShowSubjectPickerModal(false);
                    openAddSubjectForCurrentSlot();
                  }}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Sparkles size={14} color="#ffffff" />
                  <Text style={styles.subjectPickerNewSubjectBtnText}>New Subject</Text>
                </TouchableOpacity>
              </View>

            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        <Modal
          visible={showSubjectEventsModal}
          transparent
          animationType="none"
          onRequestClose={() => setShowSubjectEventsModal(false)}
        >
          <TouchableOpacity
            style={styles.subjectEventsOverlay}
            activeOpacity={1}
            onPress={() => setShowSubjectEventsModal(false)}
          >
            <TouchableOpacity style={styles.subjectEventsModal} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.subjectEventsHeader}>
                <View style={styles.subjectEventsHeaderTextWrap}>
                  <Text style={styles.subjectEventsTitle}>
                    {subjectEventsModalData.subjectName || 'Subject'} events
                  </Text>
                  <Text style={styles.subjectEventsSubtitle}>
                    {subjectEventsModalData.termTitle ? `${subjectEventsModalData.termTitle} instructional events` : 'Instructional events'}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowSubjectEventsModal(false)} style={styles.subjectEventsCloseButton}>
                  <X size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.subjectEventsList} contentContainerStyle={styles.subjectEventsListContent}>
                {(subjectEventsModalData.events || []).length === 0 ? (
                  <Text style={styles.subjectEventsEmptyText}>No instructional events found for this school year.</Text>
                ) : (
                  (subjectEventsModalData.events || []).map((eventItem) => (
                    <View key={eventItem.id} style={styles.subjectEventRow}>
                      {(() => {
                        const isPastEvent = Number(eventItem?.startMs || 0) > 0 && Number(eventItem.startMs) < Date.now();
                        const isAttended = eventItem?.hasAttendancePresent === true
                          || String(eventItem?.status || '').toLowerCase() === 'done'
                          || String(eventItem?.instructional_status || '').toUpperCase() === 'MANUAL_COUNTS';
                        const statusLabel = isPastEvent ? (isAttended ? 'Attended' : 'Unattended') : 'Upcoming';
                        return (
                          <View style={styles.subjectEventRowTop}>
                            <Text style={styles.subjectEventRowTitle}>{eventItem.title || 'Event'}</Text>
                            <View style={styles.subjectEventRowStatusChip}>
                              <View
                                style={[
                                  styles.subjectEventRowStatusChipDot,
                                  statusLabel === 'Attended' && styles.subjectEventRowStatusChipDotAttended,
                                  statusLabel === 'Unattended' && styles.subjectEventRowStatusChipDotUnattended,
                                  statusLabel === 'Upcoming' && styles.subjectEventRowStatusChipDotUpcoming,
                                ]}
                              />
                              <Text style={styles.subjectEventRowStatusChipText}>{statusLabel}</Text>
                            </View>
                          </View>
                        );
                      })()}
                      <Text style={styles.subjectEventRowDate}>{formatEventDateTime(eventItem.startTs)}</Text>
                      {eventItem.unitName ? (
                        <Text style={styles.subjectEventRowUnit}>Unit: {eventItem.unitName}</Text>
                      ) : null}
                    </View>
                  ))
                )}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
        <SubjectPastEventsAttendanceModal
          visible={showPastEventsAttendanceModal}
          onClose={() => setShowPastEventsAttendanceModal(false)}
          familyId={familyId}
          subjectId={attendanceModalData.subjectId}
          events={attendanceModalData.events}
          onCompleted={() => setEventsRefreshKey((prev) => prev + 1)}
          getChildName={(childId) => childNameById[String(childId)] || 'Student'}
          onOpenEvent={(eventId, initialEvent) => {
            setShowPastEventsAttendanceModal(false);
            openEventDetails(eventId, initialEvent);
          }}
        />
        <Modal
          visible={showUpcomingEventsModal}
          transparent
          animationType="none"
          onRequestClose={() => setShowUpcomingEventsModal(false)}
        >
          <TouchableOpacity
            style={styles.subjectEventsOverlay}
            activeOpacity={1}
            onPress={() => setShowUpcomingEventsModal(false)}
          >
            <TouchableOpacity style={styles.subjectEventsModal} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
              <View style={styles.subjectEventsHeader}>
                <View style={styles.subjectEventsHeaderTextWrap}>
                  <Text style={styles.subjectEventsTitle}>
                    {upcomingEventsModalData.subjectName || 'Subject'} events
                  </Text>
                </View>
                <View style={styles.subjectEventsHeaderActions}>
                  <TouchableOpacity onPress={() => setShowUpcomingEventsModal(false)} style={styles.subjectEventsCloseButton}>
                    <X size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>
              </View>
              <ScrollView style={styles.subjectEventsList} contentContainerStyle={styles.subjectEventsListContent}>
                {(upcomingEventsModalData.events || []).length === 0 ? (
                  <Text style={styles.subjectEventsEmptyText}>No instructional events are scheduled yet.</Text>
                ) : (
                  (upcomingEventsModalData.events || []).map((eventItem) => (
                    <View key={eventItem.id} style={styles.subjectEventRow}>
                      {(() => {
                        const isPastEvent = Number(eventItem?.startMs || 0) > 0 && Number(eventItem.startMs) < Date.now();
                        const isAttended = eventItem?.hasAttendancePresent === true
                          || String(eventItem?.status || '').toLowerCase() === 'done'
                          || String(eventItem?.instructional_status || '').toUpperCase() === 'MANUAL_COUNTS';
                        return (
                          <>
                      <View style={styles.subjectEventRowTop}>
                        <Text style={styles.subjectEventRowTitle}>{eventItem.title || 'Event'}</Text>
                        <View style={styles.subjectEventRowMetaRight}>
                          {Number(eventItem?.startMs || 0) > 0 ? (
                            <View style={[styles.subjectEventRowStatusChips, styles.subjectEventRowStatusChipsRight]}>
                              <View
                                style={[
                                  styles.subjectEventRowStatusChip,
                                  (isPastEvent && isAttended) && styles.subjectEventRowStatusChipAttended,
                                  (isPastEvent && !isAttended) && styles.subjectEventRowStatusChipUnattended,
                                  !isPastEvent && styles.subjectEventRowStatusChipUpcoming,
                                ]}
                              >
                                <View
                                  style={[
                                    styles.subjectEventRowStatusChipDot,
                                    (isPastEvent && isAttended) && styles.subjectEventRowStatusChipDotAttended,
                                    (isPastEvent && !isAttended) && styles.subjectEventRowStatusChipDotUnattended,
                                    !isPastEvent && styles.subjectEventRowStatusChipDotUpcoming,
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.subjectEventRowStatusChipText,
                                    isAttended ? styles.subjectEventRowStatusChipTextAttended : null,
                                    !isPastEvent ? styles.subjectEventRowStatusChipTextUpcoming : null,
                                  ]}
                                >
                                  {isPastEvent ? (isAttended ? 'Attended' : 'Unattended') : 'Upcoming'}
                                </Text>
                              </View>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <Text style={styles.subjectEventRowDate}>{formatEventDateTime(eventItem.startTs)}</Text>
                      {eventItem.unitName ? (
                        <Text style={styles.subjectEventRowUnit}>Unit: {eventItem.unitName}</Text>
                      ) : null}
                      <View style={styles.subjectEventRowActions}>
                        <TouchableOpacity
                          onPress={() => {
                            setShowUpcomingEventsModal(false);
                            openEventDetails(eventItem.id, eventItem);
                          }}
                          activeOpacity={0.8}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.subjectEventRowLinkText}>Open event details</Text>
                        </TouchableOpacity>
                        {isPastEvent && !isAttended ? (
                            <TouchableOpacity
                              onPress={() => markEventAsAttendedFromAllEventsModal(eventItem)}
                              activeOpacity={0.8}
                              disabled={markingAttendanceEventId === eventItem.id}
                              {...(Platform.OS === 'web' && { cursor: markingAttendanceEventId === eventItem.id ? 'default' : 'pointer' })}
                            >
                              <Text style={styles.subjectEventRowLinkText}>
                                {markingAttendanceEventId === eventItem.id ? 'Marking...' : 'Mark attended'}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        {isPastEvent && isAttended ? (
                            <TouchableOpacity
                              onPress={() => markEventAsUnattendedFromAllEventsModal(eventItem)}
                              activeOpacity={0.8}
                              disabled={markingAttendanceEventId === eventItem.id}
                              {...(Platform.OS === 'web' && { cursor: markingAttendanceEventId === eventItem.id ? 'default' : 'pointer' })}
                            >
                              <Text style={styles.subjectEventRowLinkText}>
                                {markingAttendanceEventId === eventItem.id ? 'Marking...' : 'Mark unattended'}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                      </View>
                          </>
                        );
                      })()}
                    </View>
                  ))
                )}
              </ScrollView>
              {(() => {
                const hasPendingPastEvents = (upcomingEventsModalData.events || []).some((eventItem) => {
                  const startMs = Number(eventItem?.startMs || 0);
                  const isPastEvent = startMs > 0 && startMs < Date.now();
                  const isAttended = eventItem?.hasAttendancePresent === true
                    || String(eventItem?.status || '').toLowerCase() === 'done'
                    || String(eventItem?.instructional_status || '').toUpperCase() === 'MANUAL_COUNTS';
                  return isPastEvent && !isAttended;
                });
                const isBulkMarking = markingAttendanceEventId === '__bulk_mark_all_past_attended__';
                return (
                  <View style={styles.subjectEventsFooter}>
                    <View style={styles.subjectEventsFooterButtonsRow}>
                      <TouchableOpacity
                        onPress={() => setShowUpcomingEventsModal(false)}
                        style={styles.subjectEventsFooterCancelButton}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.subjectEventsFooterCancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={markAllPastEventsAsAttendedFromAllEventsModal}
                        style={[
                          styles.subjectEventsFooterActionButton,
                          (!hasPendingPastEvents || isBulkMarking) && styles.subjectEventsFooterActionButtonDisabled,
                        ]}
                        activeOpacity={0.85}
                        disabled={!hasPendingPastEvents || isBulkMarking}
                      >
                        <CheckCircle2 size={18} color={!hasPendingPastEvents || isBulkMarking ? '#94A3B8' : '#FFFFFF'} strokeWidth={2} />
                        <Text
                          style={[
                            styles.subjectEventsFooterActionButtonText,
                            (!hasPendingPastEvents || isBulkMarking) && styles.subjectEventsFooterActionButtonTextDisabled,
                          ]}
                        >
                          {isBulkMarking ? 'Marking...' : 'Mark all as attended'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.stepSection}>
          <Text style={styles.stepTitle}>STEP 1 — WHAT ARE WE PLANNING FOR?</Text>
          <View style={styles.stepContent}>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <TouchableOpacity
                  style={styles.planningModeHeaderTrigger}
                  onPress={() => {
                    setShowTermDropdown(false);
                    setShowYearDropdown((prev) => !prev);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.planningModeHeaderTriggerText}>
                    {loadingYears ? 'School Year' : (selectedSchoolYear?.label || 'School Year')}
                  </Text>
                  {showYearDropdown ? <ChevronUp size={16} color={SUB} /> : <ChevronDown size={16} color={SUB} />}
                </TouchableOpacity>
                {showYearDropdown && !loadingYears ? (
                  <View style={styles.dropdownOptions}>
                    {schoolYearOptions.map((opt) => {
                      const active = String(opt.id) === String(selectedSchoolYearId || '');
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                          onPress={() => {
                            setSelectedSchoolYearId(opt.id);
                            setShowYearDropdown(false);
                          }}
                        >
                          <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>
              <View style={styles.halfField}>
                <TouchableOpacity
                  style={styles.planningModeHeaderTrigger}
                  onPress={() => {
                    setShowYearDropdown(false);
                    setShowTermDropdown((prev) => !prev);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.planningModeHeaderTriggerText}>{selectedTermOption.label}</Text>
                  {showTermDropdown ? <ChevronUp size={16} color={SUB} /> : <ChevronDown size={16} color={SUB} />}
                </TouchableOpacity>
                {showTermDropdown ? (
                  <View style={styles.dropdownOptions}>
                    {TERM_OPTIONS.map((opt) => {
                      const active = opt.id === selectedTerm;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.dropdownOption, active && styles.dropdownOptionActive]}
                          onPress={() => {
                            setSelectedTerm(opt.id);
                            setShowTermDropdown(false);
                          }}
                        >
                          <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={[styles.planningModeToggleRow, styles.checkboxRow]}>
              <TouchableOpacity onPress={() => setBuildWithDefaults((prev) => !prev)} activeOpacity={0.85}>
                <View style={[styles.planningModeCheckbox, buildWithDefaults && styles.planningModeCheckboxActive]}>
                  {buildWithDefaults ? <Check size={12} color="#ffffff" strokeWidth={2.5} /> : null}
                </View>
              </TouchableOpacity>
              <Text style={styles.planningModeToggleText}>
                Use <Text style={styles.planningModeSecondaryCtaText}>term defaults</Text>
              </Text>
            </View>

            <View style={styles.subjectActions}>
              <TouchableOpacity
                style={[styles.step3ActionPill, selectedSubjectIds.length === baseSubjects.length && styles.step3ActionPillActive]}
                onPress={() => setSelectedSubjectIds(baseSubjects.map((s) => String(s.id)).filter(Boolean))}
              >
                <View style={styles.step3ActionPillInner}>
                  <Text style={[styles.step3ActionPillText, selectedSubjectIds.length === baseSubjects.length && styles.step3ActionPillTextActive]}>
                    All subjects
                  </Text>
                </View>
              </TouchableOpacity>
              {baseSubjects.map((subject) => {
                const active = selectedSubjectIds.includes(String(subject.id));
                return (
                  <TouchableOpacity
                    key={subject.id}
                    style={[styles.step3ActionPill, active && styles.step3ActionPillActive]}
                    onPress={() => toggleSubject(subject.id)}
                  >
                    <View style={styles.step3ActionPillInner}>
                      <Text style={[styles.step3ActionPillText, active && styles.step3ActionPillTextActive]}>
                        {subject.name || 'Subject'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.stepSection}>
          <Text style={styles.stepTitle}>STEP 2 — WHEN ARE WE LEARNING?</Text>
          <View style={styles.stepContent}>
            {selectedSubjectRows.map((subject, idx) => {
              const sid = String(subject.id);
              const block = blocksBySubject[sid] || { weekdays: [1], start_time: '09:00', end_time: '10:00' };
              return (
                <View key={sid} style={[styles.blockRow, idx === selectedSubjectRows.length - 1 && styles.blockRowNoDivider]}>
                  <Text style={styles.blockRowSubject}>{subject.name || 'Subject'}</Text>
                  <View style={styles.blockRowLine}>
                    <View style={styles.dayChipsRow}>
                      {WEEKDAY_NUMBERS.map((dayNum, dayIdx) => {
                        const active = (block.weekdays || []).includes(dayNum);
                        return (
                          <TouchableOpacity
                            key={`${sid}-${dayNum}`}
                            style={[styles.weekdayChipSmall, active && styles.weekdayChipSmallActive]}
                            onPress={() => toggleBlockWeekday(sid, dayNum)}
                          >
                            <Text style={[styles.weekdayChipSmallText, active && styles.weekdayChipSmallTextActive]}>
                              {WEEKDAY_LABELS[dayIdx]}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <View style={styles.timeRow}>
                      <View style={styles.timeFieldGroup}>
                        <Text style={styles.blockTimeLabel}>Start</Text>
                        <TextInput
                          value={block.start_time || '09:00'}
                          onChangeText={(v) => updateBlock(sid, { start_time: String(v || '').slice(0, 5) })}
                          style={[styles.input, styles.timeField, { height: 44 }]}
                          placeholder="09:00"
                          placeholderTextColor={MUTED}
                        />
                      </View>
                      <View style={styles.timeFieldGroup}>
                        <Text style={styles.blockTimeLabel}>End</Text>
                        <TextInput
                          value={block.end_time || '10:00'}
                          onChangeText={(v) => updateBlock(sid, { end_time: String(v || '').slice(0, 5) })}
                          style={[styles.input, styles.timeField, { height: 44 }]}
                          placeholder="10:00"
                          placeholderTextColor={MUTED}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.stepSection}>
          <Text style={styles.stepTitle}>STEP 3 — WHAT ARE WE LEARNING? (OPTIONAL)</Text>
          <View style={styles.stepContent}>
            {selectedSubjectRows.map((subject) => {
              const actions = [
                { key: 'add', method: 'manual', label: 'Add units', icon: Plus },
                { key: 'generate', method: 'generate', label: 'Generate curriculum', icon: Sparkles },
                { key: 'upload', method: 'upload', label: 'Upload material', icon: Upload },
                { key: 'paste', method: 'paste_plain', label: 'Paste plain text', icon: Pencil },
              ];
              return (
                <View key={`step3-${subject.id}`} style={styles.step3SubjectCard}>
                  <Text style={styles.step3SubjectTitle}>{subject.name || 'Subject'}</Text>
                  <View style={styles.subjectActions}>
                    {actions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <TouchableOpacity
                          key={`${subject.id}-${action.key}`}
                          style={styles.step3ActionPill}
                          onPress={() => handleCurriculumAction(subject, action.method || action.key)}
                        >
                          <View style={styles.step3ActionPillInner}>
                            <Icon size={12} color={SUB} />
                            <Text style={styles.step3ActionPillText}>{action.label}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[styles.stepSection, styles.stepSectionLast]}>
          <Text style={styles.stepTitle}>STEP 4 — DOES THIS SCHEDULE MAKE SENSE?</Text>
          <View style={[styles.stepContent, styles.summaryBox]}>
            {step4Preview && step4Preview.sessionCount > 0 ? (
              <>
                <View style={styles.previewSummaryCard}>
                  <Text style={styles.previewSummaryPrimary}>
                    {step4Preview.sessionCount} sessions · {step4Preview.rangeLabel}
                  </Text>
                  <Text style={styles.previewSummarySecondary}>
                    {step4Preview.daysPerWeek} days/week · {step4Preview.hoursPerDay % 1 === 0
                      ? `${Math.max(0, step4Preview.hoursPerDay)} hr/day`
                      : `${Math.max(0, step4Preview.hoursPerDay).toFixed(1)} hr/day`}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowFullSchedulePreview((prev) => !prev)}
                  style={styles.previewExpandToggle}
                  activeOpacity={0.85}
                >
                  <Text style={styles.previewExpandToggleText}>
                    {showFullSchedulePreview ? 'Hide full summary' : 'Expand full summary'}
                  </Text>
                </TouchableOpacity>
                {showFullSchedulePreview ? (
                  <View style={styles.previewAttendanceCalendarCard}>
                    {step4Preview.details.map((row) => (
                      <View key={`row-${row.subjectName}`} style={styles.previewAttendanceListRow}>
                        <Text style={styles.previewAttendanceListPrimary}>
                          <Text style={styles.previewAttendanceListDateInline}>{row.subjectName}</Text>
                          {' · '}
                          {row.sessions} sessions
                        </Text>
                        <Text style={styles.previewAttendanceListMeta}>
                          {(row.weekdays || []).map((d) => WEEKDAY_LABELS[d]).join(', ') || 'No weekdays'} · {toAmPm(row.start_time)}-{toAmPm(row.end_time)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <View style={styles.previewStepPlaceholderCard}>
                <Text style={styles.previewStepPlaceholderText}>
                  Add schedule in Step 2 to preview your schedule summary.
                </Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelBtn} onPress={() => setSurfaceMode('home')} disabled={saving}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save plan'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  scroll: { flex: 1 },
  content: { paddingBottom: 32 },
  scheduleHeaderBlock: {
    marginBottom: 16,
  },
  schedulePageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: FG,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  scheduleSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: SUB,
    maxWidth: 760,
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  sectionShell: {
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 14,
    marginBottom: 14,
  },
  sectionKicker: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
    color: MUTED,
    marginBottom: 8,
  },
  currentYearTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: FG,
    marginBottom: 6,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  currentMeta: {
    fontSize: 13,
    color: SUB,
    marginBottom: 4,
  },
  currentFact: {
    marginTop: 2,
    fontSize: 13,
    color: FG,
    fontWeight: '600',
  },
  actionRow: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  secondaryBtnText: {
    fontSize: 13,
    color: FG,
    fontWeight: '600',
  },
  otherPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
  },
  otherPlanTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: FG,
  },
  mutedLine: {
    fontSize: 12,
    color: MUTED,
  },
  minorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  minorBtnText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryBuildCta: {
    marginTop: 2,
    borderRadius: 14,
    backgroundColor: '#10b981',
    minHeight: 50,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  primaryBuildCtaText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateCard: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    borderRadius: 16,
    backgroundColor: '#FCFDFE',
    padding: 30,
    minHeight: 280,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 10px rgba(15,23,42,0.04)',
    }),
  },
  emptyScheduleSection: {
    marginBottom: 14,
    gap: 0,
  },
  scheduleEmptyCard: {
    borderWidth: 1,
    borderColor: '#E3E8EF',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  scheduleEmptyText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSection: {
    marginTop: 12,
    paddingVertical: 12,
  },
  yearTargetsSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 0,
    gap: 8,
    paddingHorizontal: 2,
  },
  yearTargetsCard: {
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 2,
    marginBottom: 0,
    gap: 12,
  },
  yearProgressSummaryCard: {
    borderWidth: 1,
    borderColor: '#D7E5F5',
    backgroundColor: '#F8FBFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  yearProgressTrackingHintCompact: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressTrackingRow: {
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  yearProgressTrackingChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressTrackingHint: {
    fontSize: 11,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressSummaryShortfall: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: '800',
    color: '#B91C1C',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressSummaryCompletionNote: {
    fontSize: 12,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressSummaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  yearProgressSummaryTrack: {
    width: '100%',
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E6EEF8',
    overflow: 'hidden',
  },
  yearProgressSummaryFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Platform.OS === 'web' ? 'transparent' : '#6BB3E8',
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(90deg, #f4b4f8 0%, #c4b5fd 20%, #93c5fd 40%, #a5f3fc 60%, #bbf7d0 80%, #facc15 100%)',
    }),
  },
  yearProgressSummaryMetric: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressSummaryBalance: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressSummaryBalanceNegative: {
    color: '#B91C1C',
  },
  yearProgressSummaryProjected: {
    fontSize: 12,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressSummaryProjectedNote: {
    marginTop: -1,
    fontSize: 11,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSubjectCardsWrap: {
    gap: 10,
  },
  yearTargetsTable: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  yearTargetsHintRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  yearTargetsHintText: {
    fontSize: 11,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  yearTargetsTableBodyRow: {
    minHeight: 72,
    alignItems: 'flex-start',
    paddingTop: 8,
    paddingBottom: 8,
  },
  yearTargetsTableBodyRowExpanded: {
    borderBottomWidth: 0,
  },
  yearTargetsTableHeaderRow: {
    backgroundColor: '#F8FAFC',
    minHeight: 48,
  },
  yearTargetsTableTotalRow: {
    backgroundColor: '#EFF5FF',
    borderBottomWidth: 0,
  },
  yearTargetsTableTotalDivider: {
    borderTopWidth: 1,
    borderTopColor: '#CBD5E1',
  },
  yearTargetsTableHeaderCell: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsTableCell: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    paddingHorizontal: 10,
    paddingVertical: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsHeaderCellWrap: {
    justifyContent: 'center',
    paddingVertical: 6,
  },
  yearTargetsCellWrap: {
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    paddingVertical: 6,
  },
  yearTargetsTargetCellButton: {
    flex: 0.85,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  yearTargetsMetricCellButton: {
    flex: 0.85,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  yearTargetsMetricCellLinkText: {
    fontSize: 12,
    color: '#1F2937',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsMetricCellEmphasisText: {
    color: '#1F2937',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsMetricCellMutedText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  yearTargetsHeaderCellLeft: {
    textAlign: 'left',
  },
  yearTargetsHeaderCellRight: {
    textAlign: 'right',
  },
  yearTargetsHeaderGapCellWrap: {
    alignItems: 'flex-end',
  },
  yearTargetsCellLeft: {
    textAlign: 'left',
  },
  yearTargetsCellRight: {
    textAlign: 'right',
  },
  yearTargetsTargetCellText: {
    color: '#1F2937',
    textDecorationLine: 'none',
  },
  yearTargetsEditableCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yearTargetsTableTotalText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsTableTotalMutedText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSubjectCol: {
    flex: 2.2,
  },
  yearTargetsSubjectCell: {
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  yearTargetsSubjectCellName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSubjectCadenceHint: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSubjectCadenceBadge: {
    marginTop: 2,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  yearTargetsSubjectCadenceSlot: {
    marginTop: 4,
    minHeight: 22,
    justifyContent: 'center',
  },
  yearTargetsSubjectCadenceSpacer: {
    minHeight: 20,
  },
  yearTargetsNumberCol: {
    flex: 1,
  },
  yearTargetsTargetCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  yearTargetsDoneCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  yearTargetsUpcomingCol: {
    flex: 1.2,
    alignItems: 'flex-start',
  },
  yearTargetsProjectedCol: {
    flex: 2,
    alignItems: 'flex-start',
  },
  yearTargetsBalanceCol: {
    flex: 1.2,
    alignItems: 'flex-start',
  },
  yearTargetsBalanceCell: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'flex-start',
  },
  yearTargetsGapCellWrap: {
    alignItems: 'flex-end',
  },
  yearTargetsBalancePill: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsGapChipButton: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  yearTargetsGapChipButtonInteractive: {
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearTargetsGapChipButtonHover: {
    transform: [{ translateY: -1 }],
  },
  yearTargetsGapChipButtonNegativeHover: {
    backgroundColor: '#FEE2E2',
  },
  yearTargetsGapChipButtonPositiveHover: {
    backgroundColor: '#DCFCE7',
  },
  yearTargetsGapChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yearTargetsGapChipChevronWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearTargetsGapChipChevron: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsNegativeBalancePill: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  yearTargetsNegativeBalanceText: {
    color: '#B91C1C',
  },
  yearTargetsPositiveGapPill: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  yearTargetsPositiveGapText: {
    color: '#047857',
  },
  yearTargetsSubjectCard: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  yearTargetsSubjectCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  yearTargetsSubjectCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsInlineTargetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.28)',
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearTargetsInlineTargetText: {
    fontSize: 12,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSubjectProgressText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsMetricsRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
  },
  yearTargetsMetricLine: {
    fontSize: 12,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsDeltaLine: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsStatusLine: {
    fontSize: 12,
    color: '#7C2D12',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPacingLine: {
    fontSize: 12,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPrimaryAction: {
    marginTop: 2,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(107,179,232,0.45)',
    backgroundColor: 'rgba(107,179,232,0.12)',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearTargetsPrimaryActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveCard: {
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  yearTargetsPredictiveHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  yearTargetsPredictiveTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  yearTargetsPredictiveItemBlock: {
    gap: 4,
  },
  yearTargetsPredictiveItemBlockSpaced: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  yearTargetsPredictiveItemSubject: {
    width: 74,
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveItemGap: {
    minWidth: 110,
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveItemPaceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  yearTargetsPredictiveItemArrow: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '400',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveItemPace: {
    fontSize: 12,
    fontWeight: '400',
    color: '#475569',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveSuggestionLine: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '400',
    lineHeight: 18,
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveSuggestionRow: {
    marginLeft: 80,
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  yearTargetsExpandedSuggestionRow: {
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: 10,
  },
  yearTargetsExpandedSuggestionWrap: {
    width: '100%',
    overflow: 'hidden',
  },
  yearTargetsExpandedSuggestionContainer: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  yearTargetsExpandedSuggestionTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  yearTargetsExpandedSuggestionLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  yearTargetsSavedTargetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  yearTargetsSavedTargetText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '400',
    lineHeight: 18,
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSavedTargetButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearTargetsSavedTargetButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3730A3',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveSuggestionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearTargetsPredictiveSuggestionButtonDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  yearTargetsPredictiveSuggestionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3730A3',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveSuggestionButtonTextDisabled: {
    color: '#94A3B8',
  },
  yearTargetsPredictiveLine: {
    fontSize: 12,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictivePrimaryLine: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveBreakdownLine: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveAdjustLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexWrap: 'wrap',
  },
  yearTargetsPredictiveCtaButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearTargetsPredictiveCtaButtonPrimary: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  yearTargetsPredictiveCtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsPredictiveCtaTextPrimary: {
    color: '#334155',
  },
  yearTargetsPredictiveLinkButton: {
    alignSelf: 'flex-start',
    paddingVertical: 2,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  yearTargetsPredictiveLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  yearTargetsHeaderCopy: {
    flex: 1,
    minWidth: 280,
  },
  yearTargetsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#17203b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#596a87',
    maxWidth: 680,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsTotalText: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '700',
    color: '#17203b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSubjectList: {
    marginTop: 8,
    gap: 6,
  },
  yearTargetsSubjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  yearTargetsSubjectName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#17203b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsSubjectValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5f6f89',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearTargetsHelperText: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: '#5f6f89',
    maxWidth: 900,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termCard: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
    gap: 0,
    maxWidth: 1400,
    width: '100%',
    marginBottom: 0,
  },
  termCardSpaced: {
    marginTop: 32,
  },
  termCardFirstSpaced: {
    marginTop: 12,
  },
  termSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 0,
    gap: 8,
    paddingHorizontal: 0,
  },
  termHeaderDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: 16,
  },
  termHeaderCompactTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  termHeaderLeft: {
    flex: 1,
    minWidth: 260,
  },
  termTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  termTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#172033',
    flexShrink: 1,
  },
  termSubtext: {
    marginTop: 4,
    marginLeft: 38,
    fontSize: 13,
    color: '#8A94A6',
    fontWeight: '600',
  },
  termActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  weekGrid: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  dayColumn: {
    flex: 1,
    minWidth: 140,
    minHeight: 124,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#EEF0F6',
    backgroundColor: '#FBFCFF',
    padding: 10,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#5E6879',
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  dayBody: {
    flex: 1,
    gap: 8,
  },
  lessonChip: {
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E1E6F0',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  lessonTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6B7280',
  },
  lessonTime: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#9AA3B2',
  },
  lessonTerm: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  addSlotButton: {
    height: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E6F0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  addSlotText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#9AA3B2',
  },
  subjectSection: {
    paddingTop: 0,
    gap: 0,
  },
  cadenceSectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cadenceStatusTable: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderBottomWidth: 0,
    borderRadius: 10,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  cadenceStatusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 6,
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  cadenceStatusHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  cadenceStatusActionsHeaderText: {
    textAlign: 'right',
  },
  cadenceStatusSubjectCol: {
    flex: 1.1,
    minWidth: 140,
  },
  cadenceStatusStudentsCol: {
    flex: 1.2,
    minWidth: 170,
  },
  cadenceStatusSavedCol: {
    flex: 2.1,
    minWidth: 250,
  },
  cadenceStatusProgressCol: {
    flex: 1.7,
    minWidth: 220,
  },
  cadenceStatusActionsCol: {
    flex: 1.3,
    minWidth: 200,
  },
  subjectRows: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  subjectRow: {
    minHeight: 82,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  subjectRowLast: {
    borderBottomWidth: 0,
  },
  subjectMain: {
    width: 'auto',
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectStudentsCol: {
    paddingTop: 2,
  },
  subjectMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectMetaRow: {
    marginTop: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  subjectCadence: {
    flex: 0,
  },
  subjectCadencePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  subjectCadenceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectProgressCol: {
    paddingTop: 1,
  },
  subjectProgressMetric: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectProgressMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  subjectProgressChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  subjectProgressChipOnTrack: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  subjectProgressChipAhead: {
    borderColor: '#6EE7B7',
    backgroundColor: '#ECFDF5',
  },
  subjectProgressChipBehind: {
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
  },
  subjectProgressChipNoCadence: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  subjectProgressChipText: {
    fontSize: 11,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectProgressChipTextOnTrack: {
    color: '#1D4ED8',
  },
  subjectProgressChipTextAhead: {
    color: '#047857',
  },
  subjectProgressChipTextBehind: {
    color: '#C2410C',
  },
  subjectProgressChipTextNoCadence: {
    color: '#B45309',
  },
  subjectProgressDetail: {
    fontSize: 12,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventCountLink: {
    alignSelf: 'flex-start',
    marginTop: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectEventCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textDecorationLine: 'underline',
  },
  subjectRowActions: {
    flexDirection: 'column',
    gap: 5,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
  },
  subjectRowActionLink: {
    paddingVertical: 1,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectRowActionLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectActionSoftButton: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectActionSoftButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectActionGhostLink: {
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectActionGhostLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsPlanChip: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#f59e0b',
    backgroundColor: '#fffbeb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  needsPlanChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#b45309',
  },
  progressStatusChip: {
    height: 24,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressStatusChipOnTrack: {
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  progressStatusChipAhead: {
    borderColor: '#6ee7b7',
    backgroundColor: '#ecfdf5',
  },
  progressStatusChipBehind: {
    borderColor: '#fdba74',
    backgroundColor: '#fff7ed',
  },
  progressStatusChipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  progressStatusChipTextOnTrack: {
    color: '#1d4ed8',
  },
  progressStatusChipTextAhead: {
    color: '#047857',
  },
  progressStatusChipTextBehind: {
    color: '#c2410c',
  },
  subjectRowActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  actionHoverHint: {
    position: 'absolute',
    top: '100%',
    marginTop: 8,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    zIndex: 20,
    minWidth: 84,
    alignItems: 'center',
  },
  actionHoverHintCentered: {
    left: '50%',
    transform: [{ translateX: -42 }],
  },
  actionHoverHintPlan: {
    right: 0,
    alignItems: 'flex-start',
  },
  actionHoverHintText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'nowrap',
    }),
  },
  subjectRight: {
    width: 190,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  statusPill: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusActive: {
    backgroundColor: '#EAFBF1',
  },
  statusEmpty: {
    backgroundColor: '#F4F6FB',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '900',
  },
  statusTextActive: {
    color: '#23A667',
  },
  statusTextEmpty: {
    color: '#7C8798',
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E3E7F0',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  iconButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#7C8798',
  },
  addMiniButton: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9ED3FF',
    backgroundColor: '#F8FCFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  addMiniButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5AAEF2',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressCard: {
    backgroundColor: '#F8F7FF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E6E2FF',
    marginBottom: 14,
  },
  yearProgressTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  yearProgressTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressStatWrap: {
    alignItems: 'flex-end',
  },
  yearProgressBig: {
    fontSize: 30,
    fontWeight: '900',
    color: '#6D5DF6',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressStatLabel: {
    fontSize: 12,
    color: '#8A95A8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressFooter: {
    marginTop: 10,
    gap: 4,
  },
  yearProgressToday: {
    fontWeight: '700',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  yearProgressNext: {
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentSchedulePlaceholderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    minHeight: 200,
    maxWidth: 1400,
    width: '100%',
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  currentSchedulePlaceholderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentScheduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  termCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  termCardTitleWrap: {
    flex: 1,
    minWidth: 240,
  },
  termHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  termActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 40,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  termActionBtnText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  termPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 40,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#6D5DF6',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  termPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentScheduleHeaderNavShell: {
    width: 306,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    justifyContent: 'space-between',
    gap: 4,
  },
  currentScheduleNavBtn: {
    padding: 4,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  currentScheduleHeaderTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  currentScheduleNavBtnDisabled: {
    opacity: 0.45,
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  currentSchedulePlaceholderTitleCentered: {
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  currentSchedulePlaceholderBody: {
    minHeight: 0,
    justifyContent: 'flex-start',
  },
  scheduleSummaryList: {
    gap: 8,
    paddingVertical: 6,
  },
  scheduleSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.16)',
  },
  scheduleSummaryDay: {
    width: 92,
    flexShrink: 0,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scheduleSummaryText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: SUB,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dayPillsWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  scheduleLessonPill: {
    backgroundColor: '#EDE7FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  scheduleLessonPillText: {
    fontWeight: '700',
    color: '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scheduleEmptyPill: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    minWidth: 32,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  scheduleEmptyPillText: {
    color: '#9CA3AF',
    fontWeight: '700',
    fontSize: 13,
  },
  currentScheduleEmptyStateWrap: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  currentScheduleEmptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: FG,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentScheduleEmptyStateText: {
    fontSize: 13,
    color: SUB,
    textAlign: 'center',
    maxWidth: 900,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentScheduleEmptyStateButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#10b981',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  currentScheduleEmptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPlansList: {
    marginTop: 8,
    gap: 0,
  },
  subjectPlansSectionTitle: {
    marginTop: 10,
  },
  subjectPlansEmptyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  subjectPlansEmptyText: {
    fontSize: 14,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPlansEmptyLink: {
    fontSize: 14,
    color: ACCENT,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  subjectPlansRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.16)',
  },
  subjectPlansTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  subjectPlansName: {
    fontSize: 15,
    fontWeight: '700',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPlansStatus: {
    marginTop: 2,
    fontSize: 12,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPlansStudentsRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  subjectPlansStudents: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '400',
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPlansDetailsLinkButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectPlansDetailsLinkText: {
    fontSize: 13,
    color: ACCENT,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPlansActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  subjectPlansAddPlanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(133, 196, 242, 0.8)',
    borderStyle: 'dashed',
    backgroundColor: '#F4FAFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectPlansAddPlanBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6BB3E8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  subjectPickerModal: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 32,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  applySuggestionConfirmModal: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 32,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  applySuggestionConfirmHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 10,
  },
  applySuggestionConfirmTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  applySuggestionConfirmBodyText: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 21,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  applySuggestionConfirmActions: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  applySuggestionConfirmActionBtn: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9ECFFB',
    backgroundColor: '#9ECFFB',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  applySuggestionConfirmActionBtnDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  applySuggestionConfirmActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  applySuggestionConfirmActionBtnTextDisabled: {
    color: '#94A3B8',
  },
  subjectPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  subjectPickerHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  subjectPickerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectPickerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPickerSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPickerList: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  subjectPickerItem: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  subjectPickerItemLast: {
    borderBottomWidth: 0,
  },
  subjectPickerItemText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPickerItemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  subjectPickerStudentsRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  subjectPickerStudentsText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '400',
    color: '#94A3B8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPickerEmptyWrap: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#ffffff',
  },
  subjectPickerEmptyText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPickerActions: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  subjectPickerCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectPickerCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectPickerNewSubjectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#9ECFFB',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 12px rgba(158, 207, 251, 0.55)',
      cursor: 'pointer',
    }),
  },
  subjectPickerNewSubjectBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  subjectEventsModal: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '84%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  subjectEventsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  subjectEventsHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  subjectEventsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectEventsTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventsSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventsCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectEventsFooter: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  subjectEventsFooterButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  subjectEventsFooterCancelButton: {
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectEventsFooterCancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventsFooterActionButton: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9ECFFB',
    backgroundColor: '#9ECFFB',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectEventsFooterActionButtonDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
    opacity: 0.58,
  },
  subjectEventsFooterActionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventsFooterActionButtonTextDisabled: {
    color: '#94A3B8',
  },
  subjectEventsList: {
    flex: 1,
  },
  subjectEventsListContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  subjectEventsEmptyText: {
    fontSize: 14,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRow: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  subjectEventRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  subjectEventRowMetaRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  subjectEventRowTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '700',
    color: '#172033',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowSource: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F766E',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowDate: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowMeta: {
    marginTop: 3,
    fontSize: 12,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowStatusChips: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  subjectEventRowStatusChipsRight: {
    marginTop: 0,
    justifyContent: 'flex-end',
  },
  subjectEventRowStatusChip: {
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectEventRowStatusChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowStatusChipTextAttended: {
    color: '#475569',
  },
  subjectEventRowStatusChipTextUpcoming: {
    color: '#64748B',
  },
  subjectEventRowStatusChipDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  subjectEventRowStatusChipDotAttended: {
    backgroundColor: '#6BB3E8',
  },
  subjectEventRowStatusChipDotUnattended: {
    backgroundColor: '#F2A0A3',
  },
  subjectEventRowStatusChipDotUpcoming: {
    backgroundColor: '#CFE2FA',
  },
  subjectEventRowStatusChipLegacyText: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowStatusChipUpcoming: {
    backgroundColor: '#F8FAFC',
  },
  subjectEventRowStatusChipAttended: {
    backgroundColor: '#F8FAFC',
  },
  subjectEventRowStatusChipUnattended: {
    backgroundColor: '#F8FAFC',
  },
  subjectEventRowUnit: {
    marginTop: 4,
    fontSize: 12,
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectEventRowActions: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flexWrap: 'wrap',
  },
  subjectEventRowLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendancePlaceholderBody: {
    marginTop: 8,
    minHeight: 112,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    justifyContent: 'space-between',
  },
  attendancePlaceholderText: {
    fontSize: 13,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendancePlaceholderActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  attendancePillBtn: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    borderRadius: 999,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  attendancePillBtnText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: FG,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: SUB,
    textAlign: 'center',
    maxWidth: 620,
    marginBottom: 12,
    alignSelf: 'center',
  },
  previewMockCard: {
    marginTop: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(186, 230, 253, 0.7)',
    borderRadius: 18,
    backgroundColor: 'rgba(236, 253, 255, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 6,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(14,165,233,0.08)',
    }),
  },
  previewMockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  previewMockDayChip: {
    minWidth: 44,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(191, 219, 254, 0.55)',
    alignItems: 'center',
  },
  previewMockDayChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  previewMockTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  previewMockMainText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  previewMockIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nextStepHint: {
    marginTop: 8,
    fontSize: 12,
    color: MUTED,
    textAlign: 'center',
  },
  emptyDivider: {
    marginTop: 14,
    marginBottom: 12,
    height: 1,
    backgroundColor: BORDER_SUBTLE,
  },
  valueCardRow: {
    marginTop: 12,
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  valueCard: {
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 5,
  },
  valueCardIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(186, 230, 253, 0.5)',
  },
  valueCardTitle: {
    fontSize: 13,
    color: FG,
    fontWeight: '700',
  },
  valueCardDescription: {
    fontSize: 11,
    color: SUB,
    lineHeight: 16,
  },
  secondaryInlineLink: {
    marginTop: 2,
    alignSelf: 'center',
    paddingVertical: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  secondaryInlineLinkText: {
    fontSize: 13,
    color: '#0ea5e9',
    fontWeight: '600',
  },
  emotionalHint: {
    marginTop: 8,
    textAlign: 'center',
    color: '#64748B',
    fontSize: 12,
  },
  infoCard: {
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 14,
  },
  infoCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
  },
  stepSection: { marginBottom: 24 },
  stepSectionLast: { marginBottom: 0 },
  stepTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: FG,
    ...(Platform.OS === 'web' && { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  stepContent: { marginTop: 12, gap: 12 },
  row: { flexDirection: 'row', gap: 16 },
  halfField: { flex: 1, position: 'relative', minWidth: 0, zIndex: 4 },
  planningModeHeaderTrigger: {
    minHeight: 40,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  planningModeHeaderTriggerText: {
    fontSize: 13,
    color: FG,
    flexShrink: 1,
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  dropdownOptions: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 44,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
    zIndex: 20,
  },
  dropdownOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  dropdownOptionActive: { backgroundColor: CHIP_SELECTED_BG },
  dropdownOptionText: { fontSize: 13, color: FG, fontWeight: '500' },
  dropdownOptionTextActive: { color: ACCENT, fontWeight: '700' },
  planningModeToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkboxRow: { marginTop: 4 },
  planningModeCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planningModeCheckboxActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT,
  },
  planningModeToggleText: {
    fontSize: 13,
    color: FG,
    fontWeight: '600',
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  planningModeSecondaryCtaText: {
    fontSize: 12,
    color: ACCENT,
    fontWeight: '600',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  blockRow: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingBottom: 12,
    marginBottom: 12,
  },
  blockRowNoDivider: {
    borderBottomWidth: 0,
    marginBottom: 0,
    paddingBottom: 4,
  },
  blockRowSubject: {
    fontSize: 12,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  blockRowLine: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 12,
  },
  dayChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  weekdayChipSmall: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  weekdayChipSmallActive: {
    borderColor: CHIP_SELECTED_BORDER,
    backgroundColor: CHIP_SELECTED_BG,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  weekdayChipSmallText: {
    fontSize: 12,
    color: SUB,
    fontWeight: '500',
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  weekdayChipSmallTextActive: {
    color: CHIP_SELECTED_TEXT,
    fontWeight: '700',
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  timeRow: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 0,
  },
  timeFieldGroup: {
    gap: 6,
  },
  timeField: {
    width: 160,
  },
  blockTimeLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 4,
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: FG,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  step3SubjectCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E3EAF3',
    borderRadius: 18,
    padding: 16,
  },
  step3SubjectTitle: {
    fontSize: 14,
    color: FG,
    fontWeight: '700',
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  subjectActions: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  step3ActionPill: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  step3ActionPillActive: {
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  step3ActionPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  step3ActionPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: SUB,
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  step3ActionPillTextActive: {
    color: ACCENT,
    fontWeight: '600',
    ...(Platform.OS === 'web' && { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }),
  },
  summaryBox: {
    gap: 10,
  },
  previewSummaryCard: {
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 4,
    gap: 4,
  },
  previewSummaryPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
  },
  previewSummarySecondary: {
    fontSize: 12,
    color: MUTED,
  },
  previewExpandToggle: {
    marginTop: 0,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  previewExpandToggleText: {
    fontSize: 12,
    color: ACCENT,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  previewStepPlaceholderCard: {
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  previewStepPlaceholderText: {
    fontSize: 12,
    color: MUTED,
    lineHeight: 18,
  },
  previewAttendanceCalendarCard: {
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: 10,
  },
  previewAttendanceListRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  previewAttendanceListPrimary: {
    fontSize: 12,
    color: FG,
    lineHeight: 18,
  },
  previewAttendanceListMeta: {
    fontSize: 11,
    color: MUTED,
    lineHeight: 16,
    marginTop: 2,
  },
  previewAttendanceListDateInline: {
    fontWeight: '700',
    color: FG,
  },
  footer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelBtn: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  cancelText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#10b981',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
