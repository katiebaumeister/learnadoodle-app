import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, TextInput } from 'react-native';
import { ChevronDown, CheckCircle, BookOpen, FileText, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { isAbortLikeError } from '../lib/apiClient';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
import { parseChildIds } from '../lib/services/subjectsClient';
import { fetchSubjectCurriculumEventsStructure } from '../lib/services/curriculumClient';
import { getSubjectProgressCache, mergeSubjectProgressCache } from '../lib/subjectProgressPlanCache';
import { useModalStackElevation } from './hooks/useModalStackElevation';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import { ModalSectionCard } from './ui/ModalSectionCard';
import ConfirmDialog from './ConfirmDialog';
import {
  deleteSubjectCascade,
  dispatchSubjectDeletedSideEffects,
} from '../lib/services/deleteSubjectCascade';

const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

const formatSchoolYearLabel = (startYear) => `${startYear}/${String(startYear + 1).slice(-2)}`;
const parseSchoolYearLabel = (label) => {
  const text = String(label || '').trim();
  const match = text.match(/^(\d{4})\s*\/\s*(\d{2,4})$/);
  if (!match) return null;
  const start = Number(match[1]);
  let end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end < 100) end = Math.floor(start / 100) * 100 + end;
  if (end !== start + 1) return null;
  return { start, end };
};
const normalizeSchoolYearLabel = (label) => {
  const parsed = parseSchoolYearLabel(label);
  return parsed ? formatSchoolYearLabel(parsed.start) : '';
};

