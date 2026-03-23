/**
 * Plan Year Modal
 * Academic year planning with constraint solver and holiday management
 * 
 * Two paths:
 * 1. Non-homeschool fast path: Defaults + typical holidays
 * 2. Homeschool constraint solver: Pick 3 vars, compute 4th
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Platform,
  Alert,
  Switch,
} from 'react-native';

const TARGET_INSTRUCTIONAL_DAYS_DEFAULT = 180;
import { 
  X, 
  Calendar, 
  ChevronDown, 
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Plus, 
  Trash2, 
  Save,
  FileText,
  Clock,
  Target,
  Check,
  Info,
  LayoutGrid,
  Upload,
  List,
  Sparkles,
  ArrowRight,
  Paperclip,
  BookOpen,
  GripVertical,
  Edit,
  MoreVertical,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../Toast';
import {
  createDefaultAcademicYear,
  recalculateAcademicYear,
  saveAcademicYear,
  applyToCalendar,
  clearPlaceholders,
  getAcademicYear,
  getPlanHealth,
  invalidatePlanHealthCache,
  computeSchedulePotential,
  getPublicHolidaysForRange,
} from '../../lib/services/academicYearClient';
import { getPlanDefaultsFromSettings, getAcademicYearExclusions, getFamilyPlannerSettings, addExclusion, saveExcludedPublicHolidayDates } from '../../lib/services/plannerSettingsClient';
import { supabase } from '../../lib/supabase';
import { t, s, STRINGS } from '../../lib/i18n/strings';
import { buildCurriculum, commitCurriculum, previewPacing, parsePlainText, generateCurriculumDraft, commitManualDraft, commitParsedDraft, commitGeneratedDraft } from '../../lib/services/curriculumClient';
import { getMaterials } from '../../lib/services/materialsClient';
import {
  PLAN_MY_YEAR_LOGISTICS_FIRST,
  PLAN_MY_YEAR_MULTI_SUBJECT_CADENCE,
  PLAN_STEP_KEYS,
  getInitialPlanStep,
  getSourceNextStep,
  getAfterUnitStructureContinue,
  getPreviewBackStep,
  showMultiSubjectCadenceHint,
} from './planYearFlowConfig';

// Constants for curriculum building
const SOURCE_TYPES = [
  { value: 'auto_detect', labelKey: 'sourceTypeAuto' },
  { value: 'syllabus', labelKey: 'sourceTypeSyllabus' },
  { value: 'lesson_list', labelKey: 'sourceTypeLessonList' },
  { value: 'pacing_guide', labelKey: 'sourceTypePacingGuide' },
  { value: 'weekly_plan', labelKey: 'sourceTypeWeeklyPlan' },
  { value: 'course_outline', labelKey: 'sourceTypeCourseOutline' },
];

const PARSE_MODES = [
  { value: 'auto_detect', labelKey: 'parseModeAuto' },
  { value: 'unit_based', labelKey: 'parseModeUnitBased' },
  { value: 'lesson_based', labelKey: 'parseModeLessonBased' },
  { value: 'week_based', labelKey: 'parseModeWeekBased' },
  { value: 'date_based', labelKey: 'parseModeDateBased' },
];

const DURATION_OPTIONS = [
  { value: 'single_unit', labelKey: 'durationSingleUnit' },
  { value: 'multi_unit_course', labelKey: 'durationMultiUnit' },
  { value: 'semester', labelKey: 'durationSemester' },
  { value: 'full_year', labelKey: 'durationFullYear' },
  { value: 'custom_weeks', labelKey: 'durationCustomWeeks' },
];

const LESSON_TYPES = ['lesson', 'project', 'exam', 'assignment', 'activity'];

const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const CARD_BORDER = '#E6EAF2';
const MUTED = '#9ca3af';
const ACCENT = '#6BB3E8';
const ACCENT_LIGHT = 'rgba(133,196,242,0.2)';
const HIGHLIGHT_BG = 'rgba(107,179,232,0.15)';
const HIGHLIGHT_BORDER = '#6BB3E8';
const ERROR = '#ef4444';
const SUCCESS = '#10b981';
const WARNING = '#d97706';
const PRIMARY_BTN = '#85C4F2';
const CHIP_SELECTED_BG = 'rgba(133,196,242,0.2)';
const CHIP_SELECTED_BORDER = '#6BB3E8';
const CHIP_SELECTED_TEXT = '#6BB3E8';
const CHIP_BG_OPAQUE = '#d0e8f7'; // same hue as chip blue, lighter opaque tone
const ELIGIBILITY_CARD_BG = '#F7FBFF';
const ELIGIBILITY_CARD_BORDER = '#DDEAF5';
const ACCENT_BAR = '#81C1E1';
const SECONDARY_BTN_BORDER = '#CFE3F4';
const CARD_PADDING = 20;
const SECTION_SPACING = 20;
// Design tokens for Plan My Year step 1 (3-zone, depth, cards)
const SURFACE_ELEVATED = '#f8fafc';
const SURFACE_SUBTLE = '#f1f5f9';
const BORDER_SUBTLE = '#e2e8f0';
const BORDER_STRONG = '#cbd5e1';
const BRAND_500 = '#6BB3E8';
const BRAND_600 = '#5A9FD6';
const TEXT_SECONDARY = '#64748b';
const SECTION_GAP = 28;
const OPTION_GAP = 16;
const LABEL_INPUT_GAP = 6;
const INPUT_GAP = 12;

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NUMBERS = [0, 1, 2, 3, 4, 5, 6];

function dateStringToDate(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return new Date();
  return new Date(ymd + 'T12:00:00');
}

function formatDateDisplay(ymd) {
  if (!ymd) return '';
  const d = dateStringToDate(ymd);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Parse year_name into card lines; if " · " separated use as scope / subjects / date, else title + date. */
function parsePlanCardLines(ay) {
  const name = ay.year_name || 'Academic year';
  const dateRange = ay.start_date && ay.end_date
    ? `${formatDateDisplay(ay.start_date)} – ${formatDateDisplay(ay.end_date)}`
    : '';
  const parts = name.split(' · ').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) return { line1: parts[0], line2: parts[1], line3: parts[2] };
  if (parts.length === 2) return { line1: parts[0], line2: null, line3: parts[1] };
  return { line1: name, line2: null, line3: dateRange };
}

/** Build display name for plan: "Student Name · Subject Name · Date range" */
function buildPlanYearName(options) {
  const {
    children = [],
    subjects = [],
    blocks = [],
    selectedSubjectIds = [],
    startDate,
    endDate,
  } = options;
  const childList = (children || []);
  const childIdSet = new Set();
  (blocks || []).forEach((b) => {
    (b.child_ids || []).forEach((cid) => {
      if (cid) childIdSet.add(String(cid));
    });
  });
  const distinctChildIds = Array.from(childIdSet);
  const studentName =
    distinctChildIds.length === 0
      ? 'Whole family'
      : distinctChildIds
          .map((id) => childList.find((c) => String(c.id) === String(id))?.first_name || childList.find((c) => String(c.id) === String(id))?.name || 'Child')
          .filter(Boolean)
          .join(', ') || 'Whole family';
  const subjectIds =
    blocks.length > 0
      ? [...new Set(blocks.map((b) => b.subject_id).filter(Boolean))]
      : selectedSubjectIds;
  const subjectNames = (subjects || []);
  const names = subjectIds
    .map((id) => subjectNames.find((s) => String(s.id) === String(id))?.name)
    .filter(Boolean);
  const subjectLabel =
    subjectIds.length === 0
      ? 'No subject'
      : names.length > 2
        ? names.slice(0, 2).join(', ') + ` +${names.length - 2}`
        : names.join(', ') || 'Subject';
  const dateRange =
    startDate && endDate ? `${formatDateDisplay(startDate)} – ${formatDateDisplay(endDate)}` : '';
  return [studentName, subjectLabel || 'Subjects', dateRange].filter(Boolean).join(' · ');
}

function toLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Client-side parse of pasted plain text: one topic per line, optional unit/section headers. No backend call. */
function parsePastedListToCurriculum(pastedText, studentIds, startDateISO) {
  const lines = pastedText
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  let currentUnitTitle = null;
  const lessons = [];
  const unitHeaderRe = /^Unit\s+\d+\s*:/i;
  const topicsIncludeRe = /^Topics?\s+may\s+include\s*:/i;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const looksLikeUnitHeader =
      unitHeaderRe.test(line) ||
      topicsIncludeRe.test(line) ||
      (line.endsWith(':') && line.length < 80);
    if (looksLikeUnitHeader) {
      currentUnitTitle = line.replace(/:$/, '').trim() || line;
    } else {
      lessons.push({
        title: line,
        sequence_index: lessons.length + 1,
        unit_topic: currentUnitTitle || undefined,
        minutes_est: 60,
      });
    }
  }
  if (lessons.length === 0) return null;
  const firstUnitTitle = lines.find((l) => unitHeaderRe.test(l) || topicsIncludeRe.test(l));
  const unitTitle = (firstUnitTitle && firstUnitTitle.replace(/:$/, '').trim()) || 'Pasted list';
  const schedule_map = lessons.map((_, i) => ({
    sequence_index: i + 1,
    recommended_day_offset: i,
  }));
  return {
    unit: {
      title: unitTitle,
      student_ids: studentIds,
      source_type: 'topic',
      total_minutes_est: lessons.length * 60,
      weeks_est: Math.max(1, Math.ceil(lessons.length / 5)),
    },
    lessons,
    pacing: {
      start_date: startDateISO,
      strategy: 'fit_openings',
      schedule_map,
    },
  };
}

/** JS getDay(): 0=Sun, 1=Mon, …, 6=Sat. Block weekdays use same convention. */
function getBlockOccurrenceDates(block, startDateYmd, endDateYmd, exclusionRanges) {
  if (!startDateYmd || !endDateYmd || !/^\d{4}-\d{2}-\d{2}$/.test(startDateYmd) || !/^\d{4}-\d{2}-\d{2}$/.test(endDateYmd)) return [];
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

/** "09:00" / "10:00" -> "9–10am" */
function formatTimeRange(startTime, endTime) {
  const parse = (s) => {
    if (!s || typeof s !== 'string') return { h: 9, m: 0 };
    const parts = s.trim().split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1] ? parseInt(parts[1].replace(/\D/g, ''), 10) : 0;
    return { h: Number.isNaN(h) ? 9 : Math.max(0, Math.min(23, h)), m: Number.isNaN(m) ? 0 : Math.max(0, Math.min(59, m)) };
  };
  const start = parse(startTime || '09:00');
  const end = parse(endTime || '10:00');
  const fmt = (t) => {
    if (t.m === 0) return t.h === 12 ? '12pm' : t.h === 0 ? '12am' : t.h < 12 ? `${t.h}am` : `${t.h - 12}pm`;
    return t.h === 12 ? `12:${String(t.m).padStart(2, '0')}pm` : t.h === 0 ? `12:${String(t.m).padStart(2, '0')}am` : t.h < 12 ? `${t.h}:${String(t.m).padStart(2, '0')}am` : `${t.h - 12}:${String(t.m).padStart(2, '0')}pm`;
  };
  return `${fmt(start)}–${fmt(end)}`;
}

