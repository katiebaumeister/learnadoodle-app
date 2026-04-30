import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import {
  ArrowLeft,
  Edit2,
  Calendar,
  Clock,
  Plus,
  Sparkles,
  Upload,
  Pencil,
  FileText,
  ExternalLink,
  Trash2,
  CheckCircle,
  XCircle,
  Download,
  X,
  HelpCircle,
  ChevronRight,
  BarChart3,
  List,
  SlidersHorizontal,
} from 'lucide-react';
import { colors } from '../../theme/colors';
import { getSubjectDetail, parseChildIds } from '../../lib/services/subjectsClient';
import { useSession } from '../../contexts/SessionContext';
import MaterialDocViewerModal, {
  resolveMaterialDocViewerUrl,
  getMaterialFileTypeLabel,
} from '../materials/MaterialDocViewerModal';
import { useToast } from '../Toast';
import { comingSoonModalStyles } from '../../theme/comingSoonModalTheme';
import SubjectPastEventsAttendanceModal from './SubjectPastEventsAttendanceModal';
import SubjectPastEventsGradesModal from './SubjectPastEventsGradesModal';
import SubjectAssignedToStudentModal from './SubjectAssignedToStudentModal';
import RespondToHelpRequestModal from '../parent/RespondToHelpRequestModal';
import AssignmentDetailModal from '../assignments/AssignmentDetailModal';
import { extractStudentHelpReason, formatDueShort } from '../tutor/tutorHelpUtils';
import { deriveRoleFromTags, roleLabel } from '../../lib/docs/roles';
import { findAcademicYearPlanForSubject } from '../../lib/subjectPlanSlotLines';
import { getSubjectProgressCache } from '../../lib/subjectProgressPlanCache';
import { fetchSubjectCurriculumEventsStructure } from '../../lib/services/curriculumClient';
import { createAttendanceLog, updateAttendanceLog, deleteAttendanceLog } from '../../lib/services/recordsClient';
import { updateEventStatus } from '../../lib/services/attendanceClient';
import {
  SubjectAttendanceYearHeatmap,
  SubjectAttendanceMonthDrilldown,
} from './SubjectSectionDrilldownPanels';
import { supabase } from '../../lib/supabase';
import SubjectProgressPlanSection from './SubjectProgressPlanSection';
import AddMaterialModal from '../materials/AddMaterialModal';
import MaterialDetailsModal from '../materials/MaterialDetailsModal';
import { archiveMaterial } from '../../lib/services/materialsClient';

const ATTENDANCE_LIST_LIMIT = 5;
const SHOW_SUBJECT_PROGRESS = false;
const WEEKDAY_PLURALS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEARNING_GOALS_METHOD_LABELS = {
  manual: 'Manual input',
  plain_text_parsed: 'Paste plain text',
  ai_generated: 'Generate curriculum',
};
function isAttendancePresentLike(status) {
  const normalized = String(status || '').toLowerCase();
  // Legacy rows can omit status; treat as attended.
  if (!normalized) return true;
  return normalized === 'present' || normalized === 'partial';
}

function computeProgressPercentFromEventsAndAttendance(events = [], attendanceRecords = []) {
  const plannedEvents = (events || []).filter((event) => event?.status !== 'canceled' && !event?.is_backlog);
  if (!plannedEvents.length) return null;
  const plannedIds = new Set(plannedEvents.map((event) => String(event?.id || '')).filter(Boolean));
  const completedIds = new Set(
    plannedEvents
      .filter((event) => event?.status === 'done')
      .map((event) => String(event?.id || ''))
      .filter(Boolean)
  );
  (attendanceRecords || []).forEach((record) => {
    const eventId = String(record?.event_id || '');
    if (!eventId || !plannedIds.has(eventId)) return;
    if (isAttendancePresentLike(record?.status)) completedIds.add(eventId);
  });
  return Math.min(100, Math.round((completedIds.size / plannedEvents.length) * 100));
}

function formatWeekdayList(days = []) {
  const labels = [...new Set(days)]
    .map((day) => WEEKDAY_PLURALS[day])
    .filter(Boolean);
  if (labels.length <= 1) return labels[0] || '';
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function formatScheduleTime(startTime) {
  const match = String(startTime || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = match[2];
  const period = hour >= 12 ? 'p.m.' : 'a.m.';
  if (hour === 0) hour = 12;
  if (hour > 12) hour -= 12;
  if (minute === '00') return `${hour} ${period}`;
  return `${hour}:${minute} ${period}`;
}

function getSubjectPlanBlocksForSubject(planData, subjectId) {
  if (!planData?.plan || !subjectId) return [];
  const sid = String(subjectId);
  const blocks = Array.isArray(planData.plan.blocks) ? planData.plan.blocks : [];
  return blocks.filter((b) => {
    if (String(b?.subject_id ?? '') === sid) return true;
    const ids = Array.isArray(b?.subject_ids) ? b.subject_ids.map(String) : [];
    return ids.includes(sid);
  });
}

function parseWeekdaysFromPlanBlock(block) {
  if (!Array.isArray(block?.weekdays)) return [];
  return block.weekdays
    .map((day) => parseInt(day, 10))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
}

function getBlockRangeBoundaryKey(block, kind) {
  const startKeys = ['start_date', 'startDate', 'starts_on', 'start_on', 'date_start', 'from_date', 'from'];
  const endKeys = ['end_date', 'endDate', 'ends_on', 'end_on', 'date_end', 'to_date', 'to'];
  const keys = kind === 'start' ? startKeys : endKeys;
  for (const key of keys) {
    const value = String(block?.[key] || '').slice(0, 10);
    if (DATE_KEY_RE.test(value)) return value;
  }
  return null;
}

function isDateWithinPlanBlockRange(dateKey, block) {
  const key = String(dateKey || '').slice(0, 10);
  if (!DATE_KEY_RE.test(key)) return false;
  const startKey = getBlockRangeBoundaryKey(block, 'start');
  const endKey = getBlockRangeBoundaryKey(block, 'end');
  if (startKey && key < startKey) return false;
  if (endKey && key > endKey) return false;
  return true;
}

function buildClassScheduleSummary(planData, subjectId) {
  const blocks = getSubjectPlanBlocksForSubject(planData, subjectId);
  const match = blocks[0];
  if (!match || !Array.isArray(match.weekdays) || match.weekdays.length === 0) return null;
  const weekdays = parseWeekdaysFromPlanBlock(match);
  if (weekdays.length === 0) return null;
  const dayLabel = formatWeekdayList(weekdays);
  if (!dayLabel) return null;
  if (match.all_day) return `${dayLabel} (all day)`;
  const timeLabel = formatScheduleTime(match.start_time);
  return timeLabel ? `${dayLabel} at ${timeLabel}` : dayLabel;
}

function toTitleWord(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function getSubjectTermLabel(term) {
  const raw = String(term || '').trim().toLowerCase();
  if (raw === 'full_year') return 'Full year';
  if (raw === 'fall_term') return 'Fall term';
  if (raw === 'spring_term') return 'Spring term';
  return '';
}

function formatSubjectGradeLabel(grade) {
  if (grade == null || grade === '') return '';
  const raw = String(grade).trim();
  if (!raw) return '';
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) {
    return /grade/i.test(raw) ? raw : `${raw} Grade`;
  }
  if (n === 0) return 'Kindergarten';
  if (n >= 1 && n <= 12) {
    const ord = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
    return `${n}${ord} Grade`;
  }
  return /grade/i.test(raw) ? raw : `${raw} Grade`;
}

function buildHeaderMetaLine(subject) {
  if (!subject) return null;
  const schoolYear = String(subject.school_year || '').trim();
  const schoolTermLabel = getSubjectTermLabel(subject.school_term);
  const gradeLabel = formatSubjectGradeLabel(subject.grade);
  const parts = [schoolYear, schoolTermLabel, gradeLabel].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(' · ');
}

function normalizeCalendarTargets(raw) {
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value || '').toLowerCase().trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value || '').toLowerCase().trim()).filter(Boolean);
      }
    } catch (_) {
      return [];
    }
  }
  return [];
}

function buildLogisticsHeaderLine(subject) {
  if (!subject) return null;
  const mode = toTitleWord(subject.mode);
  const location = String(subject.location || '').trim();
  const instructor = String(subject.instructor || '').trim();
  const pieces = [];
  if (mode) {
    pieces.push(mode);
  }
  if (location) {
    pieces.push(`at ${location}`);
  }
  if (instructor) {
    pieces.push(`with ${instructor}`);
  }
  if (pieces.length === 0) return null;
  return `Logistics: ${pieces.join(' ')}.`;
}

function buildCalendarConnectionsHeaderLine(subject) {
  if (!subject) return null;
  const labels = normalizeCalendarTargets(subject.connected_calendar_targets)
    .map((value) => (value === 'google' ? 'Google' : value === 'apple' ? 'Apple' : null))
    .filter(Boolean);
  const unique = [...new Set(labels)];
  if (unique.length === 0) return null;
  return unique.length === 1
    ? `Calendar connection: ${unique[0]}`
    : `Calendar connections: ${unique.join(', ')}`;
}

function firstLinkedEventId(raw) {
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p) && p.length > 0) return String(p[0]);
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