function getFallbackSchoolYearOptions() {
  const now = new Date();
  const currentStart = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 12 }, (_, idx) => formatSchoolYearLabel(currentStart + idx));
}
const TERM_OPTIONS = [
  { id: 'full_year', label: 'Full year' },
  { id: 'fall_term', label: 'Fall term' },
  { id: 'spring_term', label: 'Spring term' },
];
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
  const [grade, setGrade] = useState('');
  const [gradeManuallyEdited, setGradeManuallyEdited] = useState(false);
  const [schoolYear, setSchoolYear] = useState(initialSchoolYear || getDefaultSchoolYear());
  const [schoolYearOptions, setSchoolYearOptions] = useState(() => getFallbackSchoolYearOptions());
  const [showSchoolYearDropdown, setShowSchoolYearDropdown] = useState(false);
  const [schoolTerm, setSchoolTerm] = useState(initialSchoolTerm || getDefaultSchoolTerm());
  const [showSchoolTermDropdown, setShowSchoolTermDropdown] = useState(false);
  const [credits, setCredits] = useState('');
  const [logisticalLocation, setLogisticalLocation] = useState('');
  const [logisticalMode, setLogisticalMode] = useState('');
  const [logisticalInstructor, setLogisticalInstructor] = useState('');
  const [connectedCalendarTargets, setConnectedCalendarTargets] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [showMaterialDropdown, setShowMaterialDropdown] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState(null);
  const [children, setChildren] = useState(propChildren || []);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible);
  const hasSetChildIdsRef = useRef(false);
  const lastSubjectIdRef = useRef(null);
  const cleanupDraftInFlightRef = useRef(false);
  
  // Event management state
  const [subjectEvents, setSubjectEvents] = useState([]);
  const [curriculumUnits, setCurriculumUnits] = useState([]);
  const [loadingCurriculum, setLoadingCurriculum] = useState(false);
  const [hasLoadedCurriculumOnce, setHasLoadedCurriculumOnce] = useState(false);

  // Accordion state (all collapsed by default)
  const [showAdditionalNotesAccordion, setShowAdditionalNotesAccordion] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [showDeleteSubjectConfirm, setShowDeleteSubjectConfirm] = useState(false);
  /** Add-mode draft subject persisted early so unit structure can be saved before final subject save. */
  const [draftSubjectId, setDraftSubjectId] = useState(null);
  const effectiveSubjectId = subject?.id ?? draftSubjectId ?? null;
  const draftSubjectIdRef = useRef(null);
  const [openingAddUnits, setOpeningAddUnits] = useState(false);
  const finalizedSubjectSaveRef = useRef(false);
  const materialDropdownRef = useRef(null);
  const schoolYearDropdownRef = useRef(null);
  const schoolTermDropdownRef = useRef(null);

  useEffect(() => {
    draftSubjectIdRef.current = draftSubjectId || null;
  }, [draftSubjectId]);

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

      // If editing a subject, populate fields (but wait for children to load for child IDs)
      if (subject) {
        setSubjectName(subject.name || '');
        setAdditionalNotes(subject.notes || subject.summary || '');
        setGrade(subject.grade || '');
        setGradeManuallyEdited(true);
        setSchoolYear(subject.school_year || getDefaultSchoolYear());
        setSchoolTerm(subject.school_term || getDefaultSchoolTerm());
        setCredits(subject.credits ? String(subject.credits) : '');
        setLogisticalLocation(subject.location || '');
        setLogisticalMode(subject.mode || '');
        setLogisticalInstructor(subject.instructor || '');
        setConnectedCalendarTargets(normalizeCalendarTargets(subject.connected_calendar_targets));
        setShowMaterialDropdown(false);
        // Child IDs will be set in the next useEffect after children load
        // Load events for this subject
        loadSubjectEvents(subject.id);
      } else {
        // Add mode - use defaults
        setAdditionalNotes('');
        setGrade('');
        setGradeManuallyEdited(false);
        setSchoolYear(initialSchoolYear || getDefaultSchoolYear());
        setSchoolTerm(initialSchoolTerm || getDefaultSchoolTerm());
        setLogisticalLocation('');
        setLogisticalMode('');
        setLogisticalInstructor('');
        setConnectedCalendarTargets([]);
        setSelectedMaterialId(null);
        setShowMaterialDropdown(false);
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
      setGrade('');
      setGradeManuallyEdited(false);
      setSchoolYear(getDefaultSchoolYear());
      setShowSchoolYearDropdown(false);
      setSchoolTerm(getDefaultSchoolTerm());
      setShowSchoolTermDropdown(false);
      setCredits('');
      setLogisticalLocation('');
      setLogisticalMode('');
      setLogisticalInstructor('');
      setConnectedCalendarTargets([]);
      setError(null);
      setSubjectEvents([]);
      setCurriculumUnits([]);
      setLoadingCurriculum(false);
      setHasLoadedCurriculumOnce(false);
      setShowAdditionalNotesAccordion(false);
      setDraftSubjectId(null);
      setOpeningAddUnits(false);
      setShowMaterialDropdown(false);
      setSelectedMaterialId(null);
    }
  }, [visible, defaultChildId, defaultChildIds, defaultSubjectName, initialSchoolTerm, initialSchoolYear, subject]);

  useEffect(() => {
    let cancelled = false;
    const loadSchoolYearOptions = async () => {
      try {
        const { data } = await supabase
          .from('school_year_templates')
          .select('label, start_year')
          .order('start_year', { ascending: true });
        if (cancelled) return;
        const dbLabels = Array.from(
          new Set((data || []).map((row) => normalizeSchoolYearLabel(row?.label)).filter(Boolean))
        );
        const futureLabels = getFallbackSchoolYearOptions();
        const nextOptions = Array.from(new Set([...dbLabels, ...futureLabels]))
          .filter(Boolean)
          .sort((a, b) => {
            const ay = parseSchoolYearLabel(a)?.start ?? 0;
            const by = parseSchoolYearLabel(b)?.start ?? 0;
            return ay - by;
          });
        const normalizedSelected = normalizeSchoolYearLabel(schoolYear);
        if (normalizedSelected && !nextOptions.includes(normalizedSelected)) {
          nextOptions.push(normalizedSelected);
          nextOptions.sort((a, b) => {
            const ay = parseSchoolYearLabel(a)?.start ?? 0;
            const by = parseSchoolYearLabel(b)?.start ?? 0;
            return ay - by;
          });
        }
        setSchoolYearOptions(nextOptions.length > 0 ? nextOptions : getFallbackSchoolYearOptions());
      } catch (_) {
        if (cancelled) return;
        setSchoolYearOptions((prev) => {
          const fallback = getFallbackSchoolYearOptions();
          const normalizedSelected = normalizeSchoolYearLabel(schoolYear);
          if (normalizedSelected && !fallback.includes(normalizedSelected)) fallback.push(normalizedSelected);
          return Array.isArray(prev) && prev.length > 0 ? prev : fallback;
        });
      }
    };
    if (visible) loadSchoolYearOptions();
    return () => {
      cancelled = true;
    };
  }, [visible, schoolYear]);

  // Clear transient validation/banner errors as soon as form state is corrected.
  useEffect(() => {
    if (!error) return;
    const needsSubjectName = /subject name/i.test(error);
    const needsStudent = /student/i.test(error);
    const needsFamily = /family id/i.test(error);
    const isKnownValidationError = needsSubjectName || needsStudent || needsFamily;
    if (!isKnownValidationError) return;
    if (needsSubjectName && !subjectName.trim()) return;
    if (needsStudent && selectedChildIds.length === 0) return;
    if (needsFamily && !familyId) return;
    setError(null);
  }, [error, subjectName, selectedChildIds, familyId]);

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
  ]);

  const cleanupDraftSubject = useCallback(async (candidateDraftId) => {
    const draftId = candidateDraftId || null;
    if (!draftId || !familyId) return;
    try {
      await deleteSubjectCascade(
        supabase,
        familyId,
        draftId,
        subjectName.trim() || 'Subject'
      );
    } catch (cleanupError) {
      console.warn('Failed to clean up draft subject on close:', cleanupError);
      // Best-effort hard delete fallback for draft rows when cascade helper fails.
      try {
        await supabase
          .from('subject')
          .delete()
          .eq('id', draftId)
          .eq('family_id', familyId);
      } catch (fallbackError) {
        console.warn('Fallback draft subject delete failed:', fallbackError);
      }
    } finally {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }
    }
  }, [familyId, subjectName]);

  const handleCloseWithDraftCleanup = useCallback(async () => {
    if (!onClose) return;
    setError(null);
    const currentDraftId = draftSubjectIdRef.current;
    if (subject?.id || !currentDraftId || finalizedSubjectSaveRef.current) {
      onClose();
      return;
    }
    if (cleanupDraftInFlightRef.current) return;
    cleanupDraftInFlightRef.current = true;
    try {
      await cleanupDraftSubject(currentDraftId);
      draftSubjectIdRef.current = null;
      setDraftSubjectId(null);
      onClose();
    } finally {
      cleanupDraftInFlightRef.current = false;
    }
  }, [onClose, subject?.id, cleanupDraftSubject]);

  useEffect(() => {
    // Fallback cleanup path for external close/hide flows that bypass the modal close handler.
    if (!visible) setError(null);
    if (visible) return;
    if (subject?.id || finalizedSubjectSaveRef.current) return;
    const currentDraftId = draftSubjectIdRef.current;
    if (!currentDraftId || cleanupDraftInFlightRef.current) return;
    cleanupDraftInFlightRef.current = true;
    cleanupDraftSubject(currentDraftId)
      .finally(() => {
        draftSubjectIdRef.current = null;
        setDraftSubjectId(null);
        cleanupDraftInFlightRef.current = false;
      });
  }, [visible, subject?.id, cleanupDraftSubject]);

  /** Open Add units flows directly from Add/Edit Subject (no Plan Builder modal hop). */
  const openAddUnitsCurriculumAction = useCallback(
    async (kind) => {
      if (openingAddUnits) return;
      const trimmedName = String(subjectName || '').trim();
      if (!subject?.id && !trimmedName) {
        setError('Please enter a subject name before adding units.');
        return;
      }
      if (!subject?.id && selectedChildIds.length === 0) {
        setError('Please select at least one student before adding units.');
        return;
      }
      const existingSubjectId = subject?.id ?? null;
      if (!existingSubjectId) {
        setError('Save this subject first, then add units.');
        return;
      }
      const requestedKind = String(kind || '').trim().toLowerCase();
      const routedMethod = requestedKind === 'paste' ? 'paste_plain' : requestedKind;
      const safeMethod = ['manual', 'generate', 'upload', 'paste_plain'].includes(routedMethod)
        ? routedMethod
        : 'manual';
      const yearIdForUnits = (subjectEvents || []).find((ev) => ev?.academic_year_id)?.academic_year_id || null;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        setOpeningAddUnits(true);
        window.dispatchEvent(
          new CustomEvent('openPlanYearModal', {
            detail: {
              from: 'subject_detail',
              subjectId: existingSubjectId,
              academicYearId: yearIdForUnits,
              subjectName: subjectName?.trim() || subject?.name || null,
              childIds: selectedChildIds,
              openAsModal: true,
              openToEditList: false,
              skipPlanSummary: true,
              openDirectlyToScope: true,
              initialUnitStructureMethod: safeMethod,
              subjectHasCurriculumContent: hasUnitsOrLessonsContent,
            },
          })
        );
        setTimeout(() => setOpeningAddUnits(false), 300);
        return;
      }
      setError('Add units is available in web planning flow only.');
    },
    [
      subject?.id,
      subject?.name,
      subjectName,
      selectedChildIds,
      subjectEvents,
      openingAddUnits,
    ]
  );

  // Load events for the subject
  const loadSubjectEvents = async (subjectId) => {
    if (!subjectId || !familyId) return;

    try {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_ts, status, event_type, academic_year_id')
        .eq('subject_id', subjectId)
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .neq('status', 'canceled')
        .order('start_ts', { ascending: false });
      
      if (error) throw error;
      
      setSubjectEvents(data || []);
    } catch (error) {
      if (!isAbortLikeError(error)) {
        console.error('Error loading subject events:', error);
      }
      setSubjectEvents([]);
    }
  };

  const fetchMaterials = useCallback(async () => {
    if (!familyId) {
      setMaterials([]);
      return;
    }
    try {
      setLoadingMaterials(true);
      const { data, error } = await supabase
        .from('materials')
        .select('id, title, provider_name, subject_id, created_at')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMaterials(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn('Error loading materials for subject attachment:', e);
      setMaterials([]);
    } finally {
      setLoadingMaterials(false);
    }
  }, [familyId]);

  useEffect(() => {
    if (!visible) return;
    fetchMaterials();
  }, [visible, fetchMaterials]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !visible) return;
    const onRefresh = () => fetchMaterials();
    window.addEventListener('refreshMaterials', onRefresh);
    return () => window.removeEventListener('refreshMaterials', onRefresh);
  }, [visible, fetchMaterials]);

  useEffect(() => {
    if (!visible || !subject?.id || selectedMaterialId) return;
    const existingLinked = materials.find((m) => String(m?.subject_id || '') === String(subject.id));
    if (existingLinked?.id) {
      setSelectedMaterialId(existingLinked.id);
    }
  }, [visible, subject?.id, materials, selectedMaterialId]);

  const selectedMaterial = useMemo(
    () => materials.find((m) => String(m?.id || '') === String(selectedMaterialId || '')) || null,
    [materials, selectedMaterialId]
  );

  const loadSubjectCurriculum = useCallback(async (subjectId, academicYearIds = []) => {
    if (!subjectId || !familyId) return;
    const cachedEntry = getSubjectProgressCache(familyId, subjectId);
    const cachedUnits = Array.isArray(cachedEntry?.curriculumUnits) ? cachedEntry.curriculumUnits : null;
    if (cachedUnits) {
      setCurriculumUnits(cachedUnits);
      setHasLoadedCurriculumOnce(true);
    }
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
      mergeSubjectProgressCache(familyId, subjectId, { curriculumUnits: mergedUnits });
    } catch (error) {
      if (!isAbortLikeError(error)) {
        console.error('Error loading subject curriculum:', error);
      }
      setCurriculumUnits([]);
      mergeSubjectProgressCache(familyId, subjectId, { curriculumUnits: [] });
    } finally {
      setLoadingCurriculum(false);
      setHasLoadedCurriculumOnce(true);
    }
  }, [familyId]);

  const curriculumAcademicYearIds = useMemo(
    () => [...new Set(subjectEvents.map((e) => e?.academic_year_id).filter(Boolean))],
    [subjectEvents]
  );

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

  const hasUnitsOrLessonsContent = (curriculumUnits || []).some((u) => (u?.lessons || []).length > 0) || unscheduledLessons.length > 0;

  // Keep event management synced for both persisted subjects and add-mode draft subjects.
  useEffect(() => {
    if (!visible || !effectiveSubjectId || !familyId) return;
    loadSubjectEvents(effectiveSubjectId);
  }, [visible, effectiveSubjectId, familyId]);

  useEffect(() => {
    if (!visible || !effectiveSubjectId || !familyId) return;
    const cachedEntry = getSubjectProgressCache(familyId, effectiveSubjectId);
    if (Array.isArray(cachedEntry?.curriculumUnits)) {
      setCurriculumUnits(cachedEntry.curriculumUnits);
      setHasLoadedCurriculumOnce(true);
    }
    loadSubjectCurriculum(effectiveSubjectId, curriculumAcademicYearIds);
  }, [visible, effectiveSubjectId, familyId, curriculumAcademicYearIds, loadSubjectCurriculum]);

  // After Add Units closes, WebLayout emits refreshSubjectDetail for this subject id.
  // Refresh events and curriculum so action pills reflect the latest subject content.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!visible || !effectiveSubjectId) return;
    const onRefreshSubjectDetail = (evt) => {
      const sid = evt?.detail?.subjectId;
      if (!sid || String(sid) !== String(effectiveSubjectId)) return;
      loadSubjectEvents(effectiveSubjectId);
      loadSubjectCurriculum(effectiveSubjectId, curriculumAcademicYearIds);
    };
    window.addEventListener('refreshSubjectDetail', onRefreshSubjectDetail);
    return () => window.removeEventListener('refreshSubjectDetail', onRefreshSubjectDetail);
  }, [visible, effectiveSubjectId, familyId, loadSubjectCurriculum, curriculumAcademicYearIds]);
  
  // Delete subject permanently (Danger Zone)
  const performDeleteSubject = async () => {
    if (!subject || !subject.id || !familyId || deletingSubject) return;
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
      setShowDeleteSubjectConfirm(false);
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

  useEffect(() => {
    if (!showSchoolYearDropdown || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const handleOutsidePointer = (event) => {
      const rawNode = schoolYearDropdownRef.current;
      const container = rawNode?._nativeNode || rawNode;
      if (!container || (typeof container.contains === 'function' && container.contains(event.target))) return;
      setShowSchoolYearDropdown(false);
    };
    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('touchstart', handleOutsidePointer);
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
    };
  }, [showSchoolYearDropdown]);

  useEffect(() => {
    if (!showSchoolTermDropdown || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const handleOutsidePointer = (event) => {
      const rawNode = schoolTermDropdownRef.current;
      const container = rawNode?._nativeNode || rawNode;
      if (!container || (typeof container.contains === 'function' && container.contains(event.target))) return;
      setShowSchoolTermDropdown(false);
    };
    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('touchstart', handleOutsidePointer);
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
    };
  }, [showSchoolTermDropdown]);

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

      const savedSubjectId = newSubjects?.[0]?.id || effectiveSubjectId || null;
      if (savedSubjectId && selectedMaterialId) {
        try {
          const { error: materialLinkError } = await supabase
            .from('materials')
            .update({ subject_id: savedSubjectId })
            .eq('id', selectedMaterialId)
            .eq('family_id', familyId);
          if (materialLinkError) throw materialLinkError;
        } catch (linkErr) {
          console.warn('Failed to link selected material to subject:', linkErr);
        }
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

  const canSubmit = subjectName.trim().length > 0 && selectedChildIds.length > 0;

  const handleBlockedSubmit = useCallback(() => {
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
  }, [subjectName, selectedChildIds.length, familyId]);

  return (
    <>
    <RNModal
      visible={visible}
      transparent={true}
      animationType="none"
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
            title={subject ? 'Edit subject' : 'New subject'}
            eyebrow="SUBJECT"
            accent="#9ECFFB"
            accentSoft="#F0F8FF"
            HeroIcon={BookOpen}
            onClose={handleCloseWithDraftCleanup}
            shellStyle={styles.compactSubjectShell}
            contentContainerStyle={styles.scrollContent}
            bodyStyle={styles.shellBody}
            footer={(
              <ModalFooter
                mode={subject ? 'edit' : 'add'}
                primaryLabel={isSubmitting ? 'Saving...' : (subject ? 'Save changes' : 'Save Subject')}
                destructiveLabel={subject?.id ? (deletingSubject ? 'Deleting...' : 'Delete subject') : undefined}
                onCancel={handleCloseWithDraftCleanup}
                onDelete={subject?.id ? () => setShowDeleteSubjectConfirm(true) : undefined}
                onPrimary={handleSubmit}
                onBlockedPrimary={handleBlockedSubmit}
                accent="#9ECFFB"
                disabled={isSubmitting || deletingSubject}
                visuallyDisabled={!canSubmit}
                loading={isSubmitting || deletingSubject}
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
                {selectedChildIds.length > 1 ? (
                  <Text style={styles.studentsMultiSubjectNote}>
                    If adding a subject for multiple children but differing learning materials or learning levels,
                    we recommend adding as two separate subjects.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Grade Level & Credits side by side */}
            <View style={styles.formGroup}>
              <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <View style={{ flex: 1, minWidth: 200 }}>
                  <Text style={styles.label}>Grade Level</Text>
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
                        onPress={() => {
                          setGrade(g);
                          setGradeManuallyEdited(true);
                        }}
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
                  <Text style={styles.label}>Credits</Text>
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
                <View
                  ref={schoolYearDropdownRef}
                  style={[styles.schoolScopeField, showSchoolYearDropdown && styles.schoolScopeFieldOpen]}
                >
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
                        {schoolYearOptions.map((opt) => (
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
                <View
                  ref={schoolTermDropdownRef}
                  style={[styles.schoolScopeField, showSchoolTermDropdown && styles.schoolScopeFieldOpen]}
                >
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

            {/* Notes */}
            <ModalSectionCard
              Icon={FileText}
              title="Notes and attachments"
              subtitle="Anything else to remember"
              expanded={showAdditionalNotesAccordion}
              onPress={() => setShowAdditionalNotesAccordion(!showAdditionalNotesAccordion)}
              accent="#9ECFFB"
              allowOverflow
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
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>Attachments</Text>
                    <View style={styles.materialSelectorContainer}>
                      <View style={[styles.materialSelectorFieldWrap, showMaterialDropdown && styles.materialSelectorFieldWrapOpen]}>
                        <TouchableOpacity
                          style={styles.materialSelector}
                          onPress={() => setShowMaterialDropdown((prev) => !prev)}
                          activeOpacity={0.7}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.materialSelectorText,
                              !selectedMaterial && styles.materialSelectorPlaceholder,
                            ]}
                          >
                            {selectedMaterial
                              ? (selectedMaterial.title || selectedMaterial.provider_name || 'Untitled material')
                              : (loadingMaterials ? 'Loading attachments...' : 'Select attachment...')}
                          </Text>
                          <ChevronDown size={16} color="#6b7280" />
                        </TouchableOpacity>
                        {showMaterialDropdown && (
                          <View ref={materialDropdownRef} style={styles.materialDropdownList}>
                            <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                              <TouchableOpacity
                                style={[styles.dropdownOption, !selectedMaterialId && styles.dropdownOptionSelected]}
                                onPress={() => {
                                  setSelectedMaterialId(null);
                                  setShowMaterialDropdown(false);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.dropdownOptionText, !selectedMaterialId && styles.dropdownOptionTextSelected]}>
                                  None
                                </Text>
                              </TouchableOpacity>
                              {materials.map((material) => {
                                const isSelected = String(selectedMaterialId || '') === String(material.id);
                                return (
                                  <TouchableOpacity
                                    key={material.id}
                                    style={[styles.dropdownOption, isSelected && styles.dropdownOptionSelected]}
                                    onPress={() => {
                                      setSelectedMaterialId(material.id);
                                      setShowMaterialDropdown(false);
                                    }}
                                    activeOpacity={0.7}
                                  >
                                    <Text style={[styles.dropdownOptionText, isSelected && styles.dropdownOptionTextSelected]}>
                                      {material.title || material.provider_name || 'Untitled material'}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          </View>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.addMaterialButton}
                        onPress={() => {
                          if (Platform.OS === 'web' && typeof window !== 'undefined') {
                            window.dispatchEvent(
                              new CustomEvent('openAddMaterialModal', {
                                detail: {
                                  subjectId: effectiveSubjectId || null,
                                  subjectName: subjectName?.trim() || subject?.name || null,
                                  childIds: selectedChildIds,
                                },
                              })
                            );
                          }
                        }}
                        activeOpacity={0.85}
                      >
                        <Plus size={14} color="#6BB3E8" />
                        <Text style={styles.addMaterialText}>Add New</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
            </ModalSectionCard>

          </AppModalShell>
        </TouchableOpacity>
      </View>

    </RNModal>

    <ConfirmDialog
      visible={showDeleteSubjectConfirm}
      title="Delete subject?"
      message="This will permanently delete this subject and related planning links. This cannot be undone."
      confirmLabel={deletingSubject ? 'Deleting...' : 'Delete subject'}
      cancelLabel="Cancel"
      destructive
      onCancel={() => {
        if (!deletingSubject) setShowDeleteSubjectConfirm(false);
      }}
      onConfirm={async () => {
        if (deletingSubject) return;
        setShowDeleteSubjectConfirm(false);
        await performDeleteSubject();
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
  compactSubjectShell: {
    ...(Platform.OS === 'web'
      ? { height: '74vh' }
      : { height: '80%' }),
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
    borderColor: '#85C4F2',
    backgroundColor: 'rgba(133, 196, 242, 0.2)',
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
    borderColor: '#85C4F2',
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
    backgroundColor: 'rgba(133, 196, 242, 0.12)',
  },
  dropdownOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  dropdownOptionTextSelected: {
    color: '#6BB3E8',
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
  studentsMultiSubjectNote: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    borderColor: '#85C4F2',
    backgroundColor: 'rgba(133, 196, 242, 0.2)',
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
    borderColor: '#85C4F2',
    backgroundColor: 'rgba(133, 196, 242, 0.2)',
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
    backgroundColor: '#9ECFFB',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 12px rgba(158, 207, 251, 0.55)',
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
    color: '#6BB3E8',
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
});

