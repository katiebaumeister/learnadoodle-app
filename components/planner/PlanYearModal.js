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
  AlertTriangle,
  Check,
  Info,
  LayoutGrid,
  Upload,
  List,
  Sparkles,
  ArrowRight,
  Paperclip,
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
import { supabase } from '../../lib/supabase';
import { t, s, STRINGS } from '../../lib/i18n/strings';
import { buildCurriculum, commitCurriculum } from '../../lib/services/curriculumClient';
import { getMaterials } from '../../lib/services/materialsClient';
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
    planForChildIds = [],
    blocks = [],
    selectedSubjectIds = [],
    startDate,
    endDate,
  } = options;
  const childList = (children || []);
  const studentName =
    planForChildIds.length === 0
      ? 'Whole family'
      : planForChildIds
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

/** Parse "09:00" or "09:30" to minutes since midnight. */
function timeToMinutes(t) {
  if (!t || typeof t !== 'string') return 0;
  const [h, m] = t.trim().split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

/** Detect when the same child has two blocks at the same weekday and overlapping time. */
function getBlockConflicts(blocks, children, baseSubjectList) {
  if (!blocks || blocks.length < 2) return [];
  const conflicts = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      const childIdsA = (a.child_ids && a.child_ids.length) ? a.child_ids : (children || []).map((c) => c.id).filter(Boolean);
      const childIdsB = (b.child_ids && b.child_ids.length) ? b.child_ids : (children || []).map((c) => c.id).filter(Boolean);
      const sharedChildren = childIdsA.filter((cid) => childIdsB.includes(cid));
      if (sharedChildren.length === 0) continue;
      const weekdaysA = a.weekdays || [];
      const weekdaysB = b.weekdays || [];
      const sharedDays = weekdaysA.filter((d) => weekdaysB.includes(d));
      if (sharedDays.length === 0) continue;
      const startA = timeToMinutes(a.start_time || '09:00');
      const endA = timeToMinutes(a.end_time || '10:00');
      const startB = timeToMinutes(b.start_time || '09:00');
      const endB = timeToMinutes(b.end_time || '10:00');
      if (startA >= endB || startB >= endA) continue;
      const subjA = baseSubjectList?.find((s) => s.id === a.subject_id);
      const subjB = baseSubjectList?.find((s) => s.id === b.subject_id);
      const subjectAName = subjA?.name || 'Subject';
      const subjectBName = subjB?.name || 'Subject';
      sharedChildren.forEach((childId) => {
        const child = (children || []).find((c) => String(c.id) === String(childId));
        conflicts.push({
          blockIndexA: i,
          blockIndexB: j,
          childId,
          childName: child?.name || child?.first_name || 'Child',
          subjectAName,
          subjectBName,
          sharedDays,
        });
      });
    }
  }
  return conflicts;
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

/** True if subject is family-wide (all children) or assigned to the given child. child_id can be null, '', or semicolon-separated ids. */
function subjectMatchesChild(subject, childId) {
  if (!childId) return true;
  const cid = subject.child_id;
  if (cid == null || cid === '') return true;
  const ids = String(cid).split(';').map((id) => id.trim()).filter(Boolean);
  return ids.some((id) => String(id) === String(childId));
}

/** True if subject applies to every child in the family (whole-family plan). Empty/null child_id = all; else subject's child_id list must include every family child id. */
function subjectAppliesToAllChildren(subject, children) {
  const familyChildIds = (children || []).map((c) => c?.id).filter(Boolean);
  if (familyChildIds.length === 0) return true;
  const cid = subject.child_id;
  if (cid == null || cid === '') return true;
  const subjectChildIds = new Set(String(cid).split(';').map((id) => id.trim()).filter(Boolean));
  return familyChildIds.every((id) => subjectChildIds.has(id));
}

