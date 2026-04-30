import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, TextInput, Alert } from 'react-native';
import { ChevronDown, ChevronUp, Plus, Trash2, CheckCircle, AlertTriangle, BookOpen, Library, SlidersHorizontal, FileText, Calendar, Sparkles, Upload, Pencil, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
import { getMaterials } from '../lib/services/materialsClient';
import { useSession } from '../contexts/SessionContext';
import ReactDOM from 'react-dom';
import AddMaterialModal from './materials/AddMaterialModal';
import ManualCurriculumBuilderModal from './ManualCurriculumBuilderModal';
import ParsePlainTextModal from './ParsePlainTextModal';
import BuildCurriculumModal from './planner/modals/BuildCurriculumModal';
import { parseChildIds } from '../lib/services/subjectsClient';
import { getFamilyPlannerSettings, saveFamilyPlannerSettings } from '../lib/services/plannerSettingsClient';
import { fetchSubjectCurriculumEventsStructure } from '../lib/services/curriculumClient';
import { useModalStackElevation } from './hooks/useModalStackElevation';
import ConfirmDialog from './ConfirmDialog';
import { PLANNING_PREFERENCES_UI } from './planner/planningPreferencesUiCopy';
import { deriveRoleFromTags, DOCUMENT_ROLES } from '../lib/docs/roles';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import { ModalSectionCard } from './ui/ModalSectionCard';
import {
  deleteSubjectCascade,
  dispatchSubjectDeletedSideEffects,
} from '../lib/services/deleteSubjectCascade';

const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

/** Matches child / grade chips and primary actions (light blue). */
const PLANNING_CHIP_SELECTED = {
  border: '#6BB3E8',
  background: 'rgba(133, 196, 242, 0.2)',
};

const MATERIAL_SLOT = { SYLLABUS: 'syllabus', LESSON_PLAN: 'lesson_plan' };

function materialEligibleForSyllabusPicker(m) {
  const r = deriveRoleFromTags(m.tags);
  return r == null || r === DOCUMENT_ROLES.SYLLABUS;
}

function materialEligibleForLessonPicker(m) {
  const r = deriveRoleFromTags(m.tags);
  return r == null || r === DOCUMENT_ROLES.LESSON_PLAN;
}

// School year options: 2025/26 through 2040/41 (16 years)
function getSchoolYearOptions() {
  const options = [];
  for (let y = 2025; y <= 2040; y++) {
    options.push(`${y}/${String(y + 1).slice(-2)}`);
  }
  return options;
}
const SCHOOL_YEAR_OPTIONS = getSchoolYearOptions();
const TERM_OPTIONS = [
  { id: 'full_year', label: 'Full year' },
  { id: 'fall_term', label: 'Fall term' },
  { id: 'spring_term', label: 'Spring term' },
];
const MODE_OPTIONS = ['home', 'online', 'outside', 'travel'];
const CALENDAR_CONNECTION_OPTIONS = [
  { value: 'google', label: 'Google' },
  { value: 'apple', label: 'Apple' },
];

const parsePositiveIntOrNull = (value) => {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const parsePositiveFloatOrNull = (value) => {
  const n = parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
};

const normalizeCalendarTargets = (raw) => {
  if (Array.isArray(raw)) return raw.map((v) => String(v).toLowerCase()).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).toLowerCase()).filter(Boolean);
    } catch (_) {
      return [];
    }
  }
  return [];
};

// Default school year follows academic year starting in August (e.g. Apr 2026 -> 2025/26).
function getDefaultSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const startYear = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function getDefaultSchoolTerm() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  return month >= 8 ? 'fall_term' : 'spring_term';
}

