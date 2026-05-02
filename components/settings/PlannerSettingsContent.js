/**
 * Planning Preferences - Family default targets, public holidays, custom days, and ranges.
 * Not tied to any plan. These defaults are used when creating/editing a plan year.
 * Flat layout: static sections, no accordions, Profile-style rhythm.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { Plus, Trash2, Pencil, Check, X, ChevronDown, ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import {
  getFamilyPlannerSettings,
  saveFamilyPlannerSettings,
  getPlanDefaultsFromSettings,
  syncFamilyHolidayBreakExclusions,
  deleteExclusion,
  saveExcludedPublicHolidayDates,
} from '../../lib/services/plannerSettingsClient';
import { getPublicHolidaysForRange } from '../../lib/services/academicYearClient';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Toast';
import { PLANNING_PREFERENCES_UI } from '../planner/planningPreferencesUiCopy';
import { PlannerPreferenceDateField } from '../ui/AppCalendarDatePickerModal';
import { LEARNADOODLE_LIGHT_BLUE } from '../../theme/comingSoonModalTheme';
import { designTokens } from '../../theme/designTokens';

const MUTED = 'rgba(15,23,42,0.6)';
/** Body copy on this screen — solid black per design */
const TEXT_BLACK = '#000000';
/** Brand pastel blue (FAB, coming-soon CTAs) — borders, fills, toggles on this page */
const ACCENT = LEARNADOODLE_LIGHT_BLUE;
const BORDER = '#E2E8F0';
/** Selected chips — light blue border/text + soft blue fill */
const CHIP_SELECTED_BORDER = '#6BB3E8';
const CHIP_SELECTED_BG = 'rgba(107, 179, 232, 0.12)';
const plannerSettingsSnapshotCache = new Map();

const parsePositiveIntOrNull = (value) => {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parsePositiveFloatOrNull = (value) => {
  const n = parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

const DEFAULT_LEARNING_START_TIME = '08:00:00';
const DEFAULT_LEARNING_END_TIME = '15:00:00';

const minutesToSqlTime = (totalMinutes) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Number(totalMinutes) || 0));
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
};

const minutesToDisplayTime = (totalMinutes) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Number(totalMinutes) || 0));
  const hours24 = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = (hours24 % 12) || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const parseTimeToMinutesOrNull = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, '');
  const ampmMatch = normalized.match(/^(\d{1,2})(?::(\d{1,2}))?(am|pm)$/);
  if (ampmMatch) {
    const hourRaw = Number(ampmMatch[1]);
    const minuteRaw = ampmMatch[2] != null ? Number(ampmMatch[2]) : 0;
    if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw) || hourRaw < 1 || hourRaw > 12 || minuteRaw < 0 || minuteRaw > 59) {
      return null;
    }
    const hour24 = (hourRaw % 12) + (ampmMatch[3] === 'pm' ? 12 : 0);
    return (hour24 * 60) + minuteRaw;
  }
  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (hhmmMatch) {
    const hourRaw = Number(hhmmMatch[1]);
    const minuteRaw = Number(hhmmMatch[2]);
    if (!Number.isFinite(hourRaw) || !Number.isFinite(minuteRaw) || hourRaw < 0 || hourRaw > 23 || minuteRaw < 0 || minuteRaw > 59) {
      return null;
    }
    return (hourRaw * 60) + minuteRaw;
  }
  const hourOnly = Number(normalized);
  if (!Number.isFinite(hourOnly) || hourOnly < 0 || hourOnly > 23) return null;
  return hourOnly * 60;
};

const normalizeLearningTimeDisplay = (value, fallbackSqlTime) => {
  const fallbackMinutes = parseTimeToMinutesOrNull(fallbackSqlTime);
  const minutes = parseTimeToMinutesOrNull(value);
  const effective = minutes != null ? minutes : (fallbackMinutes != null ? fallbackMinutes : 0);
  return minutesToDisplayTime(effective);
};

const normalizeLearningTimeSql = (value, fallbackSqlTime) => {
  const fallbackMinutes = parseTimeToMinutesOrNull(fallbackSqlTime);
  const minutes = parseTimeToMinutesOrNull(value);
  const effective = minutes != null ? minutes : (fallbackMinutes != null ? fallbackMinutes : 0);
  return minutesToSqlTime(effective);
};

const normalizeTargetMode = (mode) => (typeof mode === 'string' ? mode.toLowerCase() : '');
const formatSchoolYearLabel = (startYear) => `${startYear}/${String(startYear + 1).slice(-2)}`;
const normalizeSchoolYearLabel = (label) => {
  const raw = String(label || '').trim();
  if (!raw) return '';
  const slashMatch = raw.match(/(\d{4})\s*\/\s*(\d{2})/);
  if (slashMatch) return `${slashMatch[1]}/${slashMatch[2]}`;
  const dashMatch = raw.match(/(\d{4})\s*-\s*(\d{4})/);
  if (dashMatch) {
    const start = Number(dashMatch[1]);
    return Number.isFinite(start) ? formatSchoolYearLabel(start) : '';
  }
  return raw;
};