export default function PlanYearModal({
  visible,
  familyId,
  children = [],
  subjects = [],
  fullSubjects = [],
  onClose,
  onComplete,
  onOpenBuildCurriculum = null,
  initialAcademicYearId = null,
  initialPlanSummaryData = null,
  openForNewPlan = false,
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
  
  // Phase 2: Who / which subjects / replace prompt
  const [planForChildIds, setPlanForChildIds] = useState([]); // [] = whole family, [id, ...] = those assignees
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]); // single subject per plan: 0 or 1 id
  const [existingPlaceholdersCount, setExistingPlaceholdersCount] = useState(0);
  const [replacePlaceholders, setReplacePlaceholders] = useState(true);
  const [clearingPlan, setClearingPlan] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showDeletePlanConfirm, setShowDeletePlanConfirm] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
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

  // Phase 4: Flex Learning suggestion when delta < 0
  const [flexSuggestion, setFlexSuggestion] = useState(null);
  const [computingFlexSuggestion, setComputingFlexSuggestion] = useState(false);
  const flexSuggestionTimeoutRef = useRef(null);

  // Plan health (includes manual counted events for "Manual instructional events counted" panel)
  const [planHealth, setPlanHealth] = useState(null);
  const [holidaysCollapsed, setHolidaysCollapsed] = useState(true);
  const [complianceCollapsed, setComplianceCollapsed] = useState(true);
  const [excludedPublicHolidayDates, setExcludedPublicHolidayDates] = useState([]); // dates (YYYY-MM-DD) to exclude from US public holidays
  const [showPublicHolidaysPicker, setShowPublicHolidaysPicker] = useState(false);
  const [publicHolidaysList, setPublicHolidaysList] = useState([]);
  const [publicHolidaysLoading, setPublicHolidaysLoading] = useState(false);
  const [planSource, setPlanSource] = useState('placeholders'); // 'placeholders' | 'upload' | 'link' | 'paste'
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
  const [planStep, setPlanStep] = useState('source'); // 'source' | 'logistics' | 'preview'
  const [showPlanManagerView, setShowPlanManagerView] = useState(false); // when true and pickerOnly, show Edit plan list; when false and pickerOnly, show entry choice (Plan Manager / Create New Plan)
  const [planSummaryYearId, setPlanSummaryYearId] = useState(null); // when set, show plan summary view (like event summary) before editing
  const [editingFromSummary, setEditingFromSummary] = useState(false); // true when we opened logistics from "Edit Plan" on plan summary (header = Edit > Review, Back = to summary)
  const [planSummaryData, setPlanSummaryData] = useState(null);
  const [planSummaryLoading, setPlanSummaryLoading] = useState(false);
  const [planSummaryError, setPlanSummaryError] = useState(null);
  const [showPreviewScreen, setShowPreviewScreen] = useState(false);
  const [parsedContent, setParsedContent] = useState(null); // { unit, lessons, pacing } from buildCurriculum for upload/link/paste
  const [parsingContent, setParsingContent] = useState(false);
  const [parseContentError, setParseContentError] = useState(null);
  const [hoverSourceKey, setHoverSourceKey] = useState(null); // for step 1 option hover (web)
  const [entryChoiceHoverKey, setEntryChoiceHoverKey] = useState(null); // 'edit' | 'create' for arrow on hover
  const [footerCancelHover, setFooterCancelHover] = useState(false);
  const [dismissedConflictKeys, setDismissedConflictKeys] = useState(() => new Set());
  const [highlightBlockIndex, setHighlightBlockIndex] = useState(null);

  const recalculateTimeoutRef = useRef(null);
  const scrollRef = useRef(null);
  const scheduleSectionYRef = useRef(0);
  const datesSectionYRef = useRef(0);
  const schedulePotentialFetchedRef = useRef(false);
  const planSummaryCacheRef = useRef(new Map()); // yearId -> full academic year data for instant summary display
  const preloadedSummaryIdsRef = useRef(new Set());
  const subjectPlanResolvedRef = useRef(false); // when from subject details, avoid re-running plan-for-subject search

  const baseSubjectList = Array.isArray(fullSubjects) && fullSubjects.length > 0 ? fullSubjects : subjects;
  const subjectsForCurrentSelection =
    planForChildIds.length === 0
      ? baseSubjectList.filter((s) => subjectAppliesToAllChildren(s, children))
      : baseSubjectList.filter((s) => planForChildIds.every((childId) => subjectMatchesChild(s, childId)));
  const effectiveSubjectIds = selectedSubjectIds.filter((id) =>
    subjectsForCurrentSelection.some((s) => s.id === id)
  );

  const blockConflicts = useMemo(
    () => getBlockConflicts(blocks, children, baseSubjectList),
    [blocks, children, baseSubjectList]
  );

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
      const subjectName = (baseSubjectList || []).find((s) => String(s.id) === String(block.subject_id))?.name || 'Subject';
      const timeLabel = block.all_day ? 'All day' : formatTimeRange(block.start_time, block.end_time);
      const blockChildIds = Array.isArray(block.child_ids) ? block.child_ids : (planForChildIds.length > 0 ? planForChildIds : []);
      const childNames = blockChildIds.length > 0
        ? blockChildIds.map((cid) => childList.find((c) => String(c.id) === String(cid))?.first_name || childList.find((c) => String(c.id) === String(cid))?.name || 'Child').join(', ')
        : (planForChildIds.length > 0 ? planForChildIds.map((id) => childList.find((c) => String(c.id) === String(id))?.first_name || childList.find((c) => String(c.id) === String(id))?.name || 'Child').join(', ') : 'Whole family');
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
  }, [blocks, startDate, endDate, customHolidays, customBreaks, baseSubjectList, children, planForChildIds]);

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
  const [startCreatingNew, setStartCreatingNew] = useState(() => !!(openForNewPlan && !initialAcademicYearId));

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

  // When opening from subject details, show YOUR PLANS list directly (skip "Editing or creating?" choice)
  useEffect(() => {
    if (visible && fromSubjectDetail) {
      setShowPlanManagerView(true);
    }
  }, [visible, fromSubjectDetail]);

  // When opening from subject details and no plan exists, default to screen one of add new plan (skip empty YOUR PLANS modal)
  useEffect(() => {
    if (visible && fromSubjectDetail && !previousPlansLoading && previousPlans.length === 0) {
      setStartCreatingNew(true);
      setPlanStep('source');
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
            setSelectedSubjectIds([subjectIdsFromPlan[0]]);
          }
          const childIdSet = new Set();
          planBlocks.forEach((b) => {
            (b.child_ids || []).forEach((cid) => {
              if (cid) childIdSet.add(cid);
            });
          });
          const distinctChildIds = Array.from(childIdSet);
          setPlanForChildIds(distinctChildIds.length > 0 ? distinctChildIds : []);
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

  // When opening for a new plan (no existing plan loaded), pre-fill dates and requirement from family/child saved targets (Edit Child / onboarding school year)
  useEffect(() => {
    if (!visible || !familyId || academicYearId || initialAcademicYearId || savedTargetsAppliedRef.current) return;
    let cancelled = false;
    (async () => {
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

  // When modal opens for new plan (no existing plan), default assignee to first child and leave subject unselected
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current && !initialAcademicYearId) {
      const childList = children || [];
      if (childList.length > 0) {
        setPlanForChildIds([childList[0].id]);
      }
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
        setDismissedConflictKeys(new Set());
        setHighlightBlockIndex(null);
        setPlanStep('source');
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

  // When switching assignee, prune selectedSubjectIds to valid subjects (keep at most one)
  useEffect(() => {
    if (subjectsForCurrentSelection.length === 0) return;
    const validIds = new Set(subjectsForCurrentSelection.map((s) => s.id));
    setSelectedSubjectIds((prev) => {
      const next = prev.filter((id) => validIds.has(id)).slice(0, 1);
      return next.length !== prev.length || (next[0] !== prev[0]) ? next : prev;
    });
  }, [planForChildIds, subjectsForCurrentSelection]);

  // Clear parsed content when source or input changes so user re-parses
  useEffect(() => {
    if (planSource === 'upload' || planSource === 'link' || planSource === 'paste') {
      setParsedContent(null);
      setParseContentError(null);
    }
  }, [planSource, sourceUrl, pastedText, selectedMaterialId]);

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
    const studentIds = planForChildIds.length > 0 ? planForChildIds : (children || []).map((c) => c.id);
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
  }, [planSource, sourceUrl, pastedText, selectedMaterialId, planForChildIds, children, startDate, endDate]);

  // When user selects a content source (paste/link/upload), auto-fill dates if empty and expand Who & subjects + Dates so they see what will be used
  const prevPlanSourceRef = useRef(planSource);
  useEffect(() => {
    const isContentSource = planSource === 'paste' || planSource === 'link' || planSource === 'upload';
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

  // Auto-sync blocks to required subjects: one block per effective subject (require all)
  const effectiveSubjectIdsKey = effectiveSubjectIds.slice().sort().join(',');
  const syncBlocksFromEffectiveSubjects = useCallback(() => {
    if (effectiveSubjectIds.length === 0) {
      setBlocks([]);
      return;
    }
    const childIds = planForChildIds.length > 0 ? planForChildIds : [];
    setBlocks((prevBlocks) => {
      const bySubject = new Map(prevBlocks.map((b) => [b.subject_id, b]));
      return effectiveSubjectIds.map((subjectId) => {
        const existing = bySubject.get(subjectId);
        if (existing) {
          const existingChildIds = Array.isArray(existing.child_ids) ? existing.child_ids : [];
          const nextChildIds = existingChildIds.length > 0 ? existingChildIds : childIds;
          return { ...existing, child_ids: nextChildIds };
        }
        return {
          block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${subjectId}`,
          subject_id: subjectId,
          child_ids: childIds,
          weekdays: [],
          start_time: '09:00',
          end_time: '10:00',
          all_day: false,
        };
      });
    });
  }, [effectiveSubjectIdsKey, effectiveSubjectIds.length, planForChildIds]);

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

  // Compute schedule potential when blocks + date range + exclusions change (debounced to avoid 429; immediate on first load so suggestion shows with modal)
  const triggerSchedulePotential = useCallback((immediate = false) => {
    if (schedulePotentialTimeoutRef.current) clearTimeout(schedulePotentialTimeoutRef.current);
    const delay = immediate || !schedulePotentialFetchedRef.current ? 0 : 120;
    schedulePotentialTimeoutRef.current = setTimeout(async () => {
      if (!familyId || !startDate || !endDate || blocks.length === 0) {
        setSchedulePotential(null);
        setComputingPotential(false);
        return;
      }
      setComputingPotential(true);
      try {
        const planChildrenIds = planForChildIds.length > 0 ? planForChildIds : (children || []).map((c) => c.id).filter(Boolean);
        const { data, error } = await computeSchedulePotential({
          family_id: familyId,
          start_date: startDate,
          end_date: endDate,
          blocks: blocks.map((b) => ({
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
          target_days: planConstraintMode === 'days' ? (parseInt(planTargetDays, 10) || null) : null,
          target_hours: planConstraintMode === 'hours' ? (parseFloat(planTargetHours) || null) : null,
          plan_children_ids: planChildrenIds.length > 0 ? planChildrenIds : undefined,
          subject_targets: planHealth?.subject_targets ?? undefined,
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
  }, [familyId, startDate, endDate, blocks, customHolidays, customBreaks, followGlobalHolidays, countryCode, regionCode, planConstraintMode, planTargetDays, planTargetHours, planForChildIds, children, planHealth?.subject_targets]);

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
  }, [visible, blocks, startDate, endDate, customHolidays, customBreaks, triggerSchedulePotential]);

  // Phase 4: Compute Flex Learning suggestion when delta < 0
  const isUnderTarget = schedulePotential && (
    (planConstraintMode === 'days' && schedulePotential.delta_days != null && schedulePotential.delta_days < 0) ||
    (planConstraintMode === 'hours' && schedulePotential.delta_hours != null && schedulePotential.delta_hours < 0)
  );

  // Flex Learning suggestion disabled (UI removed); no extra schedule_potential calls
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
  const preconditionsMet = childrenCount > 0 && subjectsCount > 0 && (selectedSubjectIds.length === 1 || blocks.length > 0);

  const eligibleCount = calculatedResult?.instructional_days ?? 0;
  const excludedCount = calculatedResult?.non_instructional_days ?? 0;
  const targetDaysNum = planConstraintMode === 'days'
    ? (parseInt(planTargetDays, 10) || TARGET_INSTRUCTIONAL_DAYS_DEFAULT)
    : TARGET_INSTRUCTIONAL_DAYS_DEFAULT;
  const feasible = blocks.length > 0
    ? (planConstraintMode === 'none'
        ? !!(startDate && endDate)
        : (schedulePotential ? schedulePotential.projected_days > 0 : false))
    : eligibleCount >= targetDaysNum;

  const runApplyToCalendar = async (replacePlaceholdersChoice) => {
    setSaving(true);
    setError(null);
    try {
      const effectiveEndDate = mode === 'FIXED_END' ? endDate : (calculatedResult?.end_date || endDate);
      const effectiveTargetInstructionalDays = planConstraintMode === 'days'
        ? (parseInt(planTargetDays, 10) || TARGET_INSTRUCTIONAL_DAYS_DEFAULT)
        : TARGET_INSTRUCTIONAL_DAYS_DEFAULT;
      const year_name = buildPlanYearName({
        children,
        subjects: baseSubjectList,
        planForChildIds,
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
        constraint_mode: planConstraintMode,
        target_days: planConstraintMode === 'days' ? (parseInt(planTargetDays, 10) || null) : null,
        target_hours: planConstraintMode === 'hours' ? (parseFloat(planTargetHours) || null) : null,
        child_id: planForChildIds.length === 1 ? planForChildIds[0] : null,
        replace_placeholders: replacePlaceholdersChoice,
        blocks: blocks.length > 0 ? blocks.map((b) => ({
          block_id: b.block_id,
          subject_id: b.subject_id,
          child_ids: b.child_ids || [],
          weekdays: b.weekdays || [],
          start_time: b.start_time || '09:00',
          end_time: b.end_time || '10:00',
          all_day: b.all_day || false,
        })) : [],
        subject_targets: planHealth?.subject_targets ?? undefined,
        year_name,
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
      const skipped = data?.skipped_overlap ?? data?.totals?.skipped ?? 0;
      const skippedDates = Array.isArray(data?.skipped_dates) ? data.skipped_dates : [];
      let message;
      let toastType = 'success';
      if (added === 0 && skipped > 0) {
        const dateList = skippedDates.length > 0
          ? skippedDates.map((d) => (d && d.length >= 10 ? formatDateDisplay(d) : d)).join(', ')
          : '';
        message = dateList
          ? `No new events added. The scheduled time is already in use on ${dateList}. Try a different time in your plan.`
          : 'No new events added. The scheduled time is already in use on those days. Try a different time in your plan.';
        toastType = 'warning';
      } else if (skipped > 0) {
        const dateList = skippedDates.length > 0
          ? skippedDates.map((d) => (d && d.length >= 10 ? formatDateDisplay(d) : d)).join(', ')
          : '';
        message = dateList
          ? `${added} new lesson${added !== 1 ? 's' : ''} added. ${skipped} not added (time in use on ${dateList}).`
          : `${added} new lesson${added !== 1 ? 's' : ''} added. ${skipped} not added — time already in use.`;
        toastType = 'warning';
      } else {
        message = added === 1 ? '1 new lesson added' : `${added} new lessons added`;
      }
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
      // Refetch placeholder count so Danger Zone shows updated "Remove current plan including X slots" if user stays in modal
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
      setError('Add at least 1 child and 1 subject to generate a year plan.');
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
    if (blocks.length === 0 && selectedSubjectIds.length === 0) {
      setError('Select one subject in Who & Subjects, or add scheduled class days.');
      return;
    }
    if (blocks.length > 0 && blocks.some((b) => !b.subject_id)) {
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
    const studentIds = planForChildIds.length > 0 ? planForChildIds : (children || []).map((c) => c.id);
    if (!studentIds.length) {
      setError('Add at least one child in Who & subjects.');
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
          planForChildIds,
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
    const subj = subjectsForCurrentSelection?.find((s) => selectedSubjectIds.includes(s.id)) || subjectsForCurrentSelection?.[0];
    const block = {
      block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}`,
      subject_id: subj?.id || '',
      child_ids: planForChildIds.length > 0 ? [...planForChildIds] : [],
      weekdays: [],
      start_time: '09:00',
      end_time: '10:00',
      all_day: false,
    };
    setBlocks([...blocks, block]);
  };

  const addBlocksFromSubjects = () => {
    const ids = selectedSubjectIds?.length ? selectedSubjectIds : (subjectsForCurrentSelection?.[0] ? [subjectsForCurrentSelection[0].id] : []);
    const newBlocks = ids.slice(0, 10).map((subjectId) => ({
      block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${subjectId}`,
      subject_id: subjectId,
      child_ids: planForChildIds.length > 0 ? [...planForChildIds] : [],
      weekdays: [],
      start_time: '09:00',
      end_time: '10:00',
      all_day: false,
    }));
    setBlocks([...blocks, ...newBlocks]);
  };

  const cycleBlockSubject = (idx) => {
    const block = blocks[idx];
    const ids = selectedSubjectIds?.length ? selectedSubjectIds : (subjectsForCurrentSelection?.map((s) => s.id) || []);
    if (ids.length === 0) return;
    const i = ids.indexOf(block.subject_id);
    const next = ids[(i + 1) % ids.length];
    updateBlock(idx, { subject_id: next });
  };

  const removeBlock = (index) => {
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const updateBlock = (index, updates) => {
    setBlocks(blocks.map((b, i) => (i === index ? { ...b, ...updates } : b)));
  };

  const performClearPlan = async () => {
    if (!familyId) return;
    const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
    setClearingPlan(true);
    setError(null);
    try {
      const deletePlan = !!academicYearId;
      const { data, error: clearError } = await clearPlaceholders(familyId, academicYearId || undefined, { deletePlan });
      if (clearError) throw clearError;
      setExistingPlaceholdersCount(0);
      invalidatePlanHealthCache();
      onClose?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
        setTimeout(() => window.dispatchEvent(new CustomEvent('refreshCalendar')), 150);
      }
      if (isWeb) {
        window.alert(deletePlan && data?.plan_deleted
          ? `Plan and ${data?.deleted ?? 0} instructional slot${data?.deleted !== 1 ? 's' : ''} removed.`
          : `Removed ${data?.deleted ?? 0} instructional slot${data?.deleted !== 1 ? 's' : ''}. ${STRINGS.planMyYear.toasts.skippedFilled}`);
      } else {
        Alert.alert('Done', deletePlan && data?.plan_deleted
          ? `Plan and ${data?.deleted ?? 0} instructional slot${data?.deleted !== 1 ? 's' : ''} removed.`
          : `Removed ${data?.deleted ?? 0} instructional slot${data?.deleted !== 1 ? 's' : ''}. ${STRINGS.planMyYear.toasts.skippedFilled}`);
      }
    } catch (err) {
      setError(err?.message || err?.detail || 'Failed to remove plan');
    } finally {
      setClearingPlan(false);
    }
  };

  const handleClearPlan = async () => {
    if (!familyId) return;
    const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
    if (isWeb) {
      setShowClearConfirm(true);
      return;
    }
    const confirmClear = await new Promise((resolve) => {
      Alert.alert(
        'Remove generated placeholders?',
        'This removes only generated instructional slots. Scheduled lessons will remain.',
        [{ text: STRINGS.global.actions.cancel, style: 'cancel', onPress: () => resolve(false) }, { text: 'Remove placeholders', style: 'destructive', onPress: () => resolve(true) }]
      );
    });
    if (!confirmClear) return;
    await performClearPlan();
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
      setPlanForChildIds([]);
      setBlocks([]);
      setDismissedConflictKeys(new Set());
      setSchedulePotential(null);
      setStartDate('');
      setEndDate('');
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
    return (
      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={styles.modal} activeOpacity={1} onPress={() => {}}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.loadingText}>Checking setup...</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }

  const editPlanLoading = isHomeschool && (initialAcademicYearId || academicYearId) && loadedYearIdRef.current !== (initialAcademicYearId || academicYearId);
  const headerMetaRaw = editPlanLoading
    ? 'Loading…'
    : [startDate && endDate ? `${formatDateDisplay(startDate)} – ${formatDateDisplay(endDate)}` : null, planForChildIds.length > 0 ? planForChildIds.map((id) => (children || []).find((c) => String(c.id) === String(id))?.first_name || (children || []).find((c) => String(c.id) === String(id))?.name).filter(Boolean).join(', ') : null, effectiveSubjectIds?.length ? (baseSubjectList || []).filter((s) => effectiveSubjectIds.includes(s.id)).map((s) => s.name).slice(0, 3).join(', ') + (effectiveSubjectIds.length > 3 ? '…' : '') : null].filter(Boolean).join(' • ');
  const headerMeta = (headerMetaRaw && headerMetaRaw.trim() && headerMetaRaw.trim() !== '.') ? headerMetaRaw : null;
  const stepSourceComplete = true; // Choose method always has a selection (default: placeholders)
  const step0Complete = preconditionsMet;
  const step1Complete = effectiveSubjectIds.length > 0 && blocks.length >= effectiveSubjectIds.length;
  const step2Complete = !!startDate && (mode !== 'FIXED_END' || !!endDate);
  const step3Complete = false; // Breaks optional, always "future" until we're on it
  const completed = [stepSourceComplete, step0Complete, step1Complete, step2Complete, step3Complete];
  const currentStepIndex = completed.findIndex((c) => !c);
  const currentStep = currentStepIndex >= 0 ? currentStepIndex : 4;
  const sectionStepLabels = [
    STRINGS.planMyYear?.sections?.useASource?.title ?? 'Choose method',
    'Who & subjects',
    STRINGS.planMyYear.sections.blocks.title,
    STRINGS.planMyYear.sections.dates.title,
    STRINGS.planMyYear.sections.breaks.title,
  ];

  const pickerOnly = openForNewPlan && !academicYearId && !startCreatingNew;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          style={[
            styles.modal,
            pickerOnly && styles.pickerModal,
            pickerOnly && showPlanManagerView && styles.pickerModalPlanSummary,
            pickerOnly && (Platform.OS === 'web' ? { boxShadow: '0 10px 25px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.05)' } : { shadowOpacity: 0.08, elevation: 4 }),
          ]}
          activeOpacity={1}
          onPress={() => {}}
        >
          {!pickerOnly ? (
          <View style={styles.modalHeader}>
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
                  <Text style={[styles.breadcrumbStep, planStep === 'logistics' && styles.breadcrumbStepCurrent]}>2. Logistics</Text>
                  <Text style={[styles.breadcrumbSeparator]}>{'  ·  '}</Text>
                  <Text style={[styles.breadcrumbStep, planStep === 'preview' && styles.breadcrumbStepCurrent]}>3. Review</Text>
                </>
              )}
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
          ) : planStep === 'preview' ? (
            <View style={{ flex: 1, minHeight: 0 }}>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.contentContainer, { padding: 16 }]} showsVerticalScrollIndicator={true}>
                <Text style={[styles.sectionTitle, { marginBottom: 4 }]}>Preview instructional slots</Text>
                <Text style={[styles.mutedText, { marginBottom: 16 }]}>
                  {previewSlotLines.length} slot{previewSlotLines.length !== 1 ? 's' : ''} based on your date range and holidays & breaks.
                </Text>
                {previewSlotLines.map((line, idx) => (
                  <View key={`${line.date}-${line.subjectName}-${idx}`} style={{ paddingVertical: 12, paddingHorizontal: 0, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                    <Text style={[styles.label, { marginBottom: 2 }]}>{line.dateLabel} · {line.timeLabel}</Text>
                    <Text style={[styles.mutedText, { fontSize: 14 }]}>{line.subjectName}{line.childNames ? ` · ${line.childNames}` : ''}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : pickerOnly && !showPlanManagerView ? (
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
                    <Text style={styles.entryChoiceButtonSubtextPrimary}>Start with method, then logistics and review</Text>
                  </View>
                  {Platform.OS === 'web' && entryChoiceHoverKey === 'create' && (
                    <ArrowRight size={18} color="rgba(255,255,255,0.9)" style={{ marginLeft: 8 }} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          ) : pickerOnly && showPlanManagerView ? (
            <ScrollView style={styles.content} contentContainerStyle={styles.planListContentContainer} showsVerticalScrollIndicator={false}>
              <View style={styles.planListHeader}>
                <View style={styles.planListHeaderTextBlock}>
                  <Text style={styles.planListHeaderTitle}>YOUR PLANS</Text>
                  <Text style={styles.planListHeaderSubtitle}>Select to see details and/or make changes</Text>
                </View>
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
                <View style={{ gap: OPTION_GAP }}>
                  {(['placeholders', 'upload', 'paste']).map((key) => {
                    const opt = STRINGS.planMyYear?.sections?.useASource?.options?.[key];
                    const label = opt?.label ?? (key === 'placeholders' ? 'Add just a cadence for now' : key === 'upload' ? 'Upload material' : 'Paste list');
                    const description = opt?.description ?? '';
                    const isSelected = planSource === key;
                    const isHover = Platform.OS === 'web' && hoverSourceKey === key && !isSelected;
                    const IconComponent = key === 'placeholders' ? LayoutGrid : key === 'upload' ? Upload : List;
                    return (
                      <TouchableOpacity
                        key={key}
                        onPress={() => setPlanSource(key)}
                        activeOpacity={0.9}
                        style={[
                          styles.sourceOptionTile,
                          isSelected && styles.sourceOptionTileSelected,
                          isHover && styles.sourceOptionTileHover,
                        ]}
                        onMouseEnter={Platform.OS === 'web' ? () => setHoverSourceKey(key) : undefined}
                        onMouseLeave={Platform.OS === 'web' ? () => setHoverSourceKey(null) : undefined}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={[styles.sourceOptionRadioOuter, isSelected && styles.sourceOptionRadioSelected]}>
                          {isSelected ? <View style={styles.sourceOptionRadioInner} /> : null}
                        </View>
                        <View style={styles.sourceOptionIconWrap}>
                          <IconComponent size={18} color={MUTED} />
                        </View>
                        <View style={styles.sourceOptionBody}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                            <Text style={styles.sourceOptionTitle}>{label}</Text>
                            {key === 'placeholders' && (
                              <View style={styles.sourceOptionBadge}>
                                <Text style={styles.sourceOptionBadgeText}>Default</Text>
                              </View>
                            )}
                          </View>
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
                  })}
                </View>
                {planSource === 'paste' && (
                  <View style={[styles.inputGroup, { marginTop: 16 }]}>
                    <Text style={styles.label}>Plain text input</Text>
                    <TextInput
                      style={[styles.input, { marginTop: LABEL_INPUT_GAP, minHeight: 120, textAlignVertical: 'top' }]}
                      placeholder="Paste a list of dates and events; we'll create structured events here."
                      placeholderTextColor={MUTED}
                      value={pastedText}
                      onChangeText={setPastedText}
                      multiline
                      numberOfLines={5}
                      {...(Platform.OS === 'web' && { cursor: 'text' })}
                    />
                  </View>
                )}
                {planSource === 'upload' && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.label, { marginBottom: 8 }]}>Select material <Text style={{ color: ERROR }}>*</Text></Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12, width: '100%' }}>
                      <TouchableOpacity
                        ref={materialButtonRef}
                        {...(Platform.OS === 'web' ? { 'data-material-selector': 'true' } : {})}
                        style={{
                          flex: 1,
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
                        {loadingMaterials ? (
                          <Text style={[styles.mutedText, { fontSize: 14 }]}>Loading…</Text>
                        ) : (
                          <Text style={[styles.radioLabel, !selectedMaterialId && { color: MUTED }]} numberOfLines={1}>
                            {selectedMaterialId
                              ? (materials.find(m => m.id === selectedMaterialId)?.title || materials.find(m => m.id === selectedMaterialId)?.provider_name || 'Select material...')
                              : 'Select material...'}
                          </Text>
                        )}
                        <ChevronDown size={16} color={MUTED} />
                      </TouchableOpacity>
                      {selectedMaterialId && (
                        <TouchableOpacity
                          onPress={() => { setSelectedMaterialId(null); setError(null); }}
                          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: BORDER }}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={[styles.mutedText, { fontSize: 13 }]}>Clear</Text>
                        </TouchableOpacity>
                      )}
                    </View>
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
                              <Text style={[styles.mutedText, { padding: 12, fontSize: 13 }]}>No materials yet. Add one below.</Text>
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
                                    setError(null);
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
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                          const firstSubjectId = effectiveSubjectIds?.[0] ?? null;
                          const firstSubject = baseSubjectList?.find((s) => s.id === firstSubjectId);
                          window.dispatchEvent(new CustomEvent('openAddMaterialModal', {
                            detail: {
                              subjectId: firstSubjectId ?? undefined,
                              subjectName: firstSubject?.name ?? undefined,
                              childIds: planForChildIds.length > 0 ? planForChildIds : (children || []).map((c) => c.id),
                            },
                          }));
                        }
                      }}
                      style={[styles.editButton, { alignSelf: 'flex-start', marginTop: 4 }]}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={styles.editButtonText}>Upload or add material</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {/* Parsed content block for upload/link/paste: generate preview before Next */}
                {(planSource === 'upload' || planSource === 'link' || planSource === 'paste') && (
                  <View style={{ marginTop: 24 }}>
                    <Text style={[styles.label, { marginBottom: 8 }]}>Parsed content</Text>
                    {parsingContent ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 }}>
                        <ActivityIndicator size="small" color={ACCENT} />
                        <Text style={[styles.mutedText, { fontSize: 14 }]}>Parsing content…</Text>
                      </View>
                    ) : parseContentError ? (
                      <View>
                        <Text style={[styles.mutedText, { color: ERROR, marginBottom: 8 }]}>{parseContentError}</Text>
                        <TouchableOpacity
                          onPress={handleParseContent}
                          style={[styles.editButton, { alignSelf: 'flex-start' }]}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.editButtonText}>Try again</Text>
                        </TouchableOpacity>
                      </View>
                    ) : parsedContent ? (
                      <View style={{ paddingVertical: 12, paddingHorizontal: 0 }}>
                        <Text style={[styles.radioLabel, { marginBottom: 4 }]}>
                          {parsedContent.unit?.title || 'Unit'} · {parsedContent.lessons?.length ?? 0} lesson{(parsedContent.lessons?.length ?? 0) !== 1 ? 's' : ''}
                        </Text>
                        {parsedContent.lessons?.length > 0 && (
                          <View style={{ marginTop: 8, maxHeight: 160 }}>
                            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={true}>
                              {parsedContent.lessons.slice(0, 20).map((lesson, idx) => (
                                <Text key={idx} style={[styles.mutedText, { fontSize: 13, marginBottom: 4 }]} numberOfLines={1}>
                                  {idx + 1}. {lesson.title || 'Untitled lesson'}
                                </Text>
                              ))}
                              {(parsedContent.lessons?.length ?? 0) > 20 && (
                                <Text style={[styles.mutedText, { fontSize: 13 }]}>… and {(parsedContent.lessons?.length ?? 0) - 20} more</Text>
                              )}
                            </ScrollView>
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => { setParsedContent(null); setParseContentError(null); }}
                          style={[styles.editButton, { alignSelf: 'flex-start', marginTop: 8 }]}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text style={styles.editButtonText}>Parse again</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={handleParseContent}
                        style={[styles.primaryButton, { alignSelf: 'flex-start' }]}
                        disabled={(planSource === 'upload' && !selectedMaterialId) || (planSource === 'link' && !sourceUrl.trim()) || (planSource === 'paste' && !pastedText.trim())}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.primaryButtonText}>Parse content</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            </ScrollView>
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
                {/* Plan summary card: always show when editing an existing plan (current plan view) */}
                {academicYearId && (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Current Plan summary</Text>
                    <View style={{ borderTopWidth: 1, borderTopColor: CARD_BORDER, paddingTop: 12, marginTop: 6 }}>
                      {(yearLoadInProgress || loadedYearIdRef.current !== (initialAcademicYearId || academicYearId)) ? (
                        <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
                          <ActivityIndicator size="small" color={ACCENT} />
                          <Text style={[styles.loadingText, { marginTop: 8 }]}>Loading plan…</Text>
                        </View>
                      ) : planConstraintMode === 'days' ? (
                        <>
                          <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Target:</Text>
                            <Text style={styles.summaryValue}>{(planHealth?.target_days ?? parseInt(planTargetDays, 10)) || 0} days</Text>
                          </View>
                          <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Planned:</Text>
                            <Text style={styles.summaryValue}>{planHealth?.planned_days ?? 0} days</Text>
                          </View>
                          <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { marginBottom: 0 }]}>Over by:</Text>
                            <Text style={[styles.summaryValue, { color: (planHealth?.delta_days ?? 0) > 0 ? WARNING : (planHealth?.delta_days ?? 0) < 0 ? ERROR : MUTED }]}>
                              {(planHealth?.delta_days ?? 0) > 0 ? `+${planHealth.delta_days} days` : (planHealth?.delta_days ?? 0) < 0 ? `${planHealth.delta_days} days` : 'On target'}
                            </Text>
                          </View>
                          {(planHealth?.delta_days ?? 0) < 0 && (() => {
                            const shortfall = -planHealth.delta_days;
                            // Only use backend exact date to avoid flashing wrong date (e.g. 19th then 17th); no fallback until loaded
                            const suggestedEnd = (!extendSuggestionAccepted && startDate && endDate && schedulePotential?.suggested_end_date && schedulePotential.suggested_end_date >= endDate)
                              ? schedulePotential.suggested_end_date
                              : null;
                            const displayDate = extendSuggestionAccepted && acceptedExtendDate
                              ? acceptedExtendDate
                              : suggestedEnd;
                            if (!displayDate && !extendSuggestionAccepted) return (
                              <Text style={[styles.mutedText, { marginTop: 8, marginBottom: 0, fontSize: 13 }]}>
                                {computingPotential || !schedulePotential
                                  ? `You're ${shortfall} days short — calculating suggestion…`
                                  : `You're ${shortfall} days short — add class days or extend your end date to meet your target.`}
                              </Text>
                            );
                            if (extendSuggestionAccepted && acceptedExtendDate) {
                              return (
                                <View style={[styles.summaryRow, { marginTop: 8, alignItems: 'flex-start' }]}>
                                  <Text style={[styles.summaryLabel, { color: CHIP_SELECTED_TEXT, fontWeight: '600' }]}>Suggestion:</Text>
                                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                    <Text style={[styles.summaryValue, { color: CHIP_SELECTED_TEXT, textAlign: 'right' }]}>
                                      Extend end date to {new Date(acceptedExtendDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </Text>
                                    <View style={styles.suggestionAcceptButton}>
                                      <Check size={14} color={BG} />
                                      <Text style={styles.suggestionAcceptButtonText}>Change made!</Text>
                                    </View>
                                  </View>
                                </View>
                              );
                            }
                            return (
                              <View style={[styles.summaryRow, { marginTop: 8, alignItems: 'flex-start' }]}>
                                <Text style={[styles.summaryLabel, { color: CHIP_SELECTED_TEXT, fontWeight: '600' }]}>Suggestion:</Text>
                                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                  <Text style={[styles.summaryValue, { color: CHIP_SELECTED_TEXT, textAlign: 'right' }]}>
                                    Extend end date to {new Date(suggestedEnd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </Text>
                                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                                    <TouchableOpacity
                                      onPress={() => {
                                        setEndDate(suggestedEnd);
                                        setEndDateCalendarMonth(suggestedEnd ? new Date(suggestedEnd + 'T12:00:00') : new Date());
                                        setAcceptedExtendDate(suggestedEnd);
                                        setExtendSuggestionAccepted(true);
                                      }}
                                      style={styles.suggestionAcceptButtonPending}
                                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                    >
                                      <Check size={14} color={FG} />
                                      <Text style={styles.suggestionAcceptButtonTextPending}>Accept</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.suggestionAcceptHint}>Click to accept</Text>
                                  </View>
                                </View>
                              </View>
                            );
                          })()}
                          {planHealth?.delta_days > 0 && schedulePotential?.per_child && (() => {
                            const perChild = planHealth.per_child || {};
                            let worstChildId = null;
                            let worstDelta = 0;
                            for (const cid of Object.keys(perChild)) {
                              const d = perChild[cid]?.delta_days ?? 0;
                              if (d > worstDelta) { worstDelta = d; worstChildId = cid; }
                            }
                            const suggested = worstChildId && schedulePotential.per_child[worstChildId]?.suggested_end_date;
                            if (!suggested || !endDate || suggested > endDate) return null;
                            return (
                              <View style={[styles.summaryRow, { marginTop: 8, alignItems: 'flex-start' }]}>
                                <Text style={[styles.summaryLabel, { color: CHIP_SELECTED_TEXT, fontWeight: '600' }]}>Suggestion:</Text>
                                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                  <Text style={[styles.summaryValue, { color: CHIP_SELECTED_TEXT, textAlign: 'right' }]}>
                                    Shorten end date to {new Date(suggested + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </Text>
                                  {suggestionAccepted ? (
                                    <View style={styles.suggestionAcceptButton}>
                                      <Check size={14} color={BG} />
                                      <Text style={styles.suggestionAcceptButtonText}>Change made!</Text>
                                    </View>
                                  ) : (
                                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                                      <TouchableOpacity
                                        onPress={() => {
                                          setEndDate(suggested);
                                          setSuggestionAccepted(true);
                                        }}
                                        style={styles.suggestionAcceptButtonPending}
                                      >
                                        <Check size={14} color={FG} />
                                        <Text style={styles.suggestionAcceptButtonTextPending}>Accept</Text>
                                      </TouchableOpacity>
                                      <Text style={styles.suggestionAcceptHint}>Click to accept</Text>
                                    </View>
                                  )}
                                </View>
                              </View>
                            );
                          })()}
                        </>
                      ) : planConstraintMode === 'hours' && planHealth?.target_hours != null ? (
                        <>
                          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Target:</Text><Text style={styles.summaryValue}>{planHealth.target_hours} hours</Text></View>
                          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Planned:</Text><Text style={styles.summaryValue}>{planHealth.planned_hours ?? 0} hours</Text></View>
                          <View style={styles.summaryRow}>
                            <Text style={[styles.summaryLabel, { marginBottom: 0 }]}>Over by:</Text>
                            <Text style={[styles.summaryValue, { color: (planHealth.delta_hours ?? 0) > 0 ? WARNING : (planHealth.delta_hours ?? 0) < 0 ? ERROR : MUTED }]}>
                              {(planHealth.delta_hours ?? 0) > 0 ? `+${planHealth.delta_hours} hours` : (planHealth.delta_hours ?? 0) < 0 ? `${planHealth.delta_hours} hours` : 'On target'}
                            </Text>
                          </View>
                          {(planHealth.delta_hours ?? 0) < 0 && (
                            <Text style={[styles.mutedText, { marginTop: 8, marginBottom: 0, fontSize: 13 }]}>
                              You're {(-planHealth.delta_hours).toFixed(0)} hours short — add class days or extend your end date to meet your target.
                            </Text>
                          )}
                        </>
                      ) : planConstraintMode === 'none' ? (
                        <>
                          {headerMeta ? <Text style={[styles.summaryValue, { marginBottom: 4 }]}>{headerMeta}</Text> : null}
                          <Text style={[styles.mutedText, { fontSize: 13, marginTop: 4 }]}>No day/hour requirement set.</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                )}

                <View style={{ marginBottom: 10 }}>
                <View style={[styles.inputGroup, { marginBottom: 4 }]}>
                  <Text style={[styles.logisticsLabel]}>Assignee(s) <Text style={{ color: ERROR }}>*</Text></Text>
                  {children?.length > 0 && (
                    <Text style={[styles.logisticsLabel, { color: MUTED, marginTop: 2, marginBottom: 4 }]}>Choose one or multiple. Subject choices will update based on selection.</Text>
                  )}
                  <View style={styles.childChips}>
                    {children?.map((c) => {
                      const isSelected = planForChildIds.length === 0 || planForChildIds.includes(c.id);
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.childChip, isSelected && styles.childChipActive]}
                          onPress={() => {
                            if (planForChildIds.includes(c.id)) {
                              const next = planForChildIds.filter((id) => id !== c.id);
                              setPlanForChildIds(next);
                            } else {
                              setPlanForChildIds(planForChildIds.length === 0 ? [c.id] : [...planForChildIds, c.id]);
                            }
                          }}
                        >
                          <Text style={[styles.childChipText, isSelected && styles.childChipTextActive]}>
                            {c.first_name || c.name || 'Child'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
                <View style={[styles.inputGroup, { marginTop: 12, marginBottom: 0 }]}>
                  <Text style={[styles.logisticsLabel]}>Subjects <Text style={{ color: ERROR }}>*</Text></Text>
                  {!children?.length && (
                    <Text style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>Select assignee(s) first</Text>
                  )}
                  {children?.length > 0 && subjectsForCurrentSelection?.length === 0 && (
                    <Text style={{ fontSize: 13, color: MUTED, marginTop: 8 }}>No subjects for these assignees</Text>
                  )}
                  {children?.length > 0 && subjectsForCurrentSelection?.length > 0 && (
                    <>
                      <Text style={[styles.logisticsLabel, { color: MUTED, marginTop: 2, marginBottom: 4 }]}>Only one subject per plan.</Text>
                      <View style={[styles.childChips, styles.subjectsChipsRow]}>
                        {subjectsForCurrentSelection.map((s) => {
                          const isSelected = selectedSubjectIds.includes(s.id);
                          return (
                            <TouchableOpacity
                              key={s.id}
                              style={[styles.childChip, isSelected && styles.childChipActive]}
                              onPress={() => {
                                setSelectedSubjectIds(isSelected ? [] : [s.id]);
                              }}
                            >
                              <Text style={[styles.childChipText, isSelected && styles.childChipTextActive]}>
                                {s.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
                </View>

                <View style={[styles.inputGroup, { marginBottom: 4 }]}>
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

                {/* Compliance: collapsible, default collapsed */}
                <View style={styles.fieldSection}>
                  <TouchableOpacity
                    style={styles.collapsibleSectionHeader}
                    onPress={() => setComplianceCollapsed(!complianceCollapsed)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={[styles.fieldSectionLabel, { marginBottom: 0 }]}>Compliance</Text>
                    {complianceCollapsed ? <ChevronDown size={20} color={MUTED} /> : <ChevronUp size={20} color={MUTED} />}
                  </TouchableOpacity>
                  {!complianceCollapsed && (
                  <View style={[styles.inputGroup, { marginBottom: 0, marginTop: 10 }]}>
                    <View style={styles.radioRow}>
                      <TouchableOpacity
                        style={[styles.radioOption, planConstraintMode === 'none' && styles.radioOptionActive]}
                        onPress={() => setPlanConstraintMode('none')}
                      >
                        <Text style={[styles.radioLabel, planConstraintMode === 'none' && styles.radioLabelActive]}>None</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.radioOption, planConstraintMode === 'days' && styles.radioOptionActive]}
                        onPress={() => setPlanConstraintMode('days')}
                      >
                        <Text style={[styles.radioLabel, planConstraintMode === 'days' && styles.radioLabelActive]}>I need X instructional days</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.radioOption, planConstraintMode === 'hours' && styles.radioOptionActive]}
                        onPress={() => setPlanConstraintMode('hours')}
                      >
                        <Text style={[styles.radioLabel, planConstraintMode === 'hours' && styles.radioLabelActive]}>I need X instructional hours</Text>
                      </TouchableOpacity>
                    </View>
                    {planConstraintMode === 'days' && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.logisticsLabel, { marginBottom: 6 }]}>Target days</Text>
                        <TextInput
                          style={[styles.input, focusedInput === 'planTargetDays' && styles.inputFocused]}
                          value={planTargetDays}
                          onChangeText={setPlanTargetDays}
                          placeholder="180"
                          keyboardType="numeric"
                          placeholderTextColor={MUTED}
                          onFocus={() => setFocusedInput('planTargetDays')}
                          onBlur={() => setFocusedInput(null)}
                        />
                      </View>
                    )}
                    {planConstraintMode === 'hours' && (
                      <View style={{ marginTop: 12 }}>
                        <Text style={[styles.logisticsLabel, { marginBottom: 6 }]}>Target hours</Text>
                        <TextInput
                          style={[styles.input, focusedInput === 'planTargetHours' && styles.inputFocused]}
                          value={planTargetHours}
                          onChangeText={setPlanTargetHours}
                          placeholder="1000"
                          keyboardType="numeric"
                          placeholderTextColor={MUTED}
                          onFocus={() => setFocusedInput('planTargetHours')}
                          onBlur={() => setFocusedInput(null)}
                        />
                      </View>
                    )}
                  </View>
                  )}
                </View>

                {/* Holidays & breaks: collapsible, default collapsed */}
                <View style={styles.fieldSection}>
                  <TouchableOpacity
                    style={styles.collapsibleSectionHeader}
                    onPress={() => setHolidaysCollapsed(!holidaysCollapsed)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text style={[styles.fieldSectionLabel, { marginBottom: 0 }]}>Holidays & breaks</Text>
                    {holidaysCollapsed ? <ChevronDown size={20} color={MUTED} /> : <ChevronUp size={20} color={MUTED} />}
                  </TouchableOpacity>
                  {!holidaysCollapsed && (
                  <>
                  <View style={[styles.settingRowInline, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', marginTop: 10 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, flexWrap: 'wrap' }}>
                      <Text style={[styles.logisticsLabel, { marginBottom: 0, marginRight: 4 }]}>Follow </Text>
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
                        <Text style={[styles.logisticsLabel, { marginBottom: 0, color: followGlobalHolidays ? ACCENT : SUB, textDecorationLine: followGlobalHolidays ? 'underline' : 'none' }]}>U.S. public holidays</Text>
                      </TouchableOpacity>
                      <Text style={[styles.logisticsLabel, { marginBottom: 0, marginLeft: 4 }]}>?</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.customToggleTrack, followGlobalHolidays && styles.customToggleTrackOn]}
                      onPress={() => setFollowGlobalHolidays(!followGlobalHolidays)}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <View style={[styles.customToggleThumb, followGlobalHolidays && styles.customToggleThumbOn]} />
                    </TouchableOpacity>
                  </View>

                  {/* Custom Holidays */}
                  <View style={[styles.inputGroup, { marginBottom: 10 }]}>
                    <Text style={[styles.logisticsLabel]}>Custom holidays</Text>
                    <Text style={[styles.mutedText, { marginTop: 2, marginBottom: 8 }]}>e.g. March 8 Birthday</Text>
                  <View style={styles.holidayInputRow}>
                    <TouchableOpacity
                      style={[styles.datePickerTrigger, { flex: 1, marginRight: 8 }]}
                      onPress={() => {
                        setNewHolidayDateCalendarMonth(newHolidayDate ? dateStringToDate(newHolidayDate) : new Date());
                        setShowNewHolidayDatePicker(true);
                      }}
                    >
                      <Text style={[styles.datePickerTriggerText, !newHolidayDate && styles.datePickerPlaceholder]}>
                        {newHolidayDate ? formatDateDisplay(newHolidayDate) : 'Date'}
                      </Text>
                      <ChevronDown size={18} color={SUB} />
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.input, { flex: 2, marginRight: 8 }, focusedInput === 'newHolidayName' && styles.inputFocused]}
                      value={newHolidayName}
                      onChangeText={setNewHolidayName}
                      placeholder="Holiday name"
                      placeholderTextColor={MUTED}
                      onFocus={() => setFocusedInput('newHolidayName')}
                      onBlur={() => setFocusedInput(null)}
                    />
                    <TouchableOpacity
                      style={styles.holidayAddButton}
                      onPress={addCustomHoliday}
                    >
                      <Plus size={18} color="#ffffff" />
                    </TouchableOpacity>
                  </View>

                  {customHolidays.map((holiday, index) => (
                    <View key={index} style={styles.holidayItem}>
                      <Text style={styles.holidayDate}>{holiday.date}</Text>
                      <Text style={styles.holidayName}>{holiday.name}</Text>
                      <TouchableOpacity
                        onPress={() => removeCustomHoliday(index)}
                        style={styles.deleteButton}
                      >
                        <Trash2 size={16} color={ERROR} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  </View>

                  <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                    <Text style={[styles.logisticsLabel]}>Custom breaks (date ranges)</Text>
                    <Text style={[styles.mutedText, { marginTop: 2, marginBottom: 8 }]}>e.g. March 8-15 Family trip</Text>
                  <View style={styles.holidayInputRow}>
                    <TouchableOpacity
                      style={[styles.datePickerTrigger, { flex: 1, marginRight: 6 }]}
                      onPress={() => {
                        setNewBreakStartCalendarMonth(newBreakStart ? dateStringToDate(newBreakStart) : new Date());
                        setShowNewBreakStartPicker(true);
                      }}
                    >
                      <Text style={[styles.datePickerTriggerText, !newBreakStart && styles.datePickerPlaceholder]}>
                        {newBreakStart ? formatDateDisplay(newBreakStart) : 'Start'}
                      </Text>
                      <ChevronDown size={18} color={SUB} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.datePickerTrigger, { flex: 1, marginRight: 6 }]}
                      onPress={() => {
                        setNewBreakEndCalendarMonth(newBreakEnd ? dateStringToDate(newBreakEnd) : new Date());
                        setShowNewBreakEndPicker(true);
                      }}
                    >
                      <Text style={[styles.datePickerTriggerText, !newBreakEnd && styles.datePickerPlaceholder]}>
                        {newBreakEnd ? formatDateDisplay(newBreakEnd) : 'End'}
                      </Text>
                      <ChevronDown size={18} color={SUB} />
                    </TouchableOpacity>
                    <TextInput
                      style={[styles.input, { flex: 1, marginRight: 8 }, focusedInput === 'newBreakName' && styles.inputFocused]}
                      value={newBreakName}
                      onChangeText={setNewBreakName}
                      placeholder="Break name"
                      placeholderTextColor={MUTED}
                      onFocus={() => setFocusedInput('newBreakName')}
                      onBlur={() => setFocusedInput(null)}
                    />
                    <TouchableOpacity style={styles.holidayAddButton} onPress={addCustomBreak}>
                      <Plus size={18} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                  {customBreaks.map((br, index) => (
                    <View key={index} style={styles.holidayItem}>
                      <Text style={styles.holidayDate}>{br.start} – {br.end}</Text>
                      <Text style={styles.holidayName}>{br.name}</Text>
                      <TouchableOpacity onPress={() => removeCustomBreak(index)} style={styles.deleteButton}>
                        <Trash2 size={16} color={ERROR} />
                      </TouchableOpacity>
                    </View>
                  ))}
                  </View>
                  </>
                  )}
                </View>

                {/* Scheduled class days */}
                {effectiveSubjectIds.length > 0 && (
                  <View style={{ marginTop: 4, marginBottom: SECTION_SPACING }} onLayout={(e) => { scheduleSectionYRef.current = e.nativeEvent.layout.y; }}>
                      <View style={styles.scheduleBlocksInner}>
                      <Text style={[styles.logisticsLabel, { marginBottom: 8 }]}>Cadence <Text style={{ color: ERROR }}>*</Text></Text>
                      {blocks.map((block, idx) => {
                      const subj = baseSubjectList.find((s) => s.id === block.subject_id);
                      const weekdays = block.weekdays || [];
                      const conflictsForBlock = blockConflicts.filter((c) => c.blockIndexA === idx || c.blockIndexB === idx);
                      const conflictKey = (c) => `${Math.min(c.blockIndexA, c.blockIndexB)}-${Math.max(c.blockIndexA, c.blockIndexB)}-${c.childId}`;
                      const visibleConflicts = conflictsForBlock.filter((c) => !dismissedConflictKeys.has(conflictKey(c)));
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
                          <Text style={styles.blockRowSubject}>{subj?.name || 'Subject'}</Text>
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
                          {visibleConflicts.length > 0 && (
                            <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER, gap: 8 }}>
                              {visibleConflicts.map((c) => {
                                const key = conflictKey(c);
                                const otherIdx = c.blockIndexA === idx ? c.blockIndexB : c.blockIndexA;
                                const daysStr = (c.sharedDays || []).map((d) => WEEKDAY_LABELS[d] || '').filter(Boolean).join(', ');
                                return (
                                  <View key={key} style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                                    <Text style={{ fontSize: 12, color: '#b91c1c', fontWeight: '500', flex: 1, minWidth: 0 }}>
                                      Conflict: {c.childName} has {c.blockIndexA === idx ? c.subjectAName : c.subjectBName} and {c.blockIndexA === idx ? c.subjectBName : c.subjectAName} at same time{c.sharedDays?.length ? ` on ${daysStr}` : ''}.
                                    </Text>
                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                      <TouchableOpacity
                                        onPress={() => setDismissedConflictKeys((prev) => new Set(prev).add(key))}
                                        style={{ paddingVertical: 4, paddingHorizontal: 8 }}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <Text style={{ fontSize: 12, color: SUB }}>Ignore</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        onPress={() => {
                                          setSectionScheduleExpanded(true);
                                          setHighlightBlockIndex(otherIdx);
                                          setTimeout(() => setHighlightBlockIndex(null), 2500);
                                          scrollRef.current?.scrollTo({ y: scheduleSectionYRef.current - 24, animated: true });
                                        }}
                                        style={{ paddingVertical: 4, paddingHorizontal: 8 }}
                                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                                      >
                                        <Text style={{ fontSize: 12, color: ACCENT, fontWeight: '600' }}>Change</Text>
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                    </View>
                  </View>
                )}

                <View style={[styles.eligibilityCard, { marginTop: 12 }, blocks.length > 0 && schedulePotential && !computingPotential && !recalculating && styles.eligibilityCardTinted]}>
                    {blocks.length === 0 && (
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
                          {(planConstraintMode === 'days' && (schedulePotential.target_days ?? planTargetDays) != null) && (
                            <Text style={styles.eligibilityTargetMuted}>Target: {schedulePotential.target_days ?? planTargetDays} days</Text>
                          )}
                          {(planConstraintMode === 'hours' && (schedulePotential.target_hours ?? planTargetHours) != null) && (
                            <Text style={styles.eligibilityTargetMuted}>Target: {schedulePotential.target_hours ?? planTargetHours} hours</Text>
                          )}
                        </View>
                        <Text style={[styles.eligibilityCardSecondary, { marginTop: 2, fontSize: 12 }]}>
                          Based on selected cadence and date range.
                        </Text>
                        {followGlobalHolidays && (schedulePotential.days_excluded_holidays ?? 0) > 0 && (
                          <Text style={[styles.eligibilityCardSecondary, { marginTop: 4 }]}>
                            {schedulePotential.days_excluded_holidays === 1
                              ? '1 day excluded due to holiday'
                              : `${schedulePotential.days_excluded_holidays} days excluded due to holidays`}
                          </Text>
                        )}
                        {/* Exact days and times that will get slots */}
                        {previewSlotLines.length > 0 && (
                          <View style={{ marginTop: 12 }}>
                            <Text style={[styles.eligibilityCardSecondary, { marginBottom: 6, fontWeight: '600', color: SUB }]}>Slots to be created</Text>
                            <View style={{ maxHeight: 200 }}>
                              <ScrollView showsVerticalScrollIndicator={true} nestedScrollEnabled>
                                {previewSlotLines.map((line, idx) => (
                                  <Text key={`${line.date}-${line.subjectName}-${idx}`} style={[styles.eligibilityCardSecondary, { marginBottom: 2 }]}>
                                    {[line.dateLabel, line.timeLabel, line.subjectName].filter(Boolean).join(' ') || '—'}
                                  </Text>
                                ))}
                              </ScrollView>
                            </View>
                          </View>
                        )}
                        {/* No requirement: baseline / deleted lesson message — only when health is for this plan and there are still some placeholders (so "removed one" makes sense) */}
                        {planIdForHealth &&
                          existingPlaceholdersCount > 0 &&
                          planHealth?.academic_year_id === planIdForHealth &&
                          (!endDate || (planHealth?.end_date && planHealth.end_date.slice(0, 10) === endDate.slice(0, 10))) &&
                          planConstraintMode === 'none' &&
                          planHealth?.baseline_scheduled_days != null &&
                          planHealth.current_scheduled_days < planHealth.baseline_scheduled_days &&
                          planHealth.deleted_dates?.length > 0 && (
                          <Text style={[styles.eligibilityCardSecondary, { color: ERROR, marginTop: 6 }]}>
                            You removed an instructional slot on {new Date(planHealth.deleted_dates[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Schedule one to achieve your original total school days.
                          </Text>
                        )}
                        {/* Row B — Status pill + supporting (days mode) */}
                        {planConstraintMode === 'days' && schedulePotential.delta_days != null && (
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
                        {/* Hours mode: status pill + copy */}
                        {planConstraintMode === 'hours' && schedulePotential.delta_hours != null && (
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
                      </View>
                    )}
                  </View>

                {/* Danger Zone: only when editing an existing plan */}
                {academicYearId && (
                <View style={styles.dangerZone}>
                  <TouchableOpacity
                    style={styles.dangerZoneToggle}
                    onPress={() => {
                      const expanding = !showDangerZone;
                      setShowDangerZone(expanding);
                      if (expanding && scrollRef.current) {
                        setTimeout(() => {
                          scrollRef.current?.scrollToEnd({ animated: true });
                        }, 150);
                      }
                    }}
                  >
                    <AlertTriangle size={16} color={ERROR} />
                    <Text style={styles.dangerZoneTitle}>
                      {showDangerZone ? 'Hide' : 'Show'} Danger Zone
                    </Text>
                  </TouchableOpacity>

                  {showDangerZone && (
                    <View style={styles.dangerZoneContent}>
                      {existingPlaceholdersCount > 0 ? (
                        <TouchableOpacity
                          style={styles.clearPlanButton}
                          onPress={handleClearPlan}
                          disabled={clearingPlan}
                        >
                          {clearingPlan ? (
                            <ActivityIndicator size="small" color={ERROR} />
                          ) : (
                            <>
                              <Trash2 size={16} color={ERROR} />
                              <Text style={styles.clearPlanButtonText}>
                                Remove current plan including {existingPlaceholdersCount} instructional slots
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.mutedText}>No generated plan to remove.</Text>
                      )}
                    </View>
                  )}
                </View>
                )}
              </View>
            )}
          </ScrollView>
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
                        <Text style={[styles.mutedText, { padding: 16 }]}>No holidays in this date range.</Text>
                      )}
                    </ScrollView>
                  )}
                  <TouchableOpacity onPress={() => setShowPublicHolidaysPicker(false)} style={[styles.primaryButton, { marginTop: 16 }]} activeOpacity={0.9}>
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

          {/* Footer - Build Curriculum style: Cancel + rounded primary, no icons. Hidden on entry choice and when showing plan summary. */}
          {!(pickerOnly && !showPlanManagerView) && !planSummaryYearId && (
          <View style={[styles.footer, pickerOnly && styles.pickerFooter]}>
            {planStep === 'preview' ? (
              <>
                <TouchableOpacity onPress={() => setPlanStep('logistics')} style={styles.cancelButton}>
                  <Text style={styles.cancelText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryButton, (saving || loading || !preconditionsMet || !feasible) && styles.buttonDisabled]}
                  onPress={handleApplyToCalendar}
                  disabled={saving || loading || !preconditionsMet || !feasible}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={BG} />
                  ) : (
                    <Text style={styles.primaryButtonText}>{academicYearId ? STRINGS.planMyYear.primaryActions.updateSlots : STRINGS.planMyYear.primaryActions.generateSlots}</Text>
                  )}
                </TouchableOpacity>
              </>
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
            ) : planStep === 'source' ? (
              <>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.cancelButton}
                  onMouseEnter={Platform.OS === 'web' ? () => setFooterCancelHover(true) : undefined}
                  onMouseLeave={Platform.OS === 'web' ? () => setFooterCancelHover(false) : undefined}
                >
                  <Text style={[styles.cancelText, footerCancelHover && Platform.OS === 'web' && { textDecorationLine: 'underline' }]}>{STRINGS.global.actions.cancel}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    ((planSource === 'upload' && !selectedMaterialId) || (planSource === 'link' && !sourceUrl.trim()) || (planSource === 'paste' && !pastedText.trim()) || ((planSource === 'upload' || planSource === 'link' || planSource === 'paste') && !parsedContent)) ? styles.primaryButtonDisabled : undefined,
                  ]}
                  onPress={() => setPlanStep('logistics')}
                  disabled={(planSource === 'upload' && !selectedMaterialId) || (planSource === 'link' && !sourceUrl.trim()) || (planSource === 'paste' && !pastedText.trim()) || ((planSource === 'upload' || planSource === 'link' || planSource === 'paste') && !parsedContent)}
                >
                  <Text style={styles.primaryButtonText}>Next</Text>
                </TouchableOpacity>
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
                } else {
                  setPlanStep('source');
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
      </TouchableOpacity>
      <ConfirmDialog
        visible={showClearConfirm}
        title={STRINGS.planMyYear?.confirmations?.removeSlots?.title ?? 'Remove instructional slots?'}
        message={STRINGS.planMyYear?.confirmations?.removeSlots?.body ?? 'This removes only generated instructional slots. Scheduled lessons will remain.'}
        confirmLabel={STRINGS.planMyYear?.confirmations?.removeSlots?.confirmLabel ?? 'Remove instructional slots'}
        cancelLabel={STRINGS.global.actions.cancel}
        onConfirm={async () => {
          setShowClearConfirm(false);
          await performClearPlan();
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
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
    paddingHorizontal: 32,
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
  closeButtonFloating: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
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
  contentContainer: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  planListContentContainer: {
    paddingTop: 0,
    paddingBottom: 20,
    paddingLeft: 24,
    paddingRight: 24,
  },
  planListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 20,
    marginHorizontal: -24,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_SUBTLE,
    backgroundColor: SURFACE_ELEVATED,
  },
  planListHeaderTextBlock: {
    flex: 1,
  },
  planListHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: FG,
    textTransform: 'uppercase',
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planListHeaderSubtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#d1d5db',
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  customToggleTrackOn: {
    backgroundColor: '#AECBFA',
  },
  customToggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    ...(Platform.OS === 'web' && {
      transition: 'transform 0.2s ease',
    }),
  },
  customToggleThumbOn: {
    transform: [{ translateX: 22 }],
    backgroundColor: '#6BB3E8',
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
  /** Step 1: content zone padding */
  sourceStepContent: {
    paddingHorizontal: 28,
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
  dangerZone: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  dangerZoneToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dangerZoneTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: ERROR,
  },
  dangerZoneContent: {
    marginTop: 16,
  },
  clearPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  clearPlanButtonText: {
    fontSize: 13,
    color: ERROR,
    fontWeight: '500',
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
