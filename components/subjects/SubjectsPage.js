import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  Alert,
  Image,
} from 'react-native';
import {
  Search,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  GraduationCap,
  Download,
  Check,
  Pencil,
} from 'lucide-react';

import { colors } from '../../theme/colors';
import { getSubjectsWithOverview, getSubjectDetail } from '../../lib/services/subjectsClient';
import { isAbortLikeError } from '../../lib/apiClient';
import { getAttendanceLogs } from '../../lib/services/recordsClient';
import { generateAttendanceReport } from '../../lib/services/attendanceClient';
import { exportCurriculumPlan, exportReportCard } from '../../lib/services/exportClient';
import { getPlanDefaultsFromSettings } from '../../lib/services/plannerSettingsClient';
import { supabase } from '../../lib/supabase';
import ChildAvatarCluster, { sourceForChild } from '../ui/ChildAvatarCluster';
import { useSession } from '../../contexts/SessionContext';
import { useOptionalFamilyUserControls } from '../../contexts/FamilyUserControlsContext';
import SubjectOverviewCard from './SubjectOverviewCard';
import SubjectDetailPage from './SubjectDetailPage';
import LearningSubjectsListView from '../learning/LearningSubjectsListView';
import ComplianceRequirementModal from '../compliance/ComplianceRequirementModal';
import SubjectsPlanBuilder from './SubjectsPlanBuilder';
import ProgressTab from './ProgressTab';
import ConfirmDialog from '../ConfirmDialog';
import { useToast } from '../Toast';
import {
  deleteSubjectCascadeForFamily,
  dispatchSubjectDeletedSideEffects,
} from '../../lib/services/deleteSubjectCascade';
import PlannerSettingsContent from '../settings/PlannerSettingsContent';
import { PlannerPreferenceDateField } from '../ui/AppCalendarDatePickerModal';

const SEARCH_SECTION_KEYWORDS = {
  'attendance-section': ['attendance', 'attended', 'present', 'absent', 'lesson', 'lessons', 'event', 'events'],
  'grades-section': ['grade', 'grades', 'grading', 'score', 'scores', 'scoring', 'assessment', 'assessments', 'quiz', 'quizzes', 'test', 'tests'],
  'learning-goals-section': ['goal', 'goals', 'learning', 'objective', 'objectives', 'mastery', 'target', 'targets'],
  'materials-section': ['material', 'materials', 'resource', 'resources', 'attachment', 'attachments', 'syllabus', 'file', 'files', 'pdf', 'document', 'documents'],
  'needs-help-section': ['help', 'support', 'needs-help', 'needshelp', 'struggle', 'struggling'],
};

function tokenizeSearchQuery(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);
}

function isSectionIntentToken(token, keywords) {
  const safeToken = String(token || '').toLowerCase().trim();
  if (!safeToken) return false;
  return keywords.some((keyword) => {
    const safeKeyword = String(keyword || '').toLowerCase().trim();
    if (!safeKeyword) return false;
    if (safeKeyword === safeToken) return true;
    // Allow near/prefix matching while typing, e.g. "grad" -> "grades"
    if (safeToken.length >= 3 && safeKeyword.startsWith(safeToken)) return true;
    return false;
  });
}

function computeSearchScore(entry, tokens, queryNormalized) {
  if (!entry || !tokens.length) return 0;
  const name = String(entry.subject?.name || '').toLowerCase();
  const description = String(entry.subject?.description || '').toLowerCase();
  const searchableText = String(entry.searchableText || '');
  let score = 0;

  if (queryNormalized && name === queryNormalized) score += 200;
  if (queryNormalized && name.includes(queryNormalized)) score += 120;
  if (queryNormalized && description.includes(queryNormalized)) score += 40;

  tokens.forEach((token) => {
    if (!token) return;
    if (name.includes(token)) score += 30;
    else if (description.includes(token)) score += 12;
    else if (searchableText.includes(token)) score += 4;
  });

  return score;
}

function normalizeSubjectTerm(term) {
  const raw = String(term || '').trim().toLowerCase();
  if (raw === 'fall_term') return 'fall_term';
  if (raw === 'spring_term') return 'spring_term';
  return 'full_year';
}

function getSubjectTermLabel(term) {
  if (term === 'fall_term') return 'Fall term';
  if (term === 'spring_term') return 'Spring term';
  return 'Full year';
}

function getCurrentSchoolYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  const startYear = month >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
}

function shiftSchoolYearLabel(schoolYearLabel, direction) {
  const raw = String(schoolYearLabel || '').trim();
  const m = raw.match(/^(\d{4})\/(\d{2})$/);
  const safeDirection = direction < 0 ? -1 : 1;
  if (!m) return getCurrentSchoolYear();
  const startYear = Number(m[1]);
  if (!Number.isFinite(startYear)) return getCurrentSchoolYear();
  const nextStart = startYear + safeDirection;
  return `${nextStart}/${String(nextStart + 1).slice(-2)}`;
}

const ALL_YEARS_FILTER = 'all_years';
const ALL_TERMS_FILTER = 'all_terms';
const SUBJECTS_PENDING_PLAN_OPEN_STORAGE_KEY = 'ld_pending_subject_schedule_plan_open';
const SUBJECTS_PENDING_SCHEDULE_MODAL_OPEN_STORAGE_KEY = 'ld_pending_subject_schedule_modal_open';

const SUBJECTS_MODE_STORAGE_PREFIX = 'subjects:selected-mode';

function toLocalYmd(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseSchoolYearRange(schoolYearLabel) {
  const raw = String(schoolYearLabel || '').trim();
  const m = raw.match(/^(\d{4})\/(\d{2})$/);
  if (!m) {
    const now = new Date();
    return {
      startDate: toLocalYmd(new Date(now.getFullYear(), 7, 1)),
      endDate: toLocalYmd(new Date(now.getFullYear() + 1, 6, 31)),
    };
  }
  const startYear = Number(m[1]);
  return {
    startDate: toLocalYmd(new Date(startYear, 7, 1)),
    endDate: toLocalYmd(new Date(startYear + 1, 6, 31)),
  };
}

function readStoredSubjectsMode(storageKey) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !storageKey) return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === 'plan' || raw === 'view' || raw === 'progress' ? raw : null;
  } catch (_) {
    return null;
  }
}

function writeStoredSubjectsMode(storageKey, mode) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !storageKey) return;
  try {
    window.localStorage.setItem(storageKey, mode);
  } catch (_) {}
}