function parsePositiveInt(value) {
  const parsed = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePositiveFloat(value) {
  const parsed = parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default function SubjectDetailPage({
  subjectId,
  familyId,
  children = [],
  onBack,
  onEditSubject,
  onOpenExportModalForSection = null,
  preloadedSubjectData = null,
  onSubjectDataUpdate = null,
  initialScrollToSectionId = null,
  initialOpenMaterialId = null,
}) {
  const session = useSession();
  const toast = useToast();
  const [loading, setLoading] = useState(!preloadedSubjectData);
  const [error, setError] = useState(null);
  const [subjectData, setSubjectData] = useState(preloadedSubjectData || null);
  const [showAttendanceExpanded, setShowAttendanceExpanded] = useState(false);
  const [showExportComingSoonModal, setShowExportComingSoonModal] = useState(false);
  const [showPastEventsAttendanceModal, setShowPastEventsAttendanceModal] = useState(false);
  const [showPastEventsGradesModal, setShowPastEventsGradesModal] = useState(false);
  const [showAssignedToStudentModal, setShowAssignedToStudentModal] = useState(false);
  /** Web-only: which export icon is hovered (portal tooltip, matches planner RightToolbar). */
  const [exportTooltipKey, setExportTooltipKey] = useState(null);
  const [exportTooltipPos, setExportTooltipPos] = useState({ x: 0, y: 0 });
  const [helpModalAssignment, setHelpModalAssignment] = useState(null);
  const [assignedDetailAssignment, setAssignedDetailAssignment] = useState(null);
  const [showMaterialDocViewer, setShowMaterialDocViewer] = useState(false);
  const [materialDocViewerUrl, setMaterialDocViewerUrl] = useState('');
  const [materialDocViewerTitle, setMaterialDocViewerTitle] = useState('');
  const [materialDocViewerKind, setMaterialDocViewerKind] = useState('pdf');
  const [viewingMaterial, setViewingMaterial] = useState(null);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [highlightedMaterialId, setHighlightedMaterialId] = useState(null);
  const [subjectPlanYearId, setSubjectPlanYearId] = useState(null);
  const [subjectPlanData, setSubjectPlanData] = useState(null);
  const [attendanceViewMode, setAttendanceViewMode] = useState('list');
  const [learningGoalsUnits, setLearningGoalsUnits] = useState([]);
  const [learningGoalsSource, setLearningGoalsSource] = useState(null);
  const [learningGoalsLoading, setLearningGoalsLoading] = useState(false);
  const loadingRef = useRef(false);
  const openingPlanBuilderRef = useRef(false);
  const autoOpenedMaterialKeyRef = useRef(null);
  const materialHighlightTimeoutRef = useRef(null);
  const materialContextMenuIdRef = useRef(`subject-detail-material-context-menu-${Math.random().toString(36).slice(2)}`);
  const loadLearningGoalsStructure = useCallback(async () => {
    const sid = subjectData?.subject?.id;
    if (!familyId || !sid) {
      setLearningGoalsUnits([]);
      setLearningGoalsSource(null);
      return;
    }
    setLearningGoalsLoading(true);
    try {
      const { data, error } = await fetchSubjectCurriculumEventsStructure(familyId, sid, null);
      if (error) throw error;
      setLearningGoalsUnits(Array.isArray(data?.units) ? data.units : []);
      setLearningGoalsSource(data?.saved_content_source || null);
    } catch (err) {
      console.warn('[SubjectDetailPage] Failed loading learning goals structure:', err);
      setLearningGoalsUnits([]);
      setLearningGoalsSource(null);
    } finally {
      setLearningGoalsLoading(false);
    }
  }, [familyId, subjectData?.subject?.id]);
  /** Parent often passes inline callbacks; keep loadSubjectDetail stable so mount effect does not loop. */
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const onSubjectDataUpdateRef = useRef(onSubjectDataUpdate);
  onSubjectDataUpdateRef.current = onSubjectDataUpdate;
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (preloadedSubjectData) {
      setSubjectData(preloadedSubjectData);
      setLoading(false);
      setError(null);
    }
  }, [preloadedSubjectData]);

  const loadSubjectDetail = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (!subjectId || !familyId) return;
    if (!silent && loadingRef.current) return;
    if (!silent) {
      loadingRef.current = true;
      setLoading(true);
    }
    setError(null);
    try {
      // Pass session for role-based filtering
      const data = await getSubjectDetail(subjectId, familyId, null, sessionRef.current);
      if (data == null) {
        if (typeof onBackRef.current === 'function') onBackRef.current();
        return;
      }
      setSubjectData(data);
      if (onSubjectDataUpdateRef.current) {
        onSubjectDataUpdateRef.current(data);
      }
    } catch (err) {
      console.error('[SubjectDetailPage] Error loading subject detail:', err);
      setError(err.message || 'Failed to load subject details');
    } finally {
      if (!silent) {
        setLoading(false);
        loadingRef.current = false;
      }
    }
  }, [subjectId, familyId]);

  useEffect(() => {
    if (!subjectId || !familyId) {
      setLoading(false);
      setError('Subject ID and Family ID are required');
      return;
    }
    loadSubjectDetail({ silent: !!preloadedSubjectData });
    // Intentionally omit preloadedSubjectData: parent updates cache object after each fetch; re-running would loop.
  }, [subjectId, familyId, loadSubjectDetail]);

  useEffect(() => {
    loadLearningGoalsStructure();
  }, [loadLearningGoalsStructure]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleRefresh = () => loadSubjectDetail({ silent: true });
    const handleSubjectDetailRefresh = (e) => {
      if (e.detail?.subjectId === subjectId) loadSubjectDetail({ silent: true });
    };
    const handleSubjectRecordUpserted = (e) => {
      const incoming = e?.detail?.subject;
      if (!incoming?.id || String(incoming.id) !== String(subjectId)) return;
      setSubjectData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          subject: {
            ...(prev.subject || {}),
            ...incoming,
          },
        };
      });
    };
    const handleMaterialsStale = (e) => {
      const fid = e.detail?.familyId;
      const ids = e.detail?.subjectIds;
      if (fid !== familyId) return;
      if (Array.isArray(ids) && ids.some((id) => String(id) === String(subjectId))) {
        loadSubjectDetail({ silent: true });
      }
    };
    window.addEventListener('refreshSubjects', handleRefresh);
    window.addEventListener('refreshPlanDefaults', handleRefresh);
    window.addEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
    window.addEventListener('subjectRecordUpserted', handleSubjectRecordUpserted);
    window.addEventListener('childAssignmentsNeedRefresh', handleRefresh);
    window.addEventListener('subjectDetailMaterialsStale', handleMaterialsStale);
    return () => {
      window.removeEventListener('refreshSubjects', handleRefresh);
      window.removeEventListener('refreshPlanDefaults', handleRefresh);
      window.removeEventListener('refreshSubjectDetail', handleSubjectDetailRefresh);
      window.removeEventListener('subjectRecordUpserted', handleSubjectRecordUpserted);
      window.removeEventListener('childAssignmentsNeedRefresh', handleRefresh);
      window.removeEventListener('subjectDetailMaterialsStale', handleMaterialsStale);
    };
  }, [subjectId, familyId, loadSubjectDetail]);

  const getChildName = useCallback((childId) => {
    const child = children.find(c => c.id === childId);
    return child?.first_name || child?.name || 'Unknown';
  }, [children]);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  // Helper to safely format percentage values
  const formatPercent = useCallback((value) => {
    if (value === null || value === undefined || isNaN(value)) {
      return '—';
    }
    return `${value}%`;
  }, []);

  const scrollToSection = useCallback((sectionId) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, []);

  useEffect(() => {
    if (!initialScrollToSectionId) return;
    const t = setTimeout(() => scrollToSection(initialScrollToSectionId), 300);
    return () => clearTimeout(t);
  }, [initialScrollToSectionId, scrollToSection]);

  const handleMaterialChipPress = useCallback(
    async (material) => {
      if (!material?.id) return;
      const fallbackTitle = material.title || material.provider_name || 'Material';
      try {
        const { url, title, error, viewerKind } = await resolveMaterialDocViewerUrl(material.id);
        if (error || !url) {
          const isInfo =
            error &&
            /cannot be viewed|does not have a viewable|isn’t available|isn't available|Preview isn’t/i.test(error);
          toast.push(error || 'Could not open this material.', isInfo ? 'info' : 'error');
          return;
        }
        setMaterialDocViewerTitle(title || fallbackTitle);
        setMaterialDocViewerUrl(url);
        setMaterialDocViewerKind(viewerKind || 'pdf');
        setShowMaterialDocViewer(true);
      } catch (err) {
        console.error('[SubjectDetailPage] material viewer:', err);
        toast.push('Failed to load material. Please try again.', 'error');
      }
    },
    [toast]
  );

  useEffect(() => {
    autoOpenedMaterialKeyRef.current = null;
    setHighlightedMaterialId(null);
    if (materialHighlightTimeoutRef.current) {
      clearTimeout(materialHighlightTimeoutRef.current);
      materialHighlightTimeoutRef.current = null;
    }
  }, [subjectId, initialOpenMaterialId]);

  useEffect(() => {
    return () => {
      if (materialHighlightTimeoutRef.current) {
        clearTimeout(materialHighlightTimeoutRef.current);
        materialHighlightTimeoutRef.current = null;
      }
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        const existingMenu = document.getElementById(materialContextMenuIdRef.current);
        if (existingMenu) existingMenu.remove();
      }
    };
  }, []);

  const closeMaterialDocViewer = useCallback(() => {
    setShowMaterialDocViewer(false);
    setMaterialDocViewerUrl('');
    setMaterialDocViewerTitle('');
    setMaterialDocViewerKind('pdf');
  }, []);

  // Extract data
  const subject = subjectData?.subject;
  const materials = subjectData?.materials || [];
  const upcomingItems = subjectData?.upcomingItems || [];
  const overdueItems = subjectData?.overdueItems || [];
  const nextItem = subjectData?.nextItem;
  const attendanceRecords = subjectData?.attendanceRecords || [];
  const grades = subjectData?.grades || [];
  const eventOutcomes = subjectData?.eventOutcomes || [];
  const subjectEvents = subjectData?.events || [];
  const subjectPlanYearIdFromEvents = useMemo(() => {
    const ids = (subjectData?.events || [])
      .map((event) => event?.academic_year_id)
      .filter(Boolean);
    return ids.length > 0 ? String(ids[0]) : null;
  }, [subjectData?.events]);

  // Metrics (with proper null/undefined handling)
  const attendanceRate30 = subjectData?.attendanceRate30 ?? null;
  const avgGradePercent = subjectData?.avgGradePercent ?? null;

  // Get assigned children (IDs)
  const assignedChildren = useMemo(() => {
    if (!subject) return [];
    if (subject.child_id) {
      return parseChildIds(subject.child_id);
    }
    const ids = [];
    (subjectData?.events || []).forEach((event) => {
      if (event?.child_id) ids.push(event.child_id);
      if (Array.isArray(event?.child_ids) && event.child_ids.length > 0) {
        ids.push(...event.child_ids);
      }
    });
    return [...new Set(ids.filter(Boolean).map((id) => String(id)))];
  }, [subject, subjectData?.events]);

  const childrenNames = assignedChildren.map(getChildName).filter(Boolean);
  const attendanceChildrenLabel = useMemo(() => {
    if (childrenNames.length === 0) return 'Your students';
    if (childrenNames.length === 1) return childrenNames[0];
    if (childrenNames.length === 2) return `${childrenNames[0]} and ${childrenNames[1]}`;
    return `${childrenNames.slice(0, -1).join(', ')}, and ${childrenNames[childrenNames.length - 1]}`;
  }, [childrenNames]);
  const classScheduleSummary = useMemo(
    () => buildClassScheduleSummary(subjectPlanData, subject?.id),
    [subjectPlanData, subject?.id]
  );
  const subjectPlanBlocks = useMemo(
    () => getSubjectPlanBlocksForSubject(subjectPlanData, subject?.id),
    [subjectPlanData, subject?.id]
  );
  const headerMetaLine = useMemo(() => buildHeaderMetaLine(subject), [subject]);
  const logisticsHeaderLine = useMemo(() => buildLogisticsHeaderLine(subject), [subject]);
  const calendarConnectionsHeaderLine = useMemo(
    () => buildCalendarConnectionsHeaderLine(subject),
    [subject]
  );
  const totalLearningGoalLessons = useMemo(
    () => (learningGoalsUnits || []).reduce((sum, unit) => sum + ((unit?.lessons || []).length || 0), 0),
    [learningGoalsUnits]
  );
  const hasLearningGoalsContent = totalLearningGoalLessons > 0;
  const learningGoalsSourceLabel = useMemo(() => {
    const key = String(learningGoalsSource || '').trim().toLowerCase();
    return LEARNING_GOALS_METHOD_LABELS[key] || (key ? key.replace(/_/g, ' ') : null);
  }, [learningGoalsSource]);
  const openSubjectUnitsEditorForMethod = useCallback(
    (method) => {
      const requestedMethod = String(method || '').trim().toLowerCase();
      const mappedMethod = requestedMethod === 'paste' ? 'paste_plain' : requestedMethod;
      const safeMethod = ['manual', 'paste_plain', 'upload', 'generate'].includes(mappedMethod)
        ? mappedMethod
        : null;
      if (Platform.OS === 'web' && typeof window !== 'undefined' && subjectData?.subject?.id) {
        const resolvedPlanYearId = subjectPlanYearId || subjectPlanYearIdFromEvents || null;
        window.dispatchEvent(
          new CustomEvent('openPlanYearModal', {
            detail: {
              from: 'subject_detail',
              subjectId: subjectData.subject.id,
              subjectName: subjectData.subject.name || null,
              schoolYear: subjectData.subject.school_year || null,
              schoolTerm: subjectData.subject.school_term || null,
              childIds: assignedChildren,
              academicYearId: resolvedPlanYearId,
              openAsModal: true,
              openToEditList: false,
              skipPlanSummary: !!resolvedPlanYearId,
              openDirectlyToScope: true,
              initialUnitStructureMethod: safeMethod,
            },
          })
        );
        return;
      }
      if (onEditSubject && subjectData?.subject) onEditSubject(subjectData.subject);
    },
    [subjectData, subjectPlanYearId, subjectPlanYearIdFromEvents, assignedChildren, onEditSubject]
  );
  const openSubjectUnitsEditor = useCallback(() => {
    const sourceToMethod = {
      manual: 'manual',
      plain_text_parsed: 'paste_plain',
      ai_generated: 'generate',
      upload: 'upload',
      link: 'upload',
    };
    const inferredMethod = sourceToMethod[String(learningGoalsSource || '').trim().toLowerCase()] || 'manual';
    openSubjectUnitsEditorForMethod(inferredMethod);
  }, [learningGoalsSource, openSubjectUnitsEditorForMethod]);

  useEffect(() => {
    if (!initialOpenMaterialId) return;
    if (!subjectId) return;
    const key = `${subjectId}:${initialOpenMaterialId}`;
    if (autoOpenedMaterialKeyRef.current === key) return;
    const matched = materials.find((material) => String(material?.id) === String(initialOpenMaterialId));
    if (!matched) return;
    autoOpenedMaterialKeyRef.current = key;
    setHighlightedMaterialId(String(initialOpenMaterialId));
    if (materialHighlightTimeoutRef.current) {
      clearTimeout(materialHighlightTimeoutRef.current);
    }
    materialHighlightTimeoutRef.current = setTimeout(() => {
      setHighlightedMaterialId(null);
      materialHighlightTimeoutRef.current = null;
    }, 2200);
    scrollToSection('materials-section');
    const t = setTimeout(() => {
      handleMaterialChipPress(matched);
    }, 260);
    return () => clearTimeout(t);
  }, [initialOpenMaterialId, subjectId, materials, scrollToSection, handleMaterialChipPress]);

  const openAddMaterialModal = useCallback(() => {
    if (!subject?.id || Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('openAddMaterialModal', {
        detail: {
          subjectId: subject.id,
          subjectName: subject.name || null,
          childIds: assignedChildren,
          role: null,
        },
      })
    );
  }, [subject?.id, subject?.name, assignedChildren]);

  const handleDeleteMaterial = useCallback(async (material) => {
    if (!material?.id) return;
    const itemName = material.title || material.provider_name || 'this attachment';
    const confirmed = Platform.OS === 'web' && typeof window !== 'undefined'
      ? window.confirm(`Delete "${itemName}"?`)
      : true;
    if (!confirmed) return;
    try {
      await archiveMaterial(material.id, familyId);
      toast.push(`${itemName} deleted`, 'success');
      await loadSubjectDetail({ silent: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }
    } catch (err) {
      toast.push(err?.message || `Failed to delete ${itemName}`, 'error');
    }
  }, [familyId, loadSubjectDetail, toast]);

  const handleOpenInNewTab = useCallback(async (material) => {
    try {
      const { getMaterial } = await import('../../lib/services/materialsClient');
      const freshMaterial = await getMaterial(material.id);
      if (freshMaterial?.storage_path) {
        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from('evidence')
          .createSignedUrl(freshMaterial.storage_path, 3600);
        if (signedError || !signedUrlData?.signedUrl) {
          toast.push('Unable to open this attachment in a new tab.', 'error');
          return;
        }
        window.open(signedUrlData.signedUrl, '_blank');
        return;
      }
      if (freshMaterial?.provider_url) {
        window.open(freshMaterial.provider_url, '_blank');
        return;
      }
      toast.push('This attachment does not have a URL to open.', 'info');
    } catch (_) {
      toast.push('Unable to open attachment in a new tab.', 'error');
    }
  }, [toast]);

  const handleCreateAssignmentFromMaterial = useCallback((material) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !material?.id) return;
    window.dispatchEvent(
      new CustomEvent('openTaskModal', {
        detail: {
          date: new Date(),
          eventType: 'Assignment',
          subjectId: subject?.id || null,
          materialId: material.id,
          childIds: assignedChildren,
        },
      })
    );
  }, [subject?.id, assignedChildren]);

  const showMaterialContextMenu = useCallback((material, clientX, clientY) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const existingMenu = document.getElementById(materialContextMenuIdRef.current);
    if (existingMenu) existingMenu.remove();
    const menuItems = [
      { text: 'Attachment details', action: () => setViewingMaterial(material), icon: FileText },
      { text: 'Edit attachment details', action: () => setEditingMaterial(material), icon: Edit2 },
      { text: 'Create assignment from material', action: () => handleCreateAssignmentFromMaterial(material), icon: FileText },
      { text: 'Open in new tab', action: () => handleOpenInNewTab(material), icon: ExternalLink },
      { text: 'Delete', action: () => handleDeleteMaterial(material), icon: Trash2, isDelete: true },
    ];
    const iconPathFor = (icon) => {
      if (icon === FileText) return 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8';
      if (icon === Edit2) return 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z';
      if (icon === ExternalLink) return 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3';
      if (icon === Trash2) return 'M3 6h18 M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6 M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2';
      return '';
    };
    const menu = document.createElement('div');
    menu.id = materialContextMenuIdRef.current;
    const estimatedMenuHeight = menuItems.length * 48 + 16;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 0;
    let menuTop = clientY;
    if (windowHeight && clientY + estimatedMenuHeight > windowHeight) {
      menuTop = clientY - estimatedMenuHeight;
      if (menuTop < 0) menuTop = 8;
    }
    const estimatedMenuWidth = 200;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
    let menuLeft = clientX;
    if (windowWidth && clientX + estimatedMenuWidth > windowWidth) {
      menuLeft = clientX - estimatedMenuWidth;
      if (menuLeft < 0) menuLeft = 8;
    }
    menu.style.cssText = `
      position: fixed;
      top: ${menuTop}px;
      left: ${menuLeft}px;
      background-color: #ffffff;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
      z-index: 999999;
      min-width: 200px;
      padding: 8px 0;
      font-family: "League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;
    menuItems.forEach((menuItem, index) => {
      const row = document.createElement('div');
      row.style.cssText = `
        padding: 16px 24px;
        color: ${menuItem.isDelete ? '#dc2626' : '#374151'};
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        border-bottom: ${index < menuItems.length - 1 ? '1px solid #f3f4f6' : 'none'};
        display: flex;
        align-items: center;
        gap: 12px;
      `;
      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = menuItem.isDelete ? '#fef2f2' : '#f8fafc';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = 'transparent';
      });
      const iconContainer = document.createElement('div');
      iconContainer.style.cssText = 'display:flex;align-items:center;justify-content:center;flex-shrink:0;width:16px;height:16px;';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', '16');
      svg.setAttribute('height', '16');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', menuItem.isDelete ? '#dc2626' : '#374151');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', iconPathFor(menuItem.icon));
      svg.appendChild(path);
      iconContainer.appendChild(svg);
      const textNode = document.createElement('span');
      textNode.textContent = menuItem.text;
      row.appendChild(iconContainer);
      row.appendChild(textNode);
      row.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const activeMenu = document.getElementById(materialContextMenuIdRef.current);
        if (activeMenu) activeMenu.remove();
        setTimeout(() => menuItem.action(), 10);
      });
      menu.appendChild(row);
    });
    document.body.appendChild(menu);
    const closeMenu = (event) => {
      const activeMenu = document.getElementById(materialContextMenuIdRef.current);
      if (!activeMenu) return;
      if (!activeMenu.contains(event.target)) {
        activeMenu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('mousedown', closeMenu, true);
        document.removeEventListener('contextmenu', closeMenu, true);
      }
    };
    document.addEventListener('click', closeMenu);
    document.addEventListener('mousedown', closeMenu, true);
    document.addEventListener('contextmenu', closeMenu, true);
  }, [handleDeleteMaterial, handleOpenInNewTab, handleCreateAssignmentFromMaterial]);

  useEffect(() => {
    if (!familyId || !subject?.id) {
      setSubjectPlanYearId(null);
      setSubjectPlanData(null);
      return;
    }
    const cached = getSubjectProgressCache(familyId, subject.id);
    const nextPlanYearId = cached?.academicYearId || subjectPlanYearIdFromEvents || null;
    setSubjectPlanYearId(nextPlanYearId);
    setSubjectPlanData(cached?.planData || null);
  }, [familyId, subject?.id, subjectPlanYearIdFromEvents]);

  useEffect(() => {
    if (!familyId || !subject?.id) return;
    let cancelled = false;
    const hydratePlanData = async () => {
      const cached = getSubjectProgressCache(familyId, subject.id);
      if (cached?.planData) {
        setSubjectPlanData(cached.planData);
        return;
      }
      if (!subjectPlanYearId && !subjectPlanYearIdFromEvents) {
        setSubjectPlanData(null);
        return;
      }
      try {
        const fetched = await findAcademicYearPlanForSubject(familyId, subject.id);
        if (cancelled) return;
        setSubjectPlanData(fetched?.planData || null);
      } catch (_) {
        if (!cancelled) setSubjectPlanData(null);
      }
    };
    hydratePlanData();
    return () => {
      cancelled = true;
    };
  }, [familyId, subject?.id, subjectPlanYearId, subjectPlanYearIdFromEvents]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onCacheUpdate = (e) => {
      const { familyId: fid, subjectId: sid } = e.detail || {};
      if (String(fid) !== String(familyId) || String(sid) !== String(subject?.id)) return;
      const cached = getSubjectProgressCache(familyId, subject.id);
      setSubjectPlanYearId(cached?.academicYearId || subjectPlanYearIdFromEvents || null);
      setSubjectPlanData(cached?.planData || null);
    };
    window.addEventListener('subjectProgressPlanCacheUpdated', onCacheUpdate);
    return () => window.removeEventListener('subjectProgressPlanCacheUpdated', onCacheUpdate);
  }, [familyId, subject?.id, subjectPlanYearIdFromEvents]);

  const handleOpenPlanBuilder = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !subject?.id) return;
    if (openingPlanBuilderRef.current) return;
    openingPlanBuilderRef.current = true;
    let resolvedPlanYearId = subjectPlanYearId;
    try {
      if (!resolvedPlanYearId) {
        const cached = getSubjectProgressCache(familyId, subject.id);
        resolvedPlanYearId = cached?.academicYearId || subjectPlanYearIdFromEvents || null;
      }
      if (resolvedPlanYearId) {
        window.dispatchEvent(
          new CustomEvent('openPlanYearModal', {
            detail: {
              from: 'subject_detail',
              subjectId: subject.id,
              subjectName: subject.name || null,
              schoolYear: subject.school_year || null,
              schoolTerm: subject.school_term || null,
              childIds: assignedChildren,
              academicYearId: resolvedPlanYearId,
              openAsModal: true,
              openToEditList: false,
              skipPlanSummary: true,
            },
          })
        );
        return;
      }
      // Open immediately for new-plan flow if we don't already have a resolved plan id.
      window.dispatchEvent(
        new CustomEvent('openPlanYearModal', {
          detail: {
            from: 'subject_detail',
            subjectId: subject.id,
            subjectName: subject.name || null,
            schoolYear: subject.school_year || null,
            schoolTerm: subject.school_term || null,
            childIds: assignedChildren,
            openAsModal: true,
            openDirectlyToScope: true,
          },
        })
      );
    } finally {
      openingPlanBuilderRef.current = false;
    }
  }, [subject?.id, subject?.name, assignedChildren, subjectPlanYearId, subjectPlanYearIdFromEvents, familyId]);
  const planButtonLabel = subjectPlanYearId ? 'Edit plan' : 'Create Plan';

  const attendanceRecordsForUI = useMemo(() => {
    const base = Array.isArray(attendanceRecords) ? attendanceRecords : [];
    const byEvent = new Set(base.map((r) => String(r?.event_id || '')).filter(Boolean));
    const nowMs = Date.now();
    const thirtyDaysAgoMs = nowMs - (30 * 24 * 60 * 60 * 1000);
    const fallback = [];

    for (const ev of subjectEvents) {
      if (!ev || String(ev.status || '').toLowerCase() !== 'done') continue;
      const eventId = String(ev.id || '');
      if (!eventId || byEvent.has(eventId)) continue;
      const tsRaw = ev.start_ts || ev.end_ts || ev.due_ts;
      const t = tsRaw ? new Date(tsRaw).getTime() : NaN;
      if (!Number.isFinite(t) || t < thirtyDaysAgoMs || t > nowMs) continue;
      const startTs = ev.start_ts ? new Date(ev.start_ts).getTime() : NaN;
      const endTs = ev.end_ts ? new Date(ev.end_ts).getTime() : NaN;
      const minutes =
        Number.isFinite(startTs) && Number.isFinite(endTs)
          ? Math.max(1, Math.round((endTs - startTs) / 60000))
          : 60;
      fallback.push({
        id: `fallback-attendance-${eventId}`,
        event_id: ev.id,
        child_id: ev.child_id || null,
        day_date: new Date(t).toISOString().split('T')[0],
        minutes,
        status: 'present',
        created_at: ev.updated_at || ev.end_ts || ev.start_ts || null,
      });
    }

    return [...base, ...fallback].sort((a, b) => {
      const aTs = a?.day_date ? new Date(`${a.day_date}T00:00:00`).getTime() : 0;
      const bTs = b?.day_date ? new Date(`${b.day_date}T00:00:00`).getTime() : 0;
      return bTs - aTs;
    });
  }, [attendanceRecords, subjectEvents]);

  // Process attendance at day-level so attendance chips align with day-based targets.
  const attendance30Days = useMemo(() => {
    const byDay = new Map();
    attendanceRecordsForUI.forEach((record) => {
      const dayKey = String(record?.day_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
      const status = String(record?.status || '').toLowerCase();
      if (!byDay.has(dayKey)) {
        byDay.set(dayKey, { hasPresent: false, hasAbsent: false });
      }
      const bucket = byDay.get(dayKey);
      if (status === 'present') bucket.hasPresent = true;
      if (status === 'absent') bucket.hasAbsent = true;
    });

    let present = 0;
    let absent = 0;
    byDay.forEach((bucket) => {
      // A day with any "present" counts as present for day-level progress.
      if (bucket.hasPresent) present += 1;
      else if (bucket.hasAbsent) absent += 1;
    });
    return { present, absent, total: byDay.size };
  }, [attendanceRecordsForUI]);
  const attendanceRate30Display = useMemo(() => {
    if (attendanceRate30 !== null && attendanceRate30 !== undefined && !isNaN(attendanceRate30)) {
      return attendanceRate30;
    }
    if (attendance30Days.total > 0) {
      return Math.round((attendance30Days.present / attendance30Days.total) * 100);
    }
    return null;
  }, [attendanceRate30, attendance30Days]);

  // List view should show one row per event/date (ignore child-level duplicate records).
  const attendanceRecordsListUI = useMemo(() => {
    const seen = new Set();
    const rows = [];
    for (const record of attendanceRecordsForUI) {
      const eventId = String(record?.event_id || '').trim();
      const dayKey = String(record?.day_date || '').slice(0, 10);
      const dedupeKey = eventId ? `ev:${eventId}|${dayKey}` : `row:${String(record?.id || '')}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      rows.push(record);
    }
    return rows;
  }, [attendanceRecordsForUI]);

  const attendanceTargetProgress = useMemo(() => {
    const sid = String(subject?.id || '').trim();
    if (!sid) return null;
    const plan = subjectPlanData?.plan || {};
    const subjectTargetsRaw =
      plan?.subject_targets && typeof plan.subject_targets === 'object' && !Array.isArray(plan.subject_targets)
        ? plan.subject_targets
        : plan?.subject_targets_override && typeof plan.subject_targets_override === 'object' && !Array.isArray(plan.subject_targets_override)
          ? plan.subject_targets_override
          : null;
    const subjectTargetEntry =
      subjectTargetsRaw && typeof subjectTargetsRaw[sid] === 'object' ? subjectTargetsRaw[sid] : null;
    const subjectMode = String(subject?.default_constraint_mode || '').trim().toLowerCase();
    const subjectDays = parsePositiveInt(subject?.default_target_days);
    const subjectHours = parsePositiveFloat(subject?.default_target_hours);
    const settingsMode = String(subjectPlanData?.settings?.default_constraint_mode || '').trim().toLowerCase();
    const settingsDays = parsePositiveInt(subjectPlanData?.settings?.default_target_days);
    const settingsHours = parsePositiveFloat(subjectPlanData?.settings?.default_target_hours);
    const planMode = String(plan?.constraint_mode || '').trim().toLowerCase();
    const planDays = parsePositiveInt(plan?.target_days);
    const planHours = parsePositiveFloat(plan?.target_hours);

    let target = null;
    if (subjectTargetEntry) {
      const days = parsePositiveInt(subjectTargetEntry?.target_days);
      const hours = parsePositiveFloat(subjectTargetEntry?.target_hours);
      if (days != null || hours != null) {
        target = {
          mode: days != null ? 'days' : 'hours',
          value: days != null ? days : hours,
          source: 'subject_plan_target',
        };
      }
    }
    if (!target) {
      if (subjectMode === 'days' && subjectDays != null) target = { mode: 'days', value: subjectDays, source: 'subject_defaults' };
      else if (subjectMode === 'hours' && subjectHours != null) target = { mode: 'hours', value: subjectHours, source: 'subject_defaults' };
      else if (subjectDays != null && subjectHours == null) target = { mode: 'days', value: subjectDays, source: 'subject_defaults' };
      else if (subjectHours != null && subjectDays == null) target = { mode: 'hours', value: subjectHours, source: 'subject_defaults' };
    }
    if (!target) {
      if (settingsMode === 'days' && settingsDays != null) target = { mode: 'days', value: settingsDays, source: 'plan_settings' };
      else if (settingsMode === 'hours' && settingsHours != null) target = { mode: 'hours', value: settingsHours, source: 'plan_settings' };
      else if (settingsDays != null && settingsHours == null) target = { mode: 'days', value: settingsDays, source: 'plan_settings' };
      else if (settingsHours != null && settingsDays == null) target = { mode: 'hours', value: settingsHours, source: 'plan_settings' };
    }
    if (!target) {
      if (planMode === 'days' && planDays != null) target = { mode: 'days', value: planDays, source: 'plan_level' };
      else if (planMode === 'hours' && planHours != null) target = { mode: 'hours', value: planHours, source: 'plan_level' };
      else if (planDays != null && planHours == null) target = { mode: 'days', value: planDays, source: 'plan_level' };
      else if (planHours != null && planDays == null) target = { mode: 'hours', value: planHours, source: 'plan_level' };
    }
    if (!target || !Number.isFinite(Number(target.value)) || Number(target.value) <= 0) return null;

    const presentRecords = attendanceRecordsForUI.filter((record) => String(record?.status || '').toLowerCase() === 'present');
    const presentDaySet = new Set(
      presentRecords
        .map((record) => String(record?.day_date || '').slice(0, 10))
        .filter((ymd) => /^\d{4}-\d{2}-\d{2}$/.test(ymd))
    );
    const minutesByEventDay = new Map();
    presentRecords.forEach((record) => {
      const dayKey = String(record?.day_date || '').slice(0, 10);
      if (!dayKey) return;
      const eventKey = record?.event_id != null && String(record.event_id).trim()
        ? `ev:${String(record.event_id)}|${dayKey}`
        : `day:${dayKey}`;
      const mins = Number(record?.minutes);
      const nextMins = Number.isFinite(mins) && mins > 0 ? mins : 0;
      const prev = minutesByEventDay.get(eventKey) || 0;
      minutesByEventDay.set(eventKey, Math.max(prev, nextMins));
    });
    const actualDays = presentDaySet.size;
    const actualHours = Number(
      ([...minutesByEventDay.values()].reduce((sum, mins) => sum + mins, 0) / 60).toFixed(1)
    );
    const scheduledDaySet = new Set(
      (subjectEvents || [])
        .map((event) => {
          const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
          return raw ? String(raw).slice(0, 10) : null;
        })
        .filter((ymd) => /^\d{4}-\d{2}-\d{2}$/.test(String(ymd || '')))
    );
    const scheduledDays = scheduledDaySet.size;
    let unattendedScheduledDays = 0;
    scheduledDaySet.forEach((dayKey) => {
      if (!presentDaySet.has(dayKey)) unattendedScheduledDays += 1;
    });

    const actual = target.mode === 'days' ? actualDays : actualHours;
    const delta = Number((actual - target.value).toFixed(1));
    const remaining = Math.max(0, Number((target.value - actual).toFixed(1)));
    const percent = Math.min(999, Math.round((actual / target.value) * 100));
    const met = actual >= target.value;
    const sourceLabel = target.source === 'subject_plan_target'
      ? 'subject plan target'
      : target.source === 'subject_defaults'
        ? 'subject planning preferences'
        : target.source === 'plan_settings'
          ? 'plan preferences'
          : 'plan target';
    return {
      mode: target.mode,
      target: target.value,
      actual,
      delta,
      remaining,
      percent,
      met,
      sourceLabel,
      attendedDays: actualDays,
      scheduledDays,
      unattendedScheduledDays,
    };
  }, [subject, subjectPlanData, attendanceRecordsForUI, subjectEvents]);

  // Process graded items
  const gradedItems = useMemo(() => {
    const items = [
      ...grades.map(g => {
        let percent = null;
        if (g.score !== null && g.score !== undefined && g.possible !== null && g.possible !== undefined && g.possible > 0) {
          percent = Math.round((g.score / g.possible) * 100);
        } else if (g.score !== null && g.score !== undefined) {
          const score = typeof g.score === 'number' ? g.score : parseFloat(g.score);
          if (!isNaN(score) && score >= 0 && score <= 100) {
            percent = score;
          }
        }
        return {
          id: `grade-${g.id}`,
          name: `Grade ${g.id.slice(0, 8)}`,
          date: g.created_at,
          score: g.score,
          possible: g.possible,
          grade: g.grade,
          percent,
        };
      }),
      ...eventOutcomes.filter(eo => eo.grade).map(eo => {
        const event = (subjectData?.events || []).find(e => e.id === eo.event_id);
        // Convert grade to percentage if possible
        const gradeMap = {
          'A+': 98, 'A': 95, 'A-': 92,
          'B+': 87, 'B': 85, 'B-': 82,
          'C+': 77, 'C': 75, 'C-': 72,
          'D+': 67, 'D': 65, 'D-': 62,
          'F': 50,
        };
        const percent = gradeMap[eo.grade] || null;
        return {
          id: `outcome-${eo.id}`,
          eventId: eo.event_id,
          event: event || null,
          name: event?.title || 'Assessment',
          date: eo.created_at,
          score: null,
          possible: null,
          grade: eo.grade,
          percent,
        };
      }),
      ...(subjectData?.events || []).filter(e => e.grade).map(e => {
        const gradeMap = {
          'A+': 98, 'A': 95, 'A-': 92,
          'B+': 87, 'B': 85, 'B-': 82,
          'C+': 77, 'C': 75, 'C-': 72,
          'D+': 67, 'D': 65, 'D-': 62,
          'F': 50,
        };
        const percent = gradeMap[e.grade] || null;
        return {
          id: `event-${e.id}`,
          eventId: e.id,
          event: e,
          name: e.title,
          date: e.end_ts || e.start_ts,
          score: null,
          possible: null,
          grade: e.grade,
          percent,
        };
      }),
    ];
    return items.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 10);
  }, [grades, eventOutcomes, subjectData?.events]);

  /** Shown in Grades header: API aggregate when present, else average of percents on listed items. */
  const displayGradeAveragePercent = useMemo(() => {
    const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n))));
    if (avgGradePercent != null && Number.isFinite(Number(avgGradePercent))) {
      return clamp(avgGradePercent);
    }
    const withPct = gradedItems.filter((i) => i.percent != null && Number.isFinite(i.percent));
    if (withPct.length === 0) return null;
    const sum = withPct.reduce((s, i) => s + i.percent, 0);
    return clamp(sum / withPct.length);
  }, [avgGradePercent, gradedItems]);

  const assignmentAttentionByEventId = subjectData?.assignmentAttentionByEventId;
  const assignmentsNeedingHelp = subjectData?.assignmentsNeedingHelp || [];
  const assignmentsAssignedToStudent = subjectData?.assignmentsAssignedToStudent || [];
  const isParentViewer =
    session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true;

  const attendanceTargetGuidance = useMemo(() => {
    if (!attendanceTargetProgress || attendanceTargetProgress.mode !== 'days') return null;
    const remainingDays = Math.max(0, Number(attendanceTargetProgress.remaining) || 0);
    const unattended = Math.max(0, attendanceTargetProgress.unattendedScheduledDays || 0);
    const markPrevious = Math.min(remainingDays, unattended);
    const addDays = Math.max(0, remainingDays - markPrevious);
    return { markPrevious, addDays };
  }, [attendanceTargetProgress]);

  const attendanceTargetCard = attendanceTargetProgress ? (
    <View style={styles.attendanceTargetCard}>
      <Text style={styles.attendanceTargetTitle}>
        {subject?.name || 'This subject'}
        {' '}
        target is saved as {attendanceTargetProgress.target}
        {attendanceTargetProgress.mode === 'days' ? ' class day(s).' : ' hour(s).'}
      </Text>
      <Text style={styles.attendanceTargetValue}>
        {attendanceChildrenLabel}
        {' '}
        have attended {attendanceTargetProgress.mode === 'days' ? attendanceTargetProgress.attendedDays : attendanceTargetProgress.actual}
        {' '}
        {attendanceTargetProgress.mode === 'days' ? 'class day(s).' : 'hour(s).'}
      </Text>
      <Text style={styles.attendanceTargetHelper}>
        You have {attendanceTargetProgress.remaining}
        {attendanceTargetProgress.mode === 'days' ? ' day(s)' : ' hour(s)'} remaining to meet target.
        {attendanceTargetProgress.mode === 'days'
          ? ` ${attendanceTargetProgress.scheduledDays} day(s) are scheduled. ${attendanceTargetProgress.unattendedScheduledDays} day(s) are unattended.`
          : ''}
      </Text>
      {attendanceTargetGuidance ? (
        <Text style={styles.attendanceTargetHelper}>
          Either mark {attendanceTargetGuidance.markPrevious} previous class day(s) attended, or add {attendanceTargetGuidance.addDays} class day(s) to meet target.
        </Text>
      ) : (
        <Text style={styles.attendanceTargetHelper}>
          {attendanceTargetProgress.met
            ? `Met target by ${Math.abs(attendanceTargetProgress.delta)}${attendanceTargetProgress.mode === 'days' ? ' day(s)' : ' hour(s)'}.`
            : ''}
        </Text>
      )}
    </View>
  ) : null;

  const openAssignedWorkItem = useCallback((a) => {
    if (!a) return;
    const eid = firstLinkedEventId(a.linked_event_ids);
    if (eid && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: { eventId: eid, initialEvent: null, parentEventFocus: null },
        })
      );
      return;
    }
    setAssignedDetailAssignment(a);
  }, []);

  const handleOpenAssignedFromModal = useCallback(
    (a) => {
      setShowAssignedToStudentModal(false);
      openAssignedWorkItem(a);
    },
    [openAssignedWorkItem],
  );

  const handleExportHover = useCallback((key, isEnter, event) => {
    if (Platform.OS !== 'web') return;
    if (isEnter) {
      setExportTooltipKey(key);
      const node = event?.currentTarget || event?.target;
      if (node && typeof node.getBoundingClientRect === 'function') {
        const rect = node.getBoundingClientRect();
        setExportTooltipPos({ x: rect.left + rect.width / 2, y: rect.bottom });
      }
    } else {
      setExportTooltipKey(null);
    }
  }, []);

  const hasGradesAttention = useMemo(() => {
    if (!isParentViewer || !assignmentAttentionByEventId) return false;
    return gradedItems.some((item) => {
      if (!item.eventId) return false;
      const a = assignmentAttentionByEventId[item.eventId];
      return a && (a.needHelp || a.needsSubmissionReview);
    });
  }, [isParentViewer, gradedItems, assignmentAttentionByEventId]);

  const handleOpenEventDetails = useCallback((eventId, initialEvent) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openEventModal', {
        detail: { eventId, initialEvent: initialEvent || null },
      }));
    }
  }, []);

  const getEventDateKey = useCallback((event) => {
    const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
    if (!raw) return null;
    return String(raw).slice(0, 10);
  }, []);

  const subjectEventDateKeys = useMemo(() => {
    const keys = new Set();
    (subjectEvents || []).forEach((event) => {
      const key = getEventDateKey(event);
      if (DATE_KEY_RE.test(String(key || ''))) keys.add(String(key));
    });
    return keys;
  }, [subjectEvents, getEventDateKey]);

  const attendanceRecordDateKeys = useMemo(() => {
    const keys = new Set();
    (attendanceRecordsForUI || []).forEach((record) => {
      const key = String(record?.day_date || '').slice(0, 10);
      if (DATE_KEY_RE.test(key)) keys.add(key);
    });
    return keys;
  }, [attendanceRecordsForUI]);

  const isPlanScheduledDateKey = useCallback((dateKey) => {
    const key = String(dateKey || '').slice(0, 10);
    if (!DATE_KEY_RE.test(key)) return false;
    if (!subjectPlanBlocks.length) return false;
    const d = new Date(`${key}T12:00:00`);
    if (Number.isNaN(d.getTime())) return false;
    const weekday = d.getDay();
    return subjectPlanBlocks.some((block) => {
      const weekdays = parseWeekdaysFromPlanBlock(block);
      if (!weekdays.includes(weekday)) return false;
      return isDateWithinPlanBlockRange(key, block);
    });
  }, [subjectPlanBlocks]);

  const canMarkAttendanceForDateKey = useCallback((dateKey) => {
    const key = String(dateKey || '').slice(0, 10);
    if (!DATE_KEY_RE.test(key)) return false;
    if (subjectEventDateKeys.has(key)) return true;
    if (isPlanScheduledDateKey(key)) return true;
    // Keep anomalous historical rows editable so users can clear legacy mismatches.
    return attendanceRecordDateKeys.has(key);
  }, [subjectEventDateKeys, isPlanScheduledDateKey, attendanceRecordDateKeys]);

  const getEventMinutes = useCallback((event) => {
    if (event?.duration_minutes != null) return Number(event.duration_minutes) || 0;
    const start = event?.start_ts || event?.start || event?.start_local;
    const end = event?.end_ts || event?.end || event?.end_local;
    if (start && end) {
      const mins = Math.round((new Date(end) - new Date(start)) / 60000);
      return Number.isFinite(mins) && mins > 0 ? mins : 0;
    }
    return 0;
  }, []);

  const getChildIdsForEvent = useCallback((event) => {
    const ids = Array.isArray(event?.child_ids) && event.child_ids.length > 0
      ? event.child_ids
      : (event?.child_id ? [event.child_id] : []);
    return [...new Set(ids.map((id) => String(id)).filter(Boolean))];
  }, []);

  const getSiblingEventsOnDay = useCallback((dateKey, event, eventsList) => {
    if (!dateKey || !event) return [event].filter(Boolean);
    const targetDate = String(dateKey).slice(0, 10);
    const blockId = event?.source_block_id || null;
    return (eventsList || []).filter((ev) => {
      const evDate = getEventDateKey(ev);
      if (evDate !== targetDate) return false;
      if (blockId) return ev?.source_block_id === blockId;
      return String(ev?.id) === String(event?.id);
    });
  }, [getEventDateKey]);

  const resolveChildIdsForAttendanceEvent = useCallback((event) => {
    const ids = getChildIdsForEvent(event);
    if (ids.length > 0) return ids;
    return [...new Set((assignedChildren || []).map((id) => String(id)).filter(Boolean))];
  }, [getChildIdsForEvent, assignedChildren]);

  const runAttendanceMutation = useCallback(async (operation, label) => {
    const result = await operation;
    if (result?.error) {
      throw (result.error instanceof Error ? result.error : new Error(result.error?.message || `${label} failed`));
    }
    return result?.data ?? null;
  }, []);

  const runEventStatusBestEffort = useCallback(async (eventId, status) => {
    // Disabled intentionally for attendance toggles: backend status endpoints are currently unstable
    // and should not block or add noise to attendance interactions.
    return null;
  }, []);

  const applyOptimisticProgressByEventIds = useCallback((eventIds = [], markPresent = true) => {
    const normalizedIds = [...new Set((eventIds || []).map((id) => String(id || '')).filter(Boolean))];
    if (normalizedIds.length === 0) return;
    const idSet = new Set(normalizedIds);
    setSubjectData((prev) => {
      if (!prev) return prev;
      const baseAttendance = Array.isArray(prev.attendanceRecords) ? prev.attendanceRecords : [];
      const nextAttendance = markPresent
        ? (() => {
            const mapped = baseAttendance.map((record) => {
              const recordEventId = String(record?.event_id || '');
              if (!recordEventId || !idSet.has(recordEventId)) return record;
              if (isAttendancePresentLike(record?.status)) return record;
              return { ...record, status: 'present' };
            });
            const presentEventIds = new Set(
              mapped
                .filter((record) => isAttendancePresentLike(record?.status))
                .map((record) => String(record?.event_id || ''))
                .filter(Boolean)
            );
            normalizedIds.forEach((eventId) => {
              if (presentEventIds.has(eventId)) return;
              mapped.push({
                id: `optimistic-progress-${eventId}`,
                event_id: eventId,
                status: 'present',
              });
            });
            return mapped;
          })()
        : baseAttendance.map((record) => {
            const recordEventId = String(record?.event_id || '');
            if (!recordEventId || !idSet.has(recordEventId)) return record;
            if (!isAttendancePresentLike(record?.status)) return record;
            return { ...record, status: 'absent' };
          });
      const nextProgress = computeProgressPercentFromEventsAndAttendance(prev.events || [], nextAttendance);
      const nextData = {
        ...prev,
        attendanceRecords: nextAttendance,
        progressPercent: nextProgress,
      };
      if (onSubjectDataUpdateRef.current) {
        onSubjectDataUpdateRef.current(nextData);
      }
      return nextData;
    });
  }, []);

  const handleToggleEventAttendanceForDate = useCallback(async (dateKey, eventId) => {
    if (!familyId || !dateKey || !eventId) return;
    const normKey = String(dateKey).slice(0, 10);
    const event = (subjectEvents || []).find((e) => String(e?.id) === String(eventId));
    if (!event) return;

    const dayRecordsForEvent = attendanceRecords.filter(
      (r) => String(r?.event_id || '') === String(eventId) && String(r?.day_date || '').slice(0, 10) === normKey
    );
    const uiDayRecordsForEvent = attendanceRecordsForUI.filter(
      (r) => String(r?.event_id || '') === String(eventId) && String(r?.day_date || '').slice(0, 10) === normKey
    );
    const isMarkedPresent = uiDayRecordsForEvent.some((r) => String(r?.status || '').toLowerCase() === 'present');

    try {
      if (isMarkedPresent) {
        const assignedIds = resolveChildIdsForAttendanceEvent(event);
        const isShared = assignedIds.length > 1;
        const minutes = getEventMinutes(event);
        if (isShared && dayRecordsForEvent.length > 0) {
          await Promise.all(dayRecordsForEvent.map((record) => runAttendanceMutation(
            updateAttendanceLog(record.id, { status: 'absent', minutes }),
            'update attendance'
          )));
        } else if (dayRecordsForEvent.length > 0) {
          await Promise.all(dayRecordsForEvent.map((record) => runAttendanceMutation(
            deleteAttendanceLog(record.id),
            'delete attendance'
          )));
          await runEventStatusBestEffort(event.id, 'scheduled');
        } else if (assignedIds.length > 0) {
          await Promise.all(assignedIds.map((childId) => runAttendanceMutation(
            createAttendanceLog({
              family_id: familyId,
              child_id: String(childId),
              event_id: event.id,
              day_date: normKey,
              status: 'absent',
              minutes,
            }),
            'create attendance'
          )));
        }
        applyOptimisticProgressByEventIds([event.id], false);
      } else {
        const siblings = getSiblingEventsOnDay(normKey, event, subjectEvents || []);
        const siblingIds = [];
        for (const sibling of siblings) {
          if (sibling?.id) siblingIds.push(sibling.id);
          const childIds = resolveChildIdsForAttendanceEvent(sibling);
          if (!childIds.length) continue;
          const minutes = getEventMinutes(sibling);
          const upserts = childIds.map((childId) => {
            const existing = attendanceRecords.find(
              (r) =>
                String(r?.event_id || '') === String(sibling?.id)
                && String(r?.child_id || '') === String(childId)
                && String(r?.day_date || '').slice(0, 10) === normKey
            );
            if (existing) {
              return runAttendanceMutation(
                updateAttendanceLog(existing.id, { status: 'present', minutes }),
                'update attendance'
              );
            }
            return runAttendanceMutation(
              createAttendanceLog({
                family_id: familyId,
                child_id: String(childId),
                event_id: sibling.id,
                day_date: normKey,
                status: 'present',
                minutes,
              }),
              'create attendance'
            );
          });
          await Promise.all(upserts);
          await runEventStatusBestEffort(sibling.id, 'done');
        }
        applyOptimisticProgressByEventIds(siblingIds, true);
      }
      await loadSubjectDetail({ silent: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }
    } catch (err) {
      console.warn('[SubjectDetailPage] Failed toggling event attendance:', err);
      toast.push(err?.message || 'Could not update attendance.', 'error');
      await loadSubjectDetail({ silent: true });
    }
  }, [
    familyId,
    subjectEvents,
    attendanceRecords,
    attendanceRecordsForUI,
    resolveChildIdsForAttendanceEvent,
    getEventMinutes,
    getSiblingEventsOnDay,
    runAttendanceMutation,
    runEventStatusBestEffort,
    applyOptimisticProgressByEventIds,
    loadSubjectDetail,
    toast,
  ]);

  const handleMarkAllAttendedForDate = useCallback(async (dateKey) => {
    if (!familyId || !dateKey) return;
    const normKey = String(dateKey).slice(0, 10);
    const dayEvents = (subjectEvents || []).filter((event) => getEventDateKey(event) === normKey);
    if (!dayEvents.length) return;
    try {
      const dayEventIds = [];
      for (const event of dayEvents) {
        if (event?.id) dayEventIds.push(event.id);
        const childIds = resolveChildIdsForAttendanceEvent(event);
        if (!childIds.length) continue;
        const minutes = getEventMinutes(event);
        const upserts = childIds.map((childId) => {
          const existing = attendanceRecords.find(
            (r) =>
              String(r?.event_id || '') === String(event?.id)
              && String(r?.child_id || '') === String(childId)
              && String(r?.day_date || '').slice(0, 10) === normKey
          );
          if (existing) {
            return runAttendanceMutation(
              updateAttendanceLog(existing.id, { status: 'present', minutes }),
              'update attendance'
            );
          }
          return runAttendanceMutation(
            createAttendanceLog({
              family_id: familyId,
              child_id: String(childId),
              event_id: event.id,
              day_date: normKey,
              status: 'present',
              minutes,
            }),
            'create attendance'
          );
        });
        await Promise.all(upserts);
        await runEventStatusBestEffort(event.id, 'done');
      }
      applyOptimisticProgressByEventIds(dayEventIds, true);
      await loadSubjectDetail({ silent: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }
    } catch (err) {
      console.warn('[SubjectDetailPage] Failed marking day attended:', err);
      toast.push(err?.message || 'Could not mark day attended.', 'error');
      await loadSubjectDetail({ silent: true });
    }
  }, [familyId, subjectEvents, getEventDateKey, resolveChildIdsForAttendanceEvent, getEventMinutes, attendanceRecords, runAttendanceMutation, runEventStatusBestEffort, applyOptimisticProgressByEventIds, loadSubjectDetail, toast]);

  const handleYearHeatmapDayPress = useCallback(async (dateKey) => {
    if (!familyId || !dateKey) return;
    const normKey = String(dateKey).slice(0, 10);
    if (!canMarkAttendanceForDateKey(normKey)) {
      toast.push('Attendance can only be marked on scheduled subject days.', 'error');
      return;
    }
    const dayRecords = attendanceRecords.filter((record) => String(record?.day_date || '').slice(0, 10) === normKey);
    const uiDayRecords = attendanceRecordsForUI.filter((record) => String(record?.day_date || '').slice(0, 10) === normKey);
    const dayEventsByDate = (subjectEvents || []).filter((event) => getEventDateKey(event) === normKey);
    const uiEventIds = new Set(
      uiDayRecords
        .map((record) => String(record?.event_id || '').trim())
        .filter(Boolean)
    );
    const dayEventsFromUI = (subjectEvents || []).filter((event) => uiEventIds.has(String(event?.id || '').trim()));
    const seenDayEventIds = new Set();
    const dayEvents = [...dayEventsByDate, ...dayEventsFromUI].filter((event) => {
      const id = String(event?.id || '').trim();
      if (!id || seenDayEventIds.has(id)) return false;
      seenDayEventIds.add(id);
      return true;
    });
    const hasPresent = uiDayRecords.some((record) => String(record?.status || '').toLowerCase() === 'present');
    const fallbackChildIds = [
      ...new Set([
        ...(assignedChildren || []).map((id) => String(id)),
        ...uiDayRecords.map((record) => String(record?.child_id || '').trim()),
        ...(children || []).map((child) => String(child?.id || '').trim()),
      ].filter(Boolean)),
    ];

    try {
      if (hasPresent) {
        const toggledEventIds = [];
        if (dayEvents.length > 0) {
          for (const event of dayEvents) {
            if (event?.id) toggledEventIds.push(event.id);
            const assignedIds = resolveChildIdsForAttendanceEvent(event);
            const eventRecords = dayRecords.filter((record) => String(record?.event_id || '') === String(event?.id));
            const isShared = assignedIds.length > 1;
            const minutes = getEventMinutes(event);
            if (eventRecords.length === 0 && assignedIds.length > 0) {
              await Promise.all(assignedIds.map((childId) => runAttendanceMutation(
                createAttendanceLog({
                  family_id: familyId,
                  child_id: String(childId),
                  event_id: event.id,
                  day_date: normKey,
                  status: 'absent',
                  minutes,
                }),
                'create attendance'
              )));
            } else if (isShared && eventRecords.length > 0) {
              await Promise.all(eventRecords.map((record) => runAttendanceMutation(
                updateAttendanceLog(record.id, { status: 'absent', minutes }),
                'update attendance'
              )));
            } else {
              await Promise.all(eventRecords.map((record) => runAttendanceMutation(
                deleteAttendanceLog(record.id),
                'delete attendance'
              )));
              await runEventStatusBestEffort(event.id, 'scheduled');
            }
          }
        }
        const standalone = dayRecords.filter((record) => record?.event_id == null);
        if (standalone.length > 0) {
          await Promise.all(standalone.map((record) => runAttendanceMutation(
            deleteAttendanceLog(record.id),
            'delete attendance'
          )));
        } else if (fallbackChildIds.length > 0) {
          await Promise.all(
            fallbackChildIds.map((childId) => runAttendanceMutation(
              createAttendanceLog({
                family_id: familyId,
                child_id: String(childId),
                event_id: null,
                day_date: normKey,
                status: 'absent',
                minutes: 60,
              }),
              'create attendance'
            ))
          );
        }
        applyOptimisticProgressByEventIds(toggledEventIds, false);
      } else {
        const toggledEventIds = [];
        if (dayEvents.length > 0) {
          const seenIds = new Set();
          const expandedEvents = [];
          dayEvents.forEach((event) => {
            getSiblingEventsOnDay(normKey, event, subjectEvents || []).forEach((sibling) => {
              if (sibling?.id != null && !seenIds.has(String(sibling.id))) {
                seenIds.add(String(sibling.id));
                expandedEvents.push(sibling);
              }
            });
          });
          expandedEvents.forEach((event) => {
            if (event?.id) toggledEventIds.push(event.id);
          });
          for (const event of expandedEvents) {
            const assignedIds = resolveChildIdsForAttendanceEvent(event);
            if (!assignedIds.length) continue;
            const minutes = getEventMinutes(event);
            const upserts = assignedIds.map((childId) => {
              const existing = attendanceRecords.find(
                (r) =>
                  String(r?.event_id || '') === String(event?.id)
                  && String(r?.child_id || '') === String(childId)
                  && String(r?.day_date || '').slice(0, 10) === normKey
              );
              if (existing) {
                return runAttendanceMutation(
                  updateAttendanceLog(existing.id, { status: 'present', minutes }),
                  'update attendance'
                );
              }
              return runAttendanceMutation(
                createAttendanceLog({
                  family_id: familyId,
                  child_id: String(childId),
                  event_id: event.id,
                  day_date: normKey,
                  status: 'present',
                  minutes,
                }),
                'create attendance'
              );
            });
            await Promise.all(upserts);
            await runEventStatusBestEffort(event.id, 'done');
          }
        } else if (fallbackChildIds.length > 0) {
          const standaloneByChild = new Map(
            dayRecords
              .filter((record) => record?.event_id == null)
              .map((record) => [String(record?.child_id || ''), record])
          );
          await Promise.all(
            fallbackChildIds.map((childId) => {
              const existing = standaloneByChild.get(childId);
              if (existing) {
                return runAttendanceMutation(
                  updateAttendanceLog(existing.id, { status: 'present', minutes: 60 }),
                  'update attendance'
                );
              }
              return runAttendanceMutation(
                createAttendanceLog({
                  family_id: familyId,
                  child_id: childId,
                  event_id: null,
                  day_date: normKey,
                  status: 'present',
                  minutes: 60,
                }),
                'create attendance'
              );
            })
          );
        }
        applyOptimisticProgressByEventIds(toggledEventIds, true);
      }
      await loadSubjectDetail({ silent: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects'));
      }
    } catch (err) {
      console.warn('[SubjectDetailPage] Failed toggling day attendance:', err);
      toast.push(err?.message || 'Could not update attendance for that day.', 'error');
      await loadSubjectDetail({ silent: true });
    }
  }, [
    familyId,
    subjectEvents,
    attendanceRecords,
    attendanceRecordsForUI,
    assignedChildren,
    children,
    getEventDateKey,
    canMarkAttendanceForDateKey,
    resolveChildIdsForAttendanceEvent,
    getEventMinutes,
    getSiblingEventsOnDay,
    runAttendanceMutation,
    runEventStatusBestEffort,
    applyOptimisticProgressByEventIds,
    loadSubjectDetail,
    toast,
  ]);

  const attendanceInsightsPanel = attendanceViewMode === 'year' || attendanceViewMode === 'month' ? (
    <View style={styles.attendanceInsightsPanelWrap}>
      {attendanceViewMode === 'year' ? (
        <SubjectAttendanceYearHeatmap
          attendanceRecords={attendanceRecordsForUI}
          subjectEvents={subjectData?.events || []}
          isDayMarkable={canMarkAttendanceForDateKey}
          onDayPress={handleYearHeatmapDayPress}
        />
      ) : attendanceViewMode === 'month' ? (
        <SubjectAttendanceMonthDrilldown
          attendanceRecords={attendanceRecordsForUI}
          subjectEvents={subjectData?.events || []}
          onOpenEventDetails={handleOpenEventDetails}
          onToggleEventAttendance={handleToggleEventAttendanceForDate}
          onMarkAllAttendedDay={handleMarkAllAttendedForDate}
        />
      ) : null}
    </View>
  ) : null;

  if (loading && !preloadedSubjectData) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading subject details...</Text>
        </View>
      </View>
    );
  }

  if (error || !subjectData || !subject) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error || 'Subject not found'}</Text>
          {onBack && (
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
              <ArrowLeft size={18} color={colors.accent} />
              <Text style={styles.backButtonText}>Back to Subjects</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            {onBack && (
              <TouchableOpacity style={styles.backButton} onPress={onBack}>
                <ArrowLeft size={20} color={colors.text || '#1F2937'} />
              </TouchableOpacity>
            )}
            <View style={styles.headerTitleSection}>
              <Text style={styles.title}>{subject.name}</Text>
              {headerMetaLine ? (
                <Text style={styles.subtext}>{headerMetaLine}</Text>
              ) : null}
              {childrenNames.length > 0 && (
                <Text style={styles.subtext}>Students: {childrenNames.join(', ')}</Text>
              )}
              {classScheduleSummary ? (
                <Text style={styles.subtext}>Schedule: {classScheduleSummary}</Text>
              ) : (
                <Text style={styles.subtext}>
                  Schedule:{' '}
                  <Text
                    style={styles.subtextInlineLink}
                    onPress={handleOpenPlanBuilder}
                    accessibilityRole="link"
                  >
                    Create a plan
                  </Text>
                </Text>
              )}
              {logisticsHeaderLine ? (
                <Text style={styles.subtext}>{logisticsHeaderLine}</Text>
              ) : null}
              {calendarConnectionsHeaderLine ? (
                <Text style={styles.subtext}>{calendarConnectionsHeaderLine}</Text>
              ) : null}
            </View>
            <View style={styles.headerActions}>
              {onEditSubject && (
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => onEditSubject(subject)}
                >
                  <Edit2 size={16} color="#6B7280" />
                  <Text style={styles.actionButtonText}>Edit subject</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleOpenPlanBuilder}
                accessibilityRole="button"
                accessibilityLabel={planButtonLabel}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Calendar size={16} color="#6B7280" />
                <Text style={styles.actionButtonText}>{planButtonLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Top Summary Panel */}
        <View style={styles.summaryPanel}>
          {SHOW_SUBJECT_PROGRESS ? (
            <TouchableOpacity
              style={styles.summaryTile}
              onPress={() => scrollToSection('progress-section')}
              activeOpacity={0.8}
            >
              <Text style={styles.summaryTileLabel}>Progress</Text>
              <Text style={styles.summaryTileValue}>
                {subjectPlanYearId ? 'Plan linked' : 'No plan yet'}
              </Text>
              <Text style={styles.summaryTileCaption}>Plan lessons breakdown</Text>
            </TouchableOpacity>
          ) : null}

          {/* Attendance Tile */}
          <TouchableOpacity
            style={styles.summaryTile}
            onPress={() => {
              if (attendanceRate30 !== null && attendanceRate30 !== undefined && !isNaN(attendanceRate30)) {
                scrollToSection('attendance-section');
              } else {
                scrollToSection('attendance-section');
              }
            }}
          >
            <Text style={styles.summaryTileLabel}>Attendance</Text>
            {attendanceRate30Display !== null && attendanceRate30Display !== undefined && !isNaN(attendanceRate30Display) ? (
              <>
                <Text style={styles.summaryTileValue}>{attendanceRate30Display}% present</Text>
                <Text style={styles.summaryTileCaption}>last 30 days</Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryTileValue}>None attended</Text>
                <Text style={styles.summaryTileEmptyAttendanceDetail}>
                  No events related to {subject?.name || 'this subject'} have been marked as attended.
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Grades Tile */}
          <TouchableOpacity
            style={styles.summaryTile}
            onPress={() => scrollToSection('grades-section')}
          >
            <Text style={styles.summaryTileLabel}>Grades</Text>
            {displayGradeAveragePercent != null ? (
              <>
                <Text style={styles.summaryTileValue}>{displayGradeAveragePercent}%</Text>
                <Text style={styles.summaryTileCaption}>current average</Text>
              </>
            ) : gradedItems.length > 0 ? (
              <>
                <Text style={styles.summaryTileValue}>
                  {gradedItems.length} recorded
                </Text>
                <Text style={styles.summaryTileSubtext} numberOfLines={2}>
                  Add numeric scores to see an average percentage.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryTileValue}>No grades yet</Text>
                <Text style={styles.summaryTileSubtext} numberOfLines={2}>
                  Add assignments or assessments for {subject?.name || 'this subject'}.
                </Text>
              </>
            )}
            {isParentViewer && assignmentsAssignedToStudent.length > 0 ? (
              <Text style={styles.summaryTileSubtext} numberOfLines={2}>
                {assignmentsAssignedToStudent.length} assignment
                {assignmentsAssignedToStudent.length !== 1 ? 's' : ''} assigned to student
                {assignmentsAssignedToStudent.length !== 1 ? 's' : ''} — see Grades below.
              </Text>
            ) : null}
          </TouchableOpacity>

          {/* Learning Goals Tile */}
          <TouchableOpacity
            style={styles.summaryTile}
            onPress={() => scrollToSection('learning-goals-section')}
            activeOpacity={0.8}
          >
            <Text style={styles.summaryTileLabel}>Learning Goals</Text>
            {hasLearningGoalsContent ? (
              <>
                <Text style={styles.summaryTileValue}>
                  {totalLearningGoalLessons} lesson{totalLearningGoalLessons === 1 ? '' : 's'}
                </Text>
                <Text style={styles.summaryTileSubtext} numberOfLines={2}>
                  Across {learningGoalsUnits.length} unit{learningGoalsUnits.length === 1 ? '' : 's'} for {subject?.name || 'this subject'}.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.summaryTileValue}>No goals yet</Text>
                <Text style={styles.summaryTileSubtext} numberOfLines={2}>
                  Add lessons or units for {subject?.name || 'this subject'}.
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {isParentViewer && assignmentsNeedingHelp.length > 0 ? (
          <View id="needs-help-section" style={styles.needsHelpSection}>
            <View style={styles.needsHelpHeader}>
              <HelpCircle size={22} color="#b45309" strokeWidth={2} />
              <View style={styles.needsHelpHeaderText}>
                <Text style={styles.needsHelpTitle}>Needs help</Text>
                <Text style={styles.needsHelpSubtitle}>
                  Your student asked for help on the following. Open one to reply or mark resolved.
                </Text>
              </View>
            </View>
            <View style={styles.needsHelpList}>
              {assignmentsNeedingHelp.map((a) => {
                const reason = extractStudentHelpReason(a);
                const dueLine = formatDueShort(a.due_date);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.needsHelpRow}
                    onPress={() => setHelpModalAssignment(a)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Respond to help: ${a.title || 'assignment'}`}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.needsHelpRowBody}>
                      <Text style={styles.needsHelpRowTitle} numberOfLines={2}>
                        {a.title || 'Schoolwork'}
                      </Text>
                      <Text style={styles.needsHelpRowMeta}>
                        {getChildName(a.child_id)}
                        {dueLine ? ` · ${dueLine}` : ''}
                      </Text>
                      <Text style={styles.needsHelpRowReason} numberOfLines={2}>
                        “{reason}”
                      </Text>
                    </View>
                    <ChevronRight size={20} color="#94a3b8" />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Materials Snapshot */}
        <View id="materials-section" style={styles.section}>
          <View style={[styles.attendanceSectionHeader, styles.materialsSectionHeader]}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Materials</Text>
          </View>
          {materials.length > 0 ? (
            <>
              <View style={[styles.materialsList, styles.materialsListWithBorder]}>
                <View style={styles.materialsListHeader}>
                  <Text style={styles.materialsListHeaderTitle}>TITLE</Text>
                  <Text style={styles.materialsListHeaderDate}>DATE</Text>
                </View>
                {materials.map((material) => {
                  const baseName = material.title || material.provider_name || 'Material';
                  const typeLabel = getMaterialFileTypeLabel(material);
                  const roleTag = roleLabel(deriveRoleFromTags(material?.tags));
                  const createdDate = formatDate(material.created_at || material.updated_at);
                  return (
                    <View
                      key={material.id}
                      style={[
                        styles.materialListItem,
                        highlightedMaterialId != null &&
                        String(material.id) === String(highlightedMaterialId)
                          ? styles.materialListItemHighlighted
                          : null,
                        Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                      ]}
                      {...(Platform.OS === 'web' && {
                        onMouseDown: (e) => {
                          const button = e?.button ?? e?.nativeEvent?.button;
                          if (button !== 2) return;
                          e.preventDefault?.();
                          e.stopPropagation?.();
                          const x = e?.clientX ?? e?.nativeEvent?.clientX ?? 0;
                          const y = e?.clientY ?? e?.nativeEvent?.clientY ?? 0;
                          showMaterialContextMenu(material, x, y);
                        },
                        onContextMenu: (e) => {
                          e.preventDefault?.();
                          e.stopPropagation?.();
                          const x = e?.clientX ?? e?.nativeEvent?.clientX ?? 0;
                          const y = e?.clientY ?? e?.nativeEvent?.clientY ?? 0;
                          showMaterialContextMenu(material, x, y);
                        },
                      })}
                    >
                      <TouchableOpacity
                        style={styles.materialListItemTapTarget}
                        onPress={() => handleMaterialChipPress(material)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.materialListItemLeft}>
                          <View style={styles.materialListItemTextWrap}>
                            <View style={styles.materialListItemTitleRow}>
                              <Text style={styles.materialListItemTitle} numberOfLines={1}>
                                {baseName}
                              </Text>
                              {(roleTag || typeLabel) ? (
                                <View style={styles.materialListItemTagsRow}>
                                  {roleTag ? (
                                    <View style={styles.materialListItemTag}>
                                      <Text style={styles.materialListItemTagText}>{roleTag}</Text>
                                    </View>
                                  ) : null}
                                  {typeLabel ? (
                                    <View style={styles.materialListItemTag}>
                                      <Text style={styles.materialListItemTagText}>{typeLabel}</Text>
                                    </View>
                                  ) : null}
                                </View>
                              ) : null}
                            </View>
                          </View>
                        </View>
                        <Text style={styles.materialListItemDate}>{createdDate || '—'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
              <View style={styles.materialsActionsRow}>
                <TouchableOpacity
                  style={styles.materialsAddCta}
                  onPress={openAddMaterialModal}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add new material"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#6BB3E8" />
                  <Text style={styles.materialsAddCtaText}>Add new material</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.materialsEmptyText}>
                No materials added yet for {subject?.name || 'this subject'}.
              </Text>
              <View style={styles.materialsEmptyActionsRow}>
                <TouchableOpacity
                  style={styles.materialsAddCta}
                  onPress={openAddMaterialModal}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Add material"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={16} color="#6BB3E8" />
                  <Text style={styles.materialsAddCtaText}>Add material</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {SHOW_SUBJECT_PROGRESS ? (
          <View id="progress-section" style={styles.section}>
            <View style={styles.attendanceSectionHeader}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Progress</Text>
            </View>
            <SubjectProgressPlanSection
              familyId={familyId}
              subjectId={subject?.id}
              subjectName={subject?.name}
              children={children}
              assignedChildIds={assignedChildren}
              isParentViewer={isParentViewer}
              onRefresh={() => loadSubjectDetail({ silent: true })}
            />
          </View>
        ) : null}

        {/* Section 2: Attendance */}
        <View id="attendance-section" style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Attendance</Text>
            {Platform.OS === 'web' && (
              <TouchableOpacity
                style={styles.exportIconButton}
                onPress={() => {
                  if (typeof onOpenExportModalForSection === 'function') {
                    onOpenExportModalForSection('attendance');
                    return;
                  }
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('openExportPlannerModal', { detail: { subjectId, subjectName: subject?.name || '' } }));
                  }
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Export attendance"
                accessibilityHint="Download"
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: (e) => handleExportHover('attendance', true, e),
                  onMouseLeave: (e) => handleExportHover('attendance', false, e),
                })}
              >
                <Download size={18} color="#6B7280" />
              </TouchableOpacity>
            )}
          </View>
          {attendanceRecordsForUI.length > 0 ? (
            <View style={styles.emptyStateBox}>
              <View style={styles.attendanceModePillsRow}>
                <View style={styles.attendanceModePillsGroup}>
                  <TouchableOpacity
                    style={[styles.sectionModePill, attendanceViewMode === 'list' && styles.sectionModePillActive]}
                    onPress={() => setAttendanceViewMode('list')}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.sectionModePillInner}>
                      <List size={14} color={attendanceViewMode === 'list' ? '#6BB3E8' : '#6B7280'} />
                      <Text style={[styles.sectionModePillText, attendanceViewMode === 'list' && styles.sectionModePillTextActive]}>
                        List
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sectionModePill, attendanceViewMode === 'year' && styles.sectionModePillActive]}
                    onPress={() => setAttendanceViewMode('year')}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.sectionModePillInner}>
                      <BarChart3 size={14} color={attendanceViewMode === 'year' ? '#6BB3E8' : '#6B7280'} />
                      <Text style={[styles.sectionModePillText, attendanceViewMode === 'year' && styles.sectionModePillTextActive]}>
                        Year
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sectionModePill, attendanceViewMode === 'month' && styles.sectionModePillActive]}
                    onPress={() => setAttendanceViewMode('month')}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.sectionModePillInner}>
                      <Calendar size={14} color={attendanceViewMode === 'month' ? '#6BB3E8' : '#6B7280'} />
                      <Text style={[styles.sectionModePillText, attendanceViewMode === 'month' && styles.sectionModePillTextActive]}>
                        Month
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.emptyStateButton, styles.attendanceTopRowPastLessonsButton]}
                  onPress={() => setShowPastEventsAttendanceModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Open attendance bulk actions"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <SlidersHorizontal size={14} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Bulk actions</Text>
                </TouchableOpacity>
              </View>
              {attendanceViewMode === 'list' ? (
                <>
                  <View style={styles.attendanceChips}>
                    <View style={styles.attendanceChip}>
                      <CheckCircle size={14} color="#10B981" />
                      <Text style={styles.attendanceChipText}>
                        {attendance30Days.present} Present
                      </Text>
                    </View>
                    <View style={styles.attendanceChip}>
                      <XCircle size={14} color="#EF4444" />
                      <Text style={styles.attendanceChipText}>
                        {attendance30Days.absent} Absent
                      </Text>
                    </View>
                  </View>
                  <View style={styles.attendanceList}>
                    {(showAttendanceExpanded ? attendanceRecordsListUI : attendanceRecordsListUI.slice(0, ATTENDANCE_LIST_LIMIT)).map((record) => {
                      const event = (subjectData?.events || []).find(e => e.id === record.event_id);
                      return (
                        <TouchableOpacity
                          key={record.id}
                          style={styles.attendanceItem}
                          onPress={() => event && handleOpenEventDetails(event.id, event)}
                          activeOpacity={0.7}
                          {...(Platform.OS === 'web' && { cursor: event ? 'pointer' : 'default' })}
                        >
                          <Text style={styles.attendanceItemDate}>{formatDate(record.day_date)}</Text>
                          <Text style={styles.attendanceItemTitle}>
                            {event?.title || 'Lesson'}
                          </Text>
                          <Text style={styles.attendanceItemStatus}>{record.status}</Text>
                          <Text style={styles.attendanceItemMinutes}>{record.minutes} min</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {attendanceRecordsListUI.length > ATTENDANCE_LIST_LIMIT && (
                    <TouchableOpacity
                      style={styles.attendanceShowMoreBtn}
                      onPress={() => setShowAttendanceExpanded((v) => !v)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.attendanceShowMoreText}>
                        {showAttendanceExpanded
                          ? 'Show less'
                          : `Show more (${attendanceRecordsListUI.length - ATTENDANCE_LIST_LIMIT} more)`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              ) : (
                attendanceInsightsPanel
              )}
              {attendanceTargetCard}
            </View>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                Attendance appears once you complete an event attached to this subject.
              </Text>
              <View style={styles.attendanceModePillsRow}>
                <View style={styles.attendanceModePillsGroup}>
                  <TouchableOpacity
                    style={[styles.sectionModePill, attendanceViewMode === 'list' && styles.sectionModePillActive]}
                    onPress={() => setAttendanceViewMode('list')}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.sectionModePillInner}>
                      <List size={14} color={attendanceViewMode === 'list' ? '#6BB3E8' : '#6B7280'} />
                      <Text style={[styles.sectionModePillText, attendanceViewMode === 'list' && styles.sectionModePillTextActive]}>
                        List
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sectionModePill, attendanceViewMode === 'year' && styles.sectionModePillActive]}
                    onPress={() => setAttendanceViewMode('year')}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.sectionModePillInner}>
                      <BarChart3 size={14} color={attendanceViewMode === 'year' ? '#6BB3E8' : '#6B7280'} />
                      <Text style={[styles.sectionModePillText, attendanceViewMode === 'year' && styles.sectionModePillTextActive]}>
                        Year
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sectionModePill, attendanceViewMode === 'month' && styles.sectionModePillActive]}
                    onPress={() => setAttendanceViewMode('month')}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.sectionModePillInner}>
                      <Calendar size={14} color={attendanceViewMode === 'month' ? '#6BB3E8' : '#6B7280'} />
                      <Text style={[styles.sectionModePillText, attendanceViewMode === 'month' && styles.sectionModePillTextActive]}>
                        Month
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.emptyStateButton, styles.attendanceTopRowPastLessonsButton]}
                  onPress={() => setShowPastEventsAttendanceModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Open attendance bulk actions"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <SlidersHorizontal size={14} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Bulk actions</Text>
                </TouchableOpacity>
              </View>
              {attendanceViewMode === 'list' ? null : attendanceInsightsPanel}
              {attendanceTargetCard}
            </View>
          )}
        </View>

        {/* Section 3: Grades */}
        <View id="grades-section" style={styles.section}>
          <View style={styles.gradesSectionHeader}>
            <View style={styles.gradesSectionTitleRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Grades</Text>
              <TouchableOpacity
                style={styles.exportIconButton}
                onPress={() => {
                  if (typeof onOpenExportModalForSection === 'function') {
                    onOpenExportModalForSection('report_card');
                    return;
                  }
                  setShowExportComingSoonModal(true);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Export grades"
                accessibilityHint="Download"
                {...(Platform.OS === 'web' && {
                  cursor: 'pointer',
                  onMouseEnter: (e) => handleExportHover('grades', true, e),
                  onMouseLeave: (e) => handleExportHover('grades', false, e),
                })}
              >
                <Download size={18} color="#6B7280" />
              </TouchableOpacity>
            </View>
            {hasGradesAttention && isParentViewer ? (
              <Text style={styles.attentionHintText} accessibilityRole="text">
                * Open the listed event for a help request or submission review.
              </Text>
            ) : null}
          </View>
          {gradedItems.length > 0 && (
            <View style={styles.gradeAverage}>
              <View style={styles.gradeAverageRow}>
                <Text style={styles.gradeAverageLabel}>Current average</Text>
                <Text
                  style={
                    displayGradeAveragePercent != null
                      ? styles.gradeAverageValue
                      : styles.gradeAveragePlaceholder
                  }
                  accessibilityRole="text"
                  accessibilityLabel={
                    displayGradeAveragePercent != null
                      ? `Current grade average, ${displayGradeAveragePercent} percent`
                      : 'No numeric average yet'
                  }
                >
                  {displayGradeAveragePercent != null ? `${displayGradeAveragePercent}%` : '—'}
                </Text>
              </View>
              {displayGradeAveragePercent == null ? (
                <Text style={styles.gradeAverageHint}>
                  Average uses numeric scores or mapped letter grades. Add scores on assignments or assessments to see a
                  percentage.
                </Text>
              ) : null}
            </View>
          )}
          {gradedItems.length > 0 ? (
            <>
              <View style={styles.gradesList}>
                {gradedItems.map((item) => {
                  const Wrapper = item.eventId ? TouchableOpacity : View;
                  const wrapperProps = item.eventId
                    ? {
                        onPress: () => handleOpenEventDetails(item.eventId, item.event),
                        activeOpacity: 0.7,
                        ...(Platform.OS === 'web' && { cursor: 'pointer' }),
                      }
                    : {};
                  const gAtt =
                    item.eventId && assignmentAttentionByEventId
                      ? assignmentAttentionByEventId[item.eventId]
                      : null;
                  const needsGradeMark =
                    isParentViewer &&
                    gAtt &&
                    (gAtt.needHelp || gAtt.needsSubmissionReview);
                  return (
                    <Wrapper key={item.id} style={styles.gradeItem} {...wrapperProps}>
                      <View style={styles.gradeItemContent}>
                        <Text style={styles.gradeItemName}>
                          {needsGradeMark ? '* ' : ''}
                          {item.name}
                        </Text>
                        <Text style={styles.gradeItemDate}>{formatDate(item.date)}</Text>
                      </View>
                      <View style={styles.gradeItemScore}>
                        {item.score !== null && item.possible !== null && item.possible > 0 ? (
                          <>
                            <Text style={styles.gradeItemScoreText}>
                              {item.score}/{item.possible}
                            </Text>
                            {item.percent !== null && (
                              <Text style={styles.gradeItemPercent}>
                                {item.percent}%
                              </Text>
                            )}
                          </>
                        ) : item.score !== null ? (
                          <>
                            <Text style={styles.gradeItemScoreText}>
                              {item.score}
                            </Text>
                            {item.percent !== null && (
                              <Text style={styles.gradeItemPercent}>
                                {item.percent}%
                              </Text>
                            )}
                          </>
                        ) : item.grade ? (
                          <Text style={styles.gradeItemGrade}>{item.grade}</Text>
                        ) : null}
                      </View>
                    </Wrapper>
                  );
                })}
              </View>
              {Platform.OS === 'web' && isParentViewer && (subjectData?.events || []).length > 0 ? (
                <TouchableOpacity
                  style={[styles.emptyStateButton, styles.gradesBulkActionsButton]}
                  onPress={() => setShowPastEventsGradesModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Open grades bulk actions"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <SlidersHorizontal size={18} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Bulk actions</Text>
                </TouchableOpacity>
              ) : null}
              {isParentViewer && assignmentsAssignedToStudent.length > 0 ? (
                <TouchableOpacity
                  style={[styles.emptyStateButton, styles.gradesAssignedToStudentButton]}
                  onPress={() => setShowAssignedToStudentModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View work assigned to student that has not been submitted"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Calendar size={18} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Assigned to student</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                Grades appear once you add grades to assignments or assessments for this subject.
              </Text>
              {Platform.OS === 'web' && isParentViewer && (subjectData?.events || []).length > 0 ? (
                <TouchableOpacity
                  style={[styles.emptyStateButton, styles.gradesBulkActionsButton]}
                  onPress={() => setShowPastEventsGradesModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Open grades bulk actions"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <SlidersHorizontal size={18} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Bulk actions</Text>
                </TouchableOpacity>
              ) : null}
              {isParentViewer && assignmentsAssignedToStudent.length > 0 ? (
                <TouchableOpacity
                  style={styles.emptyStateButton}
                  onPress={() => setShowAssignedToStudentModal(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="View work assigned to student that has not been submitted"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Calendar size={18} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Assigned to student</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        </View>

        {/* Section: Learning Goals */}
        <View id="learning-goals-section" style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Learning Goals</Text>
            <TouchableOpacity
              style={styles.exportIconButton}
              onPress={() => {
                if (typeof onOpenExportModalForSection === 'function') {
                  onOpenExportModalForSection('units_lessons');
                  return;
                }
                setShowExportComingSoonModal(true);
              }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Export learning goals"
              accessibilityHint="Download"
              {...(Platform.OS === 'web' && {
                cursor: 'pointer',
                onMouseEnter: (e) => handleExportHover('learningGoals', true, e),
                onMouseLeave: (e) => handleExportHover('learningGoals', false, e),
              })}
            >
              <Download size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <View style={styles.emptyStateBox}>
            {!hasLearningGoalsContent ? (
              <Text style={styles.emptyStateText}>
                Learning Goals appear once you add class lessons or units.
              </Text>
            ) : null}
            {learningGoalsLoading ? (
              <Text style={styles.learningGoalsLoadingText}>Loading current units...</Text>
            ) : null}
            {hasLearningGoalsContent ? (
              <>
                <View style={styles.learningGoalsSummaryRow}>
                  <Text style={styles.learningGoalsSummaryText}>
                    {learningGoalsUnits.length} units • {totalLearningGoalLessons} lessons
                  </Text>
                  {learningGoalsSourceLabel ? (
                    <View style={styles.learningGoalsSourceBadge}>
                      <Text style={styles.learningGoalsSourceBadgeText}>Built via {learningGoalsSourceLabel}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.learningGoalsList}>
                  {learningGoalsUnits.map((unit, unitIndex) => {
                    const lessonTitles = (unit?.lessons || [])
                      .map((lesson) => String(lesson?.title || '').trim())
                      .filter(Boolean);
                    return (
                      <View key={`${unit?.title || 'unit'}-${unitIndex}`} style={styles.learningGoalsUnitCard}>
                        <Text style={styles.learningGoalsUnitTitle}>{unit?.title || `Unit ${unitIndex + 1}`}</Text>
                        <Text style={styles.learningGoalsUnitMeta}>
                          {(unit?.lessons || []).length} {(unit?.lessons || []).length === 1 ? 'lesson' : 'lessons'}
                        </Text>
                        {lessonTitles.slice(0, 4).map((lessonTitle, lessonIndex) => (
                          <Text key={`${lessonTitle}-${lessonIndex}`} style={styles.learningGoalsLessonRow}>
                            • {lessonTitle}
                          </Text>
                        ))}
                        {lessonTitles.length > 4 ? (
                          <Text style={styles.learningGoalsMoreText}>+{lessonTitles.length - 4} more lessons</Text>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}
            {onEditSubject ? (
              <View style={styles.learningGoalsActionsWrap}>
                {hasLearningGoalsContent ? (
                  <TouchableOpacity
                    style={styles.learningGoalsEditCurrentButton}
                    onPress={openSubjectUnitsEditor}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.learningGoalsActionInner}>
                      <Edit2 size={14} color="#5E6C84" />
                      <Text style={styles.learningGoalsEditCurrentText}>Edit current units</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
                {hasLearningGoalsContent ? (
                  <Text style={styles.learningGoalsMethodsLabel}>Add or update with another method:</Text>
                ) : null}
                <View style={styles.learningGoalsActionsRow}>
                <TouchableOpacity
                  style={styles.learningGoalsActionPill}
                  onPress={() => openSubjectUnitsEditorForMethod('manual')}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.learningGoalsActionInner}>
                    <Plus size={14} color="#5E6C84" />
                    <Text style={styles.learningGoalsActionText}>Add units</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.learningGoalsActionPill}
                  onPress={() => openSubjectUnitsEditorForMethod('generate')}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.learningGoalsActionInner}>
                    <Sparkles size={14} color="#5E6C84" />
                    <Text style={styles.learningGoalsActionText}>Generate curriculum</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.learningGoalsActionPill}
                  onPress={() => openSubjectUnitsEditorForMethod('upload')}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.learningGoalsActionInner}>
                    <Upload size={14} color="#5E6C84" />
                    <Text style={styles.learningGoalsActionText}>Upload material</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.learningGoalsActionPill}
                  onPress={() => openSubjectUnitsEditorForMethod('paste')}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.learningGoalsActionInner}>
                    <Pencil size={14} color="#5E6C84" />
                    <Text style={styles.learningGoalsActionText}>Paste plain text</Text>
                  </View>
                </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>
      <SubjectPastEventsAttendanceModal
        visible={showPastEventsAttendanceModal}
        onClose={() => setShowPastEventsAttendanceModal(false)}
        familyId={familyId}
        subjectId={subject.id}
        events={subjectData?.events || []}
        getChildName={getChildName}
        onOpenEvent={handleOpenEventDetails}
        onCompleted={() => loadSubjectDetail({ silent: true })}
      />
      <SubjectPastEventsGradesModal
        visible={showPastEventsGradesModal}
        onClose={() => setShowPastEventsGradesModal(false)}
        familyId={familyId}
        subjectId={subject.id}
        events={subjectData?.events || []}
        eventOutcomes={eventOutcomes}
        getChildName={getChildName}
        onOpenEvent={handleOpenEventDetails}
        onCompleted={() => loadSubjectDetail({ silent: true })}
      />
      <SubjectAssignedToStudentModal
        visible={showAssignedToStudentModal}
        onClose={() => setShowAssignedToStudentModal(false)}
        assignments={assignmentsAssignedToStudent}
        getChildName={getChildName}
        formatDueShort={formatDueShort}
        onOpenAssignment={handleOpenAssignedFromModal}
      />
      <Modal
        visible={showExportComingSoonModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExportComingSoonModal(false)}
      >
        <View style={comingSoonModalStyles.overlay}>
          <View style={comingSoonModalStyles.content}>
            <TouchableOpacity
              style={comingSoonModalStyles.close}
              onPress={() => setShowExportComingSoonModal(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <X size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={comingSoonModalStyles.title}>Coming soon</Text>
            <Text style={comingSoonModalStyles.body}>
              This feature is in development. Stay tuned for updates!
            </Text>
            <TouchableOpacity
              style={comingSoonModalStyles.button}
              onPress={() => setShowExportComingSoonModal(false)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={comingSoonModalStyles.buttonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <MaterialDocViewerModal
        visible={showMaterialDocViewer && !!materialDocViewerUrl}
        onClose={closeMaterialDocViewer}
        url={materialDocViewerUrl}
        title={materialDocViewerTitle}
        viewerKind={materialDocViewerKind}
      />
      <MaterialDetailsModal
        visible={!!viewingMaterial}
        onClose={() => setViewingMaterial(null)}
        material={viewingMaterial}
        familyId={familyId}
        children={children}
        onEdit={(material) => {
          setViewingMaterial(null);
          setEditingMaterial(material);
        }}
        onDelete={async (material) => {
          setViewingMaterial(null);
          await handleDeleteMaterial(material);
        }}
      />
      <AddMaterialModal
        visible={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        onSaved={async () => {
          setEditingMaterial(null);
          await loadSubjectDetail({ silent: true });
          toast.push('Attachment details saved', 'success');
        }}
        familyId={familyId}
        children={children}
        material={editingMaterial}
        allSubjects={subject ? [subject] : []}
      />
      <RespondToHelpRequestModal
        visible={!!helpModalAssignment}
        assignment={helpModalAssignment}
        onClose={() => setHelpModalAssignment(null)}
        onResponded={() => {
          setHelpModalAssignment(null);
          loadSubjectDetail({ silent: true });
        }}
      />
      <AssignmentDetailModal
        visible={!!assignedDetailAssignment}
        assignment={assignedDetailAssignment}
        childId={assignedDetailAssignment?.child_id}
        familyId={familyId}
        onClose={() => setAssignedDetailAssignment(null)}
      />
      {Platform.OS === 'web' &&
        exportTooltipKey &&
        (() => {
          let ReactDOM;
          try {
            ReactDOM = require('react-dom');
          } catch (e) {
            return null;
          }
          const tip = (
            <View
              pointerEvents="none"
              style={[
                styles.exportHoverTooltip,
                {
                  position: 'fixed',
                  left: exportTooltipPos.x,
                  top: exportTooltipPos.y,
                  transform: [{ translateX: '-50%' }],
                  marginTop: 6,
                },
              ]}
            >
              <Text style={styles.exportHoverTooltipText}>Download</Text>
            </View>
          );
          return ReactDOM.createPortal ? ReactDOM.createPortal(tip, document.body) : null;
        })()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
    }),
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 60,
    ...(Platform.OS === 'web' && {
      maxWidth: 1200,
      marginHorizontal: 'auto',
      width: '100%',
    }),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.muted || '#6B7280',
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
    fontSize: 16,
    color: colors.redBold || '#EF4444',
    marginBottom: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  header: {
    marginBottom: 32,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  backButtonText: {
    fontSize: 14,
    color: colors.accent || '#4F46E5',
    fontWeight: '500',
    marginLeft: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerTitleSection: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtext: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtextInlineLink: {
    color: '#4F46E5',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  headerActions: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginLeft: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryPanel: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
    flexWrap: 'wrap',
  },
  needsHelpSection: {
    marginBottom: 28,
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: 'rgba(255, 251, 235, 0.95)',
  },
  needsHelpHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  needsHelpHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  needsHelpTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#92400e',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpSubtitle: {
    fontSize: 14,
    color: '#a16207',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpList: {
    gap: 0,
  },
  needsHelpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(234, 179, 8, 0.25)',
  },
  needsHelpRowBody: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  needsHelpRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpRowMeta: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  needsHelpRowReason: {
    fontSize: 13,
    color: '#854d0e',
    marginTop: 6,
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Grades: spacing for Assigned to student below the list (same idea as attendance past-lessons CTA) */
  gradesBulkActionsButton: {
    marginTop: 8,
  },
  gradesAssignedToStudentButton: {
    marginTop: 8,
  },
  summaryTile: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  summaryTileLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryTileValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryTileCaption: {
    fontSize: 11,
    color: '#9CA3AF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryTileEmptyAttendanceDetail: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 15,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryProgressBar: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  summaryProgressBarFill: {
    height: '100%',
    backgroundColor: Platform.OS === 'web' ? 'transparent' : (colors.accent || '#4F46E5'), // Fallback for native
    borderRadius: 2,
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(90deg, #f4b4f8 0%, #c4b5fd 20%, #93c5fd 40%, #a5f3fc 60%, #bbf7d0 80%, #facc15 100%)',
    }),
  },
  summaryProgressBarSkeleton: {
    height: '100%',
    width: '100%',
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
  },
  summaryTileSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  summaryTileAction: {
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  summaryTileActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      textDecorationLine: 'underline',
    }),
  },
  section: {
    marginBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  materialsSectionHeader: {
    marginBottom: 10,
  },
  materialsActionsRow: {
    marginTop: 20,
    marginBottom: 0,
  },
  materialsEmptyActionsRow: {
    marginTop: 10,
    marginBottom: 0,
  },
  materialsAddCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(133, 196, 242, 0.8)',
    borderStyle: 'dashed',
    backgroundColor: '#F4FAFF',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  materialsAddCtaText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6BB3E8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsList: {
    backgroundColor: 'transparent',
  },
  materialsListWithBorder: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  materialsListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.2)',
    backgroundColor: '#F8FAFC',
  },
  materialsListHeaderTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsListHeaderDate: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.14)',
  },
  materialListItemHighlighted: {
    backgroundColor: 'rgba(133, 196, 242, 0.14)',
    borderBottomColor: 'rgba(107, 179, 232, 0.45)',
  },
  materialListItemTapTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flex: 1,
  },
  materialListItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  materialListItemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  materialListItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialListItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  materialListItemTagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  materialListItemTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
  },
  materialListItemTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialListItemDate: {
    fontSize: 12,
    color: '#64748B',
    minWidth: 96,
    textAlign: 'right',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsEmptyText: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  gradesSectionHeader: {
    marginBottom: 10,
  },
  sectionModePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  attendanceContainerActionsRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    flexWrap: 'wrap',
  },
  attendanceModePillsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginLeft: 0,
  },
  attendanceModePillsRow: {
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 10,
    flexWrap: 'wrap',
  },
  attendanceTopRowPastLessonsButton: {
    marginTop: 0,
    borderRadius: 999,
    gap: 6,
  },
  attendanceInsightsPanelWrap: {
    marginTop: 12,
  },
  sectionModePill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  sectionModePillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionModePillActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(107, 179, 232, 0.12)',
  },
  sectionModePillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionModePillTextActive: {
    color: '#6BB3E8',
  },
  gradesSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  /** Past lessons CTA when attendance list is non-empty: spacing below list / show more */
  attendancePastLessonsButton: {
    marginTop: 0,
  },
  exportIconButton: {
    padding: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  /** Web hover tooltip — same idea as RightToolbar (dark pill, portal to body) */
  exportHoverTooltip: {
    backgroundColor: '#0f172a',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 10000,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 4px 14px rgba(15, 23, 42, 0.35)',
    }),
  },
  exportHoverTooltipText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attentionHintText: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 6,
    lineHeight: 16,
    maxWidth: '100%',
  },
  progressCheckInModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  progressCheckInModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    maxWidth: 400,
    width: '100%',
  },
  progressCheckInModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  progressCheckInModalBody: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  progressCheckInModalCloseButton: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#E5E7EB',
    borderRadius: 8,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  progressCheckInModalCloseButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  nextItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  nextItemContent: {
    flex: 1,
  },
  nextItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  nextItemDate: {
    fontSize: 13,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  overdueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  overdueText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.redBold || '#EF4444',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timelineList: {
    gap: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  timelineItemOverdue: {
    borderColor: colors.redBold || '#EF4444',
    borderWidth: 2,
  },
  timelineItemContent: {
    flex: 1,
  },
  timelineItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  timelineItemTitleOverdue: {
    color: colors.redBold || '#EF4444',
  },
  timelineItemDate: {
    fontSize: 12,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border || '#e5e7eb',
  },
  emptyStateButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  emptyStateBanner: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.muted || '#6B7280',
    lineHeight: 20,
    marginBottom: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsLoadingText: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  learningGoalsSummaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsSourceBadge: {
    borderWidth: 1,
    borderColor: 'rgba(107, 179, 232, 0.35)',
    backgroundColor: 'rgba(107, 179, 232, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  learningGoalsSourceBadgeText: {
    fontSize: 12,
    color: '#3974A7',
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsList: {
    gap: 8,
    marginBottom: 14,
  },
  learningGoalsUnitCard: {
    borderWidth: 1,
    borderColor: '#E6ECF3',
    borderRadius: 10,
    backgroundColor: '#FAFCFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  learningGoalsUnitTitle: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '700',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsUnitMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsLessonRow: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsMoreText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsActionsWrap: {
    gap: 8,
  },
  learningGoalsEditCurrentButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CFE2F6',
    backgroundColor: '#F2F8FF',
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  learningGoalsEditCurrentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3F5E86',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsMethodsLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  learningGoalsActionPill: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D9E0EA',
    backgroundColor: '#F8FAFD',
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  learningGoalsActionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  learningGoalsActionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceChips: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  attendanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  attendanceChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetCard: {
    borderWidth: 1,
    borderColor: 'rgba(107, 179, 232, 0.35)',
    borderRadius: 10,
    backgroundColor: 'rgba(133, 196, 242, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    marginBottom: 10,
  },
  attendanceTargetTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetValue: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetHelper: {
    marginTop: 3,
    fontSize: 12,
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceList: {
    gap: 8,
  },
  attendanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  attendanceItemDate: {
    fontSize: 12,
    color: '#6B7280',
    width: 80,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceItemTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceItemStatus: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'capitalize',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceShowMoreBtn: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: colors.bgSubtle || '#F3F4F6',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceShowMoreText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent || '#4F46E5',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceItemMinutes: {
    fontSize: 12,
    color: '#6B7280',
    width: 50,
    textAlign: 'right',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeAverage: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginBottom: 16,
  },
  gradeAverageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  gradeAverageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeAverageValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeAveragePlaceholder: {
    fontSize: 22,
    fontWeight: '600',
    color: '#9CA3AF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeAverageHint: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 8,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradesList: {
    gap: 8,
  },
  gradeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  gradeItemContent: {
    flex: 1,
  },
  gradeItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeItemDate: {
    fontSize: 12,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeItemScore: {
    alignItems: 'flex-end',
  },
  gradeItemScoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeItemPercent: {
    fontSize: 12,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  gradeItemGrade: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  viewAllButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  benefitsList: {
    marginBottom: 20,
  },
  benefitText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});