function normalizeLessonYmd(dateVal) {
  if (dateVal == null || dateVal === '') return null;
  const s = String(dateVal).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export default function AddSubjectModal({ 
  visible, 
  onClose, 
  onSubjectAdded,
  familyId,
  defaultChildId = null,
  defaultChildIds = [],
  defaultSubjectName = null,
  initialSchoolYear = null,
  initialSchoolTerm = null,
  subject = null, // If provided, edit mode
  children: propChildren = [] // Pre-loaded children from parent
}) {
  const [subjectName, setSubjectName] = useState(defaultSubjectName || '');
  const [subjectNameInputFocused, setSubjectNameInputFocused] = useState(false);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [grade, setGrade] = useState(GRADE_OPTIONS[0] || '');
  const [schoolYear, setSchoolYear] = useState(initialSchoolYear || getDefaultSchoolYear());
  const [showSchoolYearDropdown, setShowSchoolYearDropdown] = useState(false);
  const [schoolTerm, setSchoolTerm] = useState(initialSchoolTerm || getDefaultSchoolTerm());
  const [showSchoolTermDropdown, setShowSchoolTermDropdown] = useState(false);
  const [credits, setCredits] = useState('');
  const [defaultTargetDays, setDefaultTargetDays] = useState('');
  const [defaultTargetHours, setDefaultTargetHours] = useState('');
  const [logisticalLocation, setLogisticalLocation] = useState('');
  const [logisticalMode, setLogisticalMode] = useState('');
  const [logisticalInstructor, setLogisticalInstructor] = useState('');
  const [connectedCalendarTargets, setConnectedCalendarTargets] = useState([]);
  const [goalModeForSubject, setGoalModeForSubject] = useState('overall'); // 'overall' | 'per_subject'
  const [targetMode, setTargetMode] = useState('none'); // 'none' | 'days' | 'hours'
  const [familyPlannerContext, setFamilyPlannerContext] = useState(null); // { targetScope, mode, days, hours } for prefill/display
  const [planningPrefilledFromFamily, setPlanningPrefilledFromFamily] = useState(false);
  const [children, setChildren] = useState(propChildren || []);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const session = useSession();

  // Materials/attachments state (syllabus + lesson plan rows)
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialDropdownSlot, setMaterialDropdownSlot] = useState(null); // null | 'syllabus' | 'lesson_plan'
  const [selectedSyllabusMaterialId, setSelectedSyllabusMaterialId] = useState(null);
  const [selectedLessonPlanMaterialId, setSelectedLessonPlanMaterialId] = useState(null);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [addMaterialDefaultRole, setAddMaterialDefaultRole] = useState(null); // 'syllabus' | 'lesson_plan'
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible);
  const hasSetChildIdsRef = useRef(false);
  const lastSubjectIdRef = useRef(null);
  const hasPrefilledFromFamilyRef = useRef(false);
  
  // Event management state
  const [subjectEvents, setSubjectEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [curriculumUnits, setCurriculumUnits] = useState([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [deletingEvents, setDeletingEvents] = useState(false);
  const [deleteEventsConfirm, setDeleteEventsConfirm] = useState({ visible: false });
  const [markingAttended, setMarkingAttended] = useState(false);
  const [showCurrentUnitsModal, setShowCurrentUnitsModal] = useState(false);
  const [showManualUnitsModal, setShowManualUnitsModal] = useState(false);
  const [showParseUnitsModal, setShowParseUnitsModal] = useState(false);
  const [showGenerateUnitsModal, setShowGenerateUnitsModal] = useState(false);

  // Accordion state (all collapsed by default)
  const [showMaterialsAccordion, setShowMaterialsAccordion] = useState(false);

  useEffect(() => {
    if (!showMaterialsAccordion) setMaterialDropdownSlot(null);
  }, [showMaterialsAccordion]);
  const [showPlanningAccordion, setShowPlanningAccordion] = useState(false);
  const [showLogisticsAccordion, setShowLogisticsAccordion] = useState(false);
  const [showAdditionalNotesAccordion, setShowAdditionalNotesAccordion] = useState(false);
  const [showEventMgmtAccordion, setShowEventMgmtAccordion] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [confirmDeleteSubjectName, setConfirmDeleteSubjectName] = useState('');
  const [deletingSubject, setDeletingSubject] = useState(false);
  /** Add-mode draft subject persisted early so unit structure can be saved before final subject save. */
  const [draftSubjectId, setDraftSubjectId] = useState(null);
  const effectiveSubjectId = subject?.id ?? draftSubjectId ?? null;
  const [openingAddUnits, setOpeningAddUnits] = useState(false);
  const finalizedSubjectSaveRef = useRef(false);

  // Update children when prop changes
  useEffect(() => {
    if (propChildren && propChildren.length > 0) {
      setChildren(propChildren);
      setLoadingChildren(false);
    }
  }, [propChildren]);

  useEffect(() => {
    if (visible) {
      finalizedSubjectSaveRef.current = false;
      // Only fetch children if not provided as prop
      if (!propChildren || propChildren.length === 0) {
        fetchChildren();
      } else {
        setChildren(propChildren);
        setLoadingChildren(false);
      }
      loadMaterials();
      
      // If editing a subject, populate fields (but wait for children to load for child IDs)
      if (subject) {
        setSubjectName(subject.name || '');
        setAdditionalNotes(subject.notes || subject.summary || '');
        setGrade(subject.grade || GRADE_OPTIONS[0] || '');
        setSchoolYear(subject.school_year || getDefaultSchoolYear());
        setSchoolTerm(subject.school_term || getDefaultSchoolTerm());
        setCredits(subject.credits ? String(subject.credits) : '');
        setDefaultTargetDays(subject.default_target_days != null ? String(subject.default_target_days) : '');
        setDefaultTargetHours(subject.default_target_hours != null ? String(subject.default_target_hours) : '');
        setLogisticalLocation(subject.location || '');
        setLogisticalMode(subject.mode || '');
        setLogisticalInstructor(subject.instructor || '');
        setConnectedCalendarTargets(normalizeCalendarTargets(subject.connected_calendar_targets));
        const hasSubjectValues = subject.default_constraint_mode != null || subject.default_target_days != null || subject.default_target_hours != null;
        setGoalModeForSubject(hasSubjectValues ? 'per_subject' : 'overall');
        const mode = subject.default_constraint_mode || (subject.default_target_days != null ? 'days' : subject.default_target_hours != null ? 'hours' : 'none');
        setTargetMode(mode);
        setPlanningPrefilledFromFamily(!hasSubjectValues);
        setShowDangerZone(false);
        setConfirmDeleteSubjectName('');
        // Child IDs will be set in the next useEffect after children load
        // Load events for this subject
        loadSubjectEvents(subject.id);
      } else {
        // Add mode - use defaults
        setAdditionalNotes('');
        setSchoolYear(initialSchoolYear || getDefaultSchoolYear());
        setSchoolTerm(initialSchoolTerm || getDefaultSchoolTerm());
        setSelectedSyllabusMaterialId(null);
        setSelectedLessonPlanMaterialId(null);
        setMaterialDropdownSlot(null);
        setLogisticalLocation('');
        setLogisticalMode('');
        setLogisticalInstructor('');
        setConnectedCalendarTargets([]);
        if (defaultSubjectName) {
          setSubjectName(defaultSubjectName);
        }
        if (Array.isArray(defaultChildIds) && defaultChildIds.length > 0) {
          setSelectedChildIds(defaultChildIds.filter(Boolean));
        } else if (defaultChildId) {
          setSelectedChildIds([defaultChildId]);
        }
      }
    } else if (!visible) {
      // Reset form when modal closes
      setSubjectName('');
      setAdditionalNotes('');
      setSelectedChildIds([]);
      setGrade(GRADE_OPTIONS[0] || '');
      setSchoolYear(getDefaultSchoolYear());
      setShowSchoolYearDropdown(false);
      setSchoolTerm(getDefaultSchoolTerm());
      setShowSchoolTermDropdown(false);
      setCredits('');
      setDefaultTargetDays('');
      setDefaultTargetHours('');
      setLogisticalLocation('');
      setLogisticalMode('');
      setLogisticalInstructor('');
      setConnectedCalendarTargets([]);
      setGoalModeForSubject('overall');
      setTargetMode('none');
      setFamilyPlannerContext(null);
      setPlanningPrefilledFromFamily(false);
      setError(null);
      setMaterialDropdownSlot(null);
      setSelectedSyllabusMaterialId(null);
      setSelectedLessonPlanMaterialId(null);
      setAddMaterialDefaultRole(null);
      setSubjectEvents([]);
      setLoadingEvents(false);
      setDeletingEvents(false);
      setMarkingAttended(false);
      setShowCurrentUnitsModal(false);
      setCurriculumUnits([]);
      setLoadingCurriculum(false);
      setShowMaterialsAccordion(false);
      setShowPlanningAccordion(false);
      setShowLogisticsAccordion(false);
      setShowAdditionalNotesAccordion(false);
      setShowEventMgmtAccordion(false);
      setDraftSubjectId(null);
      setOpeningAddUnits(false);
      hasPrefilledFromFamilyRef.current = false;
    }
  }, [visible, defaultChildId, defaultChildIds, defaultSubjectName, initialSchoolTerm, initialSchoolYear, subject]);

  // Clear transient validation/banner errors as soon as form state is corrected.
  useEffect(() => {
    if (!error) return;
    const needsSubjectName = /subject name/i.test(error);
    const needsStudent = /student/i.test(error);
    const needsFamily = /family id/i.test(error);
    if (needsSubjectName && !subjectName.trim()) return;
    if (needsStudent && selectedChildIds.length === 0) return;
    if (needsFamily && !familyId) return;
    setError(null);
  }, [error, subjectName, selectedChildIds, familyId]);

  // Load family planner settings for prefill when modal opens (used when subject has no custom values)
  useEffect(() => {
    if (!visible || !familyId) return;
    let cancelled = false;
    getFamilyPlannerSettings(familyId, schoolYear).then(async ({ data: s }) => {
      if (cancelled) return;
      if (!s) {
        setFamilyPlannerContext({ targetScope: 'overall', mode: 'none', days: '', hours: '' });
        return;
      }
      let scope = s.target_scope || 'overall';
      let mode = s.default_constraint_mode || 'none';
      let days = s.default_target_days != null ? String(s.default_target_days) : '';
      let hours = s.default_target_hours != null ? String(s.default_target_hours) : '';
      if (scope !== 'per_subject') {
        const { data: subjectRows } = await supabase
          .from('subject')
          .select('default_constraint_mode, default_target_days, default_target_hours')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false });
        const firstActive = (subjectRows || []).find((row) => {
          const m = String(row?.default_constraint_mode || '').toLowerCase();
          return (m === 'days' && parsePositiveIntOrNull(row?.default_target_days) != null) ||
            (m === 'hours' && parsePositiveFloatOrNull(row?.default_target_hours) != null);
        });
        if (firstActive) {
          scope = 'per_subject';
          mode = String(firstActive.default_constraint_mode).toLowerCase();
          days = mode === 'days' ? String(parsePositiveIntOrNull(firstActive.default_target_days) || '') : '';
          hours = mode === 'hours' ? String(parsePositiveFloatOrNull(firstActive.default_target_hours) || '') : '';
        }
      }
      setFamilyPlannerContext({ targetScope: scope, mode, days, hours });
    });
    return () => { cancelled = true; };
  }, [visible, familyId, schoolYear]);

  // Stay in sync when Plan Year, Family → Planning Preferences, or another client updates planner settings / subject targets.
  const reloadPlannerSyncData = useCallback(async () => {
    if (!familyId) return;
    const { data: s } = await getFamilyPlannerSettings(familyId, schoolYear);
    if (s) {
      let scope = s.target_scope || 'overall';
      let mode = s.default_constraint_mode || 'none';
      let days = s.default_target_days != null ? String(s.default_target_days) : '';
      let hours = s.default_target_hours != null ? String(s.default_target_hours) : '';
      if (scope !== 'per_subject') {
        const { data: subjectRows } = await supabase
          .from('subject')
          .select('default_constraint_mode, default_target_days, default_target_hours')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false });
        const firstActive = (subjectRows || []).find((row) => {
          const m = String(row?.default_constraint_mode || '').toLowerCase();
          return (m === 'days' && parsePositiveIntOrNull(row?.default_target_days) != null) ||
            (m === 'hours' && parsePositiveFloatOrNull(row?.default_target_hours) != null);
        });
        if (firstActive) {
          scope = 'per_subject';
          mode = String(firstActive.default_constraint_mode).toLowerCase();
          days = mode === 'days' ? String(parsePositiveIntOrNull(firstActive.default_target_days) || '') : '';
          hours = mode === 'hours' ? String(parsePositiveFloatOrNull(firstActive.default_target_hours) || '') : '';
        }
      }
      setFamilyPlannerContext({ targetScope: scope, mode, days, hours });
    } else {
      setFamilyPlannerContext({ targetScope: 'overall', mode: 'none', days: '', hours: '' });
    }
    if (subject?.id) {
      const { data, error } = await supabase
        .from('subject')
        .select('default_constraint_mode, default_target_days, default_target_hours')
        .eq('id', subject.id)
        .eq('family_id', familyId)
        .maybeSingle();
      if (error || !data) return;
      setDefaultTargetDays(data.default_target_days != null ? String(data.default_target_days) : '');
      setDefaultTargetHours(data.default_target_hours != null ? String(data.default_target_hours) : '');
      const hasSubjectValues =
        data.default_constraint_mode != null ||
        data.default_target_days != null ||
        data.default_target_hours != null;
      setGoalModeForSubject(hasSubjectValues ? 'per_subject' : 'overall');
      const tm =
        data.default_constraint_mode ||
        (data.default_target_days != null ? 'days' : data.default_target_hours != null ? 'hours' : 'none');
      setTargetMode(tm);
      setPlanningPrefilledFromFamily(!hasSubjectValues);
    }
  }, [familyId, subject?.id, schoolYear]);

  const buildSubjectPayload = useCallback(() => {
    const childIdString = selectedChildIds.length > 0 ? selectedChildIds.join(';') : '';
    return {
      name: subjectName.trim(),
      summary: null,
      child_id: childIdString,
      grade: grade || null,
      school_year: schoolYear || getDefaultSchoolYear(),
      school_term: schoolTerm || getDefaultSchoolTerm(),
      credits: credits ? parseFloat(credits) : null,
      notes: additionalNotes.trim() || null,
      location: logisticalLocation.trim() || null,
      mode: logisticalMode || null,
      instructor: logisticalInstructor.trim() || null,
      connected_calendar_targets: connectedCalendarTargets.length > 0 ? connectedCalendarTargets : [],
      default_constraint_mode: goalModeForSubject === 'per_subject' ? targetMode : null,
      default_target_days:
        goalModeForSubject === 'per_subject' &&
        targetMode === 'days' &&
        defaultTargetDays.trim()
          ? parseInt(defaultTargetDays, 10) || null
          : null,
      default_target_hours:
        goalModeForSubject === 'per_subject' &&
        targetMode === 'hours' &&
        defaultTargetHours.trim()
          ? parseFloat(defaultTargetHours) || null
          : null,
    };
  }, [
    selectedChildIds,
    subjectName,
    grade,
    schoolYear,
    schoolTerm,
    credits,
    additionalNotes,
    logisticalLocation,
    logisticalMode,
    logisticalInstructor,
    connectedCalendarTargets,
    goalModeForSubject,
    targetMode,
    defaultTargetDays,
    defaultTargetHours,
  ]);

  const ensureDraftSubjectExists = useCallback(async () => {
    if (subject?.id) return subject.id;
    if (draftSubjectId) return draftSubjectId;
    if (!familyId) throw new Error('Family ID not found. Please refresh and try again.');
    if (!subjectName.trim()) throw new Error('Please enter a subject name before adding units.');
    if (selectedChildIds.length === 0) throw new Error('Please select at least one student before adding units.');

    const payload = {
      ...buildSubjectPayload(),
      family_id: familyId,
    };
    const { data, error } = await supabase.from('subject').insert([payload]).select().single();
    if (error) throw error;
    const newId = data?.id || null;
    if (!newId) throw new Error('Failed to create draft subject.');
    setDraftSubjectId(newId);
    return newId;
  }, [
    subject?.id,
    draftSubjectId,
    familyId,
    subjectName,
    selectedChildIds,
    buildSubjectPayload,
  ]);

  const handleCloseWithDraftCleanup = useCallback(async () => {
    if (!onClose) return;
    if (subject?.id || !draftSubjectId || finalizedSubjectSaveRef.current) {
      onClose();
      return;
    }
    try {
      await deleteSubjectCascade(
        supabase,
        familyId,
        draftSubjectId,
        subjectName.trim() || 'Subject'
      );
    } catch (cleanupError) {
      console.warn('Failed to clean up draft subject on close:', cleanupError);
    } finally {
      onClose();
    }
  }, [onClose, subject?.id, draftSubjectId, familyId, subjectName]);

  /** Same global flows as Course Structure / library: manual, paste, upload, generate. Web dispatches to WebLayout. */
  const openAddUnitsCurriculumAction = useCallback(
    async (kind) => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      if (openingAddUnits) return;
      const childIds = selectedChildIds.length
        ? selectedChildIds
        : (children || []).map((c) => c.id).filter(Boolean);
      let ensuredSubjectId = subject?.id ?? draftSubjectId ?? null;
      if (!ensuredSubjectId && (kind === 'manual' || kind === 'paste' || kind === 'generate')) {
        try {
          setOpeningAddUnits(true);
          ensuredSubjectId = await ensureDraftSubjectExists();
        } catch (e) {
          setError(e?.message || 'Unable to prepare subject for Add units.');
          return;
        } finally {
          setOpeningAddUnits(false);
        }
      }
      const base = {
        subjectId: ensuredSubjectId,
        subjectName: (subjectName || '').trim() || subject?.name || 'Subject',
        familyId,
        childIds,
      };
      if (kind === 'upload') {
        // Keep upload in the current stack: open the refreshed AddMaterialModal directly.
        setMaterialDropdownSlot(null);
        setAddMaterialDefaultRole(null);
        setShowAddMaterialModal(true);
        return;
      }

      if (kind === 'manual' || kind === 'paste' || kind === 'generate') {
        if (kind === 'manual') {
          setShowManualUnitsModal(true);
          return;
        }
        if (kind === 'paste') {
          setShowParseUnitsModal(true);
          return;
        }
        if (kind === 'generate') {
          setShowGenerateUnitsModal(true);
        }
      }
    },
    [
      subject?.id,
      draftSubjectId,
      subject?.name,
      subjectName,
      familyId,
      selectedChildIds,
      children,
      openingAddUnits,
      ensureDraftSubjectExists,
      setMaterialDropdownSlot,
      setAddMaterialDefaultRole,
      setShowAddMaterialModal,
    ]
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!visible || !familyId) return;
    const onSync = () => {
      if (isSubmitting) return;
      reloadPlannerSyncData();
    };
    window.addEventListener('refreshPlanDefaults', onSync);
    window.addEventListener('refreshSubjects', onSync);
    return () => {
      window.removeEventListener('refreshPlanDefaults', onSync);
      window.removeEventListener('refreshSubjects', onSync);
    };
  }, [visible, familyId, isSubmitting, reloadPlannerSyncData]);

  // Pre-select syllabus / lesson plan materials when editing (linked by subject_id + role tag)
  useEffect(() => {
    if (!visible || !subject?.id || !familyId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, tags')
        .eq('subject_id', subject.id)
        .eq('family_id', familyId)
        .is('deleted_at', null);
      if (cancelled || error) return;
      let syllabusId = null;
      let lessonId = null;
      for (const m of data || []) {
        const r = deriveRoleFromTags(m.tags);
        if (r === DOCUMENT_ROLES.SYLLABUS && !syllabusId) syllabusId = m.id;
        if (r === DOCUMENT_ROLES.LESSON_PLAN && !lessonId) lessonId = m.id;
      }
      setSelectedSyllabusMaterialId(syllabusId);
      setSelectedLessonPlanMaterialId(lessonId);
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, subject?.id, familyId]);

  // When family planner context loads and we're in add mode, set goal mode from family scope
  useEffect(() => {
    if (!familyPlannerContext || subject) return;
    setGoalModeForSubject(familyPlannerContext.targetScope === 'per_subject' ? 'per_subject' : 'overall');
    setPlanningPrefilledFromFamily(true);
  }, [familyPlannerContext, subject]);

  // Prefill target fields from family when subject has no values and user is in per_subject mode
  useEffect(() => {
    if (!familyPlannerContext || goalModeForSubject !== 'per_subject') return;
    if (defaultTargetDays !== '' || defaultTargetHours !== '') return; // User has values
    if (hasPrefilledFromFamilyRef.current) return;
    hasPrefilledFromFamilyRef.current = true;
    setTargetMode(familyPlannerContext.mode);
    setDefaultTargetDays(familyPlannerContext.days);
    setDefaultTargetHours(familyPlannerContext.hours);
  }, [familyPlannerContext, goalModeForSubject, defaultTargetDays, defaultTargetHours]);

  // Load events for the subject
  const loadSubjectEvents = async (subjectId) => {
    if (!subjectId || !familyId) return;
    
    setLoadingEvents(true);
    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_ts, status, event_type, academic_year_id')
        .eq('subject_id', subjectId)
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .order('start_ts', { ascending: false });
      
      if (error) throw error;
      
      setSubjectEvents(data || []);
    } catch (error) {
      console.error('Error loading subject events:', error);
      setSubjectEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  const loadSubjectCurriculum = useCallback(async (subjectId, academicYearIds = []) => {
    if (!subjectId || !familyId) return;
    setLoadingCurriculum(true);
    try {
      const yearCandidates = [null, ...academicYearIds]
        .filter((v, i, arr) => arr.findIndex((x) => String(x) === String(v)) === i);
      const grouped = new Map();
      const seenLessons = new Set();
      for (const yearId of yearCandidates) {
        const { data, error } = await fetchSubjectCurriculumEventsStructure(
          familyId,
          subjectId,
          yearId
        );
        if (error) continue;
        const units = Array.isArray(data?.units) ? data.units : [];
        for (const unit of units) {
          const unitTitle = (unit?.title || '').trim() || 'Unit';
          if (!grouped.has(unitTitle)) grouped.set(unitTitle, []);
          for (const lesson of unit?.lessons || []) {
            const lessonKey = lesson?.id
              ? `id:${String(lesson.id)}`
              : `title:${unitTitle}::${String(lesson?.title || '').trim().toLowerCase()}`;
            if (seenLessons.has(lessonKey)) continue;
            seenLessons.add(lessonKey);
            grouped.get(unitTitle).push(lesson);
          }
        }
      }
      const mergedUnits = Array.from(grouped.entries()).map(([title, lessons]) => ({
        title,
        lessons,
      }));
      setCurriculumUnits(mergedUnits);
    } catch (error) {
      console.error('Error loading subject curriculum:', error);
      setCurriculumUnits([]);
    } finally {
      setLoadingCurriculum(false);
    }
  }, [familyId]);

  const curriculumAcademicYearIds = useMemo(
    () => [...new Set(subjectEvents.map((e) => e?.academic_year_id).filter(Boolean))],
    [subjectEvents]
  );

  const refreshAfterUnitsSaved = useCallback((savedSubjectId = null) => {
    const sid = savedSubjectId || effectiveSubjectId;
    if (!sid || !familyId) return;
    loadSubjectEvents(sid);
    loadSubjectCurriculum(sid, curriculumAcademicYearIds);
    setShowEventMgmtAccordion(true);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
      window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
      window.dispatchEvent(new CustomEvent('refreshEvents'));
      window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: sid } }));
    }
  }, [effectiveSubjectId, familyId, loadSubjectCurriculum, curriculumAcademicYearIds, loadSubjectEvents]);

  const unscheduledLessons = useMemo(() => {
    const out = [];
    for (const unit of curriculumUnits) {
      const unitTitle = (unit?.title || '').trim() || 'Unit';
      for (const lesson of unit?.lessons || []) {
        const meta = lesson?.curriculum_metadata || {};
        const isUnscheduledPlaceholder = Boolean(meta?.unscheduled_placeholder);
        // Some existing subjects store placeholder rows with a timestamp; treat those as unscheduled.
        const ymd = normalizeLessonYmd(lesson?.date);
        if (!isUnscheduledPlaceholder && ymd) continue;
        out.push({
          id: String(lesson?.id || `${unitTitle}-${lesson?.title || 'lesson'}`),
          unitTitle,
          lessonTitle: (lesson?.title || '').trim() || 'Lesson',
        });
      }
    }
    return out;
  }, [curriculumUnits]);

  const unitsForCurrentUnitsModal = useMemo(
    () => (curriculumUnits || []).filter((u) => (u?.lessons || []).length > 0),
    [curriculumUnits]
  );
  const hasCurrentUnitsModalContent = unitsForCurrentUnitsModal.length > 0;
  const hasUnitsOrLessonsContent = hasCurrentUnitsModalContent || unscheduledLessons.length > 0;

  // Keep event management synced for both persisted subjects and add-mode draft subjects.
  useEffect(() => {
    if (!visible || !effectiveSubjectId || !familyId) return;
    loadSubjectEvents(effectiveSubjectId);
  }, [visible, effectiveSubjectId, familyId]);

  useEffect(() => {
    if (!visible || !effectiveSubjectId || !familyId) return;
    loadSubjectCurriculum(effectiveSubjectId, curriculumAcademicYearIds);
  }, [visible, effectiveSubjectId, familyId, curriculumAcademicYearIds, loadSubjectCurriculum]);

  // After Add Units closes, WebLayout emits refreshSubjectDetail for this subject id.
  // Refresh events and surface the Event management card so linked events are visible immediately.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!visible || !effectiveSubjectId) return;
    const onRefreshSubjectDetail = (evt) => {
      const sid = evt?.detail?.subjectId;
      if (!sid || String(sid) !== String(effectiveSubjectId)) return;
      loadSubjectEvents(effectiveSubjectId);
      loadSubjectCurriculum(effectiveSubjectId, curriculumAcademicYearIds);
      setShowEventMgmtAccordion(true);
    };
    window.addEventListener('refreshSubjectDetail', onRefreshSubjectDetail);
    return () => window.removeEventListener('refreshSubjectDetail', onRefreshSubjectDetail);
  }, [visible, effectiveSubjectId, familyId, loadSubjectCurriculum, curriculumAcademicYearIds]);
  
  // Delete all events for this subject
  const performDeleteAllEvents = async () => {
    if (!effectiveSubjectId || subjectEvents.length === 0) return;
    setDeletingEvents(true);
    try {
      const eventIds = subjectEvents.map(e => e.id);
      const { error } = await supabase
        .from('events')
        .update({ deleted_at: new Date().toISOString() })
        .in('id', eventIds)
        .eq('family_id', familyId);
      if (error) throw error;
      toast.show('All events deleted successfully', 'success');
      setSubjectEvents([]);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshEvents'));
        window.dispatchEvent(new CustomEvent('subjectUpdated'));
      }
    } catch (error) {
      console.error('Error deleting events:', error);
      toast.show('Failed to delete events', 'error');
    } finally {
      setDeletingEvents(false);
    }
  };

  const handleDeleteAllEvents = async () => {
    if (!effectiveSubjectId || subjectEvents.length === 0) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      setDeleteEventsConfirm({ visible: true });
      return;
    }
    const confirmed = await new Promise((resolve) => {
      Alert.alert(
        'Delete All Events',
        `Are you sure you want to delete all ${subjectEvents.length} event${subjectEvents.length === 1 ? '' : 's'} for this subject? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Delete All', style: 'destructive', onPress: () => resolve(true) }
        ]
      );
    });
    if (!confirmed) return;
    await performDeleteAllEvents();
  };
  
  // Mark all events as attended
  const handleMarkAllAttended = async () => {
    if (!effectiveSubjectId || subjectEvents.length === 0) return;
    
    const unattendedEvents = subjectEvents.filter(e => e.status !== 'done');
    if (unattendedEvents.length === 0) {
      toast.show('All events are already marked as attended', 'info');
      return;
    }
    
    // Web-compatible confirmation
    let confirmed = false;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      confirmed = window.confirm(
        `Mark ${unattendedEvents.length} event${unattendedEvents.length === 1 ? '' : 's'} as attended?`
      );
    } else {
      // Native Alert.alert
      confirmed = await new Promise((resolve) => {
        Alert.alert(
          'Mark All Events as Attended',
          `Mark ${unattendedEvents.length} event${unattendedEvents.length === 1 ? '' : 's'} as attended?`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            {
              text: 'Mark All Attended',
              onPress: () => resolve(true),
            }
          ]
        );
      });
    }
    
    if (!confirmed) return;
    
    setMarkingAttended(true);
    try {
      const eventIds = unattendedEvents.map(e => e.id);
      
      // Update events to done status
      const { error } = await supabase
        .from('events')
        .update({ 
          status: 'done',
          updated_at: new Date().toISOString()
        })
        .in('id', eventIds)
        .eq('family_id', familyId);
      
      if (error) throw error;
      
      toast.show(`${unattendedEvents.length} event${unattendedEvents.length === 1 ? '' : 's'} marked as attended`, 'success');
      
      // Reload events
      await loadSubjectEvents(effectiveSubjectId);
      
      // Refresh events in the app
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshEvents'));
        window.dispatchEvent(new CustomEvent('subjectUpdated'));
      }
    } catch (error) {
      console.error('Error marking events as attended:', error);
      toast.show('Failed to mark events as attended', 'error');
    } finally {
      setMarkingAttended(false);
    }
  };

  // Delete subject permanently (Danger Zone)
  const performDeleteSubject = async () => {
    if (!subject || !subject.id || !familyId) return;
    setDeletingSubject(true);
    try {
      const deletedName = subject.name || subjectName || 'Subject';
      const result = await deleteSubjectCascade(supabase, familyId, subject.id, deletedName);
      if (!result.ok) throw new Error(result.error || 'Delete failed');
      dispatchSubjectDeletedSideEffects(familyId);
      if (toast?.push) toast.push(`"${deletedName}" has been deleted.`, 'success');
      onClose();
    } catch (err) {
      if (toast?.push) toast.push('Failed to delete subject: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setDeletingSubject(false);
    }
  };

  // Set child IDs when editing and children are loaded
  useEffect(() => {
    if (visible && subject && children.length > 0) {
      // Reset flag if subject changed
      if (lastSubjectIdRef.current !== subject.id) {
        hasSetChildIdsRef.current = false;
        lastSubjectIdRef.current = subject.id;
      }
      
      // Only set once per subject
      if (!hasSetChildIdsRef.current) {
        // Parse semicolon-separated child_id string
        if (subject.child_id) {
          const childIds = parseChildIds(subject.child_id);
          setSelectedChildIds(childIds);
        } else {
          setSelectedChildIds([]);
        }
        hasSetChildIdsRef.current = true;
      }
    } else if (!visible) {
      // Reset flags when modal closes
      hasSetChildIdsRef.current = false;
      lastSubjectIdRef.current = null;
    }
  }, [visible, subject?.id, children.length]);

  // Set default to first child when children are loaded (if no defaultChildId and no children selected)
  // BUT only in add mode (not edit mode)
  useEffect(() => {
    if (
      visible
      && children.length > 0
      && selectedChildIds.length === 0
      && !defaultChildId
      && (!Array.isArray(defaultChildIds) || defaultChildIds.length === 0)
      && !subject
    ) {
      setSelectedChildIds([children[0].id]);
    }
  }, [children, visible, defaultChildId, defaultChildIds, selectedChildIds.length, subject]);

  const loadMaterials = async () => {
    if (!familyId) return;
    setLoadingMaterials(true);
    try {
      const materialsData = await getMaterials(familyId, {}, session);
      setMaterials(materialsData || []);
    } catch (error) {
      console.error('Error loading materials:', error);
      setMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  };

  const handleMaterialDropdownToggle = (slot) => {
    setMaterialDropdownSlot((prev) => (prev === slot ? null : slot));
  };

  const setSlotSelection = (slot, materialId) => {
    if (slot === MATERIAL_SLOT.SYLLABUS) {
      setSelectedSyllabusMaterialId(materialId);
      setSelectedLessonPlanMaterialId((prev) => (materialId && prev === materialId ? null : prev));
    } else {
      setSelectedLessonPlanMaterialId(materialId);
      setSelectedSyllabusMaterialId((prev) => (materialId && prev === materialId ? null : prev));
    }
  };

  const fetchChildren = async () => {
    try {
      setLoadingChildren(true);
      setError(null);
      
      // Get user profile to fetch family_id (more reliable than prop)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        // Silently fail - child selection is optional
        setChildren([]);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .maybeSingle();

      const effectiveFamilyId = profile?.family_id || familyId;
      
      if (!effectiveFamilyId) {
        // Silently fail - child selection is optional
        setChildren([]);
        return;
      }

      // Fetch children - use same pattern as WebLayout
      // Try with archived filter first
      const { data: childrenData, error: childrenError } = await supabase
        .from('children')
        .select('*')
        .eq('family_id', effectiveFamilyId)
        .eq('archived', false);
      
      if (childrenError) {
        // If archived column doesn't exist or query fails, try without it
        if (childrenError.code === '42703' || childrenError.message?.includes('archived') || childrenError.code === '400') {
          const { data: retryData, error: retryError } = await supabase
            .from('children')
            .select('*')
            .eq('family_id', effectiveFamilyId);
          
          if (retryError) {
            // Log the full error for debugging

            // Silently fail - child selection is optional
            setChildren([]);
            return;
          }
          setChildren(retryData || []);
          return;
        }

        // Silently fail - child selection is optional
        setChildren([]);
        return;
      }
      
      setChildren(childrenData || []);
      // Clear any previous errors if we successfully loaded (even if empty)
      setError(null);
    } catch (error) {
      // Silently fail - child selection is optional
      setChildren([]);
    } finally {
      setLoadingChildren(false);
    }
  };

  const handleSubmit = async () => {
    if (!subjectName.trim()) {
      setError('Please enter a subject name');
      return;
    }

    if (selectedChildIds.length === 0) {
      setError('Please select at least one student');
      return;
    }

    if (!familyId) {
      setError('Family ID not found. Please refresh and try again.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const subjectData = buildSubjectPayload();

      let newSubjects;
      let insertError;
      const effectiveSubjectId = subject?.id || draftSubjectId || null;

      if (effectiveSubjectId) {
        // Edit mode OR add-mode draft subject - UPDATE
        const { data, error } = await supabase
          .from('subject')
          .update(subjectData)
          .eq('id', effectiveSubjectId)
          .eq('family_id', familyId)
          .select();
        newSubjects = data;
        insertError = error;
      } else {
        // Add mode - INSERT
        subjectData.family_id = familyId;
        const { data, error } = await supabase
          .from('subject')
          .insert([subjectData])
          .select();
        newSubjects = data;
        insertError = error;
      }

      if (insertError) {
        // Check if it's a duplicate subject error
        if (insertError.code === '23505') {
          throw new Error('A subject with this name already exists for this child/family');
        }
        throw insertError;
      }

      // Link syllabus + lesson plan materials (clear prior syllabus/lesson_plan links on this subject, then attach selections)
      if (newSubjects && newSubjects.length > 0) {
        try {
          const subjectId = newSubjects[0].id;
          const pickIds = [selectedSyllabusMaterialId, selectedLessonPlanMaterialId].filter(Boolean);
          const uniquePickIds = [...new Set(pickIds)];

          const { data: linkedRows, error: linkedErr } = await supabase
            .from('materials')
            .select('id, tags')
            .eq('subject_id', subjectId)
            .eq('family_id', familyId)
            .is('deleted_at', null);

          if (!linkedErr && linkedRows?.length) {
            const toClear = linkedRows
              .filter((row) => {
                const r = deriveRoleFromTags(row.tags);
                return r === DOCUMENT_ROLES.SYLLABUS || r === DOCUMENT_ROLES.LESSON_PLAN;
              })
              .map((row) => row.id);
            if (toClear.length) {
              const { error: clearErr } = await supabase
                .from('materials')
                .update({ subject_id: null })
                .in('id', toClear);
              if (clearErr) console.warn('Failed to clear prior subject materials:', clearErr);
            }
          }

          if (uniquePickIds.length > 0) {
            const { error: materialUpdateError } = await supabase
              .from('materials')
              .update({ subject_id: subjectId })
              .in('id', uniquePickIds);

            if (materialUpdateError) {
              console.warn('Failed to link materials to subject:', materialUpdateError);
            }
          }
        } catch (materialError) {
          console.warn('Error linking materials to subject:', materialError);
        }
      }

      if (familyId && goalModeForSubject === 'per_subject' && (targetMode === 'days' || targetMode === 'hours')) {
        const daysValue = targetMode === 'days' ? parsePositiveIntOrNull(defaultTargetDays) : null;
        const hoursValue = targetMode === 'hours' ? parsePositiveFloatOrNull(defaultTargetHours) : null;
        await saveFamilyPlannerSettings(familyId, {
          target_scope: 'per_subject',
          default_constraint_mode: targetMode,
          default_target_days: targetMode === 'days' ? daysValue : null,
          default_target_hours: targetMode === 'hours' ? hoursValue : null,
        }, schoolYear);
      }

      // Success
      finalizedSubjectSaveRef.current = true;
      const isEdit = !!(subject && subject.id);
      const successMessage = isEdit 
        ? `Subject "${subjectName}" updated successfully!`
        : `Subject "${subjectName}" added successfully!`;
      
      if (toast && toast.push) {
        toast.push(successMessage, 'success');
      } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
        alert(successMessage);
      }
      
      if (onSubjectAdded && newSubjects && newSubjects.length > 0) {
        // Call callback with first subject (or all if needed)
        onSubjectAdded(newSubjects[0]);
      }
      
      // Dispatch events to refresh subjects and planner-related data
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshMaterials', { detail: { familyId } }));
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
        window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
        if (effectiveSubjectId) {
          window.dispatchEvent(new CustomEvent('refreshSubjectDetail', {
            detail: { subjectId: effectiveSubjectId }
          }));
        }
      }
      
      // Close modal after a brief delay
      setTimeout(() => {
        handleCloseWithDraftCleanup();
      }, 500);
    } catch (err) {
      setError(err.message || 'Failed to add subject. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = subjectName.trim().length > 0 && selectedChildIds.length > 0 && !isSubmitting;

  return (
    <>
    <RNModal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCloseWithDraftCleanup}
    >
      <View ref={overlayRef} style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleCloseWithDraftCleanup}
        />
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalWrap}>
          <AppModalShell
            mode={subject ? 'edit' : 'add'}
            title={subject ? subjectName || 'Edit subject' : 'New subject'}
            eyebrow="SUBJECT"
            accent="#5A92D6"
            accentSoft="#EEF7FF"
            HeroIcon={BookOpen}
            onClose={handleCloseWithDraftCleanup}
            contentContainerStyle={styles.scrollContent}
            bodyStyle={styles.shellBody}
            footer={(
              <ModalFooter
                mode={subject ? 'edit' : 'add'}
                primaryLabel={isSubmitting ? 'Saving...' : (subject ? 'Save changes' : 'Save Subject')}
                destructiveLabel={subject ? 'Delete Subject' : undefined}
                onCancel={handleCloseWithDraftCleanup}
                onDelete={subject ? () => setShowDangerZone(true) : undefined}
                onPrimary={handleSubmit}
                accent="#5A92D6"
                disabled={!canSubmit || isSubmitting}
                loading={isSubmitting}
              />
            )}
          >
            {error && !error.includes('children') && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Subject Name */}
            <View style={styles.formGroup}>
              <Text style={styles.subjectNameLabel}>Subject Name <Text style={{ color: '#dc2626' }}>*</Text></Text>
              <TextInput
                style={[styles.subjectNameInput, subjectNameInputFocused && styles.subjectNameInputFocused]}
                value={subjectName}
                onChangeText={setSubjectName}
                placeholder="e.g., Algebra I, World History, Spanish"
                placeholderTextColor="#9ca3af"
                autoFocus={!defaultSubjectName}
                onFocus={() => setSubjectNameInputFocused(true)}
                onBlur={() => setSubjectNameInputFocused(false)}
              />
            </View>

            {/* Students Selection */}
            {loadingChildren ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Students<Text style={styles.required}> *</Text></Text>
                <Text style={styles.loadingText}>Loading children...</Text>
              </View>
            ) : children.length > 0 ? (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Students<Text style={styles.required}> *</Text></Text>
                <ScrollView 
                  horizontal 
                  showsHorizontalScrollIndicator={false}
                  style={styles.childrenScroll}
                >
                  {children.map((child) => {
                    const isSelected = selectedChildIds.includes(child.id);
                    return (
                      <TouchableOpacity
                        key={child.id}
                        style={[
                          styles.childChip,
                          isSelected && styles.childChipSelected
                        ]}
                        onPress={() => {
                          if (isSelected) {
                            setSelectedChildIds(selectedChildIds.filter(id => id !== child.id));
                          } else {
                            setSelectedChildIds([...selectedChildIds, child.id]);
                          }
                        }}
                      >
                        <Text style={[
                          styles.childChipText,
                          isSelected && styles.childChipTextSelected
                        ]}>
                          {child.first_name || child.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            {/* Grade Level & Credits side by side */}
            <View style={styles.formGroup}>
              <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={styles.label}>Grade Level (Optional)</Text>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.gradeScroll}
                  >
                    {GRADE_OPTIONS.map((g) => (
                      <TouchableOpacity
                        key={g}
                        style={[
                          styles.gradeChip,
                          grade === g && styles.gradeChipSelected
                        ]}
                        onPress={() => setGrade(g)}
                      >
                        <Text style={[
                          styles.gradeChipText,
                          grade === g && styles.gradeChipTextSelected
                        ]}>
                          {g}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                <View style={{ width: 160, minWidth: 120 }}>
                  <Text style={styles.label}>Credits (Optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={credits}
                    onChangeText={(text) => {
                      // Allow only numbers and decimal point
                      const numericValue = text.replace(/[^0-9.]/g, '');
                      // Prevent multiple decimal points
                      const parts = numericValue.split('.');
                      const filteredValue = parts.length > 2 
                        ? parts[0] + '.' + parts.slice(1).join('')
                        : numericValue;
                      setCredits(filteredValue);
                    }}
                    placeholder="e.g., 0.5, 1.0, 1.5"
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                  />
                </View>
              </View>
            </View>

            <View
              style={[
                styles.formGroup,
                (showSchoolYearDropdown || showSchoolTermDropdown) && styles.schoolScopeFormGroupOpen,
              ]}
            >
              <View
                style={[
                  styles.schoolScopeRow,
                  (showSchoolYearDropdown || showSchoolTermDropdown) && styles.schoolScopeRowOpen,
                ]}
              >
                <View style={[styles.schoolScopeField, showSchoolYearDropdown && styles.schoolScopeFieldOpen]}>
                  <Text style={styles.label}>School year</Text>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => {
                      setShowSchoolTermDropdown(false);
                      setShowSchoolYearDropdown(!showSchoolYearDropdown);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dropdownButtonText}>{schoolYear}</Text>
                    <ChevronDown size={18} color="#6b7280" />
                  </TouchableOpacity>
                  {showSchoolYearDropdown && (
                    <View style={styles.dropdownList}>
                      <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                        {SCHOOL_YEAR_OPTIONS.map((opt) => (
                          <TouchableOpacity
                            key={opt}
                            style={[styles.dropdownOption, opt === schoolYear && styles.dropdownOptionSelected]}
                            onPress={() => {
                              setSchoolYear(opt);
                              setShowSchoolYearDropdown(false);
                            }}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.dropdownOptionText, opt === schoolYear && styles.dropdownOptionTextSelected]}>{opt}</Text>
                            {opt === schoolYear && <CheckCircle size={16} color="#3b82f6" />}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
                <View style={[styles.schoolScopeField, showSchoolTermDropdown && styles.schoolScopeFieldOpen]}>
                  <Text style={styles.label}>Term</Text>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => {
                      setShowSchoolYearDropdown(false);
                      setShowSchoolTermDropdown(!showSchoolTermDropdown);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dropdownButtonText}>
                      {(TERM_OPTIONS.find((opt) => opt.id === schoolTerm) || TERM_OPTIONS[0]).label}
                    </Text>
                    <ChevronDown size={18} color="#6b7280" />
                  </TouchableOpacity>
                  {showSchoolTermDropdown && (
                    <View style={styles.dropdownList}>
                      {TERM_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.id}
                          style={[styles.dropdownOption, opt.id === schoolTerm && styles.dropdownOptionSelected]}
                          onPress={() => {
                            setSchoolTerm(opt.id);
                            setShowSchoolTermDropdown(false);
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.dropdownOptionText, opt.id === schoolTerm && styles.dropdownOptionTextSelected]}>{opt.label}</Text>
                          {opt.id === schoolTerm && <CheckCircle size={16} color="#3b82f6" />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Accordion B: Syllabus and lesson plan attachments */}
            {familyId && (() => {
              const syllabusPickerMaterials = materials.filter(materialEligibleForSyllabusPicker);
              const lessonPickerMaterials = materials.filter(materialEligibleForLessonPicker);
              const dropdownSlot = materialDropdownSlot;
              const dropdownList =
                dropdownSlot === MATERIAL_SLOT.SYLLABUS ? syllabusPickerMaterials : dropdownSlot === MATERIAL_SLOT.LESSON_PLAN ? lessonPickerMaterials : [];
              const dropdownSelectedId =
                dropdownSlot === MATERIAL_SLOT.SYLLABUS
                  ? selectedSyllabusMaterialId
                  : dropdownSlot === MATERIAL_SLOT.LESSON_PLAN
                    ? selectedLessonPlanMaterialId
                    : null;

              const renderAttachmentRow = (slot, sectionLabel, addLabel, selectedId) => (
                <View
                  style={[
                    styles.formGroup,
                    { marginBottom: 14 },
                    materialDropdownSlot === slot && styles.materialAttachmentFormGroupOpen,
                  ]}
                >
                  <Text style={styles.label}>{sectionLabel}</Text>
                  <View style={styles.materialSelectorContainer}>
                    <View style={[styles.materialSelectorFieldWrap, materialDropdownSlot === slot && styles.materialSelectorFieldWrapOpen]}>
                      <TouchableOpacity
                        style={styles.materialSelector}
                        onPress={() => handleMaterialDropdownToggle(slot)}
                      >
                        <Text
                          style={[
                            styles.materialSelectorText,
                            !selectedId && styles.materialSelectorPlaceholder,
                          ]}
                        >
                          {selectedId
                            ? (materials.find((m) => m.id === selectedId)?.title ||
                                materials.find((m) => m.id === selectedId)?.provider_name ||
                                'Select attachment...')
                            : 'Select attachment...'}
                        </Text>
                        <ChevronDown size={16} color="#6b7280" />
                      </TouchableOpacity>
                      {materialDropdownSlot === slot ? (
                        <View style={styles.materialDropdownList}>
                          <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                            {loadingMaterials ? (
                              <View style={{ padding: 12 }}>
                                <Text style={{ fontSize: 13, color: '#6b7280' }}>Loading...</Text>
                              </View>
                            ) : dropdownList.length === 0 ? (
                              <View style={{ padding: 12 }}>
                                <Text style={{ fontSize: 13, color: '#6b7280' }}>No materials yet</Text>
                              </View>
                            ) : (
                              <>
                                <TouchableOpacity
                                  style={styles.dropdownOption}
                                  onPress={() => {
                                    setSlotSelection(slot, null);
                                    setMaterialDropdownSlot(null);
                                  }}
                                >
                                  <Text style={styles.dropdownOptionText}>None</Text>
                                </TouchableOpacity>
                                {dropdownList.map((material) => (
                                  <TouchableOpacity
                                    key={material.id}
                                    style={[styles.dropdownOption, dropdownSelectedId === material.id && styles.dropdownOptionSelected]}
                                    onPress={() => {
                                      setSlotSelection(slot, material.id);
                                      setMaterialDropdownSlot(null);
                                    }}
                                  >
                                    <Text style={[styles.dropdownOptionText, dropdownSelectedId === material.id && styles.dropdownOptionTextSelected]}>
                                      {material.title || material.provider_name || 'Untitled Material'}
                                    </Text>
                                    {dropdownSelectedId === material.id ? <CheckCircle size={16} color="#3b82f6" /> : null}
                                  </TouchableOpacity>
                                ))}
                              </>
                            )}
                          </ScrollView>
                        </View>
                      ) : null}
                    </View>
                    {selectedId ? (
                      <TouchableOpacity
                        style={styles.clearMaterialButton}
                        onPress={() => setSlotSelection(slot, null)}
                      >
                        <Text style={styles.clearMaterialText}>Clear</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.addMaterialButton}
                      onPress={() => {
                        setMaterialDropdownSlot(null);
                        setAddMaterialDefaultRole(slot === MATERIAL_SLOT.SYLLABUS ? 'syllabus' : 'lesson_plan');
                        setShowAddMaterialModal(true);
                      }}
                    >
                      <Plus size={14} color="#B8D7F9" />
                      <Text style={styles.addMaterialText}>{addLabel}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );

              const addUnitsLinkWeb = Platform.OS === 'web' ? { cursor: 'pointer' } : {};

              return (
                <>
                  {hasUnitsOrLessonsContent && hasCurrentUnitsModalContent ? (
                    <View style={styles.addUnitsRow}>
                      <TouchableOpacity onPress={() => setShowCurrentUnitsModal(true)} activeOpacity={0.7} {...addUnitsLinkWeb}>
                        <Text style={styles.addUnitsLink}>View current units</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <View style={styles.addUnitsPillsRow}>
                    <TouchableOpacity style={styles.secondaryActionPill} onPress={() => openAddUnitsCurriculumAction('manual')} activeOpacity={0.8} {...addUnitsLinkWeb}>
                      <View style={styles.secondaryActionInner}>
                        <Plus size={14} color="#5E6C84" />
                        <Text style={styles.secondaryActionText}>Add units</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryActionPill} onPress={() => openAddUnitsCurriculumAction('generate')} activeOpacity={0.8} {...addUnitsLinkWeb}>
                      <View style={styles.secondaryActionInner}>
                        <Sparkles size={14} color="#5E6C84" />
                        <Text style={styles.secondaryActionText}>Generate curriculum</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryActionPill} onPress={() => openAddUnitsCurriculumAction('upload')} activeOpacity={0.8} {...addUnitsLinkWeb}>
                      <View style={styles.secondaryActionInner}>
                        <Upload size={14} color="#5E6C84" />
                        <Text style={styles.secondaryActionText}>Upload material</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryActionPill} onPress={() => openAddUnitsCurriculumAction('paste')} activeOpacity={0.8} {...addUnitsLinkWeb}>
                      <View style={styles.secondaryActionInner}>
                        <Pencil size={14} color="#5E6C84" />
                        <Text style={styles.secondaryActionText}>Paste plain text</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                <View
                  style={[
                    styles.materialsAccordionWrap,
                    materialDropdownSlot && styles.materialsAccordionWrapOpen,
                  ]}
                >
                  <ModalSectionCard
                    Icon={Library}
                    title="Syllabus and lesson plan"
                    subtitle="Units, pacing, and lesson structure"
                    expanded={showMaterialsAccordion}
                    onPress={() => setShowMaterialsAccordion(!showMaterialsAccordion)}
                    accent="#5A92D6"
                    allowOverflow
                  >
                      <View style={styles.accordionContent}>
                        {renderAttachmentRow(
                          MATERIAL_SLOT.SYLLABUS,
                          'Syllabus',
                          'Add syllabus',
                          selectedSyllabusMaterialId
                        )}
                        {renderAttachmentRow(
                          MATERIAL_SLOT.LESSON_PLAN,
                          'Lesson plan',
                          'Add lesson plan',
                          selectedLessonPlanMaterialId
                        )}
                      </View>
                  </ModalSectionCard>
                </View>
                </>
              );
            })()}

            {/* Accordion C: Planning preferences */}
            <ModalSectionCard
              Icon={SlidersHorizontal}
              title={PLANNING_PREFERENCES_UI.subjectModalAccordionTitle}
              subtitle="Cadence, defaults, and planner behavior"
              expanded={showPlanningAccordion}
              onPress={() => setShowPlanningAccordion(!showPlanningAccordion)}
              accent="#5A92D6"
            >
                <View style={styles.accordionContent}>
                  <View style={[styles.formGroup, styles.planningDefaultsField, styles.planningDefaultsStack]}>
                    <Text style={styles.planningPrefSectionLabel}>Learning goals</Text>
                    <View style={styles.planningPrefChipRow}>
                      <TouchableOpacity
                        style={[
                          styles.planningPrefChip,
                          goalModeForSubject === 'overall'
                            ? { borderColor: PLANNING_CHIP_SELECTED.border, backgroundColor: PLANNING_CHIP_SELECTED.background }
                            : { borderColor: '#e5e7eb', backgroundColor: '#fff' },
                        ]}
                        onPress={() => { setGoalModeForSubject('overall'); setPlanningPrefilledFromFamily(false); }}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.planningPrefChipText,
                            {
                              fontWeight: goalModeForSubject === 'overall' ? '600' : '500',
                              color: goalModeForSubject === 'overall' ? PLANNING_CHIP_SELECTED.border : '#9ca3af',
                            },
                          ]}
                        >
                          Overall
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.planningPrefChip,
                          goalModeForSubject === 'per_subject'
                            ? { borderColor: PLANNING_CHIP_SELECTED.border, backgroundColor: PLANNING_CHIP_SELECTED.background }
                            : { borderColor: '#e5e7eb', backgroundColor: '#fff' },
                        ]}
                        onPress={() => { setGoalModeForSubject('per_subject'); setPlanningPrefilledFromFamily(false); }}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={[
                            styles.planningPrefChipText,
                            {
                              fontWeight: goalModeForSubject === 'per_subject' ? '600' : '500',
                              color: goalModeForSubject === 'per_subject' ? PLANNING_CHIP_SELECTED.border : '#9ca3af',
                            },
                          ]}
                        >
                          Per subject
                        </Text>
                      </TouchableOpacity>
                    </View>
                    {goalModeForSubject === 'overall' && (
                      <View style={{ marginTop: 12, padding: 10, backgroundColor: '#f9fafb', borderRadius: 8 }}>
                        {familyPlannerContext ? (
                          <>
                            <Text style={{ fontSize: 13, color: '#374151' }}>
                              {familyPlannerContext.mode === 'days' && familyPlannerContext.days
                                ? `Target: ${familyPlannerContext.days} days per year`
                                : familyPlannerContext.mode === 'hours' && familyPlannerContext.hours
                                  ? `Target: ${familyPlannerContext.hours} hours per year`
                                  : 'No target set'}
                            </Text>
                            {planningPrefilledFromFamily && (
                              <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>
                                {`Settings for ${schoolYear} • ${(TERM_OPTIONS.find((opt) => opt.id === schoolTerm) || TERM_OPTIONS[0]).label}. Prefilled from family planning settings. Make changes here and it will sync in both places.`}
                              </Text>
                            )}
                          </>
                        ) : (
                          <Text style={{ fontSize: 13, color: '#6b7280' }}>Loading…</Text>
                        )}
                      </View>
                    )}
                  </View>

                  {goalModeForSubject === 'per_subject' && (
                    <View style={[styles.formGroup, styles.planningDefaultsField, styles.planningDefaultsStack]}>
                      <Text style={styles.planningPrefSectionLabel}>Target</Text>
                      <View style={[styles.planningPrefChipRow, { marginBottom: 8 }]}>
                        <TouchableOpacity
                          style={[
                            styles.planningPrefChip,
                            targetMode === 'none'
                              ? { borderColor: PLANNING_CHIP_SELECTED.border, backgroundColor: PLANNING_CHIP_SELECTED.background }
                              : { borderColor: '#e5e7eb', backgroundColor: '#fff' },
                          ]}
                          onPress={() => { setTargetMode('none'); setPlanningPrefilledFromFamily(false); }}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.planningPrefChipText,
                              {
                                fontWeight: targetMode === 'none' ? '600' : '500',
                                color: targetMode === 'none' ? PLANNING_CHIP_SELECTED.border : '#6b7280',
                              },
                            ]}
                          >
                            None
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.planningPrefChip,
                            targetMode === 'days'
                              ? { borderColor: PLANNING_CHIP_SELECTED.border, backgroundColor: PLANNING_CHIP_SELECTED.background }
                              : { borderColor: '#e5e7eb', backgroundColor: '#fff' },
                          ]}
                          onPress={() => { setTargetMode('days'); setPlanningPrefilledFromFamily(false); }}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.planningPrefChipText,
                              {
                                fontWeight: targetMode === 'days' ? '600' : '500',
                                color: targetMode === 'days' ? PLANNING_CHIP_SELECTED.border : '#6b7280',
                              },
                            ]}
                          >
                            Days
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.planningPrefChip,
                            targetMode === 'hours'
                              ? { borderColor: PLANNING_CHIP_SELECTED.border, backgroundColor: PLANNING_CHIP_SELECTED.background }
                              : { borderColor: '#e5e7eb', backgroundColor: '#fff' },
                          ]}
                          onPress={() => { setTargetMode('hours'); setPlanningPrefilledFromFamily(false); }}
                          activeOpacity={0.8}
                        >
                          <Text
                            style={[
                              styles.planningPrefChipText,
                              {
                                fontWeight: targetMode === 'hours' ? '600' : '500',
                                color: targetMode === 'hours' ? PLANNING_CHIP_SELECTED.border : '#6b7280',
                              },
                            ]}
                          >
                            Hours
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {targetMode === 'days' && (
                        <View style={{ marginTop: 0 }}>
                          <Text style={[styles.label, { fontSize: 12, marginBottom: 4 }]}>Days per year</Text>
                          <TextInput
                            style={styles.input}
                            value={defaultTargetDays}
                            onChangeText={(v) => { setDefaultTargetDays(v); setPlanningPrefilledFromFamily(false); }}
                            placeholder="e.g. 36"
                            placeholderTextColor="#9ca3af"
                            keyboardType="number-pad"
                          />
                        </View>
                      )}
                      {targetMode === 'hours' && (
                        <View style={{ marginTop: 0 }}>
                          <Text style={[styles.label, { fontSize: 12, marginBottom: 4 }]}>Hours per year</Text>
                          <TextInput
                            style={styles.input}
                            value={defaultTargetHours}
                            onChangeText={(v) => { setDefaultTargetHours(v); setPlanningPrefilledFromFamily(false); }}
                            placeholder="e.g. 72"
                            placeholderTextColor="#9ca3af"
                            keyboardType="decimal-pad"
                          />
                        </View>
                      )}
                      {planningPrefilledFromFamily && familyPlannerContext && (familyPlannerContext.days || familyPlannerContext.hours) && (
                        <Text style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>
                          {`Settings for ${schoolYear} • ${(TERM_OPTIONS.find((opt) => opt.id === schoolTerm) || TERM_OPTIONS[0]).label}. Prefilled from family planning settings. Make changes here and it will sync in both places.`}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
            </ModalSectionCard>

            <ModalSectionCard
              Icon={MapPin}
              title="Logistical details"
              subtitle="Location, mode, and calendar sync"
              expanded={showLogisticsAccordion}
              onPress={() => setShowLogisticsAccordion(!showLogisticsAccordion)}
              accent="#5A92D6"
            >
              <View style={styles.accordionContent}>
                <View style={styles.logisticsRow}>
                  <View style={styles.logisticsField}>
                    <Text style={styles.label}>Location (optional)</Text>
                    <TextInput
                      style={styles.input}
                      value={logisticalLocation}
                      onChangeText={setLogisticalLocation}
                      placeholder="e.g. Library, Park, etc."
                      placeholderTextColor="#9ca3af"
                    />
                    <View style={{ marginTop: 12 }}>
                      <Text style={styles.label}>Instructor / Host (optional)</Text>
                      <TextInput
                        style={styles.input}
                        value={logisticalInstructor}
                        onChangeText={setLogisticalInstructor}
                        placeholder="e.g. Elisa"
                        placeholderTextColor="#9ca3af"
                      />
                    </View>
                  </View>
                  <View style={styles.logisticsField}>
                    <Text style={styles.label}>Mode (optional)</Text>
                    <View style={styles.logisticsChipRow}>
                      {MODE_OPTIONS.map((option) => {
                        const isActive = logisticalMode === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            onPress={() => setLogisticalMode(isActive ? '' : option)}
                            style={[styles.logisticsChip, isActive && styles.logisticsChipActive]}
                            activeOpacity={0.8}
                          >
                            <Text style={[styles.logisticsChipText, isActive && styles.logisticsChipTextActive]}>
                              {option.charAt(0).toUpperCase() + option.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={[styles.label, { marginTop: 10 }]}>Add to connected calendar</Text>
                    <View style={styles.logisticsChipRow}>
                      {CALENDAR_CONNECTION_OPTIONS.map((provider) => {
                        const isSelected = connectedCalendarTargets.includes(provider.value);
                        return (
                          <TouchableOpacity
                            key={provider.value}
                            onPress={() =>
                              setConnectedCalendarTargets((prev) =>
                                prev.includes(provider.value)
                                  ? prev.filter((value) => value !== provider.value)
                                  : [...prev, provider.value]
                              )
                            }
                            style={[styles.logisticsChip, isSelected && styles.logisticsChipActive]}
                            activeOpacity={0.8}
                          >
                            <View style={styles.calendarChipContent}>
                              {isSelected ? <CheckCircle size={12} color="#6BB3E8" /> : null}
                              <Text style={[styles.logisticsChipText, isSelected && styles.logisticsChipTextActive]}>
                                {provider.label}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
            </ModalSectionCard>

            {/* Additional notes — same card pattern as Add Child */}
            <ModalSectionCard
              Icon={FileText}
              title="Additional notes"
              subtitle="Anything extra for this subject"
              expanded={showAdditionalNotesAccordion}
              onPress={() => setShowAdditionalNotesAccordion(!showAdditionalNotesAccordion)}
              accent="#5A92D6"
            >
                <View style={styles.accordionContent}>
                  <View style={styles.formGroup}>
                    <TextInput
                      style={[styles.input, styles.textArea]}
                      placeholder="Add any additional notes about this subject"
                      value={additionalNotes}
                      onChangeText={setAdditionalNotes}
                      placeholderTextColor="#9ca3af"
                      multiline
                      numberOfLines={3}
                      textAlignVertical="top"
                    />
                  </View>
                </View>
            </ModalSectionCard>

            {/* Event management (edit + draft mode after Add Units) */}
            {effectiveSubjectId && (
              <ModalSectionCard
                Icon={Calendar}
                title="Event management"
                subtitle={
                  loadingEvents || loadingCurriculum
                    ? 'Loading linked events and lessons...'
                    : `${subjectEvents.length} linked event${subjectEvents.length === 1 ? '' : 's'}${unscheduledLessons.length ? ` · ${unscheduledLessons.length} unscheduled lesson${unscheduledLessons.length === 1 ? '' : 's'}` : ''}`
                }
                expanded={showEventMgmtAccordion}
                onPress={() => setShowEventMgmtAccordion(!showEventMgmtAccordion)}
                accent="#5A92D6"
              >
                <View style={styles.accordionContent}>
                  <View style={[styles.eventManagementSection, { marginTop: 0, paddingTop: 0, borderTopWidth: 0 }]}>
                    <View style={styles.eventManagementHeader}>
                      <Text style={styles.eventManagementTitle}>Event Management</Text>
                      {loadingEvents ? (
                        <Text style={styles.eventCountText}>Loading...</Text>
                      ) : (
                        <Text style={styles.eventCountText}>
                          {subjectEvents.length} event{subjectEvents.length === 1 ? '' : 's'} found
                        </Text>
                      )}
                    </View>

                    {subjectEvents.length > 0 && (
                      <View style={styles.eventActions}>
                        <TouchableOpacity
                          style={[
                            styles.eventActionButton,
                            styles.markAttendedButton,
                            (markingAttended || deletingEvents) && styles.eventActionButtonDisabled
                          ]}
                          onPress={handleMarkAllAttended}
                          disabled={markingAttended || deletingEvents}
                        >
                          <CheckCircle size={16} color="#10B981" />
                          <Text style={[styles.eventActionButtonText, styles.markAttendedButtonText]}>
                            {markingAttended ? 'Marking...' : 'Mark All as Attended'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.eventActionButton,
                            styles.deleteEventsButton,
                            (deletingEvents || markingAttended) && styles.eventActionButtonDisabled
                          ]}
                          onPress={handleDeleteAllEvents}
                          disabled={deletingEvents || markingAttended}
                        >
                          <Trash2 size={16} color="#EF4444" />
                          <Text style={[styles.eventActionButtonText, styles.deleteEventsButtonText]}>
                            {deletingEvents ? 'Deleting...' : 'Delete All Events'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {unscheduledLessons.length > 0 && (
                      <View style={styles.unscheduledLessonsWrap}>
                        <Text style={styles.unscheduledLessonsTitle}>
                          Unscheduled lessons ({unscheduledLessons.length})
                        </Text>
                        {unscheduledLessons.slice(0, 8).map((row) => (
                          <Text key={row.id} style={styles.unscheduledLessonRow}>
                            {row.unitTitle} · {row.lessonTitle}
                          </Text>
                        ))}
                        {unscheduledLessons.length > 8 ? (
                          <Text style={styles.unscheduledLessonsMore}>
                            +{unscheduledLessons.length - 8} more
                          </Text>
                        ) : null}
                      </View>
                    )}
                  </View>
                </View>
              </ModalSectionCard>
            )}

            {/* Accordion E: Danger zone (edit mode only) */}
            {subject && subject.id && (
              <View style={styles.dangerZoneAccordion}>
                <TouchableOpacity
                  onPress={() => setShowDangerZone(!showDangerZone)}
                  style={styles.dangerZoneHeader}
                  activeOpacity={0.8}
                >
                  <View style={styles.dangerZoneHeaderLeft}>
                    <AlertTriangle size={16} color={colors.redBold || '#dc2626'} />
                    <Text style={styles.dangerZoneTitle}>Danger zone</Text>
                  </View>
                  {showDangerZone ? <ChevronUp size={20} color={colors.redBold || '#dc2626'} /> : <ChevronDown size={20} color={colors.redBold || '#dc2626'} />}
                </TouchableOpacity>
                {showDangerZone && (
                  <View style={styles.dangerZoneContent}>
                    <View style={styles.dangerSection}>
                      <Text style={styles.dangerSectionTitle}>Delete permanently</Text>
                      <Text style={styles.dangerSectionDescription}>
                        This removes the subject and all its events, materials, and syllabus data for{' '}
                        <Text style={styles.dangerSectionBold}>{subjectName || subject.name || 'this subject'}</Text>. This cannot be undone.
                      </Text>
                      <Text style={styles.dangerInputLabel}>Type the subject name to confirm</Text>
                      <TextInput
                        style={styles.dangerInput}
                        value={confirmDeleteSubjectName}
                        onChangeText={setConfirmDeleteSubjectName}
                        placeholder={subjectName || subject.name || ''}
                        placeholderTextColor="#9ca3af"
                        autoCapitalize="words"
                      />
                      <TouchableOpacity
                        style={[
                          styles.dangerDeleteButton,
                          (confirmDeleteSubjectName.trim().toLowerCase() !== (subjectName || subject.name || '').trim().toLowerCase() || deletingSubject) && styles.dangerDeleteButtonDisabled,
                        ]}
                        onPress={performDeleteSubject}
                        disabled={
                          confirmDeleteSubjectName.trim().toLowerCase() !== (subjectName || subject.name || '').trim().toLowerCase() || deletingSubject
                        }
                      >
                        <Text style={styles.dangerDeleteButtonText}>
                          {deletingSubject ? 'Deleting...' : `Delete ${subjectName || subject.name || 'subject'}`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}
          </AppModalShell>
        </TouchableOpacity>
      </View>

      <ConfirmDialog
        visible={deleteEventsConfirm.visible}
        title="Delete All Events"
        message={`Are you sure you want to delete all ${subjectEvents.length} event${subjectEvents.length === 1 ? '' : 's'} for this subject? This action cannot be undone.`}
        confirmLabel="OK"
        cancelLabel="Cancel"
        onConfirm={async () => {
          setDeleteEventsConfirm({ visible: false });
          await performDeleteAllEvents();
        }}
        onCancel={() => setDeleteEventsConfirm({ visible: false })}
      />

      {Platform.OS === 'web'
        ? (
          showCurrentUnitsModal && typeof document !== 'undefined'
            ? ReactDOM.createPortal(
              <View style={styles.currentUnitsModalWebLayer}>
                <View style={styles.currentUnitsModalBackdrop}>
                  <View style={styles.currentUnitsModalCard}>
                    <View style={styles.currentUnitsModalHeader}>
                      <Text style={styles.currentUnitsModalTitle}>Current units</Text>
                      <TouchableOpacity onPress={() => setShowCurrentUnitsModal(false)} activeOpacity={0.7} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                        <Text style={styles.currentUnitsModalClose}>Close</Text>
                      </TouchableOpacity>
                    </View>
                    <ScrollView style={styles.currentUnitsModalScroll} contentContainerStyle={styles.currentUnitsModalScrollContent}>
                      {unitsForCurrentUnitsModal.map((unit, index) => (
                        <View key={`${unit.title || 'unit'}-${index}`} style={styles.currentUnitCard}>
                          <Text style={styles.currentUnitTitle}>{unit.title || `Unit ${index + 1}`}</Text>
                          {(unit.lessons || []).map((lesson, lessonIndex) => (
                            <Text
                              key={`${lesson.id || lesson.title || 'lesson'}-${lessonIndex}`}
                              style={styles.currentLessonRow}
                            >
                              {lessonIndex + 1}. {lesson.title || 'Lesson'}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </View>,
              document.body
            )
            : null
        ) : (
          <RNModal
            visible={showCurrentUnitsModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCurrentUnitsModal(false)}
          >
            <View style={styles.currentUnitsModalBackdrop}>
              <View style={styles.currentUnitsModalCard}>
                <View style={styles.currentUnitsModalHeader}>
                  <Text style={styles.currentUnitsModalTitle}>Current units</Text>
                  <TouchableOpacity onPress={() => setShowCurrentUnitsModal(false)} activeOpacity={0.7}>
                    <Text style={styles.currentUnitsModalClose}>Close</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.currentUnitsModalScroll} contentContainerStyle={styles.currentUnitsModalScrollContent}>
                  {unitsForCurrentUnitsModal.map((unit, index) => (
                    <View key={`${unit.title || 'unit'}-${index}`} style={styles.currentUnitCard}>
                      <Text style={styles.currentUnitTitle}>{unit.title || `Unit ${index + 1}`}</Text>
                      {(unit.lessons || []).map((lesson, lessonIndex) => (
                        <Text
                          key={`${lesson.id || lesson.title || 'lesson'}-${lessonIndex}`}
                          style={styles.currentLessonRow}
                        >
                          {lessonIndex + 1}. {lesson.title || 'Lesson'}
                        </Text>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              </View>
            </View>
          </RNModal>
        )}
    </RNModal>

    <AddMaterialModal
      key={
        showAddMaterialModal
          ? `subject-add-material-${addMaterialDefaultRole ?? 'any'}-${subjectName.trim()}-${selectedChildIds.join(',')}`
          : 'subject-add-material-closed'
      }
      visible={showAddMaterialModal}
      onClose={() => {
        setShowAddMaterialModal(false);
        setAddMaterialDefaultRole(null);
      }}
      onSaved={(newMaterial) => {
        loadMaterials();
        if (newMaterial?.id && addMaterialDefaultRole) {
          const slot =
            addMaterialDefaultRole === 'syllabus' ? MATERIAL_SLOT.SYLLABUS : MATERIAL_SLOT.LESSON_PLAN;
          setSlotSelection(slot, newMaterial.id);
        }
        setAddMaterialDefaultRole(null);
      }}
      familyId={familyId}
      children={children}
      defaultRole={addMaterialDefaultRole ?? null}
      defaultSubjectId={subject?.id ?? draftSubjectId ?? null}
      defaultSubjectName={!subject && subjectName.trim() ? subjectName.trim() : null}
      defaultChildIds={selectedChildIds}
      draftSubjectForMaterial={
        !subject && subjectName.trim()
          ? { name: subjectName.trim(), childIds: selectedChildIds.length > 0 ? [...selectedChildIds] : [] }
          : null
      }
    />
    <ManualCurriculumBuilderModal
      visible={showManualUnitsModal}
      onClose={() => setShowManualUnitsModal(false)}
      subjectId={subject?.id ?? draftSubjectId ?? null}
      subjectName={(subjectName || '').trim() || subject?.name || 'Subject'}
      familyId={familyId}
      onSaved={() => {
        setShowManualUnitsModal(false);
        refreshAfterUnitsSaved(subject?.id ?? draftSubjectId ?? null);
      }}
    />
    <ParsePlainTextModal
      visible={showParseUnitsModal}
      onClose={() => setShowParseUnitsModal(false)}
      subjectId={subject?.id ?? draftSubjectId ?? null}
      subjectName={(subjectName || '').trim() || subject?.name || 'Subject'}
      familyId={familyId}
      childIds={selectedChildIds}
      onSaved={() => {
        setShowParseUnitsModal(false);
        refreshAfterUnitsSaved(subject?.id ?? draftSubjectId ?? null);
      }}
    />
    <BuildCurriculumModal
      visible={showGenerateUnitsModal}
      onClose={() => setShowGenerateUnitsModal(false)}
      familyId={familyId}
      children={children}
      selectedChildIds={selectedChildIds}
      initialSubjectId={subject?.id ?? draftSubjectId ?? null}
      initialSubjectName={(subjectName || '').trim() || subject?.name || 'Subject'}
      initialInputMode="topic"
      onComplete={() => {
        setShowGenerateUnitsModal(false);
        refreshAfterUnitsSaved(subject?.id ?? draftSubjectId ?? null);
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalWrap: {
    width: '100%',
    maxWidth: 860,
  },
  shellBody: {
    paddingTop: 18,
  },
  scrollContainer: {
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: {
        flexGrow: 0,
        flexShrink: 1,
        minHeight: 0,
        // Modal is max 85vh; reserve ~88px for footer + borders so short forms don’t stretch with dead space
        maxHeight: 'calc(85vh - 88px)',
      },
      default: {
        flex: 1,
      },
    }),
  },
  scrollContent: {
    paddingBottom: 18,
  },
  addUnitsPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  secondaryActionPill: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D9E0EA',
    backgroundColor: '#F8FAFD',
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  secondaryActionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secondaryActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5E6C84',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scrollContentOld: {
    padding: 32,
    // Small inset only — footer sits outside ScrollView, so large padding created a false “gap”
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerEdit: {
    borderBottomWidth: 0,
    paddingBottom: 0,
    paddingTop: 24,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconWrap: {
    marginRight: 2,
  },
  headerDivider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginHorizontal: 20,
    marginTop: 20,
  },
  footerDivider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    padding: 4,
    justifyContent: 'center',
    marginLeft: 16,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: 20,
  },
  /** Tighter vertical rhythm inside Planning Preferences accordion only */
  planningDefaultsField: {
    marginBottom: 8,
  },
  planningDefaultsStack: {
    marginTop: 8,
  },
  planningPrefChipRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 4,
  },
  planningPrefChip: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 14,
    borderWidth: 1,
  },
  planningPrefChipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  planningPrefSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text || '#0f172a',
    marginBottom: 5,
  },
  planningPrefContextLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  logisticsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    marginBottom: 12,
  },
  logisticsField: {
    flex: 1,
    minWidth: 240,
  },
  logisticsChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  logisticsChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  logisticsChipActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  logisticsChipText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  logisticsChipTextActive: {
    color: '#6BB3E8',
    fontWeight: '700',
  },
  calendarChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  addUnitsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
    gap: 0,
  },
  materialsAccordionWrap: {
    position: 'relative',
    zIndex: 1,
  },
  materialsAccordionWrapOpen: {
    zIndex: 260,
    ...(Platform.OS === 'web' && { isolation: 'isolate' }),
  },
  addUnitsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  addUnitsLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6BB3E8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      textDecorationLine: 'underline',
    }),
  },
  addUnitsSep: {
    fontSize: 14,
    color: '#9ca3af',
    marginHorizontal: 6,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  accordionSection: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
  },
  /** Add-subject flow: planning is last before footer — keep gap minimal */
  accordionSectionLastInForm: {
    marginBottom: 4,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  accordionContent: {
    marginTop: 4,
    paddingTop: 0,
  },
  accordionSectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text || '#0f172a',
    marginBottom: 4,
  },
  subjectNameLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectNameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
      transition: 'border-color 0.15s ease',
    }),
  },
  subjectNameInputFocused: {
    borderColor: '#6BB3E8',
    borderWidth: 1.5,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border || 'rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: colors.text || '#0f172a',
    backgroundColor: colors.card || '#ffffff',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border || 'rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.card || '#ffffff',
  },
  dropdownButtonText: {
    fontSize: 14,
    color: colors.text || '#0f172a',
  },
  schoolScopeField: {
    flex: 1,
    minWidth: 220,
    position: 'relative',
  },
  schoolScopeFormGroupOpen: {
    zIndex: 120,
    ...(Platform.OS === 'web' && { isolation: 'isolate' }),
  },
  schoolScopeRow: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    position: 'relative',
    zIndex: 1,
  },
  schoolScopeRowOpen: {
    zIndex: 130,
    ...(Platform.OS === 'web' && { isolation: 'isolate' }),
  },
  schoolScopeFieldOpen: {
    zIndex: 140,
    ...(Platform.OS === 'web' && { isolation: 'isolate' }),
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    maxHeight: 200,
    zIndex: 150,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dropdownOptionSelected: {
    backgroundColor: 'rgba(79, 70, 229, 0.08)',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  dropdownOptionTextSelected: {
    color: colors.accent || '#4F46E5',
    fontWeight: '600',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  childrenScroll: {
    marginTop: 6,
  },
  childChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  childChipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  childChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childChipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeScroll: {
    marginTop: 6,
  },
  gradeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginRight: 6,
  },
  gradeChipSelected: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  gradeChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeChipTextSelected: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: 12,
  },
  footerEdit: {
    borderTopWidth: 0,
  },
  cancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      cursor: 'pointer',
    }),
  },
  saveButtonText: {
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
  required: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  materialSelectorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  materialAttachmentFormGroupOpen: {
    zIndex: 160,
    ...(Platform.OS === 'web' && { isolation: 'isolate' }),
  },
  materialSelectorFieldWrap: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
  materialSelectorFieldWrapOpen: {
    zIndex: 170,
    ...(Platform.OS === 'web' && { isolation: 'isolate' }),
  },
  materialSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border || 'rgba(15, 23, 42, 0.08)',
    borderRadius: 8,
    padding: 10,
    backgroundColor: colors.card || '#ffffff',
  },
  materialDropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    maxHeight: 220,
    zIndex: 180,
  },
  materialSelectorText: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  materialSelectorPlaceholder: {
    color: '#9ca3af',
  },
  clearMaterialButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
  },
  clearMaterialText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  addMaterialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#B8D7F9',
  },
  addMaterialText: {
    fontSize: 13,
    color: '#1e40af',
    fontWeight: '600',
  },
  eventManagementSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
  },
  eventManagementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  eventManagementTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eventCountText: {
    fontSize: 13,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  eventActions: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  eventActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  markAttendedButton: {
    backgroundColor: '#F0FDF4',
    borderColor: '#10B981',
  },
  deleteEventsButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#EF4444',
  },
  eventActionButtonDisabled: {
    opacity: 0.5,
    ...(Platform.OS === 'web' && {
      cursor: 'not-allowed',
    }),
  },
  eventActionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  markAttendedButtonText: {
    color: '#10B981',
  },
  deleteEventsButtonText: {
    color: '#EF4444',
  },
  unscheduledLessonsWrap: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
    gap: 6,
  },
  unscheduledLessonsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unscheduledLessonRow: {
    fontSize: 12,
    lineHeight: 17,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unscheduledLessonsMore: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: '#6BB3E8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentUnitsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  currentUnitsModalWebLayer: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 2147483000,
  },
  currentUnitsModalCard: {
    width: '100%',
    maxWidth: 760,
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  currentUnitsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  currentUnitsModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentUnitsModalClose: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      textDecorationLine: 'underline',
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentUnitsModalScroll: {
    flexGrow: 0,
  },
  currentUnitsModalScrollContent: {
    paddingBottom: 8,
    gap: 12,
  },
  currentUnitCard: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  currentUnitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  currentLessonRow: {
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  // Danger zone accordion
  dangerZoneAccordion: {
    marginTop: 0,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.25)',
    borderRadius: 12,
    padding: 10,
    backgroundColor: 'rgba(254, 242, 242, 0.5)',
  },
  dangerZoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  dangerZoneHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dangerZoneTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.redBold || '#dc2626',
  },
  dangerZoneContent: {
    marginTop: 12,
  },
  dangerSection: {
    backgroundColor: colors.redSoft || '#fef2f2',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: (colors.redBold || '#dc2626') + '40',
    padding: 16,
  },
  dangerSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  dangerSectionDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
    marginBottom: 12,
  },
  dangerSectionBold: {
    fontWeight: '600',
  },
  dangerInputLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginBottom: 4,
    marginTop: 8,
  },
  dangerInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#111827',
    backgroundColor: '#ffffff',
    marginBottom: 12,
  },
  dangerDeleteButton: {
    backgroundColor: colors.redBold || '#dc2626',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  dangerDeleteButtonDisabled: {
    backgroundColor: colors.redSoft || '#fef2f2',
    opacity: 0.5,
  },
  dangerDeleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
});

