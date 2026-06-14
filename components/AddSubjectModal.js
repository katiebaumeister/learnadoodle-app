import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal as RNModal, Platform, TextInput } from 'react-native';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { colors } from '../theme/colors';
import { parseChildIds } from '../lib/services/subjectsClient';
import { useModalStackElevation } from './hooks/useModalStackElevation';
import AppModalShell from './ui/AppModalShell';
import { ModalFooter } from './ui/ModalFooter';
import ConfirmDialog from './ConfirmDialog';
import {
  createModalStyles as sharedStyles,
  SUBJECT_SETTINGS_MODAL_MAX_WIDTH,
} from './create/shared/createModalStyles';
import { SectionHeading } from './create/shared/assignmentFormParts';
import { AppCalendarDatePickerModal } from './ui/AppCalendarDatePickerModal';
import SubjectGradingFields from './subjects/subjectSettings/SubjectGradingFields';
import SubjectScheduleFields from './subjects/subjectSettings/SubjectScheduleFields';
import SubjectAttachmentsFields from './subjects/subjectSettings/SubjectAttachmentsFields';
import AddMaterialModal from './materials/AddMaterialModal';
import {
  loadSubjectAttachmentIds,
  saveSubjectAttachmentLinks,
} from '../lib/services/subjectMaterialLinks';
import {
  deleteSubjectCascade,
  dispatchSubjectDeletedSideEffects,
} from '../lib/services/deleteSubjectCascade';
import { seedSubjectGettingStartedBulletinPost } from '../lib/subjectGettingStartedBulletin';
import {
  parseSubjectGradingSettings,
  validateGradingSettings,
  createEmptyCategory,
} from '../lib/subjectGradingSettings';
import { saveSubjectGradingSettings } from '../lib/services/subjectGradingSettingsClient';
import { getPlanDefaultsFromSettings } from '../lib/services/plannerSettingsClient';
import {
  APPLY_SCOPE_FULL_YEAR,
  applySubjectScheduleToCalendar,
  getSubjectTermDateRange,
  isScheduleFormConfigured,
  ymdToLocalDate,
} from '../lib/subjectConfigureSchedule';

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
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [grade, setGrade] = useState('');
  const [gradeManuallyEdited, setGradeManuallyEdited] = useState(false);
  const [schoolYear, setSchoolYear] = useState(initialSchoolYear || getDefaultSchoolYear());
  const [schoolYearOptions, setSchoolYearOptions] = useState(() => getFallbackSchoolYearOptions());
  const [schoolTerm, setSchoolTerm] = useState(initialSchoolTerm || getDefaultSchoolTerm());
  const [gradingDraft, setGradingDraft] = useState(() => parseSubjectGradingSettings(null));
  const [weekdays, setWeekdays] = useState([]);
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [plannerSettings, setPlannerSettings] = useState(null);
  const [credits, setCredits] = useState('');
  const [logisticalLocation, setLogisticalLocation] = useState('');
  const [logisticalMode, setLogisticalMode] = useState('');
  const [logisticalInstructor, setLogisticalInstructor] = useState('');
  const [connectedCalendarTargets, setConnectedCalendarTargets] = useState([]);
  const [syllabusMaterialId, setSyllabusMaterialId] = useState(null);
  const [lessonPlanMaterialId, setLessonPlanMaterialId] = useState(null);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [addMaterialDefaultRole, setAddMaterialDefaultRole] = useState(null);
  const [children, setChildren] = useState(propChildren || []);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const overlayRef = useRef(null);
  useModalStackElevation(overlayRef, visible);
  const hasSetChildIdsRef = useRef(false);
  const lastSubjectIdRef = useRef(null);
  const [showAdditionalNotesAccordion, setShowAdditionalNotesAccordion] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [showDeleteSubjectConfirm, setShowDeleteSubjectConfirm] = useState(false);

  const applyTermDates = useCallback((year, term, settings) => {
    const range = getSubjectTermDateRange(year, term, settings);
    const start = ymdToLocalDate(range.start_date);
    const end = ymdToLocalDate(range.end_date);
    if (start) setStartDate(start);
    if (end) setEndDate(end);
  }, []);

  const handleSchoolYearChange = useCallback(async (year) => {
    setSchoolYear(year);
    let settings = plannerSettings;
    if (familyId) {
      try {
        const { settings: loaded } = await getPlanDefaultsFromSettings(familyId, year);
        settings = loaded || null;
        setPlannerSettings(settings);
      } catch (_) {
        settings = null;
        setPlannerSettings(null);
      }
    }
    applyTermDates(year, schoolTerm, settings);
  }, [familyId, schoolTerm, plannerSettings, applyTermDates]);

  const handleSchoolTermChange = useCallback((term) => {
    setSchoolTerm(term);
    applyTermDates(schoolYear, term, plannerSettings);
  }, [schoolYear, plannerSettings, applyTermDates]);

  const updateGradingDraft = useCallback((patch) => {
    setGradingDraft((prev) => ({ ...prev, ...patch }));
    setError(null);
  }, []);

  const updateCategory = useCallback((index, patch) => {
    setGradingDraft((prev) => {
      const categories = [...(prev.categories || [])];
      categories[index] = { ...categories[index], ...patch };
      return { ...prev, categories };
    });
    setError(null);
  }, []);

  const removeCategory = useCallback((index) => {
    setGradingDraft((prev) => ({
      ...prev,
      categories: (prev.categories || []).filter((_, i) => i !== index),
    }));
    setError(null);
  }, []);

  const addCategory = useCallback(() => {
    setGradingDraft((prev) => ({
      ...prev,
      categories: [...(prev.categories || []), createEmptyCategory()],
    }));
    setError(null);
  }, []);

  const datePickerValue = useMemo(() => {
    if (datePickerTarget === 'end') return endDate;
    return startDate;
  }, [datePickerTarget, startDate, endDate]);

  const initScheduleDefaults = useCallback(async (yearLabel, termId) => {
    let settings = null;
    if (familyId) {
      try {
        const { settings: loaded } = await getPlanDefaultsFromSettings(familyId, yearLabel);
        settings = loaded || null;
        setPlannerSettings(settings);
      } catch (_) {
        setPlannerSettings(null);
      }
    }
    applyTermDates(yearLabel, termId, settings);
  }, [familyId, applyTermDates]);

  // Update children when prop changes
  useEffect(() => {
    if (propChildren && propChildren.length > 0) {
      setChildren(propChildren);
      setLoadingChildren(false);
    }
  }, [propChildren]);

  useEffect(() => {
    if (visible) {
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
        setSyllabusMaterialId(null);
        setLessonPlanMaterialId(null);
        if (subject.id && familyId) {
          loadSubjectAttachmentIds(subject.id, familyId)
            .then(({ syllabusMaterialId: syllabusId, lessonPlanMaterialId: lessonId }) => {
              setSyllabusMaterialId(syllabusId);
              setLessonPlanMaterialId(lessonId);
            })
            .catch(() => {
              setSyllabusMaterialId(null);
              setLessonPlanMaterialId(null);
            });
        }
        // Child IDs will be set in the next useEffect after children load
      } else {
        // Add mode - use defaults
        setAdditionalNotes('');
        setGrade('');
        setGradeManuallyEdited(false);
        setSchoolYear(initialSchoolYear || getDefaultSchoolYear());
        setSchoolTerm(initialSchoolTerm || getDefaultSchoolTerm());
        setGradingDraft(parseSubjectGradingSettings(null));
        setWeekdays([]);
        setStartTime('');
        setDurationMinutes('');
        setLogisticalLocation('');
        setLogisticalMode('');
        setLogisticalInstructor('');
        setConnectedCalendarTargets([]);
        setSyllabusMaterialId(null);
        setLessonPlanMaterialId(null);
        if (defaultSubjectName) {
          setSubjectName(defaultSubjectName);
        }
        if (Array.isArray(defaultChildIds) && defaultChildIds.length > 0) {
          setSelectedChildIds(defaultChildIds.filter(Boolean));
        } else if (defaultChildId) {
          setSelectedChildIds([defaultChildId]);
        }
        initScheduleDefaults(
          initialSchoolYear || getDefaultSchoolYear(),
          initialSchoolTerm || getDefaultSchoolTerm(),
        );
      }
    } else if (!visible) {
      // Reset form when modal closes
      setSubjectName('');
      setAdditionalNotes('');
      setSelectedChildIds([]);
      setGrade('');
      setGradeManuallyEdited(false);
      setSchoolYear(getDefaultSchoolYear());
      setSchoolTerm(getDefaultSchoolTerm());
      setGradingDraft(parseSubjectGradingSettings(null));
      setWeekdays([]);
      setStartTime('');
      setDurationMinutes('');
      setStartDate(null);
      setEndDate(null);
      setDatePickerTarget(null);
      setPlannerSettings(null);
      setCredits('');
      setLogisticalLocation('');
      setLogisticalMode('');
      setLogisticalInstructor('');
      setConnectedCalendarTargets([]);
      setError(null);
      setShowAdditionalNotesAccordion(false);
      setSyllabusMaterialId(null);
      setLessonPlanMaterialId(null);
    }
  }, [visible, defaultChildId, defaultChildIds, defaultSubjectName, initialSchoolTerm, initialSchoolYear, subject, initScheduleDefaults, propChildren]);

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

  const handleClose = useCallback(() => {
    setError(null);
    onClose?.();
  }, [onClose]);

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

    const { ok: gradingOk, errors: gradingErrors } = validateGradingSettings(gradingDraft);
    if (!gradingOk) {
      setError(gradingErrors[0]);
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
      const existingSubjectId = subject?.id || null;

      if (existingSubjectId) {
        // Edit mode - UPDATE
        const { data, error } = await supabase
          .from('subject')
          .update(subjectData)
          .eq('id', existingSubjectId)
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

      const savedSubjectId = newSubjects?.[0]?.id || existingSubjectId || null;

      if (savedSubjectId) {
        await saveSubjectGradingSettings(savedSubjectId, familyId, gradingDraft);
        if (isScheduleFormConfigured({ weekdays, startTime, durationMinutes, startDate, endDate })) {
          await applySubjectScheduleToCalendar({
            familyId,
            subject: { id: savedSubjectId, name: subjectName.trim() },
            assignedChildIds: selectedChildIds,
            allChildIds: (children || []).map((c) => c.id).filter(Boolean),
            weekdays,
            startTime,
            durationMinutes: Number(durationMinutes),
            startDate,
            endDate,
            applyScope: APPLY_SCOPE_FULL_YEAR,
          });
        }
        try {
          await saveSubjectAttachmentLinks({
            familyId,
            subjectId: savedSubjectId,
            syllabusMaterialId,
            lessonPlanMaterialId,
          });
        } catch (linkErr) {
          console.warn('Failed to link materials to subject:', linkErr);
        }
      }

      if (!existingSubjectId && savedSubjectId) {
        try {
          await seedSubjectGettingStartedBulletinPost({
            familyId,
            subjectId: savedSubjectId,
            subjectName: subjectName.trim(),
          });
        } catch (seedErr) {
          console.warn('[AddSubjectModal] Failed to seed subject bulletin welcome post:', seedErr);
        }
      }

      // Success
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
        if (savedSubjectId) {
          window.dispatchEvent(new CustomEvent('refreshSubjectDetail', {
            detail: { subjectId: savedSubjectId }
          }));
        }
      }
      
      // Close modal after a brief delay
      setTimeout(() => {
        handleClose();
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
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View ref={overlayRef} style={localStyles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />
        <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={localStyles.modalWrap}>
          <AppModalShell
            title="New subject"
            onClose={handleClose}
            disableShellScroll
            maxWidth={SUBJECT_SETTINGS_MODAL_MAX_WIDTH}
            shellStyle={[sharedStyles.compactShell, sharedStyles.subjectSettingsModalShell]}
            titleRowStyle={sharedStyles.subjectSettingsTitleRow}
            contentContainerStyle={localStyles.bodyContent}
            scrollerStyle={sharedStyles.subjectSettingsScroller}
            bodyStyle={[sharedStyles.shellBody, sharedStyles.subjectSettingsModalBody]}
            footer={(
              <ModalFooter
                mode="add"
                primaryLabel={isSubmitting ? 'Saving...' : 'Add subject'}
                onCancel={handleClose}
                onPrimary={handleSubmit}
                onBlockedPrimary={handleBlockedSubmit}
                accent="#9ECFFB"
                disabled={isSubmitting}
                visuallyDisabled={!canSubmit}
                loading={isSubmitting}
              />
            )}
          >
            {error && !error.includes('children') ? (
              <View style={sharedStyles.validationBannerContainer}>
                <Text style={sharedStyles.validationBannerText}>{error}</Text>
              </View>
            ) : null}

            <View style={sharedStyles.subjectSettingsFormRow}>
              <View style={sharedStyles.subjectSettingsFormColumnMain}>
                <ScrollView
                  style={sharedStyles.subjectSettingsMainColumnScroll}
                  contentContainerStyle={sharedStyles.subjectSettingsMainColumnScrollInner}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                <View style={[sharedStyles.assignmentContentPanel, sharedStyles.subjectSettingsDetailsPanel, sharedStyles.subjectSettingsStackedPanel]}>
                  <SectionHeading>Details</SectionHeading>

                  <View style={sharedStyles.formGroup}>
                    <Text style={sharedStyles.fieldLabel}>
                      Subject name<Text style={sharedStyles.required}> *</Text>
                    </Text>
                    <TextInput
                      style={sharedStyles.fieldInput}
                      value={subjectName}
                      onChangeText={setSubjectName}
                      placeholder="e.g., World History"
                      placeholderTextColor="#9ca3af"
                      autoFocus={!defaultSubjectName}
                    />
                  </View>

                  <View style={sharedStyles.formGroup}>
                    <Text style={sharedStyles.fieldLabel}>
                      Students<Text style={sharedStyles.required}> *</Text>
                    </Text>
                    {loadingChildren ? (
                      <Text style={localStyles.loadingText}>Loading students…</Text>
                    ) : children.length > 0 ? (
                      <View style={sharedStyles.chipRow}>
                        {children.map((child) => {
                          const isSelected = selectedChildIds.includes(child.id);
                          return (
                            <TouchableOpacity
                              key={child.id}
                              style={[
                                sharedStyles.dropdownOption,
                                sharedStyles.assigneePill,
                                isSelected && sharedStyles.dropdownOptionActive,
                              ]}
                              onPress={() => {
                                setSelectedChildIds((prev) =>
                                  isSelected
                                    ? prev.filter((id) => id !== child.id)
                                    : [...prev, child.id]
                                );
                              }}
                              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                            >
                              <Text
                                style={[
                                  sharedStyles.dropdownOptionText,
                                  sharedStyles.assigneePillText,
                                  isSelected && [sharedStyles.assigneePillTextActive, sharedStyles.dropdownOptionTextActive],
                                ]}
                              >
                                {child.first_name || child.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : null}
                  </View>

                  <View style={sharedStyles.formGroup}>
                    <Text style={sharedStyles.fieldLabel}>Grade level</Text>
                    <View style={sharedStyles.chipRow}>
                      {GRADE_OPTIONS.map((gradeOption) => {
                        const isSelected = grade === gradeOption;
                        return (
                          <TouchableOpacity
                            key={gradeOption}
                            style={[
                              sharedStyles.dropdownOption,
                              sharedStyles.assigneePill,
                              isSelected && sharedStyles.dropdownOptionActive,
                            ]}
                            onPress={() => {
                              setGrade(gradeOption);
                              setGradeManuallyEdited(true);
                            }}
                            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                          >
                            <Text
                              style={[
                                sharedStyles.dropdownOptionText,
                                sharedStyles.assigneePillText,
                                isSelected && [sharedStyles.assigneePillTextActive, sharedStyles.dropdownOptionTextActive],
                              ]}
                            >
                              {gradeOption}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <View style={[sharedStyles.assignmentAttachPanel, sharedStyles.subjectSettingsStackedPanel, sharedStyles.subjectSettingsGradingPanelBox]}>
                  <SubjectGradingFields
                    draft={gradingDraft}
                    onUpdateDraft={updateGradingDraft}
                    onUpdateCategory={updateCategory}
                    onRemoveCategory={removeCategory}
                    onAddCategory={addCategory}
                  />
                </View>

                {familyId ? (
                  <View style={[sharedStyles.assignmentAttachPanel, sharedStyles.subjectSettingsStackedPanel]}>
                    <SubjectAttachmentsFields
                      familyId={familyId}
                      syllabusMaterialId={syllabusMaterialId}
                      lessonPlanMaterialId={lessonPlanMaterialId}
                      onSyllabusChange={setSyllabusMaterialId}
                      onLessonPlanChange={setLessonPlanMaterialId}
                      onAddSyllabus={() => {
                        setAddMaterialDefaultRole('syllabus');
                        setShowAddMaterialModal(true);
                      }}
                      onAddLessonPlan={() => {
                        setAddMaterialDefaultRole('lesson_plan');
                        setShowAddMaterialModal(true);
                      }}
                    />
                  </View>
                ) : null}
                </ScrollView>
              </View>

              <View style={sharedStyles.subjectSettingsFormColumnSide}>
                <View style={sharedStyles.subjectSettingsSidePanel}>
                  <SectionHeading>Schedule</SectionHeading>
                  <SubjectScheduleFields
                    embeddedInForm
                    schoolYear={schoolYear}
                    schoolYearOptions={schoolYearOptions}
                    onSchoolYearChange={handleSchoolYearChange}
                    schoolTerm={schoolTerm}
                    termOptions={TERM_OPTIONS}
                    onSchoolTermChange={handleSchoolTermChange}
                    weekdays={weekdays}
                    onWeekdaysChange={setWeekdays}
                    startTime={startTime}
                    onStartTimeChange={setStartTime}
                    durationMinutes={durationMinutes}
                    onDurationMinutesChange={setDurationMinutes}
                    startDate={startDate}
                    onStartDateChange={setStartDate}
                    endDate={endDate}
                    onEndDateChange={setEndDate}
                    onOpenStartDatePicker={() => setDatePickerTarget('start')}
                    onOpenEndDatePicker={() => setDatePickerTarget('end')}
                  />
                </View>
              </View>
            </View>
          </AppModalShell>
        </TouchableOpacity>
      </View>

    </RNModal>

    <AppCalendarDatePickerModal
      visible={!!datePickerTarget}
      onClose={() => setDatePickerTarget(null)}
      selectedDate={datePickerValue || new Date()}
      onSelectDate={(d) => {
        if (datePickerTarget === 'end') setEndDate(d);
        else setStartDate(d);
        setDatePickerTarget(null);
      }}
    />

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

    {showAddMaterialModal ? (
      <AddMaterialModal
        visible
        familyId={familyId}
        defaultRole={addMaterialDefaultRole}
        defaultSubjectId={subject?.id || null}
        defaultSubjectName={subjectName.trim() || subject?.name || null}
        defaultChildIds={selectedChildIds}
        draftSubjectForMaterial={
          !subject?.id && subjectName.trim()
            ? { name: subjectName.trim(), childIds: selectedChildIds }
            : null
        }
        onClose={() => {
          setShowAddMaterialModal(false);
          setAddMaterialDefaultRole(null);
        }}
        onSaved={(material) => {
          if (material?.id) {
            if (addMaterialDefaultRole === 'lesson_plan') {
              setLessonPlanMaterialId(material.id);
            } else {
              setSyllabusMaterialId(material.id);
            }
          }
          setShowAddMaterialModal(false);
          setAddMaterialDefaultRole(null);
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('refreshMaterials', { detail: { familyId } }));
          }
        }}
      />
    ) : null}

    </>
  );
}

const localStyles = StyleSheet.create({
  overlay: sharedStyles.overlay,
  modalWrap: sharedStyles.subjectSettingsModalWrap,
  bodyContent: {
    flexGrow: 0,
    flexShrink: 0,
    paddingBottom: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      flex: 'none',
    }),
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    fontStyle: 'italic',
  },
});

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
    maxWidth: SUBJECT_SETTINGS_MODAL_MAX_WIDTH,
  },
  compactSubjectShell: {
    height: 'auto',
    maxHeight: Platform.OS === 'web' ? '90vh' : '86%',
    borderRadius: 28,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 8px 28px rgba(15, 23, 42, 0.12)',
    }),
  },
  shellBody: {
    paddingTop: 0,
    paddingBottom: 4,
  },
  compactFooter: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  compactTitleRow: {
    paddingTop: 16,
    paddingBottom: 8,
  },
  scrollContainer: {
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: {
        flexGrow: 0,
        flexShrink: 1,
        minHeight: 0,
        // Reserve ~88px for footer + borders so body scrolls within the shell
        maxHeight: 'calc(90vh - 88px)',
      },
      default: {
        flex: 1,
      },
    }),
  },
  scrollContent: {
    paddingBottom: 4,
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
    borderColor: '#9ECFFB',
    backgroundColor: '#FFFFFF',
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
    color: '#6BB3E8',
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
    marginBottom: 14,
  },
  formGroupLast: {
    marginBottom: 0,
  },
  stackedFields: {
    gap: 14,
    overflow: 'visible',
    position: 'relative',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  fieldInput: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111827',
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    width: '100%',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
      transition: 'border-color 0.15s ease',
    }),
  },
  fieldInputFocused: {
    borderBottomColor: '#2563EB',
    borderBottomWidth: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gradeChipRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    alignItems: 'center',
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
  unitsLessonsActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  unitsLessonsHeaderButton: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  unitsLessonsEditButton: {
    borderWidth: 1,
    borderColor: '#D7DEE8',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },
  unitsLessonsHeaderButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  unitsLessonsHeaderButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsLessonsEditButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#5E6C84',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsLessonsEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsLessonsMethodHeader: {
    flex: 1,
    minWidth: 180,
    marginBottom: 10,
  },
  unitsLessonsMethodTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsLessonsMethodSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsLessonsDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },
  unitsLessonsList: {
    gap: 8,
  },
  unitsLessonsUnitCard: {
    borderWidth: 1,
    borderColor: '#E6ECF3',
    borderRadius: 10,
    backgroundColor: '#FAFCFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  unitsLessonsUnitTitle: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsLessonsUnitMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsLessonsLessonRow: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  unitsLessonsMoreText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '600',
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
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectNameInput: {
    fontSize: 16,
    fontWeight: '400',
    color: '#111827',
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
      transition: 'border-color 0.15s ease',
    }),
  },
  subjectNameInputFocused: {
    borderBottomColor: '#2563EB',
    borderBottomWidth: 2,
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
    backgroundColor: '#F3F4F6',
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 44,
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
  schoolScopeFieldStacked: {
    width: '100%',
    position: 'relative',
  },
  schoolScopeFormGroupOpen: {
    zIndex: 200,
    overflow: 'visible',
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
    zIndex: 2,
    ...(Platform.OS === 'web' && { position: 'relative' }),
  },
  schoolScopeFieldUnder: {
    zIndex: 1,
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
    zIndex: 300,
    elevation: 12,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 10px 24px rgba(15, 23, 42, 0.14)',
    }),
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
    marginTop: 0,
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
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
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
    marginTop: 0,
  },
  gradeChip: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderColor: '#9ECFFB',
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
    backgroundColor: colors.redSoft,
    borderColor: colors.redBold,
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
    color: colors.redBold,
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

