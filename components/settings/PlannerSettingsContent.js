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
  Switch,
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
import { apiRequest } from '../../lib/apiClient';
import { useToast } from '../Toast';
import { PLANNING_PREFERENCES_UI } from '../planner/planningPreferencesUiCopy';
import { PlannerPreferenceDateField } from '../ui/AppCalendarDatePickerModal';
import { LEARNADOODLE_LIGHT_BLUE } from '../../theme/comingSoonModalTheme';
import { designTokens } from '../../theme/designTokens';
import { SettingsLayout, SettingsTypography } from './settingsDesignTokens';
import {
  ATTENDANCE_MODES,
  getAttendanceMode,
} from '../../lib/attendanceMode';
import { trackEvent } from '../../lib/analytics';

const MUTED = 'rgba(15,23,42,0.6)';
/** Body copy on this screen — solid black per design */
const TEXT_BLACK = '#000000';
/** Brand pastel blue (FAB, coming-soon CTAs) — borders, fills, toggles on this page */
const ACCENT = LEARNADOODLE_LIGHT_BLUE;
const BORDER = '#EEF1F5';
/** Selected chips — light blue border/text + soft blue fill */
const CHIP_SELECTED_BORDER = '#C9D8EC';
const CHIP_SELECTED_BG = 'rgba(155, 184, 220, 0.26)';
const SECTION_SEPARATOR = 'rgba(15,23,42,0.05)';
const LINK_PURPLE = '#4F46E5';
const plannerSettingsSnapshotCache = new Map();
const PLANNER_SETTINGS_SESSION_CACHE_PREFIX = 'ld_planner_settings_snapshot_v1::';

const buildPlannerSettingsSessionCacheKey = (snapshotCacheKey) => (
  `${PLANNER_SETTINGS_SESSION_CACHE_PREFIX}${String(snapshotCacheKey || '').trim()}`
);

const readPlannerSettingsSessionSnapshot = (snapshotCacheKey) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const key = buildPlannerSettingsSessionCacheKey(snapshotCacheKey);
  if (!key) return null;
  try {
    const raw = window.sessionStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
};

const writePlannerSettingsSessionSnapshot = (snapshotCacheKey, payload) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const key = buildPlannerSettingsSessionCacheKey(snapshotCacheKey);
  if (!key || !payload || typeof payload !== 'object') return;
  try {
    window.sessionStorage?.setItem(key, JSON.stringify(payload));
  } catch (_) {
    // ignore session cache write failures
  }
};

const clearPlannerSettingsSessionSnapshot = (snapshotCacheKey) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const key = buildPlannerSettingsSessionCacheKey(snapshotCacheKey);
  if (!key) return;
  try {
    window.sessionStorage?.removeItem(key);
  } catch (_) {
    // ignore session cache clear failures
  }
};

const buildPlannerInitialDataSignature = (initialData) => {
  if (!initialData || typeof initialData !== 'object') return 'none';
  const settings = initialData.settings && typeof initialData.settings === 'object'
    ? initialData.settings
    : {};
  const exclusions = Array.isArray(initialData.exclusions) ? initialData.exclusions : [];
  const subjects = Array.isArray(initialData.subjects) ? initialData.subjects : [];
  return JSON.stringify({
    schoolYearLabel: settings.school_year_label || settings.default_school_year || '',
    attendanceTrackingMode: settings.attendance_tracking_mode || '',
    constraintMode: settings.default_constraint_mode || '',
    targetDays: settings.default_target_days ?? null,
    targetHours: settings.default_target_hours ?? null,
    excludedHolidayDates: Array.isArray(initialData.excluded_holiday_dates) ? initialData.excluded_holiday_dates : [],
    exclusions: exclusions.map((row) => ({
      id: row?.id ?? null,
      exclusion_type: row?.exclusion_type || '',
      start_date: row?.start_date || '',
      end_date: row?.end_date || '',
      label: row?.label || '',
    })),
    subjectTargets: subjects.map((subject) => ({
      id: subject?.id ?? null,
      mode: subject?.default_constraint_mode || '',
      days: subject?.default_target_days ?? null,
      hours: subject?.default_target_hours ?? null,
    })),
  });
};

