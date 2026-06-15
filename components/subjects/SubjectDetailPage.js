import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import {
  Pressable,
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
  FileText,
  ExternalLink,
  Trash2,
  CheckCircle,
  CheckCircle2,
  Check,
  XCircle,
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
import MarkAllAttendedModal from './MarkAllAttendedModal';
import SubjectPastEventsGradesModal from './SubjectPastEventsGradesModal';
import SubjectAssignedToStudentModal from './SubjectAssignedToStudentModal';
import RespondToHelpRequestModal from '../parent/RespondToHelpRequestModal';
import WorkReviewModal from '../assignments/WorkReviewModal';
import { extractStudentHelpReason, formatDueShort } from '../tutor/tutorHelpUtils';
import { deriveRoleFromTags, roleLabel } from '../../lib/docs/roles';
import { findAcademicYearPlanForSubject } from '../../lib/subjectPlanSlotLines';
import { getSubjectProgressCache, mergeSubjectProgressCache } from '../../lib/subjectProgressPlanCache';
import { fetchSubjectCurriculumEventsStructure } from '../../lib/services/curriculumClient';
import { createAttendanceLog, updateAttendanceLog, deleteAttendanceLog } from '../../lib/services/recordsClient';
import { completeEvent, updateEventStatus } from '../../lib/services/attendanceClient';
import { cleanPlannerEventId } from '../../lib/utils/recurringEventUtils';
import { applyToCalendar, getAcademicYear } from '../../lib/services/academicYearClient';
import { getAcademicYearExclusions } from '../../lib/services/plannerSettingsClient';
import {
  SubjectAttendanceYearHeatmap,
  SubjectAttendanceMonthDrilldown,
} from './SubjectSectionDrilldownPanels';
import { supabase } from '../../lib/supabase';
import BulletinBoardSection from '../bulletin/BulletinBoardSection';
import {
  getStudentSubmissionStatusLabel,
  getWorkStatusLabel,
  isWorkProducingEventType,
  normalizeWorkEventType,
} from '../../lib/workEventHelpers';
import { openAssignmentForParent } from '../../lib/openAssignmentWorkflow';
import AssignmentMessageModal from './AssignmentMessageModal';
import AssignmentSubmittalRequestModal from './AssignmentSubmittalRequestModal';
import SubmitForReviewModal from '../child/SubmitForReviewModal';
import AddMaterialModal from '../materials/AddMaterialModal';
import MaterialDetailsModal from '../materials/MaterialDetailsModal';
import { archiveMaterial } from '../../lib/services/materialsClient';
import LearningSubjectDetailView from '../learning/LearningSubjectDetailView';
import EditSubjectSettingsModal from './EditSubjectSettingsModal';
import EditSubjectUnitsModal from './EditSubjectUnitsModal';
import { draftFromCurriculumStructure } from '../../lib/subjectUnitsEditorDraft';
import SubjectClassroomTabs from './SubjectClassroomTabs';
import SubjectClassworkSection from './SubjectClassworkSection';
import SubjectClassworkSmartActions from './SubjectClassworkSmartActions';
import SubjectGradesPanel from './SubjectGradesPanel';
import SubjectGapAnalysisModal from './SubjectGapAnalysisModal';
import { parseSubjectGradingSettings, getGradingMethodLabel } from '../../lib/subjectGradingSettings';
import { buildSubjectClassworkModel } from '../../lib/subjectClassworkModel';
import { executeSubjectGapFix, previewSubjectGapFix } from '../../lib/subjectAddSessions';
import { dispatchOpenSubjectClassworkScheduleAll } from '../../lib/subjectClassworkActions';
import {
  appendLocalFixGapHistoryEntry,
  buildFixGapHistoryRunDetails,
  buildLocalFixGapHistoryEntry,
  canUndoFixGapEntry,
  formatFixGapHistorySlotLabel,
  getLatestUndoableFixGapEntry,
  loadSubjectFixGapHistory,
  normalizeFixGapSlots,
  undoSubjectFixGapLatest,
} from '../../lib/subjectFixGapHistory';

const ATTENDANCE_LIST_LIMIT = 5;
const SHOW_SUBJECT_ASSIGNMENTS_SECTION = false;
const SHOW_SUBJECT_ATTENDANCE_SECTION = false;
const SHOW_SUBJECT_GRADES_SECTION = false;
const SHOW_SUBJECT_MATERIALS_SECTION = false;
const SHOW_SUBJECT_UNITS_LESSONS_SECTION = false;
const WEEKDAY_PLURALS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const LEARNING_GOALS_METHOD_LABELS = {
  manual: 'Manual input',
  plain_text_parsed: 'Paste plain text',
  ai_generated: 'Generate curriculum',
  upload: 'Upload material',
  uploaded: 'Upload material',
  link: 'Upload material',
};
function isAttendancePresentLike(status) {
  const normalized = String(status || '').toLowerCase();
  // Legacy rows can omit status; treat as attended.
  if (!normalized) return true;
  return normalized === 'present' || normalized === 'partial';
}

function toLocalDateKey(value) {
  if (!value) return null;
  const asString = String(value);
  if (DATE_KEY_RE.test(asString)) return asString;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

function formatDateDisplayYmd(ymd) {
  const key = String(ymd || '').slice(0, 10);
  const m = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const monthIdx = Number(m[2]) - 1;
  const day = Number(m[3]);
  const year = Number(m[1]);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (monthIdx < 0 || monthIdx > 11 || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  return `${monthNames[monthIdx]} ${day}, ${year}`;
}

function fullYearRangeFromSchoolYearLabel(schoolYearLabel) {
  const raw = String(schoolYearLabel || '').trim();
  if (!raw) return null;
  const m = raw.match(/(\d{4})\s*[/\-]\s*(\d{2,4})/);
  if (!m) return null;
  const startYear = Number(m[1]);
  let endYear = Number(m[2]);
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
  if (endYear < 100) endYear = Math.floor(startYear / 100) * 100 + endYear;
  return { start_date: `${startYear}-08-01`, end_date: `${endYear}-05-31` };
}

function addDaysToYmd(ymd, daysToAdd) {
  const base = String(ymd || '').slice(0, 10);
  if (!DATE_KEY_RE.test(base)) return null;
  const d = new Date(`${base}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(daysToAdd || 0));
  return d.toISOString().slice(0, 10);
}

function listDatesForWeekdaysInRange(startYmd, endYmd, weekdayNums = []) {
  const startKey = String(startYmd || '').slice(0, 10);
  const endKey = String(endYmd || '').slice(0, 10);
  if (!DATE_KEY_RE.test(startKey) || !DATE_KEY_RE.test(endKey) || startKey > endKey) return [];
  const daySet = new Set(
    (Array.isArray(weekdayNums) ? weekdayNums : [])
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  );
  if (daySet.size === 0) return [];
  const out = [];
  const cursor = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  while (cursor.getTime() <= end.getTime()) {
    if (daySet.has(cursor.getDay())) {
      out.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
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

function normalizeSubjectTerm(scopeId) {
  const raw = String(scopeId || '').trim().toLowerCase();
  if (!raw) return 'full_year';
  if (raw === 'fall_term' || raw === 'spring_term' || raw === 'full_year') return raw;
  if (raw.includes('fall')) return 'fall_term';
  if (raw.includes('spring')) return 'spring_term';
  return 'full_year';
}

function countOccurrencesInRange(startYmd, endYmd, weekdays = []) {
  if (!startYmd || !endYmd || !Array.isArray(weekdays) || weekdays.length === 0) return 0;
  const start = new Date(`${startYmd}T12:00:00`);
  const end = new Date(`${endYmd}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return 0;
  const target = new Set(weekdays.map((d) => Number(d)));
  let n = 0;
  const d = new Date(start);
  while (d <= end) {
    if (target.has(d.getDay())) n += 1;
    d.setDate(d.getDate() + 1);
  }
  return n;
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

function getClientTimezone() {
  try {
    if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && typeof tz === 'string') return tz.trim();
    }
  } catch (_) {}
  return 'America/New_York';
}

function buildLearningGoalsUnitsFromEvents(events) {
  const rows = Array.isArray(events) ? events : [];
  const unitsMap = new Map();
  rows.forEach((ev) => {
    if (!ev) return;
    const unitTitle = String(ev.curriculum_unit_title || ev.unit || '').trim();
    const meta = ev?.curriculum_metadata && typeof ev.curriculum_metadata === 'object'
      ? ev.curriculum_metadata
      : {};
    const lessonTitle = String(
      meta?.lesson_label || ev.lesson || ev.title || ''
    ).trim();
    if (!unitTitle || !lessonTitle) return;
    if (!unitsMap.has(unitTitle)) unitsMap.set(unitTitle, []);
    unitsMap.get(unitTitle).push({
      id: ev.id ? String(ev.id) : `${unitTitle}-${lessonTitle}`,
      title: lessonTitle,
    });
  });
  return Array.from(unitsMap.entries()).map(([title, lessons]) => ({
    title,
    lessons,
  }));
}

export default function SubjectDetailPage({
  subjectId,
  familyId,
  children = [],
  onBack,
  onEditSubject,
  canManageMaterials = true,
  canManageAttendance = true,
  onOpenPlannerSettings = null,
  onOpenExportModalForSection = null,
  preloadedSubjectData = null,
  onSubjectDataUpdate = null,
  initialScrollToSectionId = null,
  initialOpenMaterialId = null,
  initialProgressAction = null,
  initialClassworkFocus = null,
  onNavigateToPlanner = null,
  layoutVariant = 'default',
}) {
  const initialSubjectIdForProgressCache = subjectId || preloadedSubjectData?.subject?.id;
  const preloadedProgressCache = initialSubjectIdForProgressCache
    ? getSubjectProgressCache(familyId, initialSubjectIdForProgressCache)
    : null;
  const session = useSession();
  const toast = useToast();
  const [loading, setLoading] = useState(!preloadedSubjectData);
  const [error, setError] = useState(null);
  const [subjectData, setSubjectData] = useState(preloadedSubjectData || null);
  const [showExportComingSoonModal, setShowExportComingSoonModal] = useState(false);
  const [showMarkAllAttendedModal, setShowMarkAllAttendedModal] = useState(false);
  const [showPastEventsGradesModal, setShowPastEventsGradesModal] = useState(false);
  const [showEditSettingsModal, setShowEditSettingsModal] = useState(false);
  const [editSettingsInitialTab, setEditSettingsInitialTab] = useState('details');
  const [showAssignedToStudentModal, setShowAssignedToStudentModal] = useState(false);
  /** Web-only: which export icon is hovered (portal tooltip, matches planner RightToolbar). */
  const [exportTooltipKey, setExportTooltipKey] = useState(null);
  const [exportTooltipPos, setExportTooltipPos] = useState({ x: 0, y: 0 });
  const [helpModalAssignment, setHelpModalAssignment] = useState(null);
  const [messageModalContext, setMessageModalContext] = useState(null);
  const [submittalRequestContext, setSubmittalRequestContext] = useState(null);
  const [reviewAssignment, setReviewAssignment] = useState(null);
  const [submitModalContext, setSubmitModalContext] = useState(null);
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
  const [showAttendanceExpanded, setShowAttendanceExpanded] = useState(false);
  const [showAttendanceGapSuggestion, setShowAttendanceGapSuggestion] = useState(false);
  const [classroomTab, setClassroomTab] = useState('bulletin');
  const [highlightLessonId, setHighlightLessonId] = useState(null);
  const [highlightAssignmentId, setHighlightAssignmentId] = useState(null);
  const [showAttendanceSuggestionConfirmModal, setShowAttendanceSuggestionConfirmModal] = useState(false);
  const [applyingAttendanceSuggestion, setApplyingAttendanceSuggestion] = useState(false);
  const [gapAnalysisWorking, setGapAnalysisWorking] = useState(false);
  const [classworkSchedulingAll, setClassworkSchedulingAll] = useState(false);
  const [gapUndoing, setGapUndoing] = useState(false);
  const [gapHistoryRuns, setGapHistoryRuns] = useState([]);
  const [gapSlotLines, setGapSlotLines] = useState([]);
  const [gapModal, setGapModal] = useState({
    visible: false,
    title: '',
    message: '',
    loading: false,
    working: false,
    showConfirm: false,
    confirmLabel: 'OK',
    cancelLabel: 'Close',
    mode: 'info',
  });
  const gapPreviewRef = useRef(null);
  const pendingScheduleAllRef = useRef(false);
  const [showEditUnitsModal, setShowEditUnitsModal] = useState(false);
  const [editUnitsInitialDraft, setEditUnitsInitialDraft] = useState(null);
  const [learningGoalsUnits, setLearningGoalsUnits] = useState(
    Array.isArray(preloadedProgressCache?.curriculumUnits) ? preloadedProgressCache.curriculumUnits : []
  );
  const [learningGoalsSource, setLearningGoalsSource] = useState(
    preloadedProgressCache?.curriculumSavedContentSource || null
  );
  const learningGoalsUnitsRef = useRef(
    Array.isArray(preloadedProgressCache?.curriculumUnits) ? preloadedProgressCache.curriculumUnits : []
  );
  const learningGoalsFetchInFlightRef = useRef(false);
  const learningGoalsFetchCooldownUntilRef = useRef(0);
  const loadingRef = useRef(false);
  const autoOpenedMaterialKeyRef = useRef(null);
  const autoOpenedProgressActionRef = useRef(null);
  const highlightClearTimeoutRef = useRef(null);
  const materialHighlightTimeoutRef = useRef(null);
  const materialContextMenuIdRef = useRef(`subject-detail-material-context-menu-${Math.random().toString(36).slice(2)}`);
  useEffect(() => {
    learningGoalsUnitsRef.current = Array.isArray(learningGoalsUnits) ? learningGoalsUnits : [];
  }, [learningGoalsUnits]);

  useLayoutEffect(() => {
    if (!familyId || !subjectData?.subject?.id) return;
    const cached = getSubjectProgressCache(familyId, subjectData.subject.id);
    if (Array.isArray(cached?.curriculumUnits) && cached.curriculumUnits.length > 0) {
      setLearningGoalsUnits(cached.curriculumUnits);
      setLearningGoalsSource(cached.curriculumSavedContentSource || null);
    }
  }, [familyId, subjectData?.subject?.id]);

  const loadLearningGoalsStructure = useCallback(async () => {
    const sid = subjectData?.subject?.id;
    if (!familyId || !sid) {
      setLearningGoalsUnits([]);
      setLearningGoalsSource(null);
      return;
    }
    const now = Date.now();
    if (learningGoalsFetchInFlightRef.current) return;
    if (learningGoalsFetchCooldownUntilRef.current > now) return;
    learningGoalsFetchInFlightRef.current = true;
    try {
      // Use year-agnostic structure for Subject Detail section so saved edits are always visible.
      const { data, error } = await fetchSubjectCurriculumEventsStructure(familyId, sid, null);
      if (error) throw error;
      const nextUnits = Array.isArray(data?.units) ? data.units : [];
      const nextSource = data?.saved_content_source || null;
      const currentUnits = Array.isArray(learningGoalsUnitsRef.current) ? learningGoalsUnitsRef.current : [];
      if (nextUnits.length === 0 && currentUnits.length > 0) {
        return;
      }
      setLearningGoalsUnits(nextUnits);
      setLearningGoalsSource(nextSource);
      mergeSubjectProgressCache(familyId, sid, {
        curriculumUnits: nextUnits,
        curriculumSavedContentSource: nextSource,
      });
      learningGoalsFetchCooldownUntilRef.current = 0;
    } catch (err) {
      console.warn('[SubjectDetailPage] Failed loading learning goals structure:', err);
      learningGoalsFetchCooldownUntilRef.current = Date.now() + 15000;
      // Keep current UI/cache values on transient load failures to avoid wiping visible units.
    } finally {
      learningGoalsFetchInFlightRef.current = false;
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
    const handleRefresh = (e) => {
      if (e?.detail?.skipSubjectDetailRefresh) return;
      loadSubjectDetail({ silent: true });
    };
    const handleSubjectDetailRefresh = (e) => {
      if (e.detail?.subjectId === subjectId) {
        loadSubjectDetail({ silent: true });
        loadLearningGoalsStructure();
      }
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
  }, [subjectId, familyId, loadSubjectDetail, loadLearningGoalsStructure]);

  const getChildName = useCallback((childId) => {
    const child = children.find(c => c.id === childId);
    return child?.first_name || child?.name || 'Unknown';
  }, [children]);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return null;
    const ymd = String(dateString || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
      return formatDateDisplayYmd(ymd);
    }
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return String(dateString).slice(0, 10);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);
  const getEventDateKey = useCallback((event) => {
    const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
    return toLocalDateKey(raw);
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
  const eventAttachmentMaterials = subjectData?.eventAttachmentMaterials || [];
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
  const allChildIds = useMemo(
    () => (children || []).map((child) => String(child?.id || '')).filter(Boolean),
    [children]
  );

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
  const immediateLearningGoalsUnits = useMemo(
    () => buildLearningGoalsUnitsFromEvents(subjectEvents),
    [subjectEvents]
  );
  const cachedCurriculumUnits = useMemo(() => {
    if (!familyId || !subject?.id) return [];
    const cached = getSubjectProgressCache(familyId, subject.id);
    return Array.isArray(cached?.curriculumUnits) ? cached.curriculumUnits : [];
  }, [familyId, subject?.id]);
  const effectiveLearningGoalsUnits = useMemo(() => {
    const fetched = Array.isArray(learningGoalsUnits) ? learningGoalsUnits : [];
    if (fetched.length > 0) return fetched;
    if (cachedCurriculumUnits.length > 0) return cachedCurriculumUnits;
    return immediateLearningGoalsUnits;
  }, [learningGoalsUnits, cachedCurriculumUnits, immediateLearningGoalsUnits]);
  const totalLearningGoalLessons = useMemo(
    () => (effectiveLearningGoalsUnits || []).reduce((sum, unit) => sum + ((unit?.lessons || []).length || 0), 0),
    [effectiveLearningGoalsUnits]
  );
  const totalLearningGoalUnits = useMemo(
    () => (Array.isArray(effectiveLearningGoalsUnits) ? effectiveLearningGoalsUnits.length : 0),
    [effectiveLearningGoalsUnits]
  );
  const hasLearningGoalsContent = totalLearningGoalUnits > 0 || totalLearningGoalLessons > 0;
  const learningGoalsMethodTitle = useMemo(() => 'SAVED UNITS', []);
  const learningGoalsBuildSummaryLine = useMemo(() => (
    `${totalLearningGoalUnits} ${totalLearningGoalUnits === 1 ? 'unit' : 'units'} · ${totalLearningGoalLessons} ${totalLearningGoalLessons === 1 ? 'lesson' : 'lessons'} built`
  ), [totalLearningGoalUnits, totalLearningGoalLessons]);
  const openSubjectSettings = useCallback((tab = 'details') => {
    setEditSettingsInitialTab(tab);
    setShowEditSettingsModal(true);
  }, []);
  const handleSubjectSettingsSaved = useCallback(async (savedSubject, meta = {}) => {
    if (meta?.planData) setSubjectPlanData(meta.planData);
    if (meta?.academicYearId) setSubjectPlanYearId(meta.academicYearId);
    await loadSubjectDetail({ silent: true });
    const subjectId = savedSubject?.id || subject?.id;
    if (!meta?.planData && familyId && subjectId) {
      try {
        const fetched = await findAcademicYearPlanForSubject(familyId, subjectId);
        if (fetched?.academicYearId) setSubjectPlanYearId(fetched.academicYearId);
        if (fetched?.planData) setSubjectPlanData(fetched.planData);
      } catch (_) {}
    }
  }, [familyId, subject?.id, loadSubjectDetail]);
  const openUnitsEditor = useCallback(() => {
    if (hasLearningGoalsContent) {
      setEditUnitsInitialDraft(
        draftFromCurriculumStructure({ units: effectiveLearningGoalsUnits }),
      );
    } else {
      setEditUnitsInitialDraft(null);
    }
    setShowEditUnitsModal(true);
  }, [hasLearningGoalsContent, effectiveLearningGoalsUnits]);
  const handleEditUnitsSaved = useCallback(async () => {
    setClassroomTab((tab) => (tab === 'classwork' ? tab : 'classwork'));
    learningGoalsFetchCooldownUntilRef.current = 0;
    await loadLearningGoalsStructure();
    await loadSubjectDetail({ silent: true });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshSubjects', { detail: { skipSubjectDetailRefresh: false } }));
    }
  }, [loadLearningGoalsStructure, loadSubjectDetail]);
  const handleCreateAssignment = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !subject?.id) return;
    window.dispatchEvent(
      new CustomEvent('openTaskModal', {
        detail: {
          date: new Date(),
          eventType: 'Assignment',
          subjectId: subject.id,
          childIds: assignedChildren,
          childId: assignedChildren[0] || null,
        },
      })
    );
  }, [subject?.id, assignedChildren]);

  const handleScheduleAllLessons = useCallback(() => {
    if (!subject?.id) return;
    if (classroomTab !== 'classwork') {
      pendingScheduleAllRef.current = true;
      setClassroomTab('classwork');
      return;
    }
    dispatchOpenSubjectClassworkScheduleAll(subject.id);
  }, [classroomTab, subject?.id]);

  useEffect(() => {
    if (classroomTab !== 'classwork' || !pendingScheduleAllRef.current || !subject?.id) return;
    pendingScheduleAllRef.current = false;
    dispatchOpenSubjectClassworkScheduleAll(subject.id);
  }, [classroomTab, subject?.id]);

  useEffect(() => {
    const action = String(initialProgressAction || '').trim().toLowerCase();
    if (!action || !subjectId) return;
    const actionKey = `${subjectId}:${action}`;
    if (autoOpenedProgressActionRef.current === actionKey) return;
    autoOpenedProgressActionRef.current = actionKey;
    const t = setTimeout(() => {
      if (action === 'attendance_edit' && SHOW_SUBJECT_ATTENDANCE_SECTION) {
        scrollToSection('attendance-section');
        setShowMarkAllAttendedModal(true);
        return;
      }
      if (action === 'grades_add' && SHOW_SUBJECT_GRADES_SECTION) {
        scrollToSection('grades-section');
        setShowPastEventsGradesModal(true);
        return;
      }
      if (action === 'learning_goals_add') {
        if (SHOW_SUBJECT_UNITS_LESSONS_SECTION) scrollToSection('learning-goals-section');
        openUnitsEditor();
        return;
      }
      if (action === 'learning_goals_edit') {
        if (SHOW_SUBJECT_UNITS_LESSONS_SECTION) scrollToSection('learning-goals-section');
        openUnitsEditor();
        return;
      }
      if (action === 'configure_schedule') {
        openSubjectSettings('schedule');
      }
      if (action === 'classwork' || action === 'schedule_lessons') {
        setClassroomTab('classwork');
      }
    }, 260);
    return () => clearTimeout(t);
  }, [
    initialProgressAction,
    subjectId,
    scrollToSection,
    openUnitsEditor,
    openSubjectSettings,
  ]);

  useEffect(() => {
    const focus = initialClassworkFocus;
    if (!focus || !subjectId) return;
    if (focus.tab) setClassroomTab(focus.tab);
    else setClassroomTab('classwork');
    if (focus.lessonId) {
      setHighlightLessonId(String(focus.lessonId));
      if (highlightClearTimeoutRef.current) clearTimeout(highlightClearTimeoutRef.current);
      highlightClearTimeoutRef.current = setTimeout(() => {
        setHighlightLessonId(null);
        highlightClearTimeoutRef.current = null;
      }, 3200);
    }
    if (focus.assignmentId) {
      setHighlightAssignmentId(String(focus.assignmentId));
      if (highlightClearTimeoutRef.current) clearTimeout(highlightClearTimeoutRef.current);
      highlightClearTimeoutRef.current = setTimeout(() => {
        setHighlightAssignmentId(null);
        highlightClearTimeoutRef.current = null;
      }, 3200);
    }
  }, [initialClassworkFocus, subjectId]);

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
    if (!SHOW_SUBJECT_MATERIALS_SECTION) {
      handleMaterialChipPress(matched);
      return undefined;
    }
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

  const handleDeleteMaterial = useCallback(async (material, options = {}) => {
    if (!material?.id) return;
    const itemName = material.title || material.provider_name || 'this attachment';
    const confirmed = options?.confirmed === true
      ? true
      : (
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.confirm(`Delete "${itemName}"?`)
          : true
      );
    if (!confirmed) return;
    try {
      await archiveMaterial(material.id, familyId);
      toast.push(`${itemName} deleted`, 'success');
      await loadSubjectDetail({ silent: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects', { detail: { skipSubjectDetailRefresh: true } }));
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
      { text: 'Edit Material', action: () => setEditingMaterial(material), icon: Edit2 },
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
      setLearningGoalsUnits([]);
      setLearningGoalsSource(null);
      return;
    }
    const cached = getSubjectProgressCache(familyId, subject.id);
    const nextPlanYearId = cached?.academicYearId || subjectPlanYearIdFromEvents || null;
    setSubjectPlanYearId(nextPlanYearId);
    setSubjectPlanData(cached?.planData || null);
    if (Array.isArray(cached?.curriculumUnits)) {
      setLearningGoalsUnits(cached.curriculumUnits);
    }
    setLearningGoalsSource(cached?.curriculumSavedContentSource || null);
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
      const { familyId: fid, subjectId: sid, forceCurriculumClear } = e.detail || {};
      if (String(fid) !== String(familyId) || String(sid) !== String(subject?.id)) return;
      const cached = getSubjectProgressCache(familyId, subject.id);
      setSubjectPlanYearId(cached?.academicYearId || subjectPlanYearIdFromEvents || null);
      setSubjectPlanData(cached?.planData || null);
      const cachedUnits = Array.isArray(cached?.curriculumUnits) ? cached.curriculumUnits : [];
      const currentUnits = Array.isArray(learningGoalsUnitsRef.current) ? learningGoalsUnitsRef.current : [];
      // Promote warmed cache data when available, but never wipe visible units with an empty cache update.
      if (forceCurriculumClear || cachedUnits.length > 0 || currentUnits.length === 0) {
        setLearningGoalsUnits(cachedUnits);
        setLearningGoalsSource(cached?.curriculumSavedContentSource || null);
      }
    };
    window.addEventListener('subjectProgressPlanCacheUpdated', onCacheUpdate);
    return () => window.removeEventListener('subjectProgressPlanCacheUpdated', onCacheUpdate);
  }, [familyId, subject?.id, subjectPlanYearIdFromEvents]);

  const openAttendanceTargetPreferences = useCallback(() => {
    if (typeof onOpenPlannerSettings === 'function') {
      onOpenPlannerSettings(subject?.school_year || null);
    }
  }, [onOpenPlannerSettings, subject?.school_year]);
  const handleOpenPlanBuilder = useCallback(() => {
    openAttendanceTargetPreferences();
  }, [openAttendanceTargetPreferences]);
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
    const todayYmd = new Date().toISOString().slice(0, 10);
    attendanceRecordsForUI.forEach((record) => {
      const dayKey = String(record?.day_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
      const status = String(record?.status || '').toLowerCase();
      if (!byDay.has(dayKey)) {
        byDay.set(dayKey, { hasPresent: false, hasAbsent: false });
      }
      const bucket = byDay.get(dayKey);
      if (status === 'present') bucket.hasPresent = true;
      if (status === 'absent' && dayKey <= todayYmd) bucket.hasAbsent = true;
    });

    let present = 0;
    let absent = 0;
    byDay.forEach((bucket) => {
      // A day with any "present" counts as present for day-level progress.
      if (bucket.hasPresent) present += 1;
      else if (bucket.hasAbsent) absent += 1;
    });
    const upcomingDaySet = new Set();
    (subjectEvents || []).forEach((event) => {
      if (String(event?.status || '').toLowerCase() === 'canceled') return;
      const dayKey = String(getEventDateKey(event) || '').slice(0, 10);
      if (!dayKey || dayKey <= todayYmd) return;
      const bucket = byDay.get(dayKey);
      if (bucket?.hasPresent || bucket?.hasAbsent) return;
      upcomingDaySet.add(dayKey);
    });
    return {
      present,
      absent,
      upcoming: upcomingDaySet.size,
      total: present + absent,
    };
  }, [attendanceRecordsForUI, subjectEvents, getEventDateKey]);
  const attendanceRate30Display = useMemo(() => {
    if (attendanceRate30 !== null && attendanceRate30 !== undefined && !isNaN(attendanceRate30)) {
      return attendanceRate30;
    }
    if (attendance30Days.total > 0) {
      return Math.round((attendance30Days.present / attendance30Days.total) * 100);
    }
    return null;
  }, [attendanceRate30, attendance30Days]);

  // List view should show all subject events with attendance-aware status tags.
  const attendanceRecordsListUI = useMemo(() => {
    const records = Array.isArray(attendanceRecordsForUI) ? attendanceRecordsForUI : [];
    const attendanceByEventId = new Map();
    const recordPreviewByEventId = new Map();
    const resolveStatusPresentation = ({ hasAttended = false, hasUnattended = false, isUpcoming = false } = {}) => {
      if (hasAttended) return { statusLabel: 'Attended', statusTone: 'attended' };
      if (hasUnattended) return { statusLabel: 'Unattended', statusTone: 'unattended' };
      if (isUpcoming) return { statusLabel: 'Upcoming', statusTone: 'upcoming' };
      return { statusLabel: 'Unattended', statusTone: 'unattended' };
    };
    const normalizeMinutes = (value, fallback = 60) => {
      const mins = Number(value);
      return Number.isFinite(mins) && mins > 0 ? mins : fallback;
    };
    const statusPriority = {
      attended: 3,
      unattended: 2,
      upcoming: 1,
    };
    records.forEach((record) => {
      const eventId = String(record?.event_id || '').trim();
      if (!eventId) return;
      const status = String(record?.status || '').trim().toLowerCase();
      const prev = attendanceByEventId.get(eventId) || {
        hasAttended: false,
        hasUnattended: false,
        minutes: 0,
      };
      if (status === 'present' || status === 'partial') prev.hasAttended = true;
      if (status === 'absent') prev.hasUnattended = true;
      const mins = Number(record?.minutes);
      if (Number.isFinite(mins) && mins > prev.minutes) prev.minutes = mins;
      attendanceByEventId.set(eventId, prev);
      if (!recordPreviewByEventId.has(eventId)) recordPreviewByEventId.set(eventId, record);
    });

    const nowMs = Date.now();
    const todayYmd = new Date(nowMs).toISOString().slice(0, 10);
    const eventRows = (subjectEvents || [])
      .filter((event) => event && event?.is_backlog !== true && String(event?.status || '').toLowerCase() !== 'canceled')
      .map((event) => {
        const eventId = String(event?.id || '').trim();
        const tsRaw = event?.start_ts || event?.due_ts || event?.end_ts || null;
        const tsMs = tsRaw ? new Date(tsRaw).getTime() : NaN;
        const dayKey = tsRaw && Number.isFinite(tsMs) ? String(tsRaw).slice(0, 10) : '';
        const isUpcoming = Number.isFinite(tsMs) && tsMs > nowMs;
        const attendanceMeta = attendanceByEventId.get(eventId);
        const { statusLabel, statusTone } = resolveStatusPresentation({
          hasAttended: attendanceMeta?.hasAttended === true,
          hasUnattended: attendanceMeta?.hasUnattended === true,
          isUpcoming,
        });
        const eventMinutes = (() => {
          if (Number.isFinite(attendanceMeta?.minutes) && attendanceMeta.minutes > 0) return attendanceMeta.minutes;
          const durationMinutes = Number(event?.duration_minutes);
          if (Number.isFinite(durationMinutes) && durationMinutes > 0) return Math.round(durationMinutes);
          const startMs = event?.start_ts ? new Date(event.start_ts).getTime() : NaN;
          const endMs = event?.end_ts ? new Date(event.end_ts).getTime() : NaN;
          if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
            return Math.round((endMs - startMs) / 60000);
          }
          return 60;
        })();
        return {
          id: `event-row-${eventId || Math.random().toString(36).slice(2)}`,
          event_id: eventId || null,
          day_date: dayKey,
          minutes: eventMinutes,
          title: String(event?.title || 'Lesson').trim() || 'Lesson',
          statusLabel,
          statusTone,
          sortTs: Number.isFinite(tsMs) ? tsMs : 0,
        };
      });

    const listedEventIds = new Set(
      eventRows.map((row) => String(row?.event_id || '').trim()).filter(Boolean)
    );
    const orphanRows = [...attendanceByEventId.entries()]
      .filter(([eventId]) => !listedEventIds.has(String(eventId || '').trim()))
      .map(([eventId, attendanceMeta]) => {
        const preview = recordPreviewByEventId.get(eventId) || {};
        const dayKey = String(preview?.day_date || '').slice(0, 10);
        const tsMs = /^\d{4}-\d{2}-\d{2}$/.test(dayKey)
          ? new Date(`${dayKey}T12:00:00`).getTime()
          : NaN;
        const isUpcoming = Number.isFinite(tsMs) && tsMs > nowMs;
        const { statusLabel, statusTone } = resolveStatusPresentation({
          hasAttended: attendanceMeta?.hasAttended === true,
          hasUnattended: attendanceMeta?.hasUnattended === true,
          isUpcoming,
        });
        return {
          id: `orphan-event-row-${eventId}`,
          event_id: eventId,
          day_date: dayKey,
          minutes: normalizeMinutes(attendanceMeta?.minutes, 60),
          title: String(preview?.title || 'Lesson').trim() || 'Lesson',
          statusLabel,
          statusTone,
          sortTs: Number.isFinite(tsMs) ? tsMs : 0,
        };
      });

    const recordOnlyRowsByKey = new Map();
    records.forEach((record, idx) => {
      const eventId = String(record?.event_id || '').trim();
      if (eventId) return;
      const dayKey = String(record?.day_date || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
      const title = 'Lesson';
      const rowKey = `${dayKey}|${title}`;
      const status = String(record?.status || '').toLowerCase();
      const { statusLabel: nextLabel, statusTone: nextTone } = resolveStatusPresentation({
        hasAttended: status === 'present' || status === 'partial',
        hasUnattended: status === 'absent',
        isUpcoming: dayKey > todayYmd,
      });
      const nextMinutes = normalizeMinutes(record?.minutes, 60);
      const tsMs = new Date(`${dayKey}T12:00:00`).getTime();
      const existing = recordOnlyRowsByKey.get(rowKey);
      if (!existing) {
        recordOnlyRowsByKey.set(rowKey, {
          id: `record-only-row-${rowKey}-${idx}`,
          event_id: null,
          day_date: dayKey,
          minutes: nextMinutes,
          title,
          statusLabel: nextLabel,
          statusTone: nextTone,
          sortTs: Number.isFinite(tsMs) ? tsMs : 0,
        });
        return;
      }
      if ((statusPriority[nextTone] || 0) > (statusPriority[existing.statusTone] || 0)) {
        existing.statusTone = nextTone;
        existing.statusLabel = nextLabel;
      }
      if (nextMinutes > Number(existing.minutes || 0)) existing.minutes = nextMinutes;
    });

    return [...eventRows, ...orphanRows, ...recordOnlyRowsByKey.values()]
      .sort((a, b) => Number(a.sortTs || 0) - Number(b.sortTs || 0));
  }, [attendanceRecordsForUI, subjectEvents]);
  useEffect(() => {
    setShowAttendanceExpanded(false);
  }, [attendanceViewMode, subject?.id]);

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
    const schoolYearRange = fullYearRangeFromSchoolYearLabel(subject?.school_year);
    const subjectTermId = normalizeSubjectTerm(subject?.school_term || 'full_year');
    const weekdaysByScope = {};
    (subjectPlanBlocks || []).forEach((block) => {
      const scopeId = normalizeSubjectTerm(block?.scopeId || block?.scope_id || block?.school_term || subjectTermId || 'full_year');
      if (!weekdaysByScope[scopeId]) weekdaysByScope[scopeId] = new Set();
      parseWeekdaysFromPlanBlock(block).forEach((day) => {
        const asInt = Number(day);
        if (Number.isInteger(asInt) && asInt >= 0 && asInt <= 6) weekdaysByScope[scopeId].add(asInt);
      });
    });
    const schoolStartYear = schoolYearRange ? Number(String(schoolYearRange.start_date).slice(0, 4)) : NaN;
    const schoolEndYear = schoolYearRange ? Number(String(schoolYearRange.end_date).slice(0, 4)) : NaN;
    const scopeRangeById = {
      full_year: schoolYearRange || null,
      fall_term: Number.isFinite(schoolStartYear)
        ? { start_date: `${schoolStartYear}-08-01`, end_date: `${schoolStartYear}-12-31` }
        : null,
      spring_term: Number.isFinite(schoolEndYear)
        ? { start_date: `${schoolEndYear}-01-01`, end_date: `${schoolEndYear}-05-31` }
        : null,
    };
    const plannedCapacityDays = Object.entries(weekdaysByScope).reduce((sum, [scopeId, weekdays]) => {
      const range = scopeRangeById[scopeId] || scopeRangeById.full_year;
      if (!range?.start_date || !range?.end_date) return sum;
      return sum + countOccurrencesInRange(range.start_date, range.end_date, [...weekdays]);
    }, 0);
    const unattendedScheduledDateKeys = [];
    let unattendedScheduledDays = 0;
    scheduledDaySet.forEach((dayKey) => {
      if (!presentDaySet.has(dayKey)) {
        unattendedScheduledDays += 1;
        unattendedScheduledDateKeys.push(dayKey);
      }
    });
    unattendedScheduledDateKeys.sort((a, b) => (a < b ? -1 : 1));

    const actual = target.mode === 'days' ? actualDays : actualHours;
    const projected = target.mode === 'days'
      ? Math.max(actualDays, Number(plannedCapacityDays || 0))
      : actualHours;
    const delta = Number((actual - target.value).toFixed(1));
    const remaining = Math.max(0, Number((target.value - actual).toFixed(1)));
    const projectedRemaining = Math.max(0, Number((target.value - projected).toFixed(1)));
    const percent = Math.min(999, Math.round((actual / target.value) * 100));
    const met = actual >= target.value;
    const sourceLabel = target.source === 'subject_plan_target'
      ? 'subject plan target'
      : target.source === 'subject_defaults'
        ? 'subject school year defaults'
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
      projectedDays: target.mode === 'days' ? Number(projected) : null,
      projectedRemainingDays: target.mode === 'days' ? Number(projectedRemaining) : null,
      unattendedScheduledDays,
      unattendedScheduledDateKeys,
    };
  }, [subject, subjectPlanData, attendanceRecordsForUI, subjectEvents, subjectPlanBlocks]);

  // Process graded items
  const gradedItems = useMemo(() => {
    const outcomeEventIds = new Set(
      (eventOutcomes || [])
        .filter((eo) => eo?.grade && eo?.event_id)
        .map((eo) => String(eo.event_id))
    );
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
          date: event?.end_ts || event?.start_ts || eo.created_at,
          score: null,
          possible: null,
          grade: eo.grade,
          percent,
        };
      }),
      ...(subjectData?.events || [])
        .filter((e) => {
          if (!e.grade || outcomeEventIds.has(String(e.id))) return false;
          const eventType = normalizeWorkEventType(e.event_type);
          if (isWorkProducingEventType(eventType)) return false;
          return true;
        })
        .map(e => {
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

  const assignmentAttentionByEventId = subjectData?.assignmentAttentionByEventId;
  const assignmentsNeedingHelp = subjectData?.assignmentsNeedingHelp || [];
  const assignmentsAssignedToStudent = subjectData?.assignmentsAssignedToStudent || [];
  const assignmentsByEventId = subjectData?.assignmentsByEventId || {};
  const subjectAssignments = subjectData?.subjectAssignments || [];
  const gradesPanelChildren = useMemo(() => {
    const idSet = new Set(assignedChildren.map(String));
    (subjectAssignments || []).forEach((assignment) => {
      if (assignment?.child_id) idSet.add(String(assignment.child_id));
    });
    (gradedItems || []).forEach((item) => {
      const childId = item.event?.child_id || item.event?.childId;
      if (childId) idSet.add(String(childId));
    });
    return (children || []).filter((child) => child?.id && idSet.has(String(child.id)));
  }, [children, assignedChildren, subjectAssignments, gradedItems]);
  const isParentViewer =
    session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true;

  const classworkModel = useMemo(
    () => buildSubjectClassworkModel({
      units: effectiveLearningGoalsUnits,
      assignments: subjectAssignments,
      events: subjectEvents,
    }),
    [effectiveLearningGoalsUnits, subjectAssignments, subjectEvents],
  );

  const avgGradePercent = useMemo(() => {
    const vals = (subjectAssignments || [])
      .filter((a) => a?.reviewed_at && a?.grade_value != null && Number.isFinite(Number(a.grade_value)))
      .map((a) => Number(a.grade_value));
    if (!vals.length) return null;
    return vals.reduce((sum, v) => sum + v, 0) / vals.length;
  }, [subjectAssignments]);

  const gradingSettings = useMemo(
    () => parseSubjectGradingSettings(subject?.grading_settings),
    [subject?.grading_settings],
  );

  const classroomStatusSummary = useMemo(() => {
    const parts = [];
    const count = subjectAssignments.length;
    if (count > 0) {
      parts.push(`${count} assignment${count === 1 ? '' : 's'}`);
    }
    if (isParentViewer) {
      const toReview = subjectAssignments.filter(
        (a) => getStudentSubmissionStatusLabel(a) === 'Submitted',
      ).length;
      if (toReview > 0) parts.push(`${toReview} to review`);
    }
    return parts.length > 0 ? parts.join(' · ') : null;
  }, [subjectAssignments, isParentViewer]);

  const unitsEditorLabel = hasLearningGoalsContent ? 'Edit units' : 'Add units';

  const bulletinTabCaption = 'Recent activity and communications';
  const classworkTabCaption = classworkModel.unscheduledLessonCount > 0
    ? `${classworkModel.unscheduledLessonCount} lesson${classworkModel.unscheduledLessonCount === 1 ? '' : 's'} not scheduled`
    : 'Organize lessons and assignments';
  const gradesTabCaption = 'Review grades and missing work';

  const openEventWorkflow = useCallback((event, {
    parentFocus = null,
    childFocus = null,
    sendOnly = false,
    submissionViewOnly = false,
    assignment = null,
  } = {}) => {
    if (!event?.id || Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (sendOnly || parentFocus === 'send') {
      window.dispatchEvent(new CustomEvent('openNudgeForEvent', {
        detail: { eventId: event.id, initialEvent: event },
      }));
      return;
    }
    if (parentFocus === 'help' && assignment) {
      window.dispatchEvent(new CustomEvent('openHelpForAssignment', { detail: { assignment } }));
      return;
    }
    if (parentFocus === 'submission' && assignment) {
      openAssignmentForParent(assignment, { linkedEvent: event, view: 'submissions' });
      return;
    }
    if (childFocus === 'submission') {
      window.dispatchEvent(new CustomEvent('openEventModal', {
        detail: {
          eventId: event.id,
          initialEvent: event,
          schedulingMode: true,
          childEventFocus: 'submission',
          submissionViewOnly,
          assignment,
        },
      }));
      return;
    }
    window.dispatchEvent(
      new CustomEvent('openEventModal', {
        detail: {
          eventId: event.id,
          initialEvent: event,
          schedulingMode: true,
        },
      })
    );
  }, []);

  const handleMessageAboutAssignment = useCallback((event, assignment) => {
    setMessageModalContext({ event, assignment: assignment || null });
  }, []);

  const handleSubmittalAction = useCallback((event, assignment, viewOnly = false) => {
    const status = String(assignment?.status || '').trim().toLowerCase();
    const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
    const isReviewed =
      reviewStatus === 'reviewed' ||
      reviewStatus === 'approved' ||
      status === 'reviewed' ||
      status === 'accepted';
    const isSubmitted = status === 'submitted' && !isReviewed;

    if (isParentViewer) {
      if (assignment && (isSubmitted || isReviewed || viewOnly)) {
        setReviewAssignment(assignment);
      } else {
        setSubmittalRequestContext({ event, assignment: assignment || null });
      }
      return;
    }
    setSubmitModalContext({ event, assignment: assignment || null, viewOnly });
  }, [isParentViewer]);

  const refreshSubjectAfterAssignmentWorkflow = useCallback(() => {
    loadSubjectDetail({ silent: true });
  }, [loadSubjectDetail]);

  const attendanceTargetGuidance = useMemo(() => {
    if (!attendanceTargetProgress || attendanceTargetProgress.mode !== 'days') return null;
    const remainingDays = Math.max(0, Number(attendanceTargetProgress.remaining) || 0);
    const unattended = Math.max(0, attendanceTargetProgress.unattendedScheduledDays || 0);
    const markPrevious = Math.min(remainingDays, unattended);
    const addDays = Math.max(0, remainingDays - markPrevious);
    return { markPrevious, addDays };
  }, [attendanceTargetProgress]);

  const attendanceGapAmount = useMemo(() => {
    if (!attendanceTargetProgress) return 0;
    if (attendanceTargetProgress.mode === 'days') {
      const projectedGap = Math.max(0, Number(attendanceTargetProgress.projectedRemainingDays) || 0);
      if (projectedGap > 0) return projectedGap;
    }
    return Math.max(0, Number(attendanceTargetProgress.remaining) || 0);
  }, [attendanceTargetProgress]);
  const sessionsGapSurplusDays = useMemo(() => {
    if (!attendanceTargetProgress) return 0;
    const projected = attendanceTargetProgress.mode === 'days'
      ? Number(attendanceTargetProgress.projectedDays ?? attendanceTargetProgress.actual ?? 0)
      : Number(attendanceTargetProgress.actual ?? 0);
    const target = Number(attendanceTargetProgress.target ?? 0);
    return Math.max(0, Number((projected - target).toFixed(1)));
  }, [attendanceTargetProgress]);
  const sessionsPlanningStatus = useMemo(() => {
    if (!attendanceTargetProgress) return 'no_target';
    if (sessionsGapSurplusDays > 0) return 'ahead';
    if (attendanceGapAmount > 0) return 'gap';
    return 'on_track';
  }, [attendanceTargetProgress, attendanceGapAmount, sessionsGapSurplusDays]);
  const showAttendanceGapChip = Boolean(
    attendanceTargetProgress
    && !attendanceTargetProgress.met
    && attendanceGapAmount > 0
  );

  const attendanceCatchUpSuggestion = useMemo(() => {
    if (!attendanceTargetProgress || attendanceTargetProgress.mode !== 'days' || attendanceGapAmount <= 0) return null;
    const schoolYearRange = fullYearRangeFromSchoolYearLabel(subject?.school_year);
    const planStartYmd = String(schoolYearRange?.start_date || subjectPlanData?.plan?.start_date || '').slice(0, 10);
    const planEndYmd = String(schoolYearRange?.end_date || subjectPlanData?.plan?.end_date || '').slice(0, 10);
    if (!DATE_KEY_RE.test(planEndYmd)) return null;
    const cadenceDayNums = [...new Set(
      (subjectPlanBlocks || [])
        .flatMap((block) => parseWeekdaysFromPlanBlock(block))
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 5)
    )].sort((a, b) => a - b);
    const planningWeeks = (() => {
      if (!DATE_KEY_RE.test(planStartYmd) || !DATE_KEY_RE.test(planEndYmd)) return 40;
      const startMs = new Date(`${planStartYmd}T12:00:00`).getTime();
      const endMs = new Date(`${planEndYmd}T12:00:00`).getTime();
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 40;
      return Math.max(1, Math.ceil(((endMs - startMs) / (24 * 60 * 60 * 1000) + 1) / 7));
    })();
    const raw = attendanceGapAmount / planningWeeks;
    const low = raw > 0 ? Math.min(7, Math.max(1, Math.floor(raw))) : 0;
    const high = raw > 0 ? Math.min(7, Math.max(low, Math.ceil(raw))) : 0;
    const missingWeekdays = [1, 2, 3, 4, 5].filter((day) => !cadenceDayNums.includes(day));
    const suggestedAddedDayNums = (() => {
      if (high <= 0) return [];
      const pool = missingWeekdays.length > 0 ? missingWeekdays : [1, 2, 3, 4, 5];
      return pool.slice(0, Math.min(pool.length, high));
    })();
    const suggestedAddedDaysLabel = suggestedAddedDayNums
      .map((day) => WEEKDAY_SHORT[day])
      .filter(Boolean)
      .join(', ');
    const daysForExtensionRange = cadenceDayNums.length > 0 ? cadenceDayNums : suggestedAddedDayNums;
    const baselineSessionsPerWeek = Number(attendanceTargetProgress?.scheduledDays || 0) > 0
      ? (Number(attendanceTargetProgress.scheduledDays || 0) / Math.max(1, planningWeeks))
      : Math.max(1, cadenceDayNums.length);
    const extendWeeks = raw > 0
      ? Math.min(52, Math.max(1, Math.ceil(attendanceGapAmount / Math.max(1, baselineSessionsPerWeek))))
      : 0;
    const suggestedEndYmd = extendWeeks > 0 ? addDaysToYmd(planEndYmd, extendWeeks * 7) : null;
    const extensionStartYmd = suggestedEndYmd ? addDaysToYmd(planEndYmd, 1) : null;
    const extensionAddedDates = extensionStartYmd && suggestedEndYmd
      ? listDatesForWeekdaysInRange(extensionStartYmd, suggestedEndYmd, daysForExtensionRange)
      : [];
    const extensionAddedDatesLabel = (() => {
      if (!cadenceDayNums.length && suggestedAddedDaysLabel) return suggestedAddedDaysLabel;
      if (!Array.isArray(extensionAddedDates) || extensionAddedDates.length === 0) return '';
      const shown = extensionAddedDates.slice(0, 8).map((ymd) => formatDateDisplayYmd(ymd)).filter(Boolean);
      if (shown.length === 0) return '';
      const remaining = extensionAddedDates.length - shown.length;
      return remaining > 0 ? `${shown.join(', ')} (+${remaining} more)` : shown.join(', ');
    })();
    const planStartLabel = formatDateDisplayYmd(planStartYmd) || planStartYmd;
    const planEndLabel = formatDateDisplayYmd(planEndYmd) || planEndYmd;
    const suggestionSummaryText = (suggestedEndYmd && cadenceDayNums.length > 0)
      ? 'Extend term length and add multiple class days a week.'
      : (!cadenceDayNums.length && planStartLabel && planEndLabel && suggestedAddedDaysLabel)
        ? `Use Schedule from ${planStartLabel} to ${planEndLabel} on ${suggestedAddedDaysLabel}.`
      : (suggestedEndYmd
        ? 'Extend term length or add class days per week.'
        : (cadenceDayNums.length > 0 ? 'Add class days per week.' : ''));
    return {
      low,
      high,
      suggestedEndYmd,
      suggestionSummaryText,
      extensionAddedDatesLabel,
    };
  }, [attendanceTargetProgress, attendanceGapAmount, subject?.school_year, subjectPlanData?.plan?.start_date, subjectPlanData?.plan?.end_date, subjectPlanBlocks]);

  useEffect(() => {
    if (!showAttendanceGapChip) {
      setShowAttendanceGapSuggestion(false);
    }
  }, [showAttendanceGapChip]);

  const openAttendanceSuggestionConfirmModal = useCallback(() => {
    if (!attendanceCatchUpSuggestion?.suggestedEndYmd) return;
    setShowAttendanceSuggestionConfirmModal(true);
  }, [attendanceCatchUpSuggestion?.suggestedEndYmd]);

  const closeAttendanceSuggestionConfirmModal = useCallback(() => {
    if (applyingAttendanceSuggestion) return;
    setShowAttendanceSuggestionConfirmModal(false);
  }, [applyingAttendanceSuggestion]);

  const confirmApplyAttendanceSuggestion = useCallback(async () => {
    const suggestedEndYmd = String(attendanceCatchUpSuggestion?.suggestedEndYmd || '').slice(0, 10);
    if (!suggestedEndYmd) return;
    if (!familyId) {
      toast?.push?.('Missing family context.', 'error');
      return;
    }
    setApplyingAttendanceSuggestion(true);
    try {
      let academicYearId = subjectPlanYearId || subjectPlanYearIdFromEvents || null;
      if (!academicYearId && subject?.id) {
        const fetched = await findAcademicYearPlanForSubject(familyId, subject.id);
        academicYearId = fetched?.academicYearId || fetched?.id || null;
      }
      if (!academicYearId) {
        toast?.push?.('No saved plan found. Create a plan first.', 'info');
        return;
      }
      const { data: yearDetail, error: yearError } = await getAcademicYear(academicYearId);
      if (yearError) throw yearError;
      const plan = yearDetail?.plan || {};
      const startDate = String(plan?.start_date || yearDetail?.start_date || '').slice(0, 10);
      const currentEndDate = String(plan?.end_date || yearDetail?.end_date || '').slice(0, 10);
      if (!startDate) throw new Error('Plan start date is missing.');
      const nextEndDate = suggestedEndYmd > currentEndDate ? suggestedEndYmd : currentEndDate;
      if (!nextEndDate) throw new Error('Suggested end date is missing.');
      const holidaySettings = yearDetail?.holiday_settings || {};
      const holidayRegion = holidaySettings.holiday_region
        || (holidaySettings.holiday_country_code
          ? `${holidaySettings.holiday_country_code}${holidaySettings.holiday_region ? `:${holidaySettings.holiday_region}` : ''}`
          : 'US');
      const customHolidays = Array.isArray(yearDetail?.holidays)
        ? yearDetail.holidays
            .filter((h) => (h?.type || 'CUSTOM_HOLIDAY') === 'CUSTOM_HOLIDAY')
            .map((h) => ({
              date: typeof h?.date === 'string' ? h.date.slice(0, 10) : String(h?.date || '').slice(0, 10),
              name: h?.name || '',
              type: h?.type || 'CUSTOM_HOLIDAY',
            }))
        : [];
      const { data: exclusions } = await getAcademicYearExclusions(academicYearId);
      const customBreaks = Array.isArray(exclusions)
        ? exclusions
            .filter((entry) => entry?.exclusion_type === 'break')
            .map((entry) => ({
              start: typeof entry?.start_date === 'string' ? entry.start_date.slice(0, 10) : String(entry?.start_date || '').slice(0, 10),
              end: typeof entry?.end_date === 'string' ? entry.end_date.slice(0, 10) : String(entry?.end_date || '').slice(0, 10),
              name: entry?.label || 'Break',
            }))
        : [];
      const blocks = Array.isArray(plan?.blocks)
        ? plan.blocks.map((block) => ({
            block_id: block?.block_id || undefined,
            subject_id: block?.subject_id ?? null,
            placeholder_label: block?.placeholder_label || undefined,
            child_ids: Array.isArray(block?.child_ids) ? block.child_ids : [],
            weekdays: Array.isArray(block?.weekdays) ? block.weekdays : [],
            start_time: block?.start_time || '09:00',
            end_time: block?.end_time || '10:00',
            all_day: !!block?.all_day,
          }))
        : [];
      const payload = {
        academic_year_id: academicYearId,
        family_id: familyId,
        start_date: startDate,
        end_date: nextEndDate,
        follow_public_holidays: holidaySettings.follow_global_holidays !== false,
        holiday_region: holidayRegion,
        excluded_holiday_dates: holidaySettings.excluded_holiday_dates || [],
        custom_holidays: customHolidays,
        custom_breaks: customBreaks,
        target_instructional_days: (plan?.constraint_mode === 'days' ? plan?.target_days : null) ?? 180,
        subjects: [...new Set(blocks.map((b) => b?.subject_id).filter(Boolean))],
        constraint_mode: plan?.constraint_mode || 'none',
        target_days: plan?.target_days ?? null,
        target_hours: plan?.target_hours ?? null,
        replace_placeholders: true,
        blocks,
        year_name: yearDetail?.year_name || undefined,
        timezone: getClientTimezone(),
      };
      const { error } = await applyToCalendar(payload);
      if (error) throw error;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects', { detail: { skipSubjectDetailRefresh: true } }));
        window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
        window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }));
        window.dispatchEvent(new CustomEvent('planAppliedToCalendar'));
      }
      setShowAttendanceSuggestionConfirmModal(false);
      await loadSubjectDetail({ silent: true });
      toast?.push?.(
        `Applied suggestion: extended term to ${formatDateDisplayYmd(nextEndDate)}.`,
        'success'
      );
    } catch (err) {
      toast?.push?.(err?.message || 'Failed to apply suggestion.', 'error');
    } finally {
      setApplyingAttendanceSuggestion(false);
    }
  }, [attendanceCatchUpSuggestion?.suggestedEndYmd, familyId, subjectPlanYearId, subjectPlanYearIdFromEvents, subject?.id, toast, loadSubjectDetail]);

  const attendanceTargetCard = attendanceTargetProgress ? (
    <View style={styles.attendanceTargetCard}>
      <View style={styles.attendanceTargetTopLine}>
        {!attendanceTargetProgress.met ? (
          <Text style={styles.attendanceTargetGapPill}>
            {attendanceGapAmount}
            {attendanceTargetProgress.mode === 'days' ? ' days short' : ' hours short'}
          </Text>
        ) : (
          <Text style={styles.attendanceTargetMetPill}>
            On target
          </Text>
        )}
        {attendanceCatchUpSuggestion && attendanceCatchUpSuggestion.low > 0 ? (
          <View style={styles.attendanceTargetPaceWrap}>
            <Text style={styles.attendanceTargetPaceArrow}>→</Text>
            <Text style={styles.attendanceTargetPaceText}>
              {`+${attendanceCatchUpSuggestion.low}${attendanceCatchUpSuggestion.high > attendanceCatchUpSuggestion.low ? `-${attendanceCatchUpSuggestion.high}` : ''}/week`}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.attendanceTargetSourceRow}>
        <Text style={styles.attendanceTargetSourceText}>
          {`Gap is based on saved ${attendanceTargetProgress.sourceLabel}: ${attendanceTargetProgress.target} ${attendanceTargetProgress.mode}.`}
        </Text>
        <TouchableOpacity
          onPress={openAttendanceTargetPreferences}
          style={styles.attendanceTargetApplyButton}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Change saved goal"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={styles.attendanceTargetApplyButtonText}>Change saved goal</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.attendanceTargetSuggestionLine}>
        {`Suggestion: ${attendanceCatchUpSuggestion?.suggestionSummaryText || 'Extend term length or add class days per week.'}`}
      </Text>
      <View style={styles.attendanceTargetSuggestionLineRow}>
        <Text style={styles.attendanceTargetSuggestionLine}>
          {`Suggested days: ${attendanceCatchUpSuggestion?.extensionAddedDatesLabel || 'Add class days per week'}.`}
        </Text>
        {attendanceGapAmount > 0 && attendanceCatchUpSuggestion?.suggestedEndYmd ? (
          <TouchableOpacity
            style={styles.attendanceTargetApplyButton}
            onPress={openAttendanceSuggestionConfirmModal}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.attendanceTargetApplyButtonText}>Apply</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  ) : null;

  const attendanceViewModeControls = (
    <View style={styles.attendanceViewsShell}>
      <View style={styles.attendanceViewsContainer}>
        <Text style={styles.attendanceViewsLabel}>Views</Text>
        <View style={styles.attendanceViewsChipsGroup}>
          <TouchableOpacity
            style={[styles.attendanceViewChip, attendanceViewMode === 'list' && styles.attendanceViewChipActive]}
            onPress={() => setAttendanceViewMode('list')}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={styles.attendanceViewChipInner}>
              <List size={12} color={attendanceViewMode === 'list' ? '#6BB3E8' : '#6B7280'} />
              <Text style={[styles.attendanceViewChipText, attendanceViewMode === 'list' && styles.attendanceViewChipTextActive]}>
                List
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.attendanceViewChip, attendanceViewMode === 'month' && styles.attendanceViewChipActive]}
            onPress={() => setAttendanceViewMode('month')}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={styles.attendanceViewChipInner}>
              <Calendar size={12} color={attendanceViewMode === 'month' ? '#6BB3E8' : '#6B7280'} />
              <Text style={[styles.attendanceViewChipText, attendanceViewMode === 'month' && styles.attendanceViewChipTextActive]}>
                Month
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.attendanceViewChip, attendanceViewMode === 'year' && styles.attendanceViewChipActive]}
            onPress={() => setAttendanceViewMode('year')}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <View style={styles.attendanceViewChipInner}>
              <BarChart3 size={12} color={attendanceViewMode === 'year' ? '#6BB3E8' : '#6B7280'} />
              <Text style={[styles.attendanceViewChipText, attendanceViewMode === 'year' && styles.attendanceViewChipTextActive]}>
                Year
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const attendanceSummaryChips = (
    <>
      <View style={styles.attendanceSummaryWrap}>
        <View style={styles.attendanceToolbarRow}>
          {attendanceViewModeControls}
          <View style={styles.attendanceKeyShell}>
            <View style={styles.attendanceKeyRow}>
              <View style={styles.attendanceKeyPill}>
                <View style={[styles.attendanceKeyDot, styles.attendanceKeyDotAttended]} />
                <Text style={styles.attendanceKeyText}>Attended</Text>
              </View>
              <View style={styles.attendanceKeyPill}>
                <View style={[styles.attendanceKeyDot, styles.attendanceKeyDotUnattended]} />
                <Text style={styles.attendanceKeyText}>Unattended</Text>
              </View>
              <View style={styles.attendanceKeyPill}>
                <View style={[styles.attendanceKeyDot, styles.attendanceKeyDotUpcoming]} />
                <Text style={styles.attendanceKeyText}>Upcoming</Text>
              </View>
              <View style={styles.attendanceKeyPill}>
                <View style={[styles.attendanceKeyDot, styles.attendanceKeyDotNoEvents]} />
                <Text style={styles.attendanceKeyText}>No events</Text>
              </View>
            </View>
          </View>
          <View style={styles.attendanceCountShell}>
            <View style={styles.attendanceCountContainer}>
              <Text style={styles.attendanceCountLabel}>Count</Text>
              <View style={styles.attendanceChips}>
                <View style={styles.attendanceChip}>
                  <CheckCircle size={14} color="#6BB3E8" />
                  <Text style={styles.attendanceChipText}>
                    {attendance30Days.present} Attended
                  </Text>
                </View>
                <View style={styles.attendanceChip}>
                  <XCircle size={14} color="#EF4444" />
                  <Text style={styles.attendanceChipText}>
                    {attendance30Days.absent} Unattended
                  </Text>
                </View>
                <View style={styles.attendanceChip}>
                  <CheckCircle size={14} color="#C7DDF6" />
                  <Text style={styles.attendanceChipText}>
                    {attendance30Days.upcoming || 0} Upcoming
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </>
  );

  const openAssignedWorkItem = useCallback((a, linkedEvent = null) => {
    if (!a) return;

    if (isParentViewer) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        openAssignmentForParent(a, { linkedEvent });
        return;
      }
    }

    const eid = firstLinkedEventId(a.linked_event_ids) || linkedEvent?.id;
    if (eid && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: { eventId: eid, initialEvent: linkedEvent || null, schedulingMode: true },
        })
      );
      return;
    }
    setAssignedDetailAssignment(a);
  }, [isParentViewer]);

  const openAssignmentInClasswork = useCallback((assignment) => {
    if (!assignment?.id) return;
    setClassroomTab('classwork');
    setHighlightAssignmentId(String(assignment.id));
    if (highlightClearTimeoutRef.current) clearTimeout(highlightClearTimeoutRef.current);
    highlightClearTimeoutRef.current = setTimeout(() => {
      setHighlightAssignmentId(null);
      highlightClearTimeoutRef.current = null;
    }, 3200);
  }, []);

  const handleAssignmentActivityPress = useCallback((item) => {
    if (!item?.assignmentId) return;
    const match = subjectAssignments.find(
      (a) => String(a.id) === String(item.assignmentId),
    );
    if (match) openAssignedWorkItem(match);
  }, [subjectAssignments, openAssignedWorkItem]);

  const handleClassworkPlacementChanged = useCallback(async () => {
    learningGoalsFetchCooldownUntilRef.current = 0;
    await loadLearningGoalsStructure();
    await loadSubjectDetail({ silent: true });
  }, [loadLearningGoalsStructure, loadSubjectDetail]);

  const gapAcademicYearId = subjectPlanYearId || subjectPlanYearIdFromEvents || null;

  const reloadGapHistory = useCallback(async () => {
    if (!familyId || !subject?.id || !gapAcademicYearId) {
      setGapHistoryRuns([]);
      return [];
    }
    const { runs } = await loadSubjectFixGapHistory({
      familyId,
      academicYearId: gapAcademicYearId,
      subjectId: subject.id,
    });
    setGapHistoryRuns(runs);
    return runs;
  }, [familyId, subject?.id, gapAcademicYearId]);

  const gapHistoryRunDetails = useMemo(
    () => buildFixGapHistoryRunDetails(gapHistoryRuns, subject?.id),
    [gapHistoryRuns, subject?.id],
  );

  const canUndoGapAnalysis = useMemo(() => {
    const latest = getLatestUndoableFixGapEntry(gapHistoryRuns);
    return canUndoFixGapEntry(latest);
  }, [gapHistoryRuns]);

  const closeGapAnalysisModal = useCallback(() => {
    if (gapAnalysisWorking || gapUndoing) return;
    gapPreviewRef.current = null;
    setGapSlotLines([]);
    setGapModal({
      visible: false,
      title: '',
      message: '',
      loading: false,
      working: false,
      showConfirm: false,
      confirmLabel: 'OK',
      cancelLabel: 'Close',
      mode: 'info',
    });
  }, [gapAnalysisWorking, gapUndoing]);

  const openGapAnalysisModal = useCallback(() => {
    if (!familyId || !subject?.id || gapAnalysisWorking || gapUndoing) return;
    const gapMode = attendanceTargetProgress?.mode === 'hours' ? 'hours' : 'days';
    const unit = gapMode === 'hours' ? 'hour' : 'day';
    const units = gapMode === 'hours' ? 'hours' : 'days';

    reloadGapHistory();
    setGapSlotLines([]);

    if (sessionsPlanningStatus === 'no_target') {
      gapPreviewRef.current = null;
      setGapModal({
        visible: true,
        title: 'Gap analysis',
        message: 'No year target is set for this subject yet.\n\nSet an instructional day target in School Year Settings to compare planned sessions against your goal.',
        loading: false,
        working: false,
        showConfirm: false,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        mode: 'info',
      });
      return;
    }

    if (sessionsPlanningStatus === 'on_track') {
      gapPreviewRef.current = null;
      setGapModal({
        visible: true,
        title: 'Gap analysis',
        message: `You are on track for your year target of ${attendanceTargetProgress.target} ${units}.`,
        loading: false,
        working: false,
        showConfirm: false,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        mode: 'info',
      });
      return;
    }

    if (sessionsPlanningStatus === 'ahead') {
      const rounded = gapMode === 'hours'
        ? Number(sessionsGapSurplusDays).toFixed(1)
        : Math.round(sessionsGapSurplusDays);
      gapPreviewRef.current = null;
      setGapModal({
        visible: true,
        title: 'Gap analysis',
        message: `Projected ${rounded} ${Number(rounded) === 1 ? unit : units} ahead of your year target of ${attendanceTargetProgress.target} ${units}.`,
        loading: false,
        working: false,
        showConfirm: false,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        mode: 'info',
      });
      return;
    }

    gapPreviewRef.current = null;
    setGapModal({
      visible: true,
      title: 'Gap analysis',
      message: 'Checking open learning windows in your saved school year range…',
      loading: true,
      working: false,
      showConfirm: false,
      confirmLabel: 'Add sessions',
      cancelLabel: 'Cancel',
      mode: 'add_sessions',
    });

    (async () => {
      try {
        const plan = subjectPlanData?.plan || {};
        const schoolYearRange = fullYearRangeFromSchoolYearLabel(subject?.school_year);
        const preview = await previewSubjectGapFix({
          familyId,
          subjectId: subject.id,
          academicYearId: gapAcademicYearId,
          attendanceTargetProgress,
          planRange: {
            startYmd: String(plan?.start_date || schoolYearRange?.start_date || '').slice(0, 10),
            endYmd: String(plan?.end_date || schoolYearRange?.end_date || '').slice(0, 10),
          },
        });
        gapPreviewRef.current = preview;
        if (preview.noCapacity) {
          setGapSlotLines([]);
          setGapModal({
            visible: true,
            title: 'Gap analysis',
            message: `You are projected ${Math.round(preview.requestedGap)} ${units} short, but no open learning windows remain in your saved range.\n\nTry extending the school year or adding more learning days in School Year Settings.`,
            loading: false,
            working: false,
            showConfirm: false,
            confirmLabel: 'OK',
            cancelLabel: 'Close',
            mode: 'info',
          });
          return;
        }
        const previewSlots = normalizeFixGapSlots(
          Array.isArray(preview.dryRunPreview?.selectedAssignments)
            ? preview.dryRunPreview.selectedAssignments
            : (Array.isArray(preview.dryRunPreview?.debugSelectedSlots) ? preview.dryRunPreview.debugSelectedSlots : []),
          { subjectId: subject.id, subjectName: subject?.name || '' },
        );
        setGapSlotLines(previewSlots.map((slot) => formatFixGapHistorySlotLabel(slot)));
        setGapModal({
          visible: true,
          title: 'Close the gap?',
          message: [
            `You are projected ${Math.round(preview.requestedGap)} ${unit}${Math.round(preview.requestedGap) === 1 ? '' : 's'} short of your ${preview.targetDays} ${units} target.`,
            '',
            `We found ${preview.sessionsToAdd} open learning window${preview.sessionsToAdd === 1 ? '' : 's'} on your normal schedule.`,
            'New sessions will skip holidays and breaks. Unscheduled curriculum lessons will be linked when possible.',
          ].join('\n'),
          loading: false,
          working: false,
          showConfirm: true,
          confirmLabel: 'Add sessions',
          cancelLabel: 'Cancel',
          mode: 'add_sessions',
        });
      } catch (err) {
        setGapSlotLines([]);
        setGapModal({
          visible: true,
          title: 'Gap analysis',
          message: err?.message || 'Could not analyze the gap right now.',
          loading: false,
          working: false,
          showConfirm: false,
          confirmLabel: 'OK',
          cancelLabel: 'Close',
          mode: 'info',
        });
      }
    })();
  }, [
    familyId,
    subject?.id,
    subject?.name,
    subject?.school_year,
    gapAnalysisWorking,
    gapUndoing,
    gapAcademicYearId,
    reloadGapHistory,
    sessionsPlanningStatus,
    sessionsGapSurplusDays,
    attendanceTargetProgress,
    subjectPlanData?.plan,
  ]);

  const confirmGapAnalysisModal = useCallback(async () => {
    if (gapModal.mode === 'done' || gapModal.mode === 'info' || !gapModal.showConfirm) {
      closeGapAnalysisModal();
      return;
    }
    const preview = gapPreviewRef.current;
    if (!preview?.payloadBase) {
      closeGapAnalysisModal();
      return;
    }
    setGapModal((prev) => ({ ...prev, working: true }));
    setGapAnalysisWorking(true);
    try {
      const result = await executeSubjectGapFix({
        familyId,
        subjectId: subject.id,
        payloadBase: preview.payloadBase,
        subjectEvents,
        units: effectiveLearningGoalsUnits,
      });
      const localEntry = buildLocalFixGapHistoryEntry({
        fixResult: result.fixResult,
        subjectId: subject.id,
        subjectName: subject?.name || '',
      });
      if (localEntry && gapAcademicYearId) {
        appendLocalFixGapHistoryEntry({
          familyId,
          academicYearId: gapAcademicYearId,
          subjectId: subject.id,
          entry: localEntry,
        });
      }
      await reloadGapHistory();
      await handleClassworkPlacementChanged();
      gapPreviewRef.current = null;
      setGapSlotLines([]);
      setGapModal({
        visible: true,
        title: 'Gap closed',
        message: [
          result.summary,
          result.lessonsLinked > 0
            ? 'New sessions appear on your planner; linked lessons show on Learning Schedule.'
            : 'New sessions appear on your planner.',
        ].join('\n\n'),
        loading: false,
        working: false,
        showConfirm: true,
        confirmLabel: 'Done',
        cancelLabel: 'Close',
        mode: 'done',
      });
    } catch (err) {
      setGapModal({
        visible: true,
        title: 'Could not add sessions',
        message: err?.message || 'Something went wrong.',
        loading: false,
        working: false,
        showConfirm: false,
        confirmLabel: 'OK',
        cancelLabel: 'Close',
        mode: 'info',
      });
    } finally {
      setGapAnalysisWorking(false);
    }
  }, [
    gapModal.mode,
    gapModal.showConfirm,
    familyId,
    subject?.id,
    subject?.name,
    gapAcademicYearId,
    subjectEvents,
    effectiveLearningGoalsUnits,
    closeGapAnalysisModal,
    reloadGapHistory,
    handleClassworkPlacementChanged,
  ]);

  const handleUndoGapAnalysis = useCallback(async () => {
    if (gapUndoing || gapAnalysisWorking || !canUndoGapAnalysis) return;
    setGapUndoing(true);
    try {
      const result = await undoSubjectFixGapLatest({
        familyId,
        academicYearId: gapAcademicYearId,
        subjectId: subject.id,
        historyRuns: gapHistoryRuns,
      });
      setGapHistoryRuns(result.runs);
      await handleClassworkPlacementChanged();
      setGapSlotLines([]);
      setGapModal((prev) => ({
        ...prev,
        title: 'Undo complete',
        message: result.summary,
        showConfirm: false,
        confirmLabel: 'OK',
        mode: 'info',
      }));
    } catch (err) {
      setGapModal((prev) => ({
        ...prev,
        title: 'Could not undo',
        message: err?.message || 'Something went wrong.',
        showConfirm: false,
        mode: 'info',
      }));
    } finally {
      setGapUndoing(false);
    }
  }, [
    gapUndoing,
    gapAnalysisWorking,
    canUndoGapAnalysis,
    familyId,
    subject?.id,
    gapAcademicYearId,
    gapHistoryRuns,
    handleClassworkPlacementChanged,
  ]);

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
  const handleOpenExportForSection = useCallback((sectionType) => {
    if (typeof onOpenExportModalForSection === 'function') {
      onOpenExportModalForSection(sectionType);
      return;
    }
    setShowExportComingSoonModal(true);
  }, [onOpenExportModalForSection]);

  const hasGradesAttention = useMemo(() => {
    if (!isParentViewer || !assignmentAttentionByEventId) return false;
    return gradedItems.some((item) => {
      if (!item.eventId) return false;
      const a = assignmentAttentionByEventId[item.eventId];
      return a && (a.needHelp || a.needsSubmissionReview);
    });
  }, [isParentViewer, gradedItems, assignmentAttentionByEventId]);
  const showAssignedToStudentButton = false;

  const handleOpenEventDetails = useCallback((eventId, initialEvent) => {
    if (!eventId) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: { eventId, initialEvent: initialEvent || null, schedulingMode: true },
        })
      );
      return;
    }
    if (initialEvent?.subject_id || initialEvent?.subjectId) {
      onEditSubject?.(initialEvent.subject_id || initialEvent.subjectId);
    }
  }, [onEditSubject]);
  const handleSubjectEventPress = useCallback((event) => {
    if (!event?.id) return;
    handleOpenEventDetails(event.id, event);
  }, [handleOpenEventDetails]);

  const handleEventContextMenu = useCallback((event, nativeEvent) => {
    if (!event?.id || Platform.OS !== 'web' || typeof window === 'undefined') return;
    nativeEvent?.preventDefault?.();
    nativeEvent?.stopPropagation?.();
    let x =
      nativeEvent?.clientX ??
      nativeEvent?.pageX ??
      nativeEvent?.x ??
      nativeEvent?.nativeEvent?.clientX ??
      nativeEvent?.nativeEvent?.pageX ??
      nativeEvent?.nativeEvent?.x;
    let y =
      nativeEvent?.clientY ??
      nativeEvent?.pageY ??
      nativeEvent?.y ??
      nativeEvent?.nativeEvent?.clientY ??
      nativeEvent?.nativeEvent?.pageY ??
      nativeEvent?.nativeEvent?.y;
    if ((x == null || y == null) && nativeEvent?.target?.getBoundingClientRect) {
      const rect = nativeEvent.target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    window.dispatchEvent(
      new CustomEvent('plannerEventContextMenu', {
        detail: { event, position: { x: x ?? 0, y: y ?? 0 } },
      })
    );
  }, []);
  const handleOpenAddEventForDate = useCallback((dateKey) => {
    const normKey = String(dateKey || '').slice(0, 10);
    if (!normKey || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const childIds = [...new Set((assignedChildren || []).map((id) => String(id || '').trim()).filter(Boolean))];
    const detail = {
      subjectId: subject?.id ? String(subject.id) : null,
      eventType: 'Lesson',
      date: new Date(`${normKey}T12:00:00`),
      childIds,
      childId: childIds[0] || null,
    };
    window.dispatchEvent(new CustomEvent('openTaskModal', { detail }));
  }, [assignedChildren, subject?.id]);

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
    if (!eventId || !status) return null;
    const normalizedEventId = cleanPlannerEventId(String(eventId).trim());
    if (!normalizedEventId) return null;
    const normalizedStatus = String(status).trim().toLowerCase();
    try {
      const result = normalizedStatus === 'done'
        ? await completeEvent(normalizedEventId, null, { requirePersist: true })
        : await updateEventStatus(normalizedEventId, normalizedStatus);
      if (result?.error) {
        const { error: directError } = await supabase
          .from('events')
          .update({ status: normalizedStatus })
          .eq('id', normalizedEventId);
        if (directError) {
          console.warn('[SubjectDetailPage] Could not update event status:', result.error || directError);
          return null;
        }
      }
      return result?.data ?? null;
    } catch (err) {
      try {
        const { error: directError } = await supabase
          .from('events')
          .update({ status: normalizedStatus })
          .eq('id', normalizedEventId);
        if (directError) {
          console.warn('[SubjectDetailPage] Event status update failed:', err || directError);
          return null;
        }
      } catch (directErr) {
        console.warn('[SubjectDetailPage] Event status update failed:', directErr || err);
        return null;
      }
      return null;
    }
  }, []);

  const handleSubjectEventComplete = useCallback(async (event) => {
    if (!event?.id) return;
    const isCurrentlyDone = String(event?.status || '').trim().toLowerCase() === 'done';
    const newStatus = isCurrentlyDone ? 'scheduled' : 'done';
    setSubjectData((prev) => {
      if (!prev) return prev;
      const nextEvents = (prev.events || []).map((ev) => (
        String(ev?.id) === String(event.id) ? { ...ev, status: newStatus } : ev
      ));
      const nextProgress = computeProgressPercentFromEventsAndAttendance(nextEvents, prev.attendanceRecords || []);
      return { ...prev, events: nextEvents, progressPercent: nextProgress };
    });
    try {
      await runEventStatusBestEffort(event.id, newStatus);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('eventAttendancePatched', {
            detail: { eventId: cleanPlannerEventId(String(event.id)), status: newStatus },
          })
        );
        window.dispatchEvent(new CustomEvent('refreshSubjects', { detail: { skipSubjectDetailRefresh: true } }));
      }
      await loadSubjectDetail({ silent: true });
    } catch (err) {
      console.warn('[SubjectDetailPage] Failed toggling event completion:', err);
      toast.push(err?.message || 'Could not update event status.', 'error');
      await loadSubjectDetail({ silent: true });
    }
  }, [runEventStatusBestEffort, loadSubjectDetail, toast]);

  const emitPlannerAttendanceSync = useCallback((patchedAttendances = [], dateKey = null) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const latestByEventId = new Map();
    (Array.isArray(patchedAttendances) ? patchedAttendances : []).forEach((item) => {
      const rawEventId = String(item?.eventId || '').trim();
      if (!rawEventId) return;
      const normalizedEventId = cleanPlannerEventId(rawEventId);
      const normalized = String(item?.status || '').trim().toLowerCase();
      const status =
        normalized === 'completed' || normalized === 'present' || normalized === 'done'
          ? 'done'
          : 'scheduled';
      latestByEventId.set(rawEventId, status);
      if (normalizedEventId) latestByEventId.set(normalizedEventId, status);
    });
    try {
      const debugItems = [...latestByEventId.entries()].map(([eventId, status]) => ({ eventId, status }));
      console.debug('[AttendanceSync][SubjectDetail] Emitting eventAttendancePatched', {
        dateKey: DATE_KEY_RE.test(String(dateKey || '').slice(0, 10)) ? String(dateKey).slice(0, 10) : null,
        count: debugItems.length,
        items: debugItems,
      });
    } catch (_) {
      // no-op for debug logging
    }
    latestByEventId.forEach((status, eventId) => {
      window.dispatchEvent(
        new CustomEvent('eventAttendancePatched', {
          detail: { eventId, status },
        })
      );
    });
    const parsedDate =
      DATE_KEY_RE.test(String(dateKey || '').slice(0, 10))
        ? new Date(`${String(dateKey).slice(0, 10)}T12:00:00`)
        : null;
    window.dispatchEvent(
      new CustomEvent('refreshCalendar', {
        detail: {
          skipCacheClear: true,
          forceInvalidate: true,
          ...(parsedDate && !Number.isNaN(parsedDate.getTime())
            ? {
                targetYear: parsedDate.getFullYear(),
                targetMonth: parsedDate.getMonth(),
              }
            : {}),
        },
      })
    );
    window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
  }, []);

  const applyOptimisticProgressByEventIds = useCallback((
    eventIds = [],
    markPresent = true,
    { dateKey = null, minutesByEventId = {} } = {},
  ) => {
    const normalizedIds = [...new Set((eventIds || []).map((id) => String(id || '')).filter(Boolean))];
    if (normalizedIds.length === 0) return;
    const idSet = new Set(normalizedIds);
    const scopedDayKey = DATE_KEY_RE.test(String(dateKey || '').slice(0, 10))
      ? String(dateKey).slice(0, 10)
      : null;
    setSubjectData((prev) => {
      if (!prev) return prev;
      const baseAttendance = Array.isArray(prev.attendanceRecords) ? prev.attendanceRecords : [];
      const nextAttendance = markPresent
        ? (() => {
            const mapped = baseAttendance.map((record) => {
              const recordEventId = String(record?.event_id || '');
              if (!recordEventId || !idSet.has(recordEventId)) return record;
              if (scopedDayKey) {
                const recordDay = String(record?.day_date || '').slice(0, 10);
                if (recordDay && recordDay !== scopedDayKey) return record;
              }
              if (isAttendancePresentLike(record?.status)) return record;
              return { ...record, status: 'present' };
            });
            const presentEventIds = new Set(
              mapped
                .filter((record) => {
                  if (!isAttendancePresentLike(record?.status)) return false;
                  if (!scopedDayKey) return true;
                  return String(record?.day_date || '').slice(0, 10) === scopedDayKey;
                })
                .map((record) => String(record?.event_id || ''))
                .filter(Boolean)
            );
            normalizedIds.forEach((eventId) => {
              if (presentEventIds.has(eventId)) return;
              const parsedMinutes = Number(minutesByEventId?.[eventId]);
              mapped.push({
                id: `optimistic-progress-${eventId}-${scopedDayKey || 'na'}`,
                event_id: eventId,
                day_date: scopedDayKey,
                status: 'present',
                minutes: Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 60,
              });
            });
            return mapped;
          })()
        : (() => {
            const mapped = baseAttendance.map((record) => {
              const recordEventId = String(record?.event_id || '');
              if (!recordEventId || !idSet.has(recordEventId)) return record;
              if (scopedDayKey) {
                const recordDay = String(record?.day_date || '').slice(0, 10);
                if (recordDay && recordDay !== scopedDayKey) return record;
              }
              if (!isAttendancePresentLike(record?.status)) return record;
              return { ...record, status: 'absent' };
            });
            if (scopedDayKey) {
              const existingIdsForDay = new Set(
                mapped
                  .filter((record) => String(record?.day_date || '').slice(0, 10) === scopedDayKey)
                  .map((record) => String(record?.event_id || ''))
                  .filter(Boolean)
              );
              normalizedIds.forEach((eventId) => {
                if (existingIdsForDay.has(eventId)) return;
                const parsedMinutes = Number(minutesByEventId?.[eventId]);
                mapped.push({
                  id: `optimistic-progress-${eventId}-${scopedDayKey}`,
                  event_id: eventId,
                  day_date: scopedDayKey,
                  status: 'absent',
                  minutes: Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 60,
                });
              });
            }
            return mapped;
          })();
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
    let plannerPatchedAttendances = [];

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
        applyOptimisticProgressByEventIds(
          [event.id],
          false,
          {
            dateKey: normKey,
            minutesByEventId: { [String(event.id)]: getEventMinutes(event) || 60 },
          },
        );
        await runEventStatusBestEffort(event.id, 'scheduled');
        plannerPatchedAttendances = [{ eventId: event.id, status: 'scheduled' }];
      } else {
        const siblings = getSiblingEventsOnDay(normKey, event, subjectEvents || []);
        const siblingIds = siblings
          .map((sibling) => sibling?.id)
          .filter(Boolean);
        const minutesByEventId = {};
        siblings.forEach((sibling) => {
          if (!sibling?.id) return;
          minutesByEventId[String(sibling.id)] = getEventMinutes(sibling) || 60;
        });
        applyOptimisticProgressByEventIds(siblingIds, true, { dateKey: normKey, minutesByEventId });
        for (const sibling of siblings) {
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
        plannerPatchedAttendances = siblingIds.map((id) => ({ eventId: id, status: 'done' }));
      }
      await loadSubjectDetail({ silent: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects', { detail: { skipSubjectDetailRefresh: true } }));
        emitPlannerAttendanceSync(plannerPatchedAttendances, normKey);
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
    emitPlannerAttendanceSync,
    loadSubjectDetail,
    toast,
  ]);

  const handleMarkAllAttendedForDate = useCallback(async (dateKey) => {
    if (!familyId || !dateKey) return;
    const normKey = String(dateKey).slice(0, 10);
    const dayEvents = (subjectEvents || []).filter((event) => getEventDateKey(event) === normKey);
    if (!dayEvents.length) return;
    let plannerPatchedAttendances = [];
    try {
      const dayEventIds = [];
      const minutesByEventId = {};
      dayEvents.forEach((event) => {
        if (!event?.id) return;
        dayEventIds.push(event.id);
        minutesByEventId[String(event.id)] = getEventMinutes(event) || 60;
      });
      applyOptimisticProgressByEventIds(dayEventIds, true, { dateKey: normKey, minutesByEventId });
      for (const event of dayEvents) {
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
      plannerPatchedAttendances = dayEvents
        .map((event) => event?.id)
        .filter(Boolean)
        .map((id) => ({ eventId: id, status: 'done' }));
      await loadSubjectDetail({ silent: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects', { detail: { skipSubjectDetailRefresh: true } }));
        emitPlannerAttendanceSync(plannerPatchedAttendances, normKey);
      }
    } catch (err) {
      console.warn('[SubjectDetailPage] Failed marking day attended:', err);
      toast.push(err?.message || 'Could not mark day attended.', 'error');
      await loadSubjectDetail({ silent: true });
    }
  }, [familyId, subjectEvents, getEventDateKey, resolveChildIdsForAttendanceEvent, getEventMinutes, attendanceRecords, runAttendanceMutation, runEventStatusBestEffort, applyOptimisticProgressByEventIds, emitPlannerAttendanceSync, loadSubjectDetail, toast]);

  const pendingDayToggleKeysRef = useRef(new Set());
  const handleYearHeatmapDayPress = useCallback(async (dateKey) => {
    if (!familyId || !dateKey) return;
    const normKey = String(dateKey).slice(0, 10);
    if (pendingDayToggleKeysRef.current.has(normKey)) return;
    if (!canMarkAttendanceForDateKey(normKey)) {
      toast.push('Attendance can only be marked on scheduled subject days.', 'error');
      return;
    }
    pendingDayToggleKeysRef.current.add(normKey);
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
    let plannerPatchedAttendances = [];

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
        plannerPatchedAttendances = toggledEventIds.map((id) => ({ eventId: id, status: 'scheduled' }));
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
        plannerPatchedAttendances = toggledEventIds.map((id) => ({ eventId: id, status: 'done' }));
      }
      await loadSubjectDetail({ silent: true });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshSubjects', { detail: { skipSubjectDetailRefresh: true } }));
        emitPlannerAttendanceSync(plannerPatchedAttendances, normKey);
      }
    } catch (err) {
      console.warn('[SubjectDetailPage] Failed toggling day attendance:', err);
      toast.push(err?.message || 'Could not update attendance for that day.', 'error');
      await loadSubjectDetail({ silent: true });
    } finally {
      pendingDayToggleKeysRef.current.delete(normKey);
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
    emitPlannerAttendanceSync,
    loadSubjectDetail,
    toast,
    pendingDayToggleKeysRef,
  ]);

  const attendanceInsightsPanel = attendanceViewMode === 'year' || attendanceViewMode === 'month' ? (
    <View style={styles.attendanceInsightsPanelWrap}>
      {attendanceViewMode === 'year' ? (
        <SubjectAttendanceYearHeatmap
          attendanceRecords={attendanceRecordsForUI}
          subjectEvents={subjectData?.events || []}
          isDayMarkable={canMarkAttendanceForDateKey}
          onDayPress={handleYearHeatmapDayPress}
          hideLegend
        />
      ) : attendanceViewMode === 'month' ? (
        <SubjectAttendanceMonthDrilldown
          attendanceRecords={attendanceRecordsForUI}
          subjectEvents={subjectData?.events || []}
          onOpenEventDetails={handleOpenEventDetails}
          onToggleEventAttendance={handleToggleEventAttendanceForDate}
          onAddEventForDate={handleOpenAddEventForDate}
          hideLegend
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
              <Text style={styles.backButtonText}>Back to school year</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const isFixedTabLayout = classroomTab === 'bulletin'
    || classroomTab === 'classwork'
    || classroomTab === 'grades';
  const PageScroll = isFixedTabLayout ? View : ScrollView;

  return (
    <View style={styles.container}>
      {layoutVariant === 'learning' ? (
        <LearningSubjectDetailView
          subject={subject}
          familyId={familyId}
          children={children}
          onBack={onBack}
          progressPercent={subjectData?.progressPercent}
          progressCompleted={subjectData?.progressCompleted}
          progressTotal={subjectData?.progressTotal}
          nextItem={nextItem}
          status={
            (subjectData?.overdueItems || []).length > 0
            || (subjectData?.progressPercent != null
              && subjectData.progressPercent < 50
              && (subjectEvents || []).length > 5)
              ? 'needs_attention'
              : (
                (subjectData?.progressPercent == null || subjectData.progressPercent === 0)
                && !(subjectData?.progressCompleted > 0)
                && (subjectEvents || []).length === 0
              )
                ? 'not_started'
                : 'on_track'
          }
          subjectEvents={subjectEvents}
          subjectAssignments={subjectAssignments}
          assignmentsNeedingHelp={assignmentsNeedingHelp}
          materials={materials}
          onCreateEvent={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined' && subject?.id) {
              window.dispatchEvent(new CustomEvent('openTaskModal', {
                detail: {
                  subjectId: subject.id,
                  eventType: 'Lesson',
                  date: new Date(),
                  childIds: assignedChildren,
                },
              }));
            }
          }}
          onMessage={() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('openMessagesPane'));
            }
          }}
          onEventPress={handleSubjectEventPress}
          onEventRightClick={handleEventContextMenu}
          onAssignmentPress={(assignment) => openAssignedWorkItem(assignment)}
          onMaterialPress={handleMaterialChipPress}
          onAddMaterial={openAddMaterialModal}
          canManageMaterials={canManageMaterials}
        />
      ) : (
      <PageScroll
        style={[
          styles.scrollView,
          isFixedTabLayout && styles.scrollViewBulletinFill,
          isFixedTabLayout && styles.scrollContent,
          isFixedTabLayout && styles.scrollContentBulletinFill,
        ]}
        {...(!isFixedTabLayout ? {
          contentContainerStyle: styles.scrollContent,
          showsVerticalScrollIndicator: true,
        } : {})}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            {onBack ? (
              <TouchableOpacity style={styles.backButton} onPress={onBack}>
                <ArrowLeft size={20} color={colors.text || '#1F2937'} />
                <Text style={styles.backButtonText}>Back to school year</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <View style={styles.headerTopActions}>
              {isParentViewer ? (
                <SubjectClassworkSmartActions
                  onGapAnalysis={openGapAnalysisModal}
                  gapAnalysisWorking={gapAnalysisWorking}
                  onScheduleAllLessons={handleScheduleAllLessons}
                  schedulingAll={classworkSchedulingAll}
                  buttonStyle={styles.headerTopActionBtn}
                  textStyle={styles.headerTopActionText}
                />
              ) : null}
              {isParentViewer ? (
                <TouchableOpacity
                  style={styles.headerTopActionBtn}
                  onPress={() => openSubjectSettings('details')}
                  accessibilityLabel="Edit subject"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Edit2 size={18} color="#334155" strokeWidth={2.25} />
                  <Text style={styles.headerTopActionText}>Edit subject</Text>
                </TouchableOpacity>
              ) : null}
              {isParentViewer ? (
                <TouchableOpacity
                  style={styles.headerTopActionBtn}
                  onPress={handleCreateAssignment}
                  accessibilityLabel="Add assignment"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Plus size={18} color="#334155" strokeWidth={2.25} />
                  <Text style={styles.headerTopActionText}>Add assignment</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>

        <SubjectClassroomTabs
          activeTab={classroomTab}
          onChange={setClassroomTab}
          bulletinCaption={bulletinTabCaption}
          classworkCaption={classworkTabCaption}
          gradesCaption={gradesTabCaption}
        />

        {classroomTab === 'bulletin' ? (
        <View id="bulletin-board-section" style={styles.bulletinBoardSection}>
          <BulletinBoardSection
            familyId={familyId}
            children={children}
            subjects={[subject]}
            filterSubjectId={subject.id}
            expandedLayout
            feedTitle="Bulletin Board"
            onAssignmentActivityPress={handleAssignmentActivityPress}
          />
        </View>
        ) : null}

        {classroomTab === 'classwork' ? (
          <View style={styles.bulletinBoardSection}>
            <SubjectClassworkSection
              units={effectiveLearningGoalsUnits}
              assignments={subjectAssignments}
              events={subjectEvents}
              familyId={familyId}
              subjectId={subject?.id}
              subjectName={subject?.name}
              isParentViewer={isParentViewer}
              onOpenAssignment={openAssignedWorkItem}
              onManageUnits={openUnitsEditor}
              unitsActionLabel={unitsEditorLabel}
              onPlacementChanged={handleClassworkPlacementChanged}
              inlineUnitsEditing={isParentViewer}
              highlightLessonId={highlightLessonId}
              highlightAssignmentId={highlightAssignmentId}
              onSchedulingAllChange={setClassworkSchedulingAll}
            />
          </View>
        ) : null}

        {classroomTab === 'grades' ? (
          <View style={styles.bulletinBoardSection}>
            <SubjectGradesPanel
              assignments={subjectAssignments}
              events={subjectEvents}
              gradedItems={gradedItems}
              children={gradesPanelChildren}
              onOpenAssignment={openAssignmentInClasswork}
              onOpenGradedItem={(item) => {
                if (item?.eventId) handleOpenEventDetails(item.eventId, item.event);
              }}
            />
          </View>
        ) : null}

        {SHOW_SUBJECT_ASSIGNMENTS_SECTION ? (
          <View id="assignments-section" style={styles.section}>
            <View style={styles.attendanceSectionHeader}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Assignments</Text>
            </View>
            {subjectAssignments.length > 0 ? (
              <View style={styles.gradesList}>
                {subjectAssignments.map((assignment) => {
                  const dueLine = formatDueShort(assignment.due_date);
                  const statusLabel = getWorkStatusLabel(assignment);
                  return (
                    <TouchableOpacity
                      key={assignment.id}
                      style={styles.gradeItem}
                      onPress={() => openAssignedWorkItem(assignment)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`Open assignment ${assignment.title || ''}`}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <View style={styles.gradeItemContent}>
                        <Text style={styles.gradeItemName} numberOfLines={2}>
                          {assignment.title || 'Assignment'}
                        </Text>
                        <Text style={styles.gradeItemDate}>
                          {getChildName(assignment.child_id)}
                          {dueLine ? ` · ${dueLine}` : ''}
                          {` · ${statusLabel}`}
                        </Text>
                      </View>
                      <ChevronRight size={20} color="#94a3b8" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyStateBox}>
                <Text style={styles.emptyStateText}>
                  No assignments for {subject?.name || 'this subject'} yet.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {SHOW_SUBJECT_MATERIALS_SECTION ? (
        <View id="materials-section" style={styles.section}>
          <View style={[styles.attendanceSectionHeader, styles.materialsSectionHeader]}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Resources</Text>
            {canManageMaterials ? (
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={openAddMaterialModal}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Add resource"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Plus size={16} color="#6B7280" />
                <Text style={styles.emptyStateButtonText}>Add resource</Text>
              </TouchableOpacity>
            ) : null}
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
            </>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.materialsEmptyText}>
                No resources added yet for {subject?.name || 'this subject'}.
              </Text>
            </View>
          )}
        </View>
        ) : null}

        {SHOW_SUBJECT_UNITS_LESSONS_SECTION ? (
        <View id="learning-goals-section" style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Units and Lessons</Text>
            {onEditSubject ? (
              <View style={styles.learningGoalsHeaderActions}>
                {!hasLearningGoalsContent ? (
                  <TouchableOpacity
                    style={styles.emptyStateButton}
                    onPress={openUnitsEditor}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.learningGoalsActionInner}>
                      <Plus size={14} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Add new units</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
                {hasLearningGoalsContent ? (
                  <TouchableOpacity
                    style={styles.learningGoalsEditCurrentButton}
                    onPress={openUnitsEditor}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.learningGoalsActionInner}>
                      <Edit2 size={14} color="#5E6C84" />
                      <Text style={styles.learningGoalsEditCurrentText}>Edit current units</Text>
                    </View>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
          </View>
          <View style={styles.emptyStateBox}>
            {!hasLearningGoalsContent ? (
              <Text style={styles.emptyStateText}>
                Units and lessons appear once you add class lessons or units.
              </Text>
            ) : null}
            {hasLearningGoalsContent ? (
              <>
                <View style={styles.learningGoalsMethodHeader}>
                  <Text style={styles.learningGoalsMethodHeaderTitle}>{learningGoalsMethodTitle}</Text>
                  <Text style={styles.learningGoalsMethodHeaderSubtitle}>
                    {learningGoalsBuildSummaryLine}
                  </Text>
                </View>
                <View style={styles.learningGoalsMethodHeaderDivider} />
                <View style={styles.learningGoalsList}>
                  {effectiveLearningGoalsUnits.map((unit, unitIndex) => {
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
          </View>
        </View>
        ) : null}

        {/* Section 3: All Events moved to main Learning screen (ProgressTab) */}
        {SHOW_SUBJECT_ATTENDANCE_SECTION ? (
        <View id="attendance-section" style={styles.section}>
            <>
              <View style={styles.attendanceSectionHeader}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Attendance</Text>
                <View style={styles.sectionHeaderActions}>
                  {canManageAttendance ? (
                    <TouchableOpacity
                      style={[styles.emptyStateButton, styles.attendanceHeaderEditButton]}
                      onPress={() => setShowMarkAllAttendedModal(true)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Mark all as attended"
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <CheckCircle2 size={14} color="#6B7280" />
                      <Text style={styles.emptyStateButtonText}>Mark all as attended</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
              {(attendanceViewMode === 'list' ? attendanceRecordsListUI.length > 0 : attendanceRecordsForUI.length > 0) ? (
                <View style={styles.emptyStateBox}>
                  {attendanceSummaryChips}
                  {attendanceViewMode === 'list' ? (
                    <>
                      <View style={styles.attendanceList}>
                        {(showAttendanceExpanded ? attendanceRecordsListUI : attendanceRecordsListUI.slice(0, ATTENDANCE_LIST_LIMIT)).map((record) => {
                          const event = (subjectData?.events || []).find(e => e.id === record.event_id);
                          const statusLabel = String(record?.statusLabel || '');
                          const statusTone = String(record?.statusTone || '').toLowerCase();
                          const isAttended = statusTone === 'attended';
                          const canToggleAttendance = !!record?.event_id && !!record?.day_date;
                          return (
                            <View
                              key={record.id}
                              {...(Platform.OS === 'web' && {
                                'data-event-id': String(event?.id || ''),
                                onMouseDown: (e) => {
                                  if (!event) return;
                                  const button = e?.button ?? e?.nativeEvent?.button;
                                  if (button !== 2) return;
                                  e.preventDefault?.();
                                  e.stopPropagation?.();
                                  handleEventContextMenu(event, e?.nativeEvent || e);
                                },
                                onContextMenu: (e) => {
                                  if (!event) return;
                                  e.preventDefault?.();
                                  e.stopPropagation?.();
                                  handleEventContextMenu(event, e?.nativeEvent || e);
                                },
                              })}
                            >
                            <TouchableOpacity
                              style={styles.attendanceItem}
                              onPress={() => event && handleOpenEventDetails(event.id, event)}
                              activeOpacity={0.7}
                              {...(Platform.OS === 'web' && {
                                cursor: event ? 'pointer' : 'default',
                              })}
                            >
                              <TouchableOpacity
                                style={[
                                  styles.attendanceListToggleCircle,
                                  isAttended && styles.attendanceListToggleCircleAttended,
                                ]}
                                onPress={(ev) => {
                                  ev?.stopPropagation?.();
                                  if (!canToggleAttendance) return;
                                  handleToggleEventAttendanceForDate(record.day_date, record.event_id);
                                }}
                                activeOpacity={0.82}
                                hitSlop={8}
                                disabled={!canToggleAttendance}
                                accessibilityRole="button"
                                accessibilityLabel={isAttended ? 'Mark attendance as unattended' : 'Mark attendance as attended'}
                                {...(Platform.OS === 'web' && { cursor: canToggleAttendance ? 'pointer' : 'default' })}
                              >
                                {isAttended ? <Check size={14} color="#16a34a" strokeWidth={2.5} /> : null}
                              </TouchableOpacity>
                              <Text style={styles.attendanceItemDate}>{formatDate(record.day_date)}</Text>
                              <Text style={styles.attendanceItemTitle}>
                                {record?.title || event?.title || 'Lesson'}
                              </Text>
                              <View style={styles.attendanceItemStatusWrap}>
                                <View
                                  style={[
                                    styles.attendanceItemStatusDot,
                                    statusTone === 'attended' && styles.attendanceItemStatusDotAttended,
                                    statusTone === 'unattended' && styles.attendanceItemStatusDotUnattended,
                                    statusTone === 'upcoming' && styles.attendanceItemStatusDotUpcoming,
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.attendanceItemStatus,
                                    statusTone === 'attended' && styles.attendanceItemStatusAttended,
                                    statusTone === 'unattended' && styles.attendanceItemStatusUnattended,
                                    statusTone === 'upcoming' && styles.attendanceItemStatusUpcoming,
                                  ]}
                                >
                                  {statusLabel}
                                </Text>
                              </View>
                              <Text style={styles.attendanceItemMinutes}>{record.minutes} min</Text>
                            </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                      {attendanceRecordsListUI.length > ATTENDANCE_LIST_LIMIT ? (
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
                      ) : null}
                    </>
                  ) : (
                    <>
                      {attendanceInsightsPanel}
                    </>
                  )}
                </View>
              ) : (
                <View style={styles.emptyStateBox}>
                  {attendanceSummaryChips}
                  {attendanceViewMode === 'list' ? null : attendanceInsightsPanel}
                  {attendanceViewMode === 'list' ? (
                    <Text style={styles.emptyStateText}>
                      Attendance appears once you add an event attached to this subject.
                    </Text>
                  ) : null}
                </View>
              )}
            </>
          </View>
        ) : null}

        {SHOW_SUBJECT_GRADES_SECTION ? (
        <View id="grades-section" style={styles.section}>
          <View style={styles.gradesSectionHeader}>
            <View style={styles.gradesSectionTitleRow}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Grades</Text>
              <View style={styles.gradesHeaderActions}>
                {showAssignedToStudentButton && isParentViewer && assignmentsAssignedToStudent.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.emptyStateButton, styles.gradesHeaderActionButton]}
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
                {Platform.OS === 'web' && isParentViewer && (subjectData?.events || []).length > 0 ? (
                  <TouchableOpacity
                    style={[styles.emptyStateButton, styles.gradesHeaderAddButton]}
                    onPress={() => setShowPastEventsGradesModal(true)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Add grades"
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Plus size={16} color="#6B7280" />
                    <Text style={styles.emptyStateButtonText}>Add grades</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            {hasGradesAttention && isParentViewer ? (
              <Text style={styles.attentionHintText} accessibilityRole="text">
                * Open the listed event for a help request or submission review.
              </Text>
            ) : null}
          </View>
          {gradedItems.length > 0 ? (
            <View style={styles.emptyStateBox}>
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
                    <View
                      key={item.id}
                      {...(Platform.OS === 'web' && {
                        'data-event-id': String(item?.event?.id || item?.eventId || ''),
                        onMouseDown: (e) => {
                          if (!item.event) return;
                          const button = e?.button ?? e?.nativeEvent?.button;
                          if (button !== 2) return;
                          e.preventDefault?.();
                          e.stopPropagation?.();
                          handleEventContextMenu(item.event, e?.nativeEvent || e);
                        },
                        onContextMenu: (e) => {
                          if (!item.event) return;
                          e.preventDefault?.();
                          e.stopPropagation?.();
                          handleEventContextMenu(item.event, e?.nativeEvent || e);
                        },
                      })}
                    >
                    <Wrapper style={styles.gradeItem} {...wrapperProps}>
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
                    </View>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                Grades appear once you add grades to assignments or assessments for this subject.
              </Text>
            </View>
          )}
        </View>
        ) : null}

      </PageScroll>
      )}
      <Modal
        visible={showAttendanceSuggestionConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={closeAttendanceSuggestionConfirmModal}
      >
        <TouchableOpacity
          style={styles.attendanceSuggestionConfirmOverlay}
          activeOpacity={1}
          onPress={closeAttendanceSuggestionConfirmModal}
        >
          <TouchableOpacity style={styles.attendanceSuggestionConfirmModal} activeOpacity={1} onPress={() => {}}>
            <View style={styles.attendanceSuggestionConfirmHeader}>
              <Text style={styles.attendanceSuggestionConfirmTitle}>Apply suggestion</Text>
              <TouchableOpacity
                onPress={closeAttendanceSuggestionConfirmModal}
                style={styles.attendanceSuggestionConfirmClose}
                disabled={applyingAttendanceSuggestion}
                {...(Platform.OS === 'web' && { cursor: applyingAttendanceSuggestion ? 'default' : 'pointer' })}
              >
                <X size={18} color="#6b7280" />
              </TouchableOpacity>
            </View>
            <Text style={styles.attendanceSuggestionConfirmBody}>
              {`Suggestion: ${attendanceCatchUpSuggestion?.suggestionSummaryText || 'Extend term length or add class days per week.'}`}
            </Text>
            <Text style={styles.attendanceSuggestionConfirmBody}>
              {attendanceCatchUpSuggestion?.extensionAddedDatesLabel
                ? `Suggested days: ${attendanceCatchUpSuggestion.extensionAddedDatesLabel}.`
                : 'Suggested days are not available for this plan.'}
            </Text>
            <Text style={styles.attendanceSuggestionConfirmBody}>
              {`This will update the plan end date to ${formatDateDisplayYmd(attendanceCatchUpSuggestion?.suggestedEndYmd || '') || 'the suggested date'} and regenerate calendar events.`}
            </Text>
            <View style={styles.attendanceSuggestionConfirmActions}>
              <TouchableOpacity
                style={styles.attendanceSuggestionConfirmCancelButton}
                onPress={closeAttendanceSuggestionConfirmModal}
                disabled={applyingAttendanceSuggestion}
                {...(Platform.OS === 'web' && { cursor: applyingAttendanceSuggestion ? 'default' : 'pointer' })}
              >
                <Text style={styles.attendanceSuggestionConfirmCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.attendanceSuggestionConfirmApplyButton,
                  applyingAttendanceSuggestion && styles.attendanceSuggestionConfirmApplyButtonDisabled,
                ]}
                onPress={confirmApplyAttendanceSuggestion}
                disabled={applyingAttendanceSuggestion}
                {...(Platform.OS === 'web' && { cursor: applyingAttendanceSuggestion ? 'default' : 'pointer' })}
              >
                <View style={styles.attendanceSuggestionConfirmApplyButtonInner}>
                  {!applyingAttendanceSuggestion ? <CheckCircle size={14} color="#FFFFFF" /> : null}
                  <Text style={styles.attendanceSuggestionConfirmApplyButtonText}>
                    {applyingAttendanceSuggestion ? 'Applying...' : 'Confirm'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
      <SubjectGapAnalysisModal
        visible={gapModal.visible}
        title={gapModal.title}
        message={gapModal.message}
        slotLines={gapSlotLines}
        historyRuns={gapHistoryRunDetails}
        loading={gapModal.loading}
        working={gapModal.working}
        undoing={gapUndoing}
        canUndo={canUndoGapAnalysis}
        showConfirm={gapModal.showConfirm}
        confirmLabel={gapModal.confirmLabel}
        cancelLabel={gapModal.cancelLabel}
        onConfirm={confirmGapAnalysisModal}
        onCancel={closeGapAnalysisModal}
        onUndo={handleUndoGapAnalysis}
      />
      <EditSubjectSettingsModal
        visible={showEditSettingsModal}
        onClose={() => setShowEditSettingsModal(false)}
        onSaved={handleSubjectSettingsSaved}
        familyId={familyId}
        subject={subject}
        children={children}
        initialTab={editSettingsInitialTab}
        subjectPlanData={subjectPlanData}
        academicYearId={subjectPlanYearId || subjectPlanYearIdFromEvents || null}
        assignedChildIds={assignedChildren}
        allChildIds={allChildIds}
        initialGradingSettings={gradingSettings}
      />
      <EditSubjectUnitsModal
        visible={showEditUnitsModal}
        onClose={() => {
          setShowEditUnitsModal(false);
          setEditUnitsInitialDraft(null);
        }}
        onSaved={handleEditUnitsSaved}
        familyId={familyId}
        subject={subject}
        hasExistingContent={hasLearningGoalsContent}
        initialDraft={editUnitsInitialDraft}
        academicYearId={subjectPlanYearId || subjectPlanYearIdFromEvents || null}
      />
      <MarkAllAttendedModal
        visible={showMarkAllAttendedModal}
        onClose={() => setShowMarkAllAttendedModal(false)}
        familyId={familyId}
        subjectDetails={subject?.id ? [{ subject, detail: subjectData }] : []}
        subjectOptions={subject?.id ? [{
          id: subject.id,
          name: subject?.name || 'Subject',
          childIds: assignedChildren,
          studentLabel: childrenNames.join(', '),
        }] : []}
        children={children}
        resolvedActiveChildIds={assignedChildren}
        fixedSubjectId={subject?.id}
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
        onCreatePlan={handleOpenPlanBuilder}
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
        onDelete={handleDeleteMaterial}
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
      <AssignmentMessageModal
        visible={!!messageModalContext}
        onClose={() => setMessageModalContext(null)}
        onSent={() => {
          setMessageModalContext(null);
          refreshSubjectAfterAssignmentWorkflow();
        }}
        familyId={familyId}
        event={messageModalContext?.event || null}
        assignment={messageModalContext?.assignment || null}
        isParentViewer={isParentViewer}
        children={children}
        subjectId={subject?.id || null}
        assignedChildIds={assignedChildren}
      />
      <AssignmentSubmittalRequestModal
        visible={!!submittalRequestContext}
        onClose={() => setSubmittalRequestContext(null)}
        onRequested={() => {
          setSubmittalRequestContext(null);
          refreshSubjectAfterAssignmentWorkflow();
        }}
        familyId={familyId}
        event={submittalRequestContext?.event || null}
        assignment={submittalRequestContext?.assignment || null}
        subjectId={subject?.id || null}
        assignedChildIds={assignedChildren}
        children={children}
        materials={materials}
        eventAttachmentMaterials={eventAttachmentMaterials}
        onOpenAttachment={handleMaterialChipPress}
      />
      <WorkReviewModal
        visible={!!reviewAssignment}
        assignment={reviewAssignment}
        onClose={() => setReviewAssignment(null)}
        onReviewed={() => {
          setReviewAssignment(null);
          refreshSubjectAfterAssignmentWorkflow();
        }}
      />
      {submitModalContext ? (
        <SubmitForReviewModal
          visible
          onClose={() => setSubmitModalContext(null)}
          onSubmitted={() => {
            setSubmitModalContext(null);
            refreshSubjectAfterAssignmentWorkflow();
          }}
          familyId={familyId}
          childId={
            submitModalContext?.assignment?.child_id ||
            session?.child_id ||
            assignedChildren[0] ||
            null
          }
          assignment={submitModalContext?.assignment || null}
          eventContext={
            submitModalContext?.event?.id
              ? {
                  id: submitModalContext.event.id,
                  title: submitModalContext.event.title,
                  start_ts: submitModalContext.event.start_ts,
                  end_ts: submitModalContext.event.end_ts,
                  subject_id: submitModalContext.event.subject_id || subject?.id || null,
                }
              : null
          }
          viewOnly={!!submitModalContext?.viewOnly}
        />
      ) : null}
      <SubmitForReviewModal
        visible={!!assignedDetailAssignment}
        assignment={assignedDetailAssignment}
        childId={assignedDetailAssignment?.child_id}
        familyId={familyId}
        viewOnly={isParentViewer}
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
    minHeight: 0,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }),
  },
  scrollView: {
    flex: 1,
    minHeight: 0,
  },
  scrollViewBulletinFill: {
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  scrollContent: {
    padding: 24,
    paddingTop: 24,
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 24,
      width: '100%',
    }),
  },
  scrollContentBulletinFill: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
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
    marginBottom: 8,
    width: '100%',
    flexShrink: 0,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
    width: '100%',
  },
  headerTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  headerTopActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  headerTopActionText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(15,23,42,0.85)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    padding: 4,
    marginLeft: -4,
    gap: 4,
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  backButtonText: {
    fontSize: 14,
    color: colors.text || '#1F2937',
    fontWeight: '500',
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
  headerActions: {
    flexDirection: 'column',
    gap: 8,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    marginLeft: 16,
    marginRight: 10,
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
  gradesHeaderActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gradesHeaderActionButton: {
    marginTop: 0,
  },
  gradesHeaderAddButton: {
    marginLeft: 0,
  },
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
    paddingHorizontal: 14,
  },
  bulletinBoardSection: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    marginBottom: 0,
    marginTop: 2,
    paddingTop: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 0,
    paddingBottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxHeight: '100%',
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  materialsSectionHeader: {
    marginBottom: 10,
    justifyContent: 'space-between',
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
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  materialsListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  materialsListHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsListHeaderDate: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
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
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    minWidth: 110,
    textAlign: 'right',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  materialsEmptyText: {
    fontSize: 14,
    color: colors.muted || '#6B7280',
    lineHeight: 20,
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
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
    marginTop: 0,
  },
  attendanceSummaryWrap: {
    marginBottom: 8,
  },
  attendanceToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 10,
  },
  attendanceViewsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  attendanceViewsShell: {
    borderWidth: 1,
    borderColor: '#DDE6F1',
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attendanceCountShell: {
    borderWidth: 1,
    borderColor: '#DDE6F1',
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attendanceCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  attendanceCountLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#94A3B8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceGapShell: {
    borderWidth: 1,
    borderColor: '#F3D4D4',
    borderRadius: 999,
    backgroundColor: '#FFF7F7',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attendanceGapContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  attendanceGapLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#B45353',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceViewsLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: '#94A3B8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceViewsChipsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  attendanceViewChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceViewChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  attendanceViewChipActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(107, 179, 232, 0.12)',
  },
  attendanceViewChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceViewChipTextActive: {
    color: '#6BB3E8',
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
    alignItems: 'flex-end',
    gap: 8,
  },
  /** Past lessons CTA when attendance list is non-empty: spacing below list / show more */
  attendancePastLessonsButton: {
    marginTop: 0,
  },
  attendanceHeaderEditButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  sectionHeaderActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderExportButton: {
    marginLeft: 'auto',
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
  learningGoalsMethodHeader: {
    flex: 1,
    minWidth: 180,
    marginBottom: 10,
  },
  learningGoalsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginLeft: 'auto',
    flexWrap: 'wrap',
  },
  learningGoalsMethodHeaderTitle: {
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
  learningGoalsMethodHeaderSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsMethodHeaderDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
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
  learningGoalsAddNewButton: {
    minHeight: 36,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(133, 196, 242, 0.8)',
    borderStyle: 'dashed',
    backgroundColor: '#F4FAFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  learningGoalsEditCurrentButton: {
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D9E0EA',
    backgroundColor: '#F8FAFD',
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  learningGoalsEditCurrentText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  learningGoalsAddNewText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6BB3E8',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsMethodModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.52)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  learningGoalsMethodModal: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 22px 52px rgba(15, 23, 42, 0.24)',
    }),
  },
  learningGoalsMethodModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  learningGoalsMethodModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsMethodModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  learningGoalsMethodModalBody: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsMethodWarningBox: {
    borderWidth: 1,
    borderColor: '#C9D7EE',
    backgroundColor: '#EEF3FB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  learningGoalsMethodWarningText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#1F2937',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsMethodEditCurrentLink: {
    marginTop: 10,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  learningGoalsMethodEditCurrentLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  learningGoalsMethodOptions: {
    gap: 8,
  },
  learningGoalsMethodOption: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D9E0EA',
    backgroundColor: '#F8FAFD',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  learningGoalsMethodOptionText: {
    fontSize: 15,
    fontWeight: '600',
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
  attendanceKeyShell: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  attendanceKeyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  attendanceKeyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
  },
  attendanceKeyDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  attendanceKeyDotAttended: { backgroundColor: '#6BB3E8' },
  attendanceKeyDotUnattended: { backgroundColor: '#F2A0A0' },
  attendanceKeyDotUpcoming: { backgroundColor: '#C7DDF6' },
  attendanceKeyDotNoEvents: { backgroundColor: '#E5E7EB' },
  attendanceKeyText: {
    fontSize: 12,
    color: '#6B7280',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceGapChipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceGapChipButtonHover: {
    transform: [{ translateY: -1 }],
  },
  attendanceGapChipButtonNegativeHover: {
    backgroundColor: '#FEE2E2',
  },
  attendanceGapChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceGapChipChevron: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B91C1C',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetCard: {
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 6,
    marginBottom: 10,
    gap: 6,
  },
  attendanceTargetTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  attendanceTargetGapPill: {
    minWidth: 110,
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetMetPill: {
    minWidth: 84,
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetPaceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  attendanceTargetPaceArrow: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '400',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetPaceText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '400',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetSuggestionLine: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '400',
    lineHeight: 18,
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetSuggestionLineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  attendanceTargetSourceText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '400',
    lineHeight: 18,
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceTargetSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  attendanceTargetApplyButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceTargetApplyButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3730A3',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceSuggestionConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  attendanceSuggestionConfirmModal: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 24,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.12), 0 12px 24px -8px rgba(0, 0, 0, 0.08)',
    }),
  },
  attendanceSuggestionConfirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  attendanceSuggestionConfirmTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceSuggestionConfirmClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceSuggestionConfirmBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
    marginTop: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceSuggestionConfirmActions: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
  },
  attendanceSuggestionConfirmCancelButton: {
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceSuggestionConfirmCancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  attendanceSuggestionConfirmApplyButton: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#9ECFFB',
    backgroundColor: '#9ECFFB',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceSuggestionConfirmApplyButtonDisabled: {
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  attendanceSuggestionConfirmApplyButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attendanceSuggestionConfirmApplyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  attendanceListToggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.14)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attendanceListToggleCircleAttended: {
    borderColor: 'rgba(34,197,94,0.35)',
    backgroundColor: 'rgba(34,197,94,0.12)',
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
  attendanceItemStatusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 94,
  },
  attendanceItemStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#CBD5E1',
  },
  attendanceItemStatusDotAttended: {
    backgroundColor: '#6BB3E8',
  },
  attendanceItemStatusDotUnattended: {
    backgroundColor: '#F2A0A0',
  },
  attendanceItemStatusDotUpcoming: {
    backgroundColor: '#C7DDF6',
  },
  attendanceItemStatusAttended: {
    color: '#2f7fb8',
    fontWeight: '600',
  },
  attendanceItemStatusUnattended: {
    color: '#e68f88',
    fontWeight: '600',
  },
  attendanceItemStatusUpcoming: {
    color: '#86b5e6',
    fontWeight: '600',
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