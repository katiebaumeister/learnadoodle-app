import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  Search,
  HelpCircle,
  Plus,
  BookOpen,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Calendar,
  Clock,
  GraduationCap,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getSubjectsWithOverview, getSubjectDetail } from '../../lib/services/subjectsClient';
import { getAttendanceLogs } from '../../lib/services/recordsClient';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { useSession } from '../../contexts/SessionContext';
import SubjectOverviewCard from './SubjectOverviewCard';
import SubjectDetailPage from './SubjectDetailPage';
import ComplianceRequirementModal from '../compliance/ComplianceRequirementModal';
import SubjectsPlanBuilder from './SubjectsPlanBuilder';
import HelpPopover from '../planner/HelpPopover';
import ProgressTab from './ProgressTab';

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

function getCurrentSchoolTerm() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-12
  return month >= 8 ? 'fall_term' : 'spring_term';
}

const ALL_YEARS_FILTER = 'all_years';
const ALL_TERMS_FILTER = 'all_terms';

const SUBJECTS_MODE_STORAGE_PREFIX = 'subjects:selected-mode';

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
  onNavigateToPlanner,
  onNavigateToPlannerAttendance,
  userRole = 'parent',
  accessibleChildren = [],
}) {
  // Get session context for role-based filtering
  const session = useSession();
  const safeChildren = Array.isArray(children) ? children : [];
  const safeAccessibleChildren = Array.isArray(accessibleChildren) ? accessibleChildren : [];
  
  // Determine if this is a child/student view
  const isChildView = userRole === 'child' || userRole === 'student';
  const childId = isChildView && safeAccessibleChildren.length > 0 ? (safeAccessibleChildren[0]?.id ?? safeAccessibleChildren[0]) : null;
  const modeStorageKey = useMemo(
    () => `${SUBJECTS_MODE_STORAGE_PREFIX}:${familyId || 'unknown'}:${isChildView ? 'child' : 'family'}`,
    [familyId, isChildView]
  );
  
  const [subjects, setSubjects] = useState(preloadedSubjects || []);
  const [loading, setLoading] = useState(!preloadedSubjects);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Auto-set child filter for child/student role
  const [selectedChildFilter, setSelectedChildFilter] = useState(
    isChildView && childId ? childId : 'all'
  );
  const [selectedModeFilter, setSelectedModeFilter] = useState(() => readStoredSubjectsMode(modeStorageKey) || 'view');
  const [showHeaderFilters, setShowHeaderFilters] = useState(false);
  const [selectedYearFilter, setSelectedYearFilter] = useState(() => getCurrentSchoolYear());
  const [selectedTermFilter, setSelectedTermFilter] = useState(() => getCurrentSchoolTerm());
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [subjectDetailCache, setSubjectDetailCache] = useState(preloadedSubjectDetailCache || {});
  const [pendingScrollToSectionId, setPendingScrollToSectionId] = useState(null);
  const [pendingOpenMaterialId, setPendingOpenMaterialId] = useState(null);
  const [expandedSummaryMetric, setExpandedSummaryMetric] = useState(null);
  const [openComplianceRequirement, setOpenComplianceRequirement] = useState(null);
  const [complianceRowHoverKey, setComplianceRowHoverKey] = useState(null);
  const [attendanceByChildForCompliance, setAttendanceByChildForCompliance] = useState(null); // { [childId]: { daysPresent } }
  const loadingRef = useRef(false);
  const preloadingRef = useRef(false);
  const headerFiltersAnchorRef = useRef(null);
  const helpButtonRef = useRef(null);
  const helpPopoverCloseTimerRef = useRef(null);
  const [showHelpPopover, setShowHelpPopover] = useState(false);
  const [helpPopoverPosition, setHelpPopoverPosition] = useState({ top: 0, left: 0 });

  const clearHelpPopoverCloseTimer = useCallback(() => {
    if (helpPopoverCloseTimerRef.current) {
      clearTimeout(helpPopoverCloseTimerRef.current);
      helpPopoverCloseTimerRef.current = null;
    }
  }, []);

  const updateHelpPopoverPosition = useCallback(() => {
    if (Platform.OS === 'web' && helpButtonRef.current) {
      const node = helpButtonRef.current._nativeNode || helpButtonRef.current;
      if (node && typeof node.getBoundingClientRect === 'function') {
        const rect = node.getBoundingClientRect();
        setHelpPopoverPosition({
          top: rect.bottom + 4,
          left: rect.left,
        });
      }
    }
  }, []);

  const openHelpPopover = useCallback(() => {
    clearHelpPopoverCloseTimer();
    updateHelpPopoverPosition();
    setShowHelpPopover(true);
  }, [clearHelpPopoverCloseTimer, updateHelpPopoverPosition]);

  const scheduleHelpPopoverClose = useCallback(() => {
    clearHelpPopoverCloseTimer();
    helpPopoverCloseTimerRef.current = setTimeout(() => {
      setShowHelpPopover(false);
      helpPopoverCloseTimerRef.current = null;
    }, 120);
  }, [clearHelpPopoverCloseTimer]);

  useEffect(() => () => clearHelpPopoverCloseTimer(), [clearHelpPopoverCloseTimer]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !showHeaderFilters) return;
    const handleOutsidePointer = (event) => {
      const node = headerFiltersAnchorRef.current?._nativeNode || headerFiltersAnchorRef.current;
      if (!node || typeof node.contains !== 'function') return;
      if (node.contains(event.target)) return;
      setShowHeaderFilters(false);
    };
    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('touchstart', handleOutsidePointer);
    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
    };
  }, [showHeaderFilters]);

  // Update local cache when prop changes
  useEffect(() => {
    if (preloadedSubjectDetailCache) {
      setSubjectDetailCache(preloadedSubjectDetailCache);
    }
  }, [preloadedSubjectDetailCache]);

  // Load subjects
  const loadSubjects = useCallback(async () => {
    if (!familyId || loadingRef.current) return;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const childId = selectedChildFilter === 'all' ? null : selectedChildFilter;
      // Pass session for role-based filtering (preferred) or fallback to childId
      const data = await getSubjectsWithOverview(familyId, childId, session);
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
            if (subjectDetailCache[subject.id]) return;
            
            try {
              // Pass session for role-based filtering
              const detailData = await getSubjectDetail(subject.id, familyId, null, session);
              if (detailData == null) return;
              const updatedCache = {
                ...subjectDetailCache,
                [subject.id]: detailData,
              };
              setSubjectDetailCache(updatedCache);
              
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
      setLoading(false);
      loadingRef.current = false;
    }
  }, [familyId, selectedChildFilter, onSubjectsUpdate]);

  // Lock child filter for child/student view
  useEffect(() => {
    if (isChildView && childId && selectedChildFilter !== childId) {
      setSelectedChildFilter(childId);
    }
  }, [isChildView, childId, selectedChildFilter]);

  useEffect(() => {
    if (!preloadedSubjects) {
      loadSubjects();
    }
  }, [familyId, selectedChildFilter]);

  // Listen for subject updates
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    
    const handleSubjectUpdate = () => {
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
    if (Array.isArray(preloadedSubjects)) {
      setSubjects(preloadedSubjects);
      setLoading(false);
    }
  }, [preloadedSubjects]);

  useEffect(() => {
    const storedMode = readStoredSubjectsMode(modeStorageKey);
    setSelectedModeFilter(storedMode || 'view');
  }, [modeStorageKey]);

  useEffect(() => {
    writeStoredSubjectsMode(modeStorageKey, selectedModeFilter);
  }, [modeStorageKey, selectedModeFilter]);

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
    if (selectedChildFilter !== 'all') {
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
    if (selectedTermFilter !== ALL_TERMS_FILTER) {
      filteredEntries = filteredEntries.filter(
        ({ subject }) => normalizeSubjectTerm(subject?.school_term) === selectedTermFilter
      );
    }

    return filteredEntries.map((entry) => entry.subject).filter(Boolean);
  }, [
    searchableSubjects,
    searchTokens,
    nonSectionSearchTokens,
    detectedSectionFromSearch,
    selectedChildFilter,
    selectedYearFilter,
    selectedTermFilter,
    searchQueryNormalized,
  ]);

  const handleSubjectClick = useCallback((subject, sectionOverride = null, materialId = null) => {
    if (!subject?.id) return;
    const sectionId = sectionOverride || detectedSectionFromSearch || null;
    setPendingScrollToSectionId(sectionId);
    setPendingOpenMaterialId(materialId || null);
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

  const registeredTerms = useMemo(() => {
    const order = ['full_year', 'fall_term', 'spring_term'];
    if (!subjects || subjects.length === 0) return order;
    const present = new Set(subjects.map((s) => normalizeSubjectTerm(s?.school_term)).filter(Boolean));
    return order.filter((term) => present.has(term) || term === 'fall_term');
  }, [subjects]);

  const scopeButtonLabel = 'Scope';

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
  };

  const openSubjectToSection = (subjectId, sectionId) => {
    setPendingScrollToSectionId(sectionId);
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
    setSelectedModeFilter(nextMode);
  }, []);

  // If a subject is selected, show detail view
  if (selectedSubjectId) {
    return (
      <SubjectDetailPage
        subjectId={selectedSubjectId}
        familyId={familyId}
        children={safeChildren}
        preloadedSubjectData={subjectDetailCache[selectedSubjectId]}
        initialScrollToSectionId={pendingScrollToSectionId}
        initialOpenMaterialId={pendingOpenMaterialId}
        onSubjectDataUpdate={(data) => {
          const updatedCache = {
            ...subjectDetailCache,
            [selectedSubjectId]: data,
          };
          setSubjectDetailCache(updatedCache);
          
          // Update parent cache if callback provided
          if (onSubjectDetailUpdate) {
            onSubjectDetailUpdate(selectedSubjectId, data);
          }
        }}
        onBack={handleBack}
        onEditSubject={onEditSubject}
      />
    );
  }

  const childDisplayName = safeAccessibleChildren[0]?.first_name || safeAccessibleChildren[0]?.name || 'Your';
  const subjectsHeaderTitle = isChildView && childId
    ? (childDisplayName === 'Your' ? 'Your Subjects' : `${childDisplayName}'s Subjects`)
    : "YOUR FAMILY'S COURSES";
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{subjectsHeaderTitle}</Text>
        </View>
        {!isChildView && (
          <View style={styles.headerModeWrap}>
            <View style={styles.headerModeControls}>
              <View ref={headerFiltersAnchorRef} style={styles.headerFiltersAnchor}>
                <TouchableOpacity
                  style={styles.headerFiltersButton}
                  onPress={() => setShowHeaderFilters((prev) => !prev)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.headerFiltersButtonText} numberOfLines={1} ellipsizeMode="tail">
                    {scopeButtonLabel}
                  </Text>
                  {showHeaderFilters ? <ChevronUp size={14} color="rgba(15,23,42,0.7)" /> : <ChevronDown size={14} color="rgba(15,23,42,0.7)" />}
                </TouchableOpacity>
                {showHeaderFilters && (
                  <View style={styles.headerFiltersPopover}>
                    <View style={styles.headerFiltersSectionTitleRow}>
                      <Text style={styles.headerFiltersSectionTitle}>Children</Text>
                    </View>
                    <View style={styles.headerFiltersSection}>
                      <View style={styles.filterChecklist}>
                        <TouchableOpacity
                          style={[
                            styles.filterOptionChip,
                            selectedChildFilter === 'all' && styles.filterOptionChipActive,
                          ]}
                          onPress={() => setSelectedChildFilter('all')}
                        >
                          <Text
                            style={[
                              styles.filterOptionChipText,
                              selectedChildFilter === 'all' && styles.filterOptionChipTextActive,
                            ]}
                          >
                            All Children
                          </Text>
                        </TouchableOpacity>
                        {safeChildren.map((child) => {
                          const childColor = getChildColorFromAvatar(child.avatar);
                          const isActive = selectedChildFilter === child.id;
                          return (
                            <TouchableOpacity
                              key={child.id}
                              style={[
                                styles.filterOptionChip,
                                isActive && styles.filterOptionChipActive,
                              ]}
                              onPress={() => setSelectedChildFilter(child.id)}
                            >
                              <Text
                                style={[
                                  styles.filterOptionChipText,
                                  isActive && styles.filterOptionChipTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                {child.name || child.first_name}
                              </Text>
                              <View
                                style={[
                                  styles.filterOptionChipDot,
                                  { backgroundColor: childColor },
                                ]}
                              />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                    <View style={styles.headerFiltersDivider} />
                    <View>
                      <View style={styles.headerFiltersSectionTitleRow}>
                        <Text style={styles.headerFiltersSectionTitle}>Year</Text>
                      </View>
                      <View style={styles.headerFiltersSection}>
                      <View style={styles.filterChecklist}>
                        <TouchableOpacity
                          style={[
                            styles.filterOptionChip,
                            selectedYearFilter === ALL_YEARS_FILTER && styles.filterOptionChipActive,
                          ]}
                          onPress={() => setSelectedYearFilter(ALL_YEARS_FILTER)}
                        >
                          <Text
                            style={[
                              styles.filterOptionChipText,
                              selectedYearFilter === ALL_YEARS_FILTER && styles.filterOptionChipTextActive,
                            ]}
                            numberOfLines={1}
                          >
                            All years
                          </Text>
                        </TouchableOpacity>
                        {registeredYears.map((year) => {
                          const isActive = selectedYearFilter === year;
                          return (
                            <TouchableOpacity
                              key={year}
                              style={[
                                styles.filterOptionChip,
                                isActive && styles.filterOptionChipActive,
                              ]}
                              onPress={() => setSelectedYearFilter(year)}
                            >
                              <Text
                                style={[
                                  styles.filterOptionChipText,
                                  isActive && styles.filterOptionChipTextActive,
                                ]}
                                numberOfLines={1}
                              >
                                {year}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      </View>
                    </View>
                    {registeredTerms.length > 0 && <View style={styles.headerFiltersDivider} />}
                    {registeredTerms.length > 0 && (
                      <View>
                        <View style={styles.headerFiltersSectionTitleRow}>
                          <Text style={styles.headerFiltersSectionTitle}>Term</Text>
                        </View>
                        <View style={styles.headerFiltersSection}>
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
                    )}
                  </View>
                )}
              </View>
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
                    Courses
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
              </View>
              <TouchableOpacity
                ref={helpButtonRef}
                onPress={() => {
                  if (showHelpPopover) {
                    clearHelpPopoverCloseTimer();
                    setShowHelpPopover(false);
                    return;
                  }
                  openHelpPopover();
                }}
                style={styles.helpButton}
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: () => {
                    openHelpPopover();
                  },
                  onMouseLeave: () => {
                    scheduleHelpPopoverClose();
                  },
                })}
              >
                <HelpCircle size={22} color="rgba(15,23,42,0.7)" />
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={styles.headerActions}>
          {isChildView && (
            <TouchableOpacity
              ref={helpButtonRef}
              onPress={() => {
                if (showHelpPopover) {
                  clearHelpPopoverCloseTimer();
                  setShowHelpPopover(false);
                  return;
                }
                openHelpPopover();
              }}
              style={styles.helpButton}
              {...(Platform.OS === 'web' && {
                cursor: 'pointer',
                onMouseEnter: () => {
                  openHelpPopover();
                },
                onMouseLeave: () => {
                  scheduleHelpPopoverClose();
                },
              })}
            >
              <HelpCircle size={22} color="rgba(15,23,42,0.7)" />
            </TouchableOpacity>
          )}
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
          {/* Hide + NEW button for child/student view */}
          {!isChildView && (
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => {
                if (onAddSubject) {
                  onAddSubject();
                } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openAddSubjectModal'));
                }
              }}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && {
                cursor: 'pointer',
              })}
            >
              <Text style={styles.newButtonText}>+ NEW</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={styles.divider} />
      {showHelpPopover && Platform.OS === 'web' && (
        <HelpPopover
          visible={showHelpPopover}
          onClose={() => {
            clearHelpPopoverCloseTimer();
            setShowHelpPopover(false);
          }}
          position={helpPopoverPosition}
          onMouseEnter={clearHelpPopoverCloseTimer}
          onMouseLeave={scheduleHelpPopoverClose}
          descriptionText={"Courses is your family's subject overview page. Switch to Schedule for the multi-subject planning layer, or build out structured class plans directly within each subject's detail page. Switch to Progress for multi-subject analytics -- attendance, performance, and gaps in learning."}
        />
      )}

      {/* Content */}
      {selectedModeFilter === 'plan' ? (
        <SubjectsPlanBuilder
          familyId={familyId}
          planningMode={planningMode}
          selectedYearFilter={selectedYearFilter}
          selectedTermFilter={selectedTermFilter}
          children={safeChildren}
          visibleSubjects={filteredSubjects}
          allSubjects={subjects}
          onDone={() => setSelectedModeFilter('view')}
          onOpenSubject={(subjectId) => {
            const match = (subjects || []).find((subject) => String(subject?.id) === String(subjectId));
            if (match) {
              handleSubjectClick(match);
            }
          }}
        />
      ) : selectedModeFilter === 'progress' ? (
        <ProgressTab
          children={safeChildren}
          filteredSubjects={filteredSubjects}
          subjectDetailCache={subjectDetailCache}
          selectedChildFilter={selectedChildFilter}
          onOpenSubject={(subjectId) => {
            const match = (subjects || []).find((subject) => String(subject?.id) === String(subjectId));
            if (match) handleSubjectClick(match);
          }}
        />
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#60a5fa" />
          <Text style={styles.loadingText}>Loading subjects...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadSubjects}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filteredSubjects.length === 0 ? (
        <View style={styles.emptyContainer}>
          {!searchQuery ? <BookOpen size={48} color={colors.muted} /> : null}
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'No results found' : 'No subjects yet'}
          </Text>
          <Text style={styles.emptyText}>
            {searchQuery
              ? 'Please try something else'
              : 'Create subjects to organize learning by topic, course, or area of study.'}
          </Text>
          {!searchQuery && (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => {
                if (onAddSubject) {
                  onAddSubject();
                } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openAddSubjectModal'));
                }
              }}
            >
              <Plus size={18} color="#60a5fa" />
              <Text style={styles.emptyButtonText}>Create your first subject</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView
          style={styles.subjectsList}
          contentContainerStyle={styles.subjectsListContent}
          showsVerticalScrollIndicator={false}
        >
          {(filteredSubjects || []).filter(s => s?.id).map((subject) => (
            <SubjectOverviewCard
              key={subject.id}
              subject={subject}
              children={safeChildren}
              selectedChildFilter={selectedChildFilter}
              onCardClick={handleSubjectClick}
              onNeedsHelpPress={(s) => openSubjectToSection(s.id, 'needs-help-section')}
              onNavigateToPlanner={handleNavigateToPlanner}
              onAddSyllabus={handleAddSyllabus}
              onAddEvent={handleAddEvent}
              onAddMaterial={onAddMaterial}
              searchPreviewSectionId={activeSearchPreviewSectionId}
              searchPreviewData={subjectDetailCache[subject.id] || null}
              searchPreviewTokens={searchTokens}
              onSearchPreviewMaterialPress={(s, materialId) =>
                handleSubjectClick(s, 'materials-section', materialId)
              }
              isSearchResultCompact={Boolean(searchQuery.trim())}
            />
          ))}
        </ScrollView>
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
    gap: 12,
    flexShrink: 0,
  },
  helpButton: {
    padding: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  headerModeWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
    position: 'relative',
    zIndex: 220,
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
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
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
  filterLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
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
    borderColor: 'rgba(139, 92, 246, 0.55)',
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  filterOptionChipText: {
    fontSize: 14,
    color: 'rgba(15,23,42,0.9)',
    fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  filterOptionChipTextActive: {
    fontWeight: '600',
  },
  filterOptionChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
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
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(133, 196, 242, 0.2)',
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
    color: '#6BB3E8',
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    maxWidth: 400,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#60a5fa',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectsList: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  subjectsListContent: {
    paddingBottom: 40,
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