const parsePositiveIntOrNull = (value) => {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const parsePositiveFloatOrNull = (value) => {
  const n = parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const DEFAULT_LEARNING_START_TIME = '08:00:00';
const DEFAULT_LEARNING_END_TIME = '15:00:00';
const DEFAULT_ALLOWED_WEEKDAYS = [1, 2, 3, 4, 5];
const LEARNING_DAY_OPTIONS = [
  { id: 0, label: 'Sun' },
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
];

const normalizeAllowedWeekdays = (input) => {
  const source = Array.isArray(input) ? input : [];
  const normalized = [...new Set(
    source
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  )].sort((a, b) => a - b);
  return normalized.length > 0 ? normalized : [...DEFAULT_ALLOWED_WEEKDAYS];
};

const resolveTargetScopeForAttendanceMode = (mode) => (
  getAttendanceMode({ academicYearMode: mode }) === ATTENDANCE_MODES.CLASS_DAY
    ? 'overall'
    : 'per_subject'
);

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

const coerceRangeDatesToSchoolYear = (settings, schoolYearLabel) => {
  const parsed = parseSchoolYearLabel(schoolYearLabel);
  const defaults = schoolYearRangeDefaults(schoolYearLabel);
  if (!parsed) {
    return {
      default_year_start_date: defaults.yearStart,
      default_year_end_date: defaults.yearEnd,
      default_fall_term_start_date: defaults.fallStart,
      default_fall_term_end_date: defaults.fallEnd,
      default_spring_term_start_date: defaults.springStart,
      default_spring_term_end_date: defaults.springEnd,
    };
  }
  const keepIfYearMatches = (value, expectedYear, fallback) => {
    const ymd = normalizeYmd(value);
    if (!ymd) return fallback;
    const year = Number(ymd.slice(0, 4));
    return year === expectedYear ? ymd : fallback;
  };
  return {
    default_year_start_date: keepIfYearMatches(settings?.default_year_start_date, parsed.start, defaults.yearStart),
    default_year_end_date: keepIfYearMatches(settings?.default_year_end_date, parsed.end, defaults.yearEnd),
    default_fall_term_start_date: keepIfYearMatches(settings?.default_fall_term_start_date, parsed.start, defaults.fallStart),
    default_fall_term_end_date: keepIfYearMatches(settings?.default_fall_term_end_date, parsed.start, defaults.fallEnd),
    default_spring_term_start_date: keepIfYearMatches(settings?.default_spring_term_start_date, parsed.end, defaults.springStart),
    default_spring_term_end_date: keepIfYearMatches(settings?.default_spring_term_end_date, parsed.end, defaults.springEnd),
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

const deriveInitialSchoolYearLabel = (normalizedLockedSchoolYearLabel) => {
  if (normalizedLockedSchoolYearLabel) return normalizedLockedSchoolYearLabel;
  const now = new Date();
  const start = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return formatSchoolYearLabel(start);
};

const deriveSnapshotCacheKey = (familyId, schoolYearLabel) => {
  const yearLabel = normalizeSchoolYearLabel(schoolYearLabel) || 'current';
  return `${String(familyId || 'unknown')}::${yearLabel}`;
};

const getInitialPlannerSettingsSnapshot = ({
  embeddedInModal,
  familyId,
  lockedSchoolYearLabel,
}) => {
  if (!embeddedInModal) return null;
  const normalizedLocked = normalizeSchoolYearLabel(String(lockedSchoolYearLabel || '').trim());
  const initialYearLabel = deriveInitialSchoolYearLabel(normalizedLocked);
  const cacheKey = deriveSnapshotCacheKey(familyId, initialYearLabel);
  const inMemory = plannerSettingsSnapshotCache.get(cacheKey);
  if (inMemory && typeof inMemory === 'object') return inMemory;
  const persisted = readPlannerSettingsSessionSnapshot(cacheKey);
  return persisted && typeof persisted === 'object' ? persisted : null;
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
  const [hasPendingModalSave, setHasPendingModalSave] = useState(false);
  const [error, setError] = useState(null);
  const saveTimeoutRef = useRef(null);
  const subjectTargetSaveTimeoutRef = useRef(null);
  const loadDefaultsRequestRef = useRef(0);
  const resetDefaultsWhenNoSubjectsInFlightRef = useRef(false);

  const stateRef = useRef({});
  const initialSnapshot = getInitialPlannerSettingsSnapshot({
    embeddedInModal,
    familyId,
    lockedSchoolYearLabel,
  });
  const initialAttendanceTrackingMode = getAttendanceMode({
    academicYearMode: initialSnapshot?.attendanceTrackingMode,
    fallback: ATTENDANCE_MODES.CLASS_DAY,
  });
  const initialSelectedYearLabelFromSnapshot = normalizeSchoolYearLabel(initialSnapshot?.selectedSchoolYearLabel);
  const initialSelectedSchoolYearLabel = initialSelectedYearLabelFromSnapshot || deriveInitialSchoolYearLabel(
    normalizeSchoolYearLabel(String(lockedSchoolYearLabel || '').trim())
  );

  // Target scope: overall (one target) vs per_subject
  const [targetScope, setTargetScope] = useState(resolveTargetScopeForAttendanceMode(initialAttendanceTrackingMode));
  const [attendanceTrackingMode, setAttendanceTrackingMode] = useState(initialAttendanceTrackingMode);

  // Goal defaults (scope is now derived from attendance mode)
  const [goalMode, setGoalMode] = useState(initialSnapshot?.goalMode || 'days');
  const [targetDays, setTargetDays] = useState(initialSnapshot?.targetDays ?? '0');
  const [targetHours, setTargetHours] = useState(initialSnapshot?.targetHours ?? '0');
  const [learningStartTime, setLearningStartTime] = useState(
    normalizeLearningTimeDisplay(initialSnapshot?.learningStartTime, DEFAULT_LEARNING_START_TIME)
  );
  const [learningEndTime, setLearningEndTime] = useState(
    normalizeLearningTimeDisplay(initialSnapshot?.learningEndTime, DEFAULT_LEARNING_END_TIME)
  );
  const [preferredLearningDayNums, setPreferredLearningDayNums] = useState(
    normalizeAllowedWeekdays(initialSnapshot?.preferredLearningDayNums)
  );

  // Public holidays
  const [followGlobalHolidays, setFollowGlobalHolidays] = useState(initialSnapshot?.followGlobalHolidays !== false);
  const [excludedPublicHolidayDates, setExcludedPublicHolidayDates] = useState(
    Array.isArray(initialSnapshot?.excludedPublicHolidayDates) ? initialSnapshot.excludedPublicHolidayDates : []
  );
  const [showPublicHolidaysPicker, setShowPublicHolidaysPicker] = useState(false);
  const [publicHolidaysList, setPublicHolidaysList] = useState([]);
  const [publicHolidaysLoading, setPublicHolidaysLoading] = useState(false);
  const countryCode = 'US';
  const regionCode = null;

  // Custom days & ranges (stored as holiday / break exclusions in API)
  const [customHolidays, setCustomHolidays] = useState(
    Array.isArray(initialSnapshot?.customHolidays) ? initialSnapshot.customHolidays : []
  );
  const [customBreaks, setCustomBreaks] = useState(
    Array.isArray(initialSnapshot?.customBreaks) ? initialSnapshot.customBreaks : []
  );
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
  const [defaultYearStartDate, setDefaultYearStartDate] = useState(initialSnapshot?.defaultYearStartDate || '');
  const [defaultYearEndDate, setDefaultYearEndDate] = useState(initialSnapshot?.defaultYearEndDate || '');
  const [defaultFallStartDate, setDefaultFallStartDate] = useState(initialSnapshot?.defaultFallStartDate || '');
  const [defaultFallEndDate, setDefaultFallEndDate] = useState(initialSnapshot?.defaultFallEndDate || '');
  const [defaultSpringStartDate, setDefaultSpringStartDate] = useState(initialSnapshot?.defaultSpringStartDate || '');
  const [defaultSpringEndDate, setDefaultSpringEndDate] = useState(initialSnapshot?.defaultSpringEndDate || '');

  // Subject targets (per-subject defaults)
  const [subjects, setSubjects] = useState(Array.isArray(initialSnapshot?.subjects) ? initialSnapshot.subjects : []);
  const [subjectTargets, setSubjectTargets] = useState(
    initialSnapshot?.subjectTargets && typeof initialSnapshot.subjectTargets === 'object'
      ? initialSnapshot.subjectTargets
      : {}
  ); // { subjectId: { mode, days, hours } }
  const [schoolYearOptions, setSchoolYearOptions] = useState([]);
  const [selectedSchoolYearLabel, setSelectedSchoolYearLabel] = useState(initialSelectedSchoolYearLabel);
  const [showSchoolYearDropdown, setShowSchoolYearDropdown] = useState(false);
  const [schoolYearMenuAnchor, setSchoolYearMenuAnchor] = useState(null);
  const [showAttendanceModeDropdown, setShowAttendanceModeDropdown] = useState(false);
  const [attendanceModeMenuAnchor, setAttendanceModeMenuAnchor] = useState(null);
  const [attendanceModeConfirmDialog, setAttendanceModeConfirmDialog] = useState({
    visible: false,
    title: '',
    message: '',
  });
  const attendanceModeConfirmResolverRef = useRef(null);
  const schoolYearTriggerRef = useRef(null);
  const attendanceModeTriggerRef = useRef(null);
  const hasHydratedSnapshotRef = useRef(Boolean(initialSnapshot));
  const appliedInitialDataKeyRef = useRef('');
  const normalizedLockedSchoolYearLabel = useMemo(
    () => normalizeSchoolYearLabel(String(lockedSchoolYearLabel || '').trim()),
    [lockedSchoolYearLabel]
  );
  const isSchoolYearLocked = Boolean(normalizedLockedSchoolYearLabel);
  const initialDataSignature = useMemo(
    () => buildPlannerInitialDataSignature(initialData),
    [initialData]
  );
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

  const applySnapshot = useCallback((cached) => {
    if (!cached || typeof cached !== 'object') return false;
    const cachedMode = getAttendanceMode({ academicYearMode: cached.attendanceTrackingMode });
    setAttendanceTrackingMode(cachedMode);
    setTargetScope(resolveTargetScopeForAttendanceMode(cachedMode));
    setGoalMode(cached.goalMode || 'days');
    setTargetDays(cached.targetDays ?? '0');
    setTargetHours(cached.targetHours ?? '0');
    setLearningStartTime(normalizeLearningTimeDisplay(cached.learningStartTime, DEFAULT_LEARNING_START_TIME));
    setLearningEndTime(normalizeLearningTimeDisplay(cached.learningEndTime, DEFAULT_LEARNING_END_TIME));
    setPreferredLearningDayNums(normalizeAllowedWeekdays(cached.preferredLearningDayNums));
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
    hasHydratedSnapshotRef.current = true;
    setLoading(false);
    return true;
  }, [isSchoolYearLocked]);

  useEffect(() => {
    if (!embeddedInModal) return;
    // When caller provides fresh initialData for this open, prefer it over
    // any cached in-session snapshot so fields reflect stored/saved values.
    if (initialData) return;
    const inMemory = plannerSettingsSnapshotCache.get(snapshotCacheKey);
    if (applySnapshot(inMemory)) return;
    const persisted = readPlannerSettingsSessionSnapshot(snapshotCacheKey);
    applySnapshot(persisted);
  }, [embeddedInModal, snapshotCacheKey, applySnapshot, initialData]);

  useEffect(() => {
    const resolvedScope = resolveTargetScopeForAttendanceMode(attendanceTrackingMode);
    if (targetScope !== resolvedScope) {
      setTargetScope(resolvedScope);
    }
  }, [attendanceTrackingMode, targetScope]);

  useEffect(() => {
    stateRef.current = {
      targetScope,
      attendanceTrackingMode,
      goalMode,
      targetDays,
      targetHours,
      learningStartTime,
      learningEndTime,
      preferredLearningDayNums,
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
    const snapshotPayload = {
      targetScope,
      attendanceTrackingMode,
      goalMode,
      targetDays,
      targetHours,
      learningStartTime,
      learningEndTime,
      preferredLearningDayNums,
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
    };
    plannerSettingsSnapshotCache.set(snapshotCacheKey, snapshotPayload);
    writePlannerSettingsSessionSnapshot(snapshotCacheKey, snapshotPayload);
  }, [
    embeddedInModal,
    snapshotCacheKey,
    targetScope,
    attendanceTrackingMode,
    goalMode,
    targetDays,
    targetHours,
    learningStartTime,
    learningEndTime,
    preferredLearningDayNums,
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

  const resetDefaultsWhenNoSubjects = useCallback(async () => {
    if (!familyId || readOnly || resetDefaultsWhenNoSubjectsInFlightRef.current) return;
    resetDefaultsWhenNoSubjectsInFlightRef.current = true;
    try {
      setAttendanceTrackingMode(ATTENDANCE_MODES.CLASS_DAY);
      setTargetScope('overall');
      setGoalMode('days');
      setTargetDays('0');
      const schoolYearStart = `${selectedYearMeta.start}-01-01`;
      const schoolYearEnd = `${selectedYearMeta.end}-12-31`;
      await supabase
        .from('academic_years')
        .update({ attendance_tracking_mode: ATTENDANCE_MODES.CLASS_DAY })
        .eq('family_id', familyId)
        .gte('start_date', schoolYearStart)
        .lte('start_date', schoolYearEnd);
      await saveFamilyPlannerSettings(
        familyId,
        {
          attendance_tracking_mode: ATTENDANCE_MODES.CLASS_DAY,
          target_scope: 'overall',
          default_constraint_mode: 'days',
          default_target_days: 0,
          default_target_hours: 0,
        },
        selectedSchoolYearLabel
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[PlannerSettings] Failed resetting defaults after last subject deletion:', err);
    } finally {
      resetDefaultsWhenNoSubjectsInFlightRef.current = false;
    }
  }, [familyId, readOnly, selectedSchoolYearLabel, selectedYearMeta.end, selectedYearMeta.start]);

  useEffect(() => {
    const seeded = schoolYearRangeDefaults(selectedSchoolYearLabel);
    setDefaultYearStartDate(seeded.yearStart);
    setDefaultYearEndDate(seeded.yearEnd);
    setDefaultFallStartDate(seeded.fallStart);
    setDefaultFallEndDate(seeded.fallEnd);
    setDefaultSpringStartDate(seeded.springStart);
    setDefaultSpringEndDate(seeded.springEnd);
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
    const selectedYearLabel = normalizeSchoolYearLabel(
      isSchoolYearLocked
        ? normalizedLockedSchoolYearLabel
        : (selectedSchoolYearLabel || s.default_school_year)
    );
    const initialDataYearLabel = normalizeSchoolYearLabel(
      s.school_year_label || s.default_school_year
    );
    const initialDataApplyKey = [
      isSchoolYearLocked ? 'locked' : 'unlocked',
      normalizedLockedSchoolYearLabel || '',
      selectedYearLabel || '',
      initialDataYearLabel || '',
      initialDataSignature,
    ].join('::');
    if (appliedInitialDataKeyRef.current === initialDataApplyKey) return;
    appliedInitialDataKeyRef.current = initialDataApplyKey;
    const matchesInitialDataYear = Boolean(
      selectedYearLabel
      && initialDataYearLabel
      && selectedYearLabel === initialDataYearLabel
    );
    const rangeDefaults = schoolYearRangeDefaults(selectedYearLabel);
    const coercedRangeDates = coerceRangeDatesToSchoolYear(s, selectedYearLabel);
    const resolvedMode = getAttendanceMode({
      academicYearMode: matchesInitialDataYear ? s.attendance_tracking_mode : ATTENDANCE_MODES.CLASS_DAY,
      fallback: ATTENDANCE_MODES.CLASS_DAY,
    });
    setAttendanceTrackingMode(resolvedMode);
    setTargetScope(resolveTargetScopeForAttendanceMode(resolvedMode));
    setGoalMode(matchesInitialDataYear ? (s.default_constraint_mode || 'days') : 'days');
    setTargetDays(
      matchesInitialDataYear
        ? (s.default_target_days != null ? String(s.default_target_days) : '0')
        : '0'
    );
    setTargetHours(
      matchesInitialDataYear
        ? (s.default_target_hours != null ? String(s.default_target_hours) : '0')
        : '0'
    );
    setLearningStartTime(
      matchesInitialDataYear
        ? normalizeLearningTimeDisplay(s.default_day_start_time, DEFAULT_LEARNING_START_TIME)
        : normalizeLearningTimeDisplay(DEFAULT_LEARNING_START_TIME, DEFAULT_LEARNING_START_TIME)
    );
    setLearningEndTime(
      matchesInitialDataYear
        ? normalizeLearningTimeDisplay(s.default_day_end_time, DEFAULT_LEARNING_END_TIME)
        : normalizeLearningTimeDisplay(DEFAULT_LEARNING_END_TIME, DEFAULT_LEARNING_END_TIME)
    );
    setPreferredLearningDayNums(
      matchesInitialDataYear
        ? normalizeAllowedWeekdays(s.allowed_weekdays)
        : [...DEFAULT_ALLOWED_WEEKDAYS]
    );
    setFollowGlobalHolidays(matchesInitialDataYear ? s.follow_public_holidays !== false : true);
    if (s.default_school_year && !isSchoolYearLocked) {
      const normalizedDefaultYear = normalizeSchoolYearLabel(String(s.default_school_year));
      setSelectedSchoolYearLabel((prev) => prev || normalizedDefaultYear);
    }
    setDefaultYearStartDate(
      matchesInitialDataYear
        ? (coercedRangeDates.default_year_start_date || rangeDefaults.yearStart)
        : rangeDefaults.yearStart
    );
    setDefaultYearEndDate(
      matchesInitialDataYear
        ? (coercedRangeDates.default_year_end_date || rangeDefaults.yearEnd)
        : rangeDefaults.yearEnd
    );
    setDefaultFallStartDate(
      matchesInitialDataYear
        ? (coercedRangeDates.default_fall_term_start_date || rangeDefaults.fallStart)
        : rangeDefaults.fallStart
    );
    setDefaultFallEndDate(
      matchesInitialDataYear
        ? (coercedRangeDates.default_fall_term_end_date || rangeDefaults.fallEnd)
        : rangeDefaults.fallEnd
    );
    setDefaultSpringStartDate(
      matchesInitialDataYear
        ? (coercedRangeDates.default_spring_term_start_date || rangeDefaults.springStart)
        : rangeDefaults.springStart
    );
    setDefaultSpringEndDate(
      matchesInitialDataYear
        ? (coercedRangeDates.default_spring_term_end_date || rangeDefaults.springEnd)
        : rangeDefaults.springEnd
    );
    const ex = matchesInitialDataYear ? (initialData.exclusions || []) : [];
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
    setExcludedPublicHolidayDates(
      matchesInitialDataYear && Array.isArray(initialData.excluded_holiday_dates)
        ? initialData.excluded_holiday_dates
        : []
    );
    const subjectsList = initialData.subjects || [];
    setSubjects(subjectsList);
    const { subjectTargetsMap, firstActiveTarget } = deriveSubjectTargetState(subjectsList);
    setSubjectTargets(subjectTargetsMap);
    const initialScope = resolveTargetScopeForAttendanceMode(resolvedMode);
    if (matchesInitialDataYear && firstActiveTarget && initialScope === 'per_subject') {
      setGoalMode(firstActiveTarget.mode);
      if (firstActiveTarget.mode === 'days') setTargetDays(firstActiveTarget.days || '0');
      if (firstActiveTarget.mode === 'hours') setTargetHours(firstActiveTarget.hours || '0');
    }
    setLoading(false);
  }, [
    initialData,
    isSchoolYearLocked,
    normalizedLockedSchoolYearLabel,
    selectedSchoolYearLabel,
    initialDataSignature,
  ]);

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
    const requestId = ++loadDefaultsRequestRef.current;
    const requestedSchoolYearLabel = normalizeSchoolYearLabel(
      isSchoolYearLocked
        ? normalizedLockedSchoolYearLabel
        : selectedSchoolYearLabel
    );
    if (!hasHydratedSnapshotRef.current) {
      setLoading(true);
    }
    setError(null);
    try {
      const { settings: s, exclusions: ex, excluded_holiday_dates: excludedDates, error: planErr } = await getPlanDefaultsFromSettings(
        familyId,
        requestedSchoolYearLabel
      );
      if (planErr) throw planErr;
      if (requestId !== loadDefaultsRequestRef.current) return;
      let resolvedYearMode = '';
      let hasAcademicYearRecord = false;
      let resolvedYearId = null;
      try {
        const targetLabel = normalizeSchoolYearLabel(
          isSchoolYearLocked
            ? normalizedLockedSchoolYearLabel
            : (requestedSchoolYearLabel || s?.default_school_year || '')
        );
        const parsedYear = parseSchoolYearLabel(targetLabel);
        if (parsedYear?.start && parsedYear?.end) {
          const minStart = `${parsedYear.start}-01-01`;
          const maxStart = `${parsedYear.end}-12-31`;
          const { data: yearRows } = await supabase
            .from('academic_years')
            .select('id, attendance_tracking_mode, updated_at, start_date')
            .eq('family_id', familyId)
            .gte('start_date', minStart)
            .lte('start_date', maxStart)
            .order('updated_at', { ascending: false })
            .limit(1);
          hasAcademicYearRecord = Array.isArray(yearRows) && yearRows.length > 0;
          resolvedYearId = hasAcademicYearRecord ? String(yearRows[0]?.id || '').trim() || null : null;
          resolvedYearMode = String(
            hasAcademicYearRecord
              ? yearRows[0]?.attendance_tracking_mode
              : ''
          ).trim().toLowerCase();
        }
      } catch (_) {
        resolvedYearMode = '';
      }

      if (s) {
        if (requestId !== loadDefaultsRequestRef.current) return;
        const fallbackYearLabel = isSchoolYearLocked
          ? normalizedLockedSchoolYearLabel
          : (s.default_school_year || requestedSchoolYearLabel);
        const rangeDefaults = schoolYearRangeDefaults(fallbackYearLabel);
        const coercedRangeDates = coerceRangeDatesToSchoolYear(s, fallbackYearLabel);
        const plannerMode = String(s?.attendance_tracking_mode || '').trim();
        const resolvedMode = getAttendanceMode({
          // Planner settings are the source of truth for the selected school year.
          // Fall back to academic-year mode only when planner settings have no mode saved yet.
          academicYearMode: plannerMode ? '' : resolvedYearMode,
          plannerSettingsMode: plannerMode,
          fallback: ATTENDANCE_MODES.CLASS_DAY,
        });
        setAttendanceTrackingMode(resolvedMode);
        setTargetScope(resolveTargetScopeForAttendanceMode(resolvedMode));
        setGoalMode(s.default_constraint_mode || 'days');
        setTargetDays(s.default_target_days != null ? String(s.default_target_days) : '0');
        setTargetHours(s.default_target_hours != null ? String(s.default_target_hours) : '0');
        setLearningStartTime(normalizeLearningTimeDisplay(s.default_day_start_time, DEFAULT_LEARNING_START_TIME));
        setLearningEndTime(normalizeLearningTimeDisplay(s.default_day_end_time, DEFAULT_LEARNING_END_TIME));
        setPreferredLearningDayNums(normalizeAllowedWeekdays(s.allowed_weekdays));
        setFollowGlobalHolidays(s.follow_public_holidays !== false);
        if (s.default_school_year && !isSchoolYearLocked) {
          const normalizedDefaultYear = normalizeSchoolYearLabel(String(s.default_school_year));
          setSelectedSchoolYearLabel((prev) => prev || normalizedDefaultYear);
        }
        setDefaultYearStartDate(coercedRangeDates.default_year_start_date || rangeDefaults.yearStart);
        setDefaultYearEndDate(coercedRangeDates.default_year_end_date || rangeDefaults.yearEnd);
        setDefaultFallStartDate(coercedRangeDates.default_fall_term_start_date || rangeDefaults.fallStart);
        setDefaultFallEndDate(coercedRangeDates.default_fall_term_end_date || rangeDefaults.fallEnd);
        setDefaultSpringStartDate(coercedRangeDates.default_spring_term_start_date || rangeDefaults.springStart);
        setDefaultSpringEndDate(coercedRangeDates.default_spring_term_end_date || rangeDefaults.springEnd);
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
      if (requestId !== loadDefaultsRequestRef.current) return;
      // Load subjects for Subject Targets section
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name, school_year, default_constraint_mode, default_target_days, default_target_hours')
        .eq('family_id', familyId)
        .order('name');
      setSubjects(subjectsData || []);
      const { subjectTargetsMap, firstActiveTarget } = deriveSubjectTargetState(subjectsData || []);
      setSubjectTargets(subjectTargetsMap);
      const initialScope = resolveTargetScopeForAttendanceMode(
        getAttendanceMode({
          academicYearMode: String(s?.attendance_tracking_mode || '').trim() ? '' : resolvedYearMode,
          plannerSettingsMode: s?.attendance_tracking_mode,
          fallback: ATTENDANCE_MODES.CLASS_DAY,
        })
      );
      if (firstActiveTarget && initialScope === 'per_subject') {
        setGoalMode(firstActiveTarget.mode);
        if (firstActiveTarget.mode === 'days') setTargetDays(firstActiveTarget.days || '0');
        if (firstActiveTarget.mode === 'hours') setTargetHours(firstActiveTarget.hours || '0');
      }
      if ((subjectsData || []).length === 0) {
        await resetDefaultsWhenNoSubjects();
      }
    } catch (err) {
      if (requestId !== loadDefaultsRequestRef.current) return;
      setError(err?.message || 'Failed to load planner settings');
    } finally {
      if (requestId === loadDefaultsRequestRef.current) {
        setLoading(false);
      }
    }
  }, [familyId, selectedSchoolYearLabel, isSchoolYearLocked, normalizedLockedSchoolYearLabel]);

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
        if (firstActiveTarget.mode === 'days') setTargetDays(firstActiveTarget.days || '0');
        if (firstActiveTarget.mode === 'hours') setTargetHours(firstActiveTarget.hours || '0');
      }
      if (list.length === 0) {
        await resetDefaultsWhenNoSubjects();
      }
    } catch (_) {
      /* ignore */
    }
  }, [familyId, resetDefaultsWhenNoSubjects]);

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
        const normalizedTargetDays = parsedTargetDays ?? 0;
        const normalizedTargetHours = parsedTargetHours ?? 0;
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
        const resolvedAttendanceMode = getAttendanceMode({ academicYearMode: s.attendanceTrackingMode });
        const resolvedTargetScope = resolveTargetScopeForAttendanceMode(resolvedAttendanceMode);
        const settingsPayload = {
          target_scope: resolvedTargetScope,
          attendance_tracking_mode: resolvedAttendanceMode,
          default_school_year: selectedSchoolYearLabel || null,
          default_constraint_mode: s.goalMode,
          // Persist both values so switching between days/hours preserves prior input.
          default_target_days: normalizedTargetDays,
          default_target_hours: normalizedTargetHours,
          default_planned_hours_per_day: normalizedHoursPerDay,
          default_day_start_time: learningStartSql,
          default_day_end_time: learningEndSql,
          follow_public_holidays: s.followGlobalHolidays,
          holiday_country: s.countryCode,
          holiday_region: s.regionCode ?? null,
          allowed_weekdays: normalizeAllowedWeekdays(s.preferredLearningDayNums),
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
        // Persist per-subject pacing targets from current modal state.
        const subjectTargetEntries = Array.isArray(visibleSubjects)
          ? visibleSubjects.map((subj) => {
            const sid = String(subj?.id || '').trim();
            const target = (s.subjectTargets && typeof s.subjectTargets === 'object') ? s.subjectTargets[sid] : null;
            const mode = String(target?.mode || 'none').trim().toLowerCase();
            const days = mode === 'days' ? parsePositiveIntOrNull(target?.days) : null;
            const hours = mode === 'hours' ? parsePositiveFloatOrNull(target?.hours) : null;
            return { sid, mode, days, hours };
          }).filter((entry) => Boolean(entry?.sid))
          : [];
        if (subjectTargetEntries.length > 0) {
          await Promise.all(subjectTargetEntries.map(async (entry) => {
            const { error: subjectErr } = await supabase
              .from('subject')
              .update({
                default_constraint_mode: entry.mode,
                default_target_days: entry.days,
                default_target_hours: entry.hours,
              })
              .eq('id', entry.sid);
            if (subjectErr) throw subjectErr;
          }));
        }
        showSaved();
        if (embeddedInModal) setHasPendingModalSave(false);
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
    [familyId, onSave, toast, loadDefaults, readOnly, selectedSchoolYearLabel, visibleSubjects, embeddedInModal]
  );

  const queuePersist = useCallback((delayMs = 300) => {
    if (embeddedInModal) {
      setHasPendingModalSave(true);
      return;
    }
    setTimeout(() => {
      persist({});
    }, delayMs);
  }, [embeddedInModal, persist]);

  const respondAttendanceModeConfirm = useCallback((confirmed) => {
    const resolver = attendanceModeConfirmResolverRef.current;
    attendanceModeConfirmResolverRef.current = null;
    setAttendanceModeConfirmDialog((prev) => ({ ...prev, visible: false }));
    if (typeof resolver === 'function') resolver(Boolean(confirmed));
  }, []);

  const confirmAttendanceModeSwitch = useCallback(async ({ fromMode, toMode, isDataRich }) => {
    const title = 'Change attendance style?';
    const baseMessage = 'Changing this setting will update how schedules, attendance, and progress are shown for this school year.';
    const dataRichWarning = isDataRich
      ? '\n\nThis year already has subject-based planning data. Existing subject schedules and progress may be recalculated after this change.'
      : '';
    const message = `${baseMessage}${dataRichWarning}`;
    return new Promise((resolve) => {
      attendanceModeConfirmResolverRef.current = resolve;
      setAttendanceModeConfirmDialog({
        visible: true,
        title,
        message,
      });
    });
  }, []);

  useEffect(() => () => {
    if (typeof attendanceModeConfirmResolverRef.current === 'function') {
      attendanceModeConfirmResolverRef.current(false);
      attendanceModeConfirmResolverRef.current = null;
    }
  }, []);

  const getSelectedYearModeAndRisk = useCallback(async () => {
    const schoolYearStart = `${selectedYearMeta.start}-01-01`;
    const schoolYearEnd = `${selectedYearMeta.end}-12-31`;
    const { data: yearRows } = await supabase
      .from('academic_years')
      .select('id, attendance_tracking_mode, updated_at, start_date')
      .eq('family_id', familyId)
      .gte('start_date', schoolYearStart)
      .lte('start_date', schoolYearEnd)
      .order('updated_at', { ascending: false })
      .limit(1);
    const selectedYear = Array.isArray(yearRows) && yearRows.length > 0 ? yearRows[0] : null;
    const resolvedCurrentMode = getAttendanceMode({
      academicYearMode: selectedYear?.attendance_tracking_mode,
      plannerSettingsMode: attendanceTrackingMode,
    });
    if (!selectedYear?.id) {
      return {
        academicYearId: null,
        currentMode: resolvedCurrentMode,
        has_subject_plan_events: false,
        has_grades_or_outcomes: false,
        has_transcript_artifacts: false,
        is_data_rich: false,
      };
    }
    const academicYearId = selectedYear.id;
    try {
      const routeCandidates = [
        `/api/academic_year/${encodeURIComponent(academicYearId)}/attendance-mode-switch-risk`,
        `/api/academic_year/${encodeURIComponent(academicYearId)}/attendance_mode_switch_risk`,
      ];
      for (const route of routeCandidates) {
        const { data: riskData, error: riskError } = await apiRequest(route);
        if (!riskError && riskData && typeof riskData === 'object') {
          return {
            academicYearId,
            currentMode: resolvedCurrentMode,
            has_subject_plan_events: riskData.has_subject_plan_events === true,
            has_grades_or_outcomes: riskData.has_grades_or_outcomes === true,
            has_transcript_artifacts: riskData.has_transcript_artifacts === true,
            is_data_rich: riskData.is_data_rich === true,
          };
        }
      }
    } catch (_) {
      // Fallback to client-side heuristic for environments without the new API route.
    }

    const { data: subjectPlanEvents } = await supabase
      .from('events')
      .select('id')
      .eq('academic_year_id', academicYearId)
      .eq('generated_by', 'plan_year')
      .eq('event_type', 'Lesson')
      .not('subject_id', 'is', null)
      .is('deleted_at', null)
      .limit(1);
    const hasSubjectPlanEvents = Array.isArray(subjectPlanEvents) && subjectPlanEvents.length > 0;

    const { data: yearEvents } = await supabase
      .from('events')
      .select('id, grade')
      .eq('academic_year_id', academicYearId)
      .is('deleted_at', null)
      .limit(100);
    const eventIds = (yearEvents || []).map((row) => row.id).filter(Boolean);
    const hasGradeOnYearEvents = (yearEvents || []).some((row) => row?.grade != null && String(row.grade).trim() !== '');
    let hasOutcomes = false;
    if (eventIds.length > 0) {
      const { data: outcomeRows } = await supabase
        .from('event_outcomes')
        .select('id')
        .in('event_id', eventIds)
        .limit(1);
      hasOutcomes = Array.isArray(outcomeRows) && outcomeRows.length > 0;
    }

    return {
      academicYearId,
      currentMode: resolvedCurrentMode,
      has_subject_plan_events: hasSubjectPlanEvents,
      has_grades_or_outcomes: hasGradeOnYearEvents || hasOutcomes,
      has_transcript_artifacts: false, // TODO: replace with backend-backed risk check endpoint
      is_data_rich: hasSubjectPlanEvents || hasGradeOnYearEvents || hasOutcomes,
    };
  }, [attendanceTrackingMode, familyId, selectedYearMeta.end, selectedYearMeta.start]);

  const handleAttendanceTrackingModeChange = useCallback(async (mode) => {
    if (readOnly) {
      toast.push('Your family admin has disabled changing planning preferences.', 'error');
      return;
    }
    const normalizedMode = getAttendanceMode({ academicYearMode: mode });
    const previousMode = getAttendanceMode({ academicYearMode: attendanceTrackingMode });
    if (previousMode === normalizedMode) return;
    const confirmed = await confirmAttendanceModeSwitch({
      fromMode: previousMode,
      toMode: normalizedMode,
      isDataRich: false,
    });
    if (!confirmed) return;
    let risk = null;
    try {
      risk = await getSelectedYearModeAndRisk();
    } catch (_) {
      risk = null;
    }
    trackEvent('attendance_mode_switch_confirmed', {
      from_mode: previousMode,
      to_mode: normalizedMode,
      academic_year_id: risk?.academicYearId || null,
      is_data_rich: risk?.is_data_rich === true,
      confirmed,
    });
    if (!confirmed) return;
    try {
      const schoolYearStart = `${selectedYearMeta.start}-01-01`;
      const schoolYearEnd = `${selectedYearMeta.end}-12-31`;
      const { data: updatedRows, error: yearSaveErr } = await supabase
        .from('academic_years')
        .update({ attendance_tracking_mode: normalizedMode })
        .eq('family_id', familyId)
        .gte('start_date', schoolYearStart)
        .lte('start_date', schoolYearEnd)
        .select('id');
      if (yearSaveErr) throw yearSaveErr;
      if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
        throw new Error('No academic year found for the selected school year. Create or load that year before changing attendance mode.');
      }

      const resolvedScope = resolveTargetScopeForAttendanceMode(normalizedMode);
      trackEvent('manual_attendance_mode_change', {
        selectedSchoolYearLabel,
        normalizedMode,
        resolvedScope,
        embeddedInModal,
        lockedSchoolYearLabel: normalizedLockedSchoolYearLabel || null,
      });
      setAttendanceTrackingMode(normalizedMode);
      setTargetScope(resolvedScope);

      const { error: compatSyncError } = await saveFamilyPlannerSettings(
        familyId,
        {
          attendance_tracking_mode: normalizedMode,
          target_scope: resolvedScope,
        },
        selectedSchoolYearLabel
      );
      if (compatSyncError) {
        // Compatibility sync should not block the user once the source-of-truth write succeeds.
        // eslint-disable-next-line no-console
        console.warn('[PlannerSettingsCompat] attendance_tracking_mode sync failed', compatSyncError);
      }

      trackEvent('attendance_mode_selected', {
        mode: normalizedMode,
        academic_year_id: risk?.academicYearId || null,
        source: 'planner_settings',
      });
      showSaved();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('attendanceModeChanged', {
          detail: {
            mode: normalizedMode,
            schoolYearLabel: selectedSchoolYearLabel || null,
          },
        }));
        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }
    } catch (err) {
      toast.push(err?.message || 'Failed to save attendance mode', 'error');
    }
  }, [attendanceTrackingMode, confirmAttendanceModeSwitch, familyId, getSelectedYearModeAndRisk, readOnly, selectedSchoolYearLabel, selectedYearMeta.end, selectedYearMeta.start, toast]);

  const handleGoalChange = (mode) => {
    if (mode === 'days' && parsePositiveIntOrNull(stateRef.current?.targetDays) == null) {
      setTargetDays('0');
    }
    if (mode === 'hours') {
      if (parsePositiveFloatOrNull(stateRef.current?.targetHours) == null) setTargetHours('0');
    }
    stateRef.current = { ...(stateRef.current || {}), goalMode: mode };
    setGoalMode(mode);
    queuePersist(300);
  };
  const handleTargetDaysChange = (v) => {
    stateRef.current = { ...(stateRef.current || {}), targetDays: v };
    setTargetDays(v);
    queuePersist(400);
  };
  const handleTargetHoursChange = (v) => {
    stateRef.current = { ...(stateRef.current || {}), targetHours: v };
    setTargetHours(v);
    queuePersist(400);
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
    stateRef.current = {
      ...(stateRef.current || {}),
      learningStartTime: startDisplay,
      learningEndTime: endDisplay,
    };
    const hoursPerDay = Number(((endMinutes - startMinutes) / 60).toFixed(2));
    if (embeddedInModal) {
      setHasPendingModalSave(true);
    } else {
      persist({
        default_day_start_time: startSql,
        default_day_end_time: endSql,
        default_planned_hours_per_day: hoursPerDay,
      });
    }
    return true;
  }, [persist, toast, embeddedInModal]);
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
    stateRef.current = { ...(stateRef.current || {}), followGlobalHolidays: v };
    setFollowGlobalHolidays(v);
    queuePersist(300);
  };
  const handleRangeDefaultChange = (setter) => (value) => {
    const normalizedValue = normalizeYmd(value);
    setter(normalizedValue);
    // Keep close-save reads aligned with latest date edits.
    if (setter === setDefaultYearStartDate) {
      stateRef.current = { ...(stateRef.current || {}), defaultYearStartDate: normalizedValue };
    } else if (setter === setDefaultYearEndDate) {
      stateRef.current = { ...(stateRef.current || {}), defaultYearEndDate: normalizedValue };
    } else if (setter === setDefaultFallStartDate) {
      stateRef.current = { ...(stateRef.current || {}), defaultFallStartDate: normalizedValue };
    } else if (setter === setDefaultFallEndDate) {
      stateRef.current = { ...(stateRef.current || {}), defaultFallEndDate: normalizedValue };
    } else if (setter === setDefaultSpringStartDate) {
      stateRef.current = { ...(stateRef.current || {}), defaultSpringStartDate: normalizedValue };
    } else if (setter === setDefaultSpringEndDate) {
      stateRef.current = { ...(stateRef.current || {}), defaultSpringEndDate: normalizedValue };
    }
    queuePersist(300);
  };
  const handlePreferredLearningDayToggle = useCallback((dayNum) => {
    if (readOnly) {
      toast.push('Your family admin has disabled changing planning preferences.', 'error');
      return;
    }
    const normalizedDay = Number(dayNum);
    if (!Number.isInteger(normalizedDay) || normalizedDay < 0 || normalizedDay > 6) return;
    setPreferredLearningDayNums((prev) => {
      const current = normalizeAllowedWeekdays(prev);
      const next = current.includes(normalizedDay)
        ? current.filter((day) => day !== normalizedDay)
        : [...current, normalizedDay];
      const normalizedNext = normalizeAllowedWeekdays(next);
      stateRef.current = { ...(stateRef.current || {}), preferredLearningDayNums: normalizedNext };
      queuePersist(300);
      return normalizedNext;
    });
  }, [queuePersist, readOnly, toast]);
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
    queuePersist(300);
  };

  const removeHoliday = (index) => {
    const h = customHolidays[index];
    setCustomHolidays(customHolidays.filter((_, i) => i !== index));
    if (h?.id) {
      deleteExclusion(h.id).catch(() => {});
    }
    queuePersist(300);
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
    queuePersist(300);
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
    queuePersist(300);
  };

  const removeBreak = (index) => {
    const b = customBreaks[index];
    setCustomBreaks(customBreaks.filter((_, i) => i !== index));
    if (b?.id) {
      deleteExclusion(b.id).catch(() => {});
    }
    queuePersist(300);
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
    queuePersist(300);
  };

  const handleSubjectTargetChange = useCallback((subjectId, merged) => {
    setSubjectTargets((prev) => {
      const next = { ...prev, [subjectId]: merged };
      stateRef.current = { ...(stateRef.current || {}), subjectTargets: next };
      return next;
    });
    if (embeddedInModal) {
      setHasPendingModalSave(true);
      return;
    }
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
          const normalizedDays = mode === 'days' ? (parsePositiveIntOrNull(days) ?? 0) : null;
          const normalizedHours = mode === 'hours' ? (parsePositiveFloatOrNull(hours) ?? 0) : null;
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
        onSave?.();
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
  }, [toast, readOnly, familyId, selectedSchoolYearLabel, onSave, embeddedInModal]);

  const handleRequestClose = useCallback(async () => {
    if (embeddedInModal && !readOnly) {
      // Let the latest TextInput change commit before persisting on close.
      await new Promise((resolve) => setTimeout(resolve, 50));
      const ok = await persist({});
      if (!ok) return;
      // Close should reopen from persisted source-of-truth, not stale draft cache.
      plannerSettingsSnapshotCache.delete(snapshotCacheKey);
      clearPlannerSettingsSessionSnapshot(snapshotCacheKey);
    }
    onRequestClose?.();
  }, [embeddedInModal, readOnly, persist, onRequestClose, snapshotCacheKey, hasPendingModalSave]);

  useEffect(() => {
    if (!(embeddedInModal && Platform.OS === 'web' && typeof window !== 'undefined')) return undefined;
    const handleExternalCloseRequest = () => {
      handleRequestClose();
    };
    window.addEventListener('plannerSettingsRequestClose', handleExternalCloseRequest);
    return () => {
      window.removeEventListener('plannerSettingsRequestClose', handleExternalCloseRequest);
    };
  }, [embeddedInModal, handleRequestClose]);

  const sectionStyle = {
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    marginBottom: 0,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  };
  const planningSectionStyle = {
    ...sectionStyle,
    marginTop: 32,
  };
  const planningSectionFirstStyle = {
    marginTop: 18,
  };
  const planningSectionHeaderStyle = {
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 16,
  };
  const planningSectionBodyStyle = {
    paddingTop: 24,
  };
  const planningGridStyle = {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    columnGap: 64,
    rowGap: 22,
    justifyContent: 'flex-start',
  };
  const planningFieldGroupStyle = {
    marginBottom: 20,
  };
  const subjectPacingRowStyle = {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    flexWrap: 'nowrap',
  };
  const daysOffRowStyle = {
    paddingTop: 8,
    paddingBottom: 18,
  };
  const sectionTitleStyle = {
    ...SettingsTypography.sectionTitle,
    color: '#374151',
    marginBottom: 10,
    fontFamily: Platform.OS === 'web' ? '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : undefined,
  };
  const sectionDividerStyle = {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: SettingsLayout.dividerSpacing,
  };
  const sectionFieldLabelStyle = {
    ...SettingsTypography.secondary,
    color: '#6b7280',
    marginBottom: SettingsLayout.labelSpacing,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const sectionDescriptionStyle = {
    ...SettingsTypography.secondary,
    color: '#6b7280',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const mutedMetaTextStyle = {
    fontSize: 14,
    fontWeight: '400',
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const learningDefaultsFieldTitleStyle = {
    ...SettingsTypography.cardTitle,
    color: '#374151',
    marginBottom: SettingsLayout.labelSpacing,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const settingRowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 38,
    marginBottom: 12,
  };
  const settingRowControlStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  };
  const settingRowLabelStyle = {
    ...SettingsTypography.body,
    color: '#111827',
    flexShrink: 1,
    paddingRight: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const compactRangeControlStyle = {
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    backgroundColor: 'transparent',
    paddingVertical: 0,
    paddingHorizontal: 0,
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'flex-start',
  };
  const groupedControlContainerStyle = {
    borderWidth: 1,
    borderColor: '#E3E8EF',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  };
  const compactGroupedControlContainerStyle = {
    ...groupedControlContainerStyle,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  };
  const rangeControlChevronColor = '#C1C9D4';
  const rangeValueFieldStyle = {
    borderWidth: 0,
    backgroundColor: 'transparent',
    paddingVertical: 5,
    paddingHorizontal: 0,
    ...SettingsTypography.body,
    color: '#111827',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const pageTitleStyle = {
    ...SettingsTypography.pageTitle,
    color: '#111827',
    marginBottom: SettingsLayout.dividerSpacing,
    fontFamily: Platform.OS === 'web' ? '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : undefined,
  };
  const chip = (active) => ({
    paddingVertical: embeddedInModal ? 4 : 5,
    paddingHorizontal: embeddedInModal ? 9 : 10,
    borderRadius: 14,
    borderWidth: active ? 1 : 0,
    borderColor: active ? CHIP_SELECTED_BORDER : 'transparent',
    backgroundColor: active ? CHIP_SELECTED_BG : 'rgba(15,23,42,0.05)',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  });
  const chipText = (active) => ({
    fontSize: embeddedInModal ? 12 : 12,
    fontWeight: active ? '600' : '500',
    color: active ? '#334E68' : 'rgba(15,23,42,0.64)',
    fontFamily: Platform.OS === 'web' ? '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' : undefined,
  });
  const inputStyle = {
    borderWidth: 1,
    borderColor: '#E9EEF5',
    borderRadius: 6,
    paddingVertical: embeddedInModal ? 6 : 6,
    paddingHorizontal: embeddedInModal ? 9 : 10,
    fontSize: 13,
    color: TEXT_BLACK,
    minWidth: 56,
    minHeight: 32,
    backgroundColor: '#FFFFFF',
  };
  const modeToggleButtonStyle = (active) => ({
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 62,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: active ? '#6BB3E8' : '#e5e7eb',
    backgroundColor: active ? 'rgba(133,196,242,0.2)' : '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  });
  const modeToggleButtonTextStyle = (active) => ({
    fontSize: 12,
    color: active ? '#6BB3E8' : '#6b7280',
    fontWeight: active ? '700' : '500',
  });
  const attendanceModeSelectTriggerStyle = {
    minHeight: SettingsLayout.rowHeight,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    paddingHorizontal: 16,
    paddingRight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  };
  const attendanceModeSelectTriggerTextStyle = {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const weekdayDotStyle = (active) => ({
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: active ? 'rgba(133,196,242,0.2)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: active ? '#6BB3E8' : '#e5e7eb',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  });
  const weekdayDotLabelStyle = (active) => ({
    fontSize: 12,
    fontWeight: active ? '700' : '500',
    color: active ? '#6BB3E8' : '#6b7280',
  });
  const rowActionButtonsStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  };
  const rowActionButtonStyle = {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 0,
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
    height: 30,
    paddingHorizontal: 0,
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: 'transparent',
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  };
  const addOutlineButtonTextStyle = {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const embeddedTitleRowStyle = {
    position: 'relative',
    minHeight: 34,
    marginBottom: 12,
  };
  const embeddedTitleStyle = {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    paddingRight: 44,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const embeddedCloseButtonStyle = {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  };
  const isPerSubjectAttendanceActive =
    attendanceTrackingMode === ATTENDANCE_MODES.SUBJECT || targetScope === 'per_subject';
  const isClassDayAttendanceActive = !isPerSubjectAttendanceActive;
  const attendanceModeLabel = isPerSubjectAttendanceActive ? 'Per subject' : 'Total class days';
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
        paddingTop: embeddedInModal ? 30 : 0,
      }}
    >
      <View style={{ paddingHorizontal: 0, paddingTop: 0 }}>
        {embeddedInModal ? (
          <View style={embeddedTitleRowStyle}>
            <Text style={embeddedTitleStyle}>Planning Preferences</Text>
            <TouchableOpacity
              onPress={handleRequestClose}
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
        {/* Learning defaults */}
        <View style={[planningSectionStyle, planningSectionFirstStyle]}>
          <View style={planningSectionHeaderStyle}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={[learningDefaultsFieldTitleStyle, { marginBottom: 0 }]}>Learning defaults</Text>
              <Text style={[learningDefaultsFieldTitleStyle, { marginBottom: 0 }]}>•</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {isSchoolYearLocked ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[learningDefaultsFieldTitleStyle, { marginBottom: 0 }]}>
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
                    <Text style={[learningDefaultsFieldTitleStyle, { marginBottom: 0 }]}>
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
          <View style={planningSectionBodyStyle}>
          <View style={planningGridStyle}>
            <View style={{ width: 360, flexGrow: 0, flexShrink: 0 }}>
              <View style={planningFieldGroupStyle}>
                <Text style={learningDefaultsFieldTitleStyle}>School year</Text>
                <View style={[compactGroupedControlContainerStyle, { alignSelf: 'flex-start' }]}>
                  <View style={[compactRangeControlStyle, { width: 'auto', maxWidth: undefined }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <ChevronLeft size={14} color={rangeControlChevronColor} />
                      <PlannerPreferenceDateField
                        value={defaultYearStartDate}
                        onChange={handleRangeDefaultChange(setDefaultYearStartDate)}
                        placeholder="Start"
                        borderColor="transparent"
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={rangeValueFieldStyle}
                        minDate={yearRangeMinYmd}
                        maxDate={yearRangeMaxYmd}
                      />
                    </View>
                    <ArrowRight size={14} color="#CAD2DD" />
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <PlannerPreferenceDateField
                        value={defaultYearEndDate}
                        onChange={handleRangeDefaultChange(setDefaultYearEndDate)}
                        placeholder="End"
                        borderColor="transparent"
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={rangeValueFieldStyle}
                        minDate={yearRangeMinYmd}
                        maxDate={yearRangeMaxYmd}
                      />
                      <ChevronRight size={14} color={rangeControlChevronColor} />
                    </View>
                  </View>
                </View>
              </View>
              <View style={planningFieldGroupStyle}>
                <Text style={learningDefaultsFieldTitleStyle}>Fall term</Text>
                <View style={[compactGroupedControlContainerStyle, { alignSelf: 'flex-start' }]}>
                  <View style={[compactRangeControlStyle, { width: 'auto', maxWidth: undefined }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <ChevronLeft size={14} color={rangeControlChevronColor} />
                      <PlannerPreferenceDateField
                        value={defaultFallStartDate}
                        onChange={handleRangeDefaultChange(setDefaultFallStartDate)}
                        placeholder="Start"
                        borderColor="transparent"
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={rangeValueFieldStyle}
                        minDate={yearRangeMinYmd}
                        maxDate={yearRangeMaxYmd}
                      />
                    </View>
                    <ArrowRight size={14} color="#CAD2DD" />
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <PlannerPreferenceDateField
                        value={defaultFallEndDate}
                        onChange={handleRangeDefaultChange(setDefaultFallEndDate)}
                        placeholder="End"
                        borderColor="transparent"
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={rangeValueFieldStyle}
                        minDate={yearRangeMinYmd}
                        maxDate={yearRangeMaxYmd}
                      />
                      <ChevronRight size={14} color={rangeControlChevronColor} />
                    </View>
                  </View>
                </View>
              </View>
              <View>
                <Text style={learningDefaultsFieldTitleStyle}>Spring term</Text>
                <View style={[compactGroupedControlContainerStyle, { alignSelf: 'flex-start' }]}>
                  <View style={[compactRangeControlStyle, { width: 'auto', maxWidth: undefined }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <ChevronLeft size={14} color={rangeControlChevronColor} />
                      <PlannerPreferenceDateField
                        value={defaultSpringStartDate}
                        onChange={handleRangeDefaultChange(setDefaultSpringStartDate)}
                        placeholder="Start"
                        borderColor="transparent"
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={rangeValueFieldStyle}
                        minDate={yearRangeMinYmd}
                        maxDate={yearRangeMaxYmd}
                      />
                    </View>
                    <ArrowRight size={14} color="#CAD2DD" />
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <PlannerPreferenceDateField
                        value={defaultSpringEndDate}
                        onChange={handleRangeDefaultChange(setDefaultSpringEndDate)}
                        placeholder="End"
                        borderColor="transparent"
                        textColor={TEXT_BLACK}
                        mutedColor="rgba(15,23,42,0.4)"
                        style={rangeValueFieldStyle}
                        minDate={yearRangeMinYmd}
                        maxDate={yearRangeMaxYmd}
                      />
                      <ChevronRight size={14} color={rangeControlChevronColor} />
                    </View>
                  </View>
                </View>
              </View>
            </View>
            <View style={{ width: 320, flexGrow: 0, flexShrink: 0 }}>
              <View style={planningFieldGroupStyle}>
                <Text style={learningDefaultsFieldTitleStyle}>Usual learning days</Text>
                <View style={{ marginTop: 4 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'nowrap', gap: 8, marginBottom: 2, justifyContent: 'flex-start' }}>
                    {LEARNING_DAY_OPTIONS.map((option) => {
                      const active = preferredLearningDayNums.includes(option.id);
                      return (
                        <TouchableOpacity
                          key={`learning-day-${option.id}`}
                          style={weekdayDotStyle(active)}
                          onPress={() => handlePreferredLearningDayToggle(option.id)}
                          activeOpacity={0.85}
                        >
                          <Text style={weekdayDotLabelStyle(active)}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
              <View style={[planningFieldGroupStyle, { marginTop: 4 }]}>
                <Text style={learningDefaultsFieldTitleStyle}>Usual learning hours</Text>
                <View style={[compactGroupedControlContainerStyle, { marginTop: 6, alignSelf: 'flex-start', paddingRight: 6 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' }}>
                    <View style={{ alignItems: 'center' }}>
                      {Platform.OS === 'web' ? (
                        <input
                          type="time"
                          value={learningStartTimeWebValue}
                          onChange={(e) => handleLearningStartTimeWebChange(e.target.value)}
                          style={{
                            backgroundColor: 'transparent',
                            borderWidth: 0,
                            borderStyle: 'none',
                            fontSize: 13,
                            fontWeight: '600',
                            color: '#111827',
                            width: 92,
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
                          style={[inputStyle, {
                            borderWidth: 0,
                            backgroundColor: 'transparent',
                            textAlign: 'center',
                            width: 96,
                            fontWeight: '600',
                          }]}
                        />
                      )}
                    </View>
                    <ArrowRight size={15} color="#B5BFCD" />
                    <View style={{ alignItems: 'center' }}>
                      {Platform.OS === 'web' ? (
                        <input
                          type="time"
                          value={learningEndTimeWebValue}
                          onChange={(e) => handleLearningEndTimeWebChange(e.target.value)}
                          style={{
                            backgroundColor: 'transparent',
                            borderWidth: 0,
                            borderStyle: 'none',
                            fontSize: 13,
                            fontWeight: '600',
                            color: '#111827',
                            width: 92,
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
                          style={[inputStyle, {
                            borderWidth: 0,
                            backgroundColor: 'transparent',
                            textAlign: 'center',
                            width: 96,
                            fontWeight: '600',
                          }]}
                        />
                      )}
                    </View>
                  </View>
                </View>
              </View>
              <View style={{ marginTop: 4 }}>
                <Text style={learningDefaultsFieldTitleStyle}>Attendance tracking</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <TouchableOpacity
                    style={[modeToggleButtonStyle(isClassDayAttendanceActive), { minWidth: 104 }]}
                    onPress={() => handleAttendanceTrackingModeChange('class_day')}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={modeToggleButtonTextStyle(isClassDayAttendanceActive)}>Total class days</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[modeToggleButtonStyle(isPerSubjectAttendanceActive), { minWidth: 96 }]}
                    onPress={() => handleAttendanceTrackingModeChange('subject')}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={modeToggleButtonTextStyle(isPerSubjectAttendanceActive)}>Per subject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
          </View>
        </View>

        {(attendanceTrackingMode === 'class_day' || targetScope === 'per_subject') && (
          <View style={planningSectionStyle}>
            <View style={planningSectionHeaderStyle}>
              <Text style={[learningDefaultsFieldTitleStyle, { marginBottom: 0 }]}>Subject pacing</Text>
            </View>
            <View style={planningSectionBodyStyle}>
            {attendanceTrackingMode === 'class_day' ? (
              <View style={subjectPacingRowStyle}>
                <View style={[settingRowControlStyle, { minWidth: 220, gap: 6, justifyContent: 'flex-start', marginTop: 0 }]}>
                  <Text style={mutedMetaTextStyle}>Total attendance goal:</Text>
                  {goalMode === 'days' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        value={targetDays}
                        onChangeText={handleTargetDaysChange}
                        keyboardType="number-pad"
                        style={[inputStyle, { width: 52 }]}
                        placeholder="180"
                        placeholderTextColor="rgba(15,23,42,0.4)"
                      />
                    </View>
                  )}
                  {goalMode === 'hours' && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <TextInput
                        value={targetHours}
                        onChangeText={handleTargetHoursChange}
                        keyboardType="number-pad"
                        style={[inputStyle, { width: 58 }]}
                        placeholder="1000"
                        placeholderTextColor="rgba(15,23,42,0.4)"
                      />
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity style={modeToggleButtonStyle(goalMode === 'days')} onPress={() => handleGoalChange('days')}>
                      <Text style={modeToggleButtonTextStyle(goalMode === 'days')}>days</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={modeToggleButtonStyle(goalMode === 'hours')} onPress={() => handleGoalChange('hours')}>
                      <Text style={modeToggleButtonTextStyle(goalMode === 'hours')}>hours</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : visibleSubjects.length === 0 ? (
              <View style={[groupedControlContainerStyle, { gap: 10 }]}>
                <Text style={{ fontSize: 13, color: MUTED }}>
                  Add a subject first to set per-subject targets.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {visibleSubjects.map((subj) => {
                  const current = subjectTargets[subj.id] || {};
                  const mode = current.mode === 'hours' ? 'hours' : 'days';
                  const daysValue = mode === 'days' ? String(current.days ?? '') : '';
                  const hoursValue = mode === 'hours' ? String(current.hours ?? '') : '';
                  return (
                    <View
                      key={subj.id}
                      style={subjectPacingRowStyle}
                    >
                      <Text style={[learningDefaultsFieldTitleStyle, { marginBottom: 0, minWidth: 92 }]}>
                        {subj.name || 'Subject'}
                      </Text>
                      <View style={[settingRowControlStyle, { gap: 6, justifyContent: 'flex-start', marginTop: 0 }]}>
                        <Text style={mutedMetaTextStyle}>Total attendance goal:</Text>
                        {mode === 'days' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <TextInput
                              value={daysValue}
                              onChangeText={(v) =>
                                handleSubjectTargetChange(subj.id, {
                                  ...current,
                                  mode: 'days',
                                  days: v,
                                })
                              }
                              keyboardType="number-pad"
                              style={[inputStyle, { width: 54 }]}
                              placeholder="180"
                              placeholderTextColor="rgba(15,23,42,0.4)"
                            />
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <TextInput
                              value={hoursValue}
                              onChangeText={(v) =>
                                handleSubjectTargetChange(subj.id, {
                                  ...current,
                                  mode: 'hours',
                                  hours: v,
                                })
                              }
                              keyboardType="number-pad"
                              style={[inputStyle, { width: 60 }]}
                              placeholder="1000"
                              placeholderTextColor="rgba(15,23,42,0.4)"
                            />
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <TouchableOpacity
                            style={modeToggleButtonStyle(mode === 'days')}
                            onPress={() =>
                              handleSubjectTargetChange(subj.id, {
                                ...current,
                                mode: 'days',
                                days: String(current.days ?? targetDays ?? '0'),
                              })
                            }
                          >
                            <Text style={modeToggleButtonTextStyle(mode === 'days')}>days</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={modeToggleButtonStyle(mode === 'hours')}
                            onPress={() =>
                              handleSubjectTargetChange(subj.id, {
                                ...current,
                                mode: 'hours',
                                hours: String(current.hours ?? targetHours ?? '0'),
                              })
                            }
                          >
                            <Text style={modeToggleButtonTextStyle(mode === 'hours')}>hours</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
            </View>
          </View>
        )}

        {/* Public holidays */}
        <View style={planningSectionStyle}>
          <View style={planningSectionHeaderStyle}>
            <Text style={[sectionTitleStyle, { marginBottom: 0 }]}>Days off</Text>
          </View>
          <View style={planningSectionBodyStyle}>
            <View style={daysOffRowStyle}>
              <View style={{ minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8 }}>
                <Text style={[learningDefaultsFieldTitleStyle, { marginBottom: 0 }]}>U.S. Public Holidays</Text>
                <Switch
                  style={{ alignSelf: 'center' }}
                  value={followGlobalHolidays}
                  onValueChange={handleFollowChange}
                  trackColor={{ false: BORDER, true: '#AECBFA' }}
                  thumbColor={followGlobalHolidays ? '#45A29E' : '#f9fafb'}
                />
              </View>
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
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
                        window.dispatchEvent(new CustomEvent('refreshSubjects'));
                      }
                    }
                    setShowPublicHolidaysPicker(false);
                  }}
                  style={{ marginTop: 16, backgroundColor: ACCENT, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 6, alignSelf: 'flex-end' }}
                  activeOpacity={0.9}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}

        {attendanceModeConfirmDialog.visible && (
          <Modal
            animationType="none"
            transparent
            visible={attendanceModeConfirmDialog.visible}
            onRequestClose={() => respondAttendanceModeConfirm(false)}
          >
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
              activeOpacity={1}
              onPress={() => respondAttendanceModeConfirm(false)}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  width: '100%',
                  maxWidth: 480,
                  padding: 28,
                  borderWidth: 1,
                  borderColor: '#E6EBF2',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: '600',
                      color: '#111827',
                      flex: 1,
                      ...(Platform.OS === 'web' && {
                        fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      }),
                    }}
                  >
                    {attendanceModeConfirmDialog.title}
                  </Text>
                  <TouchableOpacity
                    onPress={() => respondAttendanceModeConfirm(false)}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      backgroundColor: '#F8FAFC',
                      borderWidth: 1,
                      borderColor: '#E6EBF2',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    hitSlop={10}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={16} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <Text
                  style={{
                    fontSize: 15,
                    color: '#475569',
                    lineHeight: 24,
                    marginBottom: 22,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}
                >
                  {attendanceModeConfirmDialog.message}
                </Text>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => respondAttendanceModeConfirm(false)}
                    style={{
                      minWidth: 92,
                      paddingVertical: 10,
                      paddingHorizontal: 18,
                      borderRadius: 8,
                      backgroundColor: '#E5E7EB',
                      borderWidth: 0,
                      borderColor: 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '600',
                        color: '#374151',
                        ...(Platform.OS === 'web' && {
                          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }),
                      }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => respondAttendanceModeConfirm(true)}
                    style={{
                      minWidth: 132,
                      paddingVertical: 10,
                      paddingHorizontal: 22,
                      borderRadius: 8,
                      backgroundColor: '#85C4F2',
                      borderWidth: 0,
                      borderColor: 'transparent',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      ...(Platform.OS === 'web' && {
                        boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
                      }),
                      ...((Platform.OS === 'ios' || Platform.OS === 'android') && {
                        shadowColor: '#85C4F2',
                        shadowOpacity: 0.3,
                        shadowRadius: 6,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 2,
                      }),
                    }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Check size={15} color="#FFFFFF" />
                    <Text
                      style={{
                        fontSize: 15,
                        fontWeight: '600',
                        color: '#FFFFFF',
                        ...(Platform.OS === 'web' && {
                          fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }),
                      }}
                    >
                      Change style
                    </Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        )}

        {showAttendanceModeDropdown && (
          <Modal
            animationType="none"
            transparent
            visible={showAttendanceModeDropdown}
            onRequestClose={() => setShowAttendanceModeDropdown(false)}
          >
            <View style={{ flex: 1 }}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={() => setShowAttendanceModeDropdown(false)}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }}
              />
              <View
                style={{
                  position: 'absolute',
                  top: (attendanceModeMenuAnchor?.y || 140) + (attendanceModeMenuAnchor?.height || 48) + 6,
                  left: attendanceModeMenuAnchor?.x || 220,
                  minWidth: Math.max(attendanceModeMenuAnchor?.width || 0, 180),
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                  borderRadius: 10,
                  backgroundColor: '#FFFFFF',
                  ...(Platform.OS === 'web' && {
                    boxShadow: '0 10px 25px rgba(17, 24, 39, 0.14)',
                  }),
                  ...((Platform.OS === 'ios' || Platform.OS === 'android') && {
                    elevation: 6,
                    shadowColor: '#000',
                    shadowOpacity: 0.12,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 6 },
                  }),
                  overflow: 'hidden',
                }}
              >
                {[
                  { mode: 'class_day', label: 'Total class days' },
                  { mode: 'subject', label: 'Per subject' },
                ].map((option, index, arr) => {
                  const isActive = attendanceTrackingMode === option.mode;
                  return (
                    <TouchableOpacity
                      key={option.mode}
                      onPress={async () => {
                        setShowAttendanceModeDropdown(false);
                        await handleAttendanceTrackingModeChange(option.mode);
                      }}
                      style={{
                        minHeight: 40,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#FFFFFF',
                        borderBottomWidth: index === arr.length - 1 ? 0 : 1,
                        borderBottomColor: '#f3f4f6',
                      }}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          color: isActive ? '#111827' : '#374151',
                          fontWeight: isActive ? '700' : '400',
                          ...(Platform.OS === 'web' && {
                            fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                          }),
                        }}
                      >
                        {option.label}
                      </Text>
                      {isActive ? <Check size={14} color="#111827" /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
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
                  width: Math.max(176, Math.min(220, schoolYearMenuAnchor?.width || 0)),
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
                          minHeight: 40,
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: '#FFFFFF',
                          borderBottomWidth: schoolYearOptions[schoolYearOptions.length - 1] === label ? 0 : 1,
                          borderBottomColor: '#f3f4f6',
                        }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            color: isActive ? '#111827' : '#374151',
                            fontWeight: isActive ? '700' : '400',
                            ...(Platform.OS === 'web' && {
                              fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                            }),
                          }}
                        >
                          {label}
                        </Text>
                        {isActive ? <Check size={14} color="#111827" /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}

        {/* Custom days (single-date exclusions) */}
        <View style={[daysOffRowStyle, { marginTop: 0 }]}>
          <Text style={[learningDefaultsFieldTitleStyle, { marginBottom: 2 }]}>Custom days off</Text>
          <View>
              {visibleCustomHolidays.length === 0 && !addingHoliday ? (
                <Text style={{ fontSize: 13, color: TEXT_BLACK, marginBottom: 8 }}>No custom days yet</Text>
              ) : null}
              {visibleCustomHolidays.map((h, i) => (
                <View key={h.id || i} style={{ marginBottom: 4 }}>
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
                    <View style={[settingRowStyle, { marginBottom: 0 }]}>
                      <Text style={mutedMetaTextStyle}>
                        {h.date} — {h.name}
                      </Text>
                      <View style={rowActionButtonsStyle}>
                        <TouchableOpacity onPress={() => startEditHoliday(h._idx)} style={rowActionButtonStyle} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Pencil size={16} color="#475569" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeHoliday(h._idx)} style={rowActionButtonStyle} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Trash2 size={16} color="#B42318" />
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
                  <TouchableOpacity onPress={addHoliday} style={{ paddingVertical: 8, paddingHorizontal: 14, backgroundColor: ACCENT, borderRadius: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
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
                  <Text style={[addOutlineButtonTextStyle, { color: LINK_PURPLE }]}>+ Add day</Text>
                </TouchableOpacity>
              )}
          </View>
        </View>

        {/* Ranges (date-span exclusions) */}
        <View style={[daysOffRowStyle, { marginTop: 0 }]}>
          <Text style={[learningDefaultsFieldTitleStyle, { marginBottom: 2 }]}>Custom breaks</Text>
          <View>
              {visibleCustomBreaks.length === 0 && !addingBreak ? (
                <Text style={[mutedMetaTextStyle, { marginBottom: 8 }]}>No custom ranges yet</Text>
              ) : null}
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
                    <View style={settingRowStyle}>
                      <Text style={[settingRowLabelStyle, { fontWeight: '400' }]}>
                        {b.start}–{b.end} {b.name}
                      </Text>
                      <View style={rowActionButtonsStyle}>
                        <TouchableOpacity onPress={() => startEditBreak(b._idx)} style={rowActionButtonStyle} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Pencil size={16} color="#475569" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeBreak(b._idx)} style={rowActionButtonStyle} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Trash2 size={16} color="#B42318" />
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
                  <TouchableOpacity onPress={addBreak} style={{ paddingVertical: 8, paddingHorizontal: 14, backgroundColor: ACCENT, borderRadius: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
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
                  <Text style={[addOutlineButtonTextStyle, { color: LINK_PURPLE }]}>+ Add break</Text>
                </TouchableOpacity>
              )}
          </View>
        </View>

        {error && <Text style={{ color: '#DC2626', fontSize: 14, marginTop: 12 }}>{error}</Text>}
      </View>

    </ScrollView>
  );
}
