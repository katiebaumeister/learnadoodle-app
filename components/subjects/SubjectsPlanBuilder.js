import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Check, ChevronDown, ChevronRight, ChevronUp, Pencil, Plus, Sparkles, Upload, X } from 'lucide-react';
import { applyToCalendar, getAcademicYear, getPlanHealth } from '../../lib/services/academicYearClient';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';

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
const OVERVIEW_CACHE_TTL_MS = 2 * 60 * 1000;
const overviewCacheByFamily = new Map();
const overviewInflightByFamily = new Map();
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

function normalizeFamilyKey(familyId) {
  return String(familyId || '').trim();
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
      const targets = plan?.subject_targets_override;
      if (targets && typeof targets === 'object' && !Array.isArray(targets)) {
        Object.keys(targets).forEach((sid) => {
          if (sid != null && String(sid).trim()) subjectIdSet.add(String(sid));
        });
      }
      const subjectIds = [...subjectIdSet];
      return {
        row,
        startYear: resolveScheduleStartYear(row, scopeId),
        scopeId,
        subjectIds,
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
      const targets = plan?.subject_targets_override;
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

export default function SubjectsPlanBuilder({
  familyId,
  planningMode = null,
  selectedYearFilter = 'all',
  selectedTermFilter = 'all',
  children = [],
  visibleSubjects = [],
  allSubjects = [],
  onDone,
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
  const [buildWithDefaults, setBuildWithDefaults] = useState(true);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showTermDropdown, setShowTermDropdown] = useState(false);
  const [showFullSchedulePreview, setShowFullSchedulePreview] = useState(false);
  const [showSubjectPickerModal, setShowSubjectPickerModal] = useState(false);
  const [subjectPickerAction, setSubjectPickerAction] = useState('add'); // add | edit
  const [saving, setSaving] = useState(false);
  const [blocksBySubject, setBlocksBySubject] = useState({});

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
  const displaySchoolYear = useMemo(() => {
    if (selectedYearFilter !== 'all') {
      return schoolYearOptions.find((opt) => String(opt?.label || '').trim() === String(selectedYearFilter).trim()) || selectedSchoolYear;
    }
    return selectedSchoolYear;
  }, [schoolYearOptions, selectedSchoolYear, selectedYearFilter]);
  const displayTerm = useMemo(() => {
    if (selectedTermFilter === 'fall_term' || selectedTermFilter === 'spring_term' || selectedTermFilter === 'full_year') {
      return selectedTermFilter;
    }
    return selectedTerm;
  }, [selectedTermFilter, selectedTerm]);
  const displayTermOption = useMemo(() => TERM_OPTIONS.find((x) => x.id === displayTerm) || TERM_OPTIONS[0], [displayTerm]);
  const hasPinnedFilters = selectedYearFilter !== 'all' || selectedTermFilter !== 'all';
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

  const currentSchedule = useMemo(() => {
    if (!viewedScheduleCore) return null;
    const subjectNames = (viewedScheduleCore.subjectIds || [])
      .map((sid) => allSubjectPool.find((s) => String(s?.id) === String(sid))?.name)
      .filter(Boolean);
    return {
      ...viewedScheduleCore,
      subjectNames,
    };
  }, [viewedScheduleCore, allSubjectPool]);

  const currentScheduleHeading = useMemo(() => {
    const fallbackYear = String(displaySchoolYear?.label || '').trim();
    const fallbackTerm = formatScheduleScopeLabel(displayTerm);
    if (fallbackYear && fallbackTerm) return `${fallbackYear} ${fallbackTerm}`;
    return fallbackYear || fallbackTerm || 'Current Schedule';
  }, [displaySchoolYear?.label, displayTerm]);

  const activeScheduleDayRows = useMemo(() => {
    const blocks = Array.isArray(currentSchedule?.blocksLite) ? currentSchedule.blocksLite : [];
    return WEEKDAY_NUMBERS.map((dayNum) => {
      const dayEntries = blocks
        .filter((block) => Array.isArray(block.weekdays) && block.weekdays.includes(dayNum))
        .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')))
        .flatMap((block) => {
          const ids = Array.isArray(block.subject_ids) ? block.subject_ids : [];
          if (ids.length === 0) return [];
          return ids.map((sid) => {
            const subjectName = allSubjectPool.find((s) => String(s?.id) === String(sid))?.name || 'Subject';
            return { subjectName, startTime: block.start_time || '09:00' };
          });
        });
      const summaryText = dayEntries.length > 0
        ? dayEntries.map((entry) => `${entry.subjectName} at ${toAmPm(entry.startTime)}`).join(', ')
        : 'No lessons scheduled.';
      return {
        key: `day-${dayNum}`,
        dayLabel: WEEKDAY_FULL_LABELS[dayNum] || WEEKDAY_LABELS[dayNum] || `Day ${dayNum}`,
        dayEntries,
        summaryText,
      };
    });
  }, [currentSchedule, allSubjectPool]);

  const homeTermOrder = useMemo(() => ['fall_term', 'spring_term'], []);
  const selectedSchoolYearIndex = useMemo(
    () => schoolYearOptions.findIndex((opt) => String(opt?.id) === String(displaySchoolYear?.id || selectedSchoolYearId || '')),
    [schoolYearOptions, displaySchoolYear?.id, selectedSchoolYearId]
  );
  const selectedTermIndex = useMemo(
    () => homeTermOrder.indexOf(String(displayTerm || '').trim()),
    [homeTermOrder, displayTerm]
  );
  const canNavigatePrevTerm = selectedSchoolYearIndex > 0 || selectedTermIndex > 0;
  const canNavigateNextTerm = (
    (selectedSchoolYearIndex >= 0 && selectedSchoolYearIndex < schoolYearOptions.length - 1)
    || (selectedTermIndex >= 0 && selectedTermIndex < homeTermOrder.length - 1)
  );
  const shiftCurrentScheduleTerm = (direction) => {
    if (!Array.isArray(schoolYearOptions) || schoolYearOptions.length === 0) return;
    let yearIdx = selectedSchoolYearIndex >= 0 ? selectedSchoolYearIndex : 0;
    let termIdx = selectedTermIndex >= 0 ? selectedTermIndex : 0;
    if (direction < 0) {
      if (termIdx > 0) {
        termIdx -= 1;
      } else if (yearIdx > 0) {
        yearIdx -= 1;
        termIdx = homeTermOrder.length - 1;
      } else {
        return;
      }
    } else if (direction > 0) {
      if (termIdx < homeTermOrder.length - 1) {
        termIdx += 1;
      } else if (yearIdx < schoolYearOptions.length - 1) {
        yearIdx += 1;
        termIdx = 0;
      } else {
        return;
      }
    } else {
      return;
    }
    setSelectedSchoolYearId(schoolYearOptions[yearIdx]?.id || null);
    setSelectedTerm(homeTermOrder[termIdx] || 'fall_term');
  };

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
        attachedStudentIds: effectiveAttachedIds,
        attachedStudentsLabel: attachedStudentNames.join(', '),
      };
    });
  }, [homeSlotScopedSubjects, displaySchoolYear?.start_year, displayTerm, planSubjectIdsBySlot, planSubjectNamesBySlot, viewedScheduleCore, childNameById, allChildIds]);

  const yearStats = useMemo(() => {
    const targetDays = 180;
    if (!displaySchoolYear) {
      return {
        targetDays,
        completedDays: 0,
        plannedDays: 0,
        remaining: targetDays,
        todayIsClassDay: false,
      };
    }
    const schoolYearRange = formatYmdFromTemplateYear(displaySchoolYear.start_year, displaySchoolYear.end_year, 'full_year');
    const scheduleBlocks = Array.isArray(currentSchedule?.blocksLite) ? currentSchedule.blocksLite : [];
    const daySet = new Set(
      scheduleBlocks.flatMap((block) => (
        Array.isArray(block?.weekdays)
          ? block.weekdays.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
          : []
      ))
    );
    const scheduledWeekdays = [...daySet];
    const plannedDays = schoolYearRange
      ? countOccurrencesInRange(schoolYearRange.start_date, schoolYearRange.end_date, scheduledWeekdays)
      : 0;
    const now = new Date();
    const todayYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const cappedToday = schoolYearRange ? (todayYmd > schoolYearRange.end_date ? schoolYearRange.end_date : todayYmd) : todayYmd;
    const completedDays = schoolYearRange
      ? countOccurrencesInRange(schoolYearRange.start_date, cappedToday, scheduledWeekdays)
      : 0;
    const inRangeToday = schoolYearRange ? (todayYmd >= schoolYearRange.start_date && todayYmd <= schoolYearRange.end_date) : false;
    return {
      targetDays,
      completedDays,
      plannedDays,
      remaining: Math.max(targetDays - completedDays, 0),
      todayIsClassDay: inRangeToday && scheduledWeekdays.includes(now.getDay()),
    };
  }, [displaySchoolYear, currentSchedule]);

  const nextScheduledLabel = useMemo(() => {
    const rows = activeScheduleDayRows || [];
    if (rows.length === 0) return 'Next: no lessons scheduled';
    const today = new Date().getDay();
    for (let offset = 0; offset < 7; offset += 1) {
      const idx = (today + offset) % 7;
      const row = rows[idx];
      const firstEntry = row?.dayEntries?.[0];
      if (firstEntry) {
        return `Next: ${firstEntry.subjectName} · ${toAmPm(firstEntry.startTime)}`;
      }
    }
    return 'Next: no lessons scheduled';
  }, [activeScheduleDayRows]);

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

  const openBuilderForSubject = (subjectId, action = 'edit') => {
    const safeId = String(subjectId || '');
    if (!safeId) return;
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

  const openAddSubjectForCurrentSlot = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('openAddSubjectModal', {
        detail: {
          schoolYear: displaySchoolYear?.label || null,
          schoolTerm: displayTerm || null,
        },
      })
    );
  }, [displaySchoolYear?.label, displayTerm]);

  if (surfaceMode === 'home') {
    return (
      <View style={styles.wrap}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {isHomeschoolMode ? (
            <View style={styles.yearCard}>
              <View>
                <Text style={yearStyles.title}>{displaySchoolYear?.label || 'Academic Year'}</Text>
                <Text style={yearStyles.meta}>
                  {yearStats.completedDays} completed · {yearStats.remaining} remaining
                </Text>
                <Text style={yearStyles.status}>
                  {yearStats.todayIsClassDay ? 'Today: Class day' : 'Today: No class'}
                </Text>
                <Text style={yearStyles.next}>{nextScheduledLabel}</Text>
              </View>

              <View style={yearStyles.right}>
                <Text style={yearStyles.big}>
                  {yearStats.plannedDays} / {yearStats.targetDays}
                </Text>
                <Text style={yearStyles.label}>planned class days</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.emptyScheduleSection}>
            <View style={styles.termCard}>
              <View style={styles.termHeader}>
                <View style={styles.termHeaderLeft}>
                  <View style={styles.termTitleRow}>
                    <TouchableOpacity
                      style={[styles.arrowButton, !canNavigatePrevTerm && styles.arrowButtonDisabled]}
                      onPress={() => shiftCurrentScheduleTerm(-1)}
                      disabled={!canNavigatePrevTerm}
                      accessibilityRole="button"
                      accessibilityLabel="Previous term"
                    >
                      <Text style={styles.arrowText}>‹</Text>
                    </TouchableOpacity>

                    <Text style={styles.termTitle} numberOfLines={1}>
                      {hasPinnedFilters
                        ? `${displaySchoolYear?.label || ''} ${displayTermOption.label}`.trim()
                        : currentScheduleHeading}
                    </Text>

                    <TouchableOpacity
                      style={[styles.arrowButton, !canNavigateNextTerm && styles.arrowButtonDisabled]}
                      onPress={() => shiftCurrentScheduleTerm(1)}
                      disabled={!canNavigateNextTerm}
                      accessibilityRole="button"
                      accessibilityLabel="Next term"
                    >
                      <Text style={styles.arrowText}>›</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.termSubtext}>
                    Whole family · Current saved planning rules
                  </Text>
                </View>

                <View style={styles.termActions}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => openSubjectPicker('edit')}>
                    <Text style={styles.secondaryButtonText}>Edit plan</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.primaryButton} onPress={() => openSubjectPicker('add')}>
                    <Text style={styles.primaryButtonText}>+ Add plan</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.weekGrid}>
                {activeScheduleDayRows.map((row) => {
                  const lessons = (row.dayEntries || []).map((entry, idx) => ({
                    key: `${row.key}-${entry.subjectName}-${entry.startTime}-${idx}`,
                    title: entry.subjectName,
                    time: toAmPm(entry.startTime),
                  }));
                  return (
                    <View key={row.key} style={styles.dayColumn}>
                      <Text style={styles.dayLabel}>{row.dayLabel}</Text>

                      <View style={styles.dayBody}>
                        {lessons.length > 0 ? (
                          lessons.map((lesson) => (
                            <TouchableOpacity key={lesson.key} style={styles.lessonChip} activeOpacity={0.8}>
                              <Text style={styles.lessonTitle}>{lesson.title}</Text>
                              <Text style={styles.lessonTime}>{lesson.time}</Text>
                            </TouchableOpacity>
                          ))
                        ) : (
                          <TouchableOpacity
                            style={styles.addSlotButton}
                            onPress={() => openSubjectPicker('add')}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.addSlotText}>+</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>

              <View style={styles.sectionDivider} />

              <View style={styles.subjectSection}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>Subject plans</Text>
                  <Text style={styles.sectionHint}>What gets placed into the weekly cadence</Text>
                </View>

                <View style={styles.subjectRows}>
                  {subjectPlans.length === 0 ? (
                    <View style={styles.subjectRow}>
                      <View style={styles.subjectCadence}>
                        <Text style={styles.subjectCadenceText}>No subjects for this term yet.</Text>
                      </View>
                      <TouchableOpacity style={styles.addMiniButton} onPress={openAddSubjectForCurrentSlot}>
                        <Text style={styles.addMiniButtonText}>+ Add</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    subjectPlans.map((row, index) => {
                      const status = row.hasPlan ? 'Active' : 'Needs plan';
                      return (
                        <View
                          key={`plan-${row.id}`}
                          style={[
                            styles.subjectRow,
                            index === subjectPlans.length - 1 && styles.subjectRowLast,
                          ]}
                        >
                          <View style={styles.subjectMain}>
                            <Text style={styles.subjectName}>{row.name}</Text>
                            <Text style={styles.subjectMeta}>
                              {row.attachedStudentsLabel || 'Whole family'}
                            </Text>
                          </View>

                          <View style={styles.subjectCadence}>
                            <Text style={styles.subjectCadenceText}>
                              {row.cadenceText || 'No plan yet'}
                            </Text>
                          </View>

                          <View style={styles.subjectRight}>
                            <View
                              style={[
                                styles.statusPill,
                                row.hasPlan ? styles.statusActive : styles.statusEmpty,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.statusText,
                                  row.hasPlan ? styles.statusTextActive : styles.statusTextEmpty,
                                ]}
                              >
                                {status}
                              </Text>
                            </View>

                            {row.hasPlan ? (
                              <TouchableOpacity
                                style={styles.iconButton}
                                onPress={() => openBuilderForSubject(row.id, 'edit')}
                              >
                                <Text style={styles.iconButtonText}>•••</Text>
                              </TouchableOpacity>
                            ) : (
                              <TouchableOpacity
                                style={styles.addMiniButton}
                                onPress={() => openBuilderForSubject(row.id, 'add')}
                              >
                                <Text style={styles.addMiniButtonText}>+ Add</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
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
                    {subjectPickerAction === 'edit' ? 'Choose a subject to edit' : 'Choose a subject for new plan'}
                  </Text>
                  <Text style={styles.subjectPickerSubtitle}>
                    {subjectPickerAction === 'edit'
                      ? 'Select a subject with an existing plan.'
                      : 'Select the subject you want to plan.'}
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

const yearStyles = StyleSheet.create({
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#172033',
  },
  meta: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: '#8A94A6',
  },
  status: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '900',
    color: '#172033',
  },
  next: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#7C8798',
  },
  right: {
    alignItems: 'flex-end',
  },
  big: {
    fontSize: 30,
    fontWeight: '900',
    color: '#7C5CFF',
  },
  label: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A94A6',
  },
});

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
  },
  yearCard: {
    minHeight: 96,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E4DAFF',
    backgroundColor: '#F5F1FF',
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  termCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#EAEDF5',
    padding: 18,
    gap: 18,
    maxWidth: 1400,
    width: '100%',
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
  arrowButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  arrowButtonDisabled: {
    opacity: 0.45,
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  arrowText: {
    fontSize: 24,
    color: '#9AA3B2',
    fontWeight: '700',
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
    gap: 10,
  },
  secondaryButton: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E6EF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#445066',
  },
  primaryButton: {
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#7C5CFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
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
    backgroundColor: '#EEE7FF',
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#D7CAFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  lessonTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6D4DFF',
  },
  lessonTime: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A78E8',
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
  sectionDivider: {
    height: 1,
    backgroundColor: '#EEF0F6',
  },
  subjectSection: {
    gap: 12,
  },
  sectionHeaderRow: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#172033',
  },
  sectionHint: {
    fontSize: 13,
    color: '#8A94A6',
    fontWeight: '600',
  },
  subjectRows: {
    borderWidth: 1,
    borderColor: '#EEF0F6',
    borderRadius: 18,
    overflow: 'hidden',
  },
  subjectRow: {
    minHeight: 68,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F2F7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  subjectRowLast: {
    borderBottomWidth: 0,
  },
  subjectMain: {
    width: 150,
  },
  subjectName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#172033',
  },
  subjectMeta: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: '#9AA3B2',
  },
  subjectCadence: {
    flex: 1,
  },
  subjectCadenceText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#667085',
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
    fontSize: 12,
    fontWeight: '900',
    color: '#5AAEF2',
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