function expandBreaksToHolidayDates(breaks) {
  const out = [];
  for (const b of breaks || []) {
    let d = new Date(b.start + 'T12:00:00Z');
    const end = new Date(b.end + 'T12:00:00Z');
    while (d <= end) {
      out.push({ date: d.toISOString().slice(0, 10), name: b.name || 'Break', type: 'BREAK' });
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return out;
}

/** Child ids this subject applies to: whole family if unset; else semicolon-separated ids on subject, intersected with family children. */
function getChildIdsForSubject(subject, children) {
  const familyIds = (children || []).map((c) => c?.id).filter(Boolean);
  if (familyIds.length === 0) return [];
  if (!subject) return [...familyIds];
  const cid = subject.child_id;
  if (cid == null || cid === '') return [...familyIds];
  const parsed = String(cid)
    .split(';')
    .map((id) => id.trim())
    .filter(Boolean);
  const matched = parsed.filter((id) => familyIds.some((fid) => String(fid) === String(id)));
  return matched.length > 0 ? matched : [...familyIds];
}

export default function PlanYearModal({
  visible,
  renderInline = false,
  familyId,
  children = [],
  subjects = [],
  fullSubjects = [],
  onClose,
  onComplete,
  onOpenBuildCurriculum = null,
  onOpenRebalance = null,
  onOpenPlannerSettings = null,
  initialAcademicYearId = null,
  initialPlanSummaryData = null,
  openForNewPlan = false,
  openToEditPlanList = false,
  openDirectlyToScope = false,
  fromSubjectDetail = false,
  highlightFromPlanHealth = false,
  initialSubjectId = null,
  initialMaterialId = null,
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [yearLoadInProgress, setYearLoadInProgress] = useState(false);
  const [planCreatedAt, setPlanCreatedAt] = useState(null);
  const [planUpdatedAt, setPlanUpdatedAt] = useState(null);
  const [isHomeschool, setIsHomeschool] = useState(false);
  const [checkingHomeschool, setCheckingHomeschool] = useState(true);
  
  // Fast path state
  const [fastPathYearId, setFastPathYearId] = useState(null);
  const [followGlobalHolidays, setFollowGlobalHolidays] = useState(true);
  const [countryCode, setCountryCode] = useState('US');
  const [regionCode, setRegionCode] = useState(null);
  
  // Constraint solver state
  const [mode, setMode] = useState('FIXED_END'); // FIXED_END | TARGET_DAYS | TARGET_HOURS
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetDays, setTargetDays] = useState('');
  const [targetHours, setTargetHours] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('');
  const [customHolidays, setCustomHolidays] = useState([]);
  const [customBreaks, setCustomBreaks] = useState([]); // Phase 3: { start, end, name }[]
  const [newBreakStart, setNewBreakStart] = useState('');
  const [newBreakEnd, setNewBreakEnd] = useState('');
  const [newBreakName, setNewBreakName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [academicYearId, setAcademicYearId] = useState(initialAcademicYearId || null);
  const [focusedInput, setFocusedInput] = useState(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [startDateCalendarMonth, setStartDateCalendarMonth] = useState(() => new Date());
  const [endDateCalendarMonth, setEndDateCalendarMonth] = useState(() => new Date());
  const [showNewHolidayDatePicker, setShowNewHolidayDatePicker] = useState(false);
  const [showNewBreakStartPicker, setShowNewBreakStartPicker] = useState(false);
  const [showNewBreakEndPicker, setShowNewBreakEndPicker] = useState(false);
  const [newHolidayDateCalendarMonth, setNewHolidayDateCalendarMonth] = useState(() => new Date());
  const [newBreakStartCalendarMonth, setNewBreakStartCalendarMonth] = useState(() => new Date());
  const [newBreakEndCalendarMonth, setNewBreakEndCalendarMonth] = useState(() => new Date());
  
  // Calculated results
  const [calculatedResult, setCalculatedResult] = useState(null);
  const [recalculating, setRecalculating] = useState(false);
  
  // Phase 2: Which subjects / replace prompt (assignees removed — child_ids come from each subject on submit)
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]); // one or more subject ids (multi-subject cadence)
  /** When set (e.g. from cadence row), method → unit pipeline uses this subject even if multiple subjects are selected. */
  const [unitFocusSubjectId, setUnitFocusSubjectId] = useState(null);
  /** Set when curriculum is committed from unit structure (shown on Review). */
  const [lastSavedUnitSubjectId, setLastSavedUnitSubjectId] = useState(null);
  const [existingPlaceholdersCount, setExistingPlaceholdersCount] = useState(0);
  const [replacePlaceholders, setReplacePlaceholders] = useState(true);
  const [applyFromMode, setApplyFromMode] = useState('entire'); // 'entire' | 'today' | 'date'
  const [applyFromDate, setApplyFromDate] = useState(null); // YYYY-MM-DD when applyFromMode === 'date'
  const [showApplyFromDatePicker, setShowApplyFromDatePicker] = useState(false);
  const [applyFromDateCalendarMonth, setApplyFromDateCalendarMonth] = useState(() => new Date());
  const [showDeletePlanConfirm, setShowDeletePlanConfirm] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [suggestionAccepted, setSuggestionAccepted] = useState(false);
  const [extendSuggestionAccepted, setExtendSuggestionAccepted] = useState(false);
  const [acceptedExtendDate, setAcceptedExtendDate] = useState(null); // freeze suggested date when user accepts

  // Phase 3: constraint mode + target (I need X days | X hours)
  const [planConstraintMode, setPlanConstraintMode] = useState('none');
  const [planTargetDays, setPlanTargetDays] = useState('180');
  const [planTargetHours, setPlanTargetHours] = useState('1000');

  // Blocks (Phase 1: schedule potential from blocks)
  const [blocks, setBlocks] = useState([]);
  const [schedulePotential, setSchedulePotential] = useState(null);
  const [computingPotential, setComputingPotential] = useState(false);
  const schedulePotentialTimeoutRef = useRef(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // Phase 4: Flex Learning suggestion when delta < 0
  const [flexSuggestion, setFlexSuggestion] = useState(null);
  const [computingFlexSuggestion, setComputingFlexSuggestion] = useState(false);
  const flexSuggestionTimeoutRef = useRef(null);

  // Plan health (includes manual counted events for "Manual instructional events counted" panel)
  const [planHealth, setPlanHealth] = useState(null);
  const [holidaysCollapsed, setHolidaysCollapsed] = useState(true);
  const [showAddExclusionForm, setShowAddExclusionForm] = useState(false);
  const [complianceCollapsed, setComplianceCollapsed] = useState(true);
  const [progressBreakdownExpanded, setProgressBreakdownExpanded] = useState(false);
  const [excludedPublicHolidayDates, setExcludedPublicHolidayDates] = useState([]); // dates (YYYY-MM-DD) to exclude from US public holidays
  const [showPublicHolidaysPicker, setShowPublicHolidaysPicker] = useState(false);
  const [publicHolidaysList, setPublicHolidaysList] = useState([]);
  const [publicHolidaysLoading, setPublicHolidaysLoading] = useState(false);
  const [planningScope, setPlanningScope] = useState(null); // null | 'full_year' | 'one_subject' | 'placeholders_only' | 'build_from_material'
  const [planSource, setPlanSource] = useState('placeholders'); // 'placeholders' | 'upload' | 'link' | 'paste' | 'paste_plain' | 'generate'
  const [sourceUrl, setSourceUrl] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [materialDropdownPosition, setMaterialDropdownPosition] = useState({ top: 0, left: 0, width: 200, maxHeight: 300 });
  const materialButtonRef = useRef(null);
  const [sectionSourceExpanded, setSectionSourceExpanded] = useState(true);
  const [sectionWhoExpanded, setSectionWhoExpanded] = useState(false);
  const [sectionScheduleExpanded, setSectionScheduleExpanded] = useState(false);
  const [sectionDatesExpanded, setSectionDatesExpanded] = useState(false);
  // 'source' | 'unit_structure' | 'logistics' | 'preview' (scope removed). Entry step from getInitialPlanStep.
  const [planStep, setPlanStep] = useState(() => getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST));
  const [showPlanManagerView, setShowPlanManagerView] = useState(() => !!openToEditPlanList); // when true and pickerOnly, show Edit plan list; when false and pickerOnly, show entry choice (Plan Manager / Create New Plan)
  const [planSummaryYearId, setPlanSummaryYearId] = useState(null); // when set, show plan summary view (like event summary) before editing
  const [editingFromSummary, setEditingFromSummary] = useState(false); // true when we opened logistics from "Edit Plan" on plan summary (header = Edit > Review, Back = to summary)
  const [planSummaryData, setPlanSummaryData] = useState(null);
  const [planSummaryLoading, setPlanSummaryLoading] = useState(false);
  const [planSummaryError, setPlanSummaryError] = useState(null);
  const [showPreviewScreen, setShowPreviewScreen] = useState(false);
  const [parsedContent, setParsedContent] = useState(null); // { unit, lessons, pacing } from buildCurriculum for upload/link/paste
  const [parsingContent, setParsingContent] = useState(false);
  const [parseContentError, setParseContentError] = useState(null);
  const [pacingPreview, setPacingPreview] = useState(null); // Phase 2: lesson-to-slot mapping before commit
  const [pacingPreviewLoading, setPacingPreviewLoading] = useState(false);
  const [pacingPreviewError, setPacingPreviewError] = useState(null);
  const [hoverSourceKey, setHoverSourceKey] = useState(null); // for step 1 option hover (web)
  const [hoverScopeKey, setHoverScopeKey] = useState(null); // for scope step option hover (web)
  const [entryChoiceHoverKey, setEntryChoiceHoverKey] = useState(null); // 'edit' | 'create' for arrow on hover
  const [footerCancelHover, setFooterCancelHover] = useState(false);
  const [highlightBlockIndex, setHighlightBlockIndex] = useState(null);
  
  // Plan-level subject targets (editable in scope step; saved with plan)
  const [planSubjectTargetsOverride, setPlanSubjectTargetsOverride] = useState({}); // { subjectId: { mode, days, hours } }
  /** Snapshot of cadence per subject id (synced from `blocks` when multi-subject flag is on). */
  const [perSubjectCadenceDraft, setPerSubjectCadenceDraft] = useState({});
  const [targetScopeFromSettings, setTargetScopeFromSettings] = useState('overall'); // 'overall' | 'per_subject' from family_planner_settings
  const [planningDefaultsData, setPlanningDefaultsData] = useState(null); // { settings, exclusions } for Planning defaults summary
  const [planningDefaultsLoading, setPlanningDefaultsLoading] = useState(false);
  
  // Unit Structure step state
  const [unitStructureData, setUnitStructureData] = useState(null); // { units: [{ title, lessons: [...] }] }
  const [loadingUnitStructure, setLoadingUnitStructure] = useState(false);
  const [expandedUnits, setExpandedUnits] = useState(new Set()); // Set of unit indices
  const [editingItemId, setEditingItemId] = useState(null); // ID of item being edited inline
  const [editingItemText, setEditingItemText] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Upload/Paste/Generate mode state
  const [unitStructureStep, setUnitStructureStep] = useState('input'); // 'input' | 'draft' | 'saving'
  const [rawText, setRawText] = useState(''); // For paste mode
  // selectedMaterialId already declared above (line 421)
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [unitStructureError, setUnitStructureError] = useState(null);
  const [draftData, setDraftData] = useState(null); // Parsed/generated draft before saving
  
  // Generate mode form state
  const [generationScope, setGenerationScope] = useState('');
  const [learnerStage, setLearnerStage] = useState('');
  const [durationMode, setDurationMode] = useState('multi_unit_course');
  const [customWeeks, setCustomWeeks] = useState('');
  const [lessonCountTarget, setLessonCountTarget] = useState('');
  const [typicalLessonMinutes, setTypicalLessonMinutes] = useState('45');
  const [educationalStyle, setEducationalStyle] = useState('');
  const [rigorLevel, setRigorLevel] = useState('standard');
  const [includeAssessments, setIncludeAssessments] = useState(true);
  const [includeProjects, setIncludeProjects] = useState(true);
  const [includeMaterials, setIncludeMaterials] = useState(true);
  const [includePacing, setIncludePacing] = useState(true);
  const [specialInstructions, setSpecialInstructions] = useState('');
  
  // Import & Extract mode form state (for upload)
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceType, setSourceType] = useState('auto_detect');
  const [parseMode, setParseMode] = useState('auto_detect');
  const [detectDates, setDetectDates] = useState(true);
  const [preserveHeadings, setPreserveHeadings] = useState(true);
  const [ignorePolicyText, setIgnorePolicyText] = useState(true);
  const [extractAssignments, setExtractAssignments] = useState(true);
  const [extractAssessments, setExtractAssessments] = useState(true);
  const [specialInstructionsParse, setSpecialInstructionsParse] = useState('');
  
  // Manual builder state (for paste)
  const [expandedUnitIndexManual, setExpandedUnitIndexManual] = useState(0);
  
  // Manual mode state (for paste/manual)
  const [manualDraft, setManualDraft] = useState(null);
  
  // Helper functions for draft editing (matching original modals)
  const updateDraftUnit = useCallback((unitIndex, field, value) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        if (!units[unitIndex]) return prev;
        units[unitIndex] = { ...units[unitIndex], [field]: value };
        return { ...prev, units };
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        if (!units[unitIndex]) return prev;
        units[unitIndex] = { ...units[unitIndex], [field]: value };
        return { ...prev, units };
      });
    }
  }, [draftData, manualDraft]);
  
  const updateDraftLesson = useCallback((unitIndex, lessonIndex, field, value) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u?.lessons) return prev;
        const lessons = [...u.lessons];
        if (!lessons[lessonIndex]) return prev;
        lessons[lessonIndex] = { ...lessons[lessonIndex], [field]: value };
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u?.lessons) return prev;
        const lessons = [...u.lessons];
        if (!lessons[lessonIndex]) return prev;
        lessons[lessonIndex] = { ...lessons[lessonIndex], [field]: value };
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    }
  }, [draftData, manualDraft]);
  
  const deleteDraftLesson = useCallback((unitIndex, lessonIndex) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u?.lessons) return prev;
        const lessons = u.lessons.filter((_, i) => i !== lessonIndex);
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u?.lessons) return prev;
        const lessons = u.lessons.filter((_, i) => i !== lessonIndex);
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    }
  }, [draftData, manualDraft]);
  
  const addDraftLesson = useCallback((unitIndex) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u) return prev;
        const lessons = [...(u.lessons || [])];
        const seq = lessons.length + 1;
        lessons.push({
          temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          title: `Lesson ${seq}`,
          lesson_type: 'lesson',
          sequence_index: seq,
          minutes_est: 60,
        });
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units) return prev;
        const units = [...prev.units];
        const u = units[unitIndex];
        if (!u) return prev;
        const lessons = [...(u.lessons || [])];
        const seq = lessons.length + 1;
        lessons.push({
          temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          title: `Lesson ${seq}`,
          lesson_type: 'lesson',
          sequence_index: seq,
          minutes_est: 60,
        });
        units[unitIndex] = { ...u, lessons };
        return { ...prev, units };
      });
    }
  }, [draftData, manualDraft]);
  
  const deleteDraftUnit = useCallback((unitIndex) => {
    if (draftData) {
      setDraftData((prev) => {
        if (!prev?.units || prev.units.length <= 1) return prev;
        const units = prev.units.filter((_, i) => i !== unitIndex);
        return { ...prev, units };
      });
      setExpandedUnits((prev) => {
        const newSet = new Set(prev);
        newSet.delete(unitIndex);
        // Adjust indices for units after the deleted one
        const adjusted = new Set();
        newSet.forEach((idx) => {
          if (idx > unitIndex) adjusted.add(idx - 1);
          else adjusted.add(idx);
        });
        return adjusted;
      });
    } else if (manualDraft) {
      setManualDraft((prev) => {
        if (!prev?.units || prev.units.length <= 1) return prev;
        const units = prev.units.filter((_, i) => i !== unitIndex);
        return { ...prev, units };
      });
      setExpandedUnits((prev) => {
        const newSet = new Set(prev);
        newSet.delete(unitIndex);
        const adjusted = new Set();
        newSet.forEach((idx) => {
          if (idx > unitIndex) adjusted.add(idx - 1);
          else adjusted.add(idx);
        });
        return adjusted;
      });
    }
  }, [draftData, manualDraft]);
  
  const moveDraftLesson = useCallback((unitIndex, lessonIndex, direction) => {
    const currentDraft = draftData || manualDraft;
    if (!currentDraft?.units) return;
    
    const units = [...currentDraft.units];
    const u = units[unitIndex];
    if (!u?.lessons) return;
    
    const lessons = [...u.lessons];
    const newIndex = lessonIndex + direction;
    if (newIndex < 0 || newIndex >= lessons.length) return;
    
    [lessons[lessonIndex], lessons[newIndex]] = [lessons[newIndex], lessons[lessonIndex]];
    lessons.forEach((le, i) => { le.sequence_index = i + 1; });
    units[unitIndex] = { ...u, lessons };
    
    if (draftData) {
      setDraftData({ ...draftData, units });
    } else if (manualDraft) {
      setManualDraft({ ...manualDraft, units });
    }
  }, [draftData, manualDraft]);

  const recalculateTimeoutRef = useRef(null);
  const scrollRef = useRef(null);
  const scheduleSectionYRef = useRef(0);
  const datesSectionYRef = useRef(0);
  const schedulePotentialFetchedRef = useRef(false);
  const planSummaryCacheRef = useRef(new Map()); // yearId -> full academic year data for instant summary display
  const preloadedSummaryIdsRef = useRef(new Set());
  const subjectPlanResolvedRef = useRef(false); // when from subject details, avoid re-running plan-for-subject search

  const baseSubjectList = Array.isArray(fullSubjects) && fullSubjects.length > 0 ? fullSubjects : subjects;
  /** All family subjects; plan slots attach to children via each subject's `child_id` (see getChildIdsForSubject). */
  const subjectsForCurrentSelection = baseSubjectList;
  const allFamilyChildIds = useMemo(
    () => (children || []).map((c) => c?.id).filter(Boolean),
    [children],
  );

  /** Which subjects / placeholders / children — excludes weekdays & times so cadence edits do not re-trigger schedule potential. */
  const schedulePotentialBlocksStructureKey = useMemo(
    () =>
      JSON.stringify(
        (blocks || []).map((b) => ({
          block_id: b.block_id,
          subject_id: b.subject_id ?? null,
          child_ids: [...(b.child_ids || [])].map(String).sort(),
          placeholder_label: b.placeholder_label ?? null,
        })),
      ),
    [blocks],
  );

  /**
   * `empty` → `primed` when the user picks the first weekday(s) so the card can move off 0; after that,
   * changing which days/times keeps `primed` and does not re-fetch.
   */
  const schedulePotentialCadencePrimedKey = useMemo(
    () => ((blocks || []).some((b) => (b.weekdays || []).length > 0) ? 'primed' : 'empty'),
    [blocks],
  );

  const effectiveSubjectIds = selectedSubjectIds.filter((id) =>
    subjectsForCurrentSelection.some((s) => s.id === id)
  );
  const unitPipelineSubjectId =
    initialSubjectId ||
    unitFocusSubjectId ||
    (effectiveSubjectIds.length === 1 ? effectiveSubjectIds[0] : null);

  /** Multi-subject plans must scope units to one subject before opening unit structure (cadence row link or picker below). */
  const ensureUnitSubjectForUnitStructure = useCallback((candidateSubjectId) => {
    const resolvedSubject =
      initialSubjectId ||
      unitFocusSubjectId ||
      (candidateSubjectId != null && String(candidateSubjectId).trim() !== '');
    if (effectiveSubjectIds.length > 1 && !resolvedSubject) {
      toast.push(
        t('planMyYear.multiSubjectUnits.toastPickSubjectFirst'),
        'error',
      );
      return false;
    }
    return true;
  }, [effectiveSubjectIds.length, initialSubjectId, unitFocusSubjectId, toast]);

  /** Logistics-first: open unit-structure modal with the same init as the Method step tiles (per subject row). */
  const openCadenceUnitMethod = useCallback(
    (subjectId, method) => {
      if (!ensureUnitSubjectForUnitStructure(subjectId)) return;
      setUnitFocusSubjectId(subjectId);
      setDraftData(null);
      setParsedContent(null);
      setParseContentError(null);
      setParsingContent(false);
      setUnitStructureData(null);
      if (method === 'paste') {
        setPlanSource('paste');
        setRawText('');
        setUnitStructureStep('input');
        setManualDraft({
          title: null,
          units: [{ temp_id: `temp-${Date.now()}`, title: 'Unit 1', sequence_index: 1, description: null, lessons: [] }],
        });
        setExpandedUnitIndexManual(0);
        setExpandedUnits(new Set([0]));
      } else if (method === 'paste_plain') {
        setPlanSource('paste_plain');
        setManualDraft(null);
        setUnitStructureStep('input');
        setRawText('');
        setExpandedUnits(new Set());
        setExpandedUnitIndexManual(0);
      } else if (method === 'upload') {
        setPlanSource('upload');
        setManualDraft(null);
        setUnitStructureStep('input');
        setRawText('');
      } else if (method === 'generate') {
        setPlanSource('generate');
        setManualDraft(null);
        setUnitStructureStep('input');
        setRawText('');
      }
      setPlanStep('unit_structure');
    },
    [ensureUnitSubjectForUnitStructure],
  );

  // Merge: planSubjectTargetsOverride (user edits) > plan > subject defaults
  // When target_scope === 'overall': use plan-level target only, subject_targets = undefined
  // When target_scope === 'per_subject': use subject defaults per subject
  const effectiveSubjectTargets = useMemo(() => {
    if (targetScopeFromSettings === 'overall') {
      // Overall mode: only include planSubjectTargetsOverride (user edits in "Target for this plan")
      const fromOverride = {};
      Object.entries(planSubjectTargetsOverride).forEach(([sid, t]) => {
        if (t.mode === 'none') return;
        if (t.mode === 'days') {
          const d = t.days?.trim() ? parseInt(t.days, 10) : null;
          if (d != null) fromOverride[sid] = { target_days: d, target_hours: undefined };
        } else if (t.mode === 'hours') {
          const h = t.hours?.trim() ? parseFloat(t.hours) : null;
          if (h != null) fromOverride[sid] = { target_days: undefined, target_hours: h };
        }
      });
      return Object.keys(fromOverride).length > 0 ? fromOverride : undefined;
    }
    // Per-subject mode: plan > subject defaults > override
    const fromPlan = planHealth?.subject_targets && typeof planHealth.subject_targets === 'object' ? { ...planHealth.subject_targets } : {};
    const subjectIdsToConsider = [...new Set([...effectiveSubjectIds, ...blocks.map((b) => b.subject_id).filter(Boolean)])];
    subjectIdsToConsider.forEach((sid) => {
      if (fromPlan[sid]) return;
      const subj = baseSubjectList.find((s) => String(s.id) === String(sid));
      if (!subj || (subj.default_target_days == null && subj.default_target_hours == null)) return;
      fromPlan[sid] = {
        target_days: subj.default_target_days ?? undefined,
        target_hours: subj.default_target_hours != null ? subj.default_target_hours : undefined,
      };
    });
    Object.entries(planSubjectTargetsOverride).forEach(([sid, t]) => {
      if (t.mode === 'none') delete fromPlan[sid];
      else if (t.mode === 'days') {
        const d = t.days?.trim() ? parseInt(t.days, 10) : null;
        fromPlan[sid] = { ...(fromPlan[sid] || {}), target_days: d ?? undefined, target_hours: undefined };
      } else if (t.mode === 'hours') {
        const h = t.hours?.trim() ? parseFloat(t.hours) : null;
        fromPlan[sid] = { ...(fromPlan[sid] || {}), target_days: undefined, target_hours: h ?? undefined };
      }
    });
    return Object.keys(fromPlan).length > 0 ? fromPlan : undefined;
  }, [targetScopeFromSettings, planHealth?.subject_targets, baseSubjectList, effectiveSubjectIds, blocks, planSubjectTargetsOverride]);

  // Effective plan target for apply/schedule: always from local state (prefilled from settings when new, or from plan when editing)
  const effectivePlanTarget = useMemo(() => ({
    constraint_mode: planConstraintMode,
    target_days: planConstraintMode === 'days' ? (parseInt(planTargetDays, 10) || null) : null,
    target_hours: planConstraintMode === 'hours' ? (parseFloat(planTargetHours) || null) : null,
  }), [planConstraintMode, planTargetDays, planTargetHours]);

  // Effective subject targets for apply: always use merged result (plan override + subject defaults)
  const effectiveSubjectTargetsForApply = effectiveSubjectTargets;

  // Holidays/breaks: from settings vs plan-only (for UI separation)
  const exclusionsFromSettings = useMemo(() => {
    const ex = planningDefaultsData?.exclusions || [];
    return {
      holidays: ex.filter((e) => e.exclusion_type === 'holiday').map((e) => ({
        date: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
        name: e.label || '',
      })),
      breaks: ex.filter((e) => e.exclusion_type === 'break').map((e) => ({
        start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
        end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
        name: e.label || '',
      })),
    };
  }, [planningDefaultsData]);
  const planOnlyExclusions = useMemo(() => {
    const matchH = (h) => exclusionsFromSettings.holidays.some((s) => s.date === (h.date || h.startDate) && (s.name || '').trim() === (h.name || '').trim());
    const matchB = (b) => exclusionsFromSettings.breaks.some((s) => s.start === (b.start || b.startDate) && s.end === (b.end || b.endDate) && (s.name || '').trim() === (b.name || '').trim());
    return {
      holidays: (customHolidays || []).filter((h) => !matchH(h)),
      breaks: (customBreaks || []).filter((b) => !matchB(b)),
    };
  }, [customHolidays, customBreaks, exclusionsFromSettings]);

  // Preview: exact dates and times that will get slots (for display under "X eligible days" and on preview screen)
  const previewSlotLines = useMemo(() => {
    if (!startDate || !endDate || blocks.length === 0) return [];
    const exclusionRanges = [
      ...(customHolidays || []).map((h) => [h.date, h.date]),
      ...(customBreaks || []).map((b) => [b.start || b.startDate, b.end || b.endDate].filter(Boolean)).filter((r) => r.length === 2),
    ];
    const lines = [];
    const childList = children || [];
    blocks.forEach((block) => {
      const subj = (baseSubjectList || []).find((s) => String(s.id) === String(block.subject_id));
      const subjectName = subj?.name || 'Subject';
      const timeLabel = block.all_day ? 'All day' : formatTimeRange(block.start_time, block.end_time);
      const blockChildIds =
        Array.isArray(block.child_ids) && block.child_ids.length > 0
          ? block.child_ids
          : block.subject_id
            ? getChildIdsForSubject(subj, childList)
            : allFamilyChildIds;
      const childNames = blockChildIds.length > 0
        ? blockChildIds.map((cid) => childList.find((c) => String(c.id) === String(cid))?.first_name || childList.find((c) => String(c.id) === String(cid))?.name || 'Child').join(', ')
        : 'Whole family';
      const dates = getBlockOccurrenceDates(block, startDate, endDate, exclusionRanges);
      dates.forEach((ymd) => {
        lines.push({
          date: ymd,
          dateLabel: formatDateDisplay(ymd),
          timeLabel,
          subjectName,
          childNames,
        });
      });
    });
    lines.sort((a, b) => a.date.localeCompare(b.date) || (a.timeLabel || '').localeCompare(b.timeLabel || ''));
    return lines;
  }, [blocks, startDate, endDate, customHolidays, customBreaks, baseSubjectList, children, allFamilyChildIds]);

  // When modal opens (without an explicit academic year id), load latest academic year so "Apply again" replaces instead of duplicating — unless openForNewPlan (header button: create new)
  useEffect(() => {
    if (!visible || !familyId || openForNewPlan) return;
    if (academicYearId || initialAcademicYearId) return;
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase
        .from('academic_years')
        .select('id')
        .eq('family_id', familyId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (!cancelled && rows?.length > 0) setAcademicYearId(rows[0].id);
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, openForNewPlan]);

  // When opening for "new plan" (header button), clear academic year so form starts empty
  useEffect(() => {
    if (visible && openForNewPlan && !initialAcademicYearId) {
      setAcademicYearId(null);
      setLoadError(null);
      loadedYearIdRef.current = null;
    }
  }, [visible, openForNewPlan, initialAcademicYearId]);

  // When opening from banner (Edit plan), sync passed academic year id and clear stale data so we only show "Loading plan…" until load completes
  useEffect(() => {
    if (visible && initialAcademicYearId) {
      setAcademicYearId(initialAcademicYearId);
      setSchedulePotential(null);
      schedulePotentialFetchedRef.current = false;
      setStartDate('');
      setEndDate('');
      setBlocks([]);
    }
  }, [visible, initialAcademicYearId]);

  // When true, user chose "Create new plan" from picker — show full form even with no plan selected
  // When opening for new plan with no year, go straight to METHOD (screen 1); no entry/loading flash
  // When openToEditPlanList, keep false so we show YOUR PLANS (existing plans), not the create flow
  const [startCreatingNew, setStartCreatingNew] = useState(() => !!(openForNewPlan && !initialAcademicYearId && !openToEditPlanList));

  // Fetch all academic years for this family for "Edit plan" picker (show every plan/year ever created, not only those with a plan row)
  const [previousPlans, setPreviousPlans] = useState([]);
  const [previousPlansLoading, setPreviousPlansLoading] = useState(true); // true so we don't skip to "create new" before fetch completes
  useEffect(() => {
    if (!visible || !openForNewPlan || !familyId) return;
    let cancelled = false;
    setPreviousPlansLoading(true);
    (async () => {
      const { data: rows, error: err } = await supabase
        .from('academic_years')
        .select('id, year_name, start_date, end_date, updated_at')
        .eq('family_id', familyId)
        .order('start_date', { ascending: false });
      if (!cancelled) {
        setPreviousPlansLoading(false);
        if (err) setPreviousPlans([]);
        else setPreviousPlans(Array.isArray(rows) ? rows : []);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, openForNewPlan, familyId]);

  // Preload plan summary data for each plan in the list so switching to summary doesn't flash loading
  useEffect(() => {
    if (!familyId || !previousPlans.length || previousPlansLoading) return;
    previousPlans.forEach((ay) => {
      const id = ay.id;
      if (!id || preloadedSummaryIdsRef.current.has(id)) return;
      preloadedSummaryIdsRef.current.add(id);
      getAcademicYear(id).then(({ data }) => {
        if (data) planSummaryCacheRef.current.set(id, data);
      });
    });
  }, [familyId, previousPlans, previousPlansLoading]);

  // When modal closes, defer clearing plan summary state until after close animation so we don't flash YOUR PLANS list
  useEffect(() => {
    if (!visible) {
      setEditingFromSummary(false);
      subjectPlanResolvedRef.current = false;
      const t = setTimeout(() => {
        setPlanSummaryYearId(null);
        setPlanSummaryData(null);
        setPlanSummaryError(null);
      }, 320);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // When opening from subject details or "Edit plan" in toolbar, show YOUR PLANS list directly (skip "Editing or creating?" choice)
  useEffect(() => {
    if (visible && (fromSubjectDetail || openToEditPlanList)) {
      setShowPlanManagerView(true);
    }
  }, [visible, fromSubjectDetail, openToEditPlanList]);

  // When opening from "Plan My Year" in toolbar, go straight to first planning step (logistics-first → logistics, else method)
  useEffect(() => {
    if (visible && openDirectlyToScope) {
      setStartCreatingNew(true);
      setPlanStep(getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST));
    }
  }, [visible, openDirectlyToScope]);

  // When opening from subject details and no plan exists, default to first step with one-subject preselected
  useEffect(() => {
    if (visible && fromSubjectDetail && !previousPlansLoading && previousPlans.length === 0) {
      setStartCreatingNew(true);
      setPlanStep(getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST));
      setPlanningScope('one_subject');
    }
  }, [visible, fromSubjectDetail, previousPlansLoading, previousPlans]);

  // When opened from subject details with a subject, find a plan that includes this subject and open its summary if any
  useEffect(() => {
    if (!visible || !fromSubjectDetail || !initialSubjectId || !familyId) return;
    if (previousPlansLoading || previousPlans.length === 0) {
      if (!previousPlansLoading && previousPlans.length === 0) subjectPlanResolvedRef.current = true;
      return;
    }
    if (subjectPlanResolvedRef.current) return;
    subjectPlanResolvedRef.current = true;
    let cancelled = false;
    (async () => {
      const subjectId = String(initialSubjectId);
      for (const ay of previousPlans) {
        if (!ay?.id || cancelled) break;
        const cached = planSummaryCacheRef.current.get(ay.id);
        if (cached?.plan?.blocks?.some((b) => String(b?.subject_id) === subjectId)) {
          if (!cancelled) {
            planSummaryCacheRef.current.set(ay.id, cached);
            setPlanSummaryData(cached);
            setPlanSummaryLoading(false);
            setPlanSummaryError(null);
            setPlanSummaryYearId(ay.id);
          }
          return;
        }
        const { data } = await getAcademicYear(ay.id);
        if (cancelled) return;
        if (data?.plan?.blocks?.some((b) => String(b?.subject_id) === subjectId)) {
          if (data) planSummaryCacheRef.current.set(ay.id, data);
          setPlanSummaryData(data || null);
          setPlanSummaryLoading(false);
          setPlanSummaryError(null);
          setPlanSummaryYearId(ay.id);
          return;
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, fromSubjectDetail, initialSubjectId, familyId, previousPlans, previousPlansLoading]);

  // When opening from event details (Edit Plan) or plan health with a specific plan, go straight to plan summary view
  const openedToPlanSummaryRef = useRef(false);
  useEffect(() => {
    if (!visible) {
      openedToPlanSummaryRef.current = false;
      return;
    }
    if (initialAcademicYearId && !openForNewPlan && !openedToPlanSummaryRef.current) {
      openedToPlanSummaryRef.current = true;
      if (initialPlanSummaryData) {
        planSummaryCacheRef.current.set(initialAcademicYearId, initialPlanSummaryData);
        setPlanSummaryData(initialPlanSummaryData);
        setPlanSummaryLoading(false);
        setPlanSummaryError(null);
      }
      setPlanSummaryYearId(initialAcademicYearId);
    }
  }, [visible, initialAcademicYearId, initialPlanSummaryData, openForNewPlan]);

  // When user selects a plan from the list, show summary immediately from cache if available, then refresh in background
  useEffect(() => {
    if (!planSummaryYearId || !familyId) {
      setPlanSummaryData(null);
      setPlanSummaryError(null);
      return;
    }
    const cached = planSummaryCacheRef.current.get(planSummaryYearId);
    if (cached) {
      setPlanSummaryData(cached);
      setPlanSummaryError(null);
      setPlanSummaryLoading(false);
    } else {
      setPlanSummaryLoading(true);
      setPlanSummaryError(null);
    }
    let cancelled = false;
    getAcademicYear(planSummaryYearId).then(({ data, error }) => {
      if (cancelled) return;
      setPlanSummaryLoading(false);
      if (error) {
        if (!cached) {
          setPlanSummaryData(null);
          setPlanSummaryError(error.message || 'Failed to load plan.');
        }
      } else {
        if (data) planSummaryCacheRef.current.set(planSummaryYearId, data);
        setPlanSummaryData(data || null);
        setPlanSummaryError(null);
      }
    });
    return () => { cancelled = true; };
  }, [planSummaryYearId, familyId]);

  // When an event is deleted and plan summary is open, refetch so "Dates with events" updates immediately
  useEffect(() => {
    if (typeof window === 'undefined' || !planSummaryYearId || !familyId) return;
    const handler = () => {
      planSummaryCacheRef.current.delete(planSummaryYearId);
      getAcademicYear(planSummaryYearId).then(({ data, error }) => {
        if (!error && data) {
          planSummaryCacheRef.current.set(planSummaryYearId, data);
          setPlanSummaryData(data);
        }
      });
    };
    window.addEventListener('eventDeleted', handler);
    return () => window.removeEventListener('eventDeleted', handler);
  }, [planSummaryYearId, familyId]);

  // When we have academicYearId, load full year + plan to populate form (for "Edit plan" from banner)
  const loadedYearIdRef = useRef(null);
  const savedTargetsAppliedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCloseRef.current = onClose;
    onCompleteRef.current = onComplete;
  }, [onClose, onComplete]);
  useEffect(() => {
    const yearIdToLoad = initialAcademicYearId || academicYearId;
    if (!visible || !yearIdToLoad || !familyId) return;
    if (loadedYearIdRef.current === yearIdToLoad) return;
    let cancelled = false;
    setYearLoadInProgress(true);
    (async () => {
      const { data, error } = await getAcademicYear(yearIdToLoad);
      if (!cancelled) setYearLoadInProgress(false);
      if (cancelled) return;
      if (error) {
        const isAuth = error.status === 401 || (error.message && /token|auth|login/i.test(error.message));
        if (isAuth) {
          setLoadError('Please log in to view this plan. If you’re already logged in, try refreshing the page.');
        } else if (error.message && /invalid response format/i.test(error.message)) {
          const preview = error.preview ? ` Response: "${String(error.preview).slice(0, 100)}${String(error.preview).length > 100 ? '…' : ''}"` : '';
          setLoadError(`Could not load plan (server returned invalid data).${preview} Restart the backend and try again.`);
        } else {
          setLoadError(error.message || 'Failed to load plan.');
        }
        return;
      }
      if (!data) return;
      setLoadError(null);
      loadedYearIdRef.current = yearIdToLoad;
      setAcademicYearId(yearIdToLoad);
      const created = data.plan?.created_at || data.created_at;
      const updated = data.plan?.updated_at || data.updated_at;
      setPlanCreatedAt(created || null);
      setPlanUpdatedAt(updated || null);
      setStartDate(data.start_date || '');
      setEndDate(data.end_date || '');
      setMode(data.mode || 'FIXED_END');
      if (data.holiday_settings) {
        setFollowGlobalHolidays(data.holiday_settings.follow_global_holidays !== false);
        setCountryCode(data.holiday_settings.holiday_country_code || 'US');
        setRegionCode(data.holiday_settings.holiday_region || null);
        setExcludedPublicHolidayDates(Array.isArray(data.holiday_settings.excluded_holiday_dates) ? data.holiday_settings.excluded_holiday_dates : []);
      }
      if (data.plan) {
        const p = data.plan;
        setStartDate(p.start_date || data.start_date || '');
        setEndDate(p.end_date || data.end_date || '');
        setPlanConstraintMode(p.constraint_mode === 'hours' ? 'hours' : p.constraint_mode === 'days' ? 'days' : 'none');
        setPlanTargetDays(p.target_days != null ? String(p.target_days) : '180');
        setPlanTargetHours(p.target_hours != null ? String(p.target_hours) : '1000');
        if (p.subject_targets && typeof p.subject_targets === 'object' && Object.keys(p.subject_targets).length > 0) {
          const overrides = {};
          Object.entries(p.subject_targets).forEach(([sid, st]) => {
            if (st && (st.target_days != null || st.target_hours != null)) {
              overrides[sid] = {
                mode: st.target_days != null ? 'days' : 'hours',
                days: st.target_days != null ? String(st.target_days) : '',
                hours: st.target_hours != null ? String(st.target_hours) : '',
              };
            }
          });
          setPlanSubjectTargetsOverride(overrides);
        }
        const planBlocks = Array.isArray(p.blocks) ? p.blocks : [];
        // Derive subject + child selection from plan blocks
        if (planBlocks.length > 0) {
          const subjectIdsFromPlan = Array.from(
            new Set(
              planBlocks
                .map((b) => b.subject_id)
                .filter(Boolean)
            )
          );
          if (subjectIdsFromPlan.length > 0) {
            setSelectedSubjectIds(subjectIdsFromPlan);
          }
        }
        if (planBlocks.length > 0) {
          setBlocks(planBlocks.map((b) => ({
            block_id: b.block_id || (crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${b.subject_id}`),
            subject_id: b.subject_id,
            child_ids: Array.isArray(b.child_ids) ? b.child_ids : [],
            weekdays: Array.isArray(b.weekdays) ? b.weekdays : [],
            start_time: b.start_time || '09:00',
            end_time: b.end_time || '10:00',
            all_day: !!b.all_day,
          })));
        }
      }
      // Load custom holidays (API returns merged list; we need only CUSTOM_HOLIDAY for editing)
      const customHols = Array.isArray(data.holidays)
        ? data.holidays
            .filter((h) => (h.type || 'CUSTOM_HOLIDAY') === 'CUSTOM_HOLIDAY')
            .map((h) => ({
              date: typeof h.date === 'string' ? h.date.slice(0, 10) : (h.date?.isoformat?.() || String(h.date || '').slice(0, 10)),
              name: h.name || '',
              type: 'CUSTOM_HOLIDAY',
            }))
        : [];
      setCustomHolidays(customHols);
      // Load custom breaks from planner_exclusions (academic_year scope)
      const { data: exclusions } = await getAcademicYearExclusions(yearIdToLoad);
      if (!cancelled && exclusions && exclusions.length > 0) {
        const breaks = exclusions.filter((e) => e.exclusion_type === 'break').map((e) => ({
          start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
          end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
          name: e.label || '',
        }));
        setCustomBreaks(breaks);
      } else if (!cancelled) {
        setCustomBreaks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, initialAcademicYearId, academicYearId, familyId]);
  useEffect(() => {
    if (!visible) {
      loadedYearIdRef.current = null;
      savedTargetsAppliedRef.current = false;
      setLoadError(null);
      setPlanCreatedAt(null);
      setPlanUpdatedAt(null);
      setYearLoadInProgress(false);
      // Defer so we don't flash "Create new plan" first screen during close animation
      const t = setTimeout(() => {
        setStartCreatingNew(false);
        setPreviousPlansLoading(true);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [visible]);

  // Fetch target_scope from family_planner_settings for plan resolution (overall vs per_subject)
  useEffect(() => {
    if (!visible || !familyId) return;
    getFamilyPlannerSettings(familyId).then(({ data }) => {
      if (data?.target_scope) setTargetScopeFromSettings(data.target_scope);
      else setTargetScopeFromSettings('overall');
    });
  }, [visible, familyId]);

  // Keep per-subject cadence draft in sync with instructional blocks (for future API / validation).
  useEffect(() => {
    if (!PLAN_MY_YEAR_MULTI_SUBJECT_CADENCE) return;
    if (!blocks?.length) {
      setPerSubjectCadenceDraft({});
      return;
    }
    const next = {};
    blocks.forEach((b) => {
      if (b?.subject_id) {
        next[String(b.subject_id)] = {
          weekdays: b.weekdays || [],
          start_time: b.start_time,
          end_time: b.end_time,
          all_day: !!b.all_day,
        };
      }
    });
    setPerSubjectCadenceDraft((prev) => {
      try {
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      } catch (_) {
        /* ignore */
      }
      return next;
    });
  }, [blocks]);

  // Load planning defaults for the summary card when Logistics step is shown
  useEffect(() => {
    if (!visible || !familyId || planStep !== 'logistics') return;
    let cancelled = false;
    setPlanningDefaultsLoading(true);
    getPlanDefaultsFromSettings(familyId).then(({ settings, exclusions, excluded_holiday_dates, error }) => {
      if (cancelled) return;
      setPlanningDefaultsLoading(false);
      if (!error) setPlanningDefaultsData({ settings, exclusions: exclusions || [], excluded_holiday_dates: excluded_holiday_dates || [] });
      else setPlanningDefaultsData(null);
    });
    return () => { cancelled = true; };
  }, [visible, familyId, planStep]);

  // When opening for a new plan (no existing plan loaded), pre-fill from family_planner_settings + planner_exclusions, then fallback to latest academic_year
  useEffect(() => {
    if (!visible || !familyId || academicYearId || initialAcademicYearId || savedTargetsAppliedRef.current) return;
    let cancelled = false;
    (async () => {
      const { settings, exclusions, excluded_holiday_dates, error: settingsErr } = await getPlanDefaultsFromSettings(familyId);
      if (cancelled) return;
      if (!settingsErr && settings) {
        const hasConstraint = settings.default_constraint_mode && settings.default_constraint_mode !== 'none';
        const hasTargetDays = settings.default_target_days != null;
        const hasTargetHours = settings.default_target_hours != null;
        const hasExclusions = exclusions && exclusions.length > 0;
        const hasExcludedDates = excluded_holiday_dates && excluded_holiday_dates.length > 0;
        if (hasConstraint || hasTargetDays || hasTargetHours || hasExclusions || hasExcludedDates) {
          savedTargetsAppliedRef.current = true;
          setFollowGlobalHolidays(settings.follow_public_holidays !== false);
          if (settings.holiday_country) setCountryCode(settings.holiday_country);
          if (settings.holiday_region != null) setRegionCode(settings.holiday_region);
          if (hasExcludedDates) setExcludedPublicHolidayDates(excluded_holiday_dates);
          if (hasTargetDays) {
            setPlanConstraintMode('days');
            setPlanTargetDays(String(settings.default_target_days ?? 180));
          } else if (hasTargetHours) {
            setPlanConstraintMode('hours');
            setPlanTargetHours(String(settings.default_target_hours ?? 1000));
            if (settings.default_planned_hours_per_day != null) setHoursPerDay(String(settings.default_planned_hours_per_day));
          } else if (hasConstraint) {
            setPlanConstraintMode(settings.default_constraint_mode || 'none');
            if (settings.default_constraint_mode === 'days') setPlanTargetDays(String(settings.default_target_days ?? 180));
            if (settings.default_constraint_mode === 'hours') {
              setPlanTargetHours(String(settings.default_target_hours ?? 1000));
              if (settings.default_planned_hours_per_day != null) setHoursPerDay(String(settings.default_planned_hours_per_day));
            }
          }
          if (hasExclusions) {
            const holidays = exclusions.filter((e) => e.exclusion_type === 'holiday').map((e) => ({
              date: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
              name: e.label || '',
              type: 'CUSTOM_HOLIDAY',
            }));
            const breaks = exclusions.filter((e) => e.exclusion_type === 'break').map((e) => ({
              start: typeof e.start_date === 'string' ? e.start_date.slice(0, 10) : (e.start_date?.isoformat?.() || String(e.start_date || '').slice(0, 10)),
              end: typeof e.end_date === 'string' ? e.end_date.slice(0, 10) : (e.end_date?.isoformat?.() || String(e.end_date || '').slice(0, 10)),
              name: e.label || '',
            }));
            setCustomHolidays(holidays);
            setCustomBreaks(breaks);
          }
        }
      }
      if (!savedTargetsAppliedRef.current) {
        const { data: ay, error } = await supabase
          .from('academic_years')
          .select('id, start_date, end_date, target_instructional_days, target_instructional_hours')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled || error || !ay) return;
        const hasDates = ay.start_date || ay.end_date;
        const hasTargetDays = ay.target_instructional_days != null;
        const hasTargetHours = ay.target_instructional_hours != null;
        if (!hasDates && !hasTargetDays && !hasTargetHours) return;
        if (cancelled) return;
        savedTargetsAppliedRef.current = true;
        if (ay.start_date) setStartDate(ay.start_date);
        if (ay.end_date) setEndDate(ay.end_date);
        if (hasTargetDays) {
          setPlanConstraintMode('days');
          setPlanTargetDays(String(ay.target_instructional_days));
        } else if (hasTargetHours) {
          setPlanConstraintMode('hours');
          setPlanTargetHours(String(ay.target_instructional_hours));
        }
      } else {
        const { data: ay } = await supabase
          .from('academic_years')
          .select('start_date, end_date')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!cancelled && ay && (ay.start_date || ay.end_date)) {
          if (ay.start_date) setStartDate(ay.start_date);
          if (ay.end_date) setEndDate(ay.end_date);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, academicYearId, initialAcademicYearId]);

  // When opening with initial subject (e.g. from "Generate curriculum"), scope to that subject
  useEffect(() => {
    if (!visible || !initialSubjectId) return;
    const subjectExists = baseSubjectList.some((s) => String(s.id) === String(initialSubjectId));
    if (subjectExists) {
      setSelectedSubjectIds([initialSubjectId]);
    }
  }, [visible, initialSubjectId, baseSubjectList]);

  // When opening with initial material (e.g. from Library "Build curriculum from this"), start in upload mode with that material
  useEffect(() => {
    if (!visible || !initialMaterialId) return;
    setPlanSource('upload');
    setSelectedMaterialId(initialMaterialId);
  }, [visible, initialMaterialId]);

  // When modal opens for new plan (no existing plan), leave subject selection empty until the user picks
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current && !initialAcademicYearId) {
      if (baseSubjectList.length > 0 && !initialSubjectId) {
        setSelectedSubjectIds([]);
      }
    }
    if (visible && !prevVisibleRef.current) {
      const isEditPlanMode = !!initialAcademicYearId;
      setSectionWhoExpanded(!isEditPlanMode);
      // Edit Plan: expand sections 2 (Scheduled Class Days) and 3 (Dates & Requirements); new plan: expand all
      setSectionScheduleExpanded(true);
      setSectionDatesExpanded(true);
    }
    if (!visible) {
      // Defer view resets so we don't flash "Plan Manager / Create New Plan" during close animation
      const t = setTimeout(() => {
        setSuggestionAccepted(false);
        setExtendSuggestionAccepted(false);
        setAcceptedExtendDate(null);
        setHighlightBlockIndex(null);
        setUnitFocusSubjectId(null);
        setLastSavedUnitSubjectId(null);
        setPlanStep(getInitialPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST));
        setPlanningScope(null);
        setShowPlanManagerView(false);
        setShowPreviewScreen(false);
        setShowMaterialDropdown(false);
        setParsedContent(null);
        setParsingContent(false);
        setParseContentError(null);
      }, 350);
      return () => clearTimeout(t);
    }
    prevVisibleRef.current = visible;
  }, [visible, baseSubjectList, initialAcademicYearId]);

  // Prune selectedSubjectIds if subject list shrinks (e.g. data reload)
  useEffect(() => {
    if (subjectsForCurrentSelection.length === 0) return;
    const validIds = new Set(subjectsForCurrentSelection.map((s) => s.id));
    setSelectedSubjectIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev;
      return next;
    });
  }, [subjectsForCurrentSelection]);
  

  // Clear parsed content when source or input changes so user re-parses
  useEffect(() => {
    if (planSource === 'upload' || planSource === 'link' || planSource === 'paste' || planSource === 'paste_plain') {
      setParsedContent(null);
      setParseContentError(null);
    }
  }, [planSource, sourceUrl, pastedText, selectedMaterialId]);
  
  // Load materials when entering upload mode
  useEffect(() => {
    if (planStep === 'unit_structure' && planSource === 'upload' && familyId && materials.length === 0 && !loadingMaterials) {
      const loadMaterials = async () => {
        setLoadingMaterials(true);
        try {
          const data = await getMaterials(familyId, {});
          setMaterials(data || []);
        } catch (err) {
          console.error('Failed to load materials:', err);
          setMaterials([]);
        } finally {
          setLoadingMaterials(false);
        }
      };
      loadMaterials();
    }
  }, [planStep, planSource, familyId, materials.length, loadingMaterials]);
  
  // Load unit structure data when entering unit_structure step (only if no draft data)
  useEffect(() => {
    if (planStep === 'unit_structure' && unitPipelineSubjectId && familyId && !unitStructureData && !loadingUnitStructure && !draftData && !manualDraft) {
      const loadUnitStructure = async () => {
        setLoadingUnitStructure(true);
        try {
          const subjectId = unitPipelineSubjectId;
          const { data, error } = await supabase
            .from('events')
            .select('id, title, curriculum_unit_title, curriculum_lesson_sequence, curriculum_metadata, start_ts, is_reference_date')
            .eq('family_id', familyId)
            .eq('subject_id', subjectId)
            .eq('is_curriculum_related', true)
            .is('deleted_at', null)
            .order('curriculum_unit_title', { ascending: true })
            .order('curriculum_lesson_sequence', { ascending: true });
          
          if (error) throw error;
          
          // Group by unit
          const unitsMap = new Map();
          (data || []).forEach((event) => {
            const unitTitle = event.curriculum_unit_title || 'Untitled Unit';
            if (!unitsMap.has(unitTitle)) {
              unitsMap.set(unitTitle, []);
            }
            const metadata = event.curriculum_metadata || {};
            const lessonType = metadata.lesson_type || 'lesson';
            unitsMap.get(unitTitle).push({
              id: event.id,
              title: event.title,
              type: lessonType,
              sequence: event.curriculum_lesson_sequence || 0,
              date: event.start_ts ? new Date(event.start_ts).toISOString().split('T')[0] : null,
              isReferenceOnly: event.is_reference_date || false,
              minutes: metadata.minutes_est || 60,
            });
          });
          
          // Convert to array and sort lessons within each unit
          const units = Array.from(unitsMap.entries()).map(([title, lessons]) => ({
            title,
            lessons: lessons.sort((a, b) => a.sequence - b.sequence),
          }));
          
          setUnitStructureData({ units });
          // Expand first unit by default
          if (units.length > 0) {
            setExpandedUnits(new Set([0]));
          }
        } catch (err) {
          console.error('Error loading unit structure:', err);
        } finally {
          setLoadingUnitStructure(false);
        }
      };
      loadUnitStructure();
    }
  }, [planStep, unitPipelineSubjectId, familyId, unitStructureData, loadingUnitStructure, draftData, manualDraft]);

  // Load materials when upload is selected (for inline select)
  const loadMaterialsForUpload = useCallback(async () => {
    if (!familyId) return;
    setLoadingMaterials(true);
    try {
      const data = await getMaterials(familyId, {});
      setMaterials(data || []);
    } catch (err) {
      console.error('[PlanYearModal] Error loading materials:', err);
      setMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  }, [familyId]);

  useEffect(() => {
    if (visible && planSource === 'upload' && familyId) {
      loadMaterialsForUpload();
    }
  }, [visible, planSource, familyId, loadMaterialsForUpload]);

  // Refetch materials when user saves a new material (from Add Material modal opened via event)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => {
      if (planSource === 'upload' && familyId) loadMaterialsForUpload();
    };
    window.addEventListener('materialSaved', handler);
    return () => window.removeEventListener('materialSaved', handler);
  }, [planSource, familyId, loadMaterialsForUpload]);

  /** Parse content for upload/link/paste so the next screen can use it to plan events. */
  const handleParseContent = useCallback(async () => {
    if (planSource === 'upload' && !selectedMaterialId) {
      setParseContentError('Please select a material.');
      return;
    }
    if (planSource === 'link' && !sourceUrl.trim()) {
      setParseContentError('Please enter a source URL.');
      return;
    }
    if (planSource === 'paste' && !pastedText.trim()) {
      setParseContentError('Please paste your list of dates and events.');
      return;
    }
    const studentIds = allFamilyChildIds;
    if (!studentIds.length) {
      setParseContentError('Add at least one child in your family to continue.');
      return;
    }
    setParsingContent(true);
    setParseContentError(null);
    try {
      const startDateObj = startDate ? new Date(startDate + 'T12:00:00') : new Date();
      const startDateISO = startDateObj.toISOString().split('T')[0];

      if (planSource === 'paste') {
        const preview = parsePastedListToCurriculum(pastedText.trim(), studentIds, startDateISO);
        if (!preview?.unit || !preview?.lessons?.length) {
          setParseContentError('No lines found. Paste a list of topics, one per line.');
        } else {
          setParsedContent(preview);
        }
        setParsingContent(false);
        return;
      }

      let weeks = 1;
      if (startDate && endDate) {
        const end = new Date(endDate + 'T12:00:00');
        const start = new Date(startDate + 'T12:00:00');
        weeks = Math.max(1, Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000)));
      }
      const buildPayload = {
        mode: planSource === 'link' ? 'link' : 'material',
        topic: null,
        source_url: planSource === 'link' ? sourceUrl.trim() : null,
        material_id: planSource === 'upload' ? selectedMaterialId : null,
        student_ids: studentIds,
        constraints: {
          weeks,
          minutes_per_day: 60,
          weekdays_only: true,
          difficulty: 'standard',
          start_date: startDateISO,
        },
      };
      const { data: preview, error: buildError } = await buildCurriculum(buildPayload);
      if (buildError) {
        throw new Error(buildError.message || buildError.detail || 'Failed to parse content');
      }
      if (!preview?.unit || !preview?.lessons?.length) {
        throw new Error('No lessons were generated. Try adjusting your content.');
      }
      setParsedContent(preview);
    } catch (err) {
      setParseContentError(err?.message || 'Failed to parse content');
    } finally {
      setParsingContent(false);
    }
  }, [planSource, sourceUrl, pastedText, selectedMaterialId, allFamilyChildIds, startDate, endDate]);

  // When user selects a content source (paste/link/upload), auto-fill dates if empty and expand Who & subjects + Dates so they see what will be used
  const prevPlanSourceRef = useRef(planSource);
  useEffect(() => {
    const isContentSource = planSource === 'paste' || planSource === 'paste_plain' || planSource === 'link' || planSource === 'upload';
    if (!isContentSource) {
      prevPlanSourceRef.current = planSource;
      return;
    }
    prevPlanSourceRef.current = planSource;
    setSectionWhoExpanded(true);
    setSectionDatesExpanded(true);

    // Default dates when empty: start = today, end = 2 months from now
    let defaultStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null;
    if (!defaultStart) {
      const today = new Date();
      defaultStart = toLocalYYYYMMDD(today);
      setStartDate(defaultStart);
    }
    const needEnd = !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate);
    if (needEnd) {
      const startObj = new Date((defaultStart || startDate) + 'T12:00:00');
      const endObj = new Date(startObj);
      endObj.setMonth(endObj.getMonth() + 2);
      setEndDate(toLocalYYYYMMDD(endObj));
    }
  }, [planSource, startDate, endDate]);

  // Phase 2: Fetch lesson-to-slot mapping preview when we have parsed content + dates (no commit yet)
  useEffect(() => {
    const isContentPath = planSource === 'link' || planSource === 'paste' || planSource === 'upload';
    if (!isContentPath || !parsedContent?.lessons?.length || !startDate || !endDate || !familyId) {
      setPacingPreview(null);
      setPacingPreviewError(null);
      return;
    }
    const studentIds = allFamilyChildIds;
    if (!studentIds.length) {
      setPacingPreview(null);
      return;
    }
    let cancelled = false;
    setPacingPreviewLoading(true);
    setPacingPreviewError(null);
    const lessonsForPacing = parsedContent.lessons.map((l) => ({
      title: l.title,
      sequence_index: l.sequence_index,
      minutes_est: l.minutes_est ?? 60,
    }));
    previewPacing({
      family_id: familyId,
      subject_id: effectiveSubjectIds?.[0] ?? null,
      student_ids: studentIds,
      start_date: startDate,
      end_date: endDate,
      academic_year_id: academicYearId || undefined,
      lessons: lessonsForPacing,
    })
      .then(({ data, error }) => {
        if (cancelled) return;
        setPacingPreviewLoading(false);
        if (error) {
          setPacingPreviewError(error?.message || 'Could not load placement preview');
          setPacingPreview(null);
          return;
        }
        setPacingPreview(data || null);
        setPacingPreviewError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setPacingPreviewLoading(false);
          setPacingPreviewError('Could not load placement preview');
          setPacingPreview(null);
        }
      });
    return () => { cancelled = true; };
  }, [planSource, parsedContent, startDate, endDate, familyId, allFamilyChildIds, effectiveSubjectIds, academicYearId]);

  const hasOnlyGenericBlocks = blocks.length > 0 && blocks.every((b) => !b.subject_id);
  const isPlaceholderOnlyScope = planningScope === 'placeholders_only' || (planningScope === 'full_year' && planSource === 'placeholders') || hasOnlyGenericBlocks;

  // Auto-sync blocks to required subjects: one block per effective subject (require all). Skip when placeholder-only scope — user adds generic blocks manually.
  const effectiveSubjectIdsKey = effectiveSubjectIds.slice().sort().join(',');
  const syncBlocksFromEffectiveSubjects = useCallback(() => {
    if (isPlaceholderOnlyScope) return; // do not replace blocks with subject-based blocks
    if (effectiveSubjectIds.length === 0) {
      setBlocks([]);
      return;
    }
    setBlocks((prevBlocks) => {
      const bySubject = new Map(prevBlocks.map((b) => [b.subject_id, b]));
      return effectiveSubjectIds.map((subjectId) => {
        const subj = baseSubjectList.find((s) => String(s.id) === String(subjectId));
        const resolvedChildIds = getChildIdsForSubject(subj, children);
        const existing = bySubject.get(subjectId);
        if (existing) {
          return { ...existing, child_ids: resolvedChildIds };
        }
        return {
          block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${subjectId}`,
          subject_id: subjectId,
          child_ids: resolvedChildIds,
          weekdays: [],
          start_time: '09:00',
          end_time: '10:00',
          all_day: false,
        };
      });
    });
  }, [effectiveSubjectIdsKey, effectiveSubjectIds.length, isPlaceholderOnlyScope, baseSubjectList, children]);

  useEffect(() => {
    syncBlocksFromEffectiveSubjects();
  }, [syncBlocksFromEffectiveSubjects]);

  // When modal opens for new plan, re-sync blocks after a short delay so we pick up children/subjects that may arrive after first render (fixes "whole family + all subjects" not showing in card 2 until user toggles)
  useEffect(() => {
    if (!visible || academicYearId) return;
    const t = setTimeout(() => {
      syncBlocksFromEffectiveSubjects();
    }, 50);
    return () => clearTimeout(t);
  }, [visible, academicYearId, syncBlocksFromEffectiveSubjects]);

  // Compute schedule potential when block structure / dates / exclusions / targets change — not when only cadence (weekdays, times) changes
  const triggerSchedulePotential = useCallback((immediate = false) => {
    if (schedulePotentialTimeoutRef.current) clearTimeout(schedulePotentialTimeoutRef.current);
    const delay = immediate || !schedulePotentialFetchedRef.current ? 0 : 120;
    schedulePotentialTimeoutRef.current = setTimeout(async () => {
      const blocksNow = blocksRef.current || [];
      if (!familyId || !startDate || !endDate || blocksNow.length === 0) {
        setSchedulePotential(null);
        setComputingPotential(false);
        return;
      }
      // Backend returns 400 if start_date > end_date; skip request to avoid calendar error
      const ymd = /^\d{4}-\d{2}-\d{2}$/;
      if (ymd.test(startDate) && ymd.test(endDate) && startDate > endDate) {
        setSchedulePotential(null);
        setComputingPotential(false);
        return;
      }
      setComputingPotential(true);
      try {
        const planChildrenIds = allFamilyChildIds;
        const { data, error } = await computeSchedulePotential({
          family_id: familyId,
          start_date: startDate,
          end_date: endDate,
          blocks: blocksNow.map((b) => ({
            block_id: b.block_id,
            subject_id: b.subject_id,
            child_ids: b.child_ids || [],
            weekdays: b.weekdays || [],
            start_time: b.start_time || '09:00',
            end_time: b.end_time || '10:00',
            all_day: b.all_day || false,
          })),
          custom_holidays: customHolidays.map((h) => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
          custom_breaks: (customBreaks || []).map((b) => ({ start: b.start, end: b.end, name: b.name || 'Break' })),
          follow_public_holidays: followGlobalHolidays ?? false,
          holiday_region: regionCode ? `${countryCode}:${regionCode}` : countryCode,
          target_days: effectivePlanTarget.target_days ?? null,
          target_hours: effectivePlanTarget.target_hours ?? null,
          plan_children_ids: planChildrenIds.length > 0 ? planChildrenIds : undefined,
          subject_targets: effectiveSubjectTargetsForApply ?? effectiveSubjectTargets ?? undefined,
        });
        if (!error && data) {
          setSchedulePotential(data);
          schedulePotentialFetchedRef.current = true;
        } else {
          setSchedulePotential(null);
        }
      } catch {
        setSchedulePotential(null);
      } finally {
        setComputingPotential(false);
      }
    }, delay);
  }, [familyId, startDate, endDate, schedulePotentialBlocksStructureKey, schedulePotentialCadencePrimedKey, customHolidays, customBreaks, followGlobalHolidays, countryCode, regionCode, effectivePlanTarget, allFamilyChildIds, effectiveSubjectTargets, effectiveSubjectTargetsForApply]);

  useEffect(() => {
    if (!visible) {
      schedulePotentialFetchedRef.current = false;
    }
    if (visible && blocks.length > 0 && startDate && endDate) {
      triggerSchedulePotential(!schedulePotentialFetchedRef.current);
    } else {
      setSchedulePotential(null);
    }
    return () => {
      if (schedulePotentialTimeoutRef.current) clearTimeout(schedulePotentialTimeoutRef.current);
    };
  }, [visible, blocks.length, schedulePotentialBlocksStructureKey, schedulePotentialCadencePrimedKey, startDate, endDate, customHolidays, customBreaks, triggerSchedulePotential]);

  // Phase 4 / Phase 5: Flex Learning suggestion when delta < 0 (Strategy A from DESIGN_PLAN_YEAR)
  const isUnderTarget = schedulePotential && (
    (effectivePlanTarget.constraint_mode === 'days' && schedulePotential.delta_days != null && schedulePotential.delta_days < 0) ||
    (effectivePlanTarget.constraint_mode === 'hours' && schedulePotential.delta_hours != null && schedulePotential.delta_hours < 0)
  );

  // Compute Flex Learning suggestion: one block on least-loaded weekday, show +N days improvement
  useEffect(() => {
    if (!visible) {
      setFlexSuggestion(null);
      return;
    }
    if (!isUnderTarget || !schedulePotential || !startDate || !endDate || !familyId || blocks.length === 0) {
      setFlexSuggestion(null);
      return;
    }
    const planChildrenIds = allFamilyChildIds;
    if (planChildrenIds.length === 0) {
      setFlexSuggestion(null);
      return;
    }
    if (flexSuggestionTimeoutRef.current) clearTimeout(flexSuggestionTimeoutRef.current);
    flexSuggestionTimeoutRef.current = setTimeout(async () => {
      setComputingFlexSuggestion(true);
      try {
        // Count block occurrences per weekday (1=Mon .. 5=Fri)
        const countByWeekday = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        blocks.forEach((b) => {
          (b.weekdays || []).forEach((w) => {
            if (w >= 1 && w <= 5) countByWeekday[w] = (countByWeekday[w] || 0) + 1;
          });
        });
        const minCount = Math.min(...[1, 2, 3, 4, 5].map((w) => countByWeekday[w] ?? 0));
        const leastLoaded = [1, 2, 3, 4, 5].find((w) => (countByWeekday[w] ?? 0) === minCount) || 1;
        const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const flexBlockId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `flex-${Date.now()}`;
        const candidateBlock = {
          block_id: flexBlockId,
          subject_id: null,
          child_ids: planChildrenIds,
          weekdays: [leastLoaded],
          start_time: '10:00',
          end_time: '11:00',
          all_day: false,
        };
        const blocksWithFlex = [
          ...blocks.map((b) => ({
            block_id: b.block_id,
            subject_id: b.subject_id,
            child_ids: b.child_ids || [],
            weekdays: b.weekdays || [],
            start_time: b.start_time || '09:00',
            end_time: b.end_time || '10:00',
            all_day: b.all_day || false,
          })),
          candidateBlock,
        ];
        const { data, error } = await computeSchedulePotential({
          family_id: familyId,
          start_date: startDate,
          end_date: endDate,
          blocks: blocksWithFlex,
          custom_holidays: customHolidays.map((h) => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
          custom_breaks: (customBreaks || []).map((b) => ({ start: b.start, end: b.end, name: b.name || 'Break' })),
          follow_public_holidays: followGlobalHolidays ?? false,
          holiday_region: regionCode ? `${countryCode}:${regionCode}` : countryCode,
          target_days: effectivePlanTarget.target_days ?? null,
          target_hours: effectivePlanTarget.target_hours ?? null,
          plan_children_ids: planChildrenIds,
          subject_targets: effectiveSubjectTargetsForApply ?? effectiveSubjectTargets ?? undefined,
        });
        if (error || !data) {
          setFlexSuggestion(null);
          return;
        }
        const improvementDays = (data.projected_days ?? 0) - (schedulePotential.projected_days ?? 0);
        const improvementHours = (data.projected_hours ?? 0) - (schedulePotential.projected_hours ?? 0);
        const hasImprovement = (effectivePlanTarget.constraint_mode === 'days' && improvementDays > 0) || (effectivePlanTarget.constraint_mode === 'hours' && improvementHours > 0);
        if (hasImprovement) {
          setFlexSuggestion({
            proposedBlock: { ...candidateBlock, block_id: flexBlockId },
            improvement_days: improvementDays,
            improvement_hours: improvementHours,
            weekdayLabel: weekdayLabels[leastLoaded],
          });
        } else {
          setFlexSuggestion(null);
        }
      } catch {
        setFlexSuggestion(null);
      } finally {
        setComputingFlexSuggestion(false);
      }
    }, 400);
    return () => {
      if (flexSuggestionTimeoutRef.current) clearTimeout(flexSuggestionTimeoutRef.current);
    };
  }, [visible, isUnderTarget, schedulePotential, blocks, startDate, endDate, familyId, allFamilyChildIds, customHolidays, customBreaks, followGlobalHolidays, countryCode, regionCode, effectivePlanTarget, effectiveSubjectTargets, effectiveSubjectTargetsForApply]);

  useEffect(() => {
    if (!visible) setFlexSuggestion(null);
  }, [visible]);

  const handleApplyFlexSuggestion = useCallback(() => {
    if (flexSuggestion?.proposedBlock) {
      const { block_id, subject_id, child_ids, weekdays, start_time, end_time, all_day } = flexSuggestion.proposedBlock;
      setBlocks((prev) => [...prev, { block_id, subject_id, child_ids, weekdays, start_time, end_time, all_day }]);
      setFlexSuggestion(null);
    }
  }, [flexSuggestion]);

  // Plan id for health: use state or initial prop so we scope correctly on first render (before sync effect)
  const planIdForHealth = academicYearId ?? initialAcademicYearId ?? undefined;

  // Fetch plan health when modal is open (scoped to current plan when editing)
  useEffect(() => {
    if (!visible || !familyId) {
      setPlanHealth(null);
      return;
    }
    // When editing a specific plan, invalidate cache so we don't show another plan's cached health
    if (planIdForHealth) invalidatePlanHealthCache();
    let cancelled = false;
    (async () => {
      const { data, error } = await getPlanHealth(familyId, planIdForHealth);
      if (cancelled) return;
      if (!error && data) setPlanHealth(data);
      else setPlanHealth(null);
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, planIdForHealth]);

  // Fetch existing placeholder count when we have an academic year id
  useEffect(() => {
    if (!visible || !academicYearId || !familyId) {
      setExistingPlaceholdersCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count, error } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('family_id', familyId)
        .eq('academic_year_id', academicYearId)
        .eq('generated_by', 'plan_year')
        .is('deleted_at', null);
      if (!cancelled && !error) setExistingPlaceholdersCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, [visible, academicYearId, familyId]);

  // Check if family has homeschooled students
  useEffect(() => {
    if (visible && familyId) {
      checkHomeschoolStatus();
    }
  }, [visible, familyId]);

  const checkHomeschoolStatus = async () => {
    setCheckingHomeschool(true);
    try {
      // Plan My Year is the homeschool planning flow; always show full planning UI.
      // (No dependency on children.homeschooled column, which may not exist.)
      setIsHomeschool(true);
    } catch (err) {
      setIsHomeschool(true);
    } finally {
      setCheckingHomeschool(false);
    }
  };

  const createDefaultYear = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await createDefaultAcademicYear(familyId);
      
      if (error) throw error;
      
      if (data?.academic_year_id) {
        setFastPathYearId(data.academic_year_id);
        // Load the created year to show details
        const { data: yearData } = await getAcademicYear(data.academic_year_id);
        if (yearData) {
          setFollowGlobalHolidays(yearData.holiday_settings?.follow_global_holidays || true);
          setCountryCode(yearData.holiday_settings?.holiday_country_code || 'US');
          setRegionCode(yearData.holiday_settings?.holiday_region || null);
          setExcludedPublicHolidayDates(Array.isArray(yearData.holiday_settings?.excluded_holiday_dates) ? yearData.holiday_settings.excluded_holiday_dates : []);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to create default academic year');
    } finally {
      setLoading(false);
    }
  };

  // Debounced recalculation
  const triggerRecalculation = useCallback(() => {
    if (recalculateTimeoutRef.current) {
      clearTimeout(recalculateTimeoutRef.current);
    }
    
    recalculateTimeoutRef.current = setTimeout(async () => {
      await performRecalculation();
    }, 500);
  }, [mode, startDate, endDate, targetDays, targetHours, hoursPerDay, customHolidays, customBreaks, followGlobalHolidays, countryCode]);

  // Recalculate when inputs change (including country/region)
  useEffect(() => {
    if (isHomeschool && startDate && (endDate || targetDays || targetHours)) {
      triggerRecalculation();
    }
  }, [mode, startDate, endDate, targetDays, targetHours, hoursPerDay, customHolidays, customBreaks, followGlobalHolidays, countryCode, regionCode, isHomeschool, triggerRecalculation]);

  const performRecalculation = async () => {
    if (!startDate) return;
    
    setRecalculating(true);
    setError(null);
    
    try {
      const input = {
        academic_year_id: academicYearId,
        mode,
        start_date: startDate,
        end_date: mode === 'FIXED_END' ? endDate : undefined,
        target_instructional_days: mode === 'TARGET_DAYS' ? parseInt(targetDays) : undefined,
        target_instructional_hours: mode === 'TARGET_HOURS' ? parseInt(targetHours) : undefined,
        planned_hours_per_day: mode === 'TARGET_HOURS' ? parseFloat(hoursPerDay) : undefined,
        holiday_settings: {
          follow_global_holidays: followGlobalHolidays,
          holiday_country_code: countryCode,
          holiday_region: regionCode,
          provider: 'NAGER_DATE',
          excluded_holiday_dates: excludedPublicHolidayDates || [],
        },
        custom_holidays: [
          ...customHolidays.map(h => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
          ...expandBreaksToHolidayDates(customBreaks),
        ],
      };

      const { data, error } = await recalculateAcademicYear(input);
      
      if (error) throw error;
      
      setCalculatedResult(data);
    } catch (err) {
      console.error('Recalculation error:', err);
      setError(err.message || 'Failed to recalculate');
    } finally {
      setRecalculating(false);
    }
  };

  const childrenCount = Array.isArray(children) ? children.length : 0;
  const subjectsCount = subjectsForCurrentSelection.length;
  const selectedCount = selectedSubjectIds.length;
  const preconditionsMet = childrenCount > 0 && (
    isPlaceholderOnlyScope
      ? blocks.length > 0
      : subjectsCount > 0 && (selectedSubjectIds.length >= 1 || blocks.length > 0)
  );

  const eligibleCount = calculatedResult?.instructional_days ?? 0;
  const excludedCount = calculatedResult?.non_instructional_days ?? 0;
  const targetDaysNum = effectivePlanTarget.constraint_mode === 'days'
    ? (effectivePlanTarget.target_days ?? TARGET_INSTRUCTIONAL_DAYS_DEFAULT)
    : TARGET_INSTRUCTIONAL_DAYS_DEFAULT;
  const hasAnyWeekdayInBlocks = blocks.some((b) => (b.weekdays || []).length > 0);
  const feasible = blocks.length > 0
    ? (effectivePlanTarget.constraint_mode === 'none'
        ? !!(startDate && endDate)
        : hasAnyWeekdayInBlocks && schedulePotential
          ? schedulePotential.projected_days > 0
          : false)
    : eligibleCount >= targetDaysNum;

  const runApplyToCalendar = async (replacePlaceholdersChoice) => {
    setSaving(true);
    setError(null);
    try {
      const effectiveEndDate = mode === 'FIXED_END' ? endDate : (calculatedResult?.end_date || endDate);
      const effectiveTargetInstructionalDays = effectivePlanTarget.constraint_mode === 'days'
        ? (effectivePlanTarget.target_days ?? TARGET_INSTRUCTIONAL_DAYS_DEFAULT)
        : TARGET_INSTRUCTIONAL_DAYS_DEFAULT;
      const year_name = buildPlanYearName({
        children,
        subjects: baseSubjectList,
        blocks,
        selectedSubjectIds,
        startDate,
        endDate: effectiveEndDate,
      });
      const payload = {
        academic_year_id: academicYearId || undefined,
        family_id: familyId,
        start_date: startDate,
        end_date: effectiveEndDate,
        follow_public_holidays: followGlobalHolidays,
        holiday_region: regionCode ? `${countryCode}:${regionCode}` : countryCode,
        excluded_holiday_dates: excludedPublicHolidayDates?.length ? excludedPublicHolidayDates : undefined,
        custom_holidays: customHolidays.map(h => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
        custom_breaks: (customBreaks || []).map(b => ({ start: b.start, end: b.end, name: b.name || 'Break' })),
        target_instructional_days: effectiveTargetInstructionalDays,
        subjects: selectedSubjectIds,
        constraint_mode: effectivePlanTarget.constraint_mode,
        target_days: effectivePlanTarget.target_days ?? null,
        target_hours: effectivePlanTarget.target_hours ?? null,
        child_id: null,
        replace_placeholders: replacePlaceholdersChoice,
        blocks: blocks.length > 0 ? blocks.map((b) => {
          const subj = b.subject_id ? baseSubjectList.find((s) => String(s.id) === String(b.subject_id)) : null;
          const resolvedChildIds = b.subject_id
            ? getChildIdsForSubject(subj, children)
            : Array.isArray(b.child_ids) && b.child_ids.length > 0
              ? b.child_ids
              : allFamilyChildIds;
          return {
            block_id: b.block_id,
            subject_id: b.subject_id ?? null,
            placeholder_label: b.placeholder_label || (b.subject_id ? undefined : (STRINGS.planMyYear?.sections?.blocks?.genericSlotLabel ?? 'Learning block')),
            child_ids: resolvedChildIds,
            weekdays: b.weekdays || [],
            start_time: b.start_time || '09:00',
            end_time: b.end_time || '10:00',
            all_day: b.all_day || false,
          };
        }) : [],
        subject_targets: effectiveSubjectTargetsForApply ?? effectiveSubjectTargets ?? undefined,
        year_name,
        // When editing: apply block changes only from this date forward (optional)
        ...(applyFromMode === 'today' && { apply_from_date: toLocalYYYYMMDD(new Date()) }),
        ...(applyFromMode === 'date' && applyFromDate && { apply_from_date: applyFromDate }),
        // When user chose "Create new plan" from picker, always create a new academic year so it appears in the list
        force_new_plan: startCreatingNew,
        // Always send timezone so plan times (e.g. 9 AM) are stored correctly; never fall back to UTC
        timezone: (function getClientTimezone() {
          try {
            if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
              const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
              if (tz && typeof tz === 'string') return tz.trim();
            }
          } catch (e) { /* ignore */ }
          return 'America/New_York';
        })(),
      };

      const { data, error: applyError } = await applyToCalendar(payload);
      if (applyError) throw applyError;

      invalidatePlanHealthCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
      }
      const { data: healthData } = await getPlanHealth(familyId, academicYearId ?? undefined);
      if (healthData) setPlanHealth(healthData);

      const added = data?.totals?.inserted ?? data?.created ?? 0;
      const message = added === 1 ? '1 new lesson added' : `${added} new lessons added`;
      const toastType = 'success';
      loadedYearIdRef.current = null;
      if (typeof window !== 'undefined') {
        // Force immediate calendar refetch so new plan events show without page refresh
        const startYmd = startDate && String(startDate).trim();
        const detail = { forceInvalidate: true, skipHomeRefresh: true };
        if (startYmd && /^\d{4}-\d{2}-\d{2}$/.test(startYmd)) {
          const [y, m] = startYmd.split('-').map(Number);
          detail.targetYear = y;
          detail.targetMonth = m - 1; // 0-based
        }
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail }));
        // Tell open event modal to refetch so plan time updates show immediately (delay so DB commit is visible)
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('planAppliedToCalendar'));
        }, 350);
        // Delayed refresh so planner shows new events after modal closes and DB is committed
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { ...detail, forceInvalidate: true } }));
        }, 400);
        // Also refetch visible month so planner updates regardless of which month is in view
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true, skipHomeRefresh: true } }));
        }, 600);
      }
      toast.push(message, toastType);
      // Refetch placeholder count for eligibility / health copy if user stays in modal
      if (academicYearId && familyId) {
        const { count, error: countErr } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('family_id', familyId)
          .eq('academic_year_id', academicYearId)
          .eq('generated_by', 'plan_year')
          .is('deleted_at', null);
        if (!countErr && count != null) setExistingPlaceholdersCount(count);
      }
      setTimeout(() => {
        onCompleteRef.current?.();
        onCloseRef.current?.();
      }, 50);
    } catch (err) {
      const errMsg = err?.message || err?.detail || 'Failed to apply to calendar';
      setError(errMsg);
      loadedYearIdRef.current = null;
      toast.push(errMsg, 'error');
      setTimeout(() => onCloseRef.current?.(), 50);
    } finally {
      setSaving(false);
    }
  };

  const scrollToDatesSection = useCallback(() => {
    setSectionDatesExpanded(true);
    setTimeout(() => {
      const y = datesSectionYRef.current;
      if (typeof y === 'number' && scrollRef.current) {
        scrollRef.current.scrollTo({ y: Math.max(0, y - 24), animated: true });
      }
    }, 150);
  }, []);

  const handleApplyToCalendar = async () => {
    if (!preconditionsMet) {
      setError(isPlaceholderOnlyScope ? 'Add at least 1 child and at least one learning block.' : 'Add at least 1 child and 1 subject to generate a year plan.');
      return;
    }
    if (isHomeschool && !startDate) {
      setError('Please select a start date in the Dates & Requirements section.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'FIXED_END' && !endDate) {
      setError('Please select an end date. With "End date" selected as your planning goal, an end date is required.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'TARGET_DAYS' && !targetDays) {
      setError('Please enter the number of target instructional days in the Dates & Requirements section.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'TARGET_HOURS' && (!targetHours || !hoursPerDay)) {
      setError('Please enter both target instructional hours and hours per instructional day.');
      scrollToDatesSection();
      return;
    }
    if (blocks.length === 0 && isHomeschool && !feasible) {
      setError('Not enough instructional days. Add more weekdays in Scheduled Class Days or extend your end date.');
      return;
    }
    if (blocks.length === 0 && !isPlaceholderOnlyScope && selectedSubjectIds.length === 0) {
      setError('Select at least one subject, or add scheduled class days.');
      return;
    }
    if (blocks.length > 0 && !isPlaceholderOnlyScope && blocks.some((b) => !b.subject_id)) {
      setError('Each scheduled class day needs a subject. Remove or fix any empty rows in Scheduled Class Days.');
      return;
    }

    if (existingPlaceholdersCount > 0) {
      await runApplyToCalendar(true);
      return;
    }

    await runApplyToCalendar(replacePlaceholders);
  };

  /** Phase 3: Inline build + commit for link/paste (no modal). Upload still opens Build Curriculum modal. */
  const handleCreateUnitAndSchedule = async () => {
    if (planSource === 'upload') {
      if (!selectedMaterialId) {
        setError('Please select a material from your uploads, or add one with "Upload or add material".');
        return;
      }
      const firstSubjectId = effectiveSubjectIds?.[0] ?? null;
      const firstSubject = baseSubjectList?.find((s) => s.id === firstSubjectId);
      onOpenBuildCurriculum?.({
        initialInputMode: 'material',
        initialMaterialId: selectedMaterialId,
        initialSubjectId: firstSubjectId ?? undefined,
        initialSubjectName: firstSubject?.name ?? undefined,
        initialStartDate: startDate || undefined,
        initialEndDate: endDate || undefined,
      });
      return;
    }
    if (planSource === 'link' && !sourceUrl.trim()) {
      setError('Please enter a source URL.');
      return;
    }
    if (planSource === 'paste' && !pastedText.trim()) {
      setError('Please paste your list of dates and events.');
      return;
    }
    const studentIds = allFamilyChildIds;
    if (!studentIds.length) {
      setError('Add at least one child to your family to continue.');
      return;
    }
    const firstSubjectId = effectiveSubjectIds?.[0] ?? null;
    const firstSubject = baseSubjectList?.find((s) => s.id === firstSubjectId);

    setLoading(true);
    setError(null);

    try {
      let filteredPreview = null;
      if ((planSource === 'link' || planSource === 'paste') && parsedContent?.unit && parsedContent?.lessons?.length) {
        filteredPreview = { ...parsedContent, lessons: parsedContent.lessons };
      }
      if (!filteredPreview) {
        const startDateObj = startDate ? new Date(startDate + 'T12:00:00') : new Date();
        const startDateISO = startDateObj.toISOString().split('T')[0];
        let weeks = 1;
        if (startDate && endDate) {
          const end = new Date(endDate + 'T12:00:00');
          const start = new Date(startDate + 'T12:00:00');
          weeks = Math.max(1, Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000)));
        }
        const buildPayload = {
          mode: planSource === 'link' ? 'link' : 'topic',
          topic: planSource === 'paste' ? pastedText.trim() : null,
          source_url: planSource === 'link' ? sourceUrl.trim() : null,
          student_ids: studentIds,
          constraints: {
            weeks,
            minutes_per_day: 60,
            weekdays_only: true,
            difficulty: 'standard',
            start_date: startDateISO,
          },
        };
        const { data: preview, error: buildError } = await buildCurriculum(buildPayload);
        if (buildError) {
          throw new Error(buildError.message || buildError.detail || 'Failed to build curriculum');
        }
        if (!preview?.unit || !preview?.lessons?.length) {
          throw new Error('No lessons were generated. Try adjusting your link or pasted text.');
        }
        filteredPreview = { ...preview, lessons: preview.lessons };
      }
      if (firstSubject?.name && filteredPreview?.unit) {
        filteredPreview.unit = {
          ...filteredPreview.unit,
          subject_tags: [firstSubject.name],
        };
      }

      const { data: commitData, error: commitError } = await commitCurriculum({
        preview: filteredPreview,
        create_calendar_events: true,
        add_to_backlog: false,
        lesson_backlog_map: {},
        prefer_placeholder_slots: true,
        placement: {
          strategy: 'fit_openings',
          prefer_mornings: false,
          prefer_afternoons: false,
          prefer_evenings: false,
          prefer_weekdays: [],
        },
      });

      if (commitError) {
        throw new Error(commitError.message || commitError.detail || 'Failed to schedule lessons');
      }
      if (!commitData) {
        throw new Error('Server did not return commit result.');
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }

      const slotsUsed = commitData?.slots_used ?? 0;
      const eventsCreated = commitData?.events_created ?? 0;
      const hasEvents = (commitData?.event_ids?.length ?? 0) > 0;
      if (hasEvents && (slotsUsed > 0 || eventsCreated > 0)) {
        if (slotsUsed > 0 && eventsCreated > 0) {
          toast.push(t('buildCurriculum.notices.usedSlotsAndFallback', { used: slotsUsed, fallback: eventsCreated }), 'success');
        } else if (slotsUsed > 0) {
          toast.push(t('buildCurriculum.notices.usedSlots', { used: slotsUsed }), 'success');
        } else {
          toast.push(STRINGS.buildCurriculum?.notices?.noSlotsFound ?? 'Lessons scheduled.', 'success');
        }
      } else {
        toast.push(STRINGS.buildCurriculum?.notices?.noSlotsFound ?? 'Lessons created.', 'success');
      }

      onComplete?.();
    } catch (err) {
      const message = err?.message || 'Failed to create unit and schedule';
      setError(message);
      toast.push(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (isDraft = false) => {
    if (isHomeschool && !startDate) {
      setError('Please select a start date in the Dates & Requirements section.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'FIXED_END' && !endDate) {
      setError('Please select an end date. With "End date" selected as your planning goal, an end date is required.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'TARGET_DAYS' && !targetDays) {
      setError('Please enter the number of target instructional days in the Dates & Requirements section.');
      scrollToDatesSection();
      return;
    }
    if (isHomeschool && mode === 'TARGET_HOURS' && (!targetHours || !hoursPerDay)) {
      setError('Please enter both target instructional hours and hours per instructional day.');
      scrollToDatesSection();
      return;
    }
    
    setSaving(true);
    setError(null);
    
    try {
      if (!isHomeschool) {
        if (fastPathYearId) {
          const input = {
            academic_year_id: fastPathYearId,
            mode: 'FIXED_END',
            start_date: '',
            end_date: '',
            holiday_settings: {
              follow_global_holidays: followGlobalHolidays,
              holiday_country_code: countryCode,
              holiday_region: regionCode,
              provider: 'NAGER_DATE',
              excluded_holiday_dates: excludedPublicHolidayDates || [],
            },
            custom_holidays: [],
          };
          const { error: saveErr } = await saveAcademicYear(input);
          if (saveErr) throw saveErr;
        }
      } else {
        const effectiveEnd = mode === 'FIXED_END' ? endDate : calculatedResult?.end_date;
        const year_name = buildPlanYearName({
          children,
          subjects: baseSubjectList,
          blocks,
          selectedSubjectIds,
          startDate,
          endDate: effectiveEnd,
        });
        const input = {
          academic_year_id: academicYearId,
          mode,
          start_date: startDate,
          end_date: effectiveEnd,
          target_instructional_days: mode === 'TARGET_DAYS' ? parseInt(targetDays) : undefined,
          target_instructional_hours: mode === 'TARGET_HOURS' ? parseInt(targetHours) : undefined,
          planned_hours_per_day: mode === 'TARGET_HOURS' ? parseFloat(hoursPerDay) : undefined,
          holiday_settings: {
            follow_global_holidays: followGlobalHolidays,
            holiday_country_code: countryCode,
            holiday_region: regionCode,
            provider: 'NAGER_DATE',
            excluded_holiday_dates: excludedPublicHolidayDates || [],
          },
          custom_holidays: customHolidays.map(h => ({
            date: h.date,
            name: h.name,
            type: h.type || 'CUSTOM_HOLIDAY',
          })),
          year_name,
        };
        const { data, error: saveErr } = await saveAcademicYear(input);
        if (saveErr) throw saveErr;
        if (data?.academic_year_id) setAcademicYearId(data.academic_year_id);
      }
      invalidatePlanHealthCache();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
      }
      const { data: healthData } = await getPlanHealth(familyId, academicYearId ?? data?.academic_year_id ?? undefined);
      if (healthData) setPlanHealth(healthData);
      Alert.alert('Success', 'Academic year saved successfully', [
        { text: 'OK', onPress: () => { onComplete?.(); onClose(); }},
      ]);
    } catch (err) {
      setError(err.message || 'Failed to save academic year');
    } finally {
      setSaving(false);
    }
  };

  const addCustomHoliday = () => {
    if (!newHolidayDate || !newHolidayName) {
      setError('Please enter both a date and a name for the custom holiday.');
      return;
    }
    
    setCustomHolidays([...customHolidays, {
      date: newHolidayDate,
      name: newHolidayName,
      type: 'CUSTOM_HOLIDAY',
    }]);
    
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const removeCustomHoliday = (index) => {
    setCustomHolidays(customHolidays.filter((_, i) => i !== index));
  };

  const addCustomBreak = () => {
    if (!newBreakStart || !newBreakEnd || !newBreakName) {
      setError('Please enter start date, end date, and a name for the break.');
      return;
    }
    if (newBreakStart > newBreakEnd) {
      setError('Break end date must be on or after the start date.');
      return;
    }
    setCustomBreaks([...customBreaks, { start: newBreakStart, end: newBreakEnd, name: newBreakName }]);
    setNewBreakStart('');
    setNewBreakEnd('');
    setNewBreakName('');
  };

  const removeCustomBreak = (index) => {
    setCustomBreaks(customBreaks.filter((_, i) => i !== index));
  };

  const addBlock = () => {
    const genericLabel = STRINGS.planMyYear?.sections?.blocks?.genericSlotLabel ?? 'Learning block';
    if (isPlaceholderOnlyScope) {
      const block = {
        block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}`,
        subject_id: null,
        placeholder_label: genericLabel,
        child_ids: [...allFamilyChildIds],
        weekdays: [],
        start_time: '09:00',
        end_time: '10:00',
        all_day: false,
      };
      setBlocks([...blocks, block]);
      return;
    }
    const subj = subjectsForCurrentSelection?.find((s) => selectedSubjectIds.includes(s.id)) || subjectsForCurrentSelection?.[0];
    const block = {
      block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}`,
      subject_id: subj?.id || '',
      child_ids: getChildIdsForSubject(subj, children),
      weekdays: [],
      start_time: '09:00',
      end_time: '10:00',
      all_day: false,
    };
    setBlocks([...blocks, block]);
  };

  const addBlocksFromSubjects = () => {
    const ids = selectedSubjectIds?.length ? selectedSubjectIds : (subjectsForCurrentSelection?.[0] ? [subjectsForCurrentSelection[0].id] : []);
    const newBlocks = ids.slice(0, 10).map((subjectId) => {
      const subj = baseSubjectList.find((s) => String(s.id) === String(subjectId));
      return {
        block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${subjectId}`,
        subject_id: subjectId,
        child_ids: getChildIdsForSubject(subj, children),
        weekdays: [],
        start_time: '09:00',
        end_time: '10:00',
        all_day: false,
      };
    });
    setBlocks([...blocks, ...newBlocks]);
  };

  const cycleBlockSubject = (idx) => {
    const block = blocks[idx];
    const ids = selectedSubjectIds?.length ? selectedSubjectIds : (subjectsForCurrentSelection?.map((s) => s.id) || []);
    if (ids.length === 0) return;
    const i = ids.indexOf(block.subject_id);
    const next = ids[(i + 1) % ids.length];
    const nextSubj = baseSubjectList.find((s) => String(s.id) === String(next));
    updateBlock(idx, { subject_id: next, child_ids: getChildIdsForSubject(nextSubj, children) });
  };

  const removeBlock = (index) => {
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const updateBlock = (index, updates) => {
    setBlocks(blocks.map((b, i) => (i === index ? { ...b, ...updates } : b)));
  };

  // Reset state when modal closes (so reopening doesn't show stale conflicts/plan data after e.g. removing placeholders)
  useEffect(() => {
    if (!visible) {
      setError(null);
      setCustomHolidays([]);
      setCustomBreaks([]);
      setPlanConstraintMode('none');
      setPlanTargetDays('180');
      setPlanTargetHours('1000');
      setNewBreakStart('');
      setNewBreakEnd('');
      setNewBreakName('');
      setNewHolidayDate('');
      setNewHolidayName('');
      setCalculatedResult(null);
      setFastPathYearId(null);
      setAcademicYearId(null);
      setSelectedSubjectIds([]);
      setBlocks([]);
      setSchedulePotential(null);
      setStartDate('');
      setEndDate('');
      setPlanSubjectTargetsOverride({});
      setTargetScopeFromSettings('overall');
    }
  }, [visible]);

  // Clear validation error when user fixes the missing field (e.g. selects end date)
  useEffect(() => {
    if (!error) return;
    const dateRequirementMet = startDate && (mode !== 'FIXED_END' || endDate);
    const targetDaysMet = mode !== 'TARGET_DAYS' || !!targetDays;
    const targetHoursMet = mode !== 'TARGET_HOURS' || (!!targetHours && !!hoursPerDay);
    if (dateRequirementMet && targetDaysMet && targetHoursMet) {
      setError(null);
    }
  }, [error, startDate, endDate, mode, targetDays, targetHours, hoursPerDay]);

  if (checkingHomeschool) {
    const loadingContent = (
      <TouchableOpacity style={[styles.modal, { flex: 1 }]} activeOpacity={1} onPress={() => {}}>
        <ActivityIndicator size="large" color={ACCENT} />
        <Text style={styles.loadingText}>Checking setup...</Text>
      </TouchableOpacity>
    );
    if (renderInline) {
      return <View style={{ flex: 1, minHeight: 0 }}>{loadingContent}</View>;
    }
    return (
      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          {loadingContent}
        </TouchableOpacity>
      </Modal>
    );
  }

  const editPlanLoading = isHomeschool && (initialAcademicYearId || academicYearId) && loadedYearIdRef.current !== (initialAcademicYearId || academicYearId);
  const headerMetaRaw = editPlanLoading
    ? 'Loading…'
    : [startDate && endDate ? `${formatDateDisplay(startDate)} – ${formatDateDisplay(endDate)}` : null, (() => {
        const idSet = new Set();
        (blocks || []).forEach((b) => (b.child_ids || []).forEach((cid) => { if (cid) idSet.add(String(cid)); }));
        const ids = Array.from(idSet);
        return ids.length > 0
          ? ids.map((id) => (children || []).find((c) => String(c.id) === String(id))?.first_name || (children || []).find((c) => String(c.id) === String(id))?.name).filter(Boolean).join(', ')
          : null;
      })(), effectiveSubjectIds?.length ? (baseSubjectList || []).filter((s) => effectiveSubjectIds.includes(s.id)).map((s) => s.name).slice(0, 3).join(', ') + (effectiveSubjectIds.length > 3 ? '…' : '') : null].filter(Boolean).join(' • ');
  const headerMeta = (headerMetaRaw && headerMetaRaw.trim() && headerMetaRaw.trim() !== '.') ? headerMetaRaw : null;
  const unitFocusSubjectNameForHeader = unitPipelineSubjectId
    ? (baseSubjectList || []).find((s) => String(s.id) === String(unitPipelineSubjectId))?.name
    : null;
  const lastSavedSubjectNameForHeader = lastSavedUnitSubjectId
    ? (baseSubjectList || []).find((s) => String(s.id) === String(lastSavedUnitSubjectId))?.name
    : null;
  const unitHeaderSubtitle =
    unitFocusSubjectNameForHeader && effectiveSubjectIds.length > 1 && (planStep === 'source' || planStep === 'unit_structure')
      ? t('planMyYear.multiSubjectUnits.headerUnitsFor', { subjectName: unitFocusSubjectNameForHeader })
      : lastSavedSubjectNameForHeader &&
          (planStep === 'preview' || (PLAN_MY_YEAR_LOGISTICS_FIRST && planStep === 'logistics'))
        ? t('planMyYear.multiSubjectUnits.reviewLastSavedUnits', { subjectName: lastSavedSubjectNameForHeader })
        : null;
  const unitStructureSaveDraftLabel = PLAN_MY_YEAR_LOGISTICS_FIRST
    ? t('planMyYear.multiSubjectUnits.footerSaveDraftLogisticsFirst')
    : t('planMyYear.multiSubjectUnits.footerSaveDraftClassic');
  const unitStructureSkipDraftLabel = PLAN_MY_YEAR_LOGISTICS_FIRST
    ? t('planMyYear.multiSubjectUnits.footerSkipLogisticsFirst')
    : t('planMyYear.multiSubjectUnits.footerSkipClassic');
  const stepScopeComplete = !!planningScope;
  const stepSourceComplete = true; // Choose method always has a selection (default: placeholders)
  const step0Complete = preconditionsMet;
  const step1Complete = isPlaceholderOnlyScope
    ? blocks.length >= 1
    : effectiveSubjectIds.length > 0 && blocks.length >= effectiveSubjectIds.length;
  const step2Complete = !!startDate && (mode !== 'FIXED_END' || !!endDate);
  const step3Complete = false; // Breaks optional, always "future" until we're on it
  const completed = [stepScopeComplete, stepSourceComplete, step0Complete, step1Complete, step2Complete, step3Complete];
  const currentStepIndex = completed.findIndex((c) => !c);
  const currentStep = currentStepIndex >= 0 ? currentStepIndex : 5;
  const sectionStepLabels = [
    STRINGS.planMyYear?.sections?.planningScope?.title ?? 'Scope',
    STRINGS.planMyYear?.sections?.useASource?.title ?? 'Choose method',
    'Subjects',
    STRINGS.planMyYear.sections.blocks.title,
    STRINGS.planMyYear.sections.dates.title,
    STRINGS.planMyYear.sections.breaks.title,
  ];

  const pickerOnly = openForNewPlan && !academicYearId && !startCreatingNew;
  /** YOUR PLANS list: picker idle state OR user chose "Edit plan" from toolbar while mid–build (startCreatingNew would make pickerOnly false). */
  const showYourPlansList =
    showPlanManagerView &&
    openForNewPlan &&
    !academicYearId &&
    (pickerOnly || openToEditPlanList);
  /** Entry: create vs edit — hide when jumping straight to YOUR PLANS (e.g. Edit plan from toolbar). */
  const showEntryChoice =
    openForNewPlan &&
    !academicYearId &&
    !startCreatingNew &&
    !showPlanManagerView &&
    !openToEditPlanList;

  const renderPlanYearUnitStructureScroll = () => (
            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
              {(() => {
                const availableSubjectId = unitPipelineSubjectId;
                const availableSubject = availableSubjectId ? baseSubjectList.find((s) => String(s.id) === String(availableSubjectId)) : null;

                if (!availableSubject) {
                  return (
                    <View style={{ paddingVertical: 24, paddingHorizontal: 4 }}>
                      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>{s('planMyYear.multiSubjectUnits.chooseSubjectEmptyTitle')}</Text>
                      <Text style={[styles.mutedText, { marginBottom: 20, lineHeight: 20 }]}>
                        {s('planMyYear.multiSubjectUnits.chooseSubjectEmptyBody')}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        <TouchableOpacity
                          onPress={() => setPlanStep(PLAN_STEP_KEYS.SOURCE)}
                          style={[styles.primaryButton, { alignSelf: 'flex-start' }]}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.primaryButtonText}>{s('planMyYear.multiSubjectUnits.backToMethod')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setPlanStep(PLAN_STEP_KEYS.LOGISTICS)}
                          style={[styles.cancelButton, { alignSelf: 'flex-start' }]}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.cancelText}>{s('planMyYear.multiSubjectUnits.backToLogistics')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }

                if (loadingUnitStructure && !draftData && !manualDraft) {
                  return (
                    <View style={{ paddingVertical: 40, alignItems: 'center', paddingHorizontal: 16 }}>
                      <ActivityIndicator size="small" color={ACCENT} />
                      <Text style={[styles.mutedText, { marginTop: 12, textAlign: 'center' }]}>
                        {s('planMyYear.multiSubjectUnits.loadingCurriculum')}
                      </Text>
                    </View>
                  );
                }

                const unitSubjectBanner =
                  effectiveSubjectIds.length > 1 ? (
                    <View
                      style={{
                        marginBottom: 16,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: ACCENT_LIGHT,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: 'rgba(15,23,42,0.08)',
                      }}
                    >
                      <Text style={{ fontSize: 13, color: FG, lineHeight: 18 }}>
                        <Text style={{ fontWeight: '600' }}>{s('planMyYear.multiSubjectUnits.subjectBannerPrefix')} </Text>
                        {availableSubject.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: MUTED, marginTop: 4, lineHeight: 16 }}>
                        {s('planMyYear.multiSubjectUnits.subjectBannerHint')}
                      </Text>
                    </View>
                  ) : null;
                
                // If we have draft data (after parsing/generating), show the structure editor
                const currentDraft = draftData || manualDraft;
                if (currentDraft && currentDraft.units && currentDraft.units.length > 0) {
                  const units = currentDraft.units || [];
                  const totalLessons = units.reduce((sum, u) => sum + (u.lessons || []).length, 0);
                  const totalAssessments = units.reduce((sum, u) => sum + (u.lessons || []).filter(l => (l.lesson_type === 'assessment' || l.lesson_type === 'exam')).length, 0);
                  
                  return (
                    <>
                      {unitSubjectBanner}
                      {/* Summary bar */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                          <Text style={[styles.sectionTitle, { fontSize: 16, marginBottom: 0 }]}>
                            {units.length} {units.length === 1 ? 'Unit' : 'Units'} · {totalLessons} {totalLessons === 1 ? 'Lesson' : 'Lessons'} · {totalAssessments} {totalAssessments === 1 ? 'Assessment' : 'Assessments'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => setShowAdvanced(!showAdvanced)}
                          style={{ paddingVertical: 4, paddingHorizontal: 8 }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={{ fontSize: 12, color: ACCENT }}>Edit totals</Text>
                        </TouchableOpacity>
                      </View>
                      
                      {/* Units list */}
                      <View style={{ gap: 12 }}>
                        {units.map((unit, unitIdx) => {
                          const isExpanded = expandedUnits.has(unitIdx);
                          const lessons = unit.lessons || [];
                          const lessonCount = lessons.filter(l => l.lesson_type === 'lesson' || l.lesson_type === 'project' || l.lesson_type === 'activity').length;
                          const assessmentCount = lessons.filter(l => l.lesson_type === 'assessment' || l.lesson_type === 'exam').length;
                          
                          return (
                            <View key={unit.temp_id || unitIdx} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: BG, overflow: 'hidden' }}>
                              {/* Unit header */}
                              <TouchableOpacity
                                onPress={() => {
                                  const newExpanded = new Set(expandedUnits);
                                  if (isExpanded) {
                                    newExpanded.delete(unitIdx);
                                  } else {
                                    newExpanded.add(unitIdx);
                                  }
                                  setExpandedUnits(newExpanded);
                                }}
                                style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }}
                                activeOpacity={0.7}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                {isExpanded ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                                <View style={{ flex: 1 }}>
                                  <TextInput
                                    style={[styles.input, { fontSize: 15, fontWeight: '600', padding: 4, marginBottom: 4 }]}
                                    value={unit.title || ''}
                                    onChangeText={(v) => updateDraftUnit(unitIdx, 'title', v)}
                                    placeholder={`Unit ${unitIdx + 1}`}
                                    placeholderTextColor={MUTED}
                                    {...(Platform.OS === 'web' && { cursor: 'text' })}
                                  />
                                  <Text style={[styles.mutedText, { fontSize: 13 }]}>
                                    {lessonCount} {lessonCount === 1 ? 'lesson' : 'lessons'}
                                    {assessmentCount > 0 && ` · ${assessmentCount} ${assessmentCount === 1 ? 'assessment' : 'assessments'}`}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    deleteDraftUnit(unitIdx);
                                  }}
                                  style={{ padding: 4 }}
                                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                >
                                  <Trash2 size={16} color={ERROR} />
                                </TouchableOpacity>
                              </TouchableOpacity>
                              
                              {/* Expanded lessons list */}
                              {isExpanded && (
                                <View style={{ borderTopWidth: 1, borderTopColor: BORDER }}>
                                  {lessons.map((lesson, lessonIdx) => {
                                    const typeOptions = ['lesson', 'project', 'assessment', 'activity'];
                                    const currentType = lesson.lesson_type || 'lesson';
                                    const refDate = lesson.cadence_metadata?.reference_date || lesson.reference_date || lesson.suggested_date || lesson.date_text || null;
                                    
                                    return (
                                      <View key={lesson.temp_id || lessonIdx} style={{ flexDirection: 'row', alignItems: 'center', padding: 12, paddingLeft: 48, borderTopWidth: lessonIdx > 0 ? 1 : 0, borderTopColor: BORDER, gap: 8 }}>
                                        <GripVertical size={16} color={MUTED} style={{ opacity: 0.5 }} />
                                        <View style={{ flex: 1 }}>
                                          <TextInput
                                            style={[styles.input, { fontSize: 14, padding: 6, marginBottom: 6 }]}
                                            value={lesson.title || ''}
                                            onChangeText={(v) => updateDraftLesson(unitIdx, lessonIdx, 'title', v)}
                                            placeholder="Lesson title"
                                            placeholderTextColor={MUTED}
                                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                                          />
                                          {/* Reference date input */}
                                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                            <Text style={[styles.smallLabel, { fontSize: 11, color: MUTED }]}>Reference date:</Text>
                                            {Platform.OS === 'web' ? (
                                              <input
                                                type="date"
                                                value={refDate || ''}
                                                onChange={(e) => {
                                                  const dateValue = e.target.value || null;
                                                  const currentLesson = (draftData || manualDraft)?.units?.[unitIdx]?.lessons?.[lessonIdx];
                                                  if (currentLesson) {
                                                    if (!currentLesson.cadence_metadata) {
                                                      updateDraftLesson(unitIdx, lessonIdx, 'cadence_metadata', { reference_date: dateValue });
                                                    } else {
                                                      updateDraftLesson(unitIdx, lessonIdx, 'cadence_metadata', { ...currentLesson.cadence_metadata, reference_date: dateValue });
                                                    }
                                                  }
                                                }}
                                                style={{
                                                  flex: 1,
                                                  maxWidth: 140,
                                                  padding: '6px',
                                                  borderRadius: '6px',
                                                  border: '1px solid #d1d5db',
                                                  fontSize: '12px',
                                                  backgroundColor: '#fff',
                                                }}
                                              />
                                            ) : (
                                              <TextInput
                                                style={[styles.input, { flex: 1, maxWidth: 140, paddingVertical: 6, fontSize: 12 }]}
                                                value={refDate || ''}
                                                onChangeText={(v) => {
                                                  const currentLesson = (draftData || manualDraft)?.units?.[unitIdx]?.lessons?.[lessonIdx];
                                                  if (currentLesson) {
                                                    if (!currentLesson.cadence_metadata) {
                                                      updateDraftLesson(unitIdx, lessonIdx, 'cadence_metadata', { reference_date: v || null });
                                                    } else {
                                                      updateDraftLesson(unitIdx, lessonIdx, 'cadence_metadata', { ...currentLesson.cadence_metadata, reference_date: v || null });
                                                    }
                                                  }
                                                }}
                                                placeholder="YYYY-MM-DD"
                                                placeholderTextColor={MUTED}
                                              />
                                            )}
                                            <Text style={[styles.smallLabel, { fontSize: 10, color: MUTED }]}>Connects to planner</Text>
                                          </View>
                                        </View>
                                        <View style={{ flexDirection: 'row', gap: 4 }}>
                                          {typeOptions.map((type) => (
                                            <TouchableOpacity
                                              key={type}
                                              onPress={() => {
                                                updateDraftLesson(unitIdx, lessonIdx, 'lesson_type', type);
                                              }}
                                              style={{
                                                paddingHorizontal: 8,
                                                paddingVertical: 4,
                                                borderRadius: 12,
                                                backgroundColor: currentType === type ? ACCENT_LIGHT : '#f3f4f6',
                                                borderWidth: 1,
                                                borderColor: currentType === type ? ACCENT : '#e5e7eb',
                                              }}
                                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                            >
                                              <Text style={{ fontSize: 11, color: currentType === type ? ACCENT : MUTED, textTransform: 'capitalize' }}>
                                                {type}
                                              </Text>
                                            </TouchableOpacity>
                                          ))}
                                        </View>
                                        {refDate && (
                                          <Text style={{ fontSize: 12, color: MUTED, minWidth: 100 }}>
                                            {new Date(refDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          </Text>
                                        )}
                                        <TouchableOpacity
                                          onPress={() => deleteDraftLesson(unitIdx, lessonIdx)}
                                          style={{ padding: 4 }}
                                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                        >
                                          <Trash2 size={14} color={ERROR} />
                                        </TouchableOpacity>
                                      </View>
                                    );
                                  })}
                                  <TouchableOpacity
                                    onPress={() => addDraftLesson(unitIdx)}
                                    style={{ flexDirection: 'row', alignItems: 'center', padding: 12, paddingLeft: 48, borderTopWidth: 1, borderTopColor: BORDER, gap: 8 }}
                                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                  >
                                    <Plus size={16} color={ACCENT} />
                                    <Text style={{ fontSize: 14, color: ACCENT }}>Break it down further</Text>
                                  </TouchableOpacity>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                      
                      {/* Add unit button */}
                      <TouchableOpacity
                        onPress={() => {
                          const currentDraft = draftData || manualDraft;
                          const newUnits = [...(currentDraft?.units || [])];
                          const newUnit = {
                            temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                            title: `Unit ${newUnits.length + 1}`,
                            sequence_index: newUnits.length + 1,
                            lessons: [],
                          };
                          newUnits.push(newUnit);
                          if (draftData) {
                            setDraftData({ ...draftData, units: newUnits });
                          } else if (manualDraft) {
                            setManualDraft({ ...manualDraft, units: newUnits });
                          }
                          setExpandedUnits(new Set([...expandedUnits, newUnits.length - 1]));
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, marginTop: 24, borderWidth: 2, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 8, gap: 8 }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Plus size={18} color={MUTED} />
                        <Text style={{ fontSize: 14, color: MUTED }}>Add unit</Text>
                      </TouchableOpacity>
                      
                      {/* Back to earlier step (manual input → Method; others stay on unit structure) */}
                      <TouchableOpacity
                        onPress={() => {
                          if (planSource === 'paste') {
                            setDraftData(null);
                            setManualDraft(null);
                            setUnitStructureStep('input');
                            setRawText('');
                            setExpandedUnits(new Set());
                            setExpandedUnitIndexManual(0);
                            setPlanStep('source');
                            return;
                          }
                          setDraftData(null);
                          setManualDraft(null);
                          setUnitStructureStep('input');
                          setRawText('');
                          setExpandedUnits(new Set());
                          setExpandedUnitIndexManual(0);
                        }}
                        style={{ marginTop: 16, paddingVertical: 8, alignItems: 'center' }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={{ fontSize: 14, color: MUTED, textDecorationLine: 'underline' }}>
                          Back to {planSource === 'paste' ? 'method' : planSource === 'generate' ? 'form' : planSource === 'upload' ? 'material selection' : planSource === 'paste_plain' ? 'paste form' : 'manual builder'}
                        </Text>
                      </TouchableOpacity>
                    </>
                  );
                }
                
                // Input mode based on planSource
                if (planSource === 'upload' && unitStructureStep === 'input') {
                  return (
                    <View>
                      {unitSubjectBanner}
                      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Upload material</Text>
                      <Text style={[styles.mutedText, { marginBottom: 16 }]}>Select a material to parse into curriculum structure.</Text>
                      {loadingMaterials ? (
                        <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                          <ActivityIndicator size="small" color={ACCENT} />
                          <Text style={[styles.mutedText, { marginTop: 8 }]}>Loading materials...</Text>
                        </View>
                      ) : (
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Select material</Text>
                          <TouchableOpacity
                            ref={materialButtonRef}
                            {...(Platform.OS === 'web' && { 'data-material-selector': 'true' })}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              borderWidth: 1,
                              borderColor: BORDER,
                              borderRadius: 8,
                              backgroundColor: BG,
                              minHeight: 40,
                            }}
                            onPress={() => {
                              const willShow = !showMaterialDropdown;
                              if (willShow && Platform.OS === 'web') {
                                const calculatePosition = () => {
                                  let node = materialButtonRef.current?._nativeNode || materialButtonRef.current;
                                  if (!node?.getBoundingClientRect) {
                                    const sel = typeof document !== 'undefined' && document.querySelector?.('[data-material-selector="true"]');
                                    if (sel) node = sel;
                                  }
                                  if (node?.getBoundingClientRect) {
                                    const rect = node.getBoundingClientRect();
                                    const maxH = 300;
                                    const spaceBelow = (typeof window !== 'undefined' ? window.innerHeight : 0) - rect.bottom;
                                    const spaceAbove = rect.top;
                                    if (spaceBelow < 200 && spaceAbove > spaceBelow) {
                                      setMaterialDropdownPosition({ top: rect.top - Math.min(maxH, spaceAbove - 10), left: rect.left, width: Math.max(rect.width, 200), maxHeight: Math.min(maxH, spaceAbove - 10) });
                                    } else {
                                      setMaterialDropdownPosition({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 200), maxHeight: Math.min(maxH, spaceBelow - 10) });
                                    }
                                    return true;
                                  }
                                  return false;
                                };
                                if (!calculatePosition()) setTimeout(calculatePosition, 10);
                              }
                              setShowMaterialDropdown(willShow);
                            }}
                            disabled={loadingMaterials}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={[styles.radioLabel, !selectedMaterialId && { color: MUTED }]} numberOfLines={1}>
                              {selectedMaterialId
                                ? (materials.find(m => m.id === selectedMaterialId)?.title || materials.find(m => m.id === selectedMaterialId)?.provider_name || 'Select material...')
                                : 'Select material...'}
                            </Text>
                            <ChevronDown size={16} color={MUTED} />
                          </TouchableOpacity>
                          {showMaterialDropdown && Platform.OS === 'web' && materialDropdownPosition.top > 0 && (() => {
                            let ReactDOM;
                            try { ReactDOM = require('react-dom'); } catch (_) {}
                            const dropdownContent = (
                              <View
                                style={{
                                  position: 'fixed',
                                  top: materialDropdownPosition.top,
                                  left: materialDropdownPosition.left,
                                  width: materialDropdownPosition.width || 200,
                                  backgroundColor: '#FFFFFF',
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: 'rgba(15,23,42,0.08)',
                                  padding: 4,
                                  maxHeight: materialDropdownPosition.maxHeight || 300,
                                  zIndex: 99999,
                                  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                                }}
                              >
                                <ScrollView
                                  style={{ maxHeight: (materialDropdownPosition.maxHeight || 300) - 8 }}
                                  nestedScrollEnabled
                                  showsVerticalScrollIndicator={true}
                                >
                                  {materials.length === 0 ? (
                                    <Text style={[styles.mutedText, { padding: 12, fontSize: 13 }]}>No materials yet.</Text>
                                  ) : (
                                    materials.map((material) => (
                                      <TouchableOpacity
                                        key={material.id}
                                        style={{
                                          paddingVertical: 8,
                                          paddingHorizontal: 10,
                                          borderRadius: 4,
                                          backgroundColor: selectedMaterialId === material.id ? ACCENT_LIGHT : 'transparent',
                                        }}
                                        onPress={() => {
                                          setSelectedMaterialId(material.id);
                                          setShowMaterialDropdown(false);
                                        }}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <Text style={[styles.radioLabel, selectedMaterialId === material.id && { color: ACCENT, fontWeight: '600' }]}>
                                          {material.title || material.provider_name || 'Untitled Material'}
                                        </Text>
                                      </TouchableOpacity>
                                    ))
                                  )}
                                </ScrollView>
                              </View>
                            );
                            if (ReactDOM && typeof document !== 'undefined' && document.body) {
                              return ReactDOM.createPortal(dropdownContent, document.body);
                            }
                            return dropdownContent;
                          })()}
                          
                          {/* Configuration sections (same as Import & extract) */}
                          <View style={{ marginTop: 24, gap: 16 }}>
                            <View>
                              <Text style={[styles.label, { marginBottom: 8 }]}>Source type</Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                  {SOURCE_TYPES.map((opt) => (
                                    <TouchableOpacity
                                      key={opt.value}
                                      style={[
                                        {
                                          paddingHorizontal: 12,
                                          paddingVertical: 8,
                                          borderRadius: 16,
                                          borderWidth: 1,
                                          borderColor: sourceType === opt.value ? ACCENT : BORDER,
                                          backgroundColor: sourceType === opt.value ? ACCENT_LIGHT : BG,
                                        },
                                      ]}
                                      onPress={() => setSourceType(opt.value)}
                                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                    >
                                      <Text style={[styles.radioLabel, { fontSize: 13, color: sourceType === opt.value ? ACCENT : MUTED }]}>
                                        {s(`courseStructure.importExtract.${opt.labelKey}`) || opt.value}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </ScrollView>
                            </View>
                            
                            <View>
                              <Text style={[styles.label, { marginBottom: 8 }]}>Parse mode</Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                {PARSE_MODES.map((opt) => (
                                  <TouchableOpacity
                                    key={opt.value}
                                    style={[
                                      {
                                        paddingHorizontal: 12,
                                        paddingVertical: 8,
                                        borderRadius: 16,
                                        borderWidth: 1,
                                        borderColor: parseMode === opt.value ? ACCENT : BORDER,
                                        backgroundColor: parseMode === opt.value ? ACCENT_LIGHT : BG,
                                      },
                                    ]}
                                    onPress={() => setParseMode(opt.value)}
                                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                  >
                                    <Text style={[styles.radioLabel, { fontSize: 13, color: parseMode === opt.value ? ACCENT : MUTED }]}>
                                      {s(`courseStructure.importExtract.${opt.labelKey}`) || opt.value}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>
                            
                            <View style={{ gap: 12 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.label}>Detect dates from text</Text>
                                <Switch value={detectDates} onValueChange={setDetectDates} />
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.label}>Preserve source headings</Text>
                                <Switch value={preserveHeadings} onValueChange={setPreserveHeadings} />
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.label}>Ignore policy / admin text</Text>
                                <Switch value={ignorePolicyText} onValueChange={setIgnorePolicyText} />
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.label}>Extract assignments</Text>
                                <Switch value={extractAssignments} onValueChange={setExtractAssignments} />
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={styles.label}>Extract assessments</Text>
                                <Switch value={extractAssessments} onValueChange={setExtractAssessments} />
                              </View>
                            </View>
                            
                            <View>
                              <Text style={[styles.label, { marginBottom: 8 }]}>Special instructions (optional)</Text>
                              <TextInput
                                style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                                placeholder="Any specific parsing instructions..."
                                placeholderTextColor={MUTED}
                                value={specialInstructionsParse}
                                onChangeText={setSpecialInstructionsParse}
                                multiline
                                numberOfLines={2}
                                {...(Platform.OS === 'web' && { cursor: 'text' })}
                              />
                            </View>
                          </View>
                          
                          {selectedMaterialId && (
                            <TouchableOpacity
                              onPress={() => {
                                setUnitStructureStep('paste_input');
                              }}
                              style={[styles.primaryButton, { marginTop: 16, alignSelf: 'flex-start' }]}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text style={styles.primaryButtonText}>Next: Paste content</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  );
                }
                
                // Upload (after material → paste content) or Paste plain text: Import & Extract interface
                if (
                  (planSource === 'upload' && unitStructureStep === 'paste_input') ||
                  (planSource === 'paste_plain' && unitStructureStep === 'input')
                ) {
                  return (
                    <View>
                      {unitSubjectBanner}
                      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Import & extract</Text>
                      <Text style={[styles.mutedText, { marginBottom: 16 }]}>Paste a syllabus, lesson list, or pacing guide and extract units, lessons, assignments, and dates.</Text>
                      
                      <View style={{ gap: 16 }}>
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Paste your content</Text>
                          <TextInput
                            style={[styles.input, { minHeight: 200, textAlignVertical: 'top' }]}
                            placeholder="Paste syllabus, outline, or lesson list here..."
                            placeholderTextColor={MUTED}
                            value={rawText}
                            onChangeText={setRawText}
                            multiline
                            numberOfLines={10}
                            editable={!parsing}
                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                          />
                        </View>
                        
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Source title (optional)</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. Spring Biology Syllabus"
                            placeholderTextColor={MUTED}
                            value={sourceTitle}
                            onChangeText={setSourceTitle}
                            editable={!parsing}
                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                          />
                        </View>
                        
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Source type</Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              {SOURCE_TYPES.map((opt) => (
                                <TouchableOpacity
                                  key={opt.value}
                                  style={[
                                    {
                                      paddingHorizontal: 12,
                                      paddingVertical: 8,
                                      borderRadius: 16,
                                      borderWidth: 1,
                                      borderColor: sourceType === opt.value ? ACCENT : BORDER,
                                      backgroundColor: sourceType === opt.value ? ACCENT_LIGHT : BG,
                                    },
                                  ]}
                                  onPress={() => setSourceType(opt.value)}
                                  disabled={parsing}
                                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                >
                                  <Text style={[styles.radioLabel, { fontSize: 13, color: sourceType === opt.value ? ACCENT : MUTED }]}>
                                    {s(`courseStructure.importExtract.${opt.labelKey}`) || opt.value}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </ScrollView>
                        </View>
                        
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Parse mode</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {PARSE_MODES.map((opt) => (
                              <TouchableOpacity
                                key={opt.value}
                                style={[
                                  {
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: parseMode === opt.value ? ACCENT : BORDER,
                                    backgroundColor: parseMode === opt.value ? ACCENT_LIGHT : BG,
                                  },
                                ]}
                                onPress={() => setParseMode(opt.value)}
                                disabled={parsing}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text style={[styles.radioLabel, { fontSize: 13, color: parseMode === opt.value ? ACCENT : MUTED }]}>
                                  {s(`courseStructure.importExtract.${opt.labelKey}`) || opt.value}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                        
                        <View style={{ gap: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.label}>Detect dates from text</Text>
                            <Switch value={detectDates} onValueChange={setDetectDates} disabled={parsing} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.label}>Preserve source headings</Text>
                            <Switch value={preserveHeadings} onValueChange={setPreserveHeadings} disabled={parsing} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.label}>Ignore policy / admin text</Text>
                            <Switch value={ignorePolicyText} onValueChange={setIgnorePolicyText} disabled={parsing} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.label}>Extract assignments</Text>
                            <Switch value={extractAssignments} onValueChange={setExtractAssignments} disabled={parsing} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.label}>Extract assessments</Text>
                            <Switch value={extractAssessments} onValueChange={setExtractAssessments} disabled={parsing} />
                          </View>
                        </View>
                        
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Special instructions (optional)</Text>
                          <TextInput
                            style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                            placeholder="Any specific parsing instructions..."
                            placeholderTextColor={MUTED}
                            value={specialInstructionsParse}
                            onChangeText={setSpecialInstructionsParse}
                            multiline
                            numberOfLines={2}
                            editable={!parsing}
                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                          />
                        </View>
                        
                        {unitStructureError && (
                          <View style={{ padding: 12, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                            <Text style={{ fontSize: 14, color: ERROR }}>{unitStructureError}</Text>
                          </View>
                        )}
                        
                        <TouchableOpacity
                          onPress={async () => {
                            if (!availableSubject || !familyId || !rawText.trim()) {
                              setUnitStructureError(availableSubject ? 'Please paste some content to parse.' : 'Subject not found.');
                              return;
                            }
                            setParsing(true);
                            setUnitStructureError(null);
                            try {
                              const { data, error: err } = await parsePlainText({
                                subject_id: availableSubject?.id,
                                family_id: familyId,
                                subject_name: availableSubject?.name || '',
                                raw_text: rawText.trim(),
                                source_title: sourceTitle.trim() || null,
                                source_type: sourceType === 'auto_detect' ? null : sourceType,
                                parse_mode: parseMode === 'auto_detect' ? null : parseMode,
                                detect_dates: detectDates,
                                preserve_source_headings: preserveHeadings,
                                ignore_policy_text: ignorePolicyText,
                                extract_assignments: extractAssignments,
                                extract_assessments: extractAssessments,
                                special_instructions: specialInstructionsParse.trim() || null,
                              });
                              if (err || !data) {
                                setUnitStructureError(err?.message || 'Failed to parse content');
                                return;
                              }
                              setDraftData(data);
                              setUnitStructureStep('draft');
                              if (data.units && data.units.length > 0) {
                                setExpandedUnits(new Set([0]));
                              }
                            } catch (err) {
                              setUnitStructureError(err.message || 'Failed to parse content');
                            } finally {
                              setParsing(false);
                            }
                          }}
                          style={[styles.primaryButton, { alignSelf: 'flex-start' }]}
                          disabled={parsing || !rawText.trim()}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          {parsing ? (
                            <>
                              <ActivityIndicator size="small" color={BG} style={{ marginRight: 8 }} />
                              <Text style={styles.primaryButtonText}>Extracting...</Text>
                            </>
                          ) : (
                            <Text style={styles.primaryButtonText}>Extract structure</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }
                
                // Generate mode: Full Generate Curriculum interface
                if (planSource === 'generate' && unitStructureStep === 'input') {
                  return (
                    <View>
                      {unitSubjectBanner}
                      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Generate curriculum</Text>
                      <Text style={[styles.mutedText, { marginBottom: 16 }]}>AI will create structured units and lessons with objectives, materials, and pacing suggestions based on your subject and preferences.</Text>
                      
                      <View style={{ gap: 16 }}>
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Scope / course goal</Text>
                          <TextInput
                            style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
                            placeholder="e.g. Generate a semester-long introduction to watercolor painting"
                            placeholderTextColor={MUTED}
                            value={generationScope}
                            onChangeText={setGenerationScope}
                            multiline
                            numberOfLines={3}
                            editable={!generating}
                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                          />
                        </View>
                        
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Grade level or learner stage</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="K–2, 3–5, 6–8, 9–12, or custom"
                            placeholderTextColor={MUTED}
                            value={learnerStage}
                            onChangeText={setLearnerStage}
                            editable={!generating}
                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                          />
                        </View>
                        
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Duration</Text>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                            {DURATION_OPTIONS.map((opt) => (
                              <TouchableOpacity
                                key={opt.value}
                                style={[
                                  {
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: durationMode === opt.value ? ACCENT : BORDER,
                                    backgroundColor: durationMode === opt.value ? ACCENT_LIGHT : BG,
                                  },
                                ]}
                                onPress={() => setDurationMode(opt.value)}
                                disabled={generating}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text style={[styles.radioLabel, { fontSize: 13, color: durationMode === opt.value ? ACCENT : MUTED }]}>
                                  {s(`courseStructure.generateCurriculum.${opt.labelKey}`) || opt.value}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                          {durationMode === 'custom_weeks' && (
                            <TextInput
                              style={[styles.input, { width: 100, marginTop: 8 }]}
                              placeholder="Weeks"
                              placeholderTextColor={MUTED}
                              value={customWeeks}
                              onChangeText={setCustomWeeks}
                              keyboardType="number-pad"
                              editable={!generating}
                              {...(Platform.OS === 'web' && { cursor: 'text' })}
                            />
                          )}
                        </View>
                        
                        <View style={{ flexDirection: 'row', gap: 16 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { marginBottom: 8 }]}>Approximate lesson count</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="e.g. 18"
                              placeholderTextColor={MUTED}
                              value={lessonCountTarget}
                              onChangeText={setLessonCountTarget}
                              keyboardType="number-pad"
                              editable={!generating}
                              {...(Platform.OS === 'web' && { cursor: 'text' })}
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { marginBottom: 8 }]}>Typical lesson length (minutes)</Text>
                            <TextInput
                              style={styles.input}
                              placeholder="45"
                              placeholderTextColor={MUTED}
                              value={typicalLessonMinutes}
                              onChangeText={setTypicalLessonMinutes}
                              keyboardType="number-pad"
                              editable={!generating}
                              {...(Platform.OS === 'web' && { cursor: 'text' })}
                            />
                          </View>
                        </View>
                        
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Educational style (optional)</Text>
                          <TextInput
                            style={styles.input}
                            placeholder="e.g. project-based, Charlotte Mason–inspired"
                            placeholderTextColor={MUTED}
                            value={educationalStyle}
                            onChangeText={setEducationalStyle}
                            editable={!generating}
                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                          />
                        </View>
                        
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Rigor</Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            {['gentle', 'standard', 'advanced'].map((r) => (
                              <TouchableOpacity
                                key={r}
                                style={[
                                  {
                                    paddingHorizontal: 12,
                                    paddingVertical: 8,
                                    borderRadius: 16,
                                    borderWidth: 1,
                                    borderColor: rigorLevel === r ? ACCENT : BORDER,
                                    backgroundColor: rigorLevel === r ? ACCENT_LIGHT : BG,
                                  },
                                ]}
                                onPress={() => setRigorLevel(r)}
                                disabled={generating}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text style={[styles.radioLabel, { fontSize: 13, color: rigorLevel === r ? ACCENT : MUTED, textTransform: 'capitalize' }]}>
                                  {r}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                        
                        <View style={{ gap: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.label}>Include assessments</Text>
                            <Switch value={includeAssessments} onValueChange={setIncludeAssessments} disabled={generating} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.label}>Include projects</Text>
                            <Switch value={includeProjects} onValueChange={setIncludeProjects} disabled={generating} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.label}>Include materials suggestions</Text>
                            <Switch value={includeMaterials} onValueChange={setIncludeMaterials} disabled={generating} />
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={styles.label}>Include pacing suggestions</Text>
                            <Switch value={includePacing} onValueChange={setIncludePacing} disabled={generating} />
                          </View>
                        </View>
                        
                        <View>
                          <Text style={[styles.label, { marginBottom: 8 }]}>Special instructions (optional)</Text>
                          <TextInput
                            style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                            placeholder="Any specific requirements or preferences..."
                            placeholderTextColor={MUTED}
                            value={specialInstructions}
                            onChangeText={setSpecialInstructions}
                            multiline
                            numberOfLines={2}
                            editable={!generating}
                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                          />
                        </View>
                        
                        {unitStructureError && (
                          <View style={{ padding: 12, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                            <Text style={{ fontSize: 14, color: ERROR }}>{unitStructureError}</Text>
                          </View>
                        )}
                        
                        <TouchableOpacity
                          onPress={async () => {
                            if (!availableSubject || !familyId || !generationScope.trim()) {
                              setUnitStructureError(availableSubject ? 'Please describe what should be covered.' : 'Subject not found.');
                              return;
                            }
                            setGenerating(true);
                            setUnitStructureError(null);
                            try {
                              const { data, error: err } = await generateCurriculumDraft({
                                subject_id: availableSubject?.id,
                                family_id: familyId,
                                subject_name: availableSubject?.name || '',
                                child_ids: getChildIdsForSubject(availableSubject, children),
                                generation_scope: generationScope.trim(),
                                learner_stage: learnerStage.trim() || null,
                                duration_mode: durationMode,
                                custom_weeks: customWeeks.trim() ? parseInt(customWeeks, 10) : null,
                                lesson_count_target: lessonCountTarget.trim() ? parseInt(lessonCountTarget, 10) : null,
                                typical_lesson_minutes: typicalLessonMinutes.trim() ? parseInt(typicalLessonMinutes, 10) : null,
                                educational_style: educationalStyle.trim() || null,
                                rigor_level: rigorLevel,
                                include_assessments: includeAssessments,
                                include_projects: includeProjects,
                                include_materials: includeMaterials,
                                include_pacing: includePacing,
                                special_instructions: specialInstructions.trim() || null,
                              });
                              if (err || !data) {
                                setUnitStructureError(err?.message || 'Failed to generate curriculum');
                                return;
                              }
                              setDraftData(data);
                              setUnitStructureStep('draft');
                              if (data.units && data.units.length > 0) {
                                setExpandedUnits(new Set([0]));
                              }
                            } catch (err) {
                              setUnitStructureError(err.message || 'Failed to generate curriculum');
                            } finally {
                              setGenerating(false);
                            }
                          }}
                          style={[styles.primaryButton, { alignSelf: 'flex-start' }]}
                          disabled={generating || !generationScope.trim()}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          {generating ? (
                            <>
                              <ActivityIndicator size="small" color={BG} style={{ marginRight: 8 }} />
                              <Text style={styles.primaryButtonText}>Generating...</Text>
                            </>
                          ) : (
                            <>
                              <Sparkles size={18} color={BG} style={{ marginRight: 8 }} />
                              <Text style={styles.primaryButtonText}>Generate curriculum</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }
                
                // Paste mode: Full Manual Builder interface (after clearing draft, show start state — do not auto-init manualDraft in useEffect or Back appears broken)
                if (planSource === 'paste' && unitStructureStep === 'input' && !draftData) {
                  if (!manualDraft) {
                    return (
                      <View>
                        {unitSubjectBanner}
                        <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Add unit manually</Text>
                        <Text style={[styles.mutedText, { marginBottom: 20 }]}>
                          Start a new structure, or use Back below to return to method.
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            setManualDraft({
                              title: null,
                              units: [{ temp_id: `temp-${Date.now()}`, title: 'Unit 1', sequence_index: 1, description: null, lessons: [] }],
                            });
                            setExpandedUnitIndexManual(0);
                            setExpandedUnits(new Set([0]));
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderWidth: 2, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 8, gap: 8 }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Plus size={18} color={MUTED} />
                          <Text style={{ fontSize: 14, color: MUTED }}>Start building</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  return (
                    <View>
                      {unitSubjectBanner}
                      <Text style={[styles.sectionTitle, { marginBottom: 8 }]}>Add unit manually</Text>
                      
                      {/* Tip banner */}
                      <View style={{ padding: 12, backgroundColor: '#f0f9ff', borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#bae6fd' }}>
                        <Text style={{ fontSize: 12, color: '#0369a1', lineHeight: 16 }}>
                          <Text style={{ fontWeight: '600' }}>Tip:</Text> Add optional reference dates from your syllabus to see how units correlate to your planner.
                        </Text>
                      </View>
                      
                      {/* Units list */}
                      {(manualDraft.units || []).map((unit, uIdx) => (
                        <View key={unit.temp_id || uIdx} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: BG, marginBottom: 16, overflow: 'hidden' }}>
                          {/* Unit header */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: expandedUnitIndexManual === uIdx ? 1 : 0, borderBottomColor: BORDER }}>
                            <TouchableOpacity
                              onPress={() => setExpandedUnitIndexManual(expandedUnitIndexManual === uIdx ? -1 : uIdx)}
                              style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8 }}
                              activeOpacity={0.7}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              {expandedUnitIndexManual === uIdx ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                              <Text style={[styles.sectionTitle, { fontSize: 15 }]}>{unit.title || `Unit ${uIdx + 1}`}</Text>
                              <Text style={[styles.mutedText, { fontSize: 13 }]}>({(unit.lessons || []).length})</Text>
                            </TouchableOpacity>
                            {manualDraft.units.length > 1 && (
                              <TouchableOpacity
                                onPress={() => deleteDraftUnit(uIdx)}
                                style={{ padding: 4 }}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Trash2 size={18} color={ERROR} />
                              </TouchableOpacity>
                            )}
                          </View>
                          
                          {/* Expanded unit body */}
                          {expandedUnitIndexManual === uIdx && (
                            <View style={{ padding: 16, gap: 16 }}>
                              <View>
                                <Text style={[styles.label, { marginBottom: 8 }]}>Unit title</Text>
                                <TextInput
                                  style={styles.input}
                                  value={unit.title || ''}
                                  onChangeText={(v) => updateDraftUnit(uIdx, 'title', v)}
                                  placeholder={`Unit ${uIdx + 1}`}
                                  placeholderTextColor={MUTED}
                                  {...(Platform.OS === 'web' && { cursor: 'text' })}
                                />
                              </View>
                              
                              <View>
                                <Text style={[styles.label, { marginBottom: 8 }]}>Description (optional)</Text>
                                <TextInput
                                  style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
                                  value={unit.description || ''}
                                  onChangeText={(v) => updateDraftUnit(uIdx, 'description', v)}
                                  placeholder="Optional unit description..."
                                  placeholderTextColor={MUTED}
                                  multiline
                                  numberOfLines={2}
                                  {...(Platform.OS === 'web' && { cursor: 'text' })}
                                />
                              </View>
                              
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 }}
                                onPress={() => addDraftLesson(uIdx)}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Plus size={14} color={ACCENT} />
                                <Text style={{ fontSize: 14, color: ACCENT }}>Break it down further</Text>
                              </TouchableOpacity>
                              
                              {/* Lessons */}
                              {(unit.lessons || []).map((lesson, lIdx) => (
                                <View key={lesson.temp_id || lIdx} style={{ borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 12, gap: 12 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                                    <View style={{ flex: 1, gap: 12 }}>
                                      <TextInput
                                        style={styles.input}
                                        value={lesson.title || ''}
                                        onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'title', v)}
                                        placeholder="Lesson title"
                                        placeholderTextColor={MUTED}
                                        {...(Platform.OS === 'web' && { cursor: 'text' })}
                                      />
                                      
                                      <View style={{ flexDirection: 'row', gap: 16 }}>
                                        <View>
                                          <Text style={[styles.smallLabel, { marginBottom: 4 }]}>Duration (min)</Text>
                                          <TextInput
                                            style={[styles.input, { width: 70 }]}
                                            value={String(lesson.minutes_est ?? 60)}
                                            onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'minutes_est', v ? parseInt(v, 10) : null)}
                                            keyboardType="number-pad"
                                            placeholder="60"
                                            placeholderTextColor={MUTED}
                                            {...(Platform.OS === 'web' && { cursor: 'text' })}
                                          />
                                        </View>
                                        
                                        <View>
                                          <Text style={[styles.smallLabel, { marginBottom: 4 }]}>Reference date (optional)</Text>
                                          {Platform.OS === 'web' ? (
                                            <input
                                              type="date"
                                              value={lesson.reference_date || ''}
                                              onChange={(e) => updateDraftLesson(uIdx, lIdx, 'reference_date', e.target.value || null)}
                                              style={{
                                                width: 120,
                                                padding: '8px',
                                                borderRadius: '8px',
                                                border: '1px solid #d1d5db',
                                                fontSize: '14px',
                                                backgroundColor: '#fff',
                                              }}
                                            />
                                          ) : (
                                            <TextInput
                                              style={[styles.input, { width: 120 }]}
                                              value={lesson.reference_date || ''}
                                              onChangeText={(v) => updateDraftLesson(uIdx, lIdx, 'reference_date', v || null)}
                                              placeholder="YYYY-MM-DD"
                                              placeholderTextColor={MUTED}
                                            />
                                          )}
                                          <Text style={[styles.smallLabel, { fontSize: 10, color: MUTED, marginTop: 2 }]}>From syllabus; connects to planner</Text>
                                        </View>
                                      </View>
                                      
                                      <View>
                                        <Text style={[styles.smallLabel, { marginBottom: 8 }]}>Type</Text>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                          <View style={{ flexDirection: 'row', gap: 8 }}>
                                            {LESSON_TYPES.map((t) => (
                                              <TouchableOpacity
                                                key={t}
                                                style={[
                                                  {
                                                    paddingHorizontal: 12,
                                                    paddingVertical: 6,
                                                    borderRadius: 16,
                                                    borderWidth: 1,
                                                    borderColor: (lesson.lesson_type || 'lesson') === t ? ACCENT : BORDER,
                                                    backgroundColor: (lesson.lesson_type || 'lesson') === t ? ACCENT_LIGHT : BG,
                                                  },
                                                ]}
                                                onPress={() => updateDraftLesson(uIdx, lIdx, 'lesson_type', t)}
                                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                              >
                                                <Text style={[styles.radioLabel, { fontSize: 12, color: (lesson.lesson_type || 'lesson') === t ? ACCENT : MUTED, textTransform: 'capitalize' }]}>
                                                  {t}
                                                </Text>
                                              </TouchableOpacity>
                                            ))}
                                          </View>
                                        </ScrollView>
                                      </View>
                                    </View>
                                    
                                    <View style={{ gap: 8, alignItems: 'center' }}>
                                      <TouchableOpacity
                                        onPress={() => moveDraftLesson(uIdx, lIdx, -1)}
                                        disabled={lIdx === 0}
                                        style={{ padding: 4 }}
                                        {...(Platform.OS === 'web' && { cursor: lIdx === 0 ? 'not-allowed' : 'pointer' })}
                                      >
                                        <ChevronUp size={18} color={lIdx === 0 ? '#ccc' : MUTED} />
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        onPress={() => moveDraftLesson(uIdx, lIdx, 1)}
                                        disabled={lIdx === (unit.lessons || []).length - 1}
                                        style={{ padding: 4 }}
                                        {...(Platform.OS === 'web' && { cursor: lIdx === (unit.lessons || []).length - 1 ? 'not-allowed' : 'pointer' })}
                                      >
                                        <ChevronDown size={18} color={lIdx === (unit.lessons || []).length - 1 ? '#ccc' : MUTED} />
                                      </TouchableOpacity>
                                      {(unit.lessons || []).length > 1 && (
                                        <TouchableOpacity
                                          onPress={() => deleteDraftLesson(uIdx, lIdx)}
                                          style={{ padding: 4 }}
                                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                        >
                                          <Trash2 size={16} color={ERROR} />
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                  </View>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      ))}
                      
                      {/* Add unit button */}
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, marginTop: 8, borderWidth: 2, borderColor: BORDER, borderStyle: 'dashed', borderRadius: 8, gap: 8 }}
                        onPress={() => {
                          const newUnits = [...(manualDraft.units || [])];
                          const newUnit = {
                            temp_id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                            title: `Unit ${newUnits.length + 1}`,
                            sequence_index: newUnits.length + 1,
                            description: null,
                            lessons: [],
                          };
                          newUnits.push(newUnit);
                          setManualDraft({ ...manualDraft, units: newUnits });
                          setExpandedUnitIndexManual(newUnits.length - 1);
                        }}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Plus size={18} color={MUTED} />
                        <Text style={{ fontSize: 14, color: MUTED }}>Add unit</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                
                // If placeholders or no data, show empty state
                return (
                  <View style={{ paddingVertical: 48, paddingHorizontal: 8, alignItems: 'stretch' }}>
                    {unitSubjectBanner}
                    <Text style={[styles.mutedText, { fontSize: 14, textAlign: 'center' }]}>
                      {planSource === 'placeholders' 
                        ? 'No unit structure needed for cadence-only plans.'
                        : 'Select a method in step 1 to build curriculum structure.'}
                    </Text>
                  </View>
                );
              })()}
            </ScrollView>
  );

  const modalContent = (
    <TouchableOpacity
      style={[
        styles.modal,
        (PLAN_MY_YEAR_LOGISTICS_FIRST && !pickerOnly) || (renderInline && showYourPlansList)
          ? styles.modalFlatLf
          : null,
        (renderInline && { flex: 1, minHeight: 0, width: '100%', maxWidth: '100%', alignSelf: 'stretch' }) || {},
        /* Inline YOUR PLANS: full width of planner column — do not apply pickerModal (maxWidth 640). */
        pickerOnly && !(renderInline && showYourPlansList) && styles.pickerModal,
        showYourPlansList && styles.pickerModalPlanSummary,
        (pickerOnly || showYourPlansList) &&
          !(renderInline && showYourPlansList) &&
          (Platform.OS === 'web' ? { boxShadow: '0 10px 25px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.05)' } : { shadowOpacity: 0.08, elevation: 4 }),
      ]}
      activeOpacity={1}
      onPress={() => {}}
    >
          {!pickerOnly && !PLAN_MY_YEAR_LOGISTICS_FIRST ? (
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
            {PLAN_MY_YEAR_LOGISTICS_FIRST ? null : (
            <View style={styles.breadcrumbRow}>
              {editingFromSummary ? (
                <>
                  <Text style={[styles.breadcrumbStep, planStep === 'logistics' && styles.breadcrumbStepCurrent]}>Edit</Text>
                  <Text style={[styles.breadcrumbSeparator]}>{'  -->  '}</Text>
                  <Text style={[styles.breadcrumbStep, planStep === 'preview' && styles.breadcrumbStepCurrent]}>Review</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.breadcrumbStep, planStep === 'source' && styles.breadcrumbStepCurrent]}>1. Method</Text>
                  <Text style={[styles.breadcrumbSeparator]}>{'  ·  '}</Text>
                  <Text style={[styles.breadcrumbStep, planStep === 'unit_structure' && styles.breadcrumbStepCurrent]}>2. Unit Structure</Text>
                  <Text style={[styles.breadcrumbSeparator]}>{'  ·  '}</Text>
                  <Text style={[styles.breadcrumbStep, planStep === 'logistics' && styles.breadcrumbStepCurrent]}>3. Logistics</Text>
                  <Text style={[styles.breadcrumbSeparator]}>{'  ·  '}</Text>
                  <Text style={[styles.breadcrumbStep, planStep === 'preview' && styles.breadcrumbStepCurrent]}>4. Review</Text>
                </>
              )}
            </View>
            )}
            {unitHeaderSubtitle ? (
              <Text style={[styles.modalHeaderMeta, { marginTop: 6 }]} numberOfLines={2}>
                {unitHeaderSubtitle}
              </Text>
            ) : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButtonHeader} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
              <X size={22} color={FG} />
            </TouchableOpacity>
          </View>
          ) : null}
          {planSummaryYearId ? (
            <ScrollView style={styles.content} contentContainerStyle={styles.planSummaryContentContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.pickerBody}>
                {planSummaryLoading ? (
                  <>
                    <View style={[styles.pickerHeader, styles.planSummaryHeaderRow, styles.planSummaryPadded]}>
                      <Text style={styles.planSummaryModalTitle}>Plan summary</Text>
                    </View>
                    <View style={styles.planSummaryDividerFullWrap}>
                      <View style={styles.planSummaryDividerFull} />
                    </View>
                    <View style={[styles.pickerLoading, styles.planSummaryPadded]}>
                      <ActivityIndicator size="small" color={ACCENT} />
                      <Text style={[styles.mutedText, { marginTop: 8 }]}>Loading plan…</Text>
                    </View>
                  </>
                ) : planSummaryError ? (
                  <>
                    <View style={[styles.pickerHeader, styles.planSummaryHeaderRow, styles.planSummaryPadded]}>
                      <Text style={styles.planSummaryModalTitle}>Plan summary</Text>
                    </View>
                    <View style={styles.planSummaryDividerFullWrap}>
                      <View style={styles.planSummaryDividerFull} />
                    </View>
                    <View style={[styles.errorBox, styles.planSummaryPadded]}>
                      <Text style={styles.errorText}>{planSummaryError}</Text>
                      <TouchableOpacity onPress={() => { setPlanSummaryYearId(null); setPlanSummaryData(null); setPlanSummaryError(null); setAcademicYearId(null); setEditingFromSummary(false); }} style={{ marginTop: 12 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <Text style={{ fontSize: 14, color: ACCENT, fontWeight: '600' }}>Back to list</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : planSummaryData ? (() => {
                  const data = planSummaryData;
                  const planStart = data.plan?.start_date || data.start_date || '';
                  const planEnd = data.plan?.end_date || data.end_date || '';
                  const blocks = Array.isArray(data.plan?.blocks) ? data.plan.blocks : [];
                  const childIds = Array.from(new Set(blocks.flatMap((b) => b.child_ids || []).filter(Boolean)));
                  const subjectIds = Array.from(new Set(blocks.map((b) => b.subject_id).filter(Boolean)));
                  const assigneeNames = childIds.length > 0
                    ? childIds.map((id) => children.find((c) => String(c.id) === String(id))?.first_name || children.find((c) => String(c.id) === String(id))?.name || 'Child').filter(Boolean)
                    : (blocks.length > 0 ? ['Whole family'] : []);
                  const subjectNames = subjectIds.map((id) => baseSubjectList.find((s) => String(s.id) === String(id))?.name).filter(Boolean);
                  const planSlotLabelsForTitle = Array.isArray(data.plan?.plan_slot_labels) ? data.plan.plan_slot_labels : [];
                  const unitTopics = [...new Set(planSlotLabelsForTitle.map((l) => (l.unit || '').trim()).filter(Boolean))];
                  const summaryTitleParts = [
                    assigneeNames.length ? assigneeNames.join(', ') : 'Whole family',
                    subjectNames.length ? subjectNames.join(', ') : 'No subject',
                    unitTopics.length ? unitTopics.join(', ') : null,
                    planStart && planEnd ? `${formatDateDisplay(planStart)} – ${formatDateDisplay(planEnd)}` : '',
                  ].filter(Boolean);
                  const summaryTitle = data.year_name || (summaryTitleParts.length > 0
                    ? summaryTitleParts.join(' · ')
                    : 'Academic year');
                  const p = data.plan || {};
                  const constraintMode = p.constraint_mode === 'hours' ? 'hours' : p.constraint_mode === 'days' ? 'days' : 'none';
                  const targetDays = p.target_days != null ? p.target_days : null;
                  const targetHours = p.target_hours != null ? p.target_hours : null;
                  const holidaySettings = data.holiday_settings || {};
                  const followPublic = holidaySettings.follow_global_holidays !== false;
                  const holidayCountry = holidaySettings.holiday_country_code || 'US';
                  const hasHolidays = !!data.holiday_settings;
                  const targetLabel = constraintMode === 'days' && targetDays != null ? `${targetDays} days` : constraintMode === 'hours' && targetHours != null ? `${targetHours} hours` : null;
                  const holidaysLabel = hasHolidays ? (followPublic ? `Public holidays: On (${holidayCountry})` : 'Public holidays: Off') : null;
                  const fieldWrap = { marginRight: 12, marginBottom: 12 };
                  const planSlotLabels = Array.isArray(data.plan?.plan_slot_labels) ? data.plan.plan_slot_labels : [];
                  const planEventDates = Array.isArray(data.plan?.plan_event_dates) ? data.plan.plan_event_dates : (Array.isArray(data.plan?.plan_slot_dates) ? data.plan.plan_slot_dates : []);
                  const eventExistsKey = (ymd, subjectId, startLocal) => {
                    const s = startLocal == null ? '' : String(startLocal).trim().replace(/^(\d):/, '0$1:');
                    return `${ymd}|${String(subjectId)}|${s}`;
                  };
                  const existingEventKeys = new Set(
                    planEventDates.map((e) => eventExistsKey(e.date_ymd, e.subject_id, e.start_local || ''))
                  );
                  const summarySlotLines = (() => {
                    if (!planStart || !planEnd || blocks.length === 0) return [];
                    const exclusionRanges = [];
                    const lines = [];
                    blocks.forEach((block) => {
                      const subjectName = (baseSubjectList || []).find((s) => String(s.id) === String(block.subject_id))?.name || 'Subject';
                      const timeLabel = block.all_day ? 'All day' : formatTimeRange(block.start_time, block.end_time);
                      const startLocal = block.all_day ? null : (block.start_time || '09:00');
                      const dates = getBlockOccurrenceDates(block, planStart, planEnd, exclusionRanges);
                      dates.forEach((ymd) => {
                        const key = eventExistsKey(ymd, block.subject_id, startLocal);
                        if (existingEventKeys.size > 0 && !existingEventKeys.has(key)) return;
                        const line = {
                          date: ymd,
                          dateLabel: formatDateDisplay(ymd),
                          timeLabel,
                          subjectName,
                          subjectId: block.subject_id,
                          startLocal,
                          academicYearId: planSummaryYearId,
                        };
                        const label = planSlotLabels.find(
                          (l) => l.date_ymd === ymd && String(l.subject_id) === String(block.subject_id) && (startLocal == null ? l.start_local == null : (l.start_local === startLocal || (l.start_local && startLocal && l.start_local.replace(/^0/, '') === startLocal.replace(/^0/, ''))))
                        );
                        if (label && (label.unit || '').trim()) line.unitTopic = (label.unit || '').trim();
                        const matchingEvent = planEventDates.find((e) => eventExistsKey(e.date_ymd, e.subject_id, e.start_local) === key);
                        if (matchingEvent && matchingEvent.has_attachment) line.hasAttachment = true;
                        lines.push(line);
                      });
                    });
                    lines.sort((a, b) => a.date.localeCompare(b.date) || (a.timeLabel || '').localeCompare(b.timeLabel || ''));
                    return lines;
                  })();
                  return (
                    <>
                      <View style={[styles.pickerHeader, styles.planSummaryHeaderRow, styles.planSummaryPadded]}>
                        <Text style={styles.planSummaryModalTitle} numberOfLines={2}>{summaryTitle}</Text>
                      </View>
                      <View style={styles.planSummaryDividerFullWrap}>
                        <View style={styles.planSummaryDividerFull} />
                      </View>
                      {summarySlotLines.length > 0 ? (
                        <>
                          <View style={[styles.planSummaryPadded, { marginTop: 4, marginBottom: 8 }]}>
                            <Text style={styles.planSummaryDatesSectionLabel}>Dates with events</Text>
                          </View>
                          <View style={styles.planSummaryDatesList}>
                            {summarySlotLines.map((line, idx) => {
                              const dispatchOpenSlot = () => {
                                if (typeof window !== 'undefined') {
                                  const detail = {
                                    dateYmd: line.date,
                                    startLocal: line.startLocal,
                                    subjectId: line.subjectId,
                                    academicYearId: line.academicYearId,
                                    subjectName: line.subjectName,
                                  };
                                  if (__DEV__) console.log('[PlanYearModal] Dispatching openEventForPlanSlot', detail);
                                  window.dispatchEvent(new CustomEvent('openEventForPlanSlot', { detail }));
                                }
                              };
                              return (
                              <TouchableOpacity
                                key={`${line.date}-${line.subjectName}-${idx}`}
                                style={styles.planSummaryDateRow}
                                onPress={dispatchOpenSlot}
                                activeOpacity={0.7}
                                hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
                                {...(Platform.OS === 'web' && {
                                  cursor: 'pointer',
                                  onClick: (e) => { e.stopPropagation(); e.preventDefault(); dispatchOpenSlot(); },
                                })}
                              >
                                <View style={styles.planSummaryDateRowInner}>
                                  <Text style={styles.planSummaryDateRowText} numberOfLines={1}>
                                    {line.dateLabel}{line.timeLabel ? ` · ${line.timeLabel}` : ''}{line.subjectName ? ` · ${line.subjectName}` : ''}{line.unitTopic ? ` · ${line.unitTopic}` : ''}
                                  </Text>
                                  {line.hasAttachment ? (
                                    <View style={styles.planSummaryDateRowAttachment}>
                                      <Paperclip size={14} color={MUTED} strokeWidth={2} />
                                    </View>
                                  ) : null}
                                </View>
                              </TouchableOpacity>
                            );
                            })}
                          </View>
                        </>
                      ) : null}
                      <View style={styles.planSummaryFooterStrip}>
                        <TouchableOpacity onPress={() => { setPlanSummaryYearId(null); setPlanSummaryData(null); setPlanSummaryError(null); setAcademicYearId(null); setEditingFromSummary(false); }} style={styles.cancelButton} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Text style={[styles.cancelText, styles.pickerCancelText]}>Back to list</Text>
                        </TouchableOpacity>
                        <View style={styles.planSummaryFooterRight}>
                          <TouchableOpacity
                            onPress={() => setShowDeletePlanConfirm(true)}
                            style={styles.cancelButton}
                            disabled={deletingPlan}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={[styles.cancelText, styles.pickerCancelText]}>Delete Plan</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => { setAcademicYearId(planSummaryYearId); setPlanSummaryYearId(null); setPlanSummaryData(null); setPlanSummaryError(null); setShowPlanManagerView(false); setPlanStep('logistics'); setEditingFromSummary(true); }}
                            style={styles.primaryButton}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={styles.primaryButtonText}>Edit Plan</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  );
                })() : null}
              </View>
            </ScrollView>
          ) : planStep === 'preview' && !(PLAN_MY_YEAR_LOGISTICS_FIRST && isHomeschool) ? (
            <View style={{ flex: 1, minHeight: 0 }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={true}>
                <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Preview instructional slots</Text>
                <Text style={[styles.mutedText, { marginBottom: 16 }]}>
                  {previewSlotLines.length} slot{previewSlotLines.length !== 1 ? 's' : ''} based on your date range and holidays & breaks.
                </Text>
                {PLAN_MY_YEAR_LOGISTICS_FIRST && effectiveSubjectIds.length > 1 && (
                  <View
                    style={{
                      marginBottom: 16,
                      padding: 12,
                      backgroundColor: '#f8fafc',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: BORDER,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: FG, lineHeight: 19 }}>
                      <Text style={{ fontWeight: '600' }}>{s('planMyYear.multiSubjectUnits.previewMultiSubjectLead')} </Text>
                      {s('planMyYear.multiSubjectUnits.previewMultiSubjectHint')}
                    </Text>
                  </View>
                )}
                {previewSlotLines.map((line, idx) => (
                  <View key={`${line.date}-${line.subjectName}-${idx}`} style={{ paddingVertical: 12, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                    <Text style={[styles.label, { marginBottom: 2 }]}>{line.dateLabel} · {line.timeLabel}</Text>
                    <Text style={[styles.mutedText, { fontSize: 14 }]}>{line.subjectName}{line.childNames ? ` · ${line.childNames}` : ''}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : showEntryChoice ? (
            <View style={styles.entryChoiceBody}>
              <View style={styles.entryChoiceHeaderRow}>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={onClose} style={styles.closeButtonHeader} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                  <X size={22} color={FG} />
                </TouchableOpacity>
              </View>
              <Text style={styles.entryChoiceSubtitle}>Editing an existing plan or creating a new one?</Text>
              <TouchableOpacity
                onPress={() => setShowPlanManagerView(true)}
                style={styles.entryChoiceButtonSecondary}
                activeOpacity={0.85}
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: () => setEntryChoiceHoverKey('edit'),
                  onMouseLeave: () => setEntryChoiceHoverKey(null),
                })}
              >
                <View style={styles.entryChoiceButtonInner}>
                  <Calendar size={20} color={SUB} style={styles.entryChoiceIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryChoiceButtonText}>Edit Existing Plan</Text>
                    <Text style={styles.entryChoiceButtonSubtext}>View and edit existing plans</Text>
                  </View>
                  {Platform.OS === 'web' && entryChoiceHoverKey === 'edit' && (
                    <ArrowRight size={18} color={SUB} style={{ marginLeft: 8 }} />
                  )}
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setStartCreatingNew(true)}
                style={styles.entryChoiceButtonPrimary}
                activeOpacity={0.85}
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: () => setEntryChoiceHoverKey('create'),
                  onMouseLeave: () => setEntryChoiceHoverKey(null),
                })}
              >
                <View style={styles.entryChoiceButtonInner}>
                  <Sparkles size={20} color="#FFFFFF" style={styles.entryChoiceIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.entryChoiceButtonTextPrimary}>Create New Plan</Text>
                    <Text style={styles.entryChoiceButtonSubtextPrimary}>Start with scope, then method and logistics</Text>
                  </View>
                  {Platform.OS === 'web' && entryChoiceHoverKey === 'create' && (
                    <ArrowRight size={18} color="rgba(255,255,255,0.9)" style={{ marginLeft: 8 }} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          ) : showYourPlansList ? (
            <ScrollView
              style={[styles.content, renderInline && styles.planListScrollInline]}
              contentContainerStyle={[styles.planListContentContainer, renderInline && styles.planListContentContainerInline]}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.planYearGlanceHeaderWrap}>
                <Text style={styles.planYearGlanceTitle}>{t('planMyYear.modal.editPlanTitle')}</Text>
                <Text style={styles.planYearGlanceHelp}>{t('planMyYear.modal.editPlanHelp')}</Text>
              </View>
              {loadError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{loadError}</Text>
                </View>
              )}
              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
              <View style={styles.pickerBody}>
                {previousPlansLoading ? (
                  <View style={styles.pickerLoading}>
                    <ActivityIndicator size="small" color={ACCENT} />
                    <Text style={[styles.mutedText, { marginTop: 8 }]}>Loading previous plans…</Text>
                  </View>
                ) : previousPlans.length > 0 ? (
                  <>
                    <ScrollView
                      style={{ maxHeight: 320 }}
                      contentContainerStyle={{ paddingRight: 4, paddingBottom: 8 }}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                    >
                      <View style={{ gap: 20 }}>
                      {previousPlans.map((ay) => {
                        const lines = parsePlanCardLines(ay);
                        const isSelected = planSummaryYearId === ay.id;
                        return (
                          <TouchableOpacity
                            key={ay.id}
                            onPress={() => setPlanSummaryYearId(ay.id)}
                            style={[styles.planListItem, isSelected && styles.planListItemSelected]}
                            activeOpacity={0.85}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <View style={styles.planCardTitleRow}>
                              {lines.line2 ? <Text style={styles.planCardTitle} numberOfLines={1}>{lines.line2}</Text> : null}
                              {lines.line3 ? <Text style={styles.planCardDateInline} numberOfLines={1}>{lines.line3}</Text> : null}
                            </View>
                            {lines.line1 ? (
                              <View style={styles.planCardChildRow}>
                                <View style={styles.planCardChildDot} />
                                <Text style={styles.planCardOwner} numberOfLines={1}>{lines.line1}</Text>
                              </View>
                            ) : null}
                          </TouchableOpacity>
                        );
                      })}
                      </View>
                    </ScrollView>
                  </>
                ) : (
                  <Text style={[styles.mutedText, { fontSize: 17, marginTop: 28, marginBottom: 16 }]}>Nothing to see here (yet). Create a new plan to get started.</Text>
                )}
              </View>
            </ScrollView>
          ) : planStep === 'source' ? (
            <ScrollView style={styles.content} contentContainerStyle={[styles.contentContainer, styles.sourceStepContent]} showsVerticalScrollIndicator={false}>
              <View>
                {PLAN_MY_YEAR_LOGISTICS_FIRST && effectiveSubjectIds.length > 1 && !initialSubjectId && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={[styles.label, { marginBottom: 6 }]}>{s('planMyYear.multiSubjectUnits.subjectPickerTitle')}</Text>
                    <Text style={[styles.mutedText, { marginBottom: 10, fontSize: 13, lineHeight: 18 }]}>
                      {s('planMyYear.multiSubjectUnits.subjectPickerHint')}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {effectiveSubjectIds.map((sid) => {
                        const subj = baseSubjectList.find((s) => String(s.id) === String(sid));
                        const name = subj?.name ?? 'Subject';
                        const selected = String(unitFocusSubjectId) === String(sid);
                        return (
                          <TouchableOpacity
                            key={String(sid)}
                            onPress={() => setUnitFocusSubjectId(sid)}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            accessibilityLabel={t('planMyYear.multiSubjectUnits.a11ySelectSubjectChip', { subjectName: name })}
                            style={{
                              paddingHorizontal: 14,
                              paddingVertical: 8,
                              borderRadius: 20,
                              borderWidth: 1,
                              borderColor: selected ? ACCENT : BORDER,
                              backgroundColor: selected ? ACCENT_LIGHT : BG,
                            }}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text style={{ fontSize: 14, fontWeight: selected ? '600' : '500', color: selected ? ACCENT : FG }}>
                              {name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                )}
                {/* Set unit structure - method options */}
                <View style={{ gap: OPTION_GAP }}>
                  {/* Manual input */}
                  {(() => {
                    const key = 'paste';
                    const opt = STRINGS.planMyYear?.sections?.useASource?.options?.[key];
                    const label = opt?.label ?? 'Manual input';
                    const description = opt?.description ?? '';
                    const isSelected = planSource === key;
                    const isHover = Platform.OS === 'web' && hoverSourceKey === `unit-${key}` && !isSelected;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          if (!ensureUnitSubjectForUnitStructure()) return;
                          setPlanSource('paste');
                          setDraftData(null);
                          setRawText('');
                          setUnitStructureStep('input');
                          setManualDraft({
                            title: null,
                            units: [{ temp_id: `temp-${Date.now()}`, title: 'Unit 1', sequence_index: 1, description: null, lessons: [] }],
                          });
                          setExpandedUnitIndexManual(0);
                          setExpandedUnits(new Set([0]));
                          setPlanStep('unit_structure');
                        }}
                        activeOpacity={0.9}
                        style={[
                          styles.sourceOptionTile,
                          isSelected && styles.sourceOptionTileSelected,
                          isHover && styles.sourceOptionTileHover,
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoverSourceKey(`unit-${key}`) : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoverSourceKey(null) : undefined}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={styles.sourceOptionIconWrap}>
                          <List size={18} color={MUTED} />
                        </View>
                        <View style={styles.sourceOptionBody}>
                          <Text style={styles.sourceOptionTitle}>{label}</Text>
                          {description ? (
                            <Text style={styles.sourceOptionDescription}>{description}</Text>
                          ) : null}
                        </View>
                        {isSelected && (
                          <View style={styles.sourceOptionCheckWrap}>
                            <Check size={18} color={BRAND_500} strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                  
                  {/* Paste plain text (import & extract — same description as manual input) */}
                  {(() => {
                    const key = 'pastePlain';
                    const opt = STRINGS.planMyYear?.sections?.useASource?.options?.[key];
                    const label = opt?.label ?? 'Paste plain text';
                    const description = opt?.description ?? STRINGS.planMyYear?.sections?.useASource?.options?.paste?.description ?? '';
                    const isSelected = planSource === 'paste_plain';
                    const isHover = Platform.OS === 'web' && hoverSourceKey === 'unit-paste_plain' && !isSelected;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          if (!ensureUnitSubjectForUnitStructure()) return;
                          setPlanSource('paste_plain');
                          setDraftData(null);
                          setManualDraft(null);
                          setUnitStructureStep('input');
                          setRawText('');
                          setExpandedUnits(new Set());
                          setExpandedUnitIndexManual(0);
                          setPlanStep('unit_structure');
                        }}
                        activeOpacity={0.9}
                        style={[
                          styles.sourceOptionTile,
                          isSelected && styles.sourceOptionTileSelected,
                          isHover && styles.sourceOptionTileHover,
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoverSourceKey('unit-paste_plain') : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoverSourceKey(null) : undefined}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={styles.sourceOptionIconWrap}>
                          <FileText size={18} color={MUTED} />
                        </View>
                        <View style={styles.sourceOptionBody}>
                          <Text style={styles.sourceOptionTitle}>{label}</Text>
                          {description ? (
                            <Text style={styles.sourceOptionDescription}>{description}</Text>
                          ) : null}
                        </View>
                        {isSelected && (
                          <View style={styles.sourceOptionCheckWrap}>
                            <Check size={18} color={BRAND_500} strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                  
                  {/* Upload material */}
                  {(() => {
                    const key = 'upload';
                    const opt = STRINGS.planMyYear?.sections?.useASource?.options?.[key];
                    const label = opt?.label ?? 'Upload material';
                    const description = opt?.description ?? '';
                    const isSelected = planSource === key;
                    const isHover = Platform.OS === 'web' && hoverSourceKey === `unit-${key}` && !isSelected;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          if (!ensureUnitSubjectForUnitStructure()) return;
                          setPlanSource('upload');
                          setDraftData(null);
                          setManualDraft(null);
                          setUnitStructureStep('input');
                          setRawText('');
                          setPlanStep('unit_structure');
                        }}
                        activeOpacity={0.9}
                        style={[
                          styles.sourceOptionTile,
                          isSelected && styles.sourceOptionTileSelected,
                          isHover && styles.sourceOptionTileHover,
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoverSourceKey(`unit-${key}`) : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoverSourceKey(null) : undefined}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={styles.sourceOptionIconWrap}>
                          <Upload size={18} color={MUTED} />
                        </View>
                        <View style={styles.sourceOptionBody}>
                          <Text style={styles.sourceOptionTitle}>{label}</Text>
                          {description ? (
                            <Text style={styles.sourceOptionDescription}>{description}</Text>
                          ) : null}
                        </View>
                        {isSelected && (
                          <View style={styles.sourceOptionCheckWrap}>
                            <Check size={18} color={BRAND_500} strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                  
                  {/* Generate curriculum */}
                  {(() => {
                    const key = 'generate';
                    const label = 'Generate curriculum';
                    const description = 'AI will create structured units and lessons with objectives, materials, and pacing suggestions based on your subject and preferences.';
                    const isSelected = planSource === key;
                    const isHover = Platform.OS === 'web' && hoverSourceKey === `unit-${key}` && !isSelected;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          if (!ensureUnitSubjectForUnitStructure()) return;
                          setPlanSource('generate');
                          setDraftData(null);
                          setManualDraft(null);
                          setUnitStructureStep('input');
                          setRawText('');
                          setPlanStep('unit_structure');
                        }}
                        activeOpacity={0.9}
                        style={[
                          styles.sourceOptionTile,
                          isSelected && styles.sourceOptionTileSelected,
                          isHover && styles.sourceOptionTileHover,
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoverSourceKey(`unit-${key}`) : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoverSourceKey(null) : undefined}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={styles.sourceOptionIconWrap}>
                          <Sparkles size={18} color={MUTED} />
                        </View>
                        <View style={styles.sourceOptionBody}>
                          <Text style={styles.sourceOptionTitle}>{label}</Text>
                          <Text style={styles.sourceOptionDescription}>{description}</Text>
                        </View>
                        {isSelected && (
                          <View style={styles.sourceOptionCheckWrap}>
                            <Check size={18} color={BRAND_500} strokeWidth={2.5} />
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                  
                  {/* Skip to cadence link */}
                  <TouchableOpacity
                    onPress={() => {
                      setPlanSource('placeholders');
                      setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                    }}
                    style={{ marginTop: 8, paddingVertical: 8, alignItems: 'center' }}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={{ fontSize: 14, color: ACCENT, textDecorationLine: 'underline' }}>
                      Skip to just build a cadence
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          ) : planStep === 'unit_structure' && !PLAN_MY_YEAR_LOGISTICS_FIRST ? (
            renderPlanYearUnitStructureScroll()
          ) : (
            <>
          <ScrollView ref={scrollRef} style={styles.content} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>
            {loadError && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{loadError}</Text>
              </View>
            )}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
            {PLAN_MY_YEAR_LOGISTICS_FIRST && (
              <View style={styles.planYearGlanceHeaderWrap}>
                <Text style={styles.planYearGlanceTitle}>{t('planMyYear.modal.structuredClassPlansTitle')}</Text>
                <Text style={styles.planYearGlanceHelp}>{t('planMyYear.modal.structuredClassPlansHelp')}</Text>
              </View>
            )}
            {PLAN_MY_YEAR_LOGISTICS_FIRST && unitHeaderSubtitle ? (
              <Text style={[styles.modalHeaderMeta, { marginBottom: 12 }]} numberOfLines={2}>
                {unitHeaderSubtitle}
              </Text>
            ) : null}

            {/* Logistics step: always show form (no full-page blocking; plan summary shows loading inside card) */}
            {!isHomeschool ? (
              // Fast Path: Non-Homeschool
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Here's your year</Text>
                <Text style={styles.description}>
                  We've set up a default academic year (August 15 - June 15) with typical holidays.
                </Text>

                <TouchableOpacity style={styles.editButton}>
                  <Text style={styles.editButtonText}>Edit dates</Text>
                </TouchableOpacity>

                <View style={styles.settingRowInline}>
                    <Text style={styles.settingText}>Follow public holidays</Text>
                  <TouchableOpacity
                    style={[styles.customToggleTrack, followGlobalHolidays && styles.customToggleTrackOn]}
                    onPress={() => setFollowGlobalHolidays(!followGlobalHolidays)}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={[styles.customToggleThumb, followGlobalHolidays && styles.customToggleThumbOn]} />
                  </TouchableOpacity>
                </View>

              </View>
            ) : (
              // Homeschool Constraint Solver
              <View>
                {PLAN_MY_YEAR_LOGISTICS_FIRST && editingFromSummary && (
                  <TouchableOpacity
                    onPress={() => {
                      setPlanSummaryYearId(academicYearId);
                      setPlanSummaryData(planSummaryCacheRef.current.get(academicYearId) || null);
                      setShowPlanManagerView(true);
                      setEditingFromSummary(false);
                    }}
                    style={{ alignSelf: 'flex-start', marginBottom: 12 }}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={{ fontSize: 14, color: ACCENT, fontWeight: '600' }}>← Back to plan list</Text>
                  </TouchableOpacity>
                )}
                <View style={{ marginBottom: 10 }}>
                <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                  <Text style={[styles.logisticsLabel]}>Subjects <Text style={{ color: ERROR }}>*</Text></Text>
                  {subjectsForCurrentSelection?.length === 0 && (
                    <Text style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>No subjects yet — add subjects in your family settings.</Text>
                  )}
                  {subjectsForCurrentSelection?.length > 0 && (
                      <View style={[styles.childChips, styles.subjectsChipsRow, { marginTop: 8 }]}>
                        {subjectsForCurrentSelection.map((s) => {
                          const isSelected = selectedSubjectIds.includes(s.id);
                          return (
                            <TouchableOpacity
                              key={s.id}
                              style={[styles.childChip, isSelected && styles.childChipActive]}
                              onPress={() => {
                                if (isSelected) {
                                  setSelectedSubjectIds(selectedSubjectIds.filter((id) => id !== s.id));
                                } else {
                                  setSelectedSubjectIds([...selectedSubjectIds, s.id]);
                                }
                              }}
                            >
                              <Text style={[styles.childChipText, isSelected && styles.childChipTextActive]}>
                                {s.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                  )}
                </View>
                </View>

                <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                  <Text style={[styles.logisticsLabel]}>Date range <Text style={{ color: ERROR }}>*</Text></Text>
                  <View style={styles.dateRangeCard} onLayout={(e) => { datesSectionYRef.current = e.nativeEvent.layout.y; }}>
                  <View style={styles.dateRangeRow}>
                    <View style={styles.dateRangeSide}>
                      <TouchableOpacity onPress={() => { if (!startDate) return; const d = new Date(startDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setStartDate(toLocalYYYYMMDD(d)); }} style={styles.dateRangeArrow} disabled={!startDate} {...(Platform.OS === 'web' && { cursor: startDate ? 'pointer' : 'default' })}>
                        <ChevronLeft size={20} color={startDate ? FG : MUTED} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.dateRangeDateWrap} onPress={() => { setStartDateCalendarMonth(startDate ? dateStringToDate(startDate) : new Date()); setShowStartDatePicker(true); }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <Text style={styles.dateRangeDate}>{startDate ? formatDateDisplay(startDate) : 'Select date'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { if (!startDate) return; const d = new Date(startDate + 'T12:00:00'); d.setDate(d.getDate() + 1); setStartDate(toLocalYYYYMMDD(d)); }} style={styles.dateRangeArrow} disabled={!startDate} {...(Platform.OS === 'web' && { cursor: startDate ? 'pointer' : 'default' })}>
                        <ChevronRight size={20} color={startDate ? FG : MUTED} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.dateRangeArrowLabel}>→</Text>
                    {mode === 'FIXED_END' ? (
                      <View style={styles.dateRangeSide}>
                        <TouchableOpacity onPress={() => { if (!endDate) return; const d = new Date(endDate + 'T12:00:00'); d.setDate(d.getDate() - 1); setEndDate(toLocalYYYYMMDD(d)); }} style={styles.dateRangeArrow} disabled={!endDate} {...(Platform.OS === 'web' && { cursor: endDate ? 'pointer' : 'default' })}>
                          <ChevronLeft size={20} color={endDate ? FG : MUTED} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.dateRangeDateWrap} onPress={() => { setEndDateCalendarMonth(endDate ? dateStringToDate(endDate) : new Date()); setShowEndDatePicker(true); }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                          <Text style={styles.dateRangeDate}>{endDate ? formatDateDisplay(endDate) : 'Select date'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { if (!endDate) return; const d = new Date(endDate + 'T12:00:00'); d.setDate(d.getDate() + 1); setEndDate(toLocalYYYYMMDD(d)); }} style={styles.dateRangeArrow} disabled={!endDate} {...(Platform.OS === 'web' && { cursor: endDate ? 'pointer' : 'default' })}>
                          <ChevronRight size={20} color={endDate ? FG : MUTED} />
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                  </View>
                </View>

                {/* Target Days (TARGET_DAYS mode) */}
                {mode === 'TARGET_DAYS' && (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.logisticsLabel]}>Target Instructional Days</Text>
                    <TextInput
                      style={[styles.input, focusedInput === 'targetDays' && styles.inputFocused]}
                      value={targetDays}
                      onChangeText={setTargetDays}
                      placeholder="180"
                      keyboardType="numeric"
                      placeholderTextColor={MUTED}
                      onFocus={() => setFocusedInput('targetDays')}
                      onBlur={() => setFocusedInput(null)}
                    />
                  </View>
                )}

                {/* Target Hours (TARGET_HOURS mode) */}
                {mode === 'TARGET_HOURS' && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={[styles.logisticsLabel]}>Target Instructional Hours</Text>
                      <TextInput
                        style={[styles.input, focusedInput === 'targetHours' && styles.inputFocused]}
                        value={targetHours}
                        onChangeText={setTargetHours}
                        placeholder="1080"
                        keyboardType="numeric"
                        placeholderTextColor={MUTED}
                        onFocus={() => setFocusedInput('targetHours')}
                        onBlur={() => setFocusedInput(null)}
                      />
                    </View>
                    <View style={styles.inputGroup}>
                      <Text style={[styles.logisticsLabel]}>Hours per Instructional Day</Text>
                      <TextInput
                        style={[styles.input, focusedInput === 'hoursPerDay' && styles.inputFocused]}
                        value={hoursPerDay}
                        onChangeText={setHoursPerDay}
                        placeholder="6.0"
                        keyboardType="decimal-pad"
                        placeholderTextColor={MUTED}
                        onFocus={() => setFocusedInput('hoursPerDay')}
                        onBlur={() => setFocusedInput(null)}
                      />
                    </View>
                  </>
                )}

                {/* Card 3: Holidays & breaks — summary-first, From Planning Preferences vs Added for this plan */}
                <View style={[styles.fieldSection, { marginTop: 16, marginBottom: 0 }]}>
                  <TouchableOpacity
                    style={styles.collapsibleSectionHeader}
                    onPress={() => setHolidaysCollapsed(!holidaysCollapsed)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={[styles.fieldSectionLabel, { marginBottom: 0, fontSize: 12 }]}>Holidays & breaks</Text>
                    {holidaysCollapsed ? <ChevronDown size={20} color={MUTED} /> : <ChevronUp size={20} color={MUTED} />}
                  </TouchableOpacity>
                  {!holidaysCollapsed && (
                  <>
                  <View style={[styles.settingRowInline, { flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: 10, flexWrap: 'wrap', gap: 10 }]}>
                    <TouchableOpacity
                      style={[styles.customToggleTrack, followGlobalHolidays && styles.customToggleTrackOn]}
                      onPress={() => setFollowGlobalHolidays(!followGlobalHolidays)}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <View style={[styles.customToggleThumb, followGlobalHolidays && styles.customToggleThumbOn]} />
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Text style={[styles.logisticsLabel, { marginBottom: 0, marginRight: 4, fontSize: 12 }]}>Follow </Text>
                      <TouchableOpacity
                        onPress={() => {
                          if (followGlobalHolidays) {
                            setShowPublicHolidaysPicker(true);
                            const start = startDate || new Date().toISOString().slice(0, 10);
                            let end = endDate;
                            if (!end) {
                              const e = new Date(start);
                              e.setFullYear(e.getFullYear() + 1);
                              end = e.toISOString().slice(0, 10);
                            }
                            setPublicHolidaysLoading(true);
                            getPublicHolidaysForRange(countryCode || 'US', start, end).then(({ data: res }) => {
                              setPublicHolidaysList(res?.holidays || []);
                              setPublicHolidaysLoading(false);
                            });
                          }
                        }}
                        activeOpacity={0.7}
                        style={{ flexDirection: 'row', alignItems: 'center' }}
                        {...(Platform.OS === 'web' && { cursor: followGlobalHolidays ? 'pointer' : 'default' })}
                      >
                        <Text style={[styles.logisticsLabel, { marginBottom: 0, fontSize: 12, color: followGlobalHolidays ? ACCENT : SUB, textDecorationLine: followGlobalHolidays ? 'underline' : 'none' }]}>U.S. public holidays</Text>
                      </TouchableOpacity>
                      <Text style={[styles.logisticsLabel, { marginBottom: 0, marginLeft: 4, fontSize: 12 }]}>?</Text>
                    </View>
                  </View>
                  {(exclusionsFromSettings.holidays.length + exclusionsFromSettings.breaks.length) > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.logisticsLabel, { fontSize: 12, color: MUTED, marginBottom: 6 }]}>From Planning Preferences</Text>
                      {exclusionsFromSettings.holidays.map((h, i) => (
                        <View key={`s-h-${i}`} style={[styles.holidayItem, { backgroundColor: 'transparent' }]}>
                          <Text style={[styles.holidayDate, { fontSize: 12 }]}>{h.date}</Text>
                          <Text style={[styles.holidayName, { fontSize: 12 }]}>{h.name || 'Holiday'}</Text>
                        </View>
                      ))}
                      {exclusionsFromSettings.breaks.map((b, i) => (
                        <View key={`s-b-${i}`} style={[styles.holidayItem, { backgroundColor: 'transparent' }]}>
                          <Text style={[styles.holidayDate, { fontSize: 12 }]}>{b.start} – {b.end}</Text>
                          <Text style={[styles.holidayName, { fontSize: 12 }]}>{b.name || 'Break'}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  {(planOnlyExclusions.holidays.length + planOnlyExclusions.breaks.length) > 0 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.logisticsLabel, { fontSize: 12, color: MUTED, marginBottom: 6 }]}>Added for this plan</Text>
                      {planOnlyExclusions.holidays.map((h, i) => {
                        const idx = customHolidays.findIndex((ch) => ch.date === (h.date || h.startDate) && (ch.name || '') === (h.name || ''));
                        return (
                          <View key={`p-h-${i}`} style={styles.holidayItem}>
                            <Text style={[styles.holidayDate, { fontSize: 12 }]}>{h.date}</Text>
                            <Text style={[styles.holidayName, { fontSize: 12 }]}>{h.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <TouchableOpacity onPress={async () => { try { await addExclusion({ family_id: familyId, scope_type: 'family_default', exclusion_type: 'holiday', start_date: h.date, end_date: h.date, label: h.name || '' }); const { settings, exclusions } = await getPlanDefaultsFromSettings(familyId); setPlanningDefaultsData({ settings, exclusions: exclusions || [] }); toast?.push?.('Saved to Planning Preferences', 'success'); } catch (e) { toast?.push?.(e?.message || 'Failed to save', 'error'); } }} style={{ padding: 4 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                                <Text style={{ fontSize: 12, color: ACCENT }}>Save to settings</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => idx >= 0 && removeCustomHoliday(idx)} style={styles.deleteButton}>
                                <Trash2 size={16} color={ERROR} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                      {planOnlyExclusions.breaks.map((b, i) => {
                        const idx = customBreaks.findIndex((cb) => (cb.start || cb.startDate) === b.start && (cb.end || cb.endDate) === b.end && (cb.name || '') === (b.name || ''));
                        return (
                          <View key={`p-b-${i}`} style={styles.holidayItem}>
                            <Text style={[styles.holidayDate, { fontSize: 12 }]}>{b.start} – {b.end}</Text>
                            <Text style={[styles.holidayName, { fontSize: 12 }]}>{b.name}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <TouchableOpacity onPress={async () => { try { await addExclusion({ family_id: familyId, scope_type: 'family_default', exclusion_type: 'break', start_date: b.start, end_date: b.end, label: b.name || '' }); const { settings, exclusions } = await getPlanDefaultsFromSettings(familyId); setPlanningDefaultsData({ settings, exclusions: exclusions || [] }); toast?.push?.('Saved to Planning Preferences', 'success'); } catch (e) { toast?.push?.(e?.message || 'Failed to save', 'error'); } }} style={{ padding: 4 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                                <Text style={{ fontSize: 12, color: ACCENT }}>Save to settings</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => idx >= 0 && removeCustomBreak(idx)} style={styles.deleteButton}>
                                <Trash2 size={16} color={ERROR} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  <TouchableOpacity onPress={() => setShowAddExclusionForm(!showAddExclusionForm)} style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, marginBottom: showAddExclusionForm ? 8 : 0, gap: 6 }} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                    <Text style={[styles.logisticsLabel, { marginBottom: 0, fontSize: 12 }]}>Add custom breaks</Text>
                    {showAddExclusionForm ? <ChevronUp size={18} color={MUTED} /> : <ChevronDown size={18} color={MUTED} />}
                  </TouchableOpacity>
                  {showAddExclusionForm && (
                    <View style={{ marginTop: 8 }}>
                      <View style={[styles.inputGroup, { marginBottom: 10 }]}>
                        <Text style={[styles.mutedText, { marginBottom: 6, fontSize: 12 }]}>Day</Text>
                        <View style={styles.holidayInputRow}>
                          <TouchableOpacity style={[styles.datePickerTrigger, { flex: 1, marginRight: 8 }]} onPress={() => { setNewHolidayDateCalendarMonth(newHolidayDate ? dateStringToDate(newHolidayDate) : new Date()); setShowNewHolidayDatePicker(true); }}>
                            <Text style={[styles.datePickerTriggerText, !newHolidayDate && styles.datePickerPlaceholder]}>{newHolidayDate ? formatDateDisplay(newHolidayDate) : 'Date'}</Text>
                            <ChevronDown size={18} color={SUB} />
                          </TouchableOpacity>
                          <TextInput style={[styles.input, { flex: 2, marginRight: 8 }, focusedInput === 'newHolidayName' && styles.inputFocused]} value={newHolidayName} onChangeText={setNewHolidayName} placeholder="Holiday name" placeholderTextColor={MUTED} onFocus={() => setFocusedInput('newHolidayName')} onBlur={() => setFocusedInput(null)} />
                          <TouchableOpacity style={styles.holidayAddButton} onPress={() => { if (newHolidayDate && newHolidayName) { addCustomHoliday(); setShowAddExclusionForm(false); } else { addCustomHoliday(); } }}>
                            <Plus size={18} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                        <Text style={[styles.mutedText, { marginBottom: 6, fontSize: 12 }]}>Range</Text>
                        <View style={styles.holidayInputRow}>
                          <TouchableOpacity style={[styles.datePickerTrigger, { flex: 1, marginRight: 6 }]} onPress={() => { setNewBreakStartCalendarMonth(newBreakStart ? dateStringToDate(newBreakStart) : new Date()); setShowNewBreakStartPicker(true); }}>
                            <Text style={[styles.datePickerTriggerText, !newBreakStart && styles.datePickerPlaceholder]}>{newBreakStart ? formatDateDisplay(newBreakStart) : 'Start'}</Text>
                            <ChevronDown size={18} color={SUB} />
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.datePickerTrigger, { flex: 1, marginRight: 6 }]} onPress={() => { setNewBreakEndCalendarMonth(newBreakEnd ? dateStringToDate(newBreakEnd) : new Date()); setShowNewBreakEndPicker(true); }}>
                            <Text style={[styles.datePickerTriggerText, !newBreakEnd && styles.datePickerPlaceholder]}>{newBreakEnd ? formatDateDisplay(newBreakEnd) : 'End'}</Text>
                            <ChevronDown size={18} color={SUB} />
                          </TouchableOpacity>
                          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }, focusedInput === 'newBreakName' && styles.inputFocused]} value={newBreakName} onChangeText={setNewBreakName} placeholder="Break name" placeholderTextColor={MUTED} onFocus={() => setFocusedInput('newBreakName')} onBlur={() => setFocusedInput(null)} />
                          <TouchableOpacity style={styles.holidayAddButton} onPress={() => { if (newBreakStart && newBreakEnd && newBreakName) { addCustomBreak(); setShowAddExclusionForm(false); } else { addCustomBreak(); } }}>
                            <Plus size={18} color="#ffffff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}
                  </>
                  )}
                </View>
                <View style={[styles.eligibilityCard, { marginTop: 16 }, blocks.length > 0 && schedulePotential && !computingPotential && !recalculating && styles.eligibilityCardTinted]}>
                    {blocks.length === 0 && (
                      <View style={styles.eligibilityCardEmpty}>
                        <View style={styles.eligibilityChipRow}>
                          <Info size={14} color={MUTED} />
                          <Text style={styles.eligibilityChipText}>Waiting for schedule</Text>
                        </View>
                        <Text style={styles.eligibilityCardTitle}>{STRINGS.planMyYear.sections.preview.title}</Text>
                        <Text style={styles.eligibilityCardMain}>
                          {isPlaceholderOnlyScope ? 'Add a learning block and set weekdays in Cadence below to see your balance.' : 'Add a subject and class days to calculate your balance.'}
                        </Text>
                        <Text style={styles.eligibilityCardSecondary}>Once schedule days are set, we'll show if you meet your target.</Text>
                      </View>
                    )}
                    {blocks.length > 0 && (!startDate || !endDate) && !schedulePotential && !computingPotential && !recalculating && (
                      <View style={styles.eligibilityCardEmpty}>
                        <View style={styles.eligibilityChipRow}>
                          <Info size={14} color={MUTED} />
                          <Text style={styles.eligibilityChipText}>Waiting for schedule</Text>
                        </View>
                        <Text style={styles.eligibilityCardTitle}>{STRINGS.planMyYear.sections.preview.title}</Text>
                        <Text style={styles.eligibilityCardMain}>Add a subject and class days to calculate your balance.</Text>
                        <Text style={styles.eligibilityCardSecondary}>Once schedule days are set, we'll show if you meet your target.</Text>
                      </View>
                    )}
                    {blocks.length > 0 && (computingPotential || recalculating || (startDate && endDate && !schedulePotential)) && (
                      <View style={[styles.eligibilityCardEmpty, { flexDirection: 'row', alignItems: 'center' }]}>
                        <ActivityIndicator size="small" color={ACCENT} />
                        <Text style={[styles.previewText, { marginLeft: 8 }]}>Calculating...</Text>
                      </View>
                    )}
                    {blocks.length > 0 && schedulePotential && !computingPotential && !recalculating && (
                      <View style={styles.eligibilityCardFilled}>
                        <View style={styles.eligibilitySummaryRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Check size={16} color={ACCENT} strokeWidth={2.5} />
                            <Text style={styles.eligibilitySummaryNumber}>{eligibleCount ?? schedulePotential.projected_days ?? 0} eligible instructional days</Text>
                          </View>
                          {(effectivePlanTarget.constraint_mode === 'days' && (schedulePotential.target_days ?? effectivePlanTarget.target_days) != null) && (
                            <Text style={styles.eligibilityTargetMuted}>Target: {schedulePotential.target_days ?? effectivePlanTarget.target_days} days</Text>
                          )}
                          {(effectivePlanTarget.constraint_mode === 'hours' && (schedulePotential.target_hours ?? effectivePlanTarget.target_hours) != null) && (
                            <Text style={styles.eligibilityTargetMuted}>Target: {schedulePotential.target_hours ?? effectivePlanTarget.target_hours} hours</Text>
                          )}
                        </View>
                        <Text style={[styles.eligibilityCardSecondary, { marginTop: 2, fontSize: 12 }]}>
                          Based on date range and holidays & breaks. Cadence changes don’t update this count.
                        </Text>
                        {/* Phase 4: Suggest best weekly cadence when target days set */}
                        {schedulePotential.cadence_suggestion?.message && effectivePlanTarget.constraint_mode === 'days' && (schedulePotential.target_days ?? effectivePlanTarget.target_days) != null && (
                          <Text style={[styles.eligibilityCardSecondary, { marginTop: 6, fontStyle: 'italic', color: SUB }]}>
                            {schedulePotential.cadence_suggestion.message}
                          </Text>
                        )}
                        {followGlobalHolidays && (schedulePotential.days_excluded_holidays ?? 0) > 0 && (
                          <Text style={[styles.eligibilityCardSecondary, { marginTop: 4 }]}>
                            {schedulePotential.days_excluded_holidays === 1
                              ? '1 day excluded due to holiday'
                              : `${schedulePotential.days_excluded_holidays} days excluded due to holidays`}
                          </Text>
                        )}
                        {/* No requirement: baseline / deleted lesson message — only when health is for this plan and there are still some placeholders (so "removed one" makes sense) */}
                        {planIdForHealth &&
                          existingPlaceholdersCount > 0 &&
                          planHealth?.academic_year_id === planIdForHealth &&
                          (!endDate || (planHealth?.end_date && planHealth.end_date.slice(0, 10) === endDate.slice(0, 10))) &&
                          effectivePlanTarget.constraint_mode === 'none' &&
                          planHealth?.baseline_scheduled_days != null &&
                          planHealth.current_scheduled_days < planHealth.baseline_scheduled_days &&
                          planHealth.deleted_dates?.length > 0 && (
                          <Text style={[styles.eligibilityCardSecondary, { color: ERROR, marginTop: 6 }]}>
                            You removed an instructional slot on {new Date(planHealth.deleted_dates[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Schedule one to achieve your original total school days.
                          </Text>
                        )}
                        {/* Row B — Status pill + supporting (days mode) */}
                        {effectivePlanTarget.constraint_mode === 'days' && schedulePotential.delta_days != null && (
                          <>
                            <View style={styles.eligibilityStatusRow}>
                              <View style={[
                                styles.eligibilityPill,
                                schedulePotential.delta_days > 0 && styles.eligibilityPillOver,
                                schedulePotential.delta_days < 0 && styles.eligibilityPillUnder,
                                schedulePotential.delta_days === 0 && styles.eligibilityPillOnTarget,
                              ]}>
                                <Text style={[
                                  styles.eligibilityPillText,
                                  schedulePotential.delta_days === 0 && { color: SUCCESS },
                                  schedulePotential.delta_days > 0 && { color: WARNING },
                                  schedulePotential.delta_days < 0 && { color: WARNING },
                                ]}>
                                  {schedulePotential.delta_days > 0
                                    ? `${schedulePotential.delta_days} days over target`
                                    : schedulePotential.delta_days < 0
                                    ? `${-schedulePotential.delta_days} days short`
                                    : 'On target'}
                                </Text>
                              </View>
                              {(schedulePotential.delta_days > 0 || schedulePotential.delta_days < 0) && (
                                <Text style={styles.eligibilityCardSecondary}>Add class days, or accept an extension.</Text>
                              )}
                            </View>
                            {/* Row C — Recommendation + Accept (secondary button) */}
                            {schedulePotential.delta_days !== 0 && startDate && endDate && (() => {
                              const isOver = schedulePotential.delta_days > 0;
                              const perChild = schedulePotential.per_child || {};
                              const projected = schedulePotential.projected_days ?? 0;
                              const start = new Date(startDate + 'T12:00:00');
                              const end = new Date(endDate + 'T12:00:00');
                              const weeksSoFar = Math.max(0.1, (end - start) / (7 * 24 * 60 * 60 * 1000));
                              const daysPerWeek = projected > 0 ? projected / weeksSoFar : 0;
                              let suggestedDate = schedulePotential.suggested_end_date || null;
                              if (!suggestedDate && isOver) {
                                if (Object.keys(perChild).length > 0) {
                                  const dates = Object.values(perChild)
                                    .map((c) => c?.suggested_end_date)
                                    .filter(Boolean)
                                    .filter((d) => d <= endDate);
                                  suggestedDate = dates.length > 0 ? dates.sort()[dates.length - 1] : null;
                                }
                                if (!suggestedDate && daysPerWeek > 0 && schedulePotential.delta_days > 0) {
                                  const excessWeeks = schedulePotential.delta_days / daysPerWeek;
                                  const suggested = new Date(end);
                                  suggested.setDate(suggested.getDate() - Math.ceil(excessWeeks * 7));
                                  suggestedDate = toLocalYYYYMMDD(suggested);
                                }
                              }
                              const acceptedIsShorten = acceptedExtendDate && endDate && acceptedExtendDate < endDate;
                              const showAcceptedState = extendSuggestionAccepted && acceptedExtendDate && (isOver ? acceptedIsShorten : !acceptedIsShorten);
                              const displayDate = showAcceptedState ? acceptedExtendDate : suggestedDate;
                              if (!displayDate && !showAcceptedState) return null;
                              const daysLabel = schedulePotential.delta_days != null && schedulePotential.delta_days !== 0
                                ? `Adds ${Math.abs(schedulePotential.delta_days)} eligible days`
                                : null;
                              return (
                                <View style={styles.eligibilityRecommendationRow}>
                                  {showAcceptedState ? (
                                    <View style={styles.eligibilityOptionRow}>
                                      <View>
                                        <Text style={styles.eligibilityOptionTitle}>
                                          {acceptedIsShorten ? 'Shorten' : 'Extend'} to {new Date(acceptedExtendDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </Text>
                                        <Text style={styles.eligibilityOptionSubtext}>Change made!</Text>
                                      </View>
                                      <View style={styles.suggestionAcceptButton}>
                                        <Check size={14} color={BG} />
                                        <Text style={styles.suggestionAcceptButtonText}>Change made!</Text>
                                      </View>
                                    </View>
                                  ) : (
                                    <View style={[styles.eligibilityOptionRow, Platform.OS === 'web' && styles.eligibilityOptionRowHover]}>
                                      <View style={{ flex: 1, minWidth: 0 }}>
                                        <Text style={styles.eligibilityOptionTitle}>
                                          Suggested extension: {new Date(suggestedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </Text>
                                        {daysLabel ? <Text style={styles.eligibilityOptionSubtext}>{daysLabel}</Text> : null}
                                      </View>
                                      <TouchableOpacity
                                        onPress={() => {
                                          setEndDate(suggestedDate);
                                          setEndDateCalendarMonth(suggestedDate ? new Date(suggestedDate + 'T12:00:00') : new Date());
                                          setAcceptedExtendDate(suggestedDate);
                                          setExtendSuggestionAccepted(true);
                                        }}
                                        style={styles.eligibilityAcceptButton}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <Text style={styles.eligibilityAcceptButtonText}>Accept</Text>
                                      </TouchableOpacity>
                                    </View>
                                  )}
                                </View>
                              );
                            })()}
                          </>
                        )}
                        {/* Phase 5: Flex Learning suggestion — add one block on least-loaded day when under target */}
                        {isUnderTarget && (computingFlexSuggestion || flexSuggestion) && (
                          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: ELIGIBILITY_CARD_BORDER }}>
                            {computingFlexSuggestion ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <ActivityIndicator size="small" color={ACCENT} />
                                <Text style={[styles.eligibilityCardSecondary, { marginBottom: 0 }]}>Suggesting Flex Learning block…</Text>
                              </View>
                            ) : flexSuggestion?.proposedBlock ? (
                              <View>
                                <Text style={[styles.eligibilityCardSecondary, { marginBottom: 6 }]}>
                                  Add Flex Learning ({flexSuggestion.weekdayLabel} 10–11) →{' '}
                                  {effectivePlanTarget.constraint_mode === 'days' && flexSuggestion.improvement_days > 0
                                    ? `+${flexSuggestion.improvement_days} days`
                                    : effectivePlanTarget.constraint_mode === 'hours' && flexSuggestion.improvement_hours > 0
                                    ? `+${flexSuggestion.improvement_hours.toFixed(0)} hours`
                                    : ''}
                                </Text>
                                <TouchableOpacity
                                  onPress={handleApplyFlexSuggestion}
                                  style={[styles.eligibilityAcceptButton, { alignSelf: 'flex-start' }]}
                                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                >
                                  <Text style={styles.eligibilityAcceptButtonText}>Apply suggestion</Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>
                        )}
                        {/* Hours mode: status pill + copy */}
                        {effectivePlanTarget.constraint_mode === 'hours' && schedulePotential.delta_hours != null && (
                          <View style={styles.eligibilityStatusRow}>
                            <View style={[
                              styles.eligibilityPill,
                              schedulePotential.delta_hours > 0 && styles.eligibilityPillOver,
                              schedulePotential.delta_hours < 0 && styles.eligibilityPillUnder,
                              schedulePotential.delta_hours === 0 && styles.eligibilityPillOnTarget,
                            ]}>
                              <Text style={[
                                styles.eligibilityPillText,
                                schedulePotential.delta_hours === 0 && { color: SUCCESS },
                                (schedulePotential.delta_hours > 0 || schedulePotential.delta_hours < 0) && { color: WARNING },
                              ]}>
                                {schedulePotential.delta_hours > 0
                                  ? `${schedulePotential.delta_hours.toFixed(0)} hours over target`
                                  : schedulePotential.delta_hours < 0
                                  ? `${(-schedulePotential.delta_hours).toFixed(0)} hours short`
                                  : 'On target'}
                              </Text>
                            </View>
                            {(schedulePotential.delta_hours > 0 || schedulePotential.delta_hours < 0) && (
                              <Text style={styles.eligibilityCardSecondary}>Add class days, or accept an extension.</Text>
                            )}
                          </View>
                        )}
                        {/* Manual instructional events counted — only when health is for this plan (id + date range match) */}
                        {planIdForHealth &&
                        planHealth?.academic_year_id === planIdForHealth &&
                        (!endDate || (planHealth?.end_date && planHealth.end_date.slice(0, 10) === endDate.slice(0, 10))) &&
                        ((planHealth?.manual_events_days != null && planHealth.manual_events_days > 0) ||
                         (planHealth?.manual_events_hours != null && planHealth.manual_events_hours > 0)) ? (
                          <View style={[styles.inputGroup, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: ELIGIBILITY_CARD_BORDER }]}>
                            <Text style={[styles.mutedText, { marginBottom: 6 }]}>
                              Manual instructional events counted this term: {planHealth.manual_events_days ?? 0} days
                              {(planHealth?.manual_events_hours != null && planHealth.manual_events_hours > 0)
                                ? `, ${Number(planHealth.manual_events_hours).toFixed(0)} hours`
                                : ''}
                            </Text>
                          </View>
                        ) : null}
                        {/* Apply block changes from: only when editing existing plan with blocks */}
                        {academicYearId && blocks.length > 0 && (
                          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: ELIGIBILITY_CARD_BORDER }}>
                            <Text style={[styles.eligibilityCardSecondary, { fontWeight: '600', marginBottom: 8 }]}>{STRINGS.planMyYear.applyFrom?.title ?? 'Apply block changes'}</Text>
                            <View style={styles.radioRow}>
                              <TouchableOpacity
                                onPress={() => setApplyFromMode('entire')}
                                style={[styles.radioOption, applyFromMode === 'entire' && styles.radioOptionActive]}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text style={[styles.radioLabel, applyFromMode === 'entire' && styles.radioLabelActive]}>{STRINGS.planMyYear.applyFrom?.entirePlan ?? 'Entire plan'}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => setApplyFromMode('today')}
                                style={[styles.radioOption, applyFromMode === 'today' && styles.radioOptionActive]}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text style={[styles.radioLabel, applyFromMode === 'today' && styles.radioLabelActive]}>{STRINGS.planMyYear.applyFrom?.fromToday ?? 'From today forward'}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => { setApplyFromMode('date'); if (!applyFromDate && startDate) setApplyFromDate(startDate); setApplyFromDateCalendarMonth((applyFromDate || startDate) ? new Date((applyFromDate || startDate) + 'T12:00:00') : new Date()); setShowApplyFromDatePicker(true); }}
                                style={[styles.radioOption, applyFromMode === 'date' && styles.radioOptionActive]}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text style={[styles.radioLabel, applyFromMode === 'date' && styles.radioLabelActive]} numberOfLines={1}>
                                  {STRINGS.planMyYear.applyFrom?.fromDate ?? 'From date'}: {applyFromDate ? new Date(applyFromDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : (STRINGS.planMyYear.applyFrom?.pickDate ?? 'Pick')}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </View>

                {/* Scheduled class days / cadence — show when subjects selected OR placeholder-only scope */}
                {(effectiveSubjectIds.length > 0 || isPlaceholderOnlyScope) && (
                  <View style={[styles.fieldSection, { marginTop: 16, marginBottom: 16 }]} onLayout={(e) => { scheduleSectionYRef.current = e.nativeEvent.layout.y; }}>
                      <View style={styles.scheduleBlocksInner}>
                      <Text style={[styles.logisticsLabel, { marginBottom: 8 }]}>Cadence <Text style={{ color: ERROR }}>*</Text></Text>
                      {PLAN_MY_YEAR_MULTI_SUBJECT_CADENCE &&
                        showMultiSubjectCadenceHint(PLAN_MY_YEAR_LOGISTICS_FIRST, effectiveSubjectIds.length) && (
                          <Text style={[styles.mutedText, { marginBottom: 10, fontSize: 12, lineHeight: 18 }]}>
                            {s('planMyYear.multiSubjectUnits.cadenceRowHint')}
                          </Text>
                        )}
                      {blocks.map((block, idx) => {
                      const subj = block.subject_id ? baseSubjectList.find((s) => s.id === block.subject_id) : null;
                      const blockSubjectLabel = subj?.name ?? (block.placeholder_label || (STRINGS.planMyYear?.sections?.blocks?.genericSlotLabel ?? 'Learning block'));
                      const weekdays = block.weekdays || [];
                      const isHighlighted = highlightBlockIndex === idx;
                      return (
                        <View
                          key={block.block_id}
                          style={[
                            styles.blockRow,
                            blocks.length === 1 && styles.blockRowNoDivider,
                            isHighlighted && { backgroundColor: 'rgba(66, 133, 244, 0.08)', borderRadius: 8, padding: 12, marginBottom: 12 },
                          ]}
                        >
                          <Text style={styles.blockRowSubject}>{blockSubjectLabel}</Text>
                          <View style={styles.blockRowLine}>
                            <View style={styles.weekdayChipsRow}>
                              {WEEKDAY_NUMBERS.map((dayNum, dayIdx) => {
                                const isActive = weekdays.includes(dayNum);
                                return (
                                  <TouchableOpacity
                                    key={dayNum}
                                    style={[styles.weekdayChipSmall, isActive && styles.weekdayChipSmallActive]}
                                    onPress={() => {
                                      const next = isActive ? weekdays.filter((w) => w !== dayNum) : [...weekdays, dayNum].sort((a, b) => a - b);
                                      updateBlock(idx, { weekdays: next });
                                    }}
                                  >
                                    <Text style={[styles.weekdayChipSmallText, isActive && styles.weekdayChipSmallTextActive]}>
                                      {WEEKDAY_LABELS[dayIdx]}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          {!block.all_day && (
                            <View style={styles.blockTimeInline}>
                              <View style={styles.blockTimeField}>
                                <Text style={styles.blockTimeLabel}>Start</Text>
                                <View style={styles.blockTimeInputWrap}>
                                  {Platform.OS === 'web' ? (
                                    <input
                                      type="time"
                                      value={block.start_time || '09:00'}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v) updateBlock(idx, { start_time: v });
                                      }}
                                      style={{
                                        backgroundColor: '#fff',
                                        border: `1px solid ${BORDER}`,
                                        borderRadius: 10,
                                        padding: '10px 12px',
                                        fontSize: 14,
                                        color: FG,
                                        width: '100%',
                                        maxWidth: 100,
                                        height: 44,
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                      }}
                                    />
                                  ) : (
                                    <TextInput
                                      placeholder="09:00"
                                      placeholderTextColor={MUTED}
                                      value={block.start_time || '09:00'}
                                      onChangeText={(text) => {
                                        const cleaned = text.replace(/[^0-9:]/g, '');
                                        const match = cleaned.match(/^(\d{0,2}):?(\d{0,2})/);
                                        if (!match) return;
                                        let h = match[1] ? parseInt(match[1], 10) : 0;
                                        let m = match[2] ? parseInt(match[2], 10) : 0;
                                        if (cleaned.length <= 2) {
                                          if (h > 23) h = 23;
                                          updateBlock(idx, { start_time: `${String(h).padStart(2, '0')}:00` });
                                          return;
                                        }
                                        if (h > 23) h = 23;
                                        if (m > 59) m = 59;
                                        updateBlock(idx, { start_time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
                                      }}
                                      style={[styles.input, { width: 90, height: 44 }]}
                                    />
                                  )}
                                </View>
                              </View>
                              <View style={styles.blockTimeField}>
                                <Text style={styles.blockTimeLabel}>End</Text>
                                <View style={styles.blockTimeInputWrap}>
                                  {Platform.OS === 'web' ? (
                                    <input
                                      type="time"
                                      value={block.end_time || '10:00'}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        if (v) updateBlock(idx, { end_time: v });
                                      }}
                                      style={{
                                        backgroundColor: '#fff',
                                        border: `1px solid ${BORDER}`,
                                        borderRadius: 10,
                                        padding: '10px 12px',
                                        fontSize: 14,
                                        color: FG,
                                        width: '100%',
                                        maxWidth: 100,
                                        height: 44,
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                      }}
                                    />
                                  ) : (
                                  <TextInput
                                    placeholder="10:00"
                                    placeholderTextColor={MUTED}
                                    value={block.end_time || '10:00'}
                                    onChangeText={(text) => {
                                      const cleaned = text.replace(/[^0-9:]/g, '');
                                      const match = cleaned.match(/^(\d{0,2}):?(\d{0,2})/);
                                      if (!match) return;
                                      let h = match[1] ? parseInt(match[1], 10) : 0;
                                      let m = match[2] ? parseInt(match[2], 10) : 0;
                                      if (cleaned.length <= 2) {
                                        if (h > 23) h = 23;
                                        updateBlock(idx, { end_time: `${String(h).padStart(2, '0')}:00` });
                                        return;
                                      }
                                      if (h > 23) h = 23;
                                      if (m > 59) m = 59;
                                      updateBlock(idx, { end_time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` });
                                    }}
                                    style={[styles.input, { width: 90, height: 44 }]}
                                  />
                                )}
                                </View>
                              </View>
                            </View>
                          )}
                          </View>
                          {PLAN_MY_YEAR_LOGISTICS_FIRST && block.subject_id && (
                            <View
                              style={{
                                marginTop: 10,
                                flexDirection: 'row',
                                flexWrap: 'wrap',
                                alignItems: 'center',
                                alignSelf: 'flex-start',
                                maxWidth: '100%',
                              }}
                            >
                              <Text style={{ fontSize: 12, color: MUTED, marginRight: 6, marginBottom: 4 }}>
                                {s('planMyYear.multiSubjectUnits.cadenceAddUnitsInlinePrompt')}
                              </Text>
                              {[
                                { method: 'paste', label: s('planMyYear.sections.useASource.options.paste.label') },
                                { method: 'paste_plain', label: s('planMyYear.sections.useASource.options.pastePlain.label') },
                                { method: 'upload', label: s('planMyYear.sections.useASource.options.upload.label') },
                                { method: 'generate', label: s('planMyYear.multiSubjectUnits.cadenceGenerateLabel') },
                              ].map((opt, optIdx) => (
                                <React.Fragment key={opt.method}>
                                  {optIdx > 0 ? (
                                    <Text style={{ fontSize: 12, color: MUTED, marginHorizontal: 6, marginBottom: 4 }}>
                                      ·
                                    </Text>
                                  ) : null}
                                  <TouchableOpacity
                                    onPress={() => openCadenceUnitMethod(block.subject_id, opt.method)}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel={t('planMyYear.multiSubjectUnits.a11yCadenceAddUnitsMethod', {
                                      methodLabel: opt.label,
                                      subjectName: blockSubjectLabel,
                                    })}
                                    style={{ marginBottom: 4, paddingVertical: 2 }}
                                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                  >
                                    <Text style={{ fontSize: 13, color: ACCENT, textDecorationLine: 'underline' }}>
                                      {opt.label}
                                    </Text>
                                  </TouchableOpacity>
                                </React.Fragment>
                              ))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                    </View>
                    {isPlaceholderOnlyScope && (
                      <TouchableOpacity
                        onPress={addBlock}
                        style={[styles.editButton, { marginTop: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center' }]}
                        activeOpacity={0.8}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Plus size={16} color={ACCENT} style={{ marginRight: 6 }} />
                        <Text style={styles.editButtonText}>Add learning block</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}


                {/* Phase 2: Lesson placement preview — map lessons to slots before commit */}
                {(planSource === 'link' || planSource === 'paste' || planSource === 'upload') && parsedContent?.lessons?.length > 0 && startDate && endDate && (
                  <View style={[styles.eligibilityCard, { marginTop: 12 }]}>
                    <View style={styles.eligibilityCardFilled}>
                      <Text style={[styles.eligibilityCardTitle, { marginBottom: 4 }]}>Lesson placement preview</Text>
                      <Text style={[styles.eligibilityCardSecondary, { marginBottom: 8 }]}>
                        How your parsed lessons will map onto your plan slots when you click "Create unit & schedule".
                      </Text>
                      {pacingPreviewLoading ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                          <ActivityIndicator size="small" color={ACCENT} />
                          <Text style={[styles.mutedText, { marginLeft: 8 }]}>Loading placement…</Text>
                        </View>
                      ) : pacingPreviewError ? (
                        <Text style={[styles.mutedText, { color: ERROR }]}>{pacingPreviewError}</Text>
                      ) : pacingPreview ? (
                        <>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <Check size={16} color={ACCENT} strokeWidth={2.5} />
                            <Text style={[styles.eligibilityCardSecondary, { marginLeft: 6 }]}>
                              {pacingPreview.slots_used} of {pacingPreview.total_lessons} lessons will fill plan slots
                              {pacingPreview.total_slots_available > 0 ? ` (${pacingPreview.total_slots_available} empty slots in range)` : ''}.
                              {pacingPreview.unmapped_lesson_count > 0
                                ? ` ${pacingPreview.unmapped_lesson_count} will get new events.`
                                : ''}
                            </Text>
                          </View>
                          {pacingPreview.mapping?.length > 0 && (
                            <View style={{ maxHeight: 200 }}>
                              <ScrollView showsVerticalScrollIndicator={true} nestedScrollEnabled>
                                {pacingPreview.mapping.slice(0, 15).map((row) => {
                                  const dateLabel = row.date_ymd ? formatDateDisplay(row.date_ymd) : '';
                                  const timeStr = row.start_ts
                                    ? new Date(row.start_ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                    : '';
                                  return (
                                    <Text key={row.lesson_index} style={[styles.eligibilityCardSecondary, { marginBottom: 4 }]}>
                                      {row.lesson_index + 1}. {row.lesson_title || 'Lesson'} → {dateLabel}{timeStr ? ` ${timeStr}` : ''}
                                    </Text>
                                  );
                                })}
                                {(pacingPreview.mapping?.length ?? 0) > 15 && (
                                  <Text style={[styles.eligibilityCardSecondary, { marginTop: 4 }]}>
                                    … and {(pacingPreview.mapping?.length ?? 0) - 15} more
                                  </Text>
                                )}
                              </ScrollView>
                            </View>
                          )}
                        </>
                      ) : null}
                    </View>
                  </View>
                )}

                {PLAN_MY_YEAR_LOGISTICS_FIRST && (
                  <View style={{ marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: BORDER_SUBTLE }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Preview instructional slots</Text>
                    <Text style={[styles.mutedText, { marginBottom: 16 }]}>
                      {previewSlotLines.length} slot{previewSlotLines.length !== 1 ? 's' : ''} based on your date range and holidays & breaks.
                    </Text>
                    {effectiveSubjectIds.length > 1 && (
                      <View
                        style={{
                          marginBottom: 16,
                          padding: 12,
                          backgroundColor: '#f8fafc',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: BORDER,
                        }}
                      >
                        <Text style={{ fontSize: 13, color: FG, lineHeight: 19 }}>
                          <Text style={{ fontWeight: '600' }}>{s('planMyYear.multiSubjectUnits.previewMultiSubjectLead')} </Text>
                          {s('planMyYear.multiSubjectUnits.previewMultiSubjectHint')}
                        </Text>
                      </View>
                    )}
                    {previewSlotLines.map((line, idx) => (
                      <View key={`inline-${line.date}-${line.subjectName}-${idx}`} style={{ paddingVertical: 12, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                        <Text style={[styles.label, { marginBottom: 2 }]}>{line.dateLabel} · {line.timeLabel}</Text>
                        <Text style={[styles.mutedText, { fontSize: 14 }]}>{line.subjectName}{line.childNames ? ` · ${line.childNames}` : ''}</Text>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        styles.planYearGenerateCta,
                        (saving || loading || !preconditionsMet || !feasible) && styles.buttonDisabled,
                      ]}
                      onPress={handleApplyToCalendar}
                      disabled={saving || loading || !preconditionsMet || !feasible}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      {saving ? (
                        <ActivityIndicator size="small" color={BG} />
                      ) : (
                        <Text style={[styles.primaryButtonText, styles.primaryButtonTextAllCaps]}>
                          {academicYearId ? STRINGS.planMyYear.primaryActions.updateSlots : STRINGS.planMyYear.primaryActions.generateSlots}
                        </Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </ScrollView>
          {PLAN_MY_YEAR_LOGISTICS_FIRST && planStep === 'unit_structure' && (
            <Modal
              animationType="fade"
              transparent
              visible
              onRequestClose={() => {
                setUnitFocusSubjectId(null);
                setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(15,23,42,0.5)',
                  justifyContent: 'center',
                  padding: Platform.OS === 'web' ? 24 : 12,
                }}
              >
                <View
                  style={{
                    maxHeight: Platform.OS === 'web' ? '92%' : '100%',
                    width: '100%',
                    maxWidth: 760,
                    alignSelf: 'center',
                    backgroundColor: BG,
                    borderRadius: 12,
                    overflow: 'hidden',
                    flex: Platform.OS === 'web' ? undefined : 1,
                    ...(Platform.OS === 'web' ? { boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' } : {}),
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: BORDER,
                      backgroundColor: SURFACE_ELEVATED,
                    }}
                  >
                    <Text style={[styles.sectionTitle, { marginBottom: 0, fontSize: 17 }]}>
                      {s('planMyYear.multiSubjectUnits.unitInputModalTitle')}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setUnitFocusSubjectId(null);
                        setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                      }}
                      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <X size={22} color={FG} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1, minHeight: 0 }}>
                    {renderPlanYearUnitStructureScroll()}
                  </View>
                  <View style={[styles.footer, { borderTopWidth: 1, borderTopColor: BORDER_SUBTLE, marginTop: 0 }]}>
                    <TouchableOpacity
                      onPress={() => {
                        if (planSource === 'paste' && (draftData || manualDraft)) {
                          setDraftData(null);
                          setManualDraft(null);
                          setUnitStructureStep('input');
                          setRawText('');
                          setExpandedUnits(new Set());
                          setExpandedUnitIndexManual(0);
                          setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                          setUnitFocusSubjectId(null);
                          return;
                        }
                        if (draftData || manualDraft) {
                          setDraftData(null);
                          setManualDraft(null);
                          setUnitStructureStep('input');
                          setRawText('');
                          setExpandedUnits(new Set());
                          setExpandedUnitIndexManual(0);
                        } else {
                          setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                          setUnitFocusSubjectId(null);
                        }
                      }}
                      style={styles.cancelButton}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={styles.cancelText}>Back</Text>
                    </TouchableOpacity>
                    {(draftData || manualDraft) ? (
                      <TouchableOpacity
                        onPress={async () => {
                          const availableSubjectId = unitPipelineSubjectId;
                          const availableSubject = availableSubjectId ? baseSubjectList.find((s) => String(s.id) === String(availableSubjectId)) : null;
                          if (!availableSubject || !familyId) {
                            setUnitStructureError('Subject not found.');
                            return;
                          }
                          setUnitStructureStep('saving');
                          setUnitStructureError(null);
                          try {
                            if (planSource === 'paste' && manualDraft) {
                              const { data, error: err } = await commitManualDraft({
                                subject_id: availableSubject?.id,
                                family_id: familyId,
                                subject_name: availableSubject?.name || '',
                                draft: manualDraft,
                                builder_mode: 'rich_units',
                              });
                              if (err || !data) {
                                setUnitStructureError(err?.message || 'Failed to save curriculum');
                                setUnitStructureStep('draft');
                                return;
                              }
                            } else if ((planSource === 'upload' || planSource === 'paste_plain') && draftData) {
                              const { data, error: err } = await commitParsedDraft({
                                subject_id: availableSubject?.id,
                                family_id: familyId,
                                subject_name: availableSubject?.name || '',
                                draft: draftData,
                              });
                              if (err || !data) {
                                setUnitStructureError(err?.message || 'Failed to save curriculum');
                                setUnitStructureStep('draft');
                                return;
                              }
                            } else if (planSource === 'generate') {
                              const { data, error: err } = await commitGeneratedDraft({
                                subject_id: availableSubject?.id,
                                family_id: familyId,
                                subject_name: availableSubject?.name || '',
                                draft: draftData,
                              });
                              if (err || !data) {
                                setUnitStructureError(err?.message || 'Failed to save curriculum');
                                setUnitStructureStep('draft');
                                return;
                              }
                            }
                            if (unitPipelineSubjectId) {
                              setLastSavedUnitSubjectId(unitPipelineSubjectId);
                            }
                            setDraftData(null);
                            setManualDraft(null);
                            setUnitStructureStep('input');
                            setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST));
                            setUnitFocusSubjectId(null);
                            if (unitPipelineSubjectId) {
                              setLoadingUnitStructure(true);
                              const subjectId = unitPipelineSubjectId;
                              const { data: eventsData, error: eventsErr } = await supabase
                                .from('events')
                                .select('id, title, curriculum_unit_title, curriculum_lesson_sequence, curriculum_metadata, start_ts, is_reference_date')
                                .eq('family_id', familyId)
                                .eq('subject_id', subjectId)
                                .eq('is_curriculum_related', true)
                                .order('curriculum_unit_title', { ascending: true })
                                .order('curriculum_lesson_sequence', { ascending: true });
                              if (!eventsErr && eventsData) {
                                const grouped = {};
                                eventsData.forEach((evt) => {
                                  const unitTitle = evt.curriculum_unit_title || 'Unnamed Unit';
                                  if (!grouped[unitTitle]) {
                                    grouped[unitTitle] = { title: unitTitle, lessons: [] };
                                  }
                                  const meta = evt.curriculum_metadata || {};
                                  grouped[unitTitle].lessons.push({
                                    id: evt.id,
                                    title: evt.title,
                                    type: meta.lesson_type || 'lesson',
                                    date: evt.start_ts ? evt.start_ts.slice(0, 10) : null,
                                    sequence: evt.curriculum_lesson_sequence || 0,
                                  });
                                });
                                setUnitStructureData({ units: Object.values(grouped) });
                              }
                              setLoadingUnitStructure(false);
                            }
                          } catch (err) {
                            setUnitStructureError(err.message || 'Failed to save curriculum');
                            setUnitStructureStep('draft');
                          }
                        }}
                        style={[styles.primaryButton, unitStructureStep === 'saving' && styles.primaryButtonDisabled]}
                        disabled={unitStructureStep === 'saving'}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        {unitStructureStep === 'saving' ? (
                          <>
                            <ActivityIndicator size="small" color={BG} style={{ marginRight: 8 }} />
                            <Text style={styles.primaryButtonText}>{s('global.status.saving')}</Text>
                          </>
                        ) : (
                          <Text style={styles.primaryButtonText}>{unitStructureSaveDraftLabel}</Text>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST));
                          setUnitFocusSubjectId(null);
                        }}
                        style={styles.primaryButton}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.primaryButtonText}>{unitStructureSkipDraftLabel}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              </View>
            </Modal>
          )}
            </>
          )}

          {/* Start Date Calendar Picker (same as Add Event modal) */}
          {showStartDatePicker && (
            <Modal
              animationType="fade"
              transparent
              visible={showStartDatePicker}
              onRequestClose={() => setShowStartDatePicker(false)}
            >
              <TouchableOpacity
                style={styles.calendarOverlay}
                activeOpacity={1}
                onPress={() => setShowStartDatePicker(false)}
              >
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(startDateCalendarMonth);
                        d.setMonth(d.getMonth() - 1);
                        setStartDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <ChevronLeft size={20} color={FG} />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>
                      {startDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(startDateCalendarMonth);
                        d.setMonth(d.getMonth() + 1);
                        setStartDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <ChevronRight size={20} color={FG} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(startDateCalendarMonth);
                        d.setFullYear(d.getFullYear() - 1);
                        setStartDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={styles.calendarYearLink}>← Year</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const today = new Date();
                        setStartDateCalendarMonth(today);
                        setStartDate(toLocalYYYYMMDD(today));
                        setShowStartDatePicker(false);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(startDateCalendarMonth);
                        d.setFullYear(d.getFullYear() + 1);
                        setStartDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={styles.calendarYearLink}>Year →</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>
                    {WEEKDAY_LABELS.map((day) => (
                      <View key={day} style={styles.calendarDayHeader}>
                        <Text style={styles.calendarDayHeaderText}>{day}</Text>
                      </View>
                    ))}
                  </View>
                  {(() => {
                    const year = startDateCalendarMonth.getFullYear();
                    const month = startDateCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1);
                    const startDateGrid = new Date(firstDay);
                    startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = [];
                    const current = new Date(startDateGrid);
                    for (let i = 0; i < 42; i++) {
                      days.push(new Date(current));
                      current.setDate(current.getDate() + 1);
                    }
                    return (
                      <View>
                        {[0, 1, 2, 3, 4, 5].map((week) => (
                          <View key={week} style={styles.calendarWeekRow}>
                            {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                              const isCurrentMonth = day.getMonth() === month;
                              const ymd = toLocalYYYYMMDD(day);
                              const isSelected = startDate === ymd;
                              const isToday = ymd === toLocalYYYYMMDD(new Date());
                              return (
                                <TouchableOpacity
                                  key={idx}
                                  onPress={() => {
                                    setStartDate(ymd);
                                    setShowStartDatePicker(false);
                                  }}
                                  style={[
                                    styles.calendarDayCell,
                                    isSelected && styles.calendarDayCellSelected,
                                    isToday && !isSelected && styles.calendarDayCellToday,
                                  ]}
                                >
                                  <Text style={[
                                    styles.calendarDayText,
                                    isSelected && styles.calendarDayTextSelected,
                                    !isCurrentMonth && styles.calendarDayTextMuted,
                                  ]}>
                                    {day.getDate()}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* End Date Calendar Picker (same as Add Event modal) */}
          {showEndDatePicker && (
            <Modal
              animationType="fade"
              transparent
              visible={showEndDatePicker}
              onRequestClose={() => setShowEndDatePicker(false)}
            >
              <TouchableOpacity
                style={styles.calendarOverlay}
                activeOpacity={1}
                onPress={() => setShowEndDatePicker(false)}
              >
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(endDateCalendarMonth);
                        d.setMonth(d.getMonth() - 1);
                        setEndDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <ChevronLeft size={20} color={FG} />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>
                      {endDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(endDateCalendarMonth);
                        d.setMonth(d.getMonth() + 1);
                        setEndDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <ChevronRight size={20} color={FG} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(endDateCalendarMonth);
                        d.setFullYear(d.getFullYear() - 1);
                        setEndDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={styles.calendarYearLink}>← Year</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const today = new Date();
                        setEndDateCalendarMonth(today);
                        setEndDate(toLocalYYYYMMDD(today));
                        setShowEndDatePicker(false);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const d = new Date(endDateCalendarMonth);
                        d.setFullYear(d.getFullYear() + 1);
                        setEndDateCalendarMonth(d);
                      }}
                      style={styles.calendarNavButton}
                    >
                      <Text style={styles.calendarYearLink}>Year →</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>
                    {WEEKDAY_LABELS.map((day) => (
                      <View key={day} style={styles.calendarDayHeader}>
                        <Text style={styles.calendarDayHeaderText}>{day}</Text>
                      </View>
                    ))}
                  </View>
                  {(() => {
                    const year = endDateCalendarMonth.getFullYear();
                    const month = endDateCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1);
                    const startDateGrid = new Date(firstDay);
                    startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = [];
                    const current = new Date(startDateGrid);
                    for (let i = 0; i < 42; i++) {
                      days.push(new Date(current));
                      current.setDate(current.getDate() + 1);
                    }
                    return (
                      <View>
                        {[0, 1, 2, 3, 4, 5].map((week) => (
                          <View key={week} style={styles.calendarWeekRow}>
                            {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                              const isCurrentMonth = day.getMonth() === month;
                              const ymd = toLocalYYYYMMDD(day);
                              const isSelected = endDate === ymd;
                              const isToday = ymd === toLocalYYYYMMDD(new Date());
                              return (
                                <TouchableOpacity
                                  key={idx}
                                  onPress={() => {
                                    setEndDate(ymd);
                                    setShowEndDatePicker(false);
                                  }}
                                  style={[
                                    styles.calendarDayCell,
                                    isSelected && styles.calendarDayCellSelected,
                                    isToday && !isSelected && styles.calendarDayCellToday,
                                  ]}
                                >
                                  <Text style={[
                                    styles.calendarDayText,
                                    isSelected && styles.calendarDayTextSelected,
                                    !isCurrentMonth && styles.calendarDayTextMuted,
                                  ]}>
                                    {day.getDate()}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Custom Holiday Date Calendar Picker */}
          {showNewHolidayDatePicker && (
            <Modal animationType="fade" transparent visible={showNewHolidayDatePicker} onRequestClose={() => setShowNewHolidayDatePicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowNewHolidayDatePicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newHolidayDateCalendarMonth); d.setMonth(d.getMonth() - 1); setNewHolidayDateCalendarMonth(d); }} style={styles.calendarNavButton}>
                      <ChevronLeft size={20} color={FG} />
                    </TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>{newHolidayDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => { const d = new Date(newHolidayDateCalendarMonth); d.setMonth(d.getMonth() + 1); setNewHolidayDateCalendarMonth(d); }} style={styles.calendarNavButton}>
                      <ChevronRight size={20} color={FG} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newHolidayDateCalendarMonth); d.setFullYear(d.getFullYear() - 1); setNewHolidayDateCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>← Year</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const today = new Date(); setNewHolidayDateCalendarMonth(today); setNewHolidayDate(toLocalYYYYMMDD(today)); setShowNewHolidayDatePicker(false); }} style={styles.calendarNavButton}><Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const d = new Date(newHolidayDateCalendarMonth); d.setFullYear(d.getFullYear() + 1); setNewHolidayDateCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>Year →</Text></TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>{WEEKDAY_LABELS.map((day) => (<View key={day} style={styles.calendarDayHeader}><Text style={styles.calendarDayHeaderText}>{day}</Text></View>))}</View>
                  {(() => {
                    const year = newHolidayDateCalendarMonth.getFullYear(); const month = newHolidayDateCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1); const startDateGrid = new Date(firstDay); startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = []; const current = new Date(startDateGrid); for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                    return (<View>{[0, 1, 2, 3, 4, 5].map((week) => (<View key={week} style={styles.calendarWeekRow}>{days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                      const isCurrentMonth = day.getMonth() === month; const ymd = toLocalYYYYMMDD(day); const isSelected = newHolidayDate === ymd; const isToday = ymd === toLocalYYYYMMDD(new Date());
                      return (<TouchableOpacity key={idx} onPress={() => { setNewHolidayDate(ymd); setShowNewHolidayDatePicker(false); }} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday]}>
                        <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                      </TouchableOpacity>); })}</View>))}</View>);
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* U.S. public holidays picker: choose which holidays to include */}
          {showPublicHolidaysPicker && (
            <Modal animationType="fade" transparent visible={showPublicHolidaysPicker} onRequestClose={() => setShowPublicHolidaysPicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowPublicHolidaysPicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={[styles.calendarModal, { maxWidth: 420, maxHeight: '80%' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>U.S. public holidays</Text>
                    <TouchableOpacity onPress={() => setShowPublicHolidaysPicker(false)} hitSlop={12}>
                      <X size={22} color={SUB} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.mutedText, { marginBottom: 12 }]}>Uncheck any holiday you don't want to include (they will be treated as regular instructional days).</Text>
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
                            <Text style={[styles.label, { flex: 1, fontSize: 14 }]}>{h.name}</Text>
                            <Text style={[styles.mutedText, { fontSize: 13 }]}>{dateStr}</Text>
                          </TouchableOpacity>
                        );
                      })}
                      {publicHolidaysList.length === 0 && !publicHolidaysLoading && (
                        <Text style={[styles.mutedText, { padding: 16 }]}>No holidays in this date range. Extend range or add custom holiday.</Text>
                      )}
                    </ScrollView>
                  )}
                  <TouchableOpacity
                    onPress={async () => {
                      const datesWithNames = excludedPublicHolidayDates.map((d) => {
                        const h = publicHolidaysList.find((x) => (x.date || '').slice(0, 10) === d);
                        return { date: d, name: h?.name || 'Holiday' };
                      });
                      await saveExcludedPublicHolidayDates(familyId, datesWithNames);
                      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
                      setShowPublicHolidaysPicker(false);
                    }}
                    style={[styles.primaryButton, { marginTop: 16 }]}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.primaryButtonText}>Done</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Custom Break Start Date Calendar Picker */}
          {showNewBreakStartPicker && (
            <Modal animationType="fade" transparent visible={showNewBreakStartPicker} onRequestClose={() => setShowNewBreakStartPicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowNewBreakStartPicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakStartCalendarMonth); d.setMonth(d.getMonth() - 1); setNewBreakStartCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronLeft size={20} color={FG} /></TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>{newBreakStartCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakStartCalendarMonth); d.setMonth(d.getMonth() + 1); setNewBreakStartCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronRight size={20} color={FG} /></TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakStartCalendarMonth); d.setFullYear(d.getFullYear() - 1); setNewBreakStartCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>← Year</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const today = new Date(); setNewBreakStartCalendarMonth(today); setNewBreakStart(toLocalYYYYMMDD(today)); setShowNewBreakStartPicker(false); }} style={styles.calendarNavButton}><Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakStartCalendarMonth); d.setFullYear(d.getFullYear() + 1); setNewBreakStartCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>Year →</Text></TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>{WEEKDAY_LABELS.map((day) => (<View key={day} style={styles.calendarDayHeader}><Text style={styles.calendarDayHeaderText}>{day}</Text></View>))}</View>
                  {(() => {
                    const year = newBreakStartCalendarMonth.getFullYear(); const month = newBreakStartCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1); const startDateGrid = new Date(firstDay); startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = []; const current = new Date(startDateGrid); for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                    return (<View>{[0, 1, 2, 3, 4, 5].map((week) => (<View key={week} style={styles.calendarWeekRow}>{days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                      const isCurrentMonth = day.getMonth() === month; const ymd = toLocalYYYYMMDD(day); const isSelected = newBreakStart === ymd; const isToday = ymd === toLocalYYYYMMDD(new Date());
                      return (<TouchableOpacity key={idx} onPress={() => { setNewBreakStart(ymd); setShowNewBreakStartPicker(false); }} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday]}>
                        <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                      </TouchableOpacity>); })}</View>))}</View>);
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Custom Break End Date Calendar Picker */}
          {showNewBreakEndPicker && (
            <Modal animationType="fade" transparent visible={showNewBreakEndPicker} onRequestClose={() => setShowNewBreakEndPicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowNewBreakEndPicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakEndCalendarMonth); d.setMonth(d.getMonth() - 1); setNewBreakEndCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronLeft size={20} color={FG} /></TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>{newBreakEndCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakEndCalendarMonth); d.setMonth(d.getMonth() + 1); setNewBreakEndCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronRight size={20} color={FG} /></TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakEndCalendarMonth); d.setFullYear(d.getFullYear() - 1); setNewBreakEndCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>← Year</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const today = new Date(); setNewBreakEndCalendarMonth(today); setNewBreakEnd(toLocalYYYYMMDD(today)); setShowNewBreakEndPicker(false); }} style={styles.calendarNavButton}><Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const d = new Date(newBreakEndCalendarMonth); d.setFullYear(d.getFullYear() + 1); setNewBreakEndCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>Year →</Text></TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>{WEEKDAY_LABELS.map((day) => (<View key={day} style={styles.calendarDayHeader}><Text style={styles.calendarDayHeaderText}>{day}</Text></View>))}</View>
                  {(() => {
                    const year = newBreakEndCalendarMonth.getFullYear(); const month = newBreakEndCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1); const startDateGrid = new Date(firstDay); startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = []; const current = new Date(startDateGrid); for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                    return (<View>{[0, 1, 2, 3, 4, 5].map((week) => (<View key={week} style={styles.calendarWeekRow}>{days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                      const isCurrentMonth = day.getMonth() === month; const ymd = toLocalYYYYMMDD(day); const isSelected = newBreakEnd === ymd; const isToday = ymd === toLocalYYYYMMDD(new Date());
                      return (<TouchableOpacity key={idx} onPress={() => { setNewBreakEnd(ymd); setShowNewBreakEndPicker(false); }} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday]}>
                        <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                      </TouchableOpacity>); })}</View>))}</View>);
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Apply from date calendar picker (edit plan: apply block changes from this date forward) */}
          {showApplyFromDatePicker && startDate && endDate && (
            <Modal animationType="fade" transparent visible={showApplyFromDatePicker} onRequestClose={() => setShowApplyFromDatePicker(false)}>
              <TouchableOpacity style={styles.calendarOverlay} activeOpacity={1} onPress={() => setShowApplyFromDatePicker(false)}>
                <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.calendarModal}>
                  <Text style={[styles.eligibilityCardTitle, { marginBottom: 12 }]}>{STRINGS.planMyYear.applyFrom?.fromDate ?? 'Apply from date forward'}</Text>
                  <View style={styles.calendarNavRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(applyFromDateCalendarMonth); d.setMonth(d.getMonth() - 1); setApplyFromDateCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronLeft size={20} color={FG} /></TouchableOpacity>
                    <Text style={styles.calendarMonthTitle}>{applyFromDateCalendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
                    <TouchableOpacity onPress={() => { const d = new Date(applyFromDateCalendarMonth); d.setMonth(d.getMonth() + 1); setApplyFromDateCalendarMonth(d); }} style={styles.calendarNavButton}><ChevronRight size={20} color={FG} /></TouchableOpacity>
                  </View>
                  <View style={styles.calendarYearRow}>
                    <TouchableOpacity onPress={() => { const d = new Date(applyFromDateCalendarMonth); d.setFullYear(d.getFullYear() - 1); setApplyFromDateCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>← Year</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const today = new Date(); setApplyFromDateCalendarMonth(today); setApplyFromDate(toLocalYYYYMMDD(today)); setShowApplyFromDatePicker(false); }} style={styles.calendarNavButton}><Text style={[styles.calendarYearLink, { textDecorationLine: 'underline' }]}>Today</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => { const d = new Date(applyFromDateCalendarMonth); d.setFullYear(d.getFullYear() + 1); setApplyFromDateCalendarMonth(d); }} style={styles.calendarNavButton}><Text style={styles.calendarYearLink}>Year →</Text></TouchableOpacity>
                  </View>
                  <View style={styles.calendarDayHeaders}>{WEEKDAY_LABELS.map((day) => (<View key={day} style={styles.calendarDayHeader}><Text style={styles.calendarDayHeaderText}>{day}</Text></View>))}</View>
                  {(() => {
                    const year = applyFromDateCalendarMonth.getFullYear(); const month = applyFromDateCalendarMonth.getMonth();
                    const firstDay = new Date(year, month, 1); const startDateGrid = new Date(firstDay); startDateGrid.setDate(startDateGrid.getDate() - startDateGrid.getDay());
                    const days = []; const current = new Date(startDateGrid); for (let i = 0; i < 42; i++) { days.push(new Date(current)); current.setDate(current.getDate() + 1); }
                    const planStart = new Date(startDate + 'T12:00:00'); const planEnd = new Date(endDate + 'T12:00:00');
                    return (<View>{[0, 1, 2, 3, 4, 5].map((week) => (<View key={week} style={styles.calendarWeekRow}>{days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                      const isCurrentMonth = day.getMonth() === month; const ymd = toLocalYYYYMMDD(day); const isSelected = applyFromDate === ymd; const isToday = ymd === toLocalYYYYMMDD(new Date());
                      const dayTime = day.getTime(); const inRange = dayTime >= planStart.getTime() && dayTime <= planEnd.getTime();
                      return (<TouchableOpacity key={idx} onPress={() => { if (inRange) { setApplyFromDate(ymd); setShowApplyFromDatePicker(false); } }} style={[styles.calendarDayCell, isSelected && styles.calendarDayCellSelected, isToday && !isSelected && styles.calendarDayCellToday, !inRange && { opacity: 0.4 }]} disabled={!inRange}>
                        <Text style={[styles.calendarDayText, isSelected && styles.calendarDayTextSelected, !isCurrentMonth && styles.calendarDayTextMuted]}>{day.getDate()}</Text>
                      </TouchableOpacity>); })}</View>))}</View>);
                  })()}
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
          )}

          {/* Footer - Build Curriculum style: Cancel + rounded primary, no icons. Hidden on entry choice and when showing plan summary. */}
          {!showEntryChoice && !planSummaryYearId && !(PLAN_MY_YEAR_LOGISTICS_FIRST && planStep === 'unit_structure') && !(PLAN_MY_YEAR_LOGISTICS_FIRST && planStep === 'logistics' && isHomeschool) && (
          <View style={[styles.footer, pickerOnly && styles.pickerFooter]}>
            {planStep === 'preview' ? (
              <View style={styles.planYearPreviewFooterRow}>
                <View style={[styles.planYearPreviewFooterSide, { alignItems: 'flex-start' }]}>
                  <TouchableOpacity
                    onPress={() =>
                      setPlanStep(
                        getPreviewBackStep(
                          PLAN_MY_YEAR_LOGISTICS_FIRST,
                          Boolean(unitStructureData?.units?.length) || Boolean(draftData || manualDraft),
                        ),
                      )
                    }
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelText}>Back</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.planYearGenerateCtaFooter, (saving || loading || !preconditionsMet || !feasible) && styles.buttonDisabled]}
                  onPress={handleApplyToCalendar}
                  disabled={saving || loading || !preconditionsMet || !feasible}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={BG} />
                  ) : (
                    <Text style={[styles.primaryButtonText, styles.primaryButtonTextAllCaps]}>
                      {academicYearId ? STRINGS.planMyYear.primaryActions.updateSlots : STRINGS.planMyYear.primaryActions.generateSlots}
                    </Text>
                  )}
                </TouchableOpacity>
                <View style={styles.planYearPreviewFooterSide} />
              </View>
            ) : pickerOnly ? (
              <>
                <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
                  <Text style={[styles.cancelText, styles.pickerCancelText]}>Cancel</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => setStartCreatingNew(true)}
                  style={styles.pickerCreateButton}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.pickerCreateButtonText}>Create new plan</Text>
                </TouchableOpacity>
              </>
            ) : planStep === 'source' && !PLAN_MY_YEAR_LOGISTICS_FIRST ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    if (PLAN_MY_YEAR_LOGISTICS_FIRST) {
                      setUnitFocusSubjectId(null);
                      setPlanStep(PLAN_STEP_KEYS.LOGISTICS);
                    } else {
                      onClose();
                    }
                  }}
                  style={styles.cancelButton}
                  onMouseEnter={Platform.OS === 'web' ? () => setFooterCancelHover(true) : undefined}
                  onMouseLeave={Platform.OS === 'web' ? () => setFooterCancelHover(false) : undefined}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={[styles.cancelText, footerCancelHover && Platform.OS === 'web' && { textDecorationLine: 'underline' }]}>
                    {PLAN_MY_YEAR_LOGISTICS_FIRST ? 'Back' : STRINGS.global.actions.cancel}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (planSource === 'placeholders' || (planSource === 'link' && !sourceUrl.trim())) ? styles.primaryButtonDisabled : undefined,
                  ]}
                  onPress={() => {
                    setPlanStep(
                      getSourceNextStep(PLAN_MY_YEAR_LOGISTICS_FIRST, Boolean(unitPipelineSubjectId)),
                    );
                  }}
                  disabled={planSource === 'placeholders' || (planSource === 'link' && !sourceUrl.trim())}
                >
                  <Text style={styles.primaryButtonText}>Next</Text>
                </TouchableOpacity>
              </>
            ) : planStep === 'unit_structure' && !PLAN_MY_YEAR_LOGISTICS_FIRST ? (
              <>
                <TouchableOpacity
                  onPress={() => {
                    // Manual input: Back always goes to step 1 (Method), not the intermediate "Start building" screen
                    if (planSource === 'paste' && (draftData || manualDraft)) {
                      setDraftData(null);
                      setManualDraft(null);
                      setUnitStructureStep('input');
                      setRawText('');
                      setExpandedUnits(new Set());
                      setExpandedUnitIndexManual(0);
                      setPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST ? PLAN_STEP_KEYS.LOGISTICS : 'source');
                      return;
                    }
                    if (draftData || manualDraft) {
                      setDraftData(null);
                      setManualDraft(null);
                      setUnitStructureStep('input');
                      setRawText('');
                      setExpandedUnits(new Set());
                      setExpandedUnitIndexManual(0);
                    } else {
                      setPlanStep(PLAN_MY_YEAR_LOGISTICS_FIRST ? PLAN_STEP_KEYS.LOGISTICS : 'source');
                    }
                  }}
                  style={styles.cancelButton}
                  onMouseEnter={Platform.OS === 'web' ? () => setFooterCancelHover(true) : undefined}
                  onMouseLeave={Platform.OS === 'web' ? () => setFooterCancelHover(false) : undefined}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={[styles.cancelText, footerCancelHover && Platform.OS === 'web' && { textDecorationLine: 'underline' }]}>Back</Text>
                </TouchableOpacity>
                {(draftData || manualDraft) ? (
                  <TouchableOpacity
                    onPress={async () => {
                      const availableSubjectId = unitPipelineSubjectId;
                      const availableSubject = availableSubjectId ? baseSubjectList.find((s) => String(s.id) === String(availableSubjectId)) : null;
                      if (!availableSubject || !familyId) {
                        setUnitStructureError('Subject not found.');
                        return;
                      }
                      
                      setUnitStructureStep('saving');
                      setUnitStructureError(null);
                      try {
                        if (planSource === 'paste' && manualDraft) {
                          // Save manual draft
                          const { data, error: err } = await commitManualDraft({
                            subject_id: availableSubject?.id,
                            family_id: familyId,
                            subject_name: availableSubject?.name || '',
                            draft: manualDraft,
                            builder_mode: 'rich_units',
                          });
                          if (err || !data) {
                            setUnitStructureError(err?.message || 'Failed to save curriculum');
                            setUnitStructureStep('draft');
                            return;
                          }
                        } else if ((planSource === 'upload' || planSource === 'paste_plain') && draftData) {
                          // Save parsed / extracted draft (not manual `paste` path)
                          const { data, error: err } = await commitParsedDraft({
                            subject_id: availableSubject?.id,
                            family_id: familyId,
                            subject_name: availableSubject?.name || '',
                            draft: draftData,
                          });
                          if (err || !data) {
                            setUnitStructureError(err?.message || 'Failed to save curriculum');
                            setUnitStructureStep('draft');
                            return;
                          }
                        } else if (planSource === 'generate') {
                          // Save generated draft
                          const { data, error: err } = await commitGeneratedDraft({
                            subject_id: availableSubject?.id,
                            family_id: familyId,
                            subject_name: availableSubject?.name || '',
                            draft: draftData,
                          });
                          if (err || !data) {
                            setUnitStructureError(err?.message || 'Failed to save curriculum');
                            setUnitStructureStep('draft');
                            return;
                          }
                        }

                        if (unitPipelineSubjectId) {
                          setLastSavedUnitSubjectId(unitPipelineSubjectId);
                        }
                        
                        // Clear draft and move to schedule step (logistics in classic flow, preview when logistics-first)
                        setDraftData(null);
                        setManualDraft(null);
                        setUnitStructureStep('input');
                        setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST));
                        // Refresh unit structure data
                        if (unitPipelineSubjectId) {
                          setLoadingUnitStructure(true);
                          const subjectId = unitPipelineSubjectId;
                          const { data: eventsData, error: eventsErr } = await supabase
                            .from('events')
                            .select('id, title, curriculum_unit_title, curriculum_lesson_sequence, curriculum_metadata, start_ts, is_reference_date')
                            .eq('family_id', familyId)
                            .eq('subject_id', subjectId)
                            .eq('is_curriculum_related', true)
                            .order('curriculum_unit_title', { ascending: true })
                            .order('curriculum_lesson_sequence', { ascending: true });
                          if (!eventsErr && eventsData) {
                            const grouped = {};
                            eventsData.forEach((evt) => {
                              const unitTitle = evt.curriculum_unit_title || 'Unnamed Unit';
                              if (!grouped[unitTitle]) {
                                grouped[unitTitle] = { title: unitTitle, lessons: [] };
                              }
                              const meta = evt.curriculum_metadata || {};
                              grouped[unitTitle].lessons.push({
                                id: evt.id,
                                title: evt.title,
                                type: meta.lesson_type || 'lesson',
                                date: evt.start_ts ? evt.start_ts.slice(0, 10) : null,
                                sequence: evt.curriculum_lesson_sequence || 0,
                              });
                            });
                            setUnitStructureData({ units: Object.values(grouped) });
                          }
                          setLoadingUnitStructure(false);
                        }
                      } catch (err) {
                        setUnitStructureError(err.message || 'Failed to save curriculum');
                        setUnitStructureStep('draft');
                      }
                    }}
                    style={[styles.primaryButton, unitStructureStep === 'saving' && styles.primaryButtonDisabled]}
                    disabled={unitStructureStep === 'saving'}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    {unitStructureStep === 'saving' ? (
                      <>
                        <ActivityIndicator size="small" color={BG} style={{ marginRight: 8 }} />
                        <Text style={styles.primaryButtonText}>{s('global.status.saving')}</Text>
                      </>
                    ) : (
                      <Text style={styles.primaryButtonText}>
                        {unitStructureSaveDraftLabel}
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => setPlanStep(getAfterUnitStructureContinue(PLAN_MY_YEAR_LOGISTICS_FIRST))}
                    style={styles.primaryButton}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={styles.primaryButtonText}>
                      {unitStructureSkipDraftLabel}
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
            <TouchableOpacity
              onPress={() => {
                if (editingFromSummary) {
                  setPlanSummaryYearId(academicYearId);
                  setPlanSummaryData(planSummaryCacheRef.current.get(academicYearId) || null);
                  setShowPlanManagerView(true);
                  setEditingFromSummary(false);
                } else if (PLAN_MY_YEAR_LOGISTICS_FIRST) {
                  onClose();
                } else {
                  // Go back to unit_structure if we have curriculum data, otherwise to source
                  if (unitStructureData && unitStructureData.units && unitStructureData.units.length > 0) {
                    setPlanStep('unit_structure');
                  } else {
                    setPlanStep('source');
                  }
                }
              }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Back</Text>
            </TouchableOpacity>
            {isHomeschool ? (
              (planSource === 'upload' && onOpenBuildCurriculum) || planSource === 'link' || planSource === 'paste' ? (
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (saving || loading || (planSource === 'upload' && !selectedMaterialId) || (planSource === 'link' && !sourceUrl.trim()) || (planSource === 'paste' && !pastedText.trim())) && styles.buttonDisabled,
                  ]}
                  onPress={handleCreateUnitAndSchedule}
                  disabled={saving || loading || (planSource === 'upload' && !selectedMaterialId) || (planSource === 'link' && !sourceUrl.trim()) || (planSource === 'paste' && !pastedText.trim())}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={BG} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{STRINGS.buildCurriculum?.actions?.createUnitAndSchedule ?? 'Create unit & schedule'}</Text>
                  )}
                </TouchableOpacity>
              ) : PLAN_MY_YEAR_LOGISTICS_FIRST ? (
                <TouchableOpacity
                  style={[styles.primaryButton, !preconditionsMet && styles.buttonDisabled]}
                  onPress={() => setPlanStep(PLAN_STEP_KEYS.PREVIEW)}
                  disabled={!preconditionsMet}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.primaryButtonText}>{t('planMyYear.multiSubjectUnits.nextContinueToReview')}</Text>
                </TouchableOpacity>
              ) : (
            <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (saving || loading || !preconditionsMet || !feasible) && styles.buttonDisabled,
                ]}
                onPress={() => setPlanStep('preview')}
                disabled={saving || loading || !preconditionsMet || !feasible}
              >
                <Text style={styles.primaryButtonText}>Preview instructional slots</Text>
              </TouchableOpacity>
              )
            ) : PLAN_MY_YEAR_LOGISTICS_FIRST ? (
              <TouchableOpacity
                style={[styles.primaryButton, !preconditionsMet && styles.buttonDisabled]}
                onPress={() => setPlanStep(PLAN_STEP_KEYS.PREVIEW)}
                disabled={!preconditionsMet}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.primaryButtonText}>{t('planMyYear.multiSubjectUnits.nextContinueToReview')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={() => handleSave(false)}
              disabled={saving || loading}
            >
              {saving ? (
                <ActivityIndicator size="small" color={BG} />
              ) : (
                  <Text style={styles.primaryButtonText}>Save</Text>
              )}
            </TouchableOpacity>
            )}
              </>
            )
          }
          </View>
          )}
        </TouchableOpacity>
  );

  if (renderInline) {
    return (
      <View style={{ flex: 1, minHeight: 0, width: '100%', minWidth: 0 }}>
        {modalContent}
      <ConfirmDialog
        visible={showDeletePlanConfirm}
        title="Delete plan?"
        message="This will permanently remove this plan and its instructional slots from the calendar. You cannot undo this."
        confirmLabel="Delete plan"
        cancelLabel={STRINGS.global.actions.cancel}
        onConfirm={async () => {
          setShowDeletePlanConfirm(false);
          if (!planSummaryYearId || !familyId) return;
          setDeletingPlan(true);
          try {
            const { data, error } = await clearPlaceholders(familyId, planSummaryYearId, { deletePlan: true });
            if (error) {
              toast.push(error.message || 'Failed to delete plan.', 'error');
              return;
            }
            if (data?.plan_deleted) {
              planSummaryCacheRef.current.delete(planSummaryYearId);
              preloadedSummaryIdsRef.current.delete(planSummaryYearId);
              setPreviousPlans((prev) => prev.filter((p) => String(p.id) !== String(planSummaryYearId)));
              setPlanSummaryYearId(null);
              setPlanSummaryData(null);
              setPlanSummaryError(null);
              toast.push('Plan deleted.', 'success');
              if (typeof window !== 'undefined') {
                invalidatePlanHealthCache();
                window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
                window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
                setTimeout(() => window.dispatchEvent(new CustomEvent('refreshCalendar')), 150);
              }
              onClose?.();
            }
          } finally {
            setDeletingPlan(false);
          }
        }}
        onCancel={() => setShowDeletePlanConfirm(false)}
      />
      </View>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        {modalContent}
      </TouchableOpacity>
      <ConfirmDialog
        visible={showDeletePlanConfirm}
        title="Delete plan?"
        message="This will permanently remove this plan and its instructional slots from the calendar. You cannot undo this."
        confirmLabel="Delete plan"
        cancelLabel={STRINGS.global.actions.cancel}
        onConfirm={async () => {
          setShowDeletePlanConfirm(false);
          if (!planSummaryYearId || !familyId) return;
          setDeletingPlan(true);
          try {
            const { data, error } = await clearPlaceholders(familyId, planSummaryYearId, { deletePlan: true });
            if (error) {
              toast.push(error.message || 'Failed to delete plan.', 'error');
              return;
            }
            if (data?.plan_deleted) {
              planSummaryCacheRef.current.delete(planSummaryYearId);
              preloadedSummaryIdsRef.current.delete(planSummaryYearId);
              setPreviousPlans((prev) => prev.filter((p) => String(p.id) !== String(planSummaryYearId)));
              setPlanSummaryYearId(null);
              setPlanSummaryData(null);
              setPlanSummaryError(null);
              toast.push('Plan deleted.', 'success');
              if (typeof window !== 'undefined') {
                invalidatePlanHealthCache();
                window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
                window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
                setTimeout(() => window.dispatchEvent(new CustomEvent('refreshCalendar')), 150);
              }
              onClose?.();
            }
          } finally {
            setDeletingPlan(false);
          }
        }}
        onCancel={() => setShowDeletePlanConfirm(false)}
      />
    </Modal>
  );
}

