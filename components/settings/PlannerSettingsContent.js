/**
 * School Year Settings — global default learning days and hours, and attendance.
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
  Platform,
  Modal,
} from 'react-native';
import { Check, X, ChevronLeft, ChevronRight, ChevronDown, CheckCircle, Plus } from 'lucide-react';
import Dropdown from '../ui/Dropdown';
import {
  getFamilyPlannerSettings,
  saveFamilyPlannerSettings,
  getPlanDefaultsFromSettings,
  syncFamilyHolidayBreakExclusions,
} from '../../lib/services/plannerSettingsClient';
import { PLANNING_PREFERENCES_UI, SCHOOL_YEAR_SETTINGS_UI } from '../planner/planningPreferencesUiCopy';
import DayOffCreateModal from '../create/DayOffCreateModal';
import {
  applyDayOffRowToState,
  mergeDayOffRows,
} from '../../lib/create/saveDayOffHelpers';
import { supabase } from '../../lib/supabase';
import { apiRequest } from '../../lib/apiClient';
import { useToast } from '../Toast';
import { PlannerPreferenceDateField } from '../ui/AppCalendarDatePickerModal';
import MaskedTimeInput from '../ui/MaskedTimeInput';
import { LEARNADOODLE_LIGHT_BLUE, comingSoonModalStyles } from '../../theme/comingSoonModalTheme';
import { designTokens } from '../../theme/designTokens';
import { SettingsLayout, SettingsTypography } from './settingsDesignTokens';
import {
  ATTENDANCE_MODES,
  getAttendanceMode,
} from '../../lib/attendanceMode';
import { trackEvent } from '../../lib/analytics';
import { createModalStyles as assignmentModalStyles, ACCENT_TEXT } from '../create/shared/createModalStyles';
import { SectionHeading } from '../create/shared/assignmentFormParts';

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

const formatDayOffDateLabel = (ymd) => {
  if (!ymd) return '';
  const date = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatDayOffRangeLabel = (row) => {
  const startLabel = formatDayOffDateLabel(row?.start);
  if (!row?.end || row.end === row.start) return startLabel;
  return `${startLabel} – ${formatDayOffDateLabel(row.end)}`;
};
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

const normalizeTargetMode = (mode) => (typeof mode === 'string' ? mode.toLowerCase() : '');

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

const shiftSchoolYearLabel = (schoolYearLabel, direction) => {
  const parsed = parseSchoolYearLabel(schoolYearLabel);
  const safeDirection = direction < 0 ? -1 : 1;
  if (!parsed) {
    const now = new Date();
    const start = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return formatSchoolYearLabel(start + safeDirection);
  }
  return formatSchoolYearLabel(parsed.start + safeDirection);
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
      summerStart: '',
      summerEnd: '',
    };
  }
  return {
    yearStart: `${parsed.start}-08-01`,
    yearEnd: `${parsed.end}-05-31`,
    fallStart: `${parsed.start}-08-01`,
    fallEnd: `${parsed.start}-12-31`,
    springStart: `${parsed.end}-01-01`,
    springEnd: `${parsed.end}-05-31`,
    summerStart: `${parsed.end}-06-01`,
    summerEnd: `${parsed.end}-07-31`,
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
      default_summer_term_start_date: defaults.summerStart,
      default_summer_term_end_date: defaults.summerEnd,
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
    default_summer_term_start_date: keepIfYearMatches(settings?.default_summer_term_start_date, parsed.end, defaults.summerStart),
    default_summer_term_end_date: keepIfYearMatches(settings?.default_summer_term_end_date, parsed.end, defaults.summerEnd),
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

const getFallbackSchoolYearOptions = () => {
  const now = new Date();
  const currentStart = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 12 }, (_, idx) => formatSchoolYearLabel(currentStart + idx));
};

const deriveSnapshotCacheKey = (familyId, schoolYearLabel) => {
  const yearLabel = normalizeSchoolYearLabel(schoolYearLabel) || 'current';
  return `${String(familyId || 'unknown')}::${yearLabel}`;
};

const getInitialPlannerSettingsSnapshot = ({
  familyId,
  lockedSchoolYearLabel,
  initialSchoolYearLabel,
}) => {
  const normalizedLocked = normalizeSchoolYearLabel(String(lockedSchoolYearLabel || '').trim());
  const normalizedInitial = normalizeSchoolYearLabel(String(initialSchoolYearLabel || '').trim());
  // Prefer the year actually being opened so repeat opens hydrate with the correct
  // year's cached values immediately (no loading flash).
  const initialYearLabel = normalizedLocked || normalizedInitial || deriveInitialSchoolYearLabel(normalizedLocked);
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
  hideEmbeddedHeader = false,
  onEmbeddedModalActionsReady = null,
  onEmbeddedModalFooterStateChange = null,
  lockedSchoolYearLabel = null,
  initialSchoolYearLabel = null,
  onSchoolYearChange = null,
  pageTitle = null,
  embeddedInFamily = false,
  hidePageTitle = false,
  layoutVariant = 'default',
}) {
  const toast = useToast();
  const initialSnapshot = getInitialPlannerSettingsSnapshot({
    familyId,
    lockedSchoolYearLabel,
    initialSchoolYearLabel,
  });
  const [loading, setLoading] = useState(
    embeddedInModal && !initialData && !initialSnapshot
  );
  const [saving, setSaving] = useState(false);
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [hasPendingModalSave, setHasPendingModalSave] = useState(false);
  const [error, setError] = useState(null);
  const [showNoSubjectsForPerSubjectModal, setShowNoSubjectsForPerSubjectModal] = useState(false);
  const saveTimeoutRef = useRef(null);
  const subjectTargetSaveTimeoutRef = useRef(null);
  const loadDefaultsRequestRef = useRef(0);
  const resetDefaultsWhenNoSubjectsInFlightRef = useRef(false);

  const stateRef = useRef({});
  const initialAttendanceTrackingMode = getAttendanceMode({
    academicYearMode: initialSnapshot?.attendanceTrackingMode,
    fallback: ATTENDANCE_MODES.CLASS_DAY,
  });
  const initialSelectedYearLabelFromSnapshot = normalizeSchoolYearLabel(initialSnapshot?.selectedSchoolYearLabel);
  const normalizedInitialSchoolYearLabel = normalizeSchoolYearLabel(
    String(initialSchoolYearLabel || lockedSchoolYearLabel || '').trim()
  );
  const initialSelectedSchoolYearLabel = initialSelectedYearLabelFromSnapshot || deriveInitialSchoolYearLabel(
    normalizedInitialSchoolYearLabel
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
  const countryCode = 'US';
  const regionCode = null;

  // Custom days & ranges (stored as holiday / break exclusions in API; managed via calendar events)
  const [customHolidays, setCustomHolidays] = useState(
    Array.isArray(initialSnapshot?.customHolidays) ? initialSnapshot.customHolidays : []
  );
  const [customBreaks, setCustomBreaks] = useState(
    Array.isArray(initialSnapshot?.customBreaks) ? initialSnapshot.customBreaks : []
  );
  const [showDayOffModal, setShowDayOffModal] = useState(false);
  const [editingDayOffRow, setEditingDayOffRow] = useState(null);
  const [pendingDayOffDate, setPendingDayOffDate] = useState(null);
  const [defaultYearStartDate, setDefaultYearStartDate] = useState(initialSnapshot?.defaultYearStartDate || '');
  const [defaultYearEndDate, setDefaultYearEndDate] = useState(initialSnapshot?.defaultYearEndDate || '');
  const [defaultFallStartDate, setDefaultFallStartDate] = useState(initialSnapshot?.defaultFallStartDate || '');
  const [defaultFallEndDate, setDefaultFallEndDate] = useState(initialSnapshot?.defaultFallEndDate || '');
  const [defaultSpringStartDate, setDefaultSpringStartDate] = useState(initialSnapshot?.defaultSpringStartDate || '');
  const [defaultSpringEndDate, setDefaultSpringEndDate] = useState(initialSnapshot?.defaultSpringEndDate || '');
  const [defaultSummerStartDate, setDefaultSummerStartDate] = useState(initialSnapshot?.defaultSummerStartDate || '');
  const [defaultSummerEndDate, setDefaultSummerEndDate] = useState(initialSnapshot?.defaultSummerEndDate || '');

  // Subject targets (per-subject defaults)
  const [subjects, setSubjects] = useState(Array.isArray(initialSnapshot?.subjects) ? initialSnapshot.subjects : []);
  const [subjectTargets, setSubjectTargets] = useState(
    initialSnapshot?.subjectTargets && typeof initialSnapshot.subjectTargets === 'object'
      ? initialSnapshot.subjectTargets
      : {}
  ); // { subjectId: { mode, days, hours } }
  const [selectedSchoolYearLabel, setSelectedSchoolYearLabel] = useState(initialSelectedSchoolYearLabel);
  const [schoolYearOptions] = useState(() => getFallbackSchoolYearOptions());
  const [showEmbeddedSchoolYearDropdown, setShowEmbeddedSchoolYearDropdown] = useState(false);
  const embeddedSchoolYearTriggerRef = useRef(null);
  const [showAttendanceModeDropdown, setShowAttendanceModeDropdown] = useState(false);
  const [attendanceModeMenuAnchor, setAttendanceModeMenuAnchor] = useState(null);
  const attendanceModeTriggerRef = useRef(null);
  const hasHydratedSnapshotRef = useRef(Boolean(initialSnapshot));
  const appliedInitialDataKeyRef = useRef('');
  const initialDataRef = useRef(initialData);
  useEffect(() => {
    initialDataRef.current = initialData;
  }, [initialData]);
  const normalizedLockedSchoolYearLabel = useMemo(
    () => normalizeSchoolYearLabel(String(lockedSchoolYearLabel || '').trim()),
    [lockedSchoolYearLabel]
  );
  const isSchoolYearLocked = Boolean(normalizedLockedSchoolYearLabel) && !embeddedInModal;
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
  }, [isSchoolYearLocked, normalizedLockedSchoolYearLabel, selectedSchoolYearLabel]);

  const prevInitialSchoolYearLabelRef = useRef(normalizedInitialSchoolYearLabel);
  useEffect(() => {
    if (!embeddedInModal || !normalizedInitialSchoolYearLabel) return;
    const prev = prevInitialSchoolYearLabelRef.current;
    prevInitialSchoolYearLabelRef.current = normalizedInitialSchoolYearLabel;
    if (normalizedInitialSchoolYearLabel === prev) return;
    appliedInitialDataKeyRef.current = '';
    setSelectedSchoolYearLabel(normalizedInitialSchoolYearLabel);
  }, [embeddedInModal, normalizedInitialSchoolYearLabel]);

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
    setDefaultSummerStartDate(cached.defaultSummerStartDate || '');
    setDefaultSummerEndDate(cached.defaultSummerEndDate || '');
    setSubjects(Array.isArray(cached.subjects) ? cached.subjects : []);
    setSubjectTargets(cached.subjectTargets && typeof cached.subjectTargets === 'object' ? cached.subjectTargets : {});
    hasHydratedSnapshotRef.current = true;
    setLoading(false);
    return true;
  }, [isSchoolYearLocked]);

  useEffect(() => {
    // When caller provides fresh initialData, prefer it over cached snapshots.
    if (initialData) return;
    const inMemory = plannerSettingsSnapshotCache.get(snapshotCacheKey);
    if (applySnapshot(inMemory)) return;
    const persisted = readPlannerSettingsSessionSnapshot(snapshotCacheKey);
    applySnapshot(persisted);
  }, [snapshotCacheKey, applySnapshot, initialData]);

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
      defaultSummerStartDate,
      defaultSummerEndDate,
    };
  });

  useEffect(() => {
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
      defaultSummerStartDate,
      defaultSummerEndDate,
      subjects: Array.isArray(subjects) ? [...subjects] : [],
      subjectTargets: subjectTargets && typeof subjectTargets === 'object' ? { ...subjectTargets } : {},
      selectedSchoolYearLabel,
    };
    plannerSettingsSnapshotCache.set(snapshotCacheKey, snapshotPayload);
    writePlannerSettingsSessionSnapshot(snapshotCacheKey, snapshotPayload);
  }, [
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
    defaultSummerStartDate,
    defaultSummerEndDate,
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
    setDefaultSummerStartDate(seeded.summerStart);
    setDefaultSummerEndDate(seeded.summerEnd);
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

  const dayOffRows = useMemo(
    () => mergeDayOffRows(customHolidays, customBreaks),
    [customHolidays, customBreaks]
  );

  useEffect(() => {
    if (!familyId || !selectedSchoolYearLabel || readOnly || isSchoolYearLocked || embeddedInModal) return;
    const normalizedYear = normalizeSchoolYearLabel(selectedSchoolYearLabel);
    saveFamilyPlannerSettings(familyId, { default_school_year: normalizedYear }, normalizedYear).catch(() => {});
  }, [familyId, selectedSchoolYearLabel, readOnly, isSchoolYearLocked, embeddedInModal]);

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
    setDefaultSummerStartDate(
      matchesInitialDataYear
        ? (coercedRangeDates.default_summer_term_start_date || rangeDefaults.summerStart)
        : rangeDefaults.summerStart
    );
    setDefaultSummerEndDate(
      matchesInitialDataYear
        ? (coercedRangeDates.default_summer_term_end_date || rangeDefaults.summerEnd)
        : rangeDefaults.summerEnd
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
      if (cancelled) return;
      if (isSchoolYearLocked) {
        setSelectedSchoolYearLabel(normalizedLockedSchoolYearLabel);
        return;
      }
      if (!selectedSchoolYearLabel) {
        setSelectedSchoolYearLabel(currentSchoolYearLabel);
      }
    };
    loadSchoolYears();
    return () => {
      cancelled = true;
    };
  }, [selectedSchoolYearLabel, isSchoolYearLocked, normalizedLockedSchoolYearLabel, currentSchoolYearLabel]);

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
    if (embeddedInModal && !hasHydratedSnapshotRef.current) {
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
      const preloadedYearLabel = normalizeSchoolYearLabel(
        initialDataRef.current?.settings?.school_year_label
        || initialDataRef.current?.settings?.default_school_year
      );
      if (
        initialDataRef.current
        && preloadedYearLabel
        && requestedSchoolYearLabel === preloadedYearLabel
      ) {
        return;
      }
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
        setDefaultSummerStartDate(coercedRangeDates.default_summer_term_start_date || rangeDefaults.summerStart);
        setDefaultSummerEndDate(coercedRangeDates.default_summer_term_end_date || rangeDefaults.summerEnd);
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
        toast.push('Your family admin has disabled changing school year settings.', 'error');
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
        const summerStart = normalizeYmd(s.defaultSummerStartDate);
        const summerEnd = normalizeYmd(s.defaultSummerEndDate);
        if ((yearStart && !yearEnd) || (!yearStart && yearEnd)) {
          throw new Error('Set both year start and year end (or clear both).');
        }
        if ((fallStart && !fallEnd) || (!fallStart && fallEnd)) {
          throw new Error('Set both fall term start and end (or clear both).');
        }
        if ((springStart && !springEnd) || (!springStart && springEnd)) {
          throw new Error('Set both spring term start and end (or clear both).');
        }
        if ((summerStart && !summerEnd) || (!summerStart && summerEnd)) {
          throw new Error('Set both summer range start and end (or clear both).');
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
        if (summerStart && summerEnd && summerStart > summerEnd) {
          throw new Error('Summer range end must be on or after summer range start.');
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
          default_summer_term_start_date: summerStart || null,
          default_summer_term_end_date: summerEnd || null,
          ...updates,
        };
        const { error: settingsErr } = await saveFamilyPlannerSettings(familyId, settingsPayload, selectedSchoolYearLabel);
        if (settingsErr) throw settingsErr;
        const syncResult = await syncFamilyHolidayBreakExclusions(
          familyId,
          s.customHolidays,
          s.customBreaks,
          selectedSchoolYearLabel
        );
        if (syncResult?.error) throw syncResult.error;
        const syncedCustomHolidays = Array.isArray(syncResult?.customHolidays)
          ? syncResult.customHolidays
          : (Array.isArray(s.customHolidays) ? s.customHolidays : []);
        const syncedCustomBreaks = Array.isArray(syncResult?.customBreaks)
          ? syncResult.customBreaks
          : (Array.isArray(s.customBreaks) ? s.customBreaks : []);
        setCustomHolidays(syncedCustomHolidays);
        setCustomBreaks(syncedCustomBreaks);
        stateRef.current = {
          ...(stateRef.current || {}),
          customHolidays: syncedCustomHolidays,
          customBreaks: syncedCustomBreaks,
        };
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
        onSave?.();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
          window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
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
    [familyId, onSave, toast, readOnly, selectedSchoolYearLabel, visibleSubjects, embeddedInModal]
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
      toast.push('Your family admin has disabled changing school year settings.', 'error');
      return;
    }
    const normalizedMode = getAttendanceMode({ academicYearMode: mode });
    const previousMode = getAttendanceMode({ academicYearMode: attendanceTrackingMode });
    if (previousMode === normalizedMode) return;

    if (normalizedMode === ATTENDANCE_MODES.SUBJECT && visibleSubjects.length === 0) {
      setShowNoSubjectsForPerSubjectModal(true);
      return;
    }

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
      confirmed: true,
    });
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
        if (normalizedMode === ATTENDANCE_MODES.SUBJECT) {
          setShowNoSubjectsForPerSubjectModal(true);
          return;
        }
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
  }, [attendanceTrackingMode, familyId, getSelectedYearModeAndRisk, readOnly, selectedSchoolYearLabel, selectedYearMeta.end, selectedYearMeta.start, toast, visibleSubjects]);

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

  const openAddDayOffModal = useCallback((date = null) => {
    if (readOnly) return;
    setEditingDayOffRow(null);
    setPendingDayOffDate(date ? new Date(date) : null);
    setShowDayOffModal(true);
  }, [readOnly]);

  const openEditDayOffModal = useCallback((row) => {
    if (readOnly || !row) return;
    setEditingDayOffRow(row);
    setPendingDayOffDate(null);
    setShowDayOffModal(true);
  }, [readOnly]);

  const closeDayOffModal = useCallback(() => {
    setShowDayOffModal(false);
    setEditingDayOffRow(null);
    setPendingDayOffDate(null);
  }, []);

  const handleDayOffSaved = useCallback((savedRow, previousRow) => {
    const next = applyDayOffRowToState(customHolidays, customBreaks, savedRow, previousRow);
    setCustomHolidays(next.customHolidays);
    setCustomBreaks(next.customBreaks);
    stateRef.current = {
      ...(stateRef.current || {}),
      customHolidays: next.customHolidays,
      customBreaks: next.customBreaks,
    };
  }, [customHolidays, customBreaks]);

  const handleDayOffDeleted = useCallback((deletedRow) => {
    const next = applyDayOffRowToState(customHolidays, customBreaks, null, deletedRow);
    setCustomHolidays(next.customHolidays);
    setCustomBreaks(next.customBreaks);
    stateRef.current = {
      ...(stateRef.current || {}),
      customHolidays: next.customHolidays,
      customBreaks: next.customBreaks,
    };
  }, [customHolidays, customBreaks]);

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
    } else if (setter === setDefaultSummerStartDate) {
      stateRef.current = { ...(stateRef.current || {}), defaultSummerStartDate: normalizedValue };
    } else if (setter === setDefaultSummerEndDate) {
      stateRef.current = { ...(stateRef.current || {}), defaultSummerEndDate: normalizedValue };
    }
    queuePersist(300);
  };
  const handlePreferredLearningDayToggle = useCallback((dayNum) => {
    if (readOnly) {
      toast.push('Your family admin has disabled changing school year settings.', 'error');
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
        toast.push('Your family admin has disabled changing school year settings.', 'error');
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
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
        }
      } catch (err) {
        toast.push(err?.message || 'Failed to save', 'error');
      } finally {
        setSaving(false);
      }
    }, 400);
  }, [toast, readOnly, familyId, selectedSchoolYearLabel, onSave, embeddedInModal]);

  const handleDiscardAndClose = useCallback(() => {
    plannerSettingsSnapshotCache.delete(snapshotCacheKey);
    clearPlannerSettingsSessionSnapshot(snapshotCacheKey);
    onRequestClose?.();
  }, [onRequestClose, snapshotCacheKey]);

  const handleModalSave = useCallback(async () => {
    if (readOnly) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
    const ok = await persist({});
    if (ok) onRequestClose?.();
  }, [persist, onRequestClose, readOnly]);

  const handleRequestClose = handleDiscardAndClose;
  const lastEmbeddedFooterStateRef = useRef({ saving: null, readOnly: null });
  const handleModalSaveRef = useRef(handleModalSave);
  const handleDiscardAndCloseRef = useRef(handleDiscardAndClose);
  handleModalSaveRef.current = handleModalSave;
  handleDiscardAndCloseRef.current = handleDiscardAndClose;

  useEffect(() => {
    if (!(embeddedInModal && hideEmbeddedHeader) || typeof onEmbeddedModalActionsReady !== 'function') return undefined;
    onEmbeddedModalActionsReady({
      handleSave: (...args) => handleModalSaveRef.current?.(...args),
      handleCancel: (...args) => handleDiscardAndCloseRef.current?.(...args),
    });
  }, [embeddedInModal, hideEmbeddedHeader, onEmbeddedModalActionsReady]);

  useEffect(() => {
    if (!(embeddedInModal && hideEmbeddedHeader) || typeof onEmbeddedModalFooterStateChange !== 'function') {
      return undefined;
    }
    const last = lastEmbeddedFooterStateRef.current;
    if (last.saving === saving && last.readOnly === readOnly) {
      return undefined;
    }
    lastEmbeddedFooterStateRef.current = { saving, readOnly };
    onEmbeddedModalFooterStateChange({ saving, readOnly });
  }, [embeddedInModal, hideEmbeddedHeader, onEmbeddedModalFooterStateChange, saving, readOnly]);

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

  const useTwoColumnModalLayout =
    (embeddedInModal && hideEmbeddedHeader) || layoutVariant === 'settings';

  const usePlainSettingsSections =
    layoutVariant === 'settings' && !embeddedInModal && !useTwoColumnModalLayout;
  const sectionStyle = {
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    marginBottom: 0,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent',
  };
  const sectionBucketStyle = usePlainSettingsSections
    ? {
        width: '100%',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 0,
        paddingTop: 24,
        paddingBottom: 24,
        marginBottom: 0,
        borderWidth: 0,
        borderRadius: 0,
        overflow: 'visible',
        ...(Platform.OS === 'web' && !embeddedInModal && {
          maxWidth: 680,
          alignSelf: 'flex-start',
        }),
      }
    : {
        width: '100%',
        borderWidth: 1,
        borderColor: '#EEF1F6',
        borderRadius: 18,
        backgroundColor: '#F8F9FC',
        paddingHorizontal: 18,
        paddingTop: 18,
        paddingBottom: 18,
        marginBottom: 8,
        overflow: 'hidden',
        ...(Platform.OS === 'web' && !embeddedInModal && {
          maxWidth: 680,
          alignSelf: 'flex-start',
        }),
        ...(Platform.OS === 'web' && embeddedInModal && {
          alignSelf: 'stretch',
        }),
      };
  const sectionBucketFirstStyle = {
    marginTop: 0,
    ...(usePlainSettingsSections ? { paddingTop: 0 } : {}),
  };
  const sectionBucketDividerStyle = {
    height: 1,
    backgroundColor: '#e5e7eb',
    width: '100%',
    ...(Platform.OS === 'web' && !embeddedInModal && {
      maxWidth: 680,
      alignSelf: 'flex-start',
    }),
  };
  const sectionBucketTitleStyle = {
    fontSize: 15,
    fontWeight: '800',
    color: '#2B3345',
    marginBottom: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const formStackStyle = {
    width: '100%',
    gap: 16,
  };
  const formFieldStyle = {
    width: '100%',
  };
  const formFieldLabelStyle = {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 6,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  };
  const dateTimeInlineRow = {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    marginBottom: 0,
    gap: 12,
  };
  const scheduleColumn = {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: Platform.OS === 'web' ? 200 : '46%',
    minWidth: Platform.OS === 'web' ? 200 : 140,
    marginBottom: 4,
    ...(Platform.OS === 'web' ? { maxWidth: 240 } : {}),
  };
  const scheduleDateFieldStyle = {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    paddingHorizontal: 10,
    minHeight: 40,
    minWidth: 120,
    alignSelf: 'flex-start',
  };
  const chipRowStyle = {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  };
  const subjectPacingRowStyle = {
    minHeight: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
    flexWrap: 'nowrap',
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
    maxWidth: '100%',
    alignSelf: 'stretch',
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
  const pageYearNavRowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  };
  const pageYearNavChevronsStyle = {
    flexDirection: 'row',
    alignItems: 'center',
  };
  const pageYearNavBtnStyle = {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  };
  const pageYearNavTitleGroupStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  };
  const pageYearNavTitleButtonStyle = {
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  };
  const pageYearNavTitleButtonDisabledStyle = {
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  };
  const pageYearNavTitleStyle = {
    fontSize: 26,
    fontWeight: '600',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    minHeight: 36,
    minWidth: 72,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: active ? '#6BB3E8' : '#e5e7eb',
    backgroundColor: active ? 'rgba(133,196,242,0.2)' : '#FFFFFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  });
  const modeToggleButtonTextStyle = (active) => ({
    fontSize: 14,
    lineHeight: 18,
    color: active ? '#6BB3E8' : '#6b7280',
    fontWeight: active ? '600' : '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    ...modeToggleButtonStyle(active),
    minWidth: 48,
  });
  const weekdayDotLabelStyle = (active) => ({
    ...modeToggleButtonTextStyle(active),
  });
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
  const schoolYearHeaderLabel = selectedSchoolYearLabel
    ? `${selectedSchoolYearLabel} School Year`
    : 'School Year';
  const isAtCurrentSchoolYear =
    normalizeSchoolYearLabel(selectedSchoolYearLabel) === currentSchoolYearLabel;
  const canShiftSchoolYear = !isSchoolYearLocked && !readOnly;

  const shiftSelectedSchoolYear = useCallback((direction) => {
    if (!canShiftSchoolYear) return;
    setSelectedSchoolYearLabel((prev) =>
      shiftSchoolYearLabel(prev || currentSchoolYearLabel, direction)
    );
  }, [canShiftSchoolYear, currentSchoolYearLabel]);

  const jumpToCurrentSchoolYear = useCallback(() => {
    if (!canShiftSchoolYear || isAtCurrentSchoolYear) return;
    setSelectedSchoolYearLabel(currentSchoolYearLabel);
  }, [canShiftSchoolYear, isAtCurrentSchoolYear, currentSchoolYearLabel]);

  const handleEmbeddedSchoolYearSelect = useCallback((nextLabel) => {
    if (readOnly) return;
    const normalized = normalizeSchoolYearLabel(nextLabel);
    if (!normalized || normalized === normalizeSchoolYearLabel(selectedSchoolYearLabel)) {
      setShowEmbeddedSchoolYearDropdown(false);
      return;
    }
    appliedInitialDataKeyRef.current = '';
    hasHydratedSnapshotRef.current = false;
    setSelectedSchoolYearLabel(normalized);
    setShowEmbeddedSchoolYearDropdown(false);
    onSchoolYearChange?.(normalized);
  }, [readOnly, selectedSchoolYearLabel, onSchoolYearChange]);

  const fieldWrapStyle = useTwoColumnModalLayout ? assignmentModalStyles.formGroup : formFieldStyle;
  const modalFieldLabelStyle = useTwoColumnModalLayout ? assignmentModalStyles.fieldLabel : formFieldLabelStyle;
  const modalFormStackStyle = useTwoColumnModalLayout ? { width: '100%' } : formStackStyle;
  const modalCompactDateWidth = Platform.OS === 'web' ? 148 : 140;
  const modalCompactTimeWidth = Platform.OS === 'web' ? 120 : 116;
  const modalDateColumnStyle = useTwoColumnModalLayout
    ? {
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 'auto',
        width: modalCompactDateWidth,
        maxWidth: modalCompactDateWidth,
      }
    : scheduleColumn;
  const modalTimeColumnStyle = useTwoColumnModalLayout
    ? {
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 'auto',
        width: modalCompactTimeWidth,
        maxWidth: modalCompactTimeWidth,
      }
    : scheduleColumn;
  const modalDateTimeRowStyle = useTwoColumnModalLayout
    ? {
        ...assignmentModalStyles.dateTimeInlineRow,
        alignItems: 'flex-end',
      }
    : dateTimeInlineRow;
  const modalScheduleDateFieldStyle = useTwoColumnModalLayout
    ? {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        backgroundColor: '#ffffff',
        paddingVertical: 10,
        paddingHorizontal: 12,
        minHeight: 40,
        width: modalCompactDateWidth,
        maxWidth: modalCompactDateWidth,
        alignSelf: 'flex-start',
        fontSize: 14,
      }
    : scheduleDateFieldStyle;
  const modalInputStyle = useTwoColumnModalLayout
    ? {
        ...inputStyle,
        minHeight: 40,
        fontSize: 14,
        borderRadius: 12,
        paddingVertical: 8,
        paddingHorizontal: 12,
        minWidth: 0,
      }
    : inputStyle;
  const modalSelectTriggerStyle = useTwoColumnModalLayout
    ? {
        ...attendanceModeSelectTriggerStyle,
        minHeight: 40,
        width: modalCompactDateWidth,
        maxWidth: modalCompactDateWidth,
        alignSelf: 'flex-start',
        backgroundColor: '#ffffff',
      }
    : attendanceModeSelectTriggerStyle;
  const modalTimeInputWrap = useTwoColumnModalLayout
    ? {
        width: modalCompactTimeWidth,
        maxWidth: modalCompactTimeWidth,
        alignSelf: 'flex-start',
      }
    : undefined;
  const modalModeToggleStyle = (active) => ({
    ...modeToggleButtonStyle(active),
  });
  const modalModeToggleTextStyle = (active) => modeToggleButtonTextStyle(active);
  const modalWeekdayDotStyle = (active) => weekdayDotStyle(active);
  const modalWeekdayDotLabelStyle = (active) => weekdayDotLabelStyle(active);
  const modalMutedMetaStyle = useTwoColumnModalLayout
    ? assignmentModalStyles.fieldHint
    : mutedMetaTextStyle;

  const renderDateRangeField = (label, startValue, onStartChange, endValue, onEndChange) => {
    if (useTwoColumnModalLayout) {
      return (
        <View style={fieldWrapStyle}>
          <Text style={modalFieldLabelStyle}>{`${label} start/end`}</Text>
          <View style={modalDateTimeRowStyle}>
            <View style={modalDateColumnStyle}>
              <PlannerPreferenceDateField
                value={startValue}
                onChange={onStartChange}
                placeholder="Start"
                borderColor="#e5e7eb"
                textColor={TEXT_BLACK}
                mutedColor="rgba(15,23,42,0.4)"
                style={modalScheduleDateFieldStyle}
                width={modalCompactDateWidth}
                minDate={yearRangeMinYmd}
                maxDate={yearRangeMaxYmd}
              />
            </View>
            <View style={modalDateColumnStyle}>
              <PlannerPreferenceDateField
                value={endValue}
                onChange={onEndChange}
                placeholder="End"
                borderColor="#e5e7eb"
                textColor={TEXT_BLACK}
                mutedColor="rgba(15,23,42,0.4)"
                style={modalScheduleDateFieldStyle}
                width={modalCompactDateWidth}
                minDate={yearRangeMinYmd}
                maxDate={yearRangeMaxYmd}
              />
            </View>
          </View>
        </View>
      );
    }

    return (
      <View style={fieldWrapStyle}>
        <Text style={modalFieldLabelStyle}>{label}</Text>
        <View style={modalDateTimeRowStyle}>
          <View style={modalDateColumnStyle}>
            <Text style={modalFieldLabelStyle}>Start date</Text>
            <PlannerPreferenceDateField
              value={startValue}
              onChange={onStartChange}
              placeholder="Start"
              borderColor="#e5e7eb"
              textColor={TEXT_BLACK}
              mutedColor="rgba(15,23,42,0.4)"
              style={modalScheduleDateFieldStyle}
              minDate={yearRangeMinYmd}
              maxDate={yearRangeMaxYmd}
            />
          </View>
          <View style={modalDateColumnStyle}>
            <Text style={modalFieldLabelStyle}>End date</Text>
            <PlannerPreferenceDateField
              value={endValue}
              onChange={onEndChange}
              placeholder="End"
              borderColor="#e5e7eb"
              textColor={TEXT_BLACK}
              mutedColor="rgba(15,23,42,0.4)"
              style={modalScheduleDateFieldStyle}
              minDate={yearRangeMinYmd}
              maxDate={yearRangeMaxYmd}
            />
          </View>
        </View>
      </View>
    );
  };

  const learningDaysForm = (
    <View style={modalFormStackStyle}>
      {embeddedInModal && !readOnly ? (
        <View style={fieldWrapStyle}>
          <Text style={modalFieldLabelStyle}>School year</Text>
          <TouchableOpacity
            ref={embeddedSchoolYearTriggerRef}
            style={modalSelectTriggerStyle}
            onPress={() => setShowEmbeddedSchoolYearDropdown((open) => !open)}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={attendanceModeSelectTriggerTextStyle}>
              {selectedSchoolYearLabel || 'Select…'}
            </Text>
            <ChevronDown size={16} color="#6b7280" />
          </TouchableOpacity>
          <Dropdown
            visible={showEmbeddedSchoolYearDropdown}
            triggerRef={embeddedSchoolYearTriggerRef}
            onClose={() => setShowEmbeddedSchoolYearDropdown(false)}
            placement="bottom-start"
            matchTriggerWidth
            maxHeight={220}
          >
            {schoolYearOptions.map((option) => {
              const selected = option === selectedSchoolYearLabel;
              return (
                <TouchableOpacity
                  key={option}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                    backgroundColor: selected ? 'rgba(133,196,242,0.12)' : 'transparent',
                    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
                  }}
                  onPress={() => handleEmbeddedSchoolYearSelect(option)}
                >
                  <Text style={{
                    fontSize: 14,
                    color: selected ? '#6BB3E8' : TEXT_BLACK,
                    fontWeight: selected ? '600' : '400',
                  }}
                  >
                    {option}
                  </Text>
                  {selected ? <CheckCircle size={16} color="#6BB3E8" /> : null}
                </TouchableOpacity>
              );
            })}
          </Dropdown>
        </View>
      ) : null}
      {renderDateRangeField(
        'Fall term',
        defaultFallStartDate,
        handleRangeDefaultChange(setDefaultFallStartDate),
        defaultFallEndDate,
        handleRangeDefaultChange(setDefaultFallEndDate),
      )}
      {renderDateRangeField(
        'Spring term',
        defaultSpringStartDate,
        handleRangeDefaultChange(setDefaultSpringStartDate),
        defaultSpringEndDate,
        handleRangeDefaultChange(setDefaultSpringEndDate),
      )}
      {renderDateRangeField(
        'Summer range',
        defaultSummerStartDate,
        handleRangeDefaultChange(setDefaultSummerStartDate),
        defaultSummerEndDate,
        handleRangeDefaultChange(setDefaultSummerEndDate),
      )}
      <View style={fieldWrapStyle}>
        <Text style={modalFieldLabelStyle}>{SCHOOL_YEAR_SETTINGS_UI.sections.defaultLearningDays}</Text>
        <View style={chipRowStyle}>
          {LEARNING_DAY_OPTIONS.map((option) => {
            const active = preferredLearningDayNums.includes(option.id);
            return (
              <TouchableOpacity
                key={`learning-day-${option.id}`}
                style={modalWeekdayDotStyle(active)}
                onPress={() => handlePreferredLearningDayToggle(option.id)}
                activeOpacity={0.85}
              >
                <Text style={modalWeekdayDotLabelStyle(active)}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={fieldWrapStyle}>
        <Text style={modalFieldLabelStyle}>
          {useTwoColumnModalLayout
            ? `${SCHOOL_YEAR_SETTINGS_UI.sections.defaultLearningHours} start/end`
            : SCHOOL_YEAR_SETTINGS_UI.sections.defaultLearningHours}
        </Text>
        <View style={modalDateTimeRowStyle}>
          <View style={modalTimeColumnStyle}>
            {!useTwoColumnModalLayout ? (
              <Text style={modalFieldLabelStyle}>Start time</Text>
            ) : null}
            <MaskedTimeInput
              wrapStyle={modalTimeInputWrap}
              value={learningStartTime}
              onChangeText={setLearningStartTime}
              onBlur={(nextValue) => persistLearningTimes(nextValue, learningEndTime)}
              placeholder="8:00 AM"
            />
          </View>
          <View style={modalTimeColumnStyle}>
            {!useTwoColumnModalLayout ? (
              <Text style={modalFieldLabelStyle}>End time</Text>
            ) : null}
            <MaskedTimeInput
              wrapStyle={modalTimeInputWrap}
              value={learningEndTime}
              onChangeText={setLearningEndTime}
              onBlur={(nextValue) => persistLearningTimes(learningStartTime, nextValue)}
              placeholder="4:00 PM"
            />
          </View>
        </View>
      </View>
      <View style={fieldWrapStyle}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
        >
          <Text style={modalFieldLabelStyle}>{SCHOOL_YEAR_SETTINGS_UI.sections.daysOff}</Text>
          {!readOnly ? (
            <TouchableOpacity
              onPress={() => openAddDayOffModal()}
              style={[assignmentModalStyles.dropdownOption, assignmentModalStyles.addNewButton]}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={14} color={ACCENT_TEXT} />
              <Text style={assignmentModalStyles.addNewButtonText}>
                {PLANNING_PREFERENCES_UI.addDayOff}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {dayOffRows.length === 0 ? (
          <Text style={{
            fontSize: 14,
            color: MUTED,
            lineHeight: 20,
            ...(Platform.OS === 'web' && {
              fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }),
          }}
          >
            No days off yet. Add holidays, breaks, or other non-learning days for this school year.
          </Text>
        ) : (
          <View style={{ gap: 8 }}>
            {dayOffRows.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => openEditDayOffModal(row)}
                disabled={readOnly}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: 'rgba(148, 163, 184, 0.35)',
                  backgroundColor: '#f9fafb',
                }}
                {...(Platform.OS === 'web' && { cursor: readOnly ? 'default' : 'pointer' })}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: TEXT_BLACK,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}
                  numberOfLines={1}
                  >
                    {row.name || 'Day off'}
                  </Text>
                  <Text style={{
                    fontSize: 13,
                    color: MUTED,
                    marginTop: 2,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}
                  >
                    {formatDayOffRangeLabel(row)}
                  </Text>
                </View>
                {!readOnly ? <ChevronRight size={16} color="#9CA3AF" /> : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );

  const attendanceTrackingModeField = (
    <View style={fieldWrapStyle}>
      <Text style={modalFieldLabelStyle}>Tracking mode</Text>
      <View style={chipRowStyle}>
          <TouchableOpacity
            style={[modalModeToggleStyle(isClassDayAttendanceActive), { minWidth: 132 }]}
            onPress={() => handleAttendanceTrackingModeChange('class_day')}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={modalModeToggleTextStyle(isClassDayAttendanceActive)}>Total class days</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[modalModeToggleStyle(isPerSubjectAttendanceActive), { minWidth: 132 }]}
            onPress={() => handleAttendanceTrackingModeChange('subject')}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={modalModeToggleTextStyle(isPerSubjectAttendanceActive)}>Per subject</Text>
          </TouchableOpacity>
      </View>
    </View>
  );

  const attendanceGoalsContent = (
    <>
      {(attendanceTrackingMode === 'class_day' || targetScope === 'per_subject') ? (
      <>
      {attendanceTrackingMode === 'class_day' ? (
        <View style={fieldWrapStyle}>
          <Text style={modalFieldLabelStyle}>Total attendance goal</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {goalMode === 'days' && (
                <TextInput
                  value={targetDays}
                  onChangeText={handleTargetDaysChange}
                  keyboardType="number-pad"
                  style={[modalInputStyle, { width: 72, minHeight: 40, borderRadius: 14 }]}
                  placeholder="180"
                  placeholderTextColor="rgba(15,23,42,0.4)"
                />
              )}
              {goalMode === 'hours' && (
                <TextInput
                  value={targetHours}
                  onChangeText={handleTargetHoursChange}
                  keyboardType="number-pad"
                  style={[modalInputStyle, { width: 80, minHeight: 40, borderRadius: 14 }]}
                  placeholder="1000"
                  placeholderTextColor="rgba(15,23,42,0.4)"
                />
              )}
              <View style={chipRowStyle}>
                <TouchableOpacity style={modalModeToggleStyle(goalMode === 'days')} onPress={() => handleGoalChange('days')}>
                  <Text style={modalModeToggleTextStyle(goalMode === 'days')}>days</Text>
                </TouchableOpacity>
                <TouchableOpacity style={modalModeToggleStyle(goalMode === 'hours')} onPress={() => handleGoalChange('hours')}>
                  <Text style={modalModeToggleTextStyle(goalMode === 'hours')}>hours</Text>
                </TouchableOpacity>
              </View>
          </View>
        </View>
      ) : visibleSubjects.length === 0 ? (
        <Text style={modalMutedMetaStyle}>
          Add a subject first to set per-subject targets.
        </Text>
      ) : (
        visibleSubjects.map((subj) => {
            const current = subjectTargets[subj.id] || {};
            const mode = current.mode === 'hours' ? 'hours' : 'days';
            const daysValue = mode === 'days' ? String(current.days ?? '') : '';
            const hoursValue = mode === 'hours' ? String(current.hours ?? '') : '';
            return (
              <View key={subj.id} style={fieldWrapStyle}>
                <Text style={modalFieldLabelStyle}>{subj.name || 'Subject'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {mode === 'days' ? (
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
                        style={[modalInputStyle, { width: 72, minHeight: 40, borderRadius: 14 }]}
                        placeholder="180"
                        placeholderTextColor="rgba(15,23,42,0.4)"
                      />
                    ) : (
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
                        style={[modalInputStyle, { width: 80, minHeight: 40, borderRadius: 14 }]}
                        placeholder="1000"
                        placeholderTextColor="rgba(15,23,42,0.4)"
                      />
                    )}
                    <View style={chipRowStyle}>
                      <TouchableOpacity
                        style={modalModeToggleStyle(mode === 'days')}
                        onPress={() =>
                          handleSubjectTargetChange(subj.id, {
                            ...current,
                            mode: 'days',
                            days: String(current.days ?? targetDays ?? '0'),
                          })
                        }
                      >
                        <Text style={modalModeToggleTextStyle(mode === 'days')}>days</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={modalModeToggleStyle(mode === 'hours')}
                        onPress={() =>
                          handleSubjectTargetChange(subj.id, {
                            ...current,
                            mode: 'hours',
                            hours: String(current.hours ?? targetHours ?? '0'),
                          })
                        }
                      >
                        <Text style={modalModeToggleTextStyle(mode === 'hours')}>hours</Text>
                      </TouchableOpacity>
                    </View>
                </View>
              </View>
            );
          })
      )}
      </>
      ) : null}
    </>
  );

  const attendanceForm = (
    <View style={modalFormStackStyle}>
      {attendanceTrackingModeField}
      {attendanceGoalsContent}
    </View>
  );

  const settingsSections = useTwoColumnModalLayout ? (
    <View style={assignmentModalStyles.schoolYearSettingsFormRow}>
      <View style={assignmentModalStyles.schoolYearSettingsFormColumnMain}>
        <View style={assignmentModalStyles.schoolYearSettingsContentPanel}>
          <SectionHeading>{SCHOOL_YEAR_SETTINGS_UI.sections.learningDays}</SectionHeading>
          {learningDaysForm}
        </View>
      </View>
      <View style={assignmentModalStyles.schoolYearSettingsFormColumnSide}>
        <View style={assignmentModalStyles.schoolYearSettingsSidePanel}>
          <SectionHeading>{SCHOOL_YEAR_SETTINGS_UI.sections.attendanceTracking}</SectionHeading>
          {attendanceTrackingModeField}
          {embeddedInModal ? (
            <ScrollView
              style={assignmentModalStyles.assignmentSideFields}
              contentContainerStyle={{ gap: 0, paddingBottom: 8, paddingTop: 4 }}
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              {attendanceGoalsContent}
            </ScrollView>
          ) : (
            <View style={{ width: '100%', paddingTop: 4, paddingBottom: 8 }}>
              {attendanceGoalsContent}
            </View>
          )}
        </View>
      </View>
    </View>
  ) : (
    <>
      <View style={[sectionBucketStyle, sectionBucketFirstStyle]}>
        <Text style={sectionBucketTitleStyle}>{SCHOOL_YEAR_SETTINGS_UI.sections.learningDays}</Text>
        {learningDaysForm}
      </View>
      {usePlainSettingsSections ? <View style={sectionBucketDividerStyle} /> : null}
      <View style={sectionBucketStyle}>
        <Text style={sectionBucketTitleStyle}>{SCHOOL_YEAR_SETTINGS_UI.sections.attendanceTracking}</Text>
        {attendanceForm}
      </View>
    </>
  );

  // No blocking spinner for the embedded modal: render the form immediately using the
  // cached snapshot / derived defaults, then hydrate in place once fresh data arrives.
  // This avoids a visible loading state when transitioning into School Year Settings.

  const settingsInner = (
      <View style={{
        paddingHorizontal: 0,
        paddingTop: 0,
        width: '100%',
      }}>
        {embeddedInModal && !hideEmbeddedHeader ? (
          <View style={embeddedTitleRowStyle}>
            <Text style={embeddedTitleStyle}>{SCHOOL_YEAR_SETTINGS_UI.embeddedTitle}</Text>
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
              Your family admin has turned off changes to school year settings. You can still review the settings below.
            </Text>
          </View>
        ) : null}
        {!embeddedInModal && !hidePageTitle ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: SettingsLayout.dividerSpacing,
            }}
          >
            {isSchoolYearLocked ? (
              <Text style={pageYearNavTitleStyle}>{schoolYearHeaderLabel}</Text>
            ) : (
              <View style={pageYearNavRowStyle}>
                <View style={pageYearNavChevronsStyle}>
                  <TouchableOpacity
                    style={[pageYearNavBtnStyle, !canShiftSchoolYear && { opacity: 0.35 }]}
                    onPress={() => shiftSelectedSchoolYear(-1)}
                    disabled={!canShiftSchoolYear}
                    accessibilityRole="button"
                    accessibilityLabel="Previous school year"
                    {...(Platform.OS === 'web' && { cursor: canShiftSchoolYear ? 'pointer' : 'default' })}
                  >
                    <ChevronLeft size={16} color="rgba(15,23,42,0.4)" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[pageYearNavBtnStyle, !canShiftSchoolYear && { opacity: 0.35 }]}
                    onPress={() => shiftSelectedSchoolYear(1)}
                    disabled={!canShiftSchoolYear}
                    accessibilityRole="button"
                    accessibilityLabel="Next school year"
                    {...(Platform.OS === 'web' && { cursor: canShiftSchoolYear ? 'pointer' : 'default' })}
                  >
                    <ChevronRight size={16} color="rgba(15,23,42,0.4)" />
                  </TouchableOpacity>
                </View>
                <View style={pageYearNavTitleGroupStyle}>
                  <TouchableOpacity
                    style={[
                      pageYearNavTitleButtonStyle,
                      (!canShiftSchoolYear || isAtCurrentSchoolYear) && pageYearNavTitleButtonDisabledStyle,
                    ]}
                    onPress={jumpToCurrentSchoolYear}
                    disabled={!canShiftSchoolYear || isAtCurrentSchoolYear}
                    accessibilityRole="button"
                    accessibilityLabel="Return to current school year"
                    {...(Platform.OS === 'web' && {
                      cursor: canShiftSchoolYear && !isAtCurrentSchoolYear ? 'pointer' : 'default',
                    })}
                  >
                    <Text style={pageYearNavTitleStyle}>{schoolYearHeaderLabel}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {savedIndicator ? (
              <Text style={{ fontSize: 13, color: '#10b981', fontWeight: '500' }}>Saved</Text>
            ) : null}
          </View>
        ) : null}
        {settingsSections}

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

        {error && <Text style={{ color: '#DC2626', fontSize: 14, marginTop: 12 }}>{error}</Text>}

        <Modal
          visible={showNoSubjectsForPerSubjectModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowNoSubjectsForPerSubjectModal(false)}
        >
          <View style={comingSoonModalStyles.overlay}>
            <View style={comingSoonModalStyles.content}>
              <TouchableOpacity
                style={comingSoonModalStyles.close}
                onPress={() => setShowNoSubjectsForPerSubjectModal(false)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
              <Text style={comingSoonModalStyles.title}>Add subjects first</Text>
              <Text style={comingSoonModalStyles.body}>
                There are no subjects for this school year yet. Add subjects first, then you can set per-subject tracking goals.
              </Text>
              <TouchableOpacity
                style={comingSoonModalStyles.button}
                onPress={() => setShowNoSubjectsForPerSubjectModal(false)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={comingSoonModalStyles.buttonText}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <DayOffCreateModal
          visible={showDayOffModal}
          onClose={closeDayOffModal}
          onSaved={handleDayOffSaved}
          onDeleted={handleDayOffDeleted}
          familyId={familyId}
          schoolYearLabel={selectedSchoolYearLabel}
          defaultDate={pendingDayOffDate}
          editRow={editingDayOffRow}
        />
      </View>
  );

  if (useTwoColumnModalLayout && embeddedInModal) {
    return settingsInner;
  }

  return (
    <ScrollView
      scrollEnabled
      style={{ flex: 1, minHeight: 0 }}
      contentContainerStyle={{
        paddingBottom: embeddedInModal ? 32 : 32,
        paddingHorizontal: embeddedInModal ? 26 : 0,
        paddingTop: embeddedInModal ? 30 : 0,
      }}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    >
      {settingsInner}
    </ScrollView>
  );
}
