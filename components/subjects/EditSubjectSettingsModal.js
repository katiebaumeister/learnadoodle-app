import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import { useToast } from '../Toast';
import { supabase } from '../../lib/supabase';
import { parseChildIds } from '../../lib/services/subjectsClient';
import AppModalShell from '../ui/AppModalShell';
import { ModalFooter } from '../ui/ModalFooter';
import {
  createModalStyles as styles,
  SUBJECT_SETTINGS_MODAL_MAX_WIDTH,
} from '../create/shared/createModalStyles';
import { SectionHeading } from '../create/shared/assignmentFormParts';
import ConfirmDialog from '../ConfirmDialog';
import { AppCalendarDatePickerModal } from '../ui/AppCalendarDatePickerModal';
import SubjectGradingFields from './subjectSettings/SubjectGradingFields';
import SubjectScheduleFields from './subjectSettings/SubjectScheduleFields';
import SubjectAttachmentsFields from './subjectSettings/SubjectAttachmentsFields';
import AddMaterialModal from '../materials/AddMaterialModal';
import {
  loadSubjectAttachmentIds,
  saveSubjectAttachmentLinks,
} from '../../lib/services/subjectMaterialLinks';
import {
  deleteSubjectCascade,
  dispatchSubjectDeletedSideEffects,
} from '../../lib/services/deleteSubjectCascade';
import {
  parseSubjectGradingSettings,
  validateGradingSettings,
  createEmptyCategory,
} from '../../lib/subjectGradingSettings';
import { saveSubjectGradingSettings } from '../../lib/services/subjectGradingSettingsClient';
import { getPlanDefaultsFromSettings } from '../../lib/services/plannerSettingsClient';
import {
  APPLY_SCOPE_FULL_YEAR,
  applySubjectScheduleToCalendar,
  buildInitialScheduleForm,
  getSubjectTermDateRange,
  isScheduleFormConfigured,
  normalizeHm,
  ymdToLocalDate,
} from '../../lib/subjectConfigureSchedule';
import { findAcademicYearPlanForSubject } from '../../lib/subjectPlanSlotLines';
import { getAcademicYear } from '../../lib/services/academicYearClient';
import { getSubjectProgressCache, mergeSubjectProgressCache } from '../../lib/subjectProgressPlanCache';
import { getSubjectPlanBlocksForSubject } from './subjectScheduleOverview';

const DEFAULT_SCHEDULE_TIME = '09:00';
const DEFAULT_SCHEDULE_DURATION = '60';

const GRADE_OPTIONS = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const TERM_OPTIONS = [
  { id: 'full_year', label: 'Full year' },
  { id: 'fall_term', label: 'Fall term' },
  { id: 'spring_term', label: 'Spring term' },
];

const formatSchoolYearLabel = (startYear) => `${startYear}/${String(startYear + 1).slice(-2)}`;

function getFallbackSchoolYearOptions() {
  const now = new Date();
  const currentStart = now.getMonth() + 1 >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: 12 }, (_, idx) => formatSchoolYearLabel(currentStart + idx));
}

function getDefaultSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const startYear = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return formatSchoolYearLabel(startYear);
}

function getDefaultSchoolTerm() {
  const now = new Date();
  const month = now.getMonth() + 1;
  return month >= 8 ? 'fall_term' : 'spring_term';
}