export default function SubjectsPage({
  familyId,
  planningMode = null,
  children = [],
  preloadedSubjects = null,
  preloadedSubjectDetailCache = {},
  onSubjectsUpdate = null,
  onSubjectDetailUpdate = null,
  onAddSubject,
  onAddSyllabus,
  onAddEvent,
  onAddMaterial,
  onEditSubject,
  onEditChild,
  onNavigateToPlanner,
  onNavigateToPlannerAttendance,
  userRole = 'parent',
  accessibleChildren = [],
  screenMode = 'records',
  hideModeSegments = false,
  forcedModeFilter = null,
  learningSection = null,
  onTabChange = null,
}) {
  const isCatalogScreen = screenMode === 'catalog';
  const toast = useToast();
  // Get session context for role-based filtering
  const session = useSession();
  const familyUserControls = useOptionalFamilyUserControls();
  const safeChildren = Array.isArray(children) ? children : [];
  const safeAccessibleChildren = Array.isArray(accessibleChildren) ? accessibleChildren : [];
  
  // Determine if this is a child/student view
  const isChildView = userRole === 'child' || userRole === 'student';
  const isSelfManagedStudentViewer =
    isChildView && familyUserControls?.isSelfManagedStudent === true;
  const effectivePermissions = familyUserControls.effectivePermissions;
  const childPermissionsResolved = !isChildView || !familyUserControls.isRestrictedViewer || !!effectivePermissions;
  const canShowChildProgressTab = !isChildView
    ? true
    : childPermissionsResolved
      ? effectivePermissions?.canViewProgress !== false
      : false;
  const canShowChildScheduleTab = !isChildView
    ? true
    : childPermissionsResolved
      ? effectivePermissions?.canManageEvents === true
      : false;
  const canManageSubjectsActions = !isChildView
    ? true
    : childPermissionsResolved
      ? effectivePermissions?.canManageSubjects === true
      : false;
  const canManageMaterialsActions = !isChildView
    ? true
    : childPermissionsResolved
      ? effectivePermissions?.canManageMaterials === true
      : false;
  const canManageAttendanceActions = !isChildView
    ? true
    : childPermissionsResolved
      ? effectivePermissions?.canManageEvents === true
      : false;
  const canShowEditChildButton = !isChildView;
  const canShowEditSubjectButton = !isChildView;
  const showChildModeToggle =
    isChildView && !isSelfManagedStudentViewer && (canShowChildProgressTab || canShowChildScheduleTab);
  const childId = isChildView && safeAccessibleChildren.length > 0 ? (safeAccessibleChildren[0]?.id ?? safeAccessibleChildren[0]) : null;
  const modeStorageKey = useMemo(
    () => `${SUBJECTS_MODE_STORAGE_PREFIX}:${screenMode}:${familyId || 'unknown'}:${isChildView ? 'child' : 'family'}`,
    [familyId, isChildView, screenMode]
  );
  
  const [subjects, setSubjects] = useState(preloadedSubjects || []);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Auto-set child filter for child/student role
  const [selectedChildFilter, setSelectedChildFilter] = useState(() => {
    if (isChildView && childId) return childId;
    if (safeChildren.length > 0) return safeChildren[0].id;
    return 'all';
  });
  const [selectedCourseChildIds, setSelectedCourseChildIds] = useState(() => {
    if (isChildView && childId) return [String(childId)];
    return (safeChildren || []).map((child) => String(child?.id || '')).filter(Boolean);
  });
  const [selectedModeFilter, setSelectedModeFilter] = useState(() => {
    if (forcedModeFilter) return forcedModeFilter;
    return readStoredSubjectsMode(modeStorageKey) || 'view';
  });
  const effectiveModeFilter = forcedModeFilter || selectedModeFilter;
  const [selectedYearFilter, setSelectedYearFilter] = useState(() => getCurrentSchoolYear());
  const [selectedTermFilter, setSelectedTermFilter] = useState(ALL_TERMS_FILTER);
  const [selectedCourseSubjectIds, setSelectedCourseSubjectIds] = useState([]);
  const [allSubjectsFilterActive, setAllSubjectsFilterActive] = useState(true);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [pendingScheduleModalRequest, setPendingScheduleModalRequest] = useState(null);
  const [subjectDetailCache, setSubjectDetailCache] = useState(preloadedSubjectDetailCache || {});
  const subjectDetailCacheRef = useRef(preloadedSubjectDetailCache || {});
  const [pendingScrollToSectionId, setPendingScrollToSectionId] = useState(null);
  const [pendingOpenMaterialId, setPendingOpenMaterialId] = useState(null);
  const [pendingProgressAction, setPendingProgressAction] = useState(null);
  const [expandedSummaryMetric, setExpandedSummaryMetric] = useState(null);
  const [openComplianceRequirement, setOpenComplianceRequirement] = useState(null);
  const [complianceRowHoverKey, setComplianceRowHoverKey] = useState(null);
  const [attendanceByChildForCompliance, setAttendanceByChildForCompliance] = useState(null); // { [childId]: { daysPresent } }
  const loadingRef = useRef(false);
  const preloadingRef = useRef(false);
  const [showSubjectsExportModal, setShowSubjectsExportModal] = useState(false);
  const [learningHeaderPickerKind, setLearningHeaderPickerKind] = useState(null);
  const [archiveSubjectTarget, setArchiveSubjectTarget] = useState(null);
  const [archivingSubject, setArchivingSubject] = useState(false);
  const [showPlanningPreferencesModal, setShowPlanningPreferencesModal] = useState(false);
  const [planningPreferencesSchoolYearLabel, setPlanningPreferencesSchoolYearLabel] = useState(null);
  const [planningPreferencesInitialDataByYear, setPlanningPreferencesInitialDataByYear] = useState({});
  const [planningPreferencesSavedSinceOpen, setPlanningPreferencesSavedSinceOpen] = useState(false);
  const planningPreferencesSavedSinceOpenRef = useRef(false);
  const planningPreferencesSchoolYearLabelRef = useRef(null);
  useEffect(() => {
    planningPreferencesSavedSinceOpenRef.current = planningPreferencesSavedSinceOpen;
  }, [planningPreferencesSavedSinceOpen]);
  useEffect(() => {
    planningPreferencesSchoolYearLabelRef.current = String(planningPreferencesSchoolYearLabel || '').trim() || null;
  }, [planningPreferencesSchoolYearLabel]);
  const preloadPlanningPreferencesData = useCallback(async (schoolYearLabelInput) => {
    const schoolYearLabel = String(schoolYearLabelInput || '').trim();
    if (!familyId || !schoolYearLabel) return null;
    const existing = planningPreferencesInitialDataByYear[schoolYearLabel];
    if (existing && typeof existing === 'object') return existing;
    try {
      const { settings, exclusions, excluded_holiday_dates } = await getPlanDefaultsFromSettings(familyId, schoolYearLabel);
      const { data: subjectsData } = await supabase
        .from('subject')
        .select('id, name, school_year, default_constraint_mode, default_target_days, default_target_hours')
        .eq('family_id', familyId)
        .eq('school_year', schoolYearLabel)
        .order('name');
      const payload = {
        settings: {
          ...(settings || {}),
          school_year_label: schoolYearLabel,
          default_school_year: schoolYearLabel,
        },
        exclusions: exclusions || [],
        excluded_holiday_dates: excluded_holiday_dates || [],
        subjects: subjectsData || [],
      };
      setPlanningPreferencesInitialDataByYear((prev) => ({ ...prev, [schoolYearLabel]: payload }));
      return payload;
    } catch (_) {
      return null;
    }
  }, [familyId, planningPreferencesInitialDataByYear]);

  const openPlanningPreferencesModal = useCallback(async (schoolYearLabelInput) => {
    const targetYear = String(schoolYearLabelInput || '').trim() || selectedYearFilter || getCurrentSchoolYear();
    setPlanningPreferencesSchoolYearLabel(targetYear);
    setPlanningPreferencesSavedSinceOpen(false);
    planningPreferencesSavedSinceOpenRef.current = false;
    planningPreferencesSchoolYearLabelRef.current = targetYear;
    await preloadPlanningPreferencesData(targetYear);
    setShowPlanningPreferencesModal(true);
  }, [preloadPlanningPreferencesData, selectedYearFilter, planningPreferencesInitialDataByYear]);

  const closePlanningPreferencesModal = useCallback(() => {
    const closedYearLabel = String(planningPreferencesSchoolYearLabelRef.current || planningPreferencesSchoolYearLabel || '').trim();
    const savedSinceOpen = planningPreferencesSavedSinceOpenRef.current;
    setShowPlanningPreferencesModal(false);
    setPlanningPreferencesSchoolYearLabel(null);
    planningPreferencesSchoolYearLabelRef.current = null;
    if (savedSinceOpen) {
      if (closedYearLabel) {
        setPlanningPreferencesInitialDataByYear((prev) => {
          if (!prev || !prev[closedYearLabel]) return prev;
          const next = { ...prev };
          delete next[closedYearLabel];
          return next;
        });
      }
      toast.push('Saved', 'success');
      setPlanningPreferencesSavedSinceOpen(false);
      planningPreferencesSavedSinceOpenRef.current = false;
    }
  }, [planningPreferencesSchoolYearLabel, toast]);

  const requestPlanningPreferencesClose = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('plannerSettingsRequestClose'));
      return;
    }
    closePlanningPreferencesModal();
  }, [closePlanningPreferencesModal]);

  useEffect(() => {
    if (!familyId) return;
    const preloadYear = String(selectedYearFilter || getCurrentSchoolYear()).trim();
    if (!preloadYear) return;
    preloadPlanningPreferencesData(preloadYear);
  }, [familyId, selectedYearFilter, preloadPlanningPreferencesData]);

  const [subjectsExportType, setSubjectsExportType] = useState('schedule');
  const [subjectsExportFormat, setSubjectsExportFormat] = useState('excel');
  const [subjectsExportStartDate, setSubjectsExportStartDate] = useState('');
  const [subjectsExportEndDate, setSubjectsExportEndDate] = useState('');
  const [subjectsExportChildIds, setSubjectsExportChildIds] = useState([]);
  const [subjectsExportBusy, setSubjectsExportBusy] = useState(false);
  const [subjectsExportHideTypePicker, setSubjectsExportHideTypePicker] = useState(false);
  const allCourseChildIds = useMemo(
    () => (safeChildren || []).map((child) => String(child?.id || '')).filter(Boolean),
    [safeChildren]
  );
  const effectiveCoursesChildIds = useMemo(() => {
    if (isChildView && childId) return [String(childId)];
    if (!allCourseChildIds.length) return [];
    const selectedSet = new Set(
      (Array.isArray(selectedCourseChildIds) ? selectedCourseChildIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    );
    const validSelected = allCourseChildIds.filter((id) => selectedSet.has(id));
    return validSelected.length > 0 ? validSelected : allCourseChildIds;
  }, [isChildView, childId, allCourseChildIds, selectedCourseChildIds]);

  useEffect(() => {
    if ((subjectsExportType === 'schedule' || subjectsExportType === 'schedule_tables') && subjectsExportFormat !== 'excel' && subjectsExportFormat !== 'pdf') {
      setSubjectsExportFormat('excel');
      return;
    }
    if ((subjectsExportType === 'attendance' || subjectsExportType === 'report_card' || subjectsExportType === 'units_lessons') && subjectsExportFormat === 'excel') {
      setSubjectsExportFormat('pdf');
    }
  }, [subjectsExportType, subjectsExportFormat]);

  // Update local cache when prop changes
  useEffect(() => {
    if (!preloadedSubjectDetailCache || typeof preloadedSubjectDetailCache !== 'object') return;
    const keys = Object.keys(preloadedSubjectDetailCache);
    if (keys.length === 0) return;
    setSubjectDetailCache((prev) => ({
      ...(prev || {}),
      ...preloadedSubjectDetailCache,
    }));
  }, [preloadedSubjectDetailCache]);
  useEffect(() => {
    subjectDetailCacheRef.current = subjectDetailCache || {};
  }, [subjectDetailCache]);

  // Load subjects
  const loadSubjects = useCallback(async () => {
    if (!familyId || loadingRef.current) return;

    loadingRef.current = true;
    setError(null);

    try {
      const requestedChildId = isChildView
        ? (childId || null)
        : (selectedModeFilter === 'view'
          ? null
          : (selectedChildFilter === 'all' ? null : selectedChildFilter));
      // Pass session for role-based filtering (preferred) or fallback to childId
      const data = await getSubjectsWithOverview(familyId, requestedChildId, session);
      setSubjects(data);
      const idSet = new Set((data || []).map((s) => s.id));
      setSelectedSubjectId((prev) => (prev && idSet.has(prev) ? prev : null));
      setSubjectDetailCache((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(next)) {
          if (!idSet.has(k)) delete next[k];
        }
        return next;
      });

      if (onSubjectsUpdate) {
        onSubjectsUpdate(data);
      }

      // Preload subject detail data for all subjects (only if not already cached)
      if (data && data.length > 0 && !preloadingRef.current) {
        preloadingRef.current = true;
        // Preload in background without blocking
        Promise.all(
          data.map(async (subject) => {
            // Skip if already cached
            if (subjectDetailCacheRef.current?.[subject.id]) return;
            
            try {
              // Pass session for role-based filtering
              const detailData = await getSubjectDetail(subject.id, familyId, null, session);
              if (detailData == null) return;
              setSubjectDetailCache((prev) => ({
                ...(prev || {}),
                [subject.id]: detailData,
              }));
              
              // Update parent cache if callback provided
              if (onSubjectDetailUpdate) {
                onSubjectDetailUpdate(subject.id, detailData);
              }
            } catch (err) {
              // Silently fail - we'll load on demand if needed
              console.warn(`[SubjectsPage] Failed to preload detail for subject ${subject.id}:`, err);
            }
          })
        ).finally(() => {
          preloadingRef.current = false;
        });
      }
    } catch (err) {
      console.error('[SubjectsPage] Error loading subjects:', err);
      setError(err.message || 'Failed to load subjects');
    } finally {
      loadingRef.current = false;
    }
  }, [familyId, selectedChildFilter, selectedModeFilter, isChildView, childId, onSubjectsUpdate]);

  const refreshSubjectDetailById = useCallback(async (subjectId) => {
    const sid = String(subjectId || '').trim();
    if (!sid || !familyId) return null;
    try {
      const detailData = await getSubjectDetail(sid, familyId, null, session);
      if (!detailData) return null;
      setSubjectDetailCache((prev) => ({
        ...(prev || {}),
        [sid]: detailData,
      }));
      if (onSubjectDetailUpdate) {
        onSubjectDetailUpdate(sid, detailData);
      }
      setSubjects((prev) => (prev || []).map((row) => (
        String(row?.id) === sid
          ? { ...row, progressPercent: detailData?.progressPercent ?? row?.progressPercent }
          : row
      )));
      return detailData;
    } catch (err) {
      if (!isAbortLikeError(err)) {
        console.warn(`[SubjectsPage] Failed refreshing detail for subject ${sid}:`, err);
      }
      return null;
    }
  }, [familyId, session, onSubjectDetailUpdate]);

  // Lock child filter for child/student view
  useEffect(() => {
    if (isChildView && childId && selectedChildFilter !== childId) {
      setSelectedChildFilter(childId);
    }
  }, [isChildView, childId, selectedChildFilter]);
  useEffect(() => {
    if (isChildView && childId) {
      setSelectedCourseChildIds([String(childId)]);
      return;
    }
    if (!allCourseChildIds.length) {
      setSelectedCourseChildIds([]);
      return;
    }
    setSelectedCourseChildIds((prev) => {
      const selectedSet = new Set(
        (Array.isArray(prev) ? prev : []).map((id) => String(id || '').trim()).filter(Boolean)
      );
      const validSelected = allCourseChildIds.filter((id) => selectedSet.has(id));
      return validSelected.length > 0 ? validSelected : allCourseChildIds;
    });
  }, [isChildView, childId, allCourseChildIds]);
  useEffect(() => {
    if (isChildView) return;
    if (!Array.isArray(safeChildren) || safeChildren.length === 0) return;
    const currentIsValid = safeChildren.some((child) => String(child?.id) === String(selectedChildFilter));
    if (!currentIsValid) {
      setSelectedChildFilter(safeChildren[0].id);
    }
  }, [isChildView, safeChildren, selectedChildFilter]);

  useEffect(() => {
    const hasPreloadedSubjects = Array.isArray(preloadedSubjects) && preloadedSubjects.length > 0;
    if (!hasPreloadedSubjects) {
      loadSubjects();
    }
  }, [familyId, selectedChildFilter, selectedModeFilter, preloadedSubjects, loadSubjects]);

  // Listen for subject updates
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleSubjectUpdate = (event) => {
      const removedEventIds = new Set(
        (Array.isArray(event?.detail?.removedEventIds) ? event.detail.removedEventIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      );
      if (removedEventIds.size > 0) {
        setSubjectDetailCache((prev) => {
          const next = { ...(prev || {}) };
          Object.keys(next).forEach((sid) => {
            const detail = next[sid];
            if (!detail || typeof detail !== 'object') return;
            next[sid] = {
              ...detail,
              events: (Array.isArray(detail?.events) ? detail.events : [])
                .filter((item) => !removedEventIds.has(String(item?.id || '').trim())),
              attendanceRecords: (Array.isArray(detail?.attendanceRecords) ? detail.attendanceRecords : [])
                .filter((item) => !removedEventIds.has(String(item?.event_id || '').trim())),
              eventOutcomes: (Array.isArray(detail?.eventOutcomes) ? detail.eventOutcomes : [])
                .filter((item) => !removedEventIds.has(String(item?.event_id || '').trim())),
            };
          });
          return next;
        });
      } else {
        // No targeted IDs supplied, so force all subject details to refresh.
        setSubjectDetailCache({});
      }
      loadSubjects();
    };

    window.addEventListener('subjectUpdated', handleSubjectUpdate);
    window.addEventListener('subjectCreated', handleSubjectUpdate);
    window.addEventListener('refreshSubjects', handleSubjectUpdate);
    
    return () => {
      window.removeEventListener('subjectUpdated', handleSubjectUpdate);
      window.removeEventListener('subjectCreated', handleSubjectUpdate);
      window.removeEventListener('refreshSubjects', handleSubjectUpdate);
    };
  }, [loadSubjects]);

  // When parent passes a new preloaded list (e.g. after its cache reloads), stay in sync
  useEffect(() => {
    if (Array.isArray(preloadedSubjects) && preloadedSubjects.length > 0) {
      setSubjects(preloadedSubjects);
    }
  }, [preloadedSubjects]);

  useEffect(() => {
    const storedMode = readStoredSubjectsMode(modeStorageKey);
    setSelectedModeFilter(storedMode || 'view');
  }, [modeStorageKey]);

  useEffect(() => {
    writeStoredSubjectsMode(modeStorageKey, selectedModeFilter);
  }, [modeStorageKey, selectedModeFilter]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let rawPending = null;
    try {
      rawPending = window.sessionStorage.getItem(SUBJECTS_PENDING_PLAN_OPEN_STORAGE_KEY);
    } catch (_) {
      rawPending = null;
    }
    if (!rawPending) return;
    let pending = null;
    try {
      pending = JSON.parse(rawPending);
    } catch (_) {
      pending = null;
    }
    try {
      window.sessionStorage.removeItem(SUBJECTS_PENDING_PLAN_OPEN_STORAGE_KEY);
    } catch (_) {
      // no-op
    }
    const subjectId = String(pending?.subjectId || '').trim();
    if (!subjectId) return;
    const schoolYear = String(pending?.schoolYear || '').trim() || null;
    const schoolTerm = String(pending?.schoolTerm || '').trim() || null;
    if (schoolYear) setSelectedYearFilter(schoolYear);
    if (schoolTerm) setSelectedTermFilter(normalizeSubjectTerm(schoolTerm));
    setSelectedModeFilter('view');
  }, [familyId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let rawPending = null;
    try {
      rawPending = window.sessionStorage.getItem(SUBJECTS_PENDING_SCHEDULE_MODAL_OPEN_STORAGE_KEY);
    } catch (_) {
      rawPending = null;
    }
    if (!rawPending) return;
    let pending = null;
    try {
      pending = JSON.parse(rawPending);
    } catch (_) {
      pending = null;
    }
    try {
      window.sessionStorage.removeItem(SUBJECTS_PENDING_SCHEDULE_MODAL_OPEN_STORAGE_KEY);
    } catch (_) {
      // no-op
    }
    const subjectId = String(pending?.subjectId || '').trim();
    if (!subjectId) return;
    const schoolYear = String(pending?.schoolYear || '').trim() || null;
    if (schoolYear) setSelectedYearFilter(schoolYear);
    setSelectedModeFilter('plan');
    setPendingScheduleModalRequest({
      subjectId,
      requestedAt: Number(pending?.requestedAt || Date.now()),
    });
  }, [familyId]);

  const searchQueryNormalized = useMemo(() => String(searchQuery || '').toLowerCase().trim(), [searchQuery]);
  const searchTokens = useMemo(() => tokenizeSearchQuery(searchQuery), [searchQuery]);
  const sectionSearchKeywords = useMemo(
    () => Object.values(SEARCH_SECTION_KEYWORDS).flat(),
    []
  );
  const nonSectionSearchTokens = useMemo(
    () => searchTokens.filter((token) => !isSectionIntentToken(token, sectionSearchKeywords)),
    [searchTokens, sectionSearchKeywords]
  );

  const detectedSectionFromSearch = useMemo(() => {
    if (!searchTokens.length) return null;
    for (const [sectionId, keywords] of Object.entries(SEARCH_SECTION_KEYWORDS)) {
      if (searchTokens.some((token) => isSectionIntentToken(token, keywords))) {
        return sectionId;
      }
    }
    return null;
  }, [searchTokens]);
  const activeSearchPreviewSectionId = useMemo(
    () => (searchTokens.length > 0 ? detectedSectionFromSearch : null),
    [searchTokens, detectedSectionFromSearch]
  );

  const searchableSubjects = useMemo(() => {
    return (subjects || []).map((subject) => {
      const detail = subjectDetailCache[subject.id];
      const assignedChildIds = Array.isArray(subject?.assignedChildren) ? subject.assignedChildren : [];
      const assignedChildNames = assignedChildIds
        .map((id) => safeChildren.find((child) => String(child?.id) === String(id)))
        .filter(Boolean)
        .map((child) => `${child?.name || ''} ${child?.first_name || ''}`.trim())
        .filter(Boolean);
      const schoolYear = String(subject?.school_year || '2025/26');
      const schoolYearTokens = schoolYear
        .split(/[^0-9a-z]+/gi)
        .map((token) => token.trim())
        .filter(Boolean);
      const schoolTerm = normalizeSubjectTerm(subject?.school_term);
      const textParts = [
        subject?.name,
        subject?.description,
        subject?.currentFocus,
        subject?.coreGoal,
        schoolYear,
        schoolYear.replace('/', ' '),
        schoolYearTokens.join(' '),
        schoolTerm.replace('_', ' '),
        getSubjectTermLabel(schoolTerm),
        assignedChildNames.join(' '),
      ];

      if (detail) {
        textParts.push(
          detail?.subject?.name,
          detail?.subject?.description,
          detail?.currentFocus,
          detail?.coreGoal
        );
        (detail.materials || []).forEach((material) => {
          textParts.push(
            material?.title,
            material?.provider_name,
            Array.isArray(material?.tags) ? material.tags.join(' ') : null
          );
        });
        (detail.events || []).forEach((event) => {
          textParts.push(
            event?.title,
            event?.description,
            event?.notes,
            event?.status,
            event?.lesson_name,
            event?.unit_name
          );
        });
        (detail.grades || []).forEach((grade) => {
          textParts.push(
            grade?.grade,
            grade?.title,
            grade?.label,
            grade?.category,
            grade?.notes,
            grade?.score != null ? String(grade.score) : null,
            grade?.possible != null ? String(grade.possible) : null
          );
        });
        (detail.eventOutcomes || []).forEach((outcome) => {
          textParts.push(
            outcome?.grade,
            outcome?.notes,
            outcome?.comment,
            outcome?.title
          );
        });
        (detail.learningGoals || []).forEach((goal) => {
          textParts.push(goal?.title, goal?.description, goal?.status, goal?.notes);
        });
      }

      if ((detail?.attendanceRecords || []).length > 0 || (detail?.events || []).length > 0) {
        textParts.push('attendance lessons events present absent');
      }
      if ((detail?.grades || []).length > 0 || (detail?.eventOutcomes || []).some((o) => o?.grade != null)) {
        textParts.push('grades score scoring assessment');
      }
      if ((detail?.materials || []).length > 0) {
        textParts.push('materials syllabus files pdf document');
      }
      if ((detail?.learningGoals || []).length > 0) {
        textParts.push('learning goals objective mastery target');
      }

      const materialsSearchText = (detail?.materials || [])
        .map((material) => {
          const title = material?.title || material?.provider_name || '';
          const tags = Array.isArray(material?.tags) ? material.tags.join(' ') : '';
          const type = material?.type || material?.kind || material?.mime_type || material?.content_type || '';
          return `${title} ${tags} ${type}`;
        })
        .join(' ')
        .toLowerCase();

      return {
        subject,
        searchableText: textParts.filter(Boolean).join(' ').toLowerCase(),
        materialsSearchText,
      };
    });
  }, [subjects, subjectDetailCache, safeChildren]);

  // Filter subjects by search query
  const filteredSubjects = useMemo(() => {
    if (!searchableSubjects.length) return [];

    let filteredEntries = searchableSubjects.map((entry) => ({
      ...entry,
      score: 0,
    }));

    // Filter by search + rank by relevance
    if (searchTokens.length > 0) {
      // Treat section keywords (e.g. "grades", "attendance") as navigation intent,
      // not strict filter terms, so queries like "math grades" still match by subject.
      const requiredTokens = nonSectionSearchTokens;
      filteredEntries = searchableSubjects
        .filter((entry) =>
          requiredTokens.length === 0 ||
          requiredTokens.every((token) => entry.searchableText.includes(token))
        )
        .map((entry) => ({
          ...entry,
          score: computeSearchScore(entry, searchTokens, searchQueryNormalized),
        }))
        .sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const aName = String(a.subject?.name || '');
          const bName = String(b.subject?.name || '');
          return aName.localeCompare(bName);
        });

      // For section-only searches (e.g. "syllabus"), narrow by section content.
      if (requiredTokens.length === 0 && detectedSectionFromSearch === 'materials-section') {
        filteredEntries = filteredEntries.filter((entry) => {
          if (!entry.materialsSearchText) return false;
          return searchTokens.some((token) => entry.materialsSearchText.includes(token));
        });
      }
    }

    // Filter by child
    if (selectedModeFilter === 'view' && !isChildView) {
      if (effectiveCoursesChildIds.length > 0 && effectiveCoursesChildIds.length < allCourseChildIds.length) {
        filteredEntries = filteredEntries.filter(({ subject }) => {
          if (!subject.assignedChildren || subject.assignedChildren.length === 0) {
            return true; // Subjects with no assigned children show for all
          }
          return subject.assignedChildren.some((id) => effectiveCoursesChildIds.includes(String(id)));
        });
      }
    } else if (selectedChildFilter !== 'all') {
      filteredEntries = filteredEntries.filter(({ subject }) => {
        if (!subject.assignedChildren || subject.assignedChildren.length === 0) {
          return true; // Subjects with no assigned children show for all
        }
        return subject.assignedChildren.includes(selectedChildFilter);
      });
    }

    // Filter by school year + term
    if (selectedYearFilter !== ALL_YEARS_FILTER) {
      filteredEntries = filteredEntries.filter(
        ({ subject }) => (subject.school_year || '2025/26') === selectedYearFilter
      );
    }
    if (!isCatalogScreen && selectedTermFilter !== ALL_TERMS_FILTER) {
      filteredEntries = filteredEntries.filter(
        ({ subject }) => normalizeSubjectTerm(subject?.school_term) === selectedTermFilter
      );
    }

    if (
      isCatalogScreen
      && selectedModeFilter === 'view'
      && !allSubjectsFilterActive
      && selectedCourseSubjectIds.length > 0
    ) {
      const selectedSet = new Set(
        selectedCourseSubjectIds.map((id) => String(id || '').trim()).filter(Boolean)
      );
      filteredEntries = filteredEntries.filter(({ subject }) =>
        selectedSet.has(String(subject?.id || ''))
      );
    }

    return filteredEntries.map((entry) => entry.subject).filter(Boolean);
  }, [
    searchableSubjects,
    searchTokens,
    nonSectionSearchTokens,
    detectedSectionFromSearch,
    selectedModeFilter,
    isChildView,
    effectiveCoursesChildIds,
    allCourseChildIds,
    selectedChildFilter,
    selectedYearFilter,
    selectedTermFilter,
    searchQueryNormalized,
    isCatalogScreen,
    allSubjectsFilterActive,
    selectedCourseSubjectIds,
  ]);

  const subjectsForSubjectFilterChips = useMemo(() => {
    let list = subjects || [];
    if (selectedModeFilter === 'view' && !isChildView) {
      if (
        effectiveCoursesChildIds.length > 0
        && effectiveCoursesChildIds.length < allCourseChildIds.length
      ) {
        list = list.filter((subject) => {
          if (!subject.assignedChildren || subject.assignedChildren.length === 0) return true;
          return subject.assignedChildren.some((id) =>
            effectiveCoursesChildIds.includes(String(id))
          );
        });
      }
    } else if (selectedChildFilter !== 'all') {
      list = list.filter((subject) => {
        if (!subject.assignedChildren || subject.assignedChildren.length === 0) return true;
        return subject.assignedChildren.includes(selectedChildFilter);
      });
    }
    if (selectedYearFilter !== ALL_YEARS_FILTER) {
      list = list.filter(
        (subject) => (subject.school_year || '2025/26') === selectedYearFilter
      );
    }
    return list;
  }, [
    subjects,
    selectedModeFilter,
    isChildView,
    effectiveCoursesChildIds,
    allCourseChildIds,
    selectedChildFilter,
    selectedYearFilter,
  ]);

  const toggleCourseChildFilter = useCallback((nextChildId) => {
    const safeId = String(nextChildId || '').trim();
    if (!safeId || isChildView) return;
    setSelectedCourseChildIds((prev) => {
      const current = Array.isArray(prev)
        ? prev.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const exists = current.includes(safeId);
      if (exists) {
        return current.length <= 1 ? current : current.filter((id) => id !== safeId);
      }
      return [...current, safeId];
    });
  }, [isChildView]);

  const allCourseSubjectIds = useMemo(
    () =>
      (subjectsForSubjectFilterChips || [])
        .map((subject) => String(subject?.id || '').trim())
        .filter(Boolean),
    [subjectsForSubjectFilterChips]
  );

  useEffect(() => {
    if (allSubjectsFilterActive) return;
    setSelectedCourseSubjectIds((prev) => {
      const prevSet = new Set((Array.isArray(prev) ? prev : []).map(String));
      if (!allCourseSubjectIds.length) return [];
      const retained = allCourseSubjectIds.filter((id) => prevSet.has(id));
      if (retained.length === 0) {
        setAllSubjectsFilterActive(true);
        return [];
      }
      return retained;
    });
  }, [allCourseSubjectIds.join('|'), allSubjectsFilterActive]);

  const effectiveCoursesSubjectIds = useMemo(() => {
    if (!allCourseSubjectIds.length) return [];
    if (allSubjectsFilterActive) return allCourseSubjectIds;
    const selectedSet = new Set(
      (Array.isArray(selectedCourseSubjectIds) ? selectedCourseSubjectIds : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    );
    const valid = allCourseSubjectIds.filter((id) => selectedSet.has(id));
    return valid.length > 0 ? valid : allCourseSubjectIds;
  }, [allCourseSubjectIds, selectedCourseSubjectIds, allSubjectsFilterActive]);

  const selectAllSubjectsFilter = useCallback(() => {
    setAllSubjectsFilterActive(true);
    setSelectedCourseSubjectIds([]);
  }, []);

  const detailLoadAttemptedRef = useRef(new Set());
  useEffect(() => {
    if (!familyId || selectedModeFilter !== 'view') return;
    const subjectList = (subjects?.length ? subjects : preloadedSubjects) || [];
    if (!subjectList.length) return;
    const subjectIds = effectiveCoursesSubjectIds.length > 0
      ? effectiveCoursesSubjectIds
      : subjectList.map((subject) => String(subject?.id || '').trim()).filter(Boolean);
    subjectIds.forEach((sid) => {
      if (!sid || detailLoadAttemptedRef.current.has(sid)) return;
      const cached = subjectDetailCacheRef.current?.[sid];
      if (cached && Array.isArray(cached.events) && cached.events.length > 0) return;
      detailLoadAttemptedRef.current.add(sid);
      refreshSubjectDetailById(sid);
    });
  }, [
    familyId,
    selectedModeFilter,
    subjects,
    preloadedSubjects,
    effectiveCoursesSubjectIds,
    refreshSubjectDetailById,
  ]);

  const toggleCourseSubjectFilter = useCallback((subjectId) => {
    const safeId = String(subjectId || '').trim();
    if (!safeId) return;
    setAllSubjectsFilterActive(false);
    setSelectedCourseSubjectIds((prev) => {
      const current = Array.isArray(prev)
        ? prev.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const exists = current.includes(safeId);
      if (exists) {
        return current.length <= 1 ? current : current.filter((id) => id !== safeId);
      }
      return [...current, safeId];
    });
  }, []);

  const handleSubjectClick = useCallback((subject, sectionOverride = null, materialId = null, progressAction = null) => {
    if (!subject?.id) return;
    const sectionId = sectionOverride || detectedSectionFromSearch || null;
    setPendingScrollToSectionId(sectionId);
    setPendingOpenMaterialId(materialId || null);
    setPendingProgressAction(progressAction || null);
    setSelectedSubjectId(subject.id);
    setExpandedSummaryMetric(null);
  }, [detectedSectionFromSearch]);

  const handleSearchSubmit = useCallback(() => {
    if (!searchTokens.length) return;
    if (!filteredSubjects.length) return;
    const bestMatch = filteredSubjects[0];
    handleSubjectClick(bestMatch, detectedSectionFromSearch || null);
  }, [searchTokens, filteredSubjects, handleSubjectClick, detectedSectionFromSearch]);

  // Years that have at least one subject (for chip row - only show chips for registered years)
  const registeredYears = useMemo(() => {
    if (!subjects || subjects.length === 0) return [];
    const years = [...new Set(subjects.map(s => s.school_year || '2025/26').filter(Boolean))];
    return years.sort();
  }, [subjects]);
  const yearNavYears = useMemo(() => {
    const currentYear = getCurrentSchoolYear();
    return [...new Set([currentYear, ...(registeredYears || [])])].sort();
  }, [registeredYears]);
  const currentCoursesYear = getCurrentSchoolYear();
  const selectedCoursesYear = useMemo(() => (
    selectedYearFilter === ALL_YEARS_FILTER ? getCurrentSchoolYear() : selectedYearFilter
  ), [selectedYearFilter]);
  const selectedCoursesYearIndex = useMemo(
    () => yearNavYears.findIndex((year) => String(year) === String(selectedCoursesYear)),
    [yearNavYears, selectedCoursesYear]
  );
  const canNavigatePrevCoursesYear = true;
  const canNavigateNextCoursesYear = true;
  const shiftCoursesYear = useCallback((direction) => {
    setSelectedYearFilter((prev) => {
      const baseline = prev === ALL_YEARS_FILTER ? getCurrentSchoolYear() : (prev || selectedCoursesYear || getCurrentSchoolYear());
      return shiftSchoolYearLabel(baseline, direction);
    });
  }, [selectedCoursesYear]);
  const isAtCurrentCoursesYear = String(selectedCoursesYear) === String(currentCoursesYear);
  const jumpToCurrentCoursesYear = useCallback(() => {
    if (isAtCurrentCoursesYear) return;
    setSelectedYearFilter(currentCoursesYear);
  }, [isAtCurrentCoursesYear, currentCoursesYear]);

  const registeredTerms = useMemo(() => {
    const order = ['full_year', 'fall_term', 'spring_term'];
    return order;
  }, []);

  const showInlineChildrenFilters = !isChildView && safeChildren.length > 0;
  const effectiveSubjectPrefillTerm = useMemo(() => {
    if (selectedTermFilter === ALL_TERMS_FILTER) return 'full_year';
    if (selectedTermFilter === 'full_year' || selectedTermFilter === 'fall_term' || selectedTermFilter === 'spring_term') {
      return selectedTermFilter;
    }
    return 'full_year';
  }, [selectedTermFilter]);
  const prefilledSubjectChildIds = useMemo(() => {
    if (selectedChildFilter === 'all') {
      return (safeChildren || []).map((child) => child?.id).filter(Boolean);
    }
    return selectedChildFilter ? [selectedChildFilter] : [];
  }, [selectedChildFilter, safeChildren]);
  const openAddSubjectWithCurrentHeaders = useCallback(() => {
    const detail = {
      schoolYear: selectedCoursesYear || getCurrentSchoolYear(),
      schoolTerm: effectiveSubjectPrefillTerm,
      childIds: prefilledSubjectChildIds,
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openAddSubjectModal', { detail }));
      return;
    }
    if (onAddSubject) onAddSubject(detail);
  }, [selectedCoursesYear, effectiveSubjectPrefillTerm, prefilledSubjectChildIds, onAddSubject]);
  const openAddEventWithCurrentHeaders = useCallback(() => {
    const detail = {
      eventType: 'Lesson',
      date: new Date(),
    };
    if (effectiveCoursesChildIds.length > 0) {
      detail.childIds = effectiveCoursesChildIds.map(String);
      detail.childId = detail.childIds[0] || null;
    } else if (prefilledSubjectChildIds.length > 0) {
      detail.childIds = prefilledSubjectChildIds.map(String);
      detail.childId = detail.childIds[0] || null;
    }
    const preferredSubjectId = (
      effectiveCoursesSubjectIds.length === 1
        ? effectiveCoursesSubjectIds[0]
        : (effectiveCoursesSubjectIds[0] || filteredSubjects[0]?.id || null)
    );
    if (preferredSubjectId) {
      detail.subjectId = preferredSubjectId;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openTaskModal', { detail }));
      return;
    }
    if (onAddEvent && preferredSubjectId) {
      const subject = (filteredSubjects || []).find((entry) => String(entry?.id) === String(preferredSubjectId));
      if (subject) onAddEvent(subject);
    }
  }, [
    effectiveCoursesChildIds,
    prefilledSubjectChildIds,
    effectiveCoursesSubjectIds,
    filteredSubjects,
    onAddEvent,
  ]);
  const emptyStateYearTermLabel = useMemo(() => {
    const termLabel = selectedTermFilter === ALL_TERMS_FILTER
      ? 'All terms'
      : getSubjectTermLabel(selectedTermFilter);
    return `${selectedCoursesYear} / ${termLabel}`;
  }, [selectedCoursesYear, selectedTermFilter]);
  const openSubjectsExportModal = useCallback((preferredType = 'schedule') => {
    const normalizedPreferred = preferredType === 'grades' ? 'report_card' : String(preferredType || '');
    const type = ['schedule', 'schedule_tables', 'attendance', 'report_card', 'units_lessons'].includes(normalizedPreferred)
      ? normalizedPreferred
      : 'schedule';
    const range = parseSchoolYearRange(selectedCoursesYear || getCurrentSchoolYear());
    const lockTypePicker = type === 'attendance' || type === 'report_card';
    setSubjectsExportHideTypePicker(lockTypePicker);
    setSubjectsExportType(type);
    if (type === 'schedule' || type === 'schedule_tables') {
      setSubjectsExportFormat('excel');
    } else if (type === 'attendance') {
      setSubjectsExportFormat('pdf');
    } else if (type === 'report_card') {
      setSubjectsExportFormat('pdf');
    } else {
      setSubjectsExportFormat('pdf');
    }
    setSubjectsExportStartDate(range.startDate);
    setSubjectsExportEndDate(range.endDate);
    setSubjectsExportChildIds(prefilledSubjectChildIds);
    setShowSubjectsExportModal(true);
  }, [selectedCoursesYear, prefilledSubjectChildIds]);

  const subjectsExportModalTitle = useMemo(() => {
    if (!subjectsExportHideTypePicker) return 'Export subject data';
    if (subjectsExportType === 'attendance') return 'Export attendance';
    if (subjectsExportType === 'report_card') return 'Export grades';
    return 'Export subject data';
  }, [subjectsExportHideTypePicker, subjectsExportType]);

  const closeSubjectsExportModal = useCallback(() => {
    if (subjectsExportBusy) return;
    setShowSubjectsExportModal(false);
    setSubjectsExportHideTypePicker(false);
  }, [subjectsExportBusy]);
  const toggleSubjectsExportChild = useCallback((childId) => {
    const safeId = String(childId || '');
    if (!safeId) return;
    setSubjectsExportChildIds((prev) => {
      const set = new Set((prev || []).map((id) => String(id)));
      if (set.has(safeId)) set.delete(safeId);
      else set.add(safeId);
      return Array.from(set);
    });
  }, []);
  const runSubjectsExport = useCallback(async () => {
    const start = String(subjectsExportStartDate || '').trim();
    const end = String(subjectsExportEndDate || '').trim();
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (!start || !end || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
      Alert.alert('Invalid dates', 'Please provide a valid start and end date.');
      return;
    }
    const selectedChildIds = (subjectsExportChildIds || []).map((id) => String(id)).filter(Boolean);
    if (selectedChildIds.length === 0) {
      Alert.alert('Select students', 'Choose at least one student to export.');
      return;
    }
    const triggerBlobDownload = (blob, filename) => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    };
    const toEventDate = (eventRow) => {
      const raw = eventRow?.start_ts || eventRow?.start || eventRow?.start_local || eventRow?.date || null;
      const dt = raw ? new Date(raw) : null;
      return dt && !Number.isNaN(dt.getTime()) ? dt : null;
    };
    const escapeHtml = (value) => String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    setSubjectsExportBusy(true);
    try {
      if (subjectsExportType === 'schedule') {
        if (subjectsExportFormat === 'excel') {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('plannerExportToExcel', {
              detail: {
                startDate,
                endDate,
                childIds: selectedChildIds,
                columns: {
                  instructionalTime: false,
                  plan: false,
                  location: false,
                  mode: false,
                  instructor: false,
                  subject: false,
                  grade: false,
                  unit: false,
                  percentOfTotal: false,
                  attachmentTitle: false,
                  notes: false,
                },
              },
            }));
          }
        } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const rows = filteredSubjects.map((subject) => {
            const childrenForSubject = Array.isArray(subject?.assignedChildren)
              ? subject.assignedChildren
                .map((id) => safeChildren.find((child) => String(child?.id) === String(id)))
                .filter(Boolean)
                .map((child) => child?.name || child?.first_name || 'Student')
                .join(', ')
              : '—';
            return {
              subject: subject?.name || 'Subject',
              term: getSubjectTermLabel(normalizeSubjectTerm(subject?.school_term)),
              children: childrenForSubject || '—',
            };
          });
          const html = `
            <html>
              <head><title>Schedule Export</title></head>
              <body style="font-family: Arial, sans-serif; padding: 24px;">
                <h2>Class schedule (${selectedCoursesYear})</h2>
                <p>Date range: ${start} to ${end}</p>
                <table border="1" cellspacing="0" cellpadding="8" style="border-collapse: collapse; width: 100%;">
                  <thead><tr><th>Subject</th><th>Term</th><th>Students</th></tr></thead>
                  <tbody>
                    ${rows.map((r) => `<tr><td>${r.subject}</td><td>${r.term}</td><td>${r.children}</td></tr>`).join('')}
                  </tbody>
                </table>
              </body>
            </html>
          `;
          const printWindow = window.open('', '_blank', 'width=980,height=720');
          if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
          }
        }
      } else if (subjectsExportType === 'schedule_tables') {
        const nowMs = Date.now();
        const rowsBySubject = [];
        for (const subject of filteredSubjects) {
          let detail = subjectDetailCache?.[subject?.id] || null;
          if (!detail && subject?.id && familyId) {
            try {
              detail = await getSubjectDetail(subject.id, familyId);
            } catch (_) {
              detail = null;
            }
          }
          const events = Array.isArray(detail?.events) ? detail.events : [];
          const relevantEvents = events
            .filter((ev) => {
              const evDate = toEventDate(ev);
              if (!evDate) return false;
              if (evDate < startDate || evDate > endDate) return false;
              if (String(ev?.status || '').toLowerCase() === 'canceled') return false;
              const eventChildIds = Array.isArray(ev?.child_ids)
                ? ev.child_ids.map((id) => String(id))
                : (ev?.child_id ? [String(ev.child_id)] : []);
              if (eventChildIds.length === 0) return true;
              return eventChildIds.some((id) => selectedChildIds.includes(id));
            })
            .map((ev) => {
              const evDate = toEventDate(ev);
              const ms = evDate ? evDate.getTime() : 0;
              const isCompleted = String(ev?.status || '').toLowerCase() === 'done' || ms < nowMs;
              const ymd = evDate ? toLocalYmd(evDate) : '';
              return {
                id: String(ev?.id || ''),
                title: ev?.title || ev?.lesson_name || 'Event',
                date: ymd,
                time: evDate
                  ? evDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                  : '—',
                isCompleted,
                statusBucket: isCompleted ? 'Done' : 'Upcoming',
              };
            })
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

          const doneCount = relevantEvents.filter((ev) => ev.isCompleted).length;
          const upcomingCount = relevantEvents.filter((ev) => !ev.isCompleted).length;
          const projectedCount = relevantEvents.length;
          const uniqueDays = [...new Set(relevantEvents.map((ev) => ev.date).filter(Boolean))];
          rowsBySubject.push({
            subjectName: subject?.name || 'Subject',
            term: getSubjectTermLabel(normalizeSubjectTerm(subject?.school_term)),
            targetDays: Number.isFinite(Number(subject?.default_target_days)) ? Number(subject.default_target_days) : null,
            doneCount,
            upcomingCount,
            projectedCount,
            uniqueDays,
            events: relevantEvents,
          });
        }

        if (subjectsExportFormat === 'excel') {
          const csvLines = [];
          csvLines.push('Schedule Tables Export');
          csvLines.push(`Date range,${start},${end}`);
          csvLines.push('');
          csvLines.push('Subject,Term,Target days,Done,Upcoming,Projected (Done + Upcoming),Full days included');
          rowsBySubject.forEach((row) => {
            csvLines.push([
              `"${String(row.subjectName).replace(/"/g, '""')}"`,
              `"${String(row.term).replace(/"/g, '""')}"`,
              row.targetDays != null ? row.targetDays : '',
              row.doneCount,
              row.upcomingCount,
              row.projectedCount,
              `"${row.uniqueDays.join('; ')}"`,
            ].join(','));
          });
          csvLines.push('');
          csvLines.push('Subject,Date,Time,Lesson,Bucket');
          rowsBySubject.forEach((row) => {
            row.events.forEach((eventRow) => {
              csvLines.push([
                `"${String(row.subjectName).replace(/"/g, '""')}"`,
                eventRow.date,
                `"${String(eventRow.time || '—').replace(/"/g, '""')}"`,
                `"${String(eventRow.title || '').replace(/"/g, '""')}"`,
                eventRow.statusBucket,
              ].join(','));
            });
          });
          const csvBlob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
          triggerBlobDownload(csvBlob, `schedule_tables_${start}_${end}.csv`);
        } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const html = `
            <html>
              <head><title>Schedule Tables Export</title></head>
              <body style="font-family: Arial, sans-serif; padding: 24px;">
                <h2>Schedule tables (${escapeHtml(selectedCoursesYear)})</h2>
                <p>Date range: ${escapeHtml(start)} to ${escapeHtml(end)}</p>
                <table border="1" cellspacing="0" cellpadding="8" style="border-collapse: collapse; width: 100%; margin-bottom: 20px;">
                  <thead>
                    <tr>
                      <th>Subject</th><th>Term</th><th>Target days</th><th>Done</th><th>Upcoming</th><th>Projected (Done + Upcoming)</th><th>Full days included</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rowsBySubject.map((row) => `
                      <tr>
                        <td>${escapeHtml(row.subjectName)}</td>
                        <td>${escapeHtml(row.term)}</td>
                        <td>${row.targetDays != null ? row.targetDays : '—'}</td>
                        <td>${row.doneCount}</td>
                        <td>${row.upcomingCount}</td>
                        <td>${row.projectedCount}</td>
                        <td>${escapeHtml(row.uniqueDays.join(', '))}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
                ${rowsBySubject.map((row) => `
                  <h3>${escapeHtml(row.subjectName)}</h3>
                  <p><strong>Logic input days:</strong> ${escapeHtml(row.uniqueDays.join(', ') || 'None')}</p>
                  <table border="1" cellspacing="0" cellpadding="8" style="border-collapse: collapse; width: 100%; margin-bottom: 18px;">
                    <thead><tr><th>Date</th><th>Time</th><th>Lesson</th><th>Bucket</th></tr></thead>
                    <tbody>
                      ${row.events.map((eventRow) => `
                        <tr>
                          <td>${escapeHtml(eventRow.date || '—')}</td>
                          <td>${escapeHtml(eventRow.time || '—')}</td>
                          <td>${escapeHtml(eventRow.title || 'Event')}</td>
                          <td>${escapeHtml(eventRow.statusBucket)}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                `).join('')}
              </body>
            </html>
          `;
          const printWindow = window.open('', '_blank', 'width=1080,height=760');
          if (printWindow) {
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
          }
        }
      } else if (subjectsExportType === 'attendance') {
        const fileExt = subjectsExportFormat === 'csv' ? 'csv' : 'pdf';
        const reportType = selectedTermFilter === 'fall_term' ? 'fall_term'
          : selectedTermFilter === 'spring_term' ? 'spring_term'
            : 'custom';
        for (const childId of selectedChildIds) {
          const childName = safeChildren.find((child) => String(child?.id) === String(childId))?.name
            || safeChildren.find((child) => String(child?.id) === String(childId))?.first_name
            || 'student';
          const blob = await generateAttendanceReport({
            child_id: childId,
            report_type: reportType,
            date_range_start: start,
            date_range_end: end,
            format: fileExt,
          });
          triggerBlobDownload(blob, `attendance_${String(childName).replace(/\s+/g, '_')}_${start}_${end}.${fileExt}`);
        }
      } else if (subjectsExportType === 'report_card') {
        const format = subjectsExportFormat === 'docx' ? 'docx' : 'pdf';
        const termLabel = selectedTermFilter === ALL_TERMS_FILTER
          ? `${selectedCoursesYear} School Year`
          : `${getSubjectTermLabel(selectedTermFilter)} ${selectedCoursesYear}`;
        const toDate = (value) => {
          if (!value) return null;
          const dt = new Date(value);
          return Number.isNaN(dt.getTime()) ? null : dt;
        };
        const inRange = (value) => {
          const dt = toDate(value);
          if (!dt) return false;
          return dt >= startDate && dt <= endDate;
        };
        for (const childId of selectedChildIds) {
          const gradesPayload = [];
          for (const subject of filteredSubjects) {
            let detail = subjectDetailCache?.[subject?.id] || null;
            if (!detail && subject?.id && familyId) {
              try {
                detail = await getSubjectDetail(subject.id, familyId, childId);
              } catch (_) {
                detail = null;
              }
            }

            const gradeRows = Array.isArray(detail?.grades) ? detail.grades : [];
            const eventRows = Array.isArray(detail?.events) ? detail.events : [];
            const eventOutcomes = Array.isArray(detail?.eventOutcomes) ? detail.eventOutcomes : [];
            const eventMap = eventRows.reduce((acc, ev) => {
              acc[String(ev?.id)] = ev;
              return acc;
            }, {});

            const normalizedChildId = String(childId);
            const childGrades = gradeRows.filter((g) => {
              if (String(g?.child_id) !== normalizedChildId) return false;
              if (!g?.created_at) return true;
              return inRange(g.created_at);
            });
            const childEventOutcomes = eventOutcomes.filter((eo) => {
              if (String(eo?.child_id) !== normalizedChildId) return false;
              const linkedEvent = eventMap[String(eo?.event_id)];
              const eventStart = linkedEvent?.start_ts || linkedEvent?.start || linkedEvent?.start_local || eo?.created_at;
              return inRange(eventStart);
            });

            const scorePercents = [];
            childGrades.forEach((g) => {
              const possible = Number(g?.possible);
              const score = Number(g?.score);
              if (Number.isFinite(score) && Number.isFinite(possible) && possible > 0) {
                scorePercents.push((score / possible) * 100);
              }
            });

            const explicitGrades = [
              ...childGrades.map((g) => (g?.grade != null ? String(g.grade).trim() : '')).filter(Boolean),
              ...childEventOutcomes.map((eo) => (eo?.grade != null ? String(eo.grade).trim() : '')).filter(Boolean),
            ];

            let overallGrade = 'Ungraded';
            if (scorePercents.length > 0) {
              const avgPct = Math.round(scorePercents.reduce((sum, val) => sum + val, 0) / scorePercents.length);
              overallGrade = `${avgPct}%`;
            } else if (explicitGrades.length > 0) {
              overallGrade = explicitGrades[0];
            }

            const byEvent = childEventOutcomes.map((eo) => {
              const linkedEvent = eventMap[String(eo?.event_id)];
              return {
                eventTitle: linkedEvent?.title || linkedEvent?.lesson_name || 'Event',
                eventDate: linkedEvent?.start_ts || linkedEvent?.start || linkedEvent?.start_local || null,
                grade: eo?.grade != null && String(eo.grade).trim() ? String(eo.grade).trim() : 'Ungraded',
              };
            });
            if (byEvent.length === 0) {
              eventRows
                .filter((ev) => {
                  const evChildId = ev?.child_id != null ? String(ev.child_id) : null;
                  const includeForChild = !evChildId || evChildId === normalizedChildId;
                  const evStart = ev?.start_ts || ev?.start || ev?.start_local;
                  return includeForChild && inRange(evStart);
                })
                .forEach((ev) => {
                  byEvent.push({
                    eventTitle: ev?.title || ev?.lesson_name || 'Event',
                    eventDate: ev?.start_ts || ev?.start || ev?.start_local || null,
                    grade: 'Ungraded',
                  });
                });
            }

            gradesPayload.push({
              subjectName: subject?.name || 'Subject',
              grade: overallGrade,
              eventBreakdown: byEvent,
            });
          }

          const result = await exportReportCard(childId, termLabel, gradesPayload, '', format);
          if (!result?.success) {
            throw new Error(result?.error || 'Report card export failed.');
          }
        }
      } else if (subjectsExportType === 'units_lessons') {
        for (const childId of selectedChildIds) {
          const result = await exportCurriculumPlan(
            childId,
            null,
            start,
            end
          );
          if (!result?.success) {
            throw new Error(result?.error || 'Units/Lessons export failed.');
          }
        }
      }
      setShowSubjectsExportModal(false);
      setSubjectsExportHideTypePicker(false);
    } catch (err) {
      Alert.alert('Export failed', err?.message || 'Unable to export right now.');
    } finally {
      setSubjectsExportBusy(false);
    }
  }, [
    subjectsExportStartDate,
    subjectsExportEndDate,
    subjectsExportChildIds,
    subjectsExportType,
    subjectsExportFormat,
    filteredSubjects,
    safeChildren,
    selectedCoursesYear,
    selectedTermFilter,
    subjectDetailCache,
    familyId,
  ]);
  const renderCoursesHeaderFilters = useCallback((options = {}) => {
    const { showTermRow = true, showChildrenRow = true, showSubjectRow = true } = options;
    const canEditChildFromFilters = canShowEditChildButton && typeof onEditChild === 'function';
    const canEditSubjectFromFilters = canShowEditSubjectButton && canManageSubjectsActions && typeof onEditSubject === 'function';
    const canCreateChildFromHeader = !isChildView && canShowEditChildButton;
    const canCreateSubjectFromHeader = !isChildView && canManageSubjectsActions;
    const renderFilterLabelIcons = ({
      showAdd,
      showEdit,
      onAdd,
      onEdit,
      addLabel,
      editLabel,
    }) => {
      if (!showAdd && !showEdit) return null;
      return (
        <View style={styles.filterLabelActions}>
          {showAdd ? (
            <TouchableOpacity
              style={styles.filterLabelIconBtn}
              onPress={onAdd}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={addLabel}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Plus size={14} color="#64748B" />
            </TouchableOpacity>
          ) : null}
          {showEdit ? (
            <TouchableOpacity
              style={styles.filterLabelIconBtn}
              onPress={onEdit}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={editLabel}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Pencil size={14} color="#64748B" />
            </TouchableOpacity>
          ) : null}
        </View>
      );
    };
    const openAddChildFromFilter = () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('openAddChildModal'));
      }
    };
    const openChildEditFromFilter = () => {
      if (!canEditChildFromFilters) return;
      if (safeChildren.length === 0 && !canCreateChildFromHeader) {
        toast.push('No children to edit', 'error');
        return;
      }
      setLearningHeaderPickerKind('child');
    };
    const openSubjectEditFromFilter = () => {
      if (!canEditSubjectFromFilters) return;
      if ((filteredSubjects || []).length === 0 && !canCreateSubjectFromHeader) {
        toast.push('No subjects to edit', 'error');
        return;
      }
      setLearningHeaderPickerKind('subject');
    };
    return (
    <>
      {showChildrenRow && showInlineChildrenFilters ? (
        <View style={[styles.filterRow, styles.coursesFilterRowTop]}>
          <View style={styles.filterRowMain}>
            <View style={styles.filterLabelGroup}>
              <Text style={styles.filterLabel}>Children</Text>
              {renderFilterLabelIcons({
                showAdd: canCreateChildFromHeader,
                showEdit: canEditChildFromFilters,
                onAdd: openAddChildFromFilter,
                onEdit: openChildEditFromFilter,
                addLabel: 'Add child',
                editLabel: 'Edit children',
              })}
            </View>
            <View style={styles.filterChipsWrap}>
              <View style={styles.filterChecklist}>
              {safeChildren.map((child) => {
                const childIdString = String(child.id);
                const isActive = selectedModeFilter === 'view'
                  ? effectiveCoursesChildIds.includes(childIdString)
                  : String(selectedChildFilter) === childIdString;
                return (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.filterOptionChip,
                      isActive && styles.filterOptionChipActive,
                    ]}
                    onPress={() => {
                      if (selectedModeFilter === 'view') {
                        toggleCourseChildFilter(child.id);
                        return;
                      }
                      setSelectedChildFilter(child.id);
                    }}
                  >
                    <View style={styles.filterOptionChipAvatarWrap}>
                      <Image
                        source={sourceForChild(child)}
                        style={styles.filterOptionChipAvatar}
                        resizeMode="cover"
                      />
                    </View>
                    <Text
                      style={[
                        styles.filterOptionChipText,
                        isActive && styles.filterOptionChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {child.name || child.first_name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {showTermRow && registeredTerms.length > 0 ? (
        <View
          style={[
            styles.filterRow,
            !showInlineChildrenFilters && styles.coursesFilterRowTop,
            styles.filterRowBelowChildren,
            isChildView && styles.childTermFilterRowSpacing,
          ]}
        >
          <View style={styles.filterRowMain}>
            <Text style={styles.filterLabel}>Term</Text>
            <View style={styles.filterChipsWrap}>
              <View style={styles.filterChecklist}>
              <TouchableOpacity
                style={[
                  styles.filterOptionChip,
                  selectedTermFilter === ALL_TERMS_FILTER && styles.filterOptionChipActive,
                ]}
                onPress={() => setSelectedTermFilter(ALL_TERMS_FILTER)}
              >
                <Text
                  style={[
                    styles.filterOptionChipText,
                    selectedTermFilter === ALL_TERMS_FILTER && styles.filterOptionChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  All terms
                </Text>
              </TouchableOpacity>
              {registeredTerms.map((term) => {
                const isActive = selectedTermFilter === term;
                return (
                  <TouchableOpacity
                    key={term}
                    style={[
                      styles.filterOptionChip,
                      isActive && styles.filterOptionChipActive,
                    ]}
                    onPress={() => setSelectedTermFilter(term)}
                  >
                    <Text
                      style={[
                        styles.filterOptionChipText,
                        isActive && styles.filterOptionChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {getSubjectTermLabel(term)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              </View>
            </View>
          </View>
        </View>
      ) : null}

      {showSubjectRow && (isCatalogScreen || allCourseSubjectIds.length > 0) ? (
        <View style={[styles.filterRow, styles.filterRowBelowTerm]}>
          <View style={styles.filterRowMain}>
            <View style={styles.filterLabelGroup}>
              <Text style={styles.filterLabel}>Subjects</Text>
              {renderFilterLabelIcons({
                showAdd: canCreateSubjectFromHeader,
                showEdit: canEditSubjectFromFilters,
                onAdd: openAddSubjectWithCurrentHeaders,
                onEdit: openSubjectEditFromFilter,
                addLabel: 'Add subject',
                editLabel: 'Edit subjects',
              })}
            </View>
            <View style={styles.filterChipsWrap}>
            <View style={styles.filterChecklist}>
              <TouchableOpacity
                style={[
                  styles.filterOptionChip,
                  allSubjectsFilterActive && styles.filterOptionChipActive,
                ]}
                onPress={selectAllSubjectsFilter}
              >
                <Text
                  style={[
                    styles.filterOptionChipText,
                    allSubjectsFilterActive && styles.filterOptionChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  All subjects
                </Text>
              </TouchableOpacity>
              {subjectsForSubjectFilterChips.map((subject) => {
                const subjectIdString = String(subject?.id || '').trim();
                if (!subjectIdString) return null;
                const isActive = !allSubjectsFilterActive
                  && effectiveCoursesSubjectIds.includes(subjectIdString);
                return (
                  <TouchableOpacity
                    key={subject.id}
                    style={[
                      styles.filterOptionChip,
                      isActive && styles.filterOptionChipActive,
                    ]}
                    onPress={() => toggleCourseSubjectFilter(subject.id)}
                  >
                    <Text
                      style={[
                        styles.filterOptionChipText,
                        isActive && styles.filterOptionChipTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {subject.name || 'Subject'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            </View>
          </View>
        </View>
      ) : null}
    </>
  );
  }, [
    isCatalogScreen,
    canShowEditChildButton,
    canShowEditSubjectButton,
    canManageSubjectsActions,
    onEditChild,
    onEditSubject,
    showInlineChildrenFilters,
    isChildView,
    selectedModeFilter,
    effectiveCoursesChildIds,
    toggleCourseChildFilter,
    selectedChildFilter,
    safeChildren,
    registeredTerms,
    selectedTermFilter,
    subjectsForSubjectFilterChips,
    allCourseSubjectIds,
    allSubjectsFilterActive,
    effectiveCoursesSubjectIds,
    selectAllSubjectsFilter,
    toggleCourseSubjectFilter,
    filteredSubjects,
    openAddSubjectWithCurrentHeaders,
    toast,
  ]);

  const selectedChildFilterForCards = useMemo(() => {
    if (!isCatalogScreen && selectedModeFilter !== 'view') return selectedChildFilter;
    if (effectiveCoursesChildIds.length === 1) return effectiveCoursesChildIds[0];
    return 'all';
  }, [isCatalogScreen, selectedModeFilter, selectedChildFilter, effectiveCoursesChildIds]);

  // Overall averages across filtered subjects (for compact summary card)
  const overallSummary = useMemo(() => {
    const list = filteredSubjects || [];
    if (list.length === 0) return null;

    const progressValues = list.map(s => s.progressPercent).filter(v => v != null && !Number.isNaN(v));
    const progress = progressValues.length > 0
      ? Math.round(progressValues.reduce((a, b) => a + b, 0) / progressValues.length)
      : null;

    let attendance = null;
    let grades = null;
    let complianceMet = 0;
    let complianceTotal = 0;
    list.forEach(subject => {
      const detail = subjectDetailCache[subject.id];
      if (detail) {
        if (detail.attendanceRate30 != null && !Number.isNaN(detail.attendanceRate30)) {
          attendance = (attendance ?? 0) + detail.attendanceRate30;
        }
        if (detail.avgGradePercent != null && !Number.isNaN(detail.avgGradePercent)) {
          grades = (grades ?? 0) + detail.avgGradePercent;
        }
        if (detail.complianceReady && typeof detail.complianceReady.met === 'number' && typeof detail.complianceReady.total === 'number') {
          complianceMet += detail.complianceReady.met;
          complianceTotal += detail.complianceReady.total;
        }
      }
    });
    const attendanceCount = list.filter(s => {
      const d = subjectDetailCache[s.id];
      return d && d.attendanceRate30 != null && !Number.isNaN(d.attendanceRate30);
    }).length;
    const gradesCount = list.filter(s => {
      const d = subjectDetailCache[s.id];
      return d && d.avgGradePercent != null && !Number.isNaN(d.avgGradePercent);
    }).length;
    attendance = attendanceCount > 0 ? Math.round(attendance / attendanceCount) : null;
    grades = gradesCount > 0 ? Math.round(grades / gradesCount) : null;

    const contextLabel = selectedChildFilter === 'all'
      ? 'All children'
      : (safeChildren.find(c => c.id === selectedChildFilter)?.first_name || safeChildren.find(c => c.id === selectedChildFilter)?.name || 'Child');

    return {
      progress,
      attendance,
      grades,
      compliance: complianceTotal > 0 ? { met: complianceMet, total: complianceTotal } : null,
      contextLabel,
    };
  }, [filteredSubjects, subjectDetailCache, selectedChildFilter, safeChildren]);

  const getChildName = useCallback((childId) => {
    const c = safeChildren.find(x => x.id === childId);
    return c?.first_name || c?.name || 'Unknown';
  }, [safeChildren]);

  // Saved state(s) for selected child/children (from child settings) — only show compliance for these
  const effectiveComplianceStateCodes = useMemo(() => {
    const list = selectedChildFilter === 'all'
      ? safeChildren
      : safeChildren.filter(c => c.id === selectedChildFilter);
    const codes = new Set();
    list.forEach(c => {
      const state = c.standards_state || c.standards || c.state_code || c.state;
      if (state && String(state).trim()) codes.add(String(state).trim().toUpperCase());
    });
    return [...codes];
  }, [safeChildren, selectedChildFilter]);

  // Child IDs we show compliance for (used for loading attendance to derive "met" for attendance requirement)
  const complianceChildIds = useMemo(() => {
    const list = selectedChildFilter === 'all' ? safeChildren : safeChildren.filter(c => c.id === selectedChildFilter);
    return list.map(c => c.id).filter(Boolean);
  }, [safeChildren, selectedChildFilter]);

  const complianceChildIdsKey = useMemo(() => complianceChildIds.slice().sort().join(','), [complianceChildIds]);

  // Load attendance summary so we can show checkmarks for "Attendance tracking" when a child has any attendance
  useEffect(() => {
    if (!familyId || !complianceChildIdsKey) {
      setAttendanceByChildForCompliance(null);
      return;
    }
    const childIdsToFetch = complianceChildIdsKey.split(',').filter(Boolean);
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 1);
    start.setDate(start.getDate() + 1);
    getAttendanceLogs(familyId, childIdsToFetch, {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    })
      .then((logs) => {
        const byChild = {};
        (logs || []).forEach((log) => {
          const cid = log.child_id;
          if (!cid) return;
          if (!byChild[cid]) byChild[cid] = { present: new Set(), absent: new Set() };
          const day = (log.day_date || '').slice(0, 10);
          if (!day) return;
          const status = (log.status || '').toLowerCase();
          if (status === 'present' || status === 'partial') byChild[cid].present.add(day);
          else if (status === 'absent') byChild[cid].absent.add(day);
        });
        const summary = {};
        Object.keys(byChild).forEach((cid) => {
          summary[cid] = { daysPresent: byChild[cid].present.size };
        });
        setAttendanceByChildForCompliance(summary);
      })
      .catch(() => setAttendanceByChildForCompliance(null));
  }, [familyId, complianceChildIdsKey]);

  // Preview data for expanded summary sections
  const summaryProgressDetail = useMemo(() => {
    const list = filteredSubjects || [];
    let earliestNext = null;
    let currentFocus = null;
    let coreGoal = null;
    list.forEach(s => {
      if (s.nextItem && s.nextItem.dueDate) {
        const d = new Date(s.nextItem.dueDate);
        if (!earliestNext || d < new Date(earliestNext.dueDate)) {
          earliestNext = { ...s.nextItem, subjectName: s.name, subjectId: s.id };
        }
      }
      if (s.currentFocus && !currentFocus) currentFocus = s.currentFocus;
      if (s.coreGoal && !coreGoal) coreGoal = s.coreGoal;
    });
    return {
      progress: overallSummary?.progress ?? null,
      nextItem: earliestNext,
      currentFocus,
      coreGoal,
    };
  }, [filteredSubjects, overallSummary]);

  const summaryAttendanceDetail = useMemo(() => {
    const merged = [];
    (filteredSubjects || []).forEach(subject => {
      const detail = subjectDetailCache[subject.id];
      if (!detail?.attendanceRecords?.length || !detail?.events?.length) return;
      const eventMap = (detail.events || []).reduce((acc, e) => { acc[e.id] = e; return acc; }, {});
      detail.attendanceRecords.forEach(ar => {
        const event = eventMap[ar.event_id];
        merged.push({
          day_date: ar.day_date,
          minutes: ar.minutes || 0,
          status: ar.status,
          eventTitle: event?.title || 'Lesson',
          subjectName: subject.name,
          subjectId: subject.id,
        });
      });
    });
    merged.sort((a, b) => (b.day_date || '').localeCompare(a.day_date || ''));
    return merged.slice(0, 5);
  }, [filteredSubjects, subjectDetailCache]);

  const summaryGradesDetail = useMemo(() => {
    const merged = [];
    const subjectMap = (filteredSubjects || []).reduce((acc, s) => { acc[s.id] = s.name; return acc; }, {});
    (filteredSubjects || []).forEach(subject => {
      const detail = subjectDetailCache[subject.id];
      if (!detail) return;
      (detail.grades || []).forEach(g => {
        const date = g.created_at || g.day_date;
        const possible = g.possible != null && g.possible > 0 ? g.possible : null;
        const score = g.score != null ? g.score : null;
        const percent = possible && score != null ? Math.round((score / possible) * 100) : null;
        merged.push({
          date,
          score,
          possible,
          grade: g.grade,
          percent,
          subjectName: subject.name,
          subjectId: subject.id,
        });
      });
      (detail.eventOutcomes || []).filter(eo => eo.grade != null).forEach(eo => {
        merged.push({
          date: eo.created_at,
          score: null,
          possible: null,
          grade: eo.grade,
          percent: null,
          subjectName: subject.name,
          subjectId: subject.id,
        });
      });
    });
    merged.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return merged.slice(0, 5);
  }, [filteredSubjects, subjectDetailCache]);

  // One row per requirement type per state; dedupe by (state, type, child) so total = requirement types × children (e.g. 4 × 3 = 12).
  // Only include states that are saved for the selected child/children (effectiveComplianceStateCodes).
  const summaryComplianceDetail = useMemo(() => {
    const savedStateSet = new Set((effectiveComplianceStateCodes || []).map(s => s.toUpperCase()));
    const filterByChildId = selectedChildFilter !== 'all' ? selectedChildFilter : null;
    const byState = {};
    const seen = new Set(); // key: stateCode|type|child_id — so we count each (state, type, child) once
    let totalMet = 0;
    let totalTotal = 0;
    const stateCodes = new Set();
    const childIds = new Set();
    (filteredSubjects || []).forEach(subject => {
      const detail = subjectDetailCache[subject.id];
      if (!detail?.complianceItems?.length) return;
      detail.complianceItems.forEach(item => {
        if (filterByChildId && item.child_id !== filterByChildId) return;
        const req = item.state_requirements;
        if (!req) return;
        const stateCode = (item.state_code || '').toUpperCase() || 'Other';
        if (savedStateSet.size > 0 && !savedStateSet.has(stateCode)) return;
        const type = (req.requirement_type || 'Other').toLowerCase();
        const key = `${stateCode}|${type}|${item.child_id || ''}`;
        if (seen.has(key)) return;
        seen.add(key);
        stateCodes.add(stateCode);
        if (item.child_id) childIds.add(item.child_id);
        if (!byState[stateCode]) byState[stateCode] = {};
        if (!byState[stateCode][type]) {
          byState[stateCode][type] = {
            title: req.requirement_title,
            description: req.requirement_description,
            byChild: {}, // { [childId]: isMet }
          };
        }
        const row = byState[stateCode][type];
        const cid = item.child_id || '';
        const checklistMet = item.status === 'met' || item.status === 'on_track' || item.status === 'completed';
        const hasAttendanceData = type === 'attendance' && (attendanceByChildForCompliance?.[cid]?.daysPresent ?? 0) > 0;
        const isMet = checklistMet || hasAttendanceData;
        if (!Object.prototype.hasOwnProperty.call(row.byChild, cid)) {
          row.byChild[cid] = isMet;
        }
        totalTotal += 1;
        if (isMet) totalMet += 1;
      });
    });
    // Derive metCount/totalCount per row from byChild for backward compatibility with progress dots
    Object.values(byState).forEach(byType => {
      Object.values(byType).forEach(row => {
        const ids = Object.keys(row.byChild).filter(Boolean);
        row.totalCount = ids.length;
        row.metCount = ids.filter(id => row.byChild[id]).length;
      });
    });
    const stateLabel = [...stateCodes].sort().join(', ') || '';
    const sortedChildIds = [...childIds].sort((a, b) => getChildName(a).localeCompare(getChildName(b)));
    const studentLabel = sortedChildIds.map(id => getChildName(id)).filter(Boolean).join(', ') || '';

    const statesTotal = Object.keys(byState).length;
    let statesComplete = 0;
    let typesComplete = 0;
    let typesTotal = 0;
    Object.values(byState).forEach(byType => {
      let stateComplete = true;
      Object.values(byType).forEach(row => {
        typesTotal += 1;
        if (row.totalCount > 0 && row.metCount >= row.totalCount) typesComplete += 1;
        else stateComplete = false;
      });
      if (stateComplete && Object.keys(byType).length > 0) statesComplete += 1;
    });

    return {
      byState,
      sortedChildIds,
      summary: { met: totalMet, total: totalTotal, stateLabel, studentLabel },
      summaryTop: { statesComplete, statesTotal, typesComplete, typesTotal },
      hasData: totalTotal > 0,
    };
  }, [filteredSubjects, subjectDetailCache, getChildName, effectiveComplianceStateCodes, selectedChildFilter, attendanceByChildForCompliance]);

  const handleBack = () => {
    setSelectedSubjectId(null);
    setPendingScrollToSectionId(null);
    setPendingOpenMaterialId(null);
    setPendingProgressAction(null);
  };

  const openSubjectToSection = (subjectId, sectionId) => {
    setPendingScrollToSectionId(sectionId);
    setPendingProgressAction(null);
    setSelectedSubjectId(subjectId);
    setExpandedSummaryMetric(null);
  };

  // Map API requirement_type + title to modal config key (seed id)
  const getRequirementKey = (type, title) => {
    const t = (type || '').toLowerCase();
    const titleLower = (title || '').toLowerCase();
    if (t === 'attendance') return 'attendance';
    if (t === 'notification') return 'notice';
    if (t === 'portfolio') return 'portfolio';
    if (t === 'testing') return 'testing';
    if (t === 'record_keeping') {
      if (titleLower.includes('curriculum')) return 'curriculum';
      return 'hours';
    }
    if (t === 'other') {
      if (titleLower.includes('quarterly')) return 'quarterly_reports';
      if (titleLower.includes('annual assessment')) return 'annual_assessment';
      return 'annual_assessment';
    }
    return t || 'other';
  };

  const handleAddSyllabus = (subject) => {
    if (onAddSyllabus) {
      onAddSyllabus(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openSyllabusUpload', {
        detail: { subjectId: subject.id }
      }));
    }
  };

  const handleAddEvent = (subject) => {
    // Get first assigned child ID for defaulting in modals
    const assignedChildren = subject.assignedChildren || [];
    const firstAssignedChildId = assignedChildren.length > 0 ? assignedChildren[0] : null;
    
    if (onAddEvent) {
      onAddEvent(subject);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Dispatch openTaskModal event (handled by both WebContent and WebLayout)
      window.dispatchEvent(new CustomEvent('openTaskModal', {
        detail: { 
          subjectId: subject.id, 
          eventType: 'Lesson', 
          date: new Date(),
          childId: firstAssignedChildId
        }
      }));
    }
  };

  const handleSendMessageForSubject = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openMessagesPane'));
    }
  }, []);

  const handleEditSubjectForSubject = useCallback((subject) => {
    if (!subject) return;
    if (typeof onEditSubject === 'function') {
      onEditSubject(subject);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openAddSubjectModal', {
        detail: { subject },
      }));
    }
  }, [onEditSubject]);

  const handleArchiveSubjectRequest = useCallback((subject) => {
    if (!subject?.id || !canManageSubjectsActions) return;
    setArchiveSubjectTarget(subject);
  }, [canManageSubjectsActions]);

  const handleConfirmArchiveSubject = useCallback(async () => {
    const subject = archiveSubjectTarget;
    if (!subject?.id || !familyId || archivingSubject) return;
    setArchivingSubject(true);
    try {
      const deletedName = subject.name || 'Subject';
      const result = await deleteSubjectCascadeForFamily(familyId, subject.id, deletedName);
      if (!result.ok) throw new Error(result.error || 'Archive failed');
      dispatchSubjectDeletedSideEffects(familyId);
      setSubjects((prev) => {
        const next = (prev || []).filter((row) => String(row?.id) !== String(subject.id));
        if (onSubjectsUpdate) onSubjectsUpdate(next);
        return next;
      });
      if (String(selectedSubjectId) === String(subject.id)) {
        setSelectedSubjectId(null);
      }
      toast.push(`"${deletedName}" has been archived.`, 'success');
      setArchiveSubjectTarget(null);
    } catch (err) {
      toast.push(`Failed to archive subject: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setArchivingSubject(false);
    }
  }, [
    archiveSubjectTarget,
    familyId,
    archivingSubject,
    selectedSubjectId,
    onSubjectsUpdate,
    toast,
  ]);

  const handleNavigateToPlanner = (params) => {
    if (onNavigateToPlanner) {
      onNavigateToPlanner(params);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const view = params.view || 'month';
      const queryParams = new URLSearchParams();
      if (params.subjectId) queryParams.set('subjectId', params.subjectId);
      if (params.childId) queryParams.set('childId', params.childId);
      if (params.date) queryParams.set('date', params.date);
      queryParams.set('view', view);
      window.location.href = `/planner?${queryParams.toString()}`;
    }
  };

  const handleModeFilterChange = useCallback((nextMode) => {
    let safeMode = nextMode === 'plan' || nextMode === 'progress' ? nextMode : 'view';
    if (safeMode === 'plan' && !canShowChildScheduleTab) safeMode = 'view';
    if (safeMode === 'progress' && !canShowChildProgressTab) safeMode = 'view';
    setSelectedModeFilter(safeMode);
  }, [canShowChildScheduleTab, canShowChildProgressTab]);

  useEffect(() => {
    if (forcedModeFilter) {
      setSelectedModeFilter(forcedModeFilter);
    }
  }, [forcedModeFilter]);

  useEffect(() => {
    if (forcedModeFilter) return;
    if (!isChildView && selectedModeFilter !== 'view') {
      setSelectedModeFilter('view');
    }
  }, [isChildView, selectedModeFilter, forcedModeFilter]);

  useEffect(() => {
    if (selectedModeFilter === 'plan' && !canShowChildScheduleTab) {
      setSelectedModeFilter(canShowChildProgressTab ? 'progress' : 'view');
      return;
    }
    if (selectedModeFilter === 'progress' && !canShowChildProgressTab) {
      setSelectedModeFilter(canShowChildScheduleTab ? 'plan' : 'view');
    }
  }, [selectedModeFilter, canShowChildScheduleTab, canShowChildProgressTab]);

  const canEditChildFromHeader = canShowEditChildButton && typeof onEditChild === 'function';
  const canEditSubjectFromHeader = canShowEditSubjectButton && canManageSubjectsActions && typeof onEditSubject === 'function';
  const canCreateChildFromHeader = !isChildView && canShowEditChildButton;
  const canCreateSubjectFromHeader = !isChildView && canManageSubjectsActions;
  const openAddChildModal = useCallback(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openAddChildModal'));
    }
  }, []);

  const childNameById = useMemo(() => {
    const map = {};
    safeChildren.forEach((child) => {
      const id = String(child?.id || '').trim();
      if (!id) return;
      map[id] = child?.first_name || child?.name || child?.full_name || child?.display_name || 'Student';
    });
    return map;
  }, [safeChildren]);

  const headerSubjectPickerOptions = useMemo(
    () => (filteredSubjects || []).map((subject) => {
      const candidateChildIds = []
        .concat(
          Array.isArray(subject?.assignedChildren) ? subject.assignedChildren : [],
          Array.isArray(subject?.assigned_children) ? subject.assigned_children : [],
          Array.isArray(subject?.child_ids) ? subject.child_ids : [],
          Array.isArray(subject?.childIds) ? subject.childIds : []
        )
        .map((id) => String(id || '').trim())
        .filter(Boolean);
      const childIds = Array.from(new Set(candidateChildIds));
      const studentLabel = childIds
        .map((childId) => childNameById[childId] || null)
        .filter(Boolean)
        .join(', ');
      return {
        id: subject.id,
        name: subject?.name || 'Subject',
        childIds,
        studentLabel,
      };
    }),
    [filteredSubjects, childNameById]
  );

  const closeLearningHeaderPicker = useCallback(() => {
    setLearningHeaderPickerKind(null);
  }, []);

  const transitionFromLearningHeaderPicker = useCallback((openTarget) => {
    openTarget?.();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          setTimeout(() => setLearningHeaderPickerKind(null), 80);
        });
      });
      return;
    }
    setLearningHeaderPickerKind(null);
  }, []);

  const openChildEditPicker = useCallback(() => {
    if (!canEditChildFromHeader) return;
    if (safeChildren.length === 0 && !canCreateChildFromHeader) {
      toast.push('No children to edit', 'error');
      return;
    }
    setLearningHeaderPickerKind('child');
  }, [canCreateChildFromHeader, canEditChildFromHeader, safeChildren.length, toast]);

  const openSubjectEditPicker = useCallback(() => {
    if (!canEditSubjectFromHeader) return;
    if (headerSubjectPickerOptions.length === 0 && !canCreateSubjectFromHeader) {
      toast.push('No subjects to edit', 'error');
      return;
    }
    setLearningHeaderPickerKind('subject');
  }, [canCreateSubjectFromHeader, canEditSubjectFromHeader, headerSubjectPickerOptions.length, toast]);

  const handleCreateNewFromPicker = useCallback((type) => {
    transitionFromLearningHeaderPicker(() => {
      if (type === 'child') {
        openAddChildModal();
        return;
      }
      if (type === 'subject') {
        openAddSubjectWithCurrentHeaders();
      }
    });
  }, [openAddChildModal, openAddSubjectWithCurrentHeaders, transitionFromLearningHeaderPicker]);

  const handleLearningHeaderPickerSelect = useCallback((id) => {
    const kind = learningHeaderPickerKind;
    if (!id || !kind) return;
    transitionFromLearningHeaderPicker(() => {
      if (kind === 'child') {
        const child = safeChildren.find((row) => String(row?.id) === String(id));
        if (child) onEditChild(child);
        return;
      }
      if (kind === 'subject') {
        const subject = (filteredSubjects || []).find((row) => String(row?.id) === String(id));
        if (subject) onEditSubject(subject);
      }
    });
  }, [filteredSubjects, learningHeaderPickerKind, onEditChild, onEditSubject, safeChildren, transitionFromLearningHeaderPicker]);

  const learningHeaderPickerCopy = learningHeaderPickerKind === 'child'
    ? {
      title: 'Choose a child to edit',
      subtitle: 'Pick the student whose profile you want to update.',
    }
    : {
      title: 'Choose a subject to edit',
      subtitle: 'Pick the subject you want to update.',
    };

  const renderLearningHeaderPickerModal = () => (
    <Modal
      visible={!!learningHeaderPickerKind}
      transparent
      animationType="fade"
      onRequestClose={closeLearningHeaderPicker}
    >
      <TouchableOpacity
        style={styles.learningPickerBackdrop}
        activeOpacity={1}
        onPress={closeLearningHeaderPicker}
      >
        <TouchableOpacity style={styles.learningPickerCard} activeOpacity={1} onPress={() => {}}>
          <View style={styles.learningPickerHeader}>
            <View style={styles.learningPickerHeaderTextWrap}>
              <Text style={styles.learningPickerTitle}>{learningHeaderPickerCopy.title}</Text>
              <Text style={styles.learningPickerSubtitle}>{learningHeaderPickerCopy.subtitle}</Text>
            </View>
            <TouchableOpacity
              style={styles.learningPickerClose}
              onPress={closeLearningHeaderPicker}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <X size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>
          {learningHeaderPickerKind === 'child' ? (
            safeChildren.length > 0 ? (
              <View style={styles.learningPickerList}>
                {safeChildren.map((child, index) => (
                  <TouchableOpacity
                    key={`learning-child-picker-${child.id}`}
                    style={[
                      styles.learningPickerItem,
                      index === safeChildren.length - 1 && styles.learningPickerItemLast,
                    ]}
                    onPress={() => handleLearningHeaderPickerSelect(child.id)}
                    activeOpacity={0.75}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <View style={styles.learningPickerItemLeading}>
                      <Image
                        source={sourceForChild(child)}
                        style={styles.learningPickerChildAvatar}
                        resizeMode="cover"
                      />
                      <Text style={styles.learningPickerItemText}>
                        {child?.first_name || child?.name || 'Student'}
                      </Text>
                    </View>
                    <ChevronRight size={16} color="#6b7280" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.learningPickerEmptyWrap}>
                <Text style={styles.learningPickerEmptyText}>
                  {canCreateChildFromHeader ? 'No children yet.' : 'No children available.'}
                </Text>
              </View>
            )
          ) : headerSubjectPickerOptions.length > 0 ? (
            <View style={styles.learningPickerList}>
              {headerSubjectPickerOptions.map((option, index) => (
                <TouchableOpacity
                  key={`learning-subject-picker-${option.id}`}
                  style={[
                    styles.learningPickerItem,
                    index === headerSubjectPickerOptions.length - 1 && styles.learningPickerItemLast,
                  ]}
                  onPress={() => handleLearningHeaderPickerSelect(option.id)}
                  activeOpacity={0.75}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <View style={styles.learningPickerItemTextWrap}>
                    <Text style={styles.learningPickerItemText}>{option.name}</Text>
                    {option.studentLabel ? (
                      <View style={styles.learningPickerStudentsRow}>
                        <ChildAvatarCluster
                          childIds={option.childIds || []}
                          familyChildren={safeChildren}
                          size={28}
                          overlap={-8}
                        />
                        <Text style={styles.learningPickerStudentsText}>{option.studentLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <ChevronRight size={16} color="#6b7280" />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <View style={styles.learningPickerEmptyWrap}>
              <Text style={styles.learningPickerEmptyText}>
                {canCreateSubjectFromHeader ? 'No subjects yet.' : 'No subjects available.'}
              </Text>
            </View>
          )}
          <View style={styles.learningPickerActions}>
            <TouchableOpacity
              style={styles.learningPickerCancelBtn}
              onPress={closeLearningHeaderPicker}
              activeOpacity={0.85}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Text style={styles.learningPickerCancelText}>Cancel</Text>
            </TouchableOpacity>
            {learningHeaderPickerKind === 'child' && canCreateChildFromHeader ? (
              <TouchableOpacity
                style={styles.learningPickerPrimaryBtn}
                onPress={() => handleCreateNewFromPicker('child')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Create new child"
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.learningPickerPrimaryText}>Create new child</Text>
              </TouchableOpacity>
            ) : null}
            {learningHeaderPickerKind === 'subject' && canCreateSubjectFromHeader ? (
              <TouchableOpacity
                style={styles.learningPickerPrimaryBtn}
                onPress={() => handleCreateNewFromPicker('subject')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Create new subject"
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Plus size={16} color="#FFFFFF" />
                <Text style={styles.learningPickerPrimaryText}>Create new subject</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  const renderSubjectsExportModal = () => (
    <Modal
      visible={showSubjectsExportModal}
      transparent
      animationType="fade"
      onRequestClose={closeSubjectsExportModal}
    >
      <TouchableOpacity
        style={styles.exportModalBackdrop}
        activeOpacity={1}
        onPress={closeSubjectsExportModal}
      >
        <TouchableOpacity style={styles.exportModalCard} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.exportModalHeaderRow}>
            <Text style={styles.exportModalTitle}>{subjectsExportModalTitle}</Text>
            <TouchableOpacity
              style={styles.exportModalCloseButton}
              onPress={closeSubjectsExportModal}
              disabled={subjectsExportBusy}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              {...(Platform.OS === 'web' && { cursor: subjectsExportBusy ? 'default' : 'pointer' })}
            >
              <X size={18} color="#64748B" />
            </TouchableOpacity>
          </View>

          {!subjectsExportHideTypePicker ? (
            <>
              <Text style={styles.exportModalLabel}>Data type</Text>
              <View style={styles.exportTypeRow}>
                {[
                  { id: 'schedule', label: 'Class Schedule' },
                  { id: 'schedule_tables', label: 'Schedule Tables' },
                  { id: 'attendance', label: 'Attendance' },
                  { id: 'report_card', label: 'Report card' },
                  { id: 'units_lessons', label: 'Units/Lessons' },
                ].map((option) => {
                  const active = subjectsExportType === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.exportTypeChip, active && styles.exportTypeChipActive]}
                      onPress={() => {
                        setSubjectsExportType(option.id);
                        if (option.id === 'schedule' || option.id === 'schedule_tables') setSubjectsExportFormat('excel');
                        if (option.id === 'attendance') setSubjectsExportFormat('pdf');
                        if (option.id === 'report_card') setSubjectsExportFormat('pdf');
                        if (option.id === 'units_lessons') setSubjectsExportFormat('pdf');
                      }}
                    >
                      <Text style={[styles.exportTypeChipText, active && styles.exportTypeChipTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={styles.exportModalLabel}>Format</Text>
          <View style={styles.exportTypeRow}>
            {((subjectsExportType === 'schedule' || subjectsExportType === 'schedule_tables')
              ? [{ id: 'excel', label: 'Excel (CSV)' }, { id: 'pdf', label: 'PDF' }]
              : subjectsExportType === 'attendance'
                ? [{ id: 'pdf', label: 'PDF' }, { id: 'csv', label: 'CSV' }]
                : subjectsExportType === 'report_card'
                  ? [{ id: 'pdf', label: 'PDF' }, { id: 'docx', label: 'Word' }]
                  : [{ id: 'pdf', label: 'PDF' }]
            ).map((option) => {
              const active = subjectsExportFormat === option.id;
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.exportTypeChip, active && styles.exportTypeChipActive]}
                  onPress={() => setSubjectsExportFormat(option.id)}
                >
                  <Text style={[styles.exportTypeChipText, active && styles.exportTypeChipTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.exportDateRow}>
            <View style={styles.exportDateCol}>
              <Text style={styles.exportModalLabel}>Start date</Text>
              <PlannerPreferenceDateField
                style={styles.exportDatePickerField}
                value={subjectsExportStartDate}
                onChange={setSubjectsExportStartDate}
                placeholder="Start date"
                borderColor="#E2E8F0"
                textColor="#1F2937"
                mutedColor="#94A3B8"
                maxDate={subjectsExportEndDate || null}
              />
            </View>
            <View style={styles.exportDateCol}>
              <Text style={styles.exportModalLabel}>End date</Text>
              <PlannerPreferenceDateField
                style={styles.exportDatePickerField}
                value={subjectsExportEndDate}
                onChange={setSubjectsExportEndDate}
                placeholder="End date"
                borderColor="#E2E8F0"
                textColor="#1F2937"
                mutedColor="#94A3B8"
                minDate={subjectsExportStartDate || null}
              />
            </View>
          </View>

          <Text style={styles.exportModalLabel}>Students</Text>
          <View style={styles.exportStudentsWrap}>
            {safeChildren.map((child) => {
              const childId = String(child?.id || '');
              const selected = subjectsExportChildIds.includes(childId);
              return (
                <TouchableOpacity
                  key={childId}
                  style={[styles.exportStudentChip, selected && styles.exportStudentChipActive]}
                  onPress={() => toggleSubjectsExportChild(childId)}
                >
                  <Text style={[styles.exportStudentChipText, selected && styles.exportStudentChipTextActive]}>
                    {child?.name || child?.first_name || 'Student'}
                  </Text>
                  {selected ? <Check size={14} color="#6BB3E8" /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.exportModalActions}>
            <TouchableOpacity
              style={styles.exportCancelButton}
              onPress={closeSubjectsExportModal}
              disabled={subjectsExportBusy}
            >
              <Text style={styles.exportCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.exportSubmitButton, subjectsExportBusy && styles.exportSubmitButtonDisabled]}
              onPress={runSubjectsExport}
              disabled={subjectsExportBusy}
            >
              <Download size={16} color="#FFFFFF" />
              <Text style={styles.exportSubmitText}>{subjectsExportBusy ? 'Exporting…' : 'Export'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  const renderPlanningPreferencesModal = () => (
    <Modal
      visible={showPlanningPreferencesModal}
      transparent
      animationType="fade"
      onRequestClose={requestPlanningPreferencesClose}
    >
      <TouchableOpacity
        style={styles.exportModalBackdrop}
        activeOpacity={1}
        onPress={requestPlanningPreferencesClose}
      >
        <TouchableOpacity style={styles.planningPreferencesModalCard} activeOpacity={1} onPress={(e) => e.stopPropagation()}>
          <View style={styles.planningPreferencesBody}>
            <PlannerSettingsContent
              familyId={familyId}
              initialData={planningPreferencesInitialDataByYear[String(planningPreferencesSchoolYearLabel || '').trim()] || null}
              embeddedInModal
              lockedSchoolYearLabel={planningPreferencesSchoolYearLabel || null}
              onRequestClose={closePlanningPreferencesModal}
              onSave={() => {
                const activeYearLabel = String(planningPreferencesSchoolYearLabelRef.current || planningPreferencesSchoolYearLabel || '').trim();
                setPlanningPreferencesSavedSinceOpen(true);
                planningPreferencesSavedSinceOpenRef.current = true;
                if (activeYearLabel) {
                  // Invalidate preloaded payload immediately so reopen refetches latest values.
                  setPlanningPreferencesInitialDataByYear((prev) => {
                    if (!prev || !prev[activeYearLabel]) return prev;
                    const next = { ...prev };
                    delete next[activeYearLabel];
                    return next;
                  });
                }
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
                  window.dispatchEvent(new CustomEvent('refreshSubjects'));
                }
                loadSubjects();
              }}
            />
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );

  // If a subject is selected, show detail view
  if (selectedSubjectId) {
    return (
      <>
        <SubjectDetailPage
          subjectId={selectedSubjectId}
          familyId={familyId}
          children={safeChildren}
          layoutVariant={isCatalogScreen ? 'learning' : 'default'}
          onOpenPlannerSettings={openPlanningPreferencesModal}
          preloadedSubjectData={subjectDetailCache[selectedSubjectId]}
          initialScrollToSectionId={pendingScrollToSectionId}
          initialOpenMaterialId={pendingOpenMaterialId}
          initialProgressAction={pendingProgressAction}
          onSubjectDataUpdate={(data) => {
            const updatedCache = {
              ...subjectDetailCache,
              [selectedSubjectId]: data,
            };
            setSubjectDetailCache(updatedCache);
            if (data && selectedSubjectId) {
              setSubjects((prev) => (prev || []).map((row) => (
                String(row?.id) === String(selectedSubjectId)
                  ? { ...row, progressPercent: data.progressPercent ?? row.progressPercent }
                  : row
              )));
            }
            
            // Update parent cache if callback provided
            if (onSubjectDetailUpdate) {
              onSubjectDetailUpdate(selectedSubjectId, data);
            }
          }}
          onBack={handleBack}
          onEditSubject={canShowEditSubjectButton && canManageSubjectsActions ? onEditSubject : null}
          canManageMaterials={canManageMaterialsActions}
          canManageAttendance={canManageAttendanceActions}
          onOpenExportModalForSection={(sectionType) => openSubjectsExportModal(sectionType)}
        />
        {renderPlanningPreferencesModal()}
        {renderSubjectsExportModal()}
        {renderLearningHeaderPickerModal()}
      </>
    );
  }

  const subjectsHeaderTitle = isChildView
    ? 'YOUR SUBJECTS'
    : "YOUR FAMILY'S COURSES";
  const showHeaderYearNavigator = !isChildView && !isCatalogScreen;
  return (
    <View style={styles.container}>
      {!isCatalogScreen ? (
        <>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          {showHeaderYearNavigator ? (
            <View style={styles.headerYearNavRow}>
              <TouchableOpacity
                style={[styles.headerYearNavBtn, !canNavigatePrevCoursesYear && styles.headerYearNavBtnDisabled]}
                onPress={() => shiftCoursesYear(-1)}
              >
                <ChevronLeft size={22} color="#A6AFBF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.headerYearNavTitleButton,
                  isAtCurrentCoursesYear && styles.headerYearNavTitleButtonDisabled,
                ]}
                onPress={jumpToCurrentCoursesYear}
                disabled={isAtCurrentCoursesYear}
                accessibilityRole="button"
                accessibilityLabel="Return to current school year"
              >
                <Text style={styles.headerYearNavTitle}>{selectedCoursesYear} School Year</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.headerYearNavBtn, !canNavigateNextCoursesYear && styles.headerYearNavBtnDisabled]}
                onPress={() => shiftCoursesYear(1)}
              >
                <ChevronRight size={22} color="#A6AFBF" />
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.headerTitle}>{subjectsHeaderTitle}</Text>
          )}
        </View>
        {isCatalogScreen ? (
          <View style={styles.headerActions}>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search subjects..."
                placeholderTextColor="#9ca3af"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearchSubmit}
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.clearButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={18} color={colors.muted} />
                </TouchableOpacity>
              ) : (
                <View style={styles.searchIconContainer}>
                  <Search size={18} color={colors.muted} />
                </View>
              )}
            </View>
            {canManageSubjectsActions ? (
              <TouchableOpacity
                style={styles.newButton}
                onPress={openAddSubjectWithCurrentHeaders}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.newButtonText}>+ NEW</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : !isChildView && (canManageSubjectsActions || typeof onAddEvent === 'function') ? (
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.newButton}
              onPress={openAddEventWithCurrentHeaders}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.newButtonText}>+ NEW</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {(!isChildView || isSelfManagedStudentViewer) && !isCatalogScreen && !hideModeSegments && (
          <View style={[styles.headerModeWrap, !isChildView && styles.headerModeWrapNoPicker]}>
            <View style={styles.headerModeControls}>
              {isChildView && isSelfManagedStudentViewer ? (
                <View style={styles.modeSegmentedControl}>
                  <TouchableOpacity
                    style={[
                      styles.modeSegment,
                      selectedModeFilter === 'view' && styles.modeSegmentActive,
                    ]}
                    onPress={() => handleModeFilterChange('view')}
                  >
                    <Text
                      style={[
                        styles.modeSegmentText,
                        selectedModeFilter === 'view' && styles.modeSegmentTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Subjects
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modeSegment,
                      selectedModeFilter === 'progress' && styles.modeSegmentActive,
                    ]}
                    onPress={() => handleModeFilterChange('progress')}
                  >
                    <Text
                      style={[
                        styles.modeSegmentText,
                        selectedModeFilter === 'progress' && styles.modeSegmentTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Progress
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modeSegment,
                      selectedModeFilter === 'plan' && styles.modeSegmentActive,
                    ]}
                    onPress={() => handleModeFilterChange('plan')}
                  >
                    <Text
                      style={[
                        styles.modeSegmentText,
                        selectedModeFilter === 'plan' && styles.modeSegmentTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Schedule
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        )}
        {showChildModeToggle && !isCatalogScreen && (
          <View style={styles.headerModeWrap}>
            <View style={styles.headerModeControls}>
              <View style={styles.modeSegmentedControl}>
                <TouchableOpacity
                  style={[
                    styles.modeSegment,
                    selectedModeFilter === 'view' && styles.modeSegmentActive,
                  ]}
                  onPress={() => handleModeFilterChange('view')}
                >
                  <Text
                    style={[
                      styles.modeSegmentText,
                      selectedModeFilter === 'view' && styles.modeSegmentTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    Subjects
                  </Text>
                </TouchableOpacity>
                {canShowChildProgressTab && (
                  <TouchableOpacity
                    style={[
                      styles.modeSegment,
                      selectedModeFilter === 'progress' && styles.modeSegmentActive,
                    ]}
                    onPress={() => handleModeFilterChange('progress')}
                  >
                    <Text
                      style={[
                        styles.modeSegmentText,
                        selectedModeFilter === 'progress' && styles.modeSegmentTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Progress
                    </Text>
                  </TouchableOpacity>
                )}
                {canShowChildScheduleTab && (
                  <TouchableOpacity
                    style={[
                      styles.modeSegment,
                      selectedModeFilter === 'plan' && styles.modeSegmentActive,
                    ]}
                    onPress={() => handleModeFilterChange('plan')}
                  >
                    <Text
                      style={[
                        styles.modeSegmentText,
                        selectedModeFilter === 'plan' && styles.modeSegmentTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Schedule
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
      <View style={styles.divider} />
        </>
      ) : null}
      {renderPlanningPreferencesModal()}
      {renderSubjectsExportModal()}
      {renderLearningHeaderPickerModal()}
      <ConfirmDialog
        visible={Boolean(archiveSubjectTarget)}
        title="Archive subject?"
        message={`Archive "${archiveSubjectTarget?.name || 'this subject'}"? This removes it from your subject list and related planning links.`}
        confirmLabel={archivingSubject ? 'Archiving…' : 'Archive Subject'}
        cancelLabel="Cancel"
        destructive
        onConfirm={handleConfirmArchiveSubject}
        onCancel={() => {
          if (!archivingSubject) setArchiveSubjectTarget(null);
        }}
      />

      {/* Content */}
      {isCatalogScreen ? (
        <LearningSubjectsListView
          subjects={filteredSubjects || []}
          children={safeChildren}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={handleSearchSubmit}
          onSubjectPress={handleSubjectClick}
          onAddSubject={openAddSubjectWithCurrentHeaders}
          canManageSubjects={canManageSubjectsActions}
          filterContent={renderCoursesHeaderFilters({ showTermRow: false })}
          selectedChildFilter={selectedChildFilterForCards}
          onNeedsHelpPress={(entry) => openSubjectToSection(entry.id, 'needs-help-section')}
          onNavigateToPlanner={handleNavigateToPlanner}
          onAddSyllabus={handleAddSyllabus}
          onAddEvent={onAddEvent}
          onEditSubject={
            canShowEditSubjectButton && canManageSubjectsActions
              ? handleEditSubjectForSubject
              : undefined
          }
          onAddMaterial={onAddMaterial}
          searchPreviewSectionId={activeSearchPreviewSectionId}
          subjectDetailCache={subjectDetailCache}
          searchPreviewTokens={searchTokens}
          onSearchPreviewMaterialPress={(entry, materialId) =>
            handleSubjectClick(entry, 'materials-section', materialId)
          }
          isSearchResultCompact={Boolean(searchQuery.trim())}
          selectedSchoolYear={selectedCoursesYear}
          onShiftSchoolYear={shiftCoursesYear}
          onJumpToCurrentSchoolYear={jumpToCurrentCoursesYear}
          isAtCurrentSchoolYear={isAtCurrentCoursesYear}
          onEditSchoolYear={!isChildView ? () => openPlanningPreferencesModal(selectedCoursesYear) : undefined}
          onFixGap={() => {
            onTabChange?.('planner', 'calendar');
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent('plannerScrollToFixGap'));
              });
            }
          }}
          onPlanWeek={() => onTabChange?.('planner', 'calendar')}
          emptyTitle={searchQuery ? 'No results found' : 'No subjects yet'}
          emptyText={
            searchQuery
              ? 'Please try something else'
              : 'Create subjects to organize learning.'
          }
        />
      ) : selectedModeFilter === 'plan' ? (
        <View style={styles.coursesTabContent}>
          {renderCoursesHeaderFilters({ showTermRow: false, showChildrenRow: false })}
          <SubjectsPlanBuilder
            familyId={familyId}
            planningMode={planningMode}
            selectedYearFilter={selectedYearFilter}
            selectedTermFilter={selectedTermFilter}
            children={safeChildren}
            visibleSubjects={filteredSubjects}
            allSubjects={subjects}
            pendingScheduleModalRequest={pendingScheduleModalRequest}
            onPendingScheduleModalHandled={() => setPendingScheduleModalRequest(null)}
            onDone={() => setSelectedModeFilter('view')}
            onOpenPlannerSettings={openPlanningPreferencesModal}
            homeSections="yearTargets"
            onOpenSubject={(subjectId) => {
              const match = (subjects || []).find((subject) => String(subject?.id) === String(subjectId));
              if (match) {
                handleSubjectClick(match);
              }
            }}
          />
        </View>
      ) : selectedModeFilter === 'progress' ? (
        <View style={styles.coursesTabContent}>
          {renderCoursesHeaderFilters()}
          <ProgressTab
            familyId={familyId}
            children={safeChildren}
            filteredSubjects={filteredSubjects}
            subjectDetailCache={subjectDetailCache}
            selectedChildFilter={selectedChildFilter}
            selectedYearFilter={selectedYearFilter}
            hideYearHeader
            isChildView={isChildView}
            onRefreshSubjectDetail={refreshSubjectDetailById}
            onEditChild={canShowEditChildButton ? onEditChild : null}
            canManageAttendance={canManageAttendanceActions}
            onOpenExportModal={openSubjectsExportModal}
            onOpenScheduleTab={() => handleModeFilterChange('plan')}
            onOpenSubject={(subjectId, options = null) => {
              const match = (subjects || []).find((subject) => String(subject?.id) === String(subjectId));
              if (match) {
                handleSubjectClick(match, null, null, options?.action || null);
              }
            }}
          />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSubjects}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredSubjects.length === 0 ? (
        <View style={styles.coursesTabContent}>
          {renderCoursesHeaderFilters()}

          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>
              {searchQuery ? 'No results found' : 'No subjects yet'}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? 'Please try something else'
                : 'Create subjects to organize learning.'}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={openAddSubjectWithCurrentHeaders}
              >
                <Plus size={16} color="#5AAEF2" />
                <Text style={styles.emptyButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ) : (
        <View style={styles.coursesTabContent}>
          {renderCoursesHeaderFilters()}
          {Platform.OS === 'web' ? (
            <View style={styles.coursesViewFill}>
              <SubjectsPlanBuilder
                familyId={familyId}
                planningMode={planningMode}
                selectedYearFilter={selectedYearFilter}
                selectedTermFilter={selectedTermFilter}
                children={safeChildren}
                visibleSubjects={filteredSubjects}
                allSubjects={subjects}
                onOpenPlannerSettings={openPlanningPreferencesModal}
                homeSections="footerOnly"
                embeddedInScrollView
                embeddedFooter={(planProgressContext) => (
                  <ProgressTab
                    familyId={familyId}
                    children={safeChildren}
                    filteredSubjects={filteredSubjects}
                    subjectDetailCache={subjectDetailCache}
                    selectedChildFilter={selectedChildFilter}
                    selectedYearFilter={selectedYearFilter}
                    hideYearHeader
                    sectionsMode="allEventsOnly"
                    embeddedInScrollView
                    activeChildIds={effectiveCoursesChildIds}
                    activeSubjectIds={effectiveCoursesSubjectIds}
                    planProgressContext={planProgressContext}
                    onOpenExportModal={openSubjectsExportModal}
                    onRefreshSubjectDetail={refreshSubjectDetailById}
                    canManageAttendance={canManageAttendanceActions}
                    onOpenSubject={(subjectId, options = null) => {
                      const match = (subjects || []).find((subject) => String(subject?.id) === String(subjectId));
                      if (match) {
                        handleSubjectClick(match, null, null, options?.action || null);
                      }
                    }}
                  />
                )}
              />
            </View>
          ) : (
            <ScrollView
              style={styles.subjectsList}
              contentContainerStyle={styles.subjectsListContent}
              showsVerticalScrollIndicator={false}
            >
              <SubjectsPlanBuilder
                familyId={familyId}
                planningMode={planningMode}
                selectedYearFilter={selectedYearFilter}
                selectedTermFilter={selectedTermFilter}
                children={safeChildren}
                visibleSubjects={filteredSubjects}
                allSubjects={subjects}
                onOpenPlannerSettings={openPlanningPreferencesModal}
                homeSections="footerOnly"
                embeddedInScrollView
                embeddedFooter={(planProgressContext) => (
                  <ProgressTab
                    familyId={familyId}
                    children={safeChildren}
                    filteredSubjects={filteredSubjects}
                    subjectDetailCache={subjectDetailCache}
                    selectedChildFilter={selectedChildFilter}
                    selectedYearFilter={selectedYearFilter}
                    hideYearHeader
                    sectionsMode="allEventsOnly"
                    embeddedInScrollView
                    activeChildIds={effectiveCoursesChildIds}
                    activeSubjectIds={effectiveCoursesSubjectIds}
                    planProgressContext={planProgressContext}
                    onOpenExportModal={openSubjectsExportModal}
                    onRefreshSubjectDetail={refreshSubjectDetailById}
                    canManageAttendance={canManageAttendanceActions}
                    onOpenSubject={(subjectId, options = null) => {
                      const match = (subjects || []).find((subject) => String(subject?.id) === String(subjectId));
                      if (match) {
                        handleSubjectClick(match, null, null, options?.action || null);
                      }
                    }}
                  />
                )}
              />
            </ScrollView>
          )}
        </View>
      )}
      <ComplianceRequirementModal
        open={openComplianceRequirement != null}
        onClose={() => setOpenComplianceRequirement(null)}
        requirement={openComplianceRequirement}
        familyId={familyId}
        children={safeChildren}
        onOpenAttendanceView={onNavigateToPlannerAttendance}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    gap: 12,
    position: 'relative',
    zIndex: 200,
    elevation: 200,
  },
  headerTitleWrap: {
    minWidth: 180,
    maxWidth: 340,
    flexShrink: 0,
    justifyContent: 'center',
  },
  headerYearNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerYearNavBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  headerYearNavBtnDisabled: {
    opacity: 0.35,
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  headerYearNavTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerYearNavTitleButton: {
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  headerYearNavTitleButtonDisabled: {
    ...(Platform.OS === 'web' && { cursor: 'default' }),
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerTitlePlanMode: {
    textTransform: 'none',
    letterSpacing: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  headerEditPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  headerEditPillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  learningPickerCard: {
    width: '100%',
    maxWidth: 460,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 32,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  learningPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  learningPickerHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  learningPickerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  learningPickerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningPickerSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
  },
  learningPickerList: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  learningPickerItem: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  learningPickerItemLast: {
    borderBottomWidth: 0,
  },
  learningPickerItemLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  learningPickerChildAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  learningPickerItemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  learningPickerItemText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningPickerStudentsRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  learningPickerStudentsText: {
    flex: 1,
    minWidth: 0,
    fontWeight: '400',
    fontSize: 14,
    color: '#94A3B8',
  },
  learningPickerEmptyWrap: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  learningPickerEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
  },
  learningPickerActions: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  learningPickerCancelBtn: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  learningPickerCancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningPickerPrimaryBtn: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#9ECFFB',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  learningPickerPrimaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerModeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative',
    zIndex: 220,
  },
  headerModeWrapNoPicker: {
    flex: 0,
    justifyContent: 'flex-end',
  },
  headerModeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    position: 'relative',
    zIndex: 230,
    minWidth: 0,
  },
  headerFiltersAnchor: {
    position: 'relative',
    zIndex: 240,
  },
  headerFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    backgroundColor: '#FFFFFF',
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  headerFiltersButtonText: {
    fontSize: 15,
    color: 'rgba(15,23,42,0.85)',
    fontWeight: '500',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 250,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    height: 40,
    ...Platform.select({
      web: {
        cursor: 'text',
      },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  clearButton: {
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  searchIconContainer: {
    padding: 4,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#000000',
    backgroundColor: '#000000',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  newButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  divider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginTop: 0,
    marginBottom: 0,
    marginHorizontal: 24,
    position: 'relative',
    zIndex: 10,
  },
  exportModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  exportModalCard: {
    width: '100%',
    maxWidth: 700,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 34,
  },
  exportModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  exportModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  planningPreferencesModalCard: {
    width: '100%',
    maxWidth: 940,
    maxHeight: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  planningPreferencesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F8FAFC',
  },
  planningPreferencesModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  planningPreferencesCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  planningPreferencesBody: {
    flex: 1,
    minHeight: 520,
    paddingBottom: 8,
  },
  exportModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exportModalLabel: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exportTypeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  exportTypeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  exportTypeChipActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  exportTypeChipText: {
    fontSize: 12,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exportTypeChipTextActive: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exportDateRow: {
    flexDirection: 'row',
    gap: 12,
  },
  exportDateCol: {
    flex: 1,
  },
  exportDateInput: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exportDatePickerField: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  exportStudentsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  exportStudentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  exportStudentChipActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133,196,242,0.2)',
  },
  exportStudentChipText: {
    fontSize: 12,
    color: '#6b7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exportStudentChipTextActive: {
    color: '#6BB3E8',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exportModalActions: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  exportCancelButton: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  exportCancelText: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  exportSubmitButton: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 16,
    backgroundColor: '#9ECFFB',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  exportSubmitButtonDisabled: {
    opacity: 0.6,
  },
  exportSubmitText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '800',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryCard: {
    marginHorizontal: 24,
    marginTop: 20,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  summaryCardContext: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    opacity: 0.9,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryCardRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  summaryCardItem: {
    flex: 1,
    paddingVertical: 4,
  },
  summaryCardLabel: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryCardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryCardValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryCardValuePrimary: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryCardItemExpanded: {
    borderRadius: 6,
    padding: 4,
  },
  summaryCardLabelExpanded: {
    color: '#6BB3E8',
  },
  summaryCardValueExpanded: {
    color: '#6BB3E8',
  },
  summaryExpandPanel: {
    marginTop: 20,
    paddingTop: 16,
    paddingBottom: 4,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
  },
  summaryExpandTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  summaryExpandValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 6,
  },
  summaryExpandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  summaryExpandRowAttendance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'default',
      transition: 'background-color 0.15s ease',
    }),
  },
  summaryExpandMinutes: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  summaryExpandSubjectChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  summaryExpandSubjectChipText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  summaryGradesEmpty: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  summaryGradesEmptyText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  summaryGradesEmptySub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 260,
  },
  summaryExpandText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  summaryExpandSub: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 4,
  },
  summaryExpandMuted: {
    fontSize: 11,
    color: '#94A3B8',
  },
  summaryExpandLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    paddingVertical: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  summaryExpandLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#60a5fa',
  },
  summaryComplianceSummary: {
    marginBottom: 12,
  },
  summaryComplianceProgressWrap: {
    marginTop: 6,
  },
  summaryComplianceProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    overflow: 'hidden',
  },
  summaryComplianceProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#6366F1',
  },
  summaryComplianceDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  summaryComplianceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.4)',
  },
  summaryComplianceDotComplete: {
    backgroundColor: '#6366F1',
  },
  summaryComplianceSection: {
    marginTop: 12,
  },
  summaryComplianceSectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  summaryComplianceTableWrap: {
    marginBottom: 8,
  },
  summaryComplianceTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148, 163, 184, 0.3)',
  },
  summaryComplianceTableLabelCell: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingRight: 8,
  },
  summaryComplianceTableHeaderCell: {
    width: 56,
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },
  summaryComplianceTableCheckboxCell: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  summaryComplianceGroup: {
    marginBottom: 8,
    gap: 8,
  },
  summaryComplianceGroupTitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginBottom: 4,
  },
  summaryComplianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
    minHeight: 44,
  },
  summaryComplianceCheckboxWrap: {
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  summaryComplianceRowPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingRight: 4,
    borderRadius: 6,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  summaryComplianceRowPressableHover: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
  },
  summaryComplianceCheckbox: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  summaryComplianceRowContent: {
    flexShrink: 1,
  },
  summaryComplianceRowTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1E293B',
  },
  summaryComplianceRowSubtext: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },
  /** Match MaterialsLibrary `childrenFilterRow` / `subjectsFilterRow` */
  filterRow: {
    width: '100%',
    marginTop: 24,
    marginBottom: 8,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  filterRowBelowChildren: {
    marginTop: 0,
    marginBottom: 8,
  },
  filterRowBelowTerm: {
    marginTop: 0,
    marginBottom: 8,
  },
  childTermFilterRowSpacing: {
    marginTop: 24,
    paddingTop: 4,
  },
  coursesFilterRowTop: {
    marginTop: 8,
  },
  filterRowWithTrailingActions: {
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterRowEditActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    marginLeft: 12,
  },
  filterRowBelowMode: {
    marginTop: 0,
    marginBottom: 8,
  },
  headerFiltersPopover: {
    position: 'absolute',
    top: 52,
    left: 0,
    minWidth: 336,
    maxWidth: 356,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    backgroundColor: '#FFFFFF',
    padding: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
    zIndex: 9999,
  },
  headerFiltersSectionTitleRow: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    marginBottom: 4,
  },
  headerFiltersSection: {
    gap: 2,
  },
  headerFiltersDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.06)',
    marginVertical: 4,
  },
  headerFiltersSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: 'rgba(107, 114, 128, 0.7)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modeRow: {
    marginTop: 16,
    marginBottom: 8,
  },
  modeRowDivider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    marginHorizontal: 24,
    marginBottom: 8,
  },
  filterLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 108,
    flexShrink: 0,
  },
  filterLabelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  filterLabelIconBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  filterLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipsWrap: {
    flex: 1,
    minWidth: 0,
  },
  filterChecklist: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  filterOptionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  filterOptionChipActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(107,179,232,0.12)',
  },
  filterOptionChipText: {
    fontSize: 14,
    color: 'rgba(15,23,42,0.9)',
    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  filterOptionChipTextActive: {
    color: '#6BB3E8',
    fontWeight: '600',
  },
  filterOptionChipAvatarWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    flexShrink: 0,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
  },
  filterOptionChipAvatar: {
    width: 18,
    height: 18,
    transform: [{ scale: 1.2 }],
    ...(Platform.OS === 'web' && { objectFit: 'cover' }),
  },
  filterChipsWrapYear: {
    flex: 1,
    minWidth: 0,
  },
  filterChips: {
    flex: 1,
  },
  modeSegmentedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6EBF2',
    borderRadius: 9999,
    padding: 6,
    gap: 4,
    alignSelf: 'flex-start',
  },
  modePickerWrap: {
    flexShrink: 0,
  },
  modeSegment: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 9999,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  modeSegmentActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.5)',
  },
  modeSegmentText: {
    fontSize: 15,
    color: 'rgba(15,23,42,0.85)',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  modeSegmentTextActive: {
    color: 'rgba(99, 102, 241, 1)',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipsYear: {
    flexGrow: 0,
  },
  filterChipsContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  /** Match MaterialsLibrary `childrenFilterChip` */
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    marginRight: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  filterChipActive: {
    borderColor: '#8B5CF6',
    backgroundColor: 'rgba(139,92,246,0.14)',
  },
  filterChipText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipTextActive: {
    color: '#6366F1',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorText: {
    fontSize: 14,
    color: colors.redBold || '#EF4444',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#60a5fa',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 900,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9ED3FF',
    backgroundColor: '#F8FCFF',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5AAEF2',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectsList: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  coursesTabContent: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  coursesViewFill: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  subjectsListContent: {
    paddingBottom: 40,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
    }),
  },
  subjectsCardsSection: {
    width: '100%',
  },
  subjectsSectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    marginTop: 0,
  },
  subjectsSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionHeaderActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  sectionHeaderActionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectsSectionDivider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: 16,
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  progressCardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  progressCardBody: {
    marginTop: 8,
    minHeight: 112,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    justifyContent: 'space-between',
  },
  progressCardBodyText: {
    fontSize: 13,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  progressCardActions: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
  },
  progressPillBtn: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    borderRadius: 999,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  progressPillBtnText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