const parseSchoolYearLabel = (label) => {
  const normalized = normalizeSchoolYearLabel(label);
  const m = normalized.match(/^(\d{4})\/(\d{2})$/);
  if (!m) return null;
  const start = Number(m[1]);
  const end = 2000 + Number(m[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { start, end };
};

const withinYmdRange = (ymd, minYmd, maxYmd) => {
  const v = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return (!minYmd || v >= minYmd) && (!maxYmd || v <= maxYmd);
};

const normalizeYmd = (value) => {
  const v = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
};

const schoolYearRangeDefaults = (schoolYearLabel) => {
  const parsed = parseSchoolYearLabel(schoolYearLabel);
  if (!parsed) {
    return {
      yearStart: '',
      yearEnd: '',
      fallStart: '',
      fallEnd: '',
      springStart: '',
      springEnd: '',
    };
  }
  return {
    yearStart: `${parsed.start}-08-01`,
    yearEnd: `${parsed.end}-05-31`,
    fallStart: `${parsed.start}-08-01`,
    fallEnd: `${parsed.start}-12-31`,
    springStart: `${parsed.end}-01-01`,
    springEnd: `${parsed.end}-05-01`,
  };
};

const deriveSubjectTargetState = (subjectsList) => {
  const st = {};
  let firstActiveTarget = null;
  (subjectsList || []).forEach((subj) => {
    const modeRaw = normalizeTargetMode(subj.default_constraint_mode);
    const daysNum = parsePositiveIntOrNull(subj.default_target_days);
    const hoursNum = parsePositiveFloatOrNull(subj.default_target_hours);
    let mode = 'none';
    let days = '';
    let hours = '';

    if (modeRaw === 'days' && daysNum != null) {
      mode = 'days';
      days = String(daysNum);
    } else if (modeRaw === 'hours' && hoursNum != null) {
      mode = 'hours';
      hours = String(hoursNum);
    }

    if (!firstActiveTarget && (mode === 'days' || mode === 'hours')) {
      firstActiveTarget = { mode, days, hours };
    }

    st[subj.id] = { mode, days, hours };
  });
  return { subjectTargetsMap: st, firstActiveTarget };
};

export default function PlannerSettingsContent({
  familyId,
  onSave,
  onRequestClose,
  initialData,
  readOnly = false,
  embeddedInModal = false,
  lockedSchoolYearLabel = null,
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(!initialData && !embeddedInModal);
  const [saving, setSaving] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [error, setError] = useState(null);
  const saveTimeoutRef = useRef(null);
  const subjectTargetSaveTimeoutRef = useRef(null);
  const stateRef = useRef({});

  // Target scope: overall (one target) vs per_subject
  const [targetScope, setTargetScope] = useState('overall');

  // Learning goals (overall mode only)
  const [goalMode, setGoalMode] = useState('none');
  const [targetDays, setTargetDays] = useState('180');
  const [targetHours, setTargetHours] = useState('1000');
  const [learningStartTime, setLearningStartTime] = useState('8:00 AM');
  const [learningEndTime, setLearningEndTime] = useState('3:00 PM');

  // Public holidays
  const [followGlobalHolidays, setFollowGlobalHolidays] = useState(true);
  const [excludedPublicHolidayDates, setExcludedPublicHolidayDates] = useState([]);
  const [showPublicHolidaysPicker, setShowPublicHolidaysPicker] = useState(false);
  const [publicHolidaysList, setPublicHolidaysList] = useState([]);
  const [publicHolidaysLoading, setPublicHolidaysLoading] = useState(false);
  const countryCode = 'US';
  const regionCode = null;

  // Custom days & ranges (stored as holiday / break exclusions in API)
  const [customHolidays, setCustomHolidays] = useState([]);
  const [customBreaks, setCustomBreaks] = useState([]);
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [addingBreak, setAddingBreak] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newBreakStart, setNewBreakStart] = useState('');
  const [newBreakEnd, setNewBreakEnd] = useState('');
  const [newBreakName, setNewBreakName] = useState('');
  const [editingHolidayIndex, setEditingHolidayIndex] = useState(null);
  const [editingHolidayDraft, setEditingHolidayDraft] = useState({ date: '', name: '' });
  const [editingBreakIndex, setEditingBreakIndex] = useState(null);
  const [editingBreakDraft, setEditingBreakDraft] = useState({ start: '', end: '', name: '' });
  const [defaultYearStartDate, setDefaultYearStartDate] = useState('');
  const [defaultYearEndDate, setDefaultYearEndDate] = useState('');
  const [defaultFallStartDate, setDefaultFallStartDate] = useState('');
  const [defaultFallEndDate, setDefaultFallEndDate] = useState('');
  const [defaultSpringStartDate, setDefaultSpringStartDate] = useState('');
  const [defaultSpringEndDate, setDefaultSpringEndDate] = useState('');

  // Subject targets (per-subject defaults)
  const [subjects, setSubjects] = useState([]);
  const [subjectTargets, setSubjectTargets] = useState({}); // { subjectId: { mode, days, hours } }
  const [schoolYearOptions, setSchoolYearOptions] = useState([]);
  const [selectedSchoolYearLabel, setSelectedSchoolYearLabel] = useState('');
  const [showSchoolYearDropdown, setShowSchoolYearDropdown] = useState(false);
  const [schoolYearMenuAnchor, setSchoolYearMenuAnchor] = useState(null);
  const schoolYearTriggerRef = useRef(null);
  const normalizedLockedSchoolYearLabel = useMemo(
    () => normalizeSchoolYearLabel(String(lockedSchoolYearLabel || '').trim()),
    [lockedSchoolYearLabel]
  );
  const isSchoolYearLocked = Boolean(normalizedLockedSchoolYearLabel);
  const snapshotCacheKey = useMemo(() => {
    const yearLabel = normalizeSchoolYearLabel(
      isSchoolYearLocked ? normalizedLockedSchoolYearLabel : selectedSchoolYearLabel
    ) || 'current';
    return `${String(familyId || 'unknown')}::${yearLabel}`;
  }, [familyId, isSchoolYearLocked, normalizedLockedSchoolYearLabel, selectedSchoolYearLabel]);

  useEffect(() => {
    if (!isSchoolYearLocked) return;
    if (selectedSchoolYearLabel !== normalizedLockedSchoolYearLabel) {
      setSelectedSchoolYearLabel(normalizedLockedSchoolYearLabel);
    }
    if (showSchoolYearDropdown) setShowSchoolYearDropdown(false);
  }, [isSchoolYearLocked, normalizedLockedSchoolYearLabel, selectedSchoolYearLabel, showSchoolYearDropdown]);

  useEffect(() => {
    if (!embeddedInModal) return;
    const cached = plannerSettingsSnapshotCache.get(snapshotCacheKey);
    if (!cached) return;
    setTargetScope(cached.targetScope || 'overall');
    setGoalMode(cached.goalMode || 'none');
    setTargetDays(cached.targetDays ?? '180');
    setTargetHours(cached.targetHours ?? '1000');
    setLearningStartTime(normalizeLearningTimeDisplay(cached.learningStartTime, DEFAULT_LEARNING_START_TIME));
    setLearningEndTime(normalizeLearningTimeDisplay(cached.learningEndTime, DEFAULT_LEARNING_END_TIME));
    setFollowGlobalHolidays(cached.followGlobalHolidays !== false);
    setExcludedPublicHolidayDates(Array.isArray(cached.excludedPublicHolidayDates) ? cached.excludedPublicHolidayDates : []);
    setCustomHolidays(Array.isArray(cached.customHolidays) ? cached.customHolidays : []);
    setCustomBreaks(Array.isArray(cached.customBreaks) ? cached.customBreaks : []);
    setDefaultYearStartDate(cached.defaultYearStartDate || '');
    setDefaultYearEndDate(cached.defaultYearEndDate || '');
    setDefaultFallStartDate(cached.defaultFallStartDate || '');
    setDefaultFallEndDate(cached.defaultFallEndDate || '');
    setDefaultSpringStartDate(cached.defaultSpringStartDate || '');
    setDefaultSpringEndDate(cached.defaultSpringEndDate || '');
    setSubjects(Array.isArray(cached.subjects) ? cached.subjects : []);
    setSubjectTargets(cached.subjectTargets && typeof cached.subjectTargets === 'object' ? cached.subjectTargets : {});
    if (!isSchoolYearLocked && cached.selectedSchoolYearLabel) {
      setSelectedSchoolYearLabel(normalizeSchoolYearLabel(cached.selectedSchoolYearLabel));
    }
    setLoading(false);
  }, [embeddedInModal, snapshotCacheKey, isSchoolYearLocked]);

  useEffect(() => {
    stateRef.current = {
      targetScope,
      goalMode,
      targetDays,
      targetHours,
      learningStartTime,
      learningEndTime,
      followGlobalHolidays,
      countryCode,
      regionCode,
      customHolidays,
      customBreaks,
      subjectTargets,
      defaultYearStartDate,
      defaultYearEndDate,
      defaultFallStartDate,
      defaultFallEndDate,
      defaultSpringStartDate,
      defaultSpringEndDate,
    };
  });

  useEffect(() => {
    if (!embeddedInModal) return;
    plannerSettingsSnapshotCache.set(snapshotCacheKey, {
      targetScope,
      goalMode,
      targetDays,
      targetHours,
      learningStartTime,
      learningEndTime,
      followGlobalHolidays,
      excludedPublicHolidayDates: Array.isArray(excludedPublicHolidayDates) ? [...excludedPublicHolidayDates] : [],
      customHolidays: Array.isArray(customHolidays) ? [...customHolidays] : [],
      customBreaks: Array.isArray(customBreaks) ? [...customBreaks] : [],
      defaultYearStartDate,
      defaultYearEndDate,
      defaultFallStartDate,
      defaultFallEndDate,
      defaultSpringStartDate,
      defaultSpringEndDate,
      subjects: Array.isArray(subjects) ? [...subjects] : [],
      subjectTargets: subjectTargets && typeof subjectTargets === 'object' ? { ...subjectTargets } : {},
      selectedSchoolYearLabel,
    });
  }, [
    embeddedInModal,
    snapshotCacheKey,
    targetScope,
    goalMode,
    targetDays,
    targetHours,
    learningStartTime,
    learningEndTime,
    followGlobalHolidays,
    excludedPublicHolidayDates,
    customHolidays,
    customBreaks,
    defaultYearStartDate,
    defaultYearEndDate,
    defaultFallStartDate,
    defaultFallEndDate,
    defaultSpringStartDate,
    defaultSpringEndDate,
    subjects,
    subjectTargets,
    selectedSchoolYearLabel,
  ]);

  const selectedYearMeta = useMemo(() => {
    const parsed = parseSchoolYearLabel(selectedSchoolYearLabel);
    if (parsed) return parsed;
    const now = new Date();
    const start = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return { start, end: start + 1 };
  }, [selectedSchoolYearLabel]);
  const currentSchoolYearLabel = useMemo(() => {
    const now = new Date();
    const start = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return formatSchoolYearLabel(start);
  }, []);
  const yearRangeMinYmd = `${selectedYearMeta.start}-01-01`;
  const yearRangeMaxYmd = `${selectedYearMeta.end}-12-31`;

  useEffect(() => {
    const seeded = schoolYearRangeDefaults(selectedSchoolYearLabel);
    setDefaultYearStartDate((prev) => prev || seeded.yearStart);
    setDefaultYearEndDate((prev) => prev || seeded.yearEnd);
    setDefaultFallStartDate((prev) => prev || seeded.fallStart);
    setDefaultFallEndDate((prev) => prev || seeded.fallEnd);
    setDefaultSpringStartDate((prev) => prev || seeded.springStart);
    setDefaultSpringEndDate((prev) => prev || seeded.springEnd);
  }, [selectedSchoolYearLabel]);

  const visibleSubjects = useMemo(
    () => {
      const selected = normalizeSchoolYearLabel(selectedSchoolYearLabel);
      return (subjects || []).filter((subj) => {
        const subjectYear = normalizeSchoolYearLabel(subj?.school_year);
        if (subjectYear) return subjectYear === selected;
        // Legacy subjects may not have school_year persisted; show them in current year.
        return selected === currentSchoolYearLabel;
      });
    },
    [subjects, selectedSchoolYearLabel, currentSchoolYearLabel]
  );

  const visibleCustomHolidays = useMemo(
    () => (customHolidays || []).map((h, idx) => ({ ...h, _idx: idx })).filter((h) => withinYmdRange(h.date, yearRangeMinYmd, yearRangeMaxYmd)),
    [customHolidays, yearRangeMinYmd, yearRangeMaxYmd]
  );
  const visibleCustomBreaks = useMemo(
    () =>
      (customBreaks || [])
        .map((b, idx) => ({ ...b, _idx: idx }))
        .filter((b) => {
          const startIn = withinYmdRange(b.start, yearRangeMinYmd, yearRangeMaxYmd);
          const endIn = withinYmdRange(b.end, yearRangeMinYmd, yearRangeMaxYmd);
          const wrapsRange = String(b.start || '') <= yearRangeMinYmd && String(b.end || '') >= yearRangeMaxYmd;
          return startIn || endIn || wrapsRange;
        }),
    [customBreaks, yearRangeMinYmd, yearRangeMaxYmd]
  );

  useEffect(() => {
    if (!familyId || !selectedSchoolYearLabel || readOnly || isSchoolYearLocked) return;
    const normalizedYear = normalizeSchoolYearLabel(selectedSchoolYearLabel);
    saveFamilyPlannerSettings(familyId, { default_school_year: normalizedYear }, normalizedYear).catch(() => {});
  }, [familyId, selectedSchoolYearLabel, readOnly, isSchoolYearLocked]);

  // Apply preloaded data from FamilyPanel when available (avoids loading flash when navigating to Planning Preferences)
  useEffect(() => {
    if (!initialData) return;
    const s = initialData.settings || {};
    const rangeDefaults = schoolYearRangeDefaults(
      isSchoolYearLocked
        ? normalizedLockedSchoolYearLabel
        : (s.default_school_year || selectedSchoolYearLabel)
    );
    setTargetScope(s.target_scope || 'overall');
    setGoalMode(s.default_constraint_mode || 'none');
    setTargetDays(s.default_target_days != null ? String(s.default_target_days) : '180');
    setTargetHours(s.default_target_hours != null ? String(s.default_target_hours) : '1000');
    setLearningStartTime(normalizeLearningTimeDisplay(s.default_day_start_time, DEFAULT_LEARNING_START_TIME));
    setLearningEndTime(normalizeLearningTimeDisplay(s.default_day_end_time, DEFAULT_LEARNING_END_TIME));
    setFollowGlobalHolidays(s.follow_public_holidays !== false);
    if (s.default_school_year && !isSchoolYearLocked) {
      setSelectedSchoolYearLabel(normalizeSchoolYearLabel(String(s.default_school_year)));
    }
    setDefaultYearStartDate(normalizeYmd(s.default_year_start_date) || rangeDefaults.yearStart);
    setDefaultYearEndDate(normalizeYmd(s.default_year_end_date) || rangeDefaults.yearEnd);
    setDefaultFallStartDate(normalizeYmd(s.default_fall_term_start_date) || rangeDefaults.fallStart);
    setDefaultFallEndDate(normalizeYmd(s.default_fall_term_end_date) || rangeDefaults.fallEnd);
    setDefaultSpringStartDate(normalizeYmd(s.default_spring_term_start_date) || rangeDefaults.springStart);
    setDefaultSpringEndDate(normalizeYmd(s.default_spring_term_end_date) || rangeDefaults.springEnd);
    const ex = initialData.exclusions || [];
    const holidays = ex.filter((e) => e.exclusion_type === 'holiday').map((e) => ({
      id: e.id,
      date: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
      name: e.label || '',
    }));
    const breaks = ex.filter((e) => e.exclusion_type === 'break').map((e) => ({
      id: e.id,
      start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
      end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
      name: e.label || '',
    }));
    setCustomHolidays(holidays);
    setCustomBreaks(breaks);
    setExcludedPublicHolidayDates(Array.isArray(initialData.excluded_holiday_dates) ? initialData.excluded_holiday_dates : []);
    const subjectsList = initialData.subjects || [];
    setSubjects(subjectsList);
    const { subjectTargetsMap, firstActiveTarget } = deriveSubjectTargetState(subjectsList);
    setSubjectTargets(subjectTargetsMap);
    const initialScope = s.target_scope || 'overall';
    if (firstActiveTarget && initialScope === 'per_subject') {
      setGoalMode(firstActiveTarget.mode);
      if (firstActiveTarget.mode === 'days') setTargetDays(firstActiveTarget.days || '180');
      if (firstActiveTarget.mode === 'hours') setTargetHours(firstActiveTarget.hours || '1000');
    }
    setLoading(false);
  }, [initialData, isSchoolYearLocked, normalizedLockedSchoolYearLabel, selectedSchoolYearLabel]);

  useEffect(() => {
    let cancelled = false;
    const loadSchoolYears = async () => {
      const { data } = await supabase
        .from('school_year_templates')
        .select('label, start_year')
        .order('start_year', { ascending: true });
      if (cancelled) return;
      const dbLabels = Array.from(
        new Set((data || []).map((row) => normalizeSchoolYearLabel(row?.label)).filter(Boolean))
      );
      const now = new Date();
      const currentStart = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      const futureLabels = Array.from({ length: 12 }, (_, idx) => formatSchoolYearLabel(currentStart + idx));
      const labels = Array.from(new Set([...dbLabels, ...futureLabels]))
        .filter(Boolean)
        .sort((a, b) => {
          const ay = parseSchoolYearLabel(a)?.start ?? 0;
          const by = parseSchoolYearLabel(b)?.start ?? 0;
          return ay - by;
        });
      setSchoolYearOptions(labels);
      if (isSchoolYearLocked) {
        setSelectedSchoolYearLabel(normalizedLockedSchoolYearLabel);
        return;
      }
      if (!selectedSchoolYearLabel) {
        const fallback = `${currentStart}/${String(currentStart + 1).slice(-2)}`;
        setSelectedSchoolYearLabel(labels.includes(fallback) ? fallback : (labels[0] || fallback));
      }
    };
    loadSchoolYears();
    return () => {
      cancelled = true;
    };
  }, [selectedSchoolYearLabel, isSchoolYearLocked, normalizedLockedSchoolYearLabel]);

  const showSaved = () => {
    setSavedIndicator(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => setSavedIndicator(false), 2000);
  };

  const loadDefaults = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    setError(null);
    try {
      const { settings: s, exclusions: ex, excluded_holiday_dates: excludedDates, error: planErr } = await getPlanDefaultsFromSettings(
        familyId,
        selectedSchoolYearLabel
      );
      if (planErr) throw planErr;
      if (s) {
        const fallbackYearLabel = isSchoolYearLocked
          ? normalizedLockedSchoolYearLabel
          : (s.default_school_year || selectedSchoolYearLabel);
        const rangeDefaults = schoolYearRangeDefaults(fallbackYearLabel);
        setTargetScope(s.target_scope || 'overall');
        setGoalMode(s.default_constraint_mode || 'none');
        setTargetDays(s.default_target_days != null ? String(s.default_target_days) : '180');
        setTargetHours(s.default_target_hours != null ? String(s.default_target_hours) : '1000');
        setLearningStartTime(normalizeLearningTimeDisplay(s.default_day_start_time, DEFAULT_LEARNING_START_TIME));
        setLearningEndTime(normalizeLearningTimeDisplay(s.default_day_end_time, DEFAULT_LEARNING_END_TIME));
        setFollowGlobalHolidays(s.follow_public_holidays !== false);
        if (s.default_school_year && !isSchoolYearLocked) {
          setSelectedSchoolYearLabel(normalizeSchoolYearLabel(String(s.default_school_year)));
        }
        setDefaultYearStartDate(normalizeYmd(s.default_year_start_date) || rangeDefaults.yearStart);
        setDefaultYearEndDate(normalizeYmd(s.default_year_end_date) || rangeDefaults.yearEnd);
        setDefaultFallStartDate(normalizeYmd(s.default_fall_term_start_date) || rangeDefaults.fallStart);
        setDefaultFallEndDate(normalizeYmd(s.default_fall_term_end_date) || rangeDefaults.fallEnd);
        setDefaultSpringStartDate(normalizeYmd(s.default_spring_term_start_date) || rangeDefaults.springStart);
        setDefaultSpringEndDate(normalizeYmd(s.default_spring_term_end_date) || rangeDefaults.springEnd);
      }
      setExcludedPublicHolidayDates(Array.isArray(excludedDates) ? excludedDates : []);
      const holidays = (ex || []).filter((e) => e.exclusion_type === 'holiday').map((e) => ({
        id: e.id,
        date: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
        name: e.label || '',
      }));
      const breaks = (ex || []).filter((e) => e.exclusion_type === 'break').map((e) => ({
        id: e.id,
        start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
        end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
        name: e.label || '',
      }));
      setCustomHolidays(holidays);
      setCustomBreaks(breaks);
      // Load subjects for Subject Targets section
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name, school_year, default_constraint_mode, default_target_days, default_target_hours')
        .eq('family_id', familyId)
        .order('name');
      setSubjects(subjectsData || []);
      const { subjectTargetsMap, firstActiveTarget } = deriveSubjectTargetState(subjectsData || []);
      setSubjectTargets(subjectTargetsMap);
      const initialScope = s?.target_scope || 'overall';
      if (firstActiveTarget && initialScope === 'per_subject') {
        setGoalMode(firstActiveTarget.mode);
        if (firstActiveTarget.mode === 'days') setTargetDays(firstActiveTarget.days || '180');
        if (firstActiveTarget.mode === 'hours') setTargetHours(firstActiveTarget.hours || '1000');
      }
    } catch (err) {
      setError(err?.message || 'Failed to load planner settings');
    } finally {
      setLoading(false);
    }
  }, [familyId, selectedSchoolYearLabel, isSchoolYearLocked]);

  /** Keep Subject targets in sync when a subject is saved elsewhere (e.g. Edit subject modal). */
  const reloadSubjectTargetsFromDb = useCallback(async () => {
    if (!familyId) return;
    try {
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name, school_year, default_constraint_mode, default_target_days, default_target_hours')
        .eq('family_id', familyId)
        .order('name');
      const list = subjectsData || [];
      setSubjects(list);
      const { subjectTargetsMap, firstActiveTarget } = deriveSubjectTargetState(list);
      setSubjectTargets(subjectTargetsMap);
      if (firstActiveTarget && stateRef.current?.targetScope === 'per_subject') {
        setGoalMode(firstActiveTarget.mode);
        if (firstActiveTarget.mode === 'days') setTargetDays(firstActiveTarget.days || '180');
        if (firstActiveTarget.mode === 'hours') setTargetHours(firstActiveTarget.hours || '1000');
      }
    } catch (_) {
      /* ignore */
    }
  }, [familyId]);

  const subjectTargetsExternalReloadTimerRef = useRef(null);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId) return;
    const scheduleReload = () => {
      if (subjectTargetsExternalReloadTimerRef.current) {
        clearTimeout(subjectTargetsExternalReloadTimerRef.current);
      }
      subjectTargetsExternalReloadTimerRef.current = setTimeout(() => {
        subjectTargetsExternalReloadTimerRef.current = null;
        if (initialData) {
          reloadSubjectTargetsFromDb();
        } else {
          loadDefaults();
        }
      }, 150);
    };
    window.addEventListener('refreshPlanDefaults', scheduleReload);
    window.addEventListener('refreshSubjects', scheduleReload);
    return () => {
      window.removeEventListener('refreshPlanDefaults', scheduleReload);
      window.removeEventListener('refreshSubjects', scheduleReload);
      if (subjectTargetsExternalReloadTimerRef.current) {
        clearTimeout(subjectTargetsExternalReloadTimerRef.current);
      }
    };
  }, [familyId, reloadSubjectTargetsFromDb, loadDefaults, initialData]);

  useEffect(() => {
    if (initialData) return; // Use preloaded data from FamilyPanel, skip fetch
    loadDefaults();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (subjectTargetSaveTimeoutRef.current) clearTimeout(subjectTargetSaveTimeoutRef.current);
    };
  }, [loadDefaults, initialData]);

  const persist = useCallback(
    async (updates) => {
      if (!familyId) return;
      if (readOnly) {
        toast.push('Your family admin has disabled changing planning preferences.', 'error');
        return false;
      }
      const s = stateRef.current;
      setSaving(true);
      setError(null);
      try {
        const parsedTargetDays = parsePositiveIntOrNull(s.targetDays);
        const parsedTargetHours = parsePositiveFloatOrNull(s.targetHours);
        const normalizedTargetDays = parsedTargetDays ?? 180;
        const normalizedTargetHours = parsedTargetHours ?? 1000;
        const learningStartSql = normalizeLearningTimeSql(s.learningStartTime, DEFAULT_LEARNING_START_TIME);
        const learningEndSql = normalizeLearningTimeSql(s.learningEndTime, DEFAULT_LEARNING_END_TIME);
        const learningStartMinutes = parseTimeToMinutesOrNull(learningStartSql);
        const learningEndMinutes = parseTimeToMinutesOrNull(learningEndSql);
        if (
          learningStartMinutes == null
          || learningEndMinutes == null
          || learningEndMinutes <= learningStartMinutes
        ) {
          throw new Error('Learning end time must be after learning start time.');
        }
        const normalizedHoursPerDay = Number(((learningEndMinutes - learningStartMinutes) / 60).toFixed(2));
        const yearStart = normalizeYmd(s.defaultYearStartDate);
        const yearEnd = normalizeYmd(s.defaultYearEndDate);
        const fallStart = normalizeYmd(s.defaultFallStartDate);
        const fallEnd = normalizeYmd(s.defaultFallEndDate);
        const springStart = normalizeYmd(s.defaultSpringStartDate);
        const springEnd = normalizeYmd(s.defaultSpringEndDate);
        if ((yearStart && !yearEnd) || (!yearStart && yearEnd)) {
          throw new Error('Set both year start and year end (or clear both).');
        }
        if ((fallStart && !fallEnd) || (!fallStart && fallEnd)) {
          throw new Error('Set both fall term start and end (or clear both).');
        }
        if ((springStart && !springEnd) || (!springStart && springEnd)) {
          throw new Error('Set both spring term start and end (or clear both).');
        }
        if (yearStart && yearEnd && yearStart > yearEnd) {
          throw new Error('Year end must be on or after year start.');
        }
        if (fallStart && fallEnd && fallStart > fallEnd) {
          throw new Error('Fall term end must be on or after fall term start.');
        }
        if (springStart && springEnd && springStart > springEnd) {
          throw new Error('Spring term end must be on or after spring term start.');
        }
        const settingsPayload = {
          target_scope: s.targetScope || 'overall',
          default_school_year: selectedSchoolYearLabel || null,
          default_constraint_mode: s.goalMode,
          default_target_days: s.goalMode === 'days' ? normalizedTargetDays : null,
          default_target_hours: s.goalMode === 'hours' ? normalizedTargetHours : null,
          default_planned_hours_per_day: normalizedHoursPerDay,
          default_day_start_time: learningStartSql,
          default_day_end_time: learningEndSql,
          follow_public_holidays: s.followGlobalHolidays,
          holiday_country: s.countryCode,
          holiday_region: s.regionCode ?? null,
          default_year_start_date: yearStart || null,
          default_year_end_date: yearEnd || null,
          default_fall_term_start_date: fallStart || null,
          default_fall_term_end_date: fallEnd || null,
          default_spring_term_start_date: springStart || null,
          default_spring_term_end_date: springEnd || null,
          ...updates,
        };
        const { error: settingsErr } = await saveFamilyPlannerSettings(familyId, settingsPayload, selectedSchoolYearLabel);
        if (settingsErr) throw settingsErr;
        const { error: exErr } = await syncFamilyHolidayBreakExclusions(
          familyId,
          s.customHolidays,
          s.customBreaks,
          selectedSchoolYearLabel
        );
        if (exErr) throw exErr;
        showSaved();
        loadDefaults(); // refresh to get new exclusion ids
        onSave?.();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
          window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
        }
        return true;
      } catch (err) {
        setError(err?.message || 'Failed to save');
        toast.push(err?.message || 'Failed to save', 'error');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [familyId, onSave, toast, loadDefaults, readOnly, selectedSchoolYearLabel]
  );

  const debouncedPersist = useCallback(() => {
    persist({});
  }, [persist]);

  const handleEmbeddedSave = useCallback(async () => {
    const ok = await persist({});
    if (ok && typeof onRequestClose === 'function') {
      onRequestClose();
    }
  }, [persist, onRequestClose]);

  const handleTargetScopeChange = async (scope) => {
    if (readOnly) {
      toast.push('Your family admin has disabled changing planning preferences.', 'error');
      return;
    }
    setTargetScope(scope);
    const { error } = await saveFamilyPlannerSettings(familyId, { target_scope: scope }, selectedSchoolYearLabel);
    if (!error) {
      showSaved();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }
    } else toast.push(error?.message || 'Failed to save', 'error');
    if (scope === 'per_subject') {
      // Prefill each subject with overall value in UI (nice UX)
      const s = stateRef.current;
      const mode = s.goalMode || 'none';
      const days = mode === 'days' ? (s.targetDays || '180') : '';
      const hours = mode === 'hours' ? (s.targetHours || '1000') : '';
      setSubjectTargets((prev) => {
        const next = { ...prev };
        visibleSubjects.forEach((subj) => {
          if (!next[subj.id] || next[subj.id].mode === 'none') {
            next[subj.id] = { mode, days, hours };
          }
        });
        return next;
      });
    }
  };

  const handleGoalChange = (mode) => {
    if (mode === 'days' && !parsePositiveIntOrNull(stateRef.current?.targetDays)) {
      setTargetDays('180');
    }
    if (mode === 'hours') {
      if (!parsePositiveFloatOrNull(stateRef.current?.targetHours)) setTargetHours('1000');
    }
    setGoalMode(mode);
    setTimeout(debouncedPersist, 300);
  };
  const handleTargetDaysChange = (v) => {
    setTargetDays(v);
    setTimeout(debouncedPersist, 400);
  };
  const handleTargetHoursChange = (v) => {
    setTargetHours(v);
    setTimeout(debouncedPersist, 400);
  };
  const persistLearningTimes = useCallback((startDisplayInput, endDisplayInput) => {
    const startDisplay = normalizeLearningTimeDisplay(startDisplayInput, DEFAULT_LEARNING_START_TIME);
    const endDisplay = normalizeLearningTimeDisplay(endDisplayInput, DEFAULT_LEARNING_END_TIME);
    const startSql = normalizeLearningTimeSql(startDisplay, DEFAULT_LEARNING_START_TIME);
    const endSql = normalizeLearningTimeSql(endDisplay, DEFAULT_LEARNING_END_TIME);
    const startMinutes = parseTimeToMinutesOrNull(startSql);
    const endMinutes = parseTimeToMinutesOrNull(endSql);
    if (
      startMinutes == null
      || endMinutes == null
      || endMinutes <= startMinutes
    ) {
      toast.push('Learning end time must be after learning start time.', 'error');
      return false;
    }
    setLearningStartTime(startDisplay);
    setLearningEndTime(endDisplay);
    const hoursPerDay = Number(((endMinutes - startMinutes) / 60).toFixed(2));
    persist({
      default_day_start_time: startSql,
      default_day_end_time: endSql,
      default_planned_hours_per_day: hoursPerDay,
    });
    return true;
  }, [persist, toast]);
  const handleLearningStartTimeWebChange = useCallback((value) => {
    const parts = String(value || '').split(':').map((n) => Number(n));
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return;
    const sql = `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}:00`;
    const display = normalizeLearningTimeDisplay(sql, DEFAULT_LEARNING_START_TIME);
    setLearningStartTime(display);
    persistLearningTimes(display, stateRef.current?.learningEndTime);
  }, [persistLearningTimes]);
  const handleLearningEndTimeWebChange = useCallback((value) => {
    const parts = String(value || '').split(':').map((n) => Number(n));
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return;
    const sql = `${String(parts[0]).padStart(2, '0')}:${String(parts[1]).padStart(2, '0')}:00`;
    const display = normalizeLearningTimeDisplay(sql, DEFAULT_LEARNING_END_TIME);
    setLearningEndTime(display);
    persistLearningTimes(stateRef.current?.learningStartTime, display);
  }, [persistLearningTimes]);
  const learningStartTimeWebValue = normalizeLearningTimeSql(learningStartTime, DEFAULT_LEARNING_START_TIME).slice(0, 5);
  const learningEndTimeWebValue = normalizeLearningTimeSql(learningEndTime, DEFAULT_LEARNING_END_TIME).slice(0, 5);
  const handleFollowChange = (v) => {
    setFollowGlobalHolidays(v);
    setTimeout(debouncedPersist, 300);
  };
  const handleRangeDefaultChange = (setter) => (value) => {
    setter(normalizeYmd(value));
    setTimeout(debouncedPersist, 300);
  };
  const openAddSubjectModal = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openAddSubjectModal', {
          detail: {
            schoolYear: selectedSchoolYearLabel || null,
          },
        })
      );
      return;
    }
    toast.push('Open Subjects to add a new subject.', 'info');
  }, [selectedSchoolYearLabel, toast]);
  const addHoliday = () => {
    if (!newHolidayDate || !newHolidayName.trim()) {
      toast.push('Enter date and name.', 'error');
      return;
    }
    if (!withinYmdRange(newHolidayDate, yearRangeMinYmd, yearRangeMaxYmd)) {
      toast.push(`Date must be between ${yearRangeMinYmd} and ${yearRangeMaxYmd}.`, 'error');
      return;
    }
    setCustomHolidays([
      ...customHolidays,
      { date: newHolidayDate, name: newHolidayName.trim(), type: 'CUSTOM_HOLIDAY' },
    ]);
    setNewHolidayDate('');
    setNewHolidayName('');
    setAddingHoliday(false);
    setTimeout(debouncedPersist, 300);
  };

  const removeHoliday = (index) => {
    const h = customHolidays[index];
    setCustomHolidays(customHolidays.filter((_, i) => i !== index));
    if (h?.id) {
      deleteExclusion(h.id).catch(() => {});
    }
    setTimeout(debouncedPersist, 300);
  };

  const startEditHoliday = (index) => {
    setEditingHolidayIndex(index);
    setEditingHolidayDraft({ date: customHolidays[index].date, name: customHolidays[index].name });
  };
  const cancelEditHoliday = () => {
    setEditingHolidayIndex(null);
    setEditingHolidayDraft({ date: '', name: '' });
  };
  const saveEditHoliday = (index) => {
    const { date, name } = editingHolidayDraft;
    if (!withinYmdRange(date, yearRangeMinYmd, yearRangeMaxYmd)) {
      toast.push(`Date must be between ${yearRangeMinYmd} and ${yearRangeMaxYmd}.`, 'error');
      return;
    }
    const next = [...customHolidays];
    next[index] = { ...next[index], date, name };
    setCustomHolidays(next);
    setEditingHolidayIndex(null);
    setEditingHolidayDraft({ date: '', name: '' });
    setTimeout(debouncedPersist, 300);
  };

  const addBreak = () => {
    if (!newBreakStart || !newBreakEnd || !newBreakName.trim()) {
      toast.push('Enter start, end, and name.', 'error');
      return;
    }
    if (newBreakStart > newBreakEnd) {
      toast.push('End date must be on or after start.', 'error');
      return;
    }
    if (!withinYmdRange(newBreakStart, yearRangeMinYmd, yearRangeMaxYmd) || !withinYmdRange(newBreakEnd, yearRangeMinYmd, yearRangeMaxYmd)) {
      toast.push(`Dates must be between ${yearRangeMinYmd} and ${yearRangeMaxYmd}.`, 'error');
      return;
    }
    setCustomBreaks([
      ...customBreaks,
      { start: newBreakStart, end: newBreakEnd, name: newBreakName.trim() },
    ]);
    setNewBreakStart('');
    setNewBreakEnd('');
    setNewBreakName('');
    setAddingBreak(false);
    setTimeout(debouncedPersist, 300);
  };

  const removeBreak = (index) => {
    const b = customBreaks[index];
    setCustomBreaks(customBreaks.filter((_, i) => i !== index));
    if (b?.id) {
      deleteExclusion(b.id).catch(() => {});
    }
    setTimeout(debouncedPersist, 300);
  };

  const startEditBreak = (index) => {
    setEditingBreakIndex(index);
    setEditingBreakDraft({ start: customBreaks[index].start, end: customBreaks[index].end, name: customBreaks[index].name });
  };
  const cancelEditBreak = () => {
    setEditingBreakIndex(null);
    setEditingBreakDraft({ start: '', end: '', name: '' });
  };
  const saveEditBreak = (index) => {
    const { start, end, name } = editingBreakDraft;
    if (!withinYmdRange(start, yearRangeMinYmd, yearRangeMaxYmd) || !withinYmdRange(end, yearRangeMinYmd, yearRangeMaxYmd)) {
      toast.push(`Dates must be between ${yearRangeMinYmd} and ${yearRangeMaxYmd}.`, 'error');
      return;
    }
    const next = [...customBreaks];
    next[index] = { ...next[index], start, end, name };
    setCustomBreaks(next);
    setEditingBreakIndex(null);
    setEditingBreakDraft({ start: '', end: '', name: '' });
    setTimeout(debouncedPersist, 300);
  };

  const handleSubjectTargetChange = useCallback((subjectId, merged) => {
    setSubjectTargets((prev) => ({ ...prev, [subjectId]: merged }));
    if (subjectTargetSaveTimeoutRef.current) clearTimeout(subjectTargetSaveTimeoutRef.current);
    subjectTargetSaveTimeoutRef.current = setTimeout(async () => {
      if (readOnly) {
        toast.push('Your family admin has disabled changing planning preferences.', 'error');
        return;
      }
      const mode = merged.mode || 'none';
      const days = mode === 'days' && merged.days?.trim() ? parseInt(merged.days, 10) : null;
      const hours = mode === 'hours' && merged.hours?.trim() ? parseFloat(merged.hours) : null;
      setSaving(true);
      try {
        const { error } = await supabase
          .from('subject')
          .update({
            default_constraint_mode: mode,
            default_target_days: days,
            default_target_hours: hours,
          })
          .eq('id', subjectId);
        if (error) throw error;
        if (mode === 'days' || mode === 'hours') {
          const normalizedDays = mode === 'days' ? (parsePositiveIntOrNull(days) ?? 180) : null;
          const normalizedHours = mode === 'hours' ? (parsePositiveFloatOrNull(hours) ?? 1000) : null;
          await saveFamilyPlannerSettings(familyId, {
            target_scope: 'per_subject',
            default_constraint_mode: mode,
            default_target_days: normalizedDays,
            default_target_hours: normalizedHours,
          }, selectedSchoolYearLabel);
          setTargetScope('per_subject');
          setGoalMode(mode);
          if (mode === 'days') setTargetDays(normalizedDays != null ? String(normalizedDays) : '');
          if (mode === 'hours') setTargetHours(normalizedHours != null ? String(normalizedHours) : '');
        }
        showSaved();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
        }
      } catch (err) {
        toast.push(err?.message || 'Failed to save', 'error');
      } finally {
        setSaving(false);
      }
    }, 400);
  }, [toast, readOnly]);

  const sectionStyle = {
    paddingTop: 0,
    paddingBottom: embeddedInModal ? 12 : 20,
    marginBottom: embeddedInModal ? 12 : 20,
  };
  const sectionTitleStyle = {
    fontSize: embeddedInModal ? 16 : 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: embeddedInModal ? 10 : 12,
    fontFamily: Platform.OS === 'web' ? '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : undefined,
  };
  const sectionDividerStyle = {
    height: 1,
    backgroundColor: BORDER,
    marginBottom: embeddedInModal ? 12 : 20,
  };
  const pageTitleStyle = {
    fontSize: 36,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 20,
    fontFamily: Platform.OS === 'web' ? '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : undefined,
  };
  const chip = (active) => ({
    paddingVertical: embeddedInModal ? 5 : 6,
    paddingHorizontal: embeddedInModal ? 10 : 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: active ? CHIP_SELECTED_BORDER : BORDER,
    backgroundColor: active ? CHIP_SELECTED_BG : '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  });
  const chipText = (active) => ({
    fontSize: embeddedInModal ? 13 : 14,
    fontWeight: active ? '600' : '500',
    color: active ? CHIP_SELECTED_BORDER : TEXT_BLACK,
    fontFamily: Platform.OS === 'web' ? '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : undefined,
  });
  const inputStyle = {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingVertical: embeddedInModal ? 7 : 8,
    paddingHorizontal: embeddedInModal ? 10 : 12,
    fontSize: embeddedInModal ? 13 : 14,
    color: TEXT_BLACK,
    minWidth: 72,
  };
  const toggleTrackStyle = {
    width: 52,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#d1d5db',
    paddingHorizontal: 2,
    paddingVertical: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  };
  const toggleTrackOnStyle = { backgroundColor: ACCENT };
  const toggleThumbStyle = {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#94A3B8',
    ...(Platform.OS === 'web' && {
      transition: 'transform 0.2s ease',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
    }),
    ...(Platform.OS !== 'web' && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 3,
    }),
  };
  const toggleThumbOnStyle = {
    transform: [{ translateX: 24 }],
    backgroundColor: '#0D9488',
  };
  const rowActionButtonsStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  };
  const rowActionButtonStyle = {
    width: embeddedInModal ? 32 : 36,
    height: embeddedInModal ? 32 : 36,
    borderRadius: embeddedInModal ? 16 : 18,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }),
  };
  const addOutlineButtonStyle = {
    alignItems: 'center',
    justifyContent: 'center',
    height: embeddedInModal ? 30 : 32,
    paddingHorizontal: embeddedInModal ? 10 : 12,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9ED3FF',
    backgroundColor: '#F8FCFF',
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  };
  const addOutlineButtonTextStyle = {
    fontSize: embeddedInModal ? 13 : 14,
    fontWeight: '600',
    color: '#5AAEF2',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const embeddedTitleRowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  };
  const embeddedTitleStyle = {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const embeddedCloseButtonStyle = {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  };
  const embeddedFooterActionsStyle = {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    paddingTop: 8,
  };
  const embeddedCancelButtonStyle = {
    minWidth: 92,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  };
  const embeddedCancelButtonTextStyle = {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const embeddedSaveButtonStyle = {
    minWidth: 132,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 10,
    backgroundColor: '#90CAF5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 12px rgba(158, 207, 251, 0.55)',
    }),
  };
  const embeddedSaveButtonTextStyle = {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  if (loading && !embeddedInModal) {
    return (
      <View style={{ padding: embeddedInModal ? 20 : 32, alignItems: 'center' }}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={{ marginTop: 12, fontSize: 14, color: TEXT_BLACK }}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingBottom: embeddedInModal ? 32 : 32,
        paddingHorizontal: embeddedInModal ? 26 : 0,
        paddingTop: embeddedInModal ? 22 : 0,
      }}
    >
      <View style={{ paddingHorizontal: 0, paddingTop: 0 }}>
        {embeddedInModal ? (
          <View style={embeddedTitleRowStyle}>
            <Text style={embeddedTitleStyle}>Planning Preferences</Text>
            <TouchableOpacity
              onPress={() => onRequestClose?.()}
              style={embeddedCloseButtonStyle}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>
        ) : null}
        {readOnly ? (
          <View
            style={{
              marginBottom: 24,
              padding: 12,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(79, 70, 229, 0.25)',
              backgroundColor: 'rgba(79, 70, 229, 0.06)',
            }}
          >
            <Text style={{ fontSize: 13, color: '#374151', lineHeight: 20 }}>
              Your family admin has turned off changes to planning preferences. You can still review the settings below.
            </Text>
          </View>
        ) : null}
        {!embeddedInModal ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={pageTitleStyle}>Planning Preferences</Text>
            {savedIndicator && (
              <Text style={{ fontSize: 13, color: '#10b981', fontWeight: '500' }}>Saved</Text>
            )}
          </View>
        ) : null}
        {/* Learning Goals */}
        <View style={sectionStyle}>
          <View style={{ alignSelf: 'flex-start' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={sectionTitleStyle}>Learning Goals • </Text>
              <View>
                {isSchoolYearLocked ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={sectionTitleStyle}>
                      {selectedSchoolYearLabel ? `${selectedSchoolYearLabel} School Year` : 'School Year'}
                    </Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    ref={schoolYearTriggerRef}
                    onPress={() => {
                      if (showSchoolYearDropdown) {
                        setShowSchoolYearDropdown(false);
                        return;
                      }
                      const triggerNode = schoolYearTriggerRef.current;
                      if (triggerNode && typeof triggerNode.measureInWindow === 'function') {
                        triggerNode.measureInWindow((x, y, width, height) => {
                          setSchoolYearMenuAnchor({ x, y, width, height });
                          setShowSchoolYearDropdown(true);
                        });
                      } else {
                        setSchoolYearMenuAnchor(null);
                        setShowSchoolYearDropdown(true);
                      }
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={sectionTitleStyle}>
                      {selectedSchoolYearLabel ? `${selectedSchoolYearLabel} School Year` : 'School Year'}
                    </Text>
                    <View
                      style={{
                        marginLeft: 2,
                        marginTop: -7,
                        width: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <ChevronDown size={16} color="rgba(15,23,42,0.7)" />
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
          <View style={sectionDividerStyle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <TouchableOpacity style={chip(targetScope === 'overall')} onPress={() => handleTargetScopeChange('overall')}>
              <Text style={chipText(targetScope === 'overall')}>Overall</Text>
            </TouchableOpacity>
            <TouchableOpacity style={chip(targetScope === 'per_subject')} onPress={() => handleTargetScopeChange('per_subject')}>
              <Text style={chipText(targetScope === 'per_subject')}>Per subject</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Target (only when Overall) */}
        {targetScope === 'overall' && (
          <View style={sectionStyle}>
            <Text style={sectionTitleStyle}>Target</Text>
            <View style={sectionDividerStyle} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity style={chip(goalMode === 'none')} onPress={() => handleGoalChange('none')}>
                <Text style={chipText(goalMode === 'none')}>None</Text>
              </TouchableOpacity>
              <TouchableOpacity style={chip(goalMode === 'days')} onPress={() => handleGoalChange('days')}>
                <Text style={chipText(goalMode === 'days')}>Days</Text>
              </TouchableOpacity>
              <TouchableOpacity style={chip(goalMode === 'hours')} onPress={() => handleGoalChange('hours')}>
                <Text style={chipText(goalMode === 'hours')}>Hours</Text>
              </TouchableOpacity>
              {goalMode === 'days' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    value={targetDays}
                    onChangeText={handleTargetDaysChange}
                    keyboardType="number-pad"
                    style={[inputStyle, { width: 56 }]}
                    placeholder="180"
                    placeholderTextColor="rgba(15,23,42,0.4)"
                  />
                  <Text style={{ fontSize: 14, color: TEXT_BLACK }}>days</Text>
                </View>
              )}
              {goalMode === 'hours' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TextInput
                    value={targetHours}
                    onChangeText={handleTargetHoursChange}
                    keyboardType="number-pad"
                    style={[inputStyle, { width: 64 }]}
                    placeholder="1000"
                    placeholderTextColor="rgba(15,23,42,0.4)"
                  />
                  <Text style={{ fontSize: 14, color: TEXT_BLACK }}>hours</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Subject targets (only when Per subject) */}
        {targetScope === 'per_subject' && (
          <View style={sectionStyle}>
            <Text style={sectionTitleStyle}>Subject targets</Text>
            <View style={sectionDividerStyle} />
            {visibleSubjects.length === 0 ? (
              <View>
                <Text style={{ fontSize: 13, color: MUTED }}>
                  No subjects found for {selectedSchoolYearLabel || 'this school year'}.
                </Text>
                <TouchableOpacity
                  onPress={openAddSubjectModal}
                  style={[addOutlineButtonStyle, { marginTop: 10 }]}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={addOutlineButtonTextStyle}>+ Add subject</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
              {visibleSubjects.map((subj) => {
                const t = subjectTargets[subj.id] || { mode: 'none', days: '', hours: '' };
                return (
                  <View key={subj.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: TEXT_BLACK, minWidth: 100 }}>{subj.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity style={chip(t.mode === 'none')} onPress={() => handleSubjectTargetChange(subj.id, { ...t, mode: 'none' })}>
                        <Text style={chipText(t.mode === 'none')}>None</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={chip(t.mode === 'days')} onPress={() => handleSubjectTargetChange(subj.id, { ...t, mode: 'days' })}>
                        <Text style={chipText(t.mode === 'days')}>Days</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={chip(t.mode === 'hours')} onPress={() => handleSubjectTargetChange(subj.id, { ...t, mode: 'hours' })}>
                        <Text style={chipText(t.mode === 'hours')}>Hours</Text>
                      </TouchableOpacity>
                    </View>
                    {t.mode === 'days' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          value={t.days}
                          onChangeText={(v) => handleSubjectTargetChange(subj.id, { ...t, days: v })}
                          keyboardType="number-pad"
                          style={[inputStyle, { width: 56 }]}
                          placeholder="90"
                          placeholderTextColor="rgba(15,23,42,0.4)"
                        />
                        <Text style={{ fontSize: 14, color: TEXT_BLACK }}>days</Text>
                      </View>
                    )}
                    {t.mode === 'hours' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          value={t.hours}
                          onChangeText={(v) => handleSubjectTargetChange(subj.id, { ...t, hours: v })}
                          keyboardType="decimal-pad"
                          style={[inputStyle, { width: 64 }]}
                          placeholder="120"
                          placeholderTextColor="rgba(15,23,42,0.4)"
                        />
                        <Text style={{ fontSize: 14, color: TEXT_BLACK }}>hours</Text>
                      </View>
                    )}
                  </View>
                );
              })}
              </View>
            )}
          </View>
        )}

        <View style={sectionStyle}>
          <Text style={sectionTitleStyle}>Plan range defaults</Text>
          <View style={sectionDividerStyle} />
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 13, color: TEXT_BLACK, marginBottom: 6 }}>School year</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#DCE3EE',
                borderRadius: 24,
                backgroundColor: '#FFFFFF',
                paddingVertical: 10,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                maxWidth: 350,
                alignSelf: 'flex-start',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <ChevronLeft size={20} color="#1E293B" />
                <PlannerPreferenceDateField
                  value={defaultYearStartDate}
                  onChange={handleRangeDefaultChange(setDefaultYearStartDate)}
                  placeholder="Start"
                  borderColor="transparent"
                  textColor={TEXT_BLACK}
                  mutedColor="rgba(15,23,42,0.4)"
                  style={{
                    borderWidth: 0,
                    backgroundColor: 'transparent',
                    paddingVertical: 8,
                    paddingHorizontal: 0,
                    fontSize: 18,
                    fontWeight: '600',
                    color: '#111827',
                    alignItems: 'center',
                  }}
                  minDate={yearRangeMinYmd}
                  maxDate={yearRangeMaxYmd}
                />
              </View>
              <ArrowRight size={18} color="#94A3B8" />
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                <PlannerPreferenceDateField
                  value={defaultYearEndDate}
                  onChange={handleRangeDefaultChange(setDefaultYearEndDate)}
                  placeholder="End"
                  borderColor="transparent"
                  textColor={TEXT_BLACK}
                  mutedColor="rgba(15,23,42,0.4)"
                  style={{
                    borderWidth: 0,
                    backgroundColor: 'transparent',
                    paddingVertical: 8,
                    paddingHorizontal: 0,
                    fontSize: 18,
                    fontWeight: '600',
                    color: '#111827',
                    alignItems: 'center',
                  }}
                  minDate={yearRangeMinYmd}
                  maxDate={yearRangeMaxYmd}
                />
                <ChevronRight size={20} color="#1E293B" />
              </View>
            </View>
          </View>
          <View style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 13, color: TEXT_BLACK, marginBottom: 6 }}>Fall term</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#DCE3EE',
                borderRadius: 24,
                backgroundColor: '#FFFFFF',
                paddingVertical: 10,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                maxWidth: 350,
                alignSelf: 'flex-start',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <ChevronLeft size={20} color="#1E293B" />
                <PlannerPreferenceDateField
                  value={defaultFallStartDate}
                  onChange={handleRangeDefaultChange(setDefaultFallStartDate)}
                  placeholder="Start"
                  borderColor="transparent"
                  textColor={TEXT_BLACK}
                  mutedColor="rgba(15,23,42,0.4)"
                  style={{
                    borderWidth: 0,
                    backgroundColor: 'transparent',
                    paddingVertical: 8,
                    paddingHorizontal: 0,
                    fontSize: 18,
                    fontWeight: '600',
                    color: '#111827',
                    alignItems: 'center',
                  }}
                  minDate={yearRangeMinYmd}
                  maxDate={yearRangeMaxYmd}
                />
              </View>
              <ArrowRight size={18} color="#94A3B8" />
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                <PlannerPreferenceDateField
                  value={defaultFallEndDate}
                  onChange={handleRangeDefaultChange(setDefaultFallEndDate)}
                  placeholder="End"
                  borderColor="transparent"
                  textColor={TEXT_BLACK}
                  mutedColor="rgba(15,23,42,0.4)"
                  style={{
                    borderWidth: 0,
                    backgroundColor: 'transparent',
                    paddingVertical: 8,
                    paddingHorizontal: 0,
                    fontSize: 18,
                    fontWeight: '600',
                    color: '#111827',
                    alignItems: 'center',
                  }}
                  minDate={yearRangeMinYmd}
                  maxDate={yearRangeMaxYmd}
                />
                <ChevronRight size={20} color="#1E293B" />
              </View>
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 13, color: TEXT_BLACK, marginBottom: 6 }}>Spring term</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#DCE3EE',
                borderRadius: 24,
                backgroundColor: '#FFFFFF',
                paddingVertical: 10,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                maxWidth: 350,
                alignSelf: 'flex-start',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <ChevronLeft size={20} color="#1E293B" />
                <PlannerPreferenceDateField
                  value={defaultSpringStartDate}
                  onChange={handleRangeDefaultChange(setDefaultSpringStartDate)}
                  placeholder="Start"
                  borderColor="transparent"
                  textColor={TEXT_BLACK}
                  mutedColor="rgba(15,23,42,0.4)"
                  style={{
                    borderWidth: 0,
                    backgroundColor: 'transparent',
                    paddingVertical: 8,
                    paddingHorizontal: 0,
                    fontSize: 18,
                    fontWeight: '600',
                    color: '#111827',
                    alignItems: 'center',
                  }}
                  minDate={yearRangeMinYmd}
                  maxDate={yearRangeMaxYmd}
                />
              </View>
              <ArrowRight size={18} color="#94A3B8" />
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                <PlannerPreferenceDateField
                  value={defaultSpringEndDate}
                  onChange={handleRangeDefaultChange(setDefaultSpringEndDate)}
                  placeholder="End"
                  borderColor="transparent"
                  textColor={TEXT_BLACK}
                  mutedColor="rgba(15,23,42,0.4)"
                  style={{
                    borderWidth: 0,
                    backgroundColor: 'transparent',
                    paddingVertical: 8,
                    paddingHorizontal: 0,
                    fontSize: 18,
                    fontWeight: '600',
                    color: '#111827',
                    alignItems: 'center',
                  }}
                  minDate={yearRangeMinYmd}
                  maxDate={yearRangeMaxYmd}
                />
                <ChevronRight size={20} color="#1E293B" />
              </View>
            </View>
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 13, color: TEXT_BLACK, marginBottom: 6 }}>Learning times</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#DCE3EE',
                borderRadius: 24,
                backgroundColor: '#FFFFFF',
                paddingVertical: 10,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                maxWidth: 350,
                alignSelf: 'flex-start',
              }}
            >
              <View style={{ flex: 1, alignItems: 'center' }}>
                {Platform.OS === 'web' ? (
                  <input
                    type="time"
                    value={learningStartTimeWebValue}
                    onChange={(e) => handleLearningStartTimeWebChange(e.target.value)}
                    style={{
                      backgroundColor: 'transparent',
                      borderWidth: 0,
                      borderStyle: 'none',
                      fontSize: 14,
                      color: '#111827',
                      width: 110,
                      outline: 'none',
                      textAlign: 'center',
                    }}
                  />
                ) : (
                  <TextInput
                    value={learningStartTime}
                    onChangeText={setLearningStartTime}
                    onBlur={() => persistLearningTimes(learningStartTime, learningEndTime)}
                    placeholder="8:00 AM"
                    placeholderTextColor={MUTED}
                    style={[inputStyle, { borderWidth: 0, backgroundColor: 'transparent', textAlign: 'center', width: 110 }]}
                  />
                )}
              </View>
              <ArrowRight size={18} color="#94A3B8" />
              <View style={{ flex: 1, alignItems: 'center' }}>
                {Platform.OS === 'web' ? (
                  <input
                    type="time"
                    value={learningEndTimeWebValue}
                    onChange={(e) => handleLearningEndTimeWebChange(e.target.value)}
                    style={{
                      backgroundColor: 'transparent',
                      borderWidth: 0,
                      borderStyle: 'none',
                      fontSize: 14,
                      color: '#111827',
                      width: 110,
                      outline: 'none',
                      textAlign: 'center',
                    }}
                  />
                ) : (
                  <TextInput
                    value={learningEndTime}
                    onChangeText={setLearningEndTime}
                    onBlur={() => persistLearningTimes(learningStartTime, learningEndTime)}
                    placeholder="3:00 PM"
                    placeholderTextColor={MUTED}
                    style={[inputStyle, { borderWidth: 0, backgroundColor: 'transparent', textAlign: 'center', width: 110 }]}
                  />
                )}
              </View>
            </View>
          </View>
        </View>

        {/* Public holidays */}
        <View style={sectionStyle}>
          <Text style={sectionTitleStyle}>Public holidays</Text>
          <View style={sectionDividerStyle} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <TouchableOpacity
              style={[toggleTrackStyle, followGlobalHolidays && toggleTrackOnStyle]}
              onPress={() => handleFollowChange(!followGlobalHolidays)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={[toggleThumbStyle, followGlobalHolidays && toggleThumbOnStyle]} />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 15, color: TEXT_BLACK, marginRight: 4 }}>Follow </Text>
              <TouchableOpacity
                onPress={() => {
                  if (followGlobalHolidays) {
                    setShowPublicHolidaysPicker(true);
                    const start = yearRangeMinYmd;
                    const endStr = yearRangeMaxYmd;
                    setPublicHolidaysLoading(true);
                    getPublicHolidaysForRange(countryCode || 'US', start, endStr).then(({ data: res }) => {
                      setPublicHolidaysList(res?.holidays || []);
                      setPublicHolidaysLoading(false);
                    });
                  }
                }}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center' }}
                {...(Platform.OS === 'web' && { cursor: followGlobalHolidays ? 'pointer' : 'default' })}
              >
                <Text style={{ fontSize: 15, color: TEXT_BLACK, textDecorationLine: followGlobalHolidays ? 'underline' : 'none' }}>U.S. public holidays</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 15, color: TEXT_BLACK, marginLeft: 4 }}>?</Text>
            </View>
          </View>
        </View>

        {/* U.S. public holidays picker modal */}
        {showPublicHolidaysPicker && (
          <Modal animationType="fade" transparent visible={showPublicHolidaysPicker} onRequestClose={() => setShowPublicHolidaysPicker(false)}>
            <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 24 }} activeOpacity={1} onPress={() => setShowPublicHolidaysPicker(false)}>
              <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '100%', maxHeight: '80%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT_BLACK }}>U.S. PUBLIC HOLIDAYS</Text>
                  <TouchableOpacity onPress={() => setShowPublicHolidaysPicker(false)} hitSlop={12} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <X size={22} color={MUTED} />
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 13, color: TEXT_BLACK, marginBottom: 12 }}>Uncheck any holiday you don't want to include (they will be treated as regular instructional days).</Text>
                {publicHolidaysLoading ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={ACCENT} />
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator>
                    {publicHolidaysList.map((h) => {
                      const dateStr = (h.date || '').slice(0, 10);
                      const isIncluded = !excludedPublicHolidayDates.includes(dateStr);
                      return (
                        <TouchableOpacity
                          key={`${dateStr}-${h.name}`}
                          onPress={() => {
                            if (isIncluded) {
                              setExcludedPublicHolidayDates((prev) => [...prev, dateStr]);
                            } else {
                              setExcludedPublicHolidayDates((prev) => prev.filter((d) => d !== dateStr));
                            }
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingRight: 8, borderBottomWidth: 1, borderBottomColor: BORDER }}
                          activeOpacity={0.7}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: isIncluded ? ACCENT : BORDER, backgroundColor: isIncluded ? ACCENT : 'transparent', marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                            {isIncluded ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
                          </View>
                          <Text style={{ flex: 1, fontSize: 14, color: TEXT_BLACK }}>{h.name}</Text>
                          <Text style={{ fontSize: 13, color: TEXT_BLACK }}>{dateStr}</Text>
                        </TouchableOpacity>
                      );
                    })}
                    {publicHolidaysList.length === 0 && !publicHolidaysLoading && (
                      <Text style={{ fontSize: 13, color: TEXT_BLACK, padding: 16 }}>No holidays in this date range. Extend range or add a custom day.</Text>
                    )}
                  </ScrollView>
                )}
                <TouchableOpacity
                  onPress={async () => {
                    const datesWithNames = excludedPublicHolidayDates.map((d) => {
                      const h = publicHolidaysList.find((x) => (x.date || '').slice(0, 10) === d);
                      return { date: d, name: h?.name || 'Holiday' };
                    });
                    const { error: saveErr } = await saveExcludedPublicHolidayDates(
                      familyId,
                      datesWithNames,
                      selectedSchoolYearLabel
                    );
                    if (saveErr) toast?.push?.(saveErr?.message || 'Failed to save', 'error');
                    else {
                      toast?.push?.('Saved', 'success');
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
                        window.dispatchEvent(new CustomEvent('refreshSubjects'));
                      }
                    }
                    setShowPublicHolidaysPicker(false);
                  }}
                  style={{ marginTop: 16, backgroundColor: ACCENT, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, alignSelf: 'flex-end' }}
                  activeOpacity={0.9}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}

        {!isSchoolYearLocked && showSchoolYearDropdown && (
          <Modal
            animationType="none"
            transparent
            visible={showSchoolYearDropdown}
            onRequestClose={() => setShowSchoolYearDropdown(false)}
          >
            <View style={{ flex: 1 }}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setShowSchoolYearDropdown(false)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }}
              />
              <View
                style={{
                  position: 'absolute',
                  top: (schoolYearMenuAnchor?.y || 120) + (schoolYearMenuAnchor?.height || 32) + 4,
                  left: schoolYearMenuAnchor?.x || 220,
                  minWidth: Math.max(240, schoolYearMenuAnchor?.width || 0),
                  maxHeight: 260,
                  borderWidth: 1,
                  borderColor: BORDER,
                  borderRadius: 10,
                  backgroundColor: '#FFFFFF',
                  shadowColor: '#000',
                  shadowOpacity: 0.14,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 20,
                }}
              >
                <ScrollView nestedScrollEnabled>
                  {schoolYearOptions.map((label) => {
                    const isActive = label === selectedSchoolYearLabel;
                    return (
                      <TouchableOpacity
                        key={label}
                        onPress={() => {
                          setSelectedSchoolYearLabel(label);
                          setShowSchoolYearDropdown(false);
                        }}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          backgroundColor: isActive ? CHIP_SELECTED_BG : '#FFFFFF',
                          borderBottomWidth: schoolYearOptions[schoolYearOptions.length - 1] === label ? 0 : 1,
                          borderBottomColor: BORDER,
                        }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={{ fontSize: 14, color: isActive ? CHIP_SELECTED_BORDER : TEXT_BLACK, fontWeight: isActive ? '600' : '500' }}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}

        {/* Custom days (single-date exclusions) */}
        <View style={sectionStyle}>
          <Text style={sectionTitleStyle}>{PLANNING_PREFERENCES_UI.customDaysSectionTitle}</Text>
          <View style={sectionDividerStyle} />
          <View>
              {visibleCustomHolidays.map((h, i) => (
                <View key={h.id || i} style={{ marginBottom: 8 }}>
                  {editingHolidayIndex === h._idx ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <PlannerPreferenceDateField
                        value={editingHolidayDraft.date}
                        onChange={(v) => setEditingHolidayDraft((d) => ({ ...d, date: v }))}
                        placeholder="Select date"
                        borderColor={BORDER}
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={inputStyle}
                        width={120}
                        minDate={yearRangeMinYmd}
                        maxDate={yearRangeMaxYmd}
                      />
                      <TextInput
                        value={editingHolidayDraft.name}
                        onChangeText={(v) => setEditingHolidayDraft((d) => ({ ...d, name: v }))}
                        placeholder="Name"
                        style={[inputStyle, { flex: 1, minWidth: 100 }]}
                        placeholderTextColor="rgba(15,23,42,0.4)"
                      />
                      <TouchableOpacity
                        onPress={() => saveEditHoliday(h._idx)}
                        style={{ padding: 8 }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Check size={18} color="#10b981" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={cancelEditHoliday} style={{ padding: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <X size={18} color={MUTED} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, color: TEXT_BLACK }}>
                        {h.date} — {h.name}
                      </Text>
                      <View style={rowActionButtonsStyle}>
                        <TouchableOpacity onPress={() => startEditHoliday(h._idx)} style={rowActionButtonStyle} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Pencil size={16} color="#374151" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeHoliday(h._idx)} style={rowActionButtonStyle} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Trash2 size={16} color="#991B1B" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}
              {addingHoliday ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <PlannerPreferenceDateField
                    value={newHolidayDate}
                    onChange={setNewHolidayDate}
                    placeholder="Select date"
                    borderColor={BORDER}
                    textColor={TEXT_BLACK}
                    mutedColor="rgba(15,23,42,0.4)"
                    style={inputStyle}
                    width={120}
                    minDate={yearRangeMinYmd}
                    maxDate={yearRangeMaxYmd}
                  />
                  <TextInput
                    value={newHolidayName}
                    onChangeText={setNewHolidayName}
                    placeholder={PLANNING_PREFERENCES_UI.dayNamePlaceholder}
                    style={[inputStyle, { flex: 1, minWidth: 120 }]}
                    placeholderTextColor="rgba(15,23,42,0.4)"
                  />
                  <TouchableOpacity onPress={addHoliday} style={{ paddingVertical: 8, paddingHorizontal: 14, backgroundColor: ACCENT, borderRadius: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Check size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setAddingHoliday(false); setNewHolidayDate(''); setNewHolidayName(''); }} style={{ padding: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <X size={18} color={MUTED} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setAddingHoliday(true)}
                  style={addOutlineButtonStyle}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={addOutlineButtonTextStyle}>+ {PLANNING_PREFERENCES_UI.addDay}</Text>
                </TouchableOpacity>
              )}
          </View>
        </View>

        {/* Ranges (date-span exclusions) */}
        <View style={sectionStyle}>
          <Text style={sectionTitleStyle}>{PLANNING_PREFERENCES_UI.rangesSectionTitle}</Text>
          <View style={sectionDividerStyle} />
          <View>
              {visibleCustomBreaks.map((b, i) => (
                <View key={b.id || i} style={{ marginBottom: 8 }}>
                  {editingBreakIndex === b._idx ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <PlannerPreferenceDateField
                        value={editingBreakDraft.start}
                        onChange={(v) => setEditingBreakDraft((d) => ({ ...d, start: v }))}
                        placeholder="Start"
                        borderColor={BORDER}
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={inputStyle}
                        width={100}
                        minDate={yearRangeMinYmd}
                        maxDate={yearRangeMaxYmd}
                      />
                      <PlannerPreferenceDateField
                        value={editingBreakDraft.end}
                        onChange={(v) => setEditingBreakDraft((d) => ({ ...d, end: v }))}
                        placeholder="End"
                        borderColor={BORDER}
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={inputStyle}
                        width={100}
                        minDate={yearRangeMinYmd}
                        maxDate={yearRangeMaxYmd}
                      />
                      <TextInput
                        value={editingBreakDraft.name}
                        onChangeText={(v) => setEditingBreakDraft((d) => ({ ...d, name: v }))}
                        placeholder="Name"
                        style={[inputStyle, { flex: 1, minWidth: 80 }]}
                        placeholderTextColor="rgba(15,23,42,0.4)"
                      />
                      <TouchableOpacity
                        onPress={() => saveEditBreak(b._idx)}
                        style={{ padding: 8 }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Check size={18} color="#10b981" />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={cancelEditBreak} style={{ padding: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <X size={18} color={MUTED} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 14, color: TEXT_BLACK }}>
                        {b.start}–{b.end} {b.name}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 4 }}>
                        <TouchableOpacity onPress={() => startEditBreak(b._idx)} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Pencil size={14} color={MUTED} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeBreak(b._idx)} style={{ padding: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Trash2 size={14} color="#991B1B" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}
              {addingBreak ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <PlannerPreferenceDateField
                    value={newBreakStart}
                    onChange={setNewBreakStart}
                    placeholder="Start"
                    borderColor={BORDER}
                    textColor={TEXT_BLACK}
                    mutedColor="rgba(15,23,42,0.4)"
                    style={inputStyle}
                    width={100}
                    minDate={yearRangeMinYmd}
                    maxDate={yearRangeMaxYmd}
                  />
                  <PlannerPreferenceDateField
                    value={newBreakEnd}
                    onChange={setNewBreakEnd}
                    placeholder="End"
                    borderColor={BORDER}
                    textColor={TEXT_BLACK}
                    mutedColor="rgba(15,23,42,0.4)"
                    style={inputStyle}
                    width={100}
                    minDate={yearRangeMinYmd}
                    maxDate={yearRangeMaxYmd}
                  />
                  <TextInput
                    value={newBreakName}
                    onChangeText={setNewBreakName}
                    placeholder={PLANNING_PREFERENCES_UI.rangeNamePlaceholder}
                    style={[inputStyle, { flex: 1, minWidth: 80 }]}
                    placeholderTextColor="rgba(15,23,42,0.4)"
                  />
                  <TouchableOpacity onPress={addBreak} style={{ paddingVertical: 8, paddingHorizontal: 14, backgroundColor: ACCENT, borderRadius: 8 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Check size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setAddingBreak(false);
                      setNewBreakStart('');
                      setNewBreakEnd('');
                      setNewBreakName('');
                    }}
                    style={{ padding: 8 }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={18} color={MUTED} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setAddingBreak(true)}
                  style={addOutlineButtonStyle}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={addOutlineButtonTextStyle}>+ {PLANNING_PREFERENCES_UI.addRange}</Text>
                </TouchableOpacity>
              )}
          </View>
        </View>

        {error && <Text style={{ color: '#DC2626', fontSize: 14, marginTop: 12 }}>{error}</Text>}
        {embeddedInModal ? (
          <View style={embeddedFooterActionsStyle}>
            <TouchableOpacity
              style={embeddedCancelButtonStyle}
              onPress={() => onRequestClose?.()}
              disabled={saving}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={embeddedCancelButtonTextStyle}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[embeddedSaveButtonStyle, saving && { opacity: 0.7, ...(Platform.OS === 'web' ? { boxShadow: 'none' } : null) }]}
              onPress={handleEmbeddedSave}
              disabled={saving}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Check size={16} color="#ffffff" />
              <Text style={embeddedSaveButtonTextStyle}>{saving ? 'Saving…' : 'Save'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

    </ScrollView>
  );
}