const PICKER_CARD_BG = '#F8FBFF';
const PICKER_CARD_BORDER = '#E3EEF8';
const PICKER_OR_COLOR = '#94A3B8';
const PICKER_CREATE_BG = '#81C1E1';
const PICKER_CREATE_HOVER = '#6FB4D8';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  // Removed overlayBlur: app shell/sidebar use .glass (backdrop-filter), so modal blur stacked = double blur. Use dim only.
  pickerOverlay: {
    // Reserved for picker-specific overlay tweaks if needed
  },
  pickerModal: {
    maxWidth: 640,
    width: '100%',
    paddingHorizontal: 40,
    paddingTop: 20,
    paddingBottom: 36,
    borderRadius: 28,
  },
  pickerModalPlanSummary: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  pickerHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
    backgroundColor: SURFACE_ELEVATED,
  },
  entryChoiceBody: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    gap: 14,
  },
  entryChoiceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 4,
  },
  entryChoiceSubtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED,
    textAlign: 'center',
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  entryChoiceButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  entryChoiceIcon: {
    marginRight: 12,
  },
  entryChoiceButtonSecondary: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    backgroundColor: SURFACE_ELEVATED,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  entryChoiceButtonPrimary: {
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 0,
    backgroundColor: PRIMARY_BTN,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      backgroundImage: `linear-gradient(135deg, ${PRIMARY_BTN}, #9DD1F7)`,
    }),
  },
  entryChoiceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    marginBottom: 2,
  },
  entryChoiceButtonSubtext: {
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  entryChoiceButtonTextPrimary: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  entryChoiceButtonSubtextPrimary: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.92)',
  },
  pickerBody: {
    flex: 1,
    minHeight: 0,
  },
  pickerLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  pickerHeaderTextBlock: {
    flex: 1,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: FG,
    marginBottom: 2,
  },
  pickerSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
  },
  pickerDivider: {
    height: 1,
    backgroundColor: CARD_BORDER,
    marginBottom: 16,
  },
  planCard: {
    backgroundColor: PICKER_CARD_BG,
    borderWidth: 1,
    borderColor: PICKER_CARD_BORDER,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 20,
    ...(Platform.OS === 'web' && {
      transition: 'border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease',
    }),
  },
  planCardSelected: {
    backgroundColor: 'rgba(79,140,255,0.08)',
    borderColor: 'rgba(79,140,255,0.4)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 8px 20px rgba(0,0,0,0.05)',
    }),
    ...(Platform.OS !== 'web' && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 12,
      elevation: 4,
    }),
  },
  planListItem: {
    paddingVertical: 18,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  planListItemSelected: {
    backgroundColor: 'rgba(79,140,255,0.06)',
  },
  planCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    minWidth: 0,
  },
  planCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: FG,
    flex: 1,
    minWidth: 0,
  },
  planCardDateInline: {
    fontSize: 13,
    fontWeight: '400',
    color: MUTED,
    flexShrink: 0,
  },
  planCardChildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  planCardChildDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#14b8a6',
    flexShrink: 0,
  },
  planCardOwner: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
    flex: 1,
    minWidth: 0,
  },
  planCardDate: {
    fontSize: 13,
    color: MUTED,
  },
  planSummaryHeaderRow: {
    paddingVertical: 16,
    paddingHorizontal: 0,
    marginBottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  planSummaryModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    flex: 1,
    marginRight: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planSummaryDivider: {
    height: 1,
    backgroundColor: CARD_BORDER,
    marginBottom: 16,
    marginHorizontal: -20,
    alignSelf: 'stretch',
  },
  planSummaryContentContainer: {
    paddingTop: 12,
    paddingBottom: 0,
    paddingHorizontal: 0,
  },
  planSummaryPadded: {
    paddingHorizontal: 40,
  },
  planSummaryDividerFullWrap: {
    marginBottom: 12,
    alignSelf: 'stretch',
  },
  planSummaryDividerFull: {
    height: 1,
    backgroundColor: CARD_BORDER,
    width: '100%',
  },
  planSummaryDatesSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: MUTED,
    marginBottom: 4,
  },
  planSummaryDatesList: {
    paddingHorizontal: 40,
    paddingBottom: 12,
  },
  planSummaryDateRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
  },
  planSummaryDateRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  planSummaryDateRowText: {
    flex: 1,
    fontSize: 14,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planSummaryDateRowAttachment: {
    flexShrink: 0,
    paddingLeft: 4,
  },
  planSummaryFooterStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: SURFACE_ELEVATED,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
    marginTop: 12,
  },
  planSummaryFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  planSummaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingVertical: 12,
    minHeight: 0,
  },
  planSummaryFooterButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: PRIMARY_BTN,
    ...(Platform.OS === 'web' && {
      backgroundImage: `linear-gradient(135deg, ${PRIMARY_BTN}, #9DD1F7)`,
      boxShadow: '0 12px 30px rgba(133,196,242,0.35)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      cursor: 'pointer',
    }),
  },
  planSummaryFooterButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planSummaryFooterBack: {
    paddingVertical: 10,
    paddingHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  planSummaryField: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    minWidth: 0,
  },
  planSummaryFieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: MUTED,
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planSummaryFieldValue: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#e0f2fe',
    alignSelf: 'flex-start',
  },
  planSummaryFieldValueText: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planCardLine1: {
    fontSize: 13,
    fontWeight: '500',
    color: MUTED,
    marginBottom: 2,
  },
  planCardLine2: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    marginBottom: 2,
  },
  planCardLine3: {
    fontSize: 13,
    color: MUTED,
  },
  pickerOr: {
    fontSize: 12,
    color: PICKER_OR_COLOR,
    letterSpacing: 0.04,
    textTransform: 'uppercase',
    fontWeight: '500',
    textAlign: 'center',
  },
  pickerCreateButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PRIMARY_BTN,
    ...(Platform.OS === 'web' && {
      backgroundImage: `linear-gradient(135deg, ${PRIMARY_BTN}, #9DD1F7)`,
      boxShadow: '0 12px 30px rgba(133,196,242,0.35)',
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }),
  },
  pickerCreateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pickerFooter: {
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
    paddingVertical: 16,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: SURFACE_ELEVATED,
    gap: 12,
  },
  pickerCancelText: {
    color: PICKER_OR_COLOR,
    fontWeight: '500',
  },
  modal: {
    width: Platform.OS === 'web' ? 760 : '100%',
    maxWidth: '100%',
    width: 760,
    maxWidth: '100%',
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: BG,
    borderRadius: 24,
    ...Platform.select({
      web: {
        boxShadow: '0 30px 60px rgba(0, 0, 0, 0.12), 0 10px 30px rgba(0, 0, 0, 0.08)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 24,
        elevation: 12,
      },
    }),
    overflow: 'hidden',
  },
  /** Logistics-first main form: flush edges, no card shadow (sits flat in layout). */
  modalFlatLf: {
    borderRadius: 0,
    ...Platform.select({
      web: {
        boxShadow: 'none',
      },
      default: {
        elevation: 0,
        shadowOpacity: 0,
        shadowRadius: 0,
        shadowColor: 'transparent',
        shadowOffset: { width: 0, height: 0 },
      },
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
    backgroundColor: SURFACE_ELEVATED,
  },
  modalHeaderLeft: { flex: 1, minWidth: 0 },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalHeaderIconWrap: {
    marginRight: 2,
  },
  modalHeaderTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: FG,
    marginBottom: 2,
  },
  modalHeaderMeta: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 20,
  },
  closeButtonHeader: { padding: 6, marginRight: -6 },
  breadcrumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
    minWidth: 0,
  },
  breadcrumbStep: {
    fontSize: 17,
    fontWeight: '700',
    color: MUTED,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  breadcrumbStepCurrent: {
    color: BRAND_500,
    fontWeight: '700',
  },
  breadcrumbSeparator: {
    fontSize: 17,
    color: BORDER_STRONG,
    fontWeight: '400',
  },
  sectionProgress: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 10,
    backgroundColor: BG,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
  },
  sectionProgressStep: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
  },
  sectionProgressStepCompleted: {
    color: FG,
    fontWeight: '600',
  },
  sectionProgressStepCurrent: {
    color: CHIP_SELECTED_TEXT,
    fontWeight: '600',
  },
  sectionProgressStepFuture: {
    color: MUTED,
    opacity: 0.7,
  },
  card: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 14,
    paddingTop: CARD_PADDING,
    paddingHorizontal: CARD_PADDING,
    paddingBottom: 12,
    marginBottom: SECTION_SPACING,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }),
    ...(Platform.OS !== 'web' && { elevation: 2 }),
  },
  cardFlat: {
    paddingTop: CARD_PADDING,
    paddingHorizontal: CARD_PADDING,
    paddingBottom: 12,
    marginBottom: SECTION_SPACING,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: { fontSize: 13, color: SUB, marginBottom: 6 },
  summaryValue: { fontSize: 13, fontWeight: '600', color: FG },
  twoColumnRow: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  twoColumnHalf: {
    flex: 1,
    minWidth: 200,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: LABEL_INPUT_GAP,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    height: 36,
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: BG,
  },
  chipSelected: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  chipText: { fontSize: 13, color: SUB, fontWeight: '500' },
  chipTextSelected: { color: CHIP_SELECTED_TEXT, fontWeight: '700' },
  content: {
    flex: 1,
  },
  /** Match planner AttendanceView inner inset (attendance/constants TOKENS.contentPadX / contentPadY + bottom breathing room). */
  contentContainer: {
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 48,
  },
  /** Match attendance YearHeatmapGrid “Year at a glance” title + help (TOKENS.sectionTitle / sectionHelp). */
  planYearGlanceHeaderWrap: {
    marginBottom: 20,
  },
  planYearGlanceTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.92)',
    marginBottom: 8,
  },
  planYearGlanceHelp: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.62)',
    lineHeight: 18,
  },
  planListContentContainer: {
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 32,
  },
  /** Inline edit-plan list: same horizontal/top inset as build plan (contentContainer). */
  planListContentContainerInline: {
    paddingHorizontal: 32,
    paddingTop: 24,
    flexGrow: 1,
    width: '100%',
  },
  planListScrollInline: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: FG,
    marginBottom: 4,
    marginTop: 0,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  description: {
    fontSize: 13,
    color: SUB,
    marginBottom: 20,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  editButton: {
    padding: 12,
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 8,
    marginBottom: 20,
  },
  editButtonText: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '500',
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingRowInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  settingText: {
    fontSize: 13,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  customToggleTrack: {
    width: 52,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#d1d5db',
    paddingHorizontal: 2,
    paddingVertical: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  customToggleTrackOn: {
    backgroundColor: '#AECBFA',
  },
  customToggleThumb: {
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
  },
  customToggleThumbOn: {
    transform: [{ translateX: 24 }],
    backgroundColor: '#0D9488',
  },
  holidaySettingsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  modeSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  modeButton: {
    flex: 1,
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    height: 36,
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: BG,
  },
  modeButtonActive: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  modeButtonText: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: CHIP_SELECTED_TEXT,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 24,
  },
  dateRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  inputGroupFlex: {
    flex: 1,
    marginBottom: 0,
  },
  /** Add Event–style container: rounded gray block for related fields (e.g. Compliance, Holidays) */
  fieldSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
  },
  fieldSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: FG,
    marginBottom: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Scope section: smaller, more subtle labels */
  logisticsLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: MUTED,
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: FG,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: FG,
    backgroundColor: '#fafbfc',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inputFocused: {
    borderColor: ACCENT,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  datePickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#fafbfc',
  },
  datePickerTriggerText: {
    fontSize: 14,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  datePickerPlaceholder: {
    fontSize: 14,
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateRangeCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    marginTop: 8,
    marginBottom: 14,
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  dateRangeSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateRangeArrow: {
    padding: 4,
  },
  dateRangeDateWrap: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateRangeDate: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateRangeArrowLabel: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '500',
  },
  dateRangeTodayWrap: {
    marginTop: 6,
    alignSelf: 'center',
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  dateNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: BORDER,
    gap: 8,
  },
  dateNavBarLabel: {
    fontSize: 12,
    color: MUTED,
    marginRight: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateNavBarArrow: {
    padding: 4,
  },
  dateNavBarDateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavBarDate: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateNavBarTodayWrap: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  dateNavBarToday: {
    fontSize: 12,
    color: MUTED,
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectContainer: {
    position: 'relative',
    zIndex: 1000,
    marginTop: 8,
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fafbfc',
    minHeight: 44,
  },
  selectTriggerText: {
    color: FG,
    fontSize: 14,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectTriggerPlaceholder: {
    color: MUTED,
  },
  selectOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    maxHeight: 220,
    zIndex: 10001,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    }),
    ...(Platform.OS !== 'web' && { elevation: 10000 }),
  },
  selectOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  selectOptionActive: {
    backgroundColor: ACCENT_LIGHT,
  },
  selectOptionText: {
    color: FG,
    fontSize: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  selectOptionTextActive: {
    fontWeight: '600',
    color: ACCENT,
  },
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModal: {
    backgroundColor: BG,
    borderRadius: 12,
    padding: 16,
    width: Platform.OS === 'web' ? 320 : '90%',
    maxWidth: 320,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)' }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 8,
        }),
  },
  calendarNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarNavButton: {
    padding: 4,
  },
  calendarMonthTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  calendarYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  calendarYearLink: {
    fontSize: 12,
    color: SUB,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  calendarDayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  calendarDayHeader: {
    flex: 1,
    alignItems: 'center',
  },
  calendarDayHeaderText: {
    fontSize: 12,
    color: SUB,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  calendarDayCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  calendarDayCellSelected: {
    backgroundColor: ACCENT,
  },
  calendarDayCellToday: {
    borderWidth: 2,
    borderColor: ACCENT,
  },
  calendarDayText: {
    fontSize: 13,
    color: FG,
  },
  calendarDayTextSelected: {
    color: BG,
    fontWeight: '600',
  },
  calendarDayTextMuted: {
    color: MUTED,
  },
  holidayInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: ACCENT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  holidayAddButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#85C4F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonWithLabel: {
    width: undefined,
    height: undefined,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    flexShrink: 0,
  },
  scheduleBlocksContainer: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  scheduleBlocksInner: {
    marginTop: 0,
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
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  blockRowLine: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 10,
  },
  blockTimeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
  },
  collapsibleSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 0,
  },
  holidayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    marginBottom: 8,
  },
  weekdayChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  weekdayChipSmall: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    borderRadius: 20,
    backgroundColor: SURFACE_SUBTLE,
  },
  weekdayChipSmallActive: {
    borderColor: '#60a5fa',
    backgroundColor: '#dbeafe',
  },
  weekdayChipSmallText: {
    fontSize: 12,
    color: SUB,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  weekdayChipSmallTextActive: {
    color: '#2563eb',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  blockTimeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
  },
  blockTimeField: {
    flex: 1,
    maxWidth: 100,
    minWidth: 90,
  },
  blockTimeLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  blockTimeInputWrap: {
    minHeight: 44,
    justifyContent: 'center',
  },
  holidayDate: {
    fontSize: 13,
    color: SUB,
    marginRight: 12,
    minWidth: 100,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  holidayName: {
    flex: 1,
    fontSize: 13,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deleteButton: {
    padding: 4,
  },
  preconditionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 8,
  },
  preconditionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#fafbfc',
  },
  preconditionLabel: {
    fontSize: 13,
    color: FG,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  preconditionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  preconditionButtonText: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  preconditionWarning: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    marginBottom: 16,
  },
  preconditionWarningText: {
    fontSize: 13,
    color: ERROR,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewRow: {
    padding: 16,
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 8,
    marginTop: 20,
  },
  previewSummary: {
    fontSize: 13,
    fontWeight: '600',
    color: FG,
    marginBottom: 6,
  },
  previewText: {
    fontSize: 13,
    color: FG,
    marginLeft: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  previewFeasibilityError: {
    fontSize: 13,
    color: ERROR,
  },
  previewFeasibilityOk: {
    fontSize: 13,
    color: SUCCESS,
  },
  radioRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  radioOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    height: 36,
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: BG,
  },
  radioOptionActive: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  /** Choose method option: no fixed height so label + description can wrap fully */
  sourceOptionCard: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: BG,
    minHeight: 56,
  },
  /** Flat variant for step 1 (no border) - legacy */
  sourceOptionCardFlat: {
    paddingVertical: 16,
    paddingHorizontal: 18,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    alignSelf: 'stretch',
    backgroundColor: BG,
    minHeight: 56,
  },
  /** Step 1: content zone padding (horizontal matches AttendanceView) */
  sourceStepContent: {
    paddingHorizontal: 32,
    paddingTop: SECTION_GAP,
    paddingBottom: 24,
  },
  sourceSectionDivider: {
    height: 1,
    backgroundColor: BORDER_SUBTLE,
    marginBottom: 8,
  },
  sourceSectionLabel: {
    fontSize: 13,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: MUTED,
    marginBottom: 8,
    fontWeight: '600',
  },
  sourceSectionDescription: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 28,
    lineHeight: 20,
  },
  /** Selectable option tile - unselected */
  sourceOptionTile: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER_STRONG,
    backgroundColor: SURFACE_SUBTLE,
    minHeight: 56,
    position: 'relative',
    ...(Platform.OS === 'web' && {
      transition: 'border 0.12s ease, background-color 0.12s ease, box-shadow 0.12s ease, transform 0.12s ease',
      cursor: 'pointer',
    }),
  },
  sourceOptionTileSelected: {
    backgroundColor: BG,
    borderWidth: 2,
    borderColor: BRAND_500,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 6px 18px rgba(0,0,0,0.06)',
    }),
    ...(Platform.OS !== 'web' && { elevation: 2 }),
  },
  sourceOptionTileHover: {
    ...(Platform.OS === 'web' && {
      backgroundColor: BG,
      borderColor: BORDER_STRONG,
    }),
    ...(Platform.OS === 'web' && { transform: [{ translateY: -1 }] }),
  },
  sourceOptionRadioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BORDER_STRONG,
    marginRight: 12,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceOptionRadioSelected: {
    borderColor: BRAND_500,
    backgroundColor: BRAND_500,
  },
  sourceOptionRadioInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: BG,
  },
  sourceOptionIconWrap: {
    marginRight: 12,
    marginTop: 2,
  },
  sourceOptionBody: { flex: 1, minWidth: 0 },
  sourceOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: FG,
  },
  sourceOptionBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
  },
  sourceOptionBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#b45309',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sourceOptionDescription: {
    fontSize: 13,
    color: MUTED,
    lineHeight: 20,
  },
  sourceOptionCheckWrap: {
    position: 'absolute',
    top: 18,
    right: 20,
  },
  radioLabel: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  radioLabelActive: {
    color: CHIP_SELECTED_TEXT,
    fontWeight: '700',
  },
  childSelectRow: {
    marginTop: 12,
  },
  subjectSelectRow: {
    marginTop: 12,
  },
  childChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  subjectsChipsRow: {
    marginTop: 10,
  },
  childChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  childChipActive: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  childChipText: {
    fontSize: 12,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childChipTextActive: { color: CHIP_SELECTED_TEXT, fontWeight: '700' },
  subjectChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: LABEL_INPUT_GAP,
  },
  subjectChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    height: 36,
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: BG,
  },
  subjectChipActive: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  subjectChipText: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectChipTextActive: { color: CHIP_SELECTED_TEXT, fontWeight: '700' },
  mutedText: {
    fontSize: 13,
    color: MUTED,
    marginTop: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  resultBox: {
    padding: 16,
    backgroundColor: ACCENT_LIGHT,
    borderRadius: 8,
    marginTop: 20,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: FG,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 13,
    color: FG,
    marginBottom: 4,
  },
  errorBox: {
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: ERROR,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER_SUBTLE,
  },
  cancelButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'none',
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    minHeight: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: PRIMARY_BTN,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 12px rgba(133, 196, 242, 0.35)',
      cursor: 'pointer',
    }),
    ...(Platform.OS !== 'web' && { elevation: 2 }),
  },
  primaryButtonDisabled: {
    opacity: 0.4,
    ...(Platform.OS === 'web' && { boxShadow: 'none' }),
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Generate / Update slots — uppercase label, intrinsic width (not full-bleed). */
  primaryButtonTextAllCaps: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  planYearGenerateCta: {
    alignSelf: 'center',
    marginTop: 20,
  },
  /** Preview footer: left Back + centered primary (equal flex sides). */
  planYearPreviewFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  planYearPreviewFooterSide: {
    flex: 1,
  },
  planYearGenerateCtaFooter: {
    alignSelf: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  suggestionAcceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: SUCCESS,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  suggestionAcceptButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: BG,
  },
  suggestionAcceptButtonPending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: BORDER,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  suggestionAcceptButtonTextPending: {
    fontSize: 12,
    fontWeight: '600',
    color: FG,
  },
  suggestionAcceptHint: {
    fontSize: 11,
    color: MUTED,
  },
  eligibilityCard: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER_SUBTLE,
    backgroundColor: '#f9fafb',
  },
  eligibilityCardTinted: {
    backgroundColor: '#f9fafb',
    borderColor: BORDER_SUBTLE,
  },
  eligibilityCardEmpty: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  eligibilityChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  eligibilityChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: MUTED,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eligibilityCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: '100%',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eligibilityCardMain: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    width: '100%',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eligibilityCardSecondary: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
    width: '100%',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eligibilityCardFilled: {
    gap: 8,
  },
  eligibilitySummaryRow: {
    marginBottom: 4,
  },
  eligibilitySummaryNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eligibilityTargetMuted: {
    fontSize: 13,
    color: MUTED,
    marginTop: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eligibilityStatusRow: {
    marginTop: 0,
    gap: 6,
  },
  eligibilityPill: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  eligibilityPillOver: {
    backgroundColor: 'rgba(217,119,6,0.15)',
  },
  eligibilityPillUnder: {
    backgroundColor: 'rgba(217,119,6,0.15)',
  },
  eligibilityPillOnTarget: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  eligibilityPillText: {
    fontSize: 12,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eligibilityRecommendationRow: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: ELIGIBILITY_CARD_BORDER,
  },
  eligibilityOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
  },
  eligibilityOptionRowHover: {
    cursor: 'pointer',
  },
  eligibilityOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
  },
  eligibilityOptionSubtext: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  eligibilityAcceptButton: {
    height: 36,
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SECONDARY_BTN_BORDER,
    backgroundColor: BG,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eligibilityAcceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: SUB,
  },
});