export default function EditSubjectSettingsModal({
  visible,
  onClose,
  onSaved,
  familyId,
  subject,
  children: propChildren = [],
  initialTab = 'details',
  subjectPlanData = null,
  academicYearId = null,
  assignedChildIds = [],
  allChildIds = [],
  initialGradingSettings = null,
}) {
  const toast = useToast();
  const formScrollRef = useRef(null);
  const sectionOffsetsRef = useRef({ details: 0, schedule: 0, grades: 0 });
  const [subjectName, setSubjectName] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [grade, setGrade] = useState('');
  const [schoolYear, setSchoolYear] = useState(getDefaultSchoolYear());
  const [schoolYearOptions] = useState(() => getFallbackSchoolYearOptions());
  const [schoolTerm, setSchoolTerm] = useState(getDefaultSchoolTerm());
  const [plannerSettings, setPlannerSettings] = useState(null);
  const [children, setChildren] = useState(propChildren || []);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingSubject, setDeletingSubject] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [validationBanner, setValidationBanner] = useState('');

  const [gradingDraft, setGradingDraft] = useState(() => parseSubjectGradingSettings(initialGradingSettings));

  const [weekdays, setWeekdays] = useState([]);
  const [startTime, setStartTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [datePickerTarget, setDatePickerTarget] = useState(null);
  const [syllabusMaterialId, setSyllabusMaterialId] = useState(null);
  const [lessonPlanMaterialId, setLessonPlanMaterialId] = useState(null);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [addMaterialDefaultRole, setAddMaterialDefaultRole] = useState(null);

  const detailsHydratedForRef = useRef(null);
  const scheduleHydratedKeyRef = useRef(null);
  const scheduleTouchedRef = useRef(false);
  const datesCustomizedRef = useRef(false);
  const [detailsReady, setDetailsReady] = useState(false);
  const [resolvedPlanData, setResolvedPlanData] = useState(null);
  const [resolvedAcademicYearId, setResolvedAcademicYearId] = useState(null);
  const [loadingPlanData, setLoadingPlanData] = useState(false);

  const effectivePlanData = subjectPlanData ?? resolvedPlanData;
  const effectiveAcademicYearId = academicYearId ?? resolvedAcademicYearId;

  const markScheduleTouched = useCallback(() => {
    scheduleTouchedRef.current = true;
  }, []);

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
    if (!datesCustomizedRef.current) {
      applyTermDates(year, schoolTerm, settings);
    }
  }, [familyId, schoolTerm, plannerSettings, applyTermDates]);

  const handleSchoolTermChange = useCallback((term) => {
    setSchoolTerm(term);
    if (!datesCustomizedRef.current) {
      applyTermDates(schoolYear, term, plannerSettings);
    }
  }, [schoolYear, plannerSettings, applyTermDates]);

  const effectiveAssignedChildIds = useMemo(() => {
    if (assignedChildIds?.length) return assignedChildIds;
    return selectedChildIds;
  }, [assignedChildIds, selectedChildIds]);

  const effectiveAllChildIds = useMemo(() => {
    if (allChildIds?.length) return allChildIds;
    return (children || []).map((c) => c.id).filter(Boolean);
  }, [allChildIds, children]);

  useEffect(() => {
    detailsHydratedForRef.current = null;
    scheduleHydratedKeyRef.current = null;
    scheduleTouchedRef.current = false;
    datesCustomizedRef.current = false;
    setDetailsReady(false);
    if (!visible) {
      setResolvedPlanData(null);
      setResolvedAcademicYearId(null);
      setLoadingPlanData(false);
      return;
    }
    setValidationBanner('');
    setShowDeleteConfirm(false);
  }, [visible, subject?.id]);

  useEffect(() => {
    if (!visible || !familyId || !subject?.id) return;
    if (subjectPlanData) {
      setResolvedPlanData(subjectPlanData);
      if (academicYearId) setResolvedAcademicYearId(academicYearId);
      setLoadingPlanData(false);
      return undefined;
    }

    let cancelled = false;
    setLoadingPlanData(true);

    const loadPlanData = async () => {
      try {
        const cached = getSubjectProgressCache(familyId, subject.id);
        if (!cancelled && cached?.planData) {
          setResolvedPlanData(cached.planData);
          setResolvedAcademicYearId(cached.academicYearId ?? null);
        }
        const fetched = await findAcademicYearPlanForSubject(familyId, subject.id);
        if (cancelled) return;
        setResolvedPlanData(fetched?.planData || null);
        setResolvedAcademicYearId(fetched?.academicYearId || null);
        if (fetched?.planData) {
          mergeSubjectProgressCache(familyId, subject.id, {
            academicYearId: fetched.academicYearId ?? null,
            planData: fetched.planData,
          });
        }
      } catch (_) {
        if (!cancelled) {
          setResolvedPlanData(null);
          setResolvedAcademicYearId(null);
        }
      } finally {
        if (!cancelled) setLoadingPlanData(false);
      }
    };

    loadPlanData();
    return () => { cancelled = true; };
  }, [visible, subject?.id, familyId, subjectPlanData, academicYearId]);

  const schedulePlanKey = useMemo(() => {
    if (!subject?.id) return '';
    const block = getSubjectPlanBlocksForSubject(effectivePlanData, subject.id)[0];
    return JSON.stringify({
      weekdays: block?.weekdays ?? null,
      start: block?.start_time ?? null,
      end: block?.end_time ?? null,
      scheduleStart: block?.schedule_start_date ?? null,
      scheduleEnd: block?.schedule_end_date ?? null,
      yearId: effectiveAcademicYearId ?? null,
    });
  }, [subject?.id, effectivePlanData, effectiveAcademicYearId]);

  const applyScheduleFormState = useCallback((initialSchedule, yearLabel, termId, loadedPlannerSettings) => {
    datesCustomizedRef.current = !!initialSchedule.hasCustomScheduleDates;
    setWeekdays(
      (initialSchedule.weekdays || [])
        .map((day) => parseInt(day, 10))
        .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    );
    setStartTime(initialSchedule.startTime || DEFAULT_SCHEDULE_TIME);
    setDurationMinutes(
      initialSchedule.durationMinutes === '' || initialSchedule.durationMinutes == null
        ? DEFAULT_SCHEDULE_DURATION
        : String(initialSchedule.durationMinutes),
    );
    if (initialSchedule.startDate && initialSchedule.endDate) {
      setStartDate(initialSchedule.startDate);
      setEndDate(initialSchedule.endDate);
    } else {
      const range = getSubjectTermDateRange(yearLabel, termId, loadedPlannerSettings);
      setStartDate(ymdToLocalDate(range.start_date));
      setEndDate(ymdToLocalDate(range.end_date));
    }
  }, []);

  const handleWeekdaysChange = useCallback((next) => {
    markScheduleTouched();
    setWeekdays(next);
  }, [markScheduleTouched]);

  const handleStartTimeChange = useCallback((next) => {
    markScheduleTouched();
    setStartTime(next);
  }, [markScheduleTouched]);

  const handleDurationMinutesChange = useCallback((next) => {
    markScheduleTouched();
    setDurationMinutes(next);
  }, [markScheduleTouched]);

  const handleStartDateChange = useCallback((next) => {
    markScheduleTouched();
    datesCustomizedRef.current = true;
    setStartDate(next);
  }, [markScheduleTouched]);

  const handleEndDateChange = useCallback((next) => {
    markScheduleTouched();
    datesCustomizedRef.current = true;
    setEndDate(next);
  }, [markScheduleTouched]);

  const handleSchoolYearChangeWithTouch = useCallback(async (year) => {
    markScheduleTouched();
    await handleSchoolYearChange(year);
  }, [handleSchoolYearChange, markScheduleTouched]);

  const handleSchoolTermChangeWithTouch = useCallback((term) => {
    markScheduleTouched();
    handleSchoolTermChange(term);
  }, [handleSchoolTermChange, markScheduleTouched]);

  useEffect(() => {
    if (!visible || !initialTab || initialTab === 'details') return undefined;
    const timer = setTimeout(() => {
      const y = sectionOffsetsRef.current[initialTab];
      if (typeof y === 'number' && formScrollRef.current?.scrollTo) {
        formScrollRef.current.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [visible, initialTab, subject?.id]);

  useEffect(() => {
    if (!visible || !subject) return;
    if (detailsHydratedForRef.current === subject.id) return;
    let cancelled = false;

    const hydrateDetails = async () => {
      setSubjectName(subject.name || '');
      setGrade(subject.grade || '');
      const yearLabel = subject.school_year || getDefaultSchoolYear();
      const termId = subject.school_term || getDefaultSchoolTerm();
      setSchoolYear(yearLabel);
      setSchoolTerm(termId);
      setGradingDraft(parseSubjectGradingSettings(initialGradingSettings ?? subject.grading_settings));
      const childIds = subject.child_id ? parseChildIds(subject.child_id) : [];
      setSelectedChildIds(childIds);

      if (familyId) {
        try {
          const { settings } = await getPlanDefaultsFromSettings(familyId, yearLabel);
          if (!cancelled) setPlannerSettings(settings || null);
        } catch (_) {
          if (!cancelled) setPlannerSettings(null);
        }
      }

      try {
        const attachmentIds = await loadSubjectAttachmentIds(subject.id, familyId);
        if (!cancelled) {
          setSyllabusMaterialId(attachmentIds.syllabusMaterialId);
          setLessonPlanMaterialId(attachmentIds.lessonPlanMaterialId);
        }
      } catch (_) {
        if (!cancelled) {
          setSyllabusMaterialId(null);
          setLessonPlanMaterialId(null);
        }
      }

      if (!cancelled) {
        detailsHydratedForRef.current = subject.id;
        setDetailsReady(true);
      }
    };

    hydrateDetails();
    return () => { cancelled = true; };
  }, [visible, subject, initialGradingSettings, familyId]);

  useEffect(() => {
    if (!visible || !subject || !detailsReady || loadingPlanData) return;
    if (scheduleTouchedRef.current) return;
    if (scheduleHydratedKeyRef.current === schedulePlanKey) return;
    let cancelled = false;

    const hydrateSchedule = async () => {
      const initialSchedule = buildInitialScheduleForm({
        subject,
        planData: effectivePlanData,
        academicYearId: effectiveAcademicYearId,
        plannerSettings,
      });
      if (cancelled) return;

      applyScheduleFormState(
        initialSchedule,
        schoolYear,
        schoolTerm,
        plannerSettings,
      );
      scheduleHydratedKeyRef.current = schedulePlanKey;
    };

    hydrateSchedule();
    return () => { cancelled = true; };
  }, [
    visible,
    subject,
    detailsReady,
    loadingPlanData,
    schedulePlanKey,
    effectivePlanData,
    effectiveAcademicYearId,
    schoolYear,
    schoolTerm,
    plannerSettings,
    applyScheduleFormState,
    familyId,
  ]);

  useEffect(() => {
    if (propChildren?.length) {
      setChildren(propChildren);
      return;
    }
    if (!visible || !familyId) return;
    let cancelled = false;
    (async () => {
      setLoadingChildren(true);
      try {
        const { data, error } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', familyId)
          .eq('archived', false);
        if (cancelled) return;
        if (error && (error.code === '42703' || error.message?.includes('archived'))) {
          const retry = await supabase.from('children').select('*').eq('family_id', familyId);
          if (!cancelled) setChildren(retry.data || []);
        } else if (!cancelled) {
          setChildren(data || []);
        }
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, familyId, propChildren]);

  const datePickerValue = useMemo(() => {
    if (datePickerTarget === 'end') return endDate;
    return startDate;
  }, [datePickerTarget, startDate, endDate]);

  const updateGradingDraft = useCallback((patch) => {
    setGradingDraft((prev) => ({ ...prev, ...patch }));
    setValidationBanner('');
  }, []);

  const updateCategory = useCallback((index, patch) => {
    setGradingDraft((prev) => {
      const categories = [...(prev.categories || [])];
      categories[index] = { ...categories[index], ...patch };
      return { ...prev, categories };
    });
    setValidationBanner('');
  }, []);

  const removeCategory = useCallback((index) => {
    setGradingDraft((prev) => ({
      ...prev,
      categories: (prev.categories || []).filter((_, i) => i !== index),
    }));
    setValidationBanner('');
  }, []);

  const addCategory = useCallback(() => {
    setGradingDraft((prev) => ({
      ...prev,
      categories: [...(prev.categories || []), createEmptyCategory()],
    }));
    setValidationBanner('');
  }, []);

  const validateDetails = () => {
    if (!subjectName.trim()) return 'Enter a subject name.';
    if (selectedChildIds.length === 0) return 'Select at least one student.';
    return null;
  };

  const validateSchedule = () => {
    if (!isScheduleFormConfigured({ weekdays, startTime, durationMinutes, startDate, endDate })) {
      return null;
    }
    if (!weekdays.length) return 'Select at least one day.';
    if (!String(startTime || '').trim()) return 'Enter a start time.';
    if (!startDate || !endDate) return 'Pick start and end dates.';
    if (!Number(durationMinutes) || Number(durationMinutes) <= 0) return 'Duration must be at least 1 minute.';
    return null;
  };

  const applyScheduleIfConfigured = async () => {
    const normalizedWeekdays = (weekdays || [])
      .map((day) => parseInt(day, 10))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    const normalizedStartTime = normalizeHm(startTime || DEFAULT_SCHEDULE_TIME, DEFAULT_SCHEDULE_TIME);
    const normalizedDuration = Number(durationMinutes) || Number(DEFAULT_SCHEDULE_DURATION);

    if (!isScheduleFormConfigured({
      weekdays: normalizedWeekdays,
      startTime: normalizedStartTime,
      durationMinutes: normalizedDuration,
      startDate,
      endDate,
    })) {
      return null;
    }
    const scheduleError = validateSchedule();
    if (scheduleError) throw new Error(scheduleError);
    return applySubjectScheduleToCalendar({
      familyId,
      subject: { ...subject, name: subjectName.trim() || subject.name },
      assignedChildIds: effectiveAssignedChildIds,
      allChildIds: effectiveAllChildIds,
      weekdays: normalizedWeekdays,
      startTime: normalizedStartTime,
      durationMinutes: normalizedDuration,
      startDate,
      endDate,
      academicYearId: effectiveAcademicYearId,
      planData: effectivePlanData,
      applyScope: APPLY_SCOPE_FULL_YEAR,
    });
  };

  const handleSave = async () => {
    if (!subject?.id || !familyId || saving) return;
    const detailsError = validateDetails();
    if (detailsError) {
      setValidationBanner(detailsError);
      return;
    }
    const { ok, errors } = validateGradingSettings(gradingDraft);
    if (!ok) {
      setValidationBanner(errors[0]);
      return;
    }

    const normalizedWeekdays = (weekdays || [])
      .map((day) => parseInt(day, 10))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    const scheduleReady = isScheduleFormConfigured({
      weekdays: normalizedWeekdays,
      startTime: normalizeHm(startTime || DEFAULT_SCHEDULE_TIME, DEFAULT_SCHEDULE_TIME),
      durationMinutes: Number(durationMinutes) || Number(DEFAULT_SCHEDULE_DURATION),
      startDate,
      endDate,
    });
    if (normalizedWeekdays.length > 0 && !scheduleReady) {
      setValidationBanner(validateSchedule() || 'Complete the schedule fields before saving.');
      return;
    }

    setSaving(true);
    setValidationBanner('');
    try {
      const childIdString = selectedChildIds.join(';');
      const { data, error } = await supabase
        .from('subject')
        .update({
          name: subjectName.trim(),
          child_id: childIdString,
          grade: grade || null,
          school_year: schoolYear || getDefaultSchoolYear(),
          school_term: schoolTerm || getDefaultSchoolTerm(),
        })
        .eq('id', subject.id)
        .eq('family_id', familyId)
        .select();

      if (error) throw error;

      await saveSubjectGradingSettings(subject.id, familyId, gradingDraft);

      await saveSubjectAttachmentLinks({
        familyId,
        subjectId: subject.id,
        syllabusMaterialId,
        lessonPlanMaterialId,
      });

      const scheduleResult = await applyScheduleIfConfigured();

      const savedSubject = data?.[0] || { ...subject, name: subjectName.trim() };
      let refreshedPlan = scheduleResult?.planData || null;
      let refreshedYearId = scheduleResult?.academicYearId || effectiveAcademicYearId;
      if (!refreshedPlan && refreshedYearId) {
        try {
          const { data: yearData } = await getAcademicYear(refreshedYearId);
          refreshedPlan = yearData || null;
        } catch (_) {}
      }
      if (!refreshedPlan) {
        try {
          const fetched = await findAcademicYearPlanForSubject(familyId, subject.id);
          refreshedPlan = fetched?.planData || null;
          refreshedYearId = fetched?.academicYearId || refreshedYearId;
        } catch (_) {}
      }
      if (refreshedPlan) {
        setResolvedPlanData(refreshedPlan);
        setResolvedAcademicYearId(refreshedYearId);
        mergeSubjectProgressCache(familyId, subject.id, {
          academicYearId: refreshedYearId ?? null,
          planData: refreshedPlan,
        });
      }

      const eventsCreated = scheduleResult && (
        (scheduleResult.created ?? 0) > 0
        || (scheduleResult.totals?.inserted ?? 0) > 0
        || (scheduleResult.totals?.updated ?? 0) > 0
      );
      const scheduleSavedNoEvents = !!scheduleResult && !eventsCreated;

      toast.push(
        eventsCreated
          ? `"${subjectName.trim()}" saved and calendar updated`
          : scheduleSavedNoEvents
            ? `"${subjectName.trim()}" saved (schedule saved; no calendar slots in the selected date range)`
            : scheduleResult
              ? `"${subjectName.trim()}" schedule saved`
              : `"${subjectName.trim()}" settings saved`,
        scheduleSavedNoEvents ? 'warning' : 'success',
      );

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
        window.dispatchEvent(new CustomEvent('refreshMaterials', { detail: { familyId } }));
        window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: subject.id } }));
        if (savedSubject?.id) {
          window.dispatchEvent(new CustomEvent('subjectRecordUpserted', { detail: { subject: savedSubject } }));
        }
        if (refreshedPlan) {
          window.dispatchEvent(
            new CustomEvent('subjectProgressPlanCacheUpdated', {
              detail: { familyId, subjectId: subject.id },
            }),
          );
        }
      }

      await onSaved?.(savedSubject, {
        planData: refreshedPlan,
        academicYearId: refreshedYearId,
        scheduleApplied: !!scheduleResult,
      });
      onClose?.();
    } catch (err) {
      setValidationBanner(err?.message || 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubject = async () => {
    if (!subject?.id || !familyId || deletingSubject) return;
    setDeletingSubject(true);
    try {
      const deletedName = subject.name || subjectName || 'Subject';
      const result = await deleteSubjectCascade(supabase, familyId, subject.id, deletedName);
      if (!result.ok) throw new Error(result.error || 'Delete failed');
      dispatchSubjectDeletedSideEffects(familyId);
      toast.push(`"${deletedName}" has been deleted.`, 'success');
      onClose?.();
    } catch (err) {
      setValidationBanner(err?.message || 'Could not delete subject.');
    } finally {
      setDeletingSubject(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!visible || !subject?.id) return null;

  return (
    <>
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={localStyles.overlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={localStyles.modalWrap}>
            <AppModalShell
              title="Subject settings"
              onClose={onClose}
              disableShellScroll
              maxWidth={SUBJECT_SETTINGS_MODAL_MAX_WIDTH}
              shellStyle={[styles.compactShell, styles.subjectSettingsModalShell]}
              titleRowStyle={styles.subjectSettingsTitleRow}
              contentContainerStyle={localStyles.bodyContent}
              scrollerStyle={styles.subjectSettingsScroller}
              bodyStyle={[styles.shellBody, styles.subjectSettingsModalBody]}
              footer={(
                <ModalFooter
                  mode="edit"
                  primaryLabel={saving ? 'Saving…' : 'Save changes'}
                  destructiveLabel={deletingSubject ? 'Deleting…' : 'Delete subject'}
                  onCancel={onClose}
                  onDelete={() => setShowDeleteConfirm(true)}
                  onPrimary={handleSave}
                  accent="#9ECFFB"
                  disabled={saving || deletingSubject}
                  loading={saving || deletingSubject}
                />
              )}
            >
              {validationBanner ? (
                <View style={styles.validationBannerContainer}>
                  <Text style={styles.validationBannerText}>{validationBanner}</Text>
                </View>
              ) : null}

              <View style={styles.subjectSettingsFormRow}>
                <View style={styles.subjectSettingsFormColumnMain}>
                  <ScrollView
                    ref={formScrollRef}
                    style={styles.subjectSettingsMainColumnScroll}
                    contentContainerStyle={styles.subjectSettingsMainColumnScrollInner}
                    showsVerticalScrollIndicator
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                  <View style={[styles.assignmentContentPanel, styles.subjectSettingsDetailsPanel, styles.subjectSettingsStackedPanel]}>
                    <View
                      onLayout={(e) => {
                        sectionOffsetsRef.current.details = e.nativeEvent.layout.y;
                      }}
                    >
                      <SectionHeading>Details</SectionHeading>

                      <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>Subject name</Text>
                        <TextInput
                          style={styles.fieldInput}
                          value={subjectName}
                          onChangeText={setSubjectName}
                          placeholder="e.g., World History"
                          placeholderTextColor="#9ca3af"
                        />
                      </View>

                      <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>Students</Text>
                        {loadingChildren ? (
                          <Text style={localStyles.loadingText}>Loading students…</Text>
                        ) : (
                          <View style={styles.chipRow}>
                            {children.map((child) => {
                              const isSelected = selectedChildIds.includes(child.id);
                              return (
                                <TouchableOpacity
                                  key={child.id}
                                  style={[
                                    styles.dropdownOption,
                                    styles.assigneePill,
                                    isSelected && styles.dropdownOptionActive,
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
                                      styles.dropdownOptionText,
                                      styles.assigneePillText,
                                      isSelected && [styles.assigneePillTextActive, styles.dropdownOptionTextActive],
                                    ]}
                                  >
                                    {child.first_name || child.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </View>

                      <View style={styles.formGroup}>
                        <Text style={styles.fieldLabel}>Grade level</Text>
                        <View style={styles.chipRow}>
                          {GRADE_OPTIONS.map((gradeOption) => {
                            const isSelected = grade === gradeOption;
                            return (
                              <TouchableOpacity
                                key={gradeOption}
                                style={[
                                  styles.dropdownOption,
                                  styles.compactChip,
                                  styles.compactChipEqual,
                                  isSelected && styles.dropdownOptionActive,
                                ]}
                                onPress={() => setGrade(gradeOption)}
                                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                              >
                                <Text
                                  style={[
                                    styles.dropdownOptionText,
                                    styles.compactChipText,
                                    isSelected && styles.dropdownOptionTextActive,
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
                  </View>

                  <View
                    style={[styles.assignmentAttachPanel, styles.subjectSettingsStackedPanel, styles.subjectSettingsGradingPanelBox]}
                    onLayout={(e) => {
                      sectionOffsetsRef.current.grades = e.nativeEvent.layout.y;
                    }}
                  >
                    <SubjectGradingFields
                      draft={gradingDraft}
                      onUpdateDraft={updateGradingDraft}
                      onUpdateCategory={updateCategory}
                      onRemoveCategory={removeCategory}
                      onAddCategory={addCategory}
                    />
                  </View>

                  {familyId ? (
                    <View style={[styles.assignmentAttachPanel, styles.subjectSettingsStackedPanel]}>
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

                <View style={styles.subjectSettingsFormColumnSide}>
                  <View
                    style={styles.subjectSettingsSidePanel}
                    onLayout={(e) => {
                      sectionOffsetsRef.current.schedule = e.nativeEvent.layout.y;
                    }}
                  >
                    <SectionHeading>Schedule</SectionHeading>
                    <SubjectScheduleFields
                      embeddedInForm
                      schoolYear={schoolYear}
                      schoolYearOptions={schoolYearOptions}
                      onSchoolYearChange={handleSchoolYearChangeWithTouch}
                      schoolTerm={schoolTerm}
                      termOptions={TERM_OPTIONS}
                      onSchoolTermChange={handleSchoolTermChangeWithTouch}
                      weekdays={weekdays}
                      onWeekdaysChange={handleWeekdaysChange}
                      startTime={startTime}
                      onStartTimeChange={handleStartTimeChange}
                      durationMinutes={durationMinutes}
                      onDurationMinutesChange={handleDurationMinutesChange}
                      startDate={startDate}
                      onStartDateChange={handleStartDateChange}
                      endDate={endDate}
                      onEndDateChange={handleEndDateChange}
                      onOpenStartDatePicker={() => setDatePickerTarget('start')}
                      onOpenEndDatePicker={() => setDatePickerTarget('end')}
                    />
                  </View>
                </View>
              </View>
            </AppModalShell>
          </TouchableOpacity>
        </View>
      </Modal>

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
        visible={showDeleteConfirm}
        title="Delete subject?"
        message="This will permanently delete this subject and related planning links. This cannot be undone."
        confirmLabel={deletingSubject ? 'Deleting…' : 'Delete subject'}
        cancelLabel="Cancel"
        destructive
        onCancel={() => {
          if (!deletingSubject) setShowDeleteConfirm(false);
        }}
        onConfirm={handleDeleteSubject}
      />

      {showAddMaterialModal ? (
        <AddMaterialModal
          visible
          familyId={familyId}
          defaultRole={addMaterialDefaultRole}
          defaultSubjectId={subject?.id}
          defaultSubjectName={subjectName.trim() || subject?.name}
          defaultChildIds={selectedChildIds}
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
  overlay: styles.overlay,
  modalWrap: styles.subjectSettingsModalWrap,
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
