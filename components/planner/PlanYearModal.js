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
  Info
} from 'lucide-react';
import { colors } from '../../theme/colors';
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
} from '../../lib/services/academicYearClient';
import { supabase } from '../../lib/supabase';
const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const CARD_BORDER = '#E6EAF2';
const MUTED = '#9ca3af';
const ACCENT = '#4285f4';
const ACCENT_LIGHT = '#e8f0fe';
const HIGHLIGHT_BG = '#dbeafe';
const HIGHLIGHT_BORDER = '#3b82f6';
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
const SECTION_SPACING = 16;
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
    planForChildId,
    blocks = [],
    selectedSubjectIds = [],
    useAllSubjects,
    startDate,
    endDate,
  } = options;
  const child = planForChildId ? (children || []).find((c) => String(c.id) === String(planForChildId)) : null;
  const studentName = child ? (child.first_name || child.name || 'Student') : 'Whole family';
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
      ? useAllSubjects
        ? 'All subjects'
        : 'No subjects'
      : names.length > 2
        ? names.slice(0, 2).join(', ') + ` +${names.length - 2}`
        : names.join(', ') || 'Subjects';
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
  initialAcademicYearId = null,
  openForNewPlan = false,
  highlightFromPlanHealth = false,
}) {
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
  const [planForChildId, setPlanForChildId] = useState(null); // null = whole family
  const [useAllSubjects, setUseAllSubjects] = useState(true); // true = all subjects, false = specific (use selectedSubjectIds)
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]); // empty = all selected
  const [existingPlaceholdersCount, setExistingPlaceholdersCount] = useState(0);
  const [replacePlaceholders, setReplacePlaceholders] = useState(true);
  const [clearingPlan, setClearingPlan] = useState(false);
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
  const [sectionWhoExpanded, setSectionWhoExpanded] = useState(false);
  const [sectionScheduleExpanded, setSectionScheduleExpanded] = useState(false);
  const [sectionDatesExpanded, setSectionDatesExpanded] = useState(false);
  const [dismissedConflictKeys, setDismissedConflictKeys] = useState(() => new Set());
  const [highlightBlockIndex, setHighlightBlockIndex] = useState(null);

  const recalculateTimeoutRef = useRef(null);
  const scrollRef = useRef(null);
  const scheduleSectionYRef = useRef(0);
  const datesSectionYRef = useRef(0);
  const schedulePotentialFetchedRef = useRef(false);

  const baseSubjectList = Array.isArray(fullSubjects) && fullSubjects.length > 0 ? fullSubjects : subjects;
  const subjectsForCurrentSelection =
    planForChildId
      ? baseSubjectList.filter((s) => subjectMatchesChild(s, planForChildId))
      : baseSubjectList.filter((s) => subjectAppliesToAllChildren(s, children));
  const effectiveSubjectIds =
    useAllSubjects
      ? subjectsForCurrentSelection.map((s) => s.id)
      : selectedSubjectIds.filter((id) => subjectsForCurrentSelection.some((s) => s.id === id));

  const blockConflicts = useMemo(
    () => getBlockConflicts(blocks, children, baseSubjectList),
    [blocks, children, baseSubjectList]
  );

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
  const [startCreatingNew, setStartCreatingNew] = useState(false);

  // Fetch list of plans (academic years that have an academic_year_plan) for "Edit plan" picker
  const [previousPlans, setPreviousPlans] = useState([]);
  const [previousPlansLoading, setPreviousPlansLoading] = useState(true); // true so we don't skip to "create new" before fetch completes
  useEffect(() => {
    if (!visible || !openForNewPlan || !familyId) return;
    let cancelled = false;
    setPreviousPlansLoading(true);
    (async () => {
      const { data: planRows, error: planErr } = await supabase
        .from('academic_year_plan')
        .select('academic_year_id')
        .eq('family_id', familyId);
      if (cancelled || planErr || !planRows?.length) {
        if (!cancelled) {
          setPreviousPlansLoading(false);
          setPreviousPlans([]);
        }
        return;
      }
      const yearIds = planRows.map((r) => r.academic_year_id).filter(Boolean);
      const { data: rows, error: err } = await supabase
        .from('academic_years')
        .select('id, year_name, start_date, end_date, updated_at')
        .eq('family_id', familyId)
        .in('id', yearIds)
        .order('start_date', { ascending: false })
        .limit(20);
      if (!cancelled) {
        setPreviousPlansLoading(false);
        if (err) setPreviousPlans([]);
        else setPreviousPlans(Array.isArray(rows) ? rows : []);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, openForNewPlan, familyId]);

  // When no plan exists, open straight to the new plan form (skip the "No previous plans" picker screen)
  useEffect(() => {
    if (visible && openForNewPlan && !academicYearId && !previousPlansLoading && previousPlans.length === 0) {
      setStartCreatingNew(true);
    }
  }, [visible, openForNewPlan, academicYearId, previousPlansLoading, previousPlans.length]);

  // When we have academicYearId, load full year + plan to populate form (for "Edit plan" from banner)
  const loadedYearIdRef = useRef(null);
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
            setUseAllSubjects(false);
            setSelectedSubjectIds(subjectIdsFromPlan);
          }
          const childIdSet = new Set();
          planBlocks.forEach((b) => {
            (b.child_ids || []).forEach((cid) => {
              if (cid) childIdSet.add(cid);
            });
          });
          const distinctChildIds = Array.from(childIdSet);
          if (distinctChildIds.length === 1) {
            setPlanForChildId(distinctChildIds[0]);
          } else {
            setPlanForChildId(null);
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
    })();
    return () => { cancelled = true; };
  }, [visible, initialAcademicYearId, academicYearId, familyId]);
  useEffect(() => {
    if (!visible) {
      loadedYearIdRef.current = null;
      setLoadError(null);
      setPlanCreatedAt(null);
      setPlanUpdatedAt(null);
      setYearLoadInProgress(false);
      setStartCreatingNew(false);
      setPreviousPlansLoading(true); // so next open shows loading until plans are fetched (avoids "add new" right after creating a plan)
    }
  }, [visible]);

  // Default selected subjects to all when modal opens (skip when opening with a specific plan so load can set subjects)
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current && baseSubjectList.length > 0 && !initialAcademicYearId) {
      setSelectedSubjectIds(baseSubjectList.map((s) => s.id));
    }
    if (visible && !prevVisibleRef.current) {
      const isEditPlanMode = !!initialAcademicYearId;
      setSectionWhoExpanded(!isEditPlanMode);
      // Edit Plan: expand sections 2 (Scheduled Class Days) and 3 (Dates & Requirements); new plan: expand all
      setSectionScheduleExpanded(true);
      setSectionDatesExpanded(true);
    }
    if (!visible) {
      setSuggestionAccepted(false);
      setExtendSuggestionAccepted(false);
      setAcceptedExtendDate(null);
      setDismissedConflictKeys(new Set());
      setHighlightBlockIndex(null);
    }
    prevVisibleRef.current = visible;
  }, [visible, baseSubjectList, initialAcademicYearId]);

  // When switching to a specific child, prune selectedSubjectIds to only subjects for that child
  useEffect(() => {
    if (subjectsForCurrentSelection.length === 0) return;
    const validIds = new Set(subjectsForCurrentSelection.map((s) => s.id));
    setSelectedSubjectIds((prev) => (prev.some((id) => !validIds.has(id)) ? prev.filter((id) => validIds.has(id)) : prev));
  }, [planForChildId, subjectsForCurrentSelection]);

  // Auto-sync blocks to required subjects: one block per effective subject (require all)
  const effectiveSubjectIdsKey = effectiveSubjectIds.slice().sort().join(',');
  const syncBlocksFromEffectiveSubjects = useCallback(() => {
    if (effectiveSubjectIds.length === 0) {
      setBlocks([]);
      return;
    }
    const childIds = planForChildId ? [planForChildId] : [];
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
  }, [effectiveSubjectIdsKey, effectiveSubjectIds.length, planForChildId]);

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
        const planChildrenIds = planForChildId ? [planForChildId] : (children || []).map((c) => c.id).filter(Boolean);
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
  }, [familyId, startDate, endDate, blocks, customHolidays, customBreaks, planConstraintMode, planTargetDays, planTargetHours, planForChildId, children, planHealth?.subject_targets]);

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
        .eq('is_placeholder', true)
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
  const preconditionsMet = childrenCount > 0 && subjectsCount > 0 && (useAllSubjects || selectedCount > 0 || blocks.length > 0);

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
        planForChildId,
        blocks,
        selectedSubjectIds,
        useAllSubjects,
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
        custom_holidays: customHolidays.map(h => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
        custom_breaks: (customBreaks || []).map(b => ({ start: b.start, end: b.end, name: b.name || 'Break' })),
        target_instructional_days: effectiveTargetInstructionalDays,
        subjects: useAllSubjects ? subjectsForCurrentSelection.map((s) => s.id) : selectedSubjectIds,
        constraint_mode: planConstraintMode,
        target_days: planConstraintMode === 'days' ? (parseInt(planTargetDays, 10) || null) : null,
        target_hours: planConstraintMode === 'hours' ? (parseFloat(planTargetHours) || null) : null,
        child_id: planForChildId || null,
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

      const message = data?.totals
        ? `Updated ${data.totals.updated ?? 0}, added ${data.totals.inserted ?? 0}, removed ${data.totals.deleted ?? 0} placeholders across ${data?.planned_days ?? 0} days.`
        : `Created ${data?.created ?? 0} lesson placeholders across ${data?.planned_days ?? 0} days.`;
      loadedYearIdRef.current = null;
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
        // Tell open event modal to refetch so plan time updates show immediately (delay so DB commit is visible)
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('planAppliedToCalendar'));
        }, 350);
      }
      setTimeout(() => Alert.alert('Success', message), 0);
      setTimeout(() => {
        onCompleteRef.current?.();
        onCloseRef.current?.();
      }, 50);
    } catch (err) {
      const errMsg = err?.message || err?.detail || 'Failed to apply to calendar';
      setError(errMsg);
      loadedYearIdRef.current = null;
      setTimeout(() => Alert.alert('Apply failed', errMsg), 0);
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
    if (blocks.length === 0 && !useAllSubjects && selectedCount === 0) {
      setError('Select at least one subject in Who & Subjects, or add scheduled class days.');
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
          planForChildId,
          blocks,
          selectedSubjectIds,
          useAllSubjects,
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
    const subj = useAllSubjects ? subjectsForCurrentSelection?.[0] : (subjectsForCurrentSelection?.find((s) => selectedSubjectIds.includes(s.id)) || subjectsForCurrentSelection?.[0]);
    const block = {
      block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}`,
      subject_id: subj?.id || '',
      child_ids: planForChildId ? [planForChildId] : [],
      weekdays: [],
      start_time: '09:00',
      end_time: '10:00',
      all_day: false,
    };
    setBlocks([...blocks, block]);
  };

  const addBlocksFromSubjects = () => {
    const ids = useAllSubjects ? (subjectsForCurrentSelection?.map((s) => s.id) || []) : (selectedSubjectIds?.length ? selectedSubjectIds : subjectsForCurrentSelection?.map((s) => s.id) || []);
    const newBlocks = ids.slice(0, 10).map((subjectId) => ({
      block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${subjectId}`,
      subject_id: subjectId,
      child_ids: planForChildId ? [planForChildId] : [],
      weekdays: [],
      start_time: '09:00',
      end_time: '10:00',
      all_day: false,
    }));
    setBlocks([...blocks, ...newBlocks]);
  };

  const cycleBlockSubject = (idx) => {
    const block = blocks[idx];
    const ids = useAllSubjects ? (subjectsForCurrentSelection?.map((s) => s.id) || []) : (selectedSubjectIds?.length ? selectedSubjectIds : subjectsForCurrentSelection?.map((s) => s.id) || []);
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

  const handleClearPlan = async () => {
    if (!familyId) return;
    const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
    let confirmClear = false;
    if (isWeb) {
      confirmClear = window.confirm(
        'Remove generated placeholders? This removes only generated placeholder lessons. Customized lessons will remain.'
      );
    } else {
      confirmClear = await new Promise((resolve) => {
        Alert.alert(
          'Remove generated placeholders?',
          'This removes only generated placeholder lessons. Customized lessons will remain.',
          [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Remove placeholders', style: 'destructive', onPress: () => resolve(true) }]
        );
      });
    }
    if (!confirmClear) return;
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
          ? `Plan and ${data?.deleted ?? 0} placeholder${data?.deleted !== 1 ? 's' : ''} removed.`
          : `Removed ${data?.deleted ?? 0} generated placeholder${data?.deleted !== 1 ? 's' : ''}. Customized lessons were kept.`);
      } else {
        Alert.alert('Done', deletePlan && data?.plan_deleted
          ? `Plan and ${data?.deleted ?? 0} placeholder${data?.deleted !== 1 ? 's' : ''} removed.`
          : `Removed ${data?.deleted ?? 0} generated placeholder${data?.deleted !== 1 ? 's' : ''}. Customized lessons were kept.`);
      }
    } catch (err) {
      setError(err?.message || err?.detail || 'Failed to remove plan');
    } finally {
      setClearingPlan(false);
    }
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
      setPlanForChildId(null);
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
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <ActivityIndicator size="large" color={ACCENT} />
            <Text style={styles.loadingText}>Checking setup...</Text>
          </View>
        </View>
      </Modal>
    );
  }

  const editPlanLoading = isHomeschool && (initialAcademicYearId || academicYearId) && loadedYearIdRef.current !== (initialAcademicYearId || academicYearId);
  const headerMetaRaw = editPlanLoading
    ? 'Loading…'
    : [startDate && endDate ? `${formatDateDisplay(startDate)} – ${formatDateDisplay(endDate)}` : null, planForChildId ? (children || []).find((c) => String(c.id) === String(planForChildId))?.first_name || (children || []).find((c) => String(c.id) === String(planForChildId))?.name : null, effectiveSubjectIds?.length ? (baseSubjectList || []).filter((s) => effectiveSubjectIds.includes(s.id)).map((s) => s.name).slice(0, 3).join(', ') + (effectiveSubjectIds.length > 3 ? '…' : '') : null].filter(Boolean).join(' • ');
  const headerMeta = (headerMetaRaw && headerMetaRaw.trim() && headerMetaRaw.trim() !== '.') ? headerMetaRaw : null;
  const step0Complete = preconditionsMet;
  const step1Complete = effectiveSubjectIds.length > 0 && blocks.length >= effectiveSubjectIds.length;
  const step2Complete = !!startDate && (mode !== 'FIXED_END' || !!endDate);
  const step3Complete = false; // Breaks optional, always "future" until we're on it
  const completed = [step0Complete, step1Complete, step2Complete, step3Complete];
  const currentStepIndex = completed.findIndex((c) => !c);
  const currentStep = currentStepIndex >= 0 ? currentStepIndex : 3;
  const sectionStepLabels = ['Subjects', 'Schedule', 'Dates', 'Breaks'];

  const pickerOnly = openForNewPlan && !academicYearId && !startCreatingNew;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[styles.overlay, pickerOnly && styles.pickerOverlay]}>
        <View style={[styles.modal, pickerOnly && styles.pickerModal, pickerOnly && (Platform.OS === 'web' ? { boxShadow: '0 10px 25px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.05)' } : { shadowOpacity: 0.08, elevation: 4 })]}>
          {!pickerOnly && (
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <Text style={styles.modalHeaderTitle}>{openForNewPlan && !academicYearId ? 'Plan My Year' : 'Edit Plan'}</Text>
              {headerMeta != null && headerMeta !== '' ? <Text style={styles.modalHeaderMeta}>{headerMeta}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButtonHeader} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
              <X size={22} color={FG} />
            </TouchableOpacity>
          </View>
          )}
          {!pickerOnly && isHomeschool && (
            <View style={styles.sectionProgress}>
              {sectionStepLabels.map((label, i) => {
                const isCompleted = completed[i];
                const isCurrent = i === currentStep;
                const isFuture = !isCompleted && !isCurrent;
                const prefix = isCompleted ? '✓ ' : isCurrent ? '● ' : '';
                const safeLabel = (label != null && String(label).trim() !== '.') ? String(label) : (sectionStepLabels[i] || '');
                return (
                  <Text
                    key={safeLabel || i}
                    style={[
                      styles.sectionProgressStep,
                      isCompleted && styles.sectionProgressStepCompleted,
                      isCurrent && styles.sectionProgressStepCurrent,
                      isFuture && styles.sectionProgressStepFuture,
                    ]}
                  >
                    {`${prefix}${safeLabel}`}
                  </Text>
                );
              })}
            </View>
          )}

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

            {/* Picker-only initial view: EDIT PLAN header + plan cards + OR + Create new plan */}
            {pickerOnly && (
              <View style={styles.pickerBody}>
                {previousPlansLoading ? (
                  <View style={styles.pickerLoading}>
                    <ActivityIndicator size="small" color={ACCENT} />
                    <Text style={[styles.mutedText, { marginTop: 8 }]}>Loading previous plans…</Text>
                  </View>
                ) : previousPlans.length > 0 ? (
                  <>
                    <View style={styles.pickerHeader}>
                      <View style={{ marginRight: 8 }}>
                        <Calendar size={18} color={SUB} />
                      </View>
                      <Text style={styles.pickerTitle}>Edit plan</Text>
                    </View>
                    <View style={styles.pickerDivider} />
                    <View style={{ gap: 20 }}>
                      {previousPlans.map((ay) => {
                        const lines = parsePlanCardLines(ay);
                        return (
                          <TouchableOpacity
                            key={ay.id}
                            onPress={() => setAcademicYearId(ay.id)}
                            style={styles.planCard}
                            activeOpacity={0.85}
                            {...(Platform.OS === 'web' && {
                              cursor: 'pointer',
                              onMouseEnter: (e) => {
                                const node = e.currentTarget;
                                if (node) {
                                  node.style.borderColor = '#81C1E1';
                                  node.style.backgroundColor = '#F4FAFF';
                                }
                              },
                              onMouseLeave: (e) => {
                                const node = e.currentTarget;
                                if (node) {
                                  node.style.borderColor = '#E3EEF8';
                                  node.style.backgroundColor = '#F8FBFF';
                                }
                              },
                            })}
                          >
                            <Text style={styles.planCardLine1}>{lines.line1}</Text>
                            {lines.line2 ? <Text style={styles.planCardLine2}>{lines.line2}</Text> : null}
                            {lines.line3 ? <Text style={styles.planCardLine3}>{lines.line3}</Text> : null}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <>
                    <View style={styles.pickerHeader}>
                      <View style={{ marginRight: 8 }}>
                        <Calendar size={18} color={SUB} />
                      </View>
                      <Text style={styles.pickerTitle}>Edit plan</Text>
                    </View>
                    <View style={styles.pickerDivider} />
                    <Text style={[styles.mutedText, { marginBottom: 16 }]}>No previous plans. Create your first year plan.</Text>
                    <TouchableOpacity
                      onPress={() => setStartCreatingNew(true)}
                      style={styles.pickerCreateButton}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={styles.pickerCreateButtonText}>Create new plan</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            {!pickerOnly && (
            isHomeschool && (initialAcademicYearId || academicYearId) && (loadedYearIdRef.current !== (initialAcademicYearId || academicYearId) || yearLoadInProgress) ? (
              <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={ACCENT} />
                <Text style={styles.loadingText}>Loading plan…</Text>
              </View>
            ) : !isHomeschool ? (
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
                {/* Plan summary card: only when editing an existing plan, not when creating new */}
                {academicYearId && (planHealth?.target_days != null || planHealth?.target_hours != null) && (
                  <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Current Plan summary</Text>
                    <View style={{ borderTopWidth: 1, borderTopColor: CARD_BORDER, paddingTop: 12, marginTop: 6 }}>
                      {planConstraintMode === 'days' && (
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
                      )}
                      {planConstraintMode === 'hours' && planHealth?.target_hours != null && (
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
                      )}
                    </View>
                  </View>
                )}

                <View style={styles.card}>
                <TouchableOpacity
                  style={styles.collapsibleHeader}
                  onPress={() => setSectionWhoExpanded(!sectionWhoExpanded)}
                  activeOpacity={0.7}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.sectionTitle}>1. WHO & SUBJECTS</Text>
                  {sectionWhoExpanded ? <ChevronUp size={20} color={MUTED} /> : <ChevronDown size={20} color={MUTED} />}
                </TouchableOpacity>
                {sectionWhoExpanded && (
                <>
                {!academicYearId && (
                  <Text style={[styles.mutedText, { marginBottom: 20 }]}>
                    You can create multiple plans and edit or delete previous plans at any time. Make edits to subjects or children in the Family tab. Whole family plans only include subjects that are attached to all children.
                  </Text>
                )}
                <View style={Platform.OS === 'web' ? styles.twoColumnRow : undefined}>
                  <View style={Platform.OS === 'web' ? styles.twoColumnHalf : undefined}>
                <View style={[styles.inputGroup, { marginBottom: 12 }]}>
                  <Text style={[styles.label, { fontSize: 15 }]}>Who are we planning for?</Text>
                  <View style={styles.radioRow}>
                    <TouchableOpacity
                      style={[styles.radioOption, planForChildId === null && styles.radioOptionActive]}
                      onPress={() => setPlanForChildId(null)}
                    >
                      <Text style={[styles.radioLabel, planForChildId === null && styles.radioLabelActive]}>Whole family plan</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.radioOption, planForChildId !== null && styles.radioOptionActive]}
                      onPress={() => setPlanForChildId(children?.[0]?.id ?? null)}
                    >
                      <Text style={[styles.radioLabel, planForChildId !== null && styles.radioLabelActive]}>Specific child</Text>
                    </TouchableOpacity>
                  </View>
                  {planForChildId === null && children?.length > 0 && (
                    <Text style={[styles.mutedText, { marginTop: 8 }]}>
                      This plan is for {children.length === 1
                        ? (children[0].first_name || children[0].name || 'your child') + '.'
                        : children.map((c) => c.first_name || c.name || 'Child').slice(0, -1).join(', ') + (children.length === 2 ? ' and ' : ', and ') + (children[children.length - 1].first_name || children[children.length - 1].name || 'Child') + '.'}
                </Text>
                  )}
                  {planForChildId !== null && children?.length > 1 && (
                    <View style={styles.childSelectRow}>
                      <Text style={styles.label}>Children</Text>
                      <View style={styles.childChips}>
                        {children.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            style={[styles.childChip, planForChildId === c.id && styles.childChipActive]}
                            onPress={() => setPlanForChildId(c.id)}
                          >
                            <Text style={[styles.childChipText, planForChildId === c.id && styles.childChipTextActive]}>
                              {c.first_name || c.name || 'Child'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}
                </View>
                  </View>

                  <View style={Platform.OS === 'web' ? styles.twoColumnHalf : undefined}>
                <View style={[styles.inputGroup, { marginBottom: 0 }]}>
                  <Text style={[styles.label, { fontSize: 15 }]}>Which subjects should receive placeholders?</Text>
                  <View style={styles.radioRow}>
                    <TouchableOpacity
                      style={[styles.radioOption, useAllSubjects && styles.radioOptionActive]}
                      onPress={() => setUseAllSubjects(true)}
                    >
                      <Text style={[styles.radioLabel, useAllSubjects && styles.radioLabelActive]}>All subjects</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.radioOption, !useAllSubjects && styles.radioOptionActive]}
                      onPress={() => {
                        setUseAllSubjects(false);
                        if (selectedSubjectIds.length === 0 && subjectsForCurrentSelection?.length > 0) {
                          setSelectedSubjectIds(subjectsForCurrentSelection.map((s) => s.id));
                        }
                      }}
                    >
                      <Text style={[styles.radioLabel, !useAllSubjects && styles.radioLabelActive]}>Specific subjects</Text>
                    </TouchableOpacity>
                  </View>
                  {!useAllSubjects && subjectsForCurrentSelection?.length > 0 && (
                    <View style={styles.subjectSelectRow}>
                      <Text style={styles.label}>Subjects</Text>
                      <View style={styles.subjectChips}>
                        {subjectsForCurrentSelection.map((s) => {
                          const isSelected = selectedSubjectIds.includes(s.id);
                          return (
                            <TouchableOpacity
                              key={s.id}
                              style={[styles.subjectChip, isSelected && styles.subjectChipActive]}
                              onPress={() => {
                                setSelectedSubjectIds(prev =>
                                  isSelected ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                );
                              }}
                            >
                              <Text style={[styles.subjectChipText, isSelected && styles.subjectChipTextActive]}>
                                {s.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {useAllSubjects && subjectsCount > 0 && (
                    <Text style={[styles.mutedText, { marginTop: 8 }]}>
                      {subjectsForCurrentSelection.map((s) => s.name || 'Subject').join(', ')} will receive placeholders.
                    </Text>
                  )}
                  {subjectsForCurrentSelection.length === 0 && (
                    <Text style={[styles.mutedText, { marginTop: 8 }]}>
                      {planForChildId ? 'No subjects assigned to this child. Add subjects in Profile or switch to Whole family plan.' : 'Add subjects above to select them.'}
                    </Text>
                  )}
                </View>
                  </View>
                </View>
                {!preconditionsMet && (
                  <View style={styles.preconditionWarning}>
                    <Text style={styles.preconditionWarningText}>
                      Add at least 1 child and 1 subject to generate a year plan.
                    </Text>
                  </View>
                )}
                </>
                )}
                </View>

                {/* Scheduled class days */}
                {effectiveSubjectIds.length > 0 && (
                  <View style={styles.card} onLayout={(e) => { scheduleSectionYRef.current = e.nativeEvent.layout.y; }}>
                      <TouchableOpacity
                        style={styles.collapsibleHeader}
                        onPress={() => setSectionScheduleExpanded(!sectionScheduleExpanded)}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <Text style={styles.sectionTitle}>2. SCHEDULED CLASS DAYS</Text>
                        {sectionScheduleExpanded ? <ChevronUp size={20} color={MUTED} /> : <ChevronDown size={20} color={MUTED} />}
                      </TouchableOpacity>
                      {sectionScheduleExpanded && (
                      <View style={styles.scheduleBlocksInner}>
                      <Text style={[styles.mutedText, { marginBottom: 20 }]}>Set expected days and time for every subject. For the purpose of totaling instructional hours, we will use the time frame to calculate totals.</Text>
                      <Text style={[styles.label, { marginBottom: 12, fontSize: 15 }]}>When does each subject meet?</Text>
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
                      )}
                  </View>
                )}

                <View style={styles.card} onLayout={(e) => { datesSectionYRef.current = e.nativeEvent.layout.y; }}>
                <TouchableOpacity
                  style={styles.collapsibleHeader}
                  onPress={() => setSectionDatesExpanded(!sectionDatesExpanded)}
                  activeOpacity={0.7}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                <Text style={styles.sectionTitle}>3. DATES & REQUIREMENTS</Text>
                {sectionDatesExpanded ? <ChevronUp size={20} color={MUTED} /> : <ChevronDown size={20} color={MUTED} />}
                </TouchableOpacity>
                {sectionDatesExpanded && (
                <>
                {/* Start Date and End Date on same row */}
                <View style={[styles.dateRow, { marginTop: 12 }]}>
                  <View style={[styles.inputGroup, styles.inputGroupFlex]}>
                  <Text style={[styles.label, { fontSize: 15 }]}>Start Date</Text>
                    <TouchableOpacity
                      style={styles.datePickerTrigger}
                      onPress={() => {
                        setStartDateCalendarMonth(startDate ? dateStringToDate(startDate) : new Date());
                        setShowStartDatePicker(true);
                      }}
                    >
                      <Text style={[styles.datePickerTriggerText, !startDate && styles.datePickerPlaceholder]}>
                        {startDate ? formatDateDisplay(startDate) : 'Select date'}
                      </Text>
                      <ChevronDown size={18} color={SUB} />
                    </TouchableOpacity>
                </View>
                {mode === 'FIXED_END' && (
                    <View style={[styles.inputGroup, styles.inputGroupFlex]}>
                    <Text style={[styles.label, { fontSize: 15 }]}>End Date</Text>
                      <TouchableOpacity
                        style={styles.datePickerTrigger}
                        onPress={() => {
                          setEndDateCalendarMonth(endDate ? dateStringToDate(endDate) : new Date());
                          setShowEndDatePicker(true);
                        }}
                      >
                        <Text style={[styles.datePickerTriggerText, !endDate && styles.datePickerPlaceholder]}>
                          {endDate ? formatDateDisplay(endDate) : 'Select date'}
                        </Text>
                        <ChevronDown size={18} color={SUB} />
                      </TouchableOpacity>
                  </View>
                )}
                </View>

                {/* Target Days (TARGET_DAYS mode) */}
                {mode === 'TARGET_DAYS' && (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.label, { fontSize: 15 }]}>Target Instructional Days</Text>
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
                      <Text style={[styles.label, { fontSize: 15 }]}>Target Instructional Hours</Text>
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
                      <Text style={[styles.label, { fontSize: 15 }]}>Hours per Instructional Day</Text>
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

                {/* Your requirement: target for block-driven flow (days/hours) */}
                <View style={[styles.inputGroup, { marginBottom: 4 }]}>
                  <Text style={[styles.label, { fontSize: 15, marginBottom: 8 }]}>Your requirement</Text>
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
                    <View style={{ marginTop: 20 }}>
                      <Text style={[styles.label, { marginBottom: 8, fontSize: 15 }]}>Target days</Text>
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
                    <View style={{ marginTop: 20 }}>
                      <Text style={[styles.label, { marginBottom: 8, fontSize: 15 }]}>Target hours</Text>
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

                </>
                )}

                </View>

                <View style={styles.card}>
                <TouchableOpacity
                  style={styles.collapsibleHeader}
                  onPress={() => setHolidaysCollapsed(!holidaysCollapsed)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sectionTitle}>4. HOLIDAYS & BREAKS</Text>
                  {holidaysCollapsed ? <ChevronDown size={20} color={MUTED} /> : <ChevronUp size={20} color={MUTED} />}
                </TouchableOpacity>
                {!holidaysCollapsed && (
                <>
                <View style={[styles.settingRowInline, { flexDirection: 'column', alignItems: 'flex-start', marginBottom: 12 }]}>
                  <Text style={[styles.label, { fontSize: 15, marginBottom: 4 }]}>Follow U.S. public holidays?</Text>
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
                <View style={[styles.inputGroup, { marginBottom: 12 }]}>
                  <Text style={[styles.label, { fontSize: 15 }]}>Custom Holidays</Text>
                  <Text style={[styles.mutedText, { marginTop: 2, marginBottom: 12 }]}>e.g. March 8 Birthday</Text>
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
                  <Text style={[styles.label, { fontSize: 15 }]}>Custom breaks (date ranges)</Text>
                  <Text style={[styles.mutedText, { marginTop: 2, marginBottom: 12 }]}>e.g. March 8-15 Family trip</Text>
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

                {/* Eligibility summary card — empty state or result */}
                <View style={[styles.eligibilityCard, { marginTop: 0 }]}>
                    {blocks.length === 0 && (
                      <View style={styles.eligibilityCardEmpty}>
                        <View style={styles.eligibilityChipRow}>
                          <Info size={14} color={MUTED} />
                          <Text style={styles.eligibilityChipText}>Waiting for schedule</Text>
                        </View>
                        <Text style={styles.eligibilityCardTitle}>Eligibility summary</Text>
                        <Text style={styles.eligibilityCardMain}>Add class days to calculate your balance.</Text>
                        <Text style={styles.eligibilityCardSecondary}>Once schedule days are set, we'll show if you meet your target.</Text>
                      </View>
                    )}
                    {blocks.length > 0 && (!startDate || !endDate) && !schedulePotential && !computingPotential && !recalculating && (
                      <View style={styles.eligibilityCardEmpty}>
                        <View style={styles.eligibilityChipRow}>
                          <Info size={14} color={MUTED} />
                          <Text style={styles.eligibilityChipText}>Waiting for schedule</Text>
                        </View>
                        <Text style={styles.eligibilityCardTitle}>Eligibility summary</Text>
                        <Text style={styles.eligibilityCardMain}>Add class days to calculate your balance.</Text>
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
                        {/* Row A — Summary */}
                        <View style={styles.eligibilitySummaryRow}>
                          <Text style={styles.eligibilitySummaryNumber}>{eligibleCount ?? schedulePotential.projected_days ?? 0} eligible days</Text>
                          {(planConstraintMode === 'days' && (schedulePotential.target_days ?? planTargetDays) != null) && (
                            <Text style={styles.eligibilityTargetMuted}>Target: {schedulePotential.target_days ?? planTargetDays} days</Text>
                          )}
                          {(planConstraintMode === 'hours' && (schedulePotential.target_hours ?? planTargetHours) != null) && (
                            <Text style={styles.eligibilityTargetMuted}>Target: {schedulePotential.target_hours ?? planTargetHours} hours</Text>
                          )}
                        </View>
                        {/* No requirement: baseline / deleted lesson message — only when health is for this plan (id + date range match) */}
                        {planIdForHealth &&
                          planHealth?.academic_year_id === planIdForHealth &&
                          (!endDate || (planHealth?.end_date && planHealth.end_date.slice(0, 10) === endDate.slice(0, 10))) &&
                          planConstraintMode === 'none' &&
                          planHealth?.baseline_scheduled_days != null &&
                          planHealth.current_scheduled_days < planHealth.baseline_scheduled_days &&
                          planHealth.deleted_dates?.length > 0 && (
                          <Text style={[styles.eligibilityCardSecondary, { color: ERROR, marginTop: 6 }]}>
                            You deleted a lesson on {new Date(planHealth.deleted_dates[0] + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, schedule one to achieve original scheduled total school days.
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
                                Remove current plan including {existingPlaceholdersCount} lessons
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
            )
            )}
          </ScrollView>

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

          {/* Footer - Build Curriculum style: Cancel + rounded primary, no icons */}
          <View style={[styles.footer, pickerOnly && styles.pickerFooter]}>
            {pickerOnly ? (
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
            ) : (
              <>
            <TouchableOpacity
              onPress={onClose}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            {isHomeschool ? (
            <TouchableOpacity
                style={[
                  styles.primaryButton,
                  (saving || loading || !preconditionsMet || !feasible) && styles.buttonDisabled,
                ]}
                onPress={handleApplyToCalendar}
                disabled={saving || loading || !preconditionsMet || !feasible}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={BG} />
                ) : (
                  <Text style={styles.primaryButtonText}>Apply to calendar</Text>
                )}
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
        </View>
      </View>
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
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  pickerOverlay: {
    ...(Platform.OS === 'web' && { backdropFilter: 'blur(3px)' }),
  },
  pickerModal: {
    maxWidth: 520,
    width: '100%',
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 24,
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
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: FG,
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
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...(Platform.OS === 'web' && {
      transition: 'border-color 0.2s ease, background-color 0.2s ease',
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
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: PICKER_CREATE_BG,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(129,193,225,.25)',
      transition: 'background-color 0.2s ease, transform 0.2s ease',
    }),
  },
  pickerCreateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  pickerFooter: {
    justifyContent: 'flex-end',
    gap: 12,
  },
  pickerCancelText: {
    color: PICKER_OR_COLOR,
    fontWeight: '500',
  },
  modal: {
    width: Platform.OS === 'web' ? 720 : '100%',
    maxWidth: '100%',
    width: 720,
    maxWidth: '100%',
    maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
    backgroundColor: BG,
    borderRadius: 16,
    ...Platform.select({
      web: {
        boxShadow: '0 10px 20px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 8,
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: CARD_PADDING,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: CARD_BORDER,
    backgroundColor: BG,
  },
  modalHeaderLeft: { flex: 1, minWidth: 0 },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: FG,
    marginBottom: 2,
  },
  modalHeaderMeta: {
    fontSize: 13,
    color: MUTED,
  },
  closeButtonHeader: { padding: 6, marginRight: -6 },
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: FG,
    marginBottom: 4,
    marginTop: 0,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  description: {
    fontSize: 13,
    color: SUB,
    marginBottom: 20,
    lineHeight: 20,
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
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: FG,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  },
  datePickerPlaceholder: {
    fontSize: 14,
    color: MUTED,
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
    fontSize: 14,
    fontWeight: '600',
    color: FG,
  },
  blockRowLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  blockTimeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(Platform.OS === 'web' && { marginLeft: 'auto' }),
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 0,
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
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    backgroundColor: BG,
  },
  weekdayChipSmallActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  weekdayChipSmallText: {
    fontSize: 12,
    color: SUB,
    fontWeight: '500',
  },
  weekdayChipSmallTextActive: {
    color: '#6BB3E8',
    fontWeight: '700',
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
  },
  holidayName: {
    flex: 1,
    fontSize: 13,
    color: FG,
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
  radioLabel: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
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
    marginTop: LABEL_INPUT_GAP,
  },
  childChip: {
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
  childChipActive: {
    backgroundColor: CHIP_SELECTED_BG,
    borderColor: CHIP_SELECTED_BORDER,
    ...(Platform.OS === 'web' && { boxShadow: '0 1px 2px rgba(107,179,232,0.2)' }),
  },
  childChipText: { fontSize: 13, color: SUB, fontWeight: '500' },
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
  subjectChipText: { fontSize: 13, color: SUB, fontWeight: '500' },
  subjectChipTextActive: { color: CHIP_SELECTED_TEXT, fontWeight: '700' },
  mutedText: {
    fontSize: 13,
    color: MUTED,
    marginTop: 6,
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
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 16,
    gap: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  cancelText: {
    color: MUTED,
    fontSize: 14,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: PRIMARY_BTN,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      cursor: 'pointer',
    }),
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
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
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ELIGIBILITY_CARD_BORDER,
    backgroundColor: ELIGIBILITY_CARD_BG,
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
  },
  eligibilityCardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    width: '100%',
    marginBottom: 4,
  },
  eligibilityCardMain: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    width: '100%',
  },
  eligibilityCardSecondary: {
    fontSize: 13,
    color: MUTED,
    marginTop: 2,
    width: '100%',
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
  },
  eligibilityTargetMuted: {
    fontSize: 13,
    color: MUTED,
    marginTop: 10,
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
