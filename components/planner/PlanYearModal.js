/**
 * Plan Year Modal
 * Academic year planning with constraint solver and holiday management
 * 
 * Two paths:
 * 1. Non-homeschool fast path: Defaults + typical holidays
 * 2. Homeschool constraint solver: Pick 3 vars, compute 4th
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
  Plus, 
  Trash2, 
  Save,
  FileText,
  Clock,
  Target
} from 'lucide-react';
import { colors } from '../../theme/colors';
import {
  createDefaultAcademicYear,
  recalculateAcademicYear,
  saveAcademicYear,
  applyToCalendar,
  clearPlaceholders,
  syncGlobalHolidays,
  getAcademicYear,
  getPlanHealth,
  computeSchedulePotential,
} from '../../lib/services/academicYearClient';
import { supabase } from '../../lib/supabase';
const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const ACCENT = '#4285f4';
const ACCENT_LIGHT = '#e8f0fe';
const HIGHLIGHT_BG = '#dbeafe';
const HIGHLIGHT_BORDER = '#3b82f6';
const ERROR = '#ef4444';
const SUCCESS = '#10b981';

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

function toLocalYYYYMMDD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export default function PlanYearModal({
  visible,
  familyId,
  children = [],
  subjects = [],
  fullSubjects = [],
  onClose,
  onComplete,
  initialAcademicYearId = null,
  highlightFromPlanHealth = false,
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [loadError, setLoadError] = useState(null);
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

  // Phase 3: constraint mode + target (I need X days | X hours)
  const [planConstraintMode, setPlanConstraintMode] = useState('days');
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

  const recalculateTimeoutRef = useRef(null);
  const scrollRef = useRef(null);
  const scheduleSectionYRef = useRef(0);
  const datesSectionYRef = useRef(0);

  const baseSubjectList = Array.isArray(fullSubjects) && fullSubjects.length > 0 ? fullSubjects : subjects;
  const subjectsForCurrentSelection =
    planForChildId
      ? baseSubjectList.filter((s) => subjectMatchesChild(s, planForChildId))
      : baseSubjectList;
  const effectiveSubjectIds =
    useAllSubjects
      ? subjectsForCurrentSelection.map((s) => s.id)
      : selectedSubjectIds.filter((id) => subjectsForCurrentSelection.some((s) => s.id === id));

  // When modal opens (without an explicit academic year id), load latest academic year so "Apply again" replaces instead of duplicating
  useEffect(() => {
    if (!visible || !familyId) return;
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
  }, [visible, familyId]);

  // When opening from banner (Edit plan), sync passed academic year id so load effect runs
  useEffect(() => {
    if (visible && initialAcademicYearId) {
      console.log('[PlanYearModal] Syncing initialAcademicYearId into academicYearId', { initialAcademicYearId });
      setAcademicYearId(initialAcademicYearId);
    }
  }, [visible, initialAcademicYearId]);

  // When we have academicYearId, load full year + plan to populate form (for "Edit plan" from banner)
  const loadedYearIdRef = useRef(null);
  useEffect(() => {
    if (!visible || !academicYearId || !familyId) return;
    if (loadedYearIdRef.current === academicYearId) return;
    let cancelled = false;
    (async () => {
      console.log('[PlanYearModal] Loading academic year + plan', { academicYearId });
      const { data, error } = await getAcademicYear(academicYearId);
      console.log('[PlanYearModal] getAcademicYear result', { error, hasData: !!data, plan: data?.plan });
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
      loadedYearIdRef.current = academicYearId;
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
        setPlanConstraintMode(p.constraint_mode === 'hours' ? 'hours' : 'days');
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
          console.log('[PlanYearModal] Derived selection from plan', {
            subjectIdsFromPlan,
            distinctChildIds,
            planForChildIdNext: distinctChildIds.length === 1 ? distinctChildIds[0] : null,
          });
        }
        if (planBlocks.length > 0) {
          setBlocks(planBlocks.map((b) => ({
            block_id: b.block_id || (crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${b.subject_id}`),
            subject_id: b.subject_id,
            child_ids: Array.isArray(b.child_ids) ? b.child_ids : [],
            weekdays: Array.isArray(b.weekdays) ? b.weekdays : [1, 2, 3, 4, 5],
            start_time: b.start_time || '09:00',
            end_time: b.end_time || '10:00',
            all_day: !!b.all_day,
          })));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [visible, academicYearId, familyId]);
  useEffect(() => {
    if (!visible) {
      loadedYearIdRef.current = null;
      setLoadError(null);
      setPlanCreatedAt(null);
      setPlanUpdatedAt(null);
    }
  }, [visible]);

  // When opened from plan health (over-scheduled), scroll to schedule blocks and highlight sections 2 & 3
  useEffect(() => {
    if (!visible || !highlightFromPlanHealth) return;
    const t = setTimeout(() => {
      if (scrollRef.current && scheduleSectionYRef.current > 0) {
        scrollRef.current.scrollTo({ y: Math.max(0, scheduleSectionYRef.current - 24), animated: true });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [visible, highlightFromPlanHealth]);

  // Default selected subjects to all when modal opens (skip when opening with a specific plan so load can set subjects)
  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current && baseSubjectList.length > 0 && !initialAcademicYearId) {
      setSelectedSubjectIds(baseSubjectList.map((s) => s.id));
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
  useEffect(() => {
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
          weekdays: [1, 2, 3, 4, 5],
          start_time: '09:00',
          end_time: '10:00',
          all_day: false,
        };
      });
    });
  }, [effectiveSubjectIdsKey, effectiveSubjectIds.length, planForChildId]);

  // Compute schedule potential when blocks + date range + exclusions change
  const triggerSchedulePotential = useCallback(() => {
    if (schedulePotentialTimeoutRef.current) clearTimeout(schedulePotentialTimeoutRef.current);
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
            weekdays: b.weekdays || [1, 2, 3, 4, 5],
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
        if (!error && data) setSchedulePotential(data);
        else setSchedulePotential(null);
      } catch {
        setSchedulePotential(null);
      } finally {
        setComputingPotential(false);
      }
    }, 400);
  }, [familyId, startDate, endDate, blocks, customHolidays, customBreaks, planConstraintMode, planTargetDays, planTargetHours, planForChildId, children, planHealth?.subject_targets]);

  useEffect(() => {
    if (visible && blocks.length > 0 && startDate && endDate) {
      triggerSchedulePotential();
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

  useEffect(() => {
    if (!visible || !isUnderTarget || !familyId || !startDate || !endDate || blocks.length === 0 || subjectsForCurrentSelection?.length === 0) {
      setFlexSuggestion(null);
      return;
    }
    if (flexSuggestionTimeoutRef.current) clearTimeout(flexSuggestionTimeoutRef.current);
    flexSuggestionTimeoutRef.current = setTimeout(async () => {
      setComputingFlexSuggestion(true);
      setFlexSuggestion(null);
      try {
        // Least-loaded weekday: weekday with fewest blocks
        const wdayCount = {};
        [1, 2, 3, 4, 5].forEach((w) => { wdayCount[w] = 0; });
        blocks.forEach((b) => {
          (b.weekdays || [1, 2, 3, 4, 5]).forEach((w) => {
            if (wdayCount[w] != null) wdayCount[w] += 1;
          });
        });
        const leastLoaded = Object.keys(wdayCount).map(Number).reduce((a, b) => (wdayCount[a] <= wdayCount[b] ? a : b), 1);

        const flexSubject = subjectsForCurrentSelection?.find((s) => /flex|catch-up|catch up/i.test(s?.name || '')) || subjectsForCurrentSelection?.[0];
        const subjectId = flexSubject?.id || selectedSubjectIds?.[0] || subjectsForCurrentSelection?.[0]?.id;
        if (!subjectId) {
          setComputingFlexSuggestion(false);
          return;
        }
        const proposedBlock = {
          block_id: crypto.randomUUID ? crypto.randomUUID() : `flex-${Date.now()}`,
          subject_id: subjectId,
          child_ids: planForChildId ? [planForChildId] : [],
          weekdays: [leastLoaded],
          start_time: '10:00',
          end_time: '11:00',
          all_day: false,
          _displayName: 'Flex Learning / Catch-up',
        };
        const blocksWithProposed = [
          ...blocks.map((b) => ({ block_id: b.block_id, subject_id: b.subject_id, child_ids: b.child_ids || [], weekdays: b.weekdays || [1, 2, 3, 4, 5], start_time: b.start_time || '09:00', end_time: b.end_time || '10:00', all_day: b.all_day || false })),
          { block_id: proposedBlock.block_id, subject_id: proposedBlock.subject_id, child_ids: proposedBlock.child_ids, weekdays: proposedBlock.weekdays, start_time: proposedBlock.start_time, end_time: proposedBlock.end_time, all_day: proposedBlock.all_day },
        ];
        const { data } = await computeSchedulePotential({
          family_id: familyId,
          start_date: startDate,
          end_date: endDate,
          blocks: blocksWithProposed,
          custom_holidays: customHolidays.map((h) => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
          custom_breaks: (customBreaks || []).map((b) => ({ start: b.start, end: b.end, name: b.name || 'Break' })),
          target_days: planConstraintMode === 'days' ? (parseInt(planTargetDays, 10) || null) : null,
          target_hours: planConstraintMode === 'hours' ? (parseFloat(planTargetHours) || null) : null,
        });
        if (data) {
          const predDays = (data.projected_days ?? 0) - (schedulePotential.projected_days ?? 0);
          const predHours = (data.projected_hours ?? 0) - (schedulePotential.projected_hours ?? 0);
          setFlexSuggestion({ proposedBlock, predictedDays: predDays, predictedHours: predHours });
        }
      } catch {
        setFlexSuggestion(null);
      } finally {
        setComputingFlexSuggestion(false);
      }
    }, 300);
    return () => {
      if (flexSuggestionTimeoutRef.current) clearTimeout(flexSuggestionTimeoutRef.current);
    };
  }, [visible, isUnderTarget, familyId, startDate, endDate, blocks, customHolidays, customBreaks, subjectsForCurrentSelection, selectedSubjectIds, planForChildId, planConstraintMode, planTargetDays, planTargetHours, schedulePotential]);

  const handleApplyFlexSuggestion = useCallback(() => {
    if (flexSuggestion?.proposedBlock) {
      const { block_id, subject_id, child_ids, weekdays, start_time, end_time, all_day } = flexSuggestion.proposedBlock;
      setBlocks((prev) => [...prev, { block_id, subject_id, child_ids, weekdays, start_time, end_time, all_day }]);
      setFlexSuggestion(null);
    }
  }, [flexSuggestion]);

  // Fetch plan health when modal is open (for manual counted events panel)
  useEffect(() => {
    if (!visible || !familyId) {
      setPlanHealth(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await getPlanHealth(familyId);
      if (cancelled) return;
      if (!error && data) setPlanHealth(data);
      else setPlanHealth(null);
    })();
    return () => { cancelled = true; };
  }, [visible, familyId]);

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
  const targetDaysNum = TARGET_INSTRUCTIONAL_DAYS_DEFAULT;
  const feasible = blocks.length > 0 ? (schedulePotential ? schedulePotential.projected_days > 0 : false) : eligibleCount >= targetDaysNum;

  const runApplyToCalendar = async (replacePlaceholdersChoice) => {
    setSaving(true);
    setError(null);
    try {
      const effectiveEndDate = mode === 'FIXED_END' ? endDate : (calculatedResult?.end_date || endDate);
      const payload = {
        academic_year_id: academicYearId || undefined,
        family_id: familyId,
        start_date: startDate,
        end_date: effectiveEndDate,
        follow_public_holidays: followGlobalHolidays,
        holiday_region: regionCode ? `${countryCode}:${regionCode}` : countryCode,
        custom_holidays: customHolidays.map(h => ({ date: h.date, name: h.name, type: h.type || 'CUSTOM_HOLIDAY' })),
        custom_breaks: (customBreaks || []).map(b => ({ start: b.start, end: b.end, name: b.name || 'Break' })),
        target_instructional_days: targetDaysNum,
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
          weekdays: b.weekdays || [1, 2, 3, 4, 5],
          start_time: b.start_time || '09:00',
          end_time: b.end_time || '10:00',
          all_day: b.all_day || false,
        })) : [],
        subject_targets: planHealth?.subject_targets ?? undefined,
      };

      const { data, error: applyError } = await applyToCalendar(payload);
      if (applyError) throw applyError;

      const message = data?.totals
        ? `Updated ${data.totals.updated ?? 0}, added ${data.totals.inserted ?? 0}, removed ${data.totals.deleted ?? 0} placeholders across ${data?.planned_days ?? 0} days.`
        : `Created ${data?.created ?? 0} lesson placeholders across ${data?.planned_days ?? 0} days.`;
      Alert.alert('Success', message, [
        { text: 'OK', onPress: () => {
          onComplete?.();
          onClose();
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }},
      ]);
    } catch (err) {
      setError(err?.message || err?.detail || 'Failed to apply to calendar');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyToCalendar = async () => {
    if (!preconditionsMet) {
      setError('Add at least 1 child and 1 subject to generate a year plan.');
      return;
    }
    if (isHomeschool && !startDate) {
      setError('Start date is required');
      return;
    }
    if (isHomeschool && mode === 'FIXED_END' && !endDate) {
      setError('End date is required for fixed end mode');
      return;
    }
    if (isHomeschool && mode === 'TARGET_DAYS' && !targetDays) {
      setError('Target days is required');
      return;
    }
    if (isHomeschool && mode === 'TARGET_HOURS' && (!targetHours || !hoursPerDay)) {
      setError('Target hours and hours per day are required');
      return;
    }
    if (blocks.length === 0 && isHomeschool && !feasible) {
      setError('Not enough days. Add weekdays or extend end date.');
      return;
    }
    if (blocks.length === 0 && !useAllSubjects && selectedCount === 0) {
      setError('Select at least one subject, or add schedule blocks.');
      return;
    }
    if (blocks.length > 0 && blocks.some((b) => !b.subject_id)) {
      setError('Each block must have a subject. Remove or fix empty blocks.');
      return;
    }

    if (existingPlaceholdersCount > 0) {
      Alert.alert(
        'Replace placeholders?',
        'Replace existing placeholder lessons from your last plan? Your manual events will always be kept.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Replace', onPress: () => runApplyToCalendar(true) },
        ]
      );
      return;
    }

    await runApplyToCalendar(replacePlaceholders);
  };

  const handleSave = async (isDraft = false) => {
    if (isHomeschool && !startDate) {
      setError('Start date is required');
      return;
    }
    if (isHomeschool && mode === 'FIXED_END' && !endDate) {
      setError('End date is required for fixed end mode');
      return;
    }
    if (isHomeschool && mode === 'TARGET_DAYS' && !targetDays) {
      setError('Target days is required');
      return;
    }
    if (isHomeschool && mode === 'TARGET_HOURS' && (!targetHours || !hoursPerDay)) {
      setError('Target hours and hours per day are required');
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
        const input = {
          academic_year_id: academicYearId,
          mode,
          start_date: startDate,
          end_date: mode === 'FIXED_END' ? endDate : calculatedResult?.end_date,
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
        };
        const { data, error: saveErr } = await saveAcademicYear(input);
        if (saveErr) throw saveErr;
        if (data?.academic_year_id) setAcademicYearId(data.academic_year_id);
      }
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
      setError('Date and name are required');
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
      setError('Break start, end, and name are required');
      return;
    }
    if (newBreakStart > newBreakEnd) {
      setError('Break start must be before end');
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
      weekdays: [1, 2, 3, 4, 5],
      start_time: '09:00',
      end_time: '10:00',
      all_day: false,
    };
    setBlocks([...blocks, block]);
  };

  const addBlocksFromSubjects = () => {
    const ids = useAllSubjects ? (subjectsForCurrentSelection?.map((s) => s.id) || []) : (selectedSubjectIds?.length ? selectedSubjectIds : subjectsForCurrentSelection?.map((s) => s.id) || []);
    const wkd = [1, 2, 3, 4, 5];
    const newBlocks = ids.slice(0, 10).map((subjectId) => ({
      block_id: crypto.randomUUID ? crypto.randomUUID() : `block-${Date.now()}-${subjectId}`,
      subject_id: subjectId,
      child_ids: planForChildId ? [planForChildId] : [],
      weekdays: [...wkd],
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
    const confirmClear = await new Promise((resolve) => {
      Alert.alert(
        'Remove generated placeholders?',
        'This removes only generated placeholder lessons. Customized lessons will remain.',
        [{ text: 'Cancel', style: 'cancel', onPress: () => resolve(false) }, { text: 'Remove placeholders', style: 'destructive', onPress: () => resolve(true) }]
      );
    });
    if (!confirmClear) return;
    setClearingPlan(true);
    setError(null);
    try {
      const { data, error: clearError } = await clearPlaceholders(familyId, academicYearId || undefined);
      if (clearError) throw clearError;
      setExistingPlaceholdersCount(0);
      Alert.alert('Done', `Removed ${data?.deleted ?? 0} generated placeholder${data?.deleted !== 1 ? 's' : ''}. Customized lessons were kept.`, [
        { text: 'OK', onPress: () => {
          if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('refreshCalendar'));
        }},
      ]);
    } catch (err) {
      setError(err?.message || err?.detail || 'Failed to remove plan');
    } finally {
      setClearingPlan(false);
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setError(null);
      setCustomHolidays([]);
      setCustomBreaks([]);
      setPlanConstraintMode('days');
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
    }
  }, [visible]);

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

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <TouchableOpacity onPress={onClose} style={styles.closeButtonFloating} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <X size={22} color={FG} />
            </TouchableOpacity>

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

            {!isHomeschool ? (
              // Fast Path: Non-Homeschool
              <View>
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

                {followGlobalHolidays && (
                  <View style={styles.holidaySettingsRow}>
                    {fastPathYearId && (
                      <TouchableOpacity
                        style={styles.resyncButton}
                        onPress={async () => {
                          setLoading(true);
                          try {
                            const { error } = await syncGlobalHolidays(fastPathYearId);
                            if (error) throw error;
                            Alert.alert('Success', 'Holidays synced successfully');
                          } catch (err) {
                            setError(err.message || 'Failed to sync holidays');
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        <Text style={styles.resyncButtonText}>Resync holidays</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            ) : (
              // Homeschool Constraint Solver
              <View>
                {(planCreatedAt || planUpdatedAt) && (
                  <Text style={[styles.mutedText, { marginBottom: 12 }]}>
                    Plan created: {planCreatedAt ? new Date(planCreatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    {' · '}
                    Last updated: {planUpdatedAt ? new Date(planUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </Text>
                )}
                {/* Descriptive overage: overall per-child target; subject is explanatory. "Max is 4 days over the plan target (12 vs 8). Cats accounts for 12 of those days—try trimming end date to Mar 15." */}
                {planHealth?.delta_days != null &&
                  planHealth.delta_days > 0 &&
                  planHealth.per_child &&
                  (() => {
                    const targetDaysVal = (planHealth.target_days ?? parseInt(planTargetDays, 10)) || 0;
                    const subjectList = baseSubjectList || [];
                    if (!targetDaysVal || targetDaysVal <= 0) return null;
                    // Pick child with largest overall delta_days (over target)
                    const perChild = planHealth.per_child || {};
                    let worstChildId = null;
                    let worstDelta = 0;
                    for (const cid of Object.keys(perChild)) {
                      const ch = perChild[cid];
                      const delta = ch?.delta_days ?? 0;
                      if (delta > worstDelta) {
                        worstDelta = delta;
                        worstChildId = cid;
                      }
                    }
                    if (!worstChildId || worstDelta <= 0) return null;
                    const actualDays = perChild[worstChildId]?.planned_days ?? 0;
                    const bySubject = planHealth.per_child_subject?.[worstChildId] || {};
                    // Subject with largest planned_days as explanation
                    let topSubjectId = null;
                    let topSubjectDays = 0;
                    for (const sid of Object.keys(bySubject)) {
                      const d = bySubject[sid]?.planned_days ?? 0;
                      if (d > topSubjectDays) {
                        topSubjectDays = d;
                        topSubjectId = sid;
                      }
                    }
                    const child = (children || []).find((c) => String(c.id) === String(worstChildId));
                    const subject = subjectList.find((s) => String(s.id) === String(topSubjectId));
                    const childName = child?.first_name || child?.name || 'This child';
                    const subjectName = subject?.name || 'this subject';
                    // Child-aware suggested end date (only show if it would trim toward target)
                    const childSuggested = schedulePotential?.per_child?.[worstChildId]?.suggested_end_date;
                    const suggestedDisplay =
                      childSuggested && endDate && childSuggested <= endDate
                        ? new Date(childSuggested + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : null;
                    return (
                      <View style={{ marginBottom: 12, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: HIGHLIGHT_BG, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: HIGHLIGHT_BORDER }}>
                        <Text style={{ fontSize: 13, color: FG }}>
                          {childName} is {worstDelta} day{worstDelta !== 1 ? 's' : ''} over the plan target ({actualDays} vs {targetDaysVal}).
                          {topSubjectId ? ` ${subjectName} accounts for ${topSubjectDays} of those days` : ''}
                          —{suggestedDisplay ? ` try trimming the end date to ${suggestedDisplay} to hit the target.` : ' reduce days or times in Schedule Blocks (section 2) to fix.'}
                        </Text>
                      </View>
                    );
                  })()}
                {/* Subject goals: planned vs target per subject when subject_targets exist */}
                {planHealth?.per_child_subject &&
                  (() => {
                    const subjectList = baseSubjectList || [];
                    const childIds = planForChildId ? [planForChildId] : Object.keys(planHealth.per_child_subject || {});
                    const rows = [];
                    for (const cid of childIds) {
                      const bySubject = planHealth.per_child_subject[cid] || {};
                      for (const sid of Object.keys(bySubject)) {
                        const s = bySubject[sid];
                        const targetDays = s?.subject_target_days;
                        const targetHours = s?.subject_target_hours;
                        if (targetDays == null && targetHours == null) continue;
                        const plannedDays = s?.planned_days ?? 0;
                        const plannedHours = s?.planned_hours ?? 0;
                        const deltaDays = s?.subject_delta_days;
                        const deltaHours = s?.subject_delta_hours;
                        const subject = subjectList.find((x) => String(x.id) === String(sid));
                        const name = subject?.name || 'Subject';
                        const child = (children || []).find((c) => String(c.id) === String(cid));
                        const childLabel = planForChildId && child ? `${child?.first_name || child?.name || 'Child'}: ` : '';
                        let status = '';
                        if (targetDays != null && deltaDays != null) {
                          status = deltaDays > 0 ? ` (+${deltaDays})` : deltaDays < 0 ? ` (${deltaDays})` : ' ✓';
                        } else if (targetHours != null && deltaHours != null) {
                          status = deltaHours > 0 ? ` (+${Number(deltaHours).toFixed(0)}h)` : deltaHours < 0 ? ` (${Number(deltaHours).toFixed(0)}h)` : ' ✓';
                        }
                        const unit = targetDays != null ? ' days' : ' hours';
                        const plannedVal = targetDays != null ? plannedDays : Number(plannedHours);
                        const targetVal = targetDays != null ? targetDays : Number(targetHours);
                        rows.push({ key: `${cid}-${sid}`, label: `${childLabel}${name}`, plannedVal, targetVal, unit, isHours: targetHours != null, status });
                      }
                    }
                    if (rows.length === 0) return null;
                    return (
                      <View style={[styles.inputGroup, { marginBottom: 12 }]}>
                        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 8 }]}>Subject goals</Text>
                        {rows.map((r) => (
                          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                            <Text style={{ fontSize: 13, color: FG, flex: 1 }}>{r.label}</Text>
                            <Text style={{ fontSize: 13, color: SUB }}>
                              {r.isHours ? Number(r.plannedVal).toFixed(0) : r.plannedVal} / {r.isHours ? Number(r.targetVal).toFixed(0) : r.targetVal}{r.unit}
                            </Text>
                            {r.status ? <Text style={{ fontSize: 13, marginLeft: 6, color: r.status.includes('✓') ? SUCCESS : r.status.startsWith('+') ? ERROR : MUTED }}>{r.status}</Text> : null}
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                <Text style={[styles.sectionTitle, { marginTop: 0 }]}>1. WHO & SUBJECTS</Text>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Who are we planning for?</Text>
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
                    <Text style={styles.mutedText}>
                      This plan is for {children.length === 1
                        ? (children[0].first_name || children[0].name || 'your child') + '.'
                        : children.map((c) => c.first_name || c.name || 'Child').slice(0, -1).join(', ') + (children.length === 2 ? ' and ' : ', and ') + (children[children.length - 1].first_name || children[children.length - 1].name || 'Child') + '.'}
                </Text>
                  )}
                  {planForChildId !== null && children?.length > 1 && (
                    <View style={styles.childSelectRow}>
                      <Text style={styles.label}>Child</Text>
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
                  <View style={{ marginTop: 12 }}>
                    <TouchableOpacity
                      style={styles.preconditionButton}
                      onPress={() => {
                        if (Platform.OS === 'web' && typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('openAddChildModal'));
                        }
                      }}
                    >
                      <Plus size={14} color={ACCENT} />
                      <Text style={styles.preconditionButtonText}>Add child</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Which subjects? — All vs Specific (like child field) */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Which subjects should receive placeholders?</Text>
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
                    <Text style={styles.mutedText}>All {subjectsCount} subject{subjectsCount !== 1 ? 's' : ''} will receive placeholders.</Text>
                  )}
                  {subjectsForCurrentSelection.length === 0 && (
                    <Text style={styles.mutedText}>
                      {planForChildId ? 'No subjects assigned to this child. Add subjects in Profile or switch to Whole family plan.' : 'Add subjects above to select them.'}
                    </Text>
                  )}
                </View>

                <View style={{ marginTop: 12 }}>
                  <TouchableOpacity
                    style={styles.preconditionButton}
                    onPress={() => {
                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('openAddSubjectModal'));
                      }
                    }}
                  >
                    <Plus size={14} color={ACCENT} />
                    <Text style={styles.preconditionButtonText}>Add subject</Text>
                  </TouchableOpacity>
                </View>
                {!preconditionsMet && (
                  <View style={styles.preconditionWarning}>
                    <Text style={styles.preconditionWarningText}>
                      Add at least 1 child and 1 subject to generate a year plan.
                    </Text>
                  </View>
                )}

                {/* Schedule blocks: auto one per subject (require all) — right under Which subjects */}
                {effectiveSubjectIds.length > 0 && (
                  <>
                    <View
                      onLayout={(e) => { scheduleSectionYRef.current = e.nativeEvent.layout.y; }}
                      style={[
                        highlightFromPlanHealth && {
                          backgroundColor: HIGHLIGHT_BG,
                          borderLeftWidth: 4,
                          borderLeftColor: HIGHLIGHT_BORDER,
                          marginLeft: -20,
                          paddingLeft: 16,
                          borderRadius: 8,
                          marginBottom: 8,
                        },
                      ]}
                    >
                      <Text style={styles.sectionTitle}>2. SCHEDULE BLOCKS</Text>
                      {highlightFromPlanHealth && (
                        <Text style={[styles.mutedText, { marginBottom: 8 }]}>
                          Reduce days or times here to fix "extra days" — then check target in section 3 below.
                        </Text>
                      )}
                      <View style={styles.scheduleBlocksContainer}>
                      <Text style={styles.label}>When does each subject meet?</Text>
                      <Text style={styles.mutedText}>Set expected days and time for every subject. Used for preview and placeholders.</Text>
                      {blocks.map((block, idx) => {
                      const subj = baseSubjectList.find((s) => s.id === block.subject_id);
                      const weekdays = block.weekdays || [1, 2, 3, 4, 5];
                      return (
                        <View key={block.block_id} style={[styles.holidayItem, { flexDirection: 'column', alignItems: 'stretch' }]}>
                          <Text style={[styles.label, { marginBottom: 8 }]}>{subj?.name || 'Subject'}</Text>
                          <View style={{ marginBottom: 8 }}>
                            <Text style={[styles.mutedText, { fontSize: 12, marginBottom: 4 }]}>Days</Text>
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
                          </View>
                          {!block.all_day && (
                            <View style={styles.blockTimeRow}>
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
                                        borderWidth: 1,
                                        borderColor: BORDER,
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
                                        borderWidth: 1,
                                        borderColor: BORDER,
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
                      );
                    })}
                    </View>
                    </View>
                </>
                )}

                <View
                  onLayout={(e) => { datesSectionYRef.current = e.nativeEvent.layout.y; }}
                  style={[
                    highlightFromPlanHealth && {
                      backgroundColor: HIGHLIGHT_BG,
                      borderLeftWidth: 4,
                      borderLeftColor: HIGHLIGHT_BORDER,
                      marginLeft: -20,
                      paddingLeft: 16,
                      borderRadius: 8,
                      marginBottom: 8,
                    },
                  ]}
                >
                <Text style={styles.sectionTitle}>3. DATES & REQUIREMENTS</Text>
                {highlightFromPlanHealth && (
                  <Text style={[styles.mutedText, { marginBottom: 8 }]}>
                    Or lower "Target days" here to match your schedule.
                  </Text>
                )}
                <View style={styles.modeSelector}>
                  <TouchableOpacity
                    style={[styles.modeButton, mode === 'FIXED_END' && styles.modeButtonActive]}
                    onPress={() => setMode('FIXED_END')}
                  >
                    <Calendar size={16} color={mode === 'FIXED_END' ? ACCENT : SUB} />
                    <Text style={[styles.modeButtonText, mode === 'FIXED_END' && styles.modeButtonTextActive]}>
                      I know my end date
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modeButton, mode === 'TARGET_DAYS' && styles.modeButtonActive]}
                    onPress={() => setMode('TARGET_DAYS')}
                  >
                    <Target size={16} color={mode === 'TARGET_DAYS' ? ACCENT : SUB} />
                    <Text style={[styles.modeButtonText, mode === 'TARGET_DAYS' && styles.modeButtonTextActive]}>
                      I need X school days
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.modeButton, mode === 'TARGET_HOURS' && styles.modeButtonActive]}
                    onPress={() => setMode('TARGET_HOURS')}
                  >
                    <Clock size={16} color={mode === 'TARGET_HOURS' ? ACCENT : SUB} />
                    <Text style={[styles.modeButtonText, mode === 'TARGET_HOURS' && styles.modeButtonTextActive]}>
                      I need X hours
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Start Date and End Date on same row */}
                <View style={styles.dateRow}>
                  <View style={[styles.inputGroup, styles.inputGroupFlex]}>
                  <Text style={styles.label}>Start Date</Text>
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
                    <Text style={styles.label}>End Date</Text>
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
                    <Text style={styles.label}>Target Instructional Days</Text>
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
                      <Text style={styles.label}>Target Instructional Hours</Text>
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
                      <Text style={styles.label}>Hours per Instructional Day</Text>
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
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Your requirement</Text>
                  <Text style={styles.mutedText}>Target for instructional days or hours.</Text>
                  <View style={[styles.radioRow, { marginTop: 8 }]}>
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
                    <View style={{ marginTop: 8 }}>
                      <Text style={[styles.label, { marginBottom: 4 }]}>Target days</Text>
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
                    <View style={{ marginTop: 8 }}>
                      <Text style={[styles.label, { marginBottom: 4 }]}>Target hours</Text>
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

                </View>

                <Text style={styles.sectionTitle}>4. HOLIDAYS & BREAKS</Text>
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

                {followGlobalHolidays && (
                  <View style={styles.holidaySettingsRow}>
                    {academicYearId && (
                      <TouchableOpacity
                        style={styles.resyncButton}
                        onPress={async () => {
                          setLoading(true);
                          try {
                            const { error } = await syncGlobalHolidays(academicYearId);
                            if (error) throw error;
                            Alert.alert('Success', 'Holidays synced successfully');
                          } catch (err) {
                            setError(err.message || 'Failed to sync holidays');
                          } finally {
                            setLoading(false);
                          }
                        }}
                      >
                        <Text style={styles.resyncButtonText}>Resync holidays</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Custom Holidays */}
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Custom Holidays</Text>
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
                      style={styles.addButton}
                      onPress={addCustomHoliday}
                    >
                      <Plus size={18} color={BG} />
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

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Custom breaks (date ranges)</Text>
                  <Text style={styles.mutedText}>e.g. Oct 10–25 family trip</Text>
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
                    <TouchableOpacity style={styles.addButton} onPress={addCustomBreak}>
                      <Plus size={18} color={BG} />
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

                {/* Schedule potential preview (from blocks) — Phase 3: delta warnings */}
                {blocks.length > 0 && (
                  <View style={[styles.previewRow, { backgroundColor: ACCENT_LIGHT, padding: 12, borderRadius: 8, marginTop: 12 }]}>
                    {computingPotential && (
                      <>
                        <ActivityIndicator size="small" color={ACCENT} />
                        <Text style={[styles.previewText, { marginLeft: 8 }]}>Computing schedule potential...</Text>
                      </>
                    )}
                    {schedulePotential && !computingPotential && (
                      <View style={{ gap: 4 }}>
                        <Text style={[styles.previewSummary, { fontWeight: '600' }]}>
                          If we materialize your blocks: ~{schedulePotential.projected_days} days, ~{schedulePotential.projected_hours.toFixed(1)} hours
                        </Text>
                        {/* Phase 3: delta vs target — under = warning (action); over = informational */}
                        {planConstraintMode === 'days' && schedulePotential.delta_days != null && (
                          <Text
                            style={{
                              color: schedulePotential.delta_days >= 0 ? SUCCESS : ERROR,
                              fontSize: 13,
                              fontWeight: schedulePotential.delta_days < 0 ? '600' : '400',
                            }}
                          >
                            {schedulePotential.delta_days >= 0
                              ? `${schedulePotential.delta_days} days over your ${schedulePotential.target_days ?? planTargetDays}-day target`
                              : `${-schedulePotential.delta_days} days under your ${schedulePotential.target_days ?? planTargetDays}-day target — add blocks or extend schedule`}
                          </Text>
                        )}
                        {planConstraintMode === 'hours' && schedulePotential.delta_hours != null && (
                          <Text
                            style={{
                              color: schedulePotential.delta_hours >= 0 ? SUCCESS : ERROR,
                              fontSize: 13,
                              fontWeight: schedulePotential.delta_hours < 0 ? '600' : '400',
                            }}
                          >
                            {schedulePotential.delta_hours >= 0
                              ? `${schedulePotential.delta_hours.toFixed(0)} hours over your ${schedulePotential.target_hours ?? planTargetHours}-hour target`
                              : `${(-schedulePotential.delta_hours).toFixed(0)} hours under your ${schedulePotential.target_hours ?? planTargetHours}-hour target — add blocks or extend schedule`}
                          </Text>
                        )}
                        {/* Phase 4: Suggest Flex Learning when under target */}
                        {isUnderTarget && (
                          <View style={{ marginTop: 8 }}>
                            {computingFlexSuggestion ? (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <ActivityIndicator size="small" color={ACCENT} />
                                <Text style={[styles.previewText, { fontSize: 13 }]}>Computing suggestion...</Text>
                              </View>
                            ) : flexSuggestion ? (
                              <TouchableOpacity
                                style={[styles.addButton, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, alignSelf: 'flex-start', backgroundColor: ACCENT }]}
                                onPress={handleApplyFlexSuggestion}
                              >
                                <Plus size={18} color={BG} />
                                <Text style={{ color: BG, marginLeft: 8, fontWeight: '600' }}>
                                  Apply Flex Learning block
                                </Text>
                                <Text style={{ color: BG, marginLeft: 6, opacity: 0.9 }}>
                                  {planConstraintMode === 'days' && flexSuggestion.predictedDays > 0
                                    ? `+${flexSuggestion.predictedDays} days`
                                    : planConstraintMode === 'hours' && flexSuggestion.predictedHours > 0
                                      ? `+${flexSuggestion.predictedHours.toFixed(0)} hours`
                                      : ''}
                                </Text>
                              </TouchableOpacity>
                            ) : subjectsForCurrentSelection?.length === 0 ? (
                              <Text style={[styles.mutedText, { fontSize: 12 }]}>Add a subject to suggest Flex Learning.</Text>
                            ) : null}
                          </View>
                        )}
                        {/* Manual instructional events counted (plan health input) */}
                        {(planHealth?.manual_events_days != null && planHealth.manual_events_days > 0) ||
                         (planHealth?.manual_events_hours != null && planHealth.manual_events_hours > 0) ? (
                          <View style={[styles.inputGroup, { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER }]}>
                            <Text style={[styles.mutedText, { marginBottom: 6 }]}>
                              Manual instructional events counted this term: {planHealth.manual_events_days ?? 0} days
                              {(planHealth.manual_events_hours != null && planHealth.manual_events_hours > 0)
                                ? `, ${Number(planHealth.manual_events_hours).toFixed(0)} hours`
                                : ''}
                            </Text>
                            {typeof window !== 'undefined' && (
                              <TouchableOpacity
                                style={[styles.addButton, { alignSelf: 'flex-start' }]}
                                onPress={() => {
                                  window.dispatchEvent(new CustomEvent('viewCountedEvents', {
                                    detail: { academic_year_id: planHealth?.academic_year_id },
                                  }));
                                }}
                              >
                                <Text style={{ color: ACCENT, fontWeight: '600' }}>View counted events</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        ) : null}
                      </View>
                    )}
                  </View>
                )}

                {/* Preview panel (recalculate/constraint solver) */}
                {recalculating && (
                  <View style={styles.previewRow}>
                    <ActivityIndicator size="small" color={ACCENT} />
                    <Text style={styles.previewText}>Calculating...</Text>
                  </View>
                )}

                {calculatedResult && !recalculating && (
                  <View style={styles.previewRow}>
                    <Text style={styles.previewSummary}>
                      Eligible school days: {eligibleCount} • Planned: {Math.min(eligibleCount, targetDaysNum)} • Excluded: {excludedCount}
                    </Text>
                    {!feasible ? (
                      <Text style={styles.previewFeasibilityError}>
                        Not enough days. Add weekdays or extend end date.
                      </Text>
                    ) : (
                      <Text style={styles.previewFeasibilityOk}>
                        We'll schedule {Math.min(eligibleCount, targetDaysNum)} days; remaining available days stay open.
                      </Text>
                    )}
                  </View>
                )}

                {existingPlaceholdersCount > 0 && (
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
                        <Text style={styles.clearPlanButtonText}>Remove generated placeholders ({existingPlaceholdersCount})</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
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
          <View style={styles.footer}>
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
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modal: {
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: FG,
    marginBottom: 12,
    marginTop: 24,
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
  },
  customToggleTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
    padding: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  customToggleTrackOn: {
    backgroundColor: ACCENT_LIGHT,
  },
  customToggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      transition: 'transform 0.2s ease',
      boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
    }),
  },
  customToggleThumbOn: {
    transform: [{ translateX: 22 }],
  },
  holidaySettingsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  resyncButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#B8D7F9',
    borderRadius: 12,
    backgroundColor: BG,
  },
  resyncButtonText: {
    fontSize: 13,
    color: ACCENT,
    fontWeight: '600',
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
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    backgroundColor: BG,
  },
  modeButtonActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_LIGHT,
  },
  modeButtonText: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: ACCENT,
    fontWeight: '600',
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
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: BG,
  },
  weekdayChipSmallActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_LIGHT,
  },
  weekdayChipSmallText: {
    fontSize: 12,
    color: SUB,
    fontWeight: '500',
  },
  weekdayChipSmallTextActive: {
    color: ACCENT,
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
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    backgroundColor: BG,
  },
  radioOptionActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_LIGHT,
  },
  radioLabel: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
  },
  radioLabelActive: {
    color: ACCENT,
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
    marginTop: 6,
  },
  childChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    backgroundColor: BG,
  },
  childChipActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_LIGHT,
  },
  childChipText: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
  },
  childChipTextActive: {
    color: ACCENT,
  },
  subjectChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  subjectChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    backgroundColor: BG,
  },
  subjectChipActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_LIGHT,
  },
  subjectChipText: {
    fontSize: 13,
    color: SUB,
    fontWeight: '500',
  },
  subjectChipTextActive: {
    color: ACCENT,
  },
  mutedText: {
    fontSize: 13,
    color: MUTED,
    marginTop: 6,
  },
  clearPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: ERROR,
    borderRadius: 8,
    backgroundColor: BG,
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
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: ACCENT,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  primaryButtonText: {
    color: BG,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: SUB,
  },
});
