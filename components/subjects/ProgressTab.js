import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Download, Edit2, Plus, X } from 'lucide-react';
import PlannerEventsListTable from '../planner/PlannerEventsListTable';
import SubjectAttendanceMonthPanelArchived, {
  SubjectAttendanceSummaryKeyArchived,
} from './archived/SubjectAttendanceMonthPanelArchived';
import MarkAllAttendedModal from './MarkAllAttendedModal';
import AssignWorkModal from './AssignWorkModal';
import SubjectPastEventsGradesModal from './SubjectPastEventsGradesModal';
import {
  aggregatePlanProgressMetrics,
  formatPlanProgressSummary,
  getPlanProgressStatusFromMetrics,
} from './SubjectsPlanBuilder';
import ChildAvatarCluster, { sourceForChild } from '../ui/ChildAvatarCluster';
import { supabase } from '../../lib/supabase';
import { createAttendanceLog, deleteAttendanceLog, updateAttendanceLog } from '../../lib/services/recordsClient';

const WEB_HEADING_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const SUMMARY_PANEL_DISCLOSURE_MAX_HEIGHT = {
  attendance: 580,
  grades: 520,
  learning_log: 680,
  learning_goals: 1200,
};

const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const EMPTY_SUBJECT_MODAL_ID = '__empty_subject__';
const ATTENDANCE_OVERRIDE_CLEAR = '__clear__';

function buildAttendanceOverrideKey(eventId, dayDate, childId) {
  const eventKey = String(eventId || '').trim();
  const dayKey = String(dayDate || '').slice(0, 10);
  const childKey = String(childId || '').trim();
  if (!eventKey || !dayKey || !childKey) return '';
  return `${eventKey}|${dayKey}|${childKey}`;
}

function getChildLabel(child) {
  return child?.first_name || child?.name || child?.full_name || child?.display_name || 'Student';
}

function eventMatchesChildIds(entity, childIds) {
  if (!Array.isArray(childIds) || childIds.length === 0) return true;
  const idSet = new Set(childIds.map((id) => String(id)));
  const childId = entity?.child_id || entity?.childId || null;
  if (childId && idSet.has(String(childId))) return true;
  const childIdsArr = entity?.child_ids || entity?.childIds || [];
  if (Array.isArray(childIdsArr) && childIdsArr.some((id) => idSet.has(String(id)))) return true;
  if (!childId && (!childIdsArr || childIdsArr.length === 0)) return true;
  return false;
}

function normalizeEventForAllEventsList(raw, subjectId) {
  if (!raw || typeof raw !== 'object') return null;
  const start_ts = raw.start_ts || raw.startTs || raw.start || raw.start_local || raw.due_ts || null;
  return {
    ...raw,
    id: String(raw.id || '').trim() || null,
    subject_id: raw.subject_id || subjectId,
    start_ts,
    start: raw.start || start_ts,
    start_local: raw.start_local || null,
    due_ts: raw.due_ts || null,
    end_ts: raw.end_ts || null,
    child_id: raw.child_id || raw.childId || null,
    child_ids: raw.child_ids || raw.childIds || null,
    event_type: raw.event_type || raw.type || null,
    title: raw.title || raw.lesson_name || null,
    lesson_name: raw.lesson_name || null,
    unit_name: raw.unit_name || raw.unitName || raw.unit || null,
    status: raw.status || null,
    date_local: raw.date_local || raw.date || null,
  };
}

function collectPlanEventsForSubject(planProgressContext, subjectId) {
  const sid = String(subjectId || '').trim();
  if (!sid) return [];
  const merged = [];
  const planRow = (planProgressContext?.rows || []).find((row) => String(row?.id || '').trim() === sid);
  if (Array.isArray(planRow?.eventItems)) merged.push(...planRow.eventItems);
  const bySubject = planProgressContext?.instructionalEventsBySubject?.[sid];
  if (Array.isArray(bySubject)) merged.push(...bySubject);
  return merged;
}

function recordMatchesChildIds(record, childIds) {
  if (!Array.isArray(childIds) || childIds.length === 0) return true;
  const recordChildId = String(record?.child_id || record?.childId || '').trim();
  if (!recordChildId) return true;
  return childIds.some((id) => String(id) === recordChildId);
}

function getEventStartYmd(event) {
  const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
  return raw ? String(raw).slice(0, 10) : null;
}

function formatEventTypeLabel(event) {
  if (!event) return 'Lesson';
  const holidayType = String(event?.holiday_type || event?.holidayType || '').trim().toUpperCase();
  if (holidayType === 'CUSTOM_BREAK') return 'Break';
  if (holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'GLOBAL_HOLIDAY') return 'Day Off';
  const raw = String(event?.event_type || event?.type || '').trim();
  if (!raw) return 'Lesson';
  const lower = raw.toLowerCase();
  if (lower === 'schedule block' || lower === 'scheduled class day' || lower === 'classday') return 'Class Day';
  if (lower === 'custom_break' || lower === 'break') return 'Break';
  if (lower === 'custom_holiday' || lower === 'global_holiday' || lower === 'holiday' || lower === 'day off' || lower === 'dayoff') return 'Day Off';
  const knownLabels = {
    lesson: 'Lesson',
    assignment: 'Assignment',
    activity: 'Activity',
    project: 'Project',
    exam: 'Exam',
    assessment: 'Assessment',
    appointment: 'Appointment',
    travel: 'Travel',
    'live class': 'Live Class',
    'home lesson': 'Home Lesson',
    'core class': 'Core Class',
    'class day': 'Class Day',
  };
  return knownLabels[lower] || raw;
}

function resolveEventStartValue(event) {
  return event?.start_ts || event?.start || event?.start_local || event?.due_ts || null;
}

function formatEventTimeLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

const ATTENDANCE_SUBLINE_SEPARATOR = ' · ';

function formatEventTimeRangeLabel(event, fallbackMinutes = null) {
  if (!event) return '';
  const holidayType = String(event?.holiday_type || event?.holidayType || '').toUpperCase();
  const typeLower = String(event?.event_type || event?.type || '').toLowerCase();
  if (
    typeLower === 'holiday'
    || holidayType === 'CUSTOM_HOLIDAY'
    || holidayType === 'CUSTOM_BREAK'
    || holidayType === 'GLOBAL_HOLIDAY'
  ) {
    return '';
  }
  const startValue = resolveEventStartValue(event);
  let endValue = event?.end_ts || event?.end || event?.end_local || null;
  const startMs = startValue ? new Date(startValue).getTime() : NaN;
  if (!endValue && Number.isFinite(startMs)) {
    const durationMinutes = Number(event?.duration_minutes);
    const minutes = Number.isFinite(durationMinutes) && durationMinutes > 0
      ? durationMinutes
      : (Number.isFinite(Number(fallbackMinutes)) && Number(fallbackMinutes) > 0 ? Number(fallbackMinutes) : NaN);
    if (Number.isFinite(minutes)) {
      endValue = new Date(startMs + minutes * 60000).toISOString();
    }
  }
  const startLabel = formatEventTimeLabel(startValue);
  const endLabel = formatEventTimeLabel(endValue);
  if (startLabel && endLabel) return `${startLabel}${ATTENDANCE_SUBLINE_SEPARATOR}${endLabel}`;
  return startLabel || endLabel || '';
}

function formatEventTypeWithTime(event, fallbackMinutes = null) {
  const typeLabel = formatEventTypeLabel(event);
  const timeRange = formatEventTimeRangeLabel(event, fallbackMinutes);
  return timeRange ? `${typeLabel}${ATTENDANCE_SUBLINE_SEPARATOR}${timeRange}` : typeLabel;
}

function formatAttendanceEventSubline(event, childNameById, childIds, fallbackMinutes = null) {
  const typeWithTime = formatEventTypeWithTime(event, fallbackMinutes);
  const names = (Array.isArray(childIds) ? childIds : [])
    .map((id) => childNameById?.[String(id)] || null)
    .filter(Boolean);
  const childLabel = formatNeedsSentence(names);
  return childLabel ? `${childLabel}${ATTENDANCE_SUBLINE_SEPARATOR}${typeWithTime}` : typeWithTime;
}

function formatDate(dateValue) {
  if (!dateValue) return '—';
  const ymd = String(dateValue || '').slice(0, 10);
  const ymdMatch = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const monthIdx = Number(ymdMatch[2]) - 1;
    const day = Number(ymdMatch[3]);
    const year = Number(ymdMatch[1]);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (monthIdx >= 0 && monthIdx <= 11 && Number.isFinite(day) && Number.isFinite(year)) {
      return `${monthNames[monthIdx]} ${day}, ${year}`;
    }
  }
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue).slice(0, 10);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function gradeToPercent(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim().toUpperCase();
  const map = {
    'A+': 98, A: 95, 'A-': 92,
    'B+': 88, B: 85, 'B-': 82,
    'C+': 78, C: 75, 'C-': 72,
    'D+': 68, D: 65, 'D-': 62,
    F: 50,
  };
  return map[raw] ?? null;
}

function parseGradeNumeric(gradeValue) {
  if (gradeValue == null) return null;
  const raw = String(gradeValue).trim();
  if (!raw) return null;
  if (raw.endsWith('%')) {
    const pct = Number(raw.slice(0, -1));
    return Number.isFinite(pct) ? pct : null;
  }
  const direct = Number(raw);
  if (Number.isFinite(direct)) return direct;
  return gradeToPercent(raw);
}

function percentToLetter(percent) {
  const p = Number(percent);
  if (!Number.isFinite(p)) return '—';
  if (p >= 97) return 'A+';
  if (p >= 93) return 'A';
  if (p >= 90) return 'A-';
  if (p >= 87) return 'B+';
  if (p >= 83) return 'B';
  if (p >= 80) return 'B-';
  if (p >= 77) return 'C+';
  if (p >= 73) return 'C';
  if (p >= 70) return 'C-';
  if (p >= 67) return 'D+';
  if (p >= 63) return 'D';
  if (p >= 60) return 'D-';
  return 'F';
}

function parsePositiveInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return rounded > 0 ? rounded : null;
}

function formatNeedsSentence(needs) {
  const list = Array.isArray(needs) ? needs.filter(Boolean) : [];
  if (!list.length) return '';
  const cap = (txt) => {
    const raw = String(txt || '');
    if (!raw) return '';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  };
  if (list.length === 1) return cap(list[0]);
  if (list.length === 2) return `${cap(list[0])} and ${list[1]}`;
  return `${cap(list[0])}, ${list.slice(1, -1).join(', ')}, and ${list[list.length - 1]}`;
}

function formatProfileGradeLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (lower.includes('grade')) return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const rounded = Math.round(numeric);
    const mod100 = rounded % 100;
    const suffix = (mod100 >= 11 && mod100 <= 13)
      ? 'th'
      : (rounded % 10 === 1 ? 'st' : (rounded % 10 === 2 ? 'nd' : (rounded % 10 === 3 ? 'rd' : 'th')));
    return `${rounded}${suffix} grade`;
  }
  return raw;
}

export default function ProgressTab({
  familyId = null,
  children = [],
  filteredSubjects = [],
  subjectDetailCache = {},
  selectedChildFilter = 'all',
  selectedYearFilter = 'all_years',
  hideYearHeader = false,
  isChildView = false,
  onOpenSubject,
  onRefreshSubjectDetail,
  onEditChild = null,
  canManageAttendance = true,
  sectionsMode = 'full',
  embeddedInScrollView = false,
  activeChildIds = null,
  activeSubjectIds = null,
  planProgressContext = null,
  onOpenExportModal = null,
}) {
  const students = useMemo(
    () => (Array.isArray(children) ? children : [])
      .filter((child) => child?.id)
      .map((child) => ({ id: child.id, name: getChildLabel(child) })),
    [children]
  );

  const preferredStudentId = useMemo(() => {
    if (
      selectedChildFilter
      && selectedChildFilter !== 'all'
      && students.some((student) => String(student.id) === String(selectedChildFilter))
    ) return selectedChildFilter;
    return students[0]?.id || null;
  }, [students, selectedChildFilter]);

  const [selectedStudentId, setSelectedStudentId] = useState(preferredStudentId);
  useEffect(() => {
    setSelectedStudentId(preferredStudentId);
  }, [preferredStudentId]);

  const selectedStudent = useMemo(
    () => students.find((student) => String(student.id) === String(selectedStudentId)) || null,
    [students, selectedStudentId]
  );
  const selectedStudentRecord = useMemo(
    () => (children || []).find((child) => String(child?.id) === String(selectedStudentId)) || null,
    [children, selectedStudentId]
  );
  const today = useMemo(() => new Date(), []);
  const presentAcademicYearStart = useMemo(
    () => ((today.getMonth() + 1 >= 8) ? today.getFullYear() : today.getFullYear() - 1),
    [today]
  );
  const [selectedAcademicYearStart, setSelectedAcademicYearStart] = useState(() => {
    const raw = String(selectedYearFilter || '').trim();
    const m = raw.match(/^(\d{4})\/\d{2}$/);
    const parsed = m ? Number(m[1]) : NaN;
    return Number.isFinite(parsed) ? parsed : presentAcademicYearStart;
  });
  useEffect(() => {
    const raw = String(selectedYearFilter || '').trim();
    const m = raw.match(/^(\d{4})\/\d{2}$/);
    if (!m) return;
    const startYear = Number(m[1]);
    if (!Number.isFinite(startYear)) return;
    setSelectedAcademicYearStart(startYear);
  }, [selectedYearFilter]);
  const selectedAcademicYearLabel = useMemo(
    () => `${selectedAcademicYearStart}/${String(selectedAcademicYearStart + 1).slice(-2)}`,
    [selectedAcademicYearStart]
  );
  const academicYearStartDate = useMemo(() => new Date(selectedAcademicYearStart, 7, 1), [selectedAcademicYearStart]);
  const academicYearEndDate = useMemo(
    () => new Date(selectedAcademicYearStart + 1, 6, 31, 23, 59, 59, 999),
    [selectedAcademicYearStart]
  );

  const subjectDetails = useMemo(
    () => (filteredSubjects || [])
      .filter((subject) => subject?.id)
      .map((subject) => ({ subject, detail: subjectDetailCache?.[subject.id] || null })),
    [filteredSubjects, subjectDetailCache]
  );
  const allChildIds = useMemo(
    () => (children || []).map((child) => String(child?.id || '').trim()).filter(Boolean),
    [children]
  );
  const resolvedActiveChildIds = useMemo(() => {
    if (Array.isArray(activeChildIds) && activeChildIds.length > 0) {
      return activeChildIds.map((id) => String(id).trim()).filter(Boolean);
    }
    if (selectedChildFilter && selectedChildFilter !== 'all') {
      return [String(selectedChildFilter)];
    }
    if (selectedStudentId) return [String(selectedStudentId)];
    return allChildIds;
  }, [activeChildIds, selectedChildFilter, selectedStudentId, allChildIds]);
  const primaryChildIdForActions = useMemo(
    () => (
      resolvedActiveChildIds.length === 1
        ? resolvedActiveChildIds[0]
        : (selectedStudentId || resolvedActiveChildIds[0] || null)
    ),
    [resolvedActiveChildIds, selectedStudentId]
  );
  const showMultipleChildLabels = resolvedActiveChildIds.length > 1;
  const childNameById = useMemo(() => {
    const map = {};
    (children || []).forEach((child) => {
      const id = String(child?.id || '').trim();
      if (!id) return;
      map[id] = child?.first_name || child?.name || child?.full_name || child?.display_name || 'Student';
    });
    return map;
  }, [children]);
  const subjectOptions = useMemo(
    () => (subjectDetails || []).map(({ subject }) => {
      const fallbackSelectedId = String(selectedStudentId || '').trim();
      const candidateChildIds = []
        .concat(
          Array.isArray(subject?.assignedChildren) ? subject.assignedChildren : [],
          Array.isArray(subject?.assigned_children) ? subject.assigned_children : [],
          Array.isArray(subject?.child_ids) ? subject.child_ids : [],
          Array.isArray(subject?.childIds) ? subject.childIds : []
        )
        .map((id) => String(id || '').trim())
        .filter(Boolean);
      const dedupedChildIds = Array.from(new Set(candidateChildIds));
      const resolvedChildIds = dedupedChildIds.length > 0
        ? dedupedChildIds
        : (fallbackSelectedId ? [fallbackSelectedId] : allChildIds);
      const studentLabel = resolvedChildIds
        .map((childId) => childNameById[childId] || null)
        .filter(Boolean)
        .join(', ');
      return {
        id: subject.id,
        name: subject?.name || 'Subject',
        childIds: resolvedChildIds,
        studentLabel,
      };
    }),
    [subjectDetails, selectedStudentId, allChildIds, childNameById]
  );
  const subjectById = useMemo(() => {
    const map = new Map();
    (subjectDetails || []).forEach(({ subject, detail }) => {
      if (!subject?.id) return;
      map.set(String(subject.id), { subject, detail: detail || null });
    });
    return map;
  }, [subjectDetails]);
  const getChildName = (childId) => {
    const child = (children || []).find((row) => String(row?.id) === String(childId));
    return child?.first_name || child?.name || child?.full_name || child?.display_name || 'Student';
  };
  const [subjectPickerAction, setSubjectPickerAction] = useState(null);
  const [showMarkAllAttendedModal, setShowMarkAllAttendedModal] = useState(false);
  const [showAssignWorkModal, setShowAssignWorkModal] = useState(false);
  const [gradesModalSubjectId, setGradesModalSubjectId] = useState(null);
  const [familyTargetScope, setFamilyTargetScope] = useState('overall');
  const [familyDefaultTargetDays, setFamilyDefaultTargetDays] = useState(null);
  const [familyOverallTargetDays, setFamilyOverallTargetDays] = useState(null);
  const [yearSubjectTargetsById, setYearSubjectTargetsById] = useState({});
  const hasSubjectOptions = subjectOptions.length > 0;
  useEffect(() => {
    let cancelled = false;
    if (!familyId) {
      setFamilyTargetScope('overall');
      setFamilyDefaultTargetDays(null);
      setFamilyOverallTargetDays(null);
      return () => { cancelled = true; };
    }
    (async () => {
      try {
        const selectedYearLabel = String(selectedAcademicYearLabel || '').trim();
        let data = null;
        if (selectedYearLabel) {
          const yearScopedResult = await supabase
            .from('family_planner_settings')
            .select('target_scope, default_constraint_mode, default_target_days')
            .eq('family_id', familyId)
            .eq('school_year_label', selectedYearLabel)
            .limit(1)
            .maybeSingle();
          data = yearScopedResult?.data || null;
        }
        if (!data) {
          const fallbackResult = await supabase
            .from('family_planner_settings')
            .select('target_scope, default_constraint_mode, default_target_days')
            .eq('family_id', familyId)
            .limit(1)
            .maybeSingle();
          data = fallbackResult?.data || null;
        }
        if (cancelled) return;
        const scope = String(data?.target_scope || 'overall').trim().toLowerCase();
        const mode = String(data?.default_constraint_mode || '').trim().toLowerCase();
        const defaultDays = parsePositiveInt(data?.default_target_days);
        const normalizedScope = scope === 'per_subject' ? 'per_subject' : 'overall';
        setFamilyTargetScope(normalizedScope);
        const canUseOverallDays = normalizedScope === 'overall' && (mode === 'days' || (!mode && defaultDays != null));
        const canUsePerSubjectDays = normalizedScope === 'per_subject' && (mode === 'days' || (!mode && defaultDays != null));
        setFamilyOverallTargetDays(canUseOverallDays ? defaultDays : null);
        setFamilyDefaultTargetDays(canUsePerSubjectDays ? defaultDays : null);
      } catch (_) {
        if (!cancelled) {
          setFamilyTargetScope('overall');
          setFamilyDefaultTargetDays(null);
          setFamilyOverallTargetDays(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [familyId, selectedAcademicYearLabel]);
  useEffect(() => {
    let cancelled = false;
    if (!familyId || !Number.isFinite(selectedAcademicYearStart)) {
      setYearSubjectTargetsById({});
      return () => { cancelled = true; };
    }
    const schoolYearStart = `${selectedAcademicYearStart}-01-01`;
    const schoolYearEnd = `${selectedAcademicYearStart + 1}-12-31`;
    supabase
      .from('academic_years')
      .select('subject_targets, subject_targets_override')
      .eq('family_id', familyId)
      .gte('start_date', schoolYearStart)
      .lte('start_date', schoolYearEnd)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const raw = (
          data?.subject_targets && typeof data.subject_targets === 'object' && !Array.isArray(data.subject_targets)
            ? data.subject_targets
            : data?.subject_targets_override && typeof data.subject_targets_override === 'object' && !Array.isArray(data.subject_targets_override)
              ? data.subject_targets_override
              : {}
        );
        setYearSubjectTargetsById(raw || {});
      })
      .catch(() => {
        if (!cancelled) setYearSubjectTargetsById({});
      });
    return () => { cancelled = true; };
  }, [familyId, selectedAcademicYearStart]);
  const subjectPickerCopy = useMemo(() => {
    const byAction = {
      grades_add: {
        title: 'Choose a subject for grades',
        subtitle: 'Pick the subject whose grades you want to update.',
      },
      learning_goals_add: {
        title: 'Choose a subject for units',
        subtitle: 'Pick the subject you want to add units to.',
      },
      learning_goals_edit: {
        title: 'Choose a subject for units',
        subtitle: 'Pick the subject whose units you want to edit.',
      },
    };
    return byAction[String(subjectPickerAction || '').trim().toLowerCase()] || {
      title: 'Choose a subject',
      subtitle: 'Pick the subject you want to update.',
    };
  }, [subjectPickerAction]);
  const openSubjectPicker = (action) => {
    if (!hasSubjectOptions) {
      if (action === 'grades_add') {
        setGradesModalSubjectId(EMPTY_SUBJECT_MODAL_ID);
        return;
      }
      return;
    }
    setSubjectPickerAction(action);
  };
  const closeSubjectPicker = () => setSubjectPickerAction(null);
  const openLearningGoalsPlanner = (subjectId, preferredMethod = 'manual') => {
    const scoped = subjectById.get(String(subjectId));
    const subject = scoped?.subject || null;
    if (!subject?.id) return;
    onRefreshSubjectDetail?.(subject.id);
    onOpenSubject?.(subject.id);
  };
  const openSubjectPlanBuilder = (subjectId, opts = {}) => {
    const scoped = subjectById.get(String(subjectId));
    const subject = scoped?.subject || null;
    if (!subject?.id) return;
    onRefreshSubjectDetail?.(subject.id);
    onOpenSubject?.(subject.id);
  };
  const handleSubjectPickerSelect = (subjectId) => {
    const action = subjectPickerAction;
    setSubjectPickerAction(null);
    if (!subjectId || !action) return;
    if (action === 'grades_add') {
      setGradesModalSubjectId(subjectId);
      // Refresh in background so modal opens immediately.
      onRefreshSubjectDetail?.(subjectId);
      return;
    }
    if (action === 'learning_goals_add') {
      openLearningGoalsPlanner(subjectId, 'manual');
      return;
    }
    if (action === 'learning_goals_edit') {
      openLearningGoalsPlanner(subjectId, 'manual');
    }
  };

  const defaultExpandedSummaryPanel = sectionsMode === 'allEventsOnly' ? 'learning_log' : null;
  const [expandedSummaryPanel, setExpandedSummaryPanel] = useState(defaultExpandedSummaryPanel);
  const [displayedSummaryPanel, setDisplayedSummaryPanel] = useState(defaultExpandedSummaryPanel);
  const summaryPanelAnim = useRef(new Animated.Value(defaultExpandedSummaryPanel ? 1 : 0)).current;
  const prevExpandedSummaryPanelRef = useRef(defaultExpandedSummaryPanel);
  /** Skip expand animation on first paint when a panel is open by default (screen load only). */
  const suppressSummaryPanelOpenAnimationRef = useRef(!!defaultExpandedSummaryPanel);
  const [plannerListRefreshEpoch, setPlannerListRefreshEpoch] = useState(0);
  const [attendanceScrollEpoch, setAttendanceScrollEpoch] = useState(0);
  const [optimisticAttendanceByKey, setOptimisticAttendanceByKey] = useState({});
  useEffect(() => {
    setOptimisticAttendanceByKey({});
  }, [familyId, primaryChildIdForActions, selectedAcademicYearStart]);

  const attendanceRecordsForUI = useMemo(() => {
    const rows = [];
    const byEvent = new Set();
    const nowMs = Date.now();
    const todayYmd = new Date().toISOString().slice(0, 10);
    subjectDetails.forEach(({ subject, detail }) => {
      (detail?.attendanceRecords || []).forEach((record) => {
        if (!recordMatchesChildIds(record, resolvedActiveChildIds)) return;
        const dayDate = String(record?.day_date || '').slice(0, 10);
        if (!dayDate) return;
        const normalizedStatus = String(record?.status || '').toLowerCase();
        // Future lessons should not surface as unattended; without attendance they are Upcoming.
        if (normalizedStatus === 'absent' && dayDate > todayYmd) return;
        const day = new Date(`${dayDate}T12:00:00`);
        if (Number.isNaN(day.getTime())) return;
        if (day < academicYearStartDate || day > academicYearEndDate) return;
        if (record?.event_id) byEvent.add(String(record.event_id));
        rows.push({
          id: `att-${record?.id || `${subject.id}-${record?.event_id || dayDate}`}`,
          subjectId: subject.id,
          subjectName: subject?.name || 'Subject',
          title: subject?.name || 'Lesson',
          dayDate,
          status: normalizedStatus,
          minutes: Number(record?.minutes || 0),
          eventId: record?.event_id || null,
          attendanceLogId: record?.id || null,
          childId: record?.child_id || null,
        });
      });
      (detail?.events || []).forEach((event) => {
        if (!eventMatchesChildIds(event, resolvedActiveChildIds)) return;
        if (String(event?.status || '').toLowerCase() !== 'done') return;
        if (!event?.id || byEvent.has(String(event.id))) return;
        const dayDate = getEventStartYmd(event);
        if (!dayDate) return;
        const eventTsRaw = event?.start_ts || event?.due_ts || event?.end_ts || null;
        const eventTsMs = eventTsRaw ? new Date(eventTsRaw).getTime() : NaN;
        // Future lessons without explicit attendance logs should remain Upcoming.
        if (Number.isFinite(eventTsMs) && eventTsMs > nowMs) return;
        const day = new Date(`${dayDate}T12:00:00`);
        if (Number.isNaN(day.getTime())) return;
        if (day < academicYearStartDate || day > academicYearEndDate) return;
        rows.push({
          id: `fallback-att-${event.id}`,
          subjectId: subject.id,
          subjectName: subject?.name || 'Subject',
          title: event?.title || subject?.name || 'Lesson',
          dayDate,
          status: 'present',
          minutes: Number(event?.duration_minutes || 60),
          eventId: event.id,
          attendanceLogId: null,
          childId: primaryChildIdForActions || null,
        });
      });
    });
    const overrides = optimisticAttendanceByKey || {};
    Object.values(overrides).forEach((entry) => {
      const key = buildAttendanceOverrideKey(entry?.eventId, entry?.dayDate, entry?.childId);
      if (!key) return;
      const idx = rows.findIndex((row) => (
        buildAttendanceOverrideKey(row?.eventId, row?.dayDate, row?.childId || primaryChildIdForActions) === key
      ));
      const overrideStatus = String(entry?.status || '').toLowerCase();
      if (overrideStatus === ATTENDANCE_OVERRIDE_CLEAR) {
        if (idx >= 0) rows.splice(idx, 1);
        return;
      }
      if (idx >= 0) {
        rows[idx] = {
          ...rows[idx],
          status: overrideStatus || String(rows[idx]?.status || '').toLowerCase() || 'absent',
          minutes: Number(entry?.minutes || rows[idx]?.minutes || 60),
        };
      } else {
        rows.push({
          id: `optimistic-att-${key}`,
          subjectId: entry?.subjectId || null,
          subjectName: entry?.subjectName || 'Subject',
          title: entry?.title || 'Lesson',
          dayDate: String(entry?.dayDate || '').slice(0, 10),
          status: String(entry?.status || 'present').toLowerCase(),
          minutes: Number(entry?.minutes || 60),
          eventId: entry?.eventId || null,
          attendanceLogId: null,
          childId: entry?.childId || primaryChildIdForActions || null,
        });
      }
    });
    rows.sort((a, b) => String(b.dayDate).localeCompare(String(a.dayDate)));
    return rows;
  }, [subjectDetails, resolvedActiveChildIds, academicYearStartDate, academicYearEndDate, optimisticAttendanceByKey]);

  const attendanceEvents = useMemo(() => {
    const rows = [];
    subjectDetails.forEach(({ subject, detail }) => {
      (detail?.events || []).forEach((event) => {
        if (!eventMatchesChildIds(event, resolvedActiveChildIds)) return;
        const dayDate = getEventStartYmd(event);
        if (!dayDate) return;
        const day = new Date(`${dayDate}T12:00:00`);
        if (Number.isNaN(day.getTime())) return;
        if (day < academicYearStartDate || day > academicYearEndDate) return;
        rows.push({
          ...event,
          subject_id: event?.subject_id || subject.id,
          title: event?.title || subject?.name || 'Lesson',
        });
      });
    });
    return rows;
  }, [subjectDetails, resolvedActiveChildIds, academicYearStartDate, academicYearEndDate]);
  const attendanceRecordsListUI = useMemo(() => {
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
    attendanceRecordsForUI.forEach((record) => {
      const eventId = String(record?.eventId || '').trim();
      if (!eventId) return;
      const status = String(record?.status || '').toLowerCase();
      const prev = attendanceByEventId.get(eventId) || { hasAttended: false, hasUnattended: false, minutes: 0 };
      if (status === 'present' || status === 'partial') prev.hasAttended = true;
      if (status === 'absent') prev.hasUnattended = true;
      const mins = Number(record?.minutes);
      if (Number.isFinite(mins) && mins > prev.minutes) prev.minutes = mins;
      attendanceByEventId.set(eventId, prev);
      if (!recordPreviewByEventId.has(eventId)) recordPreviewByEventId.set(eventId, record);
    });
    const nowMs = Date.now();
    const todayYmd = new Date(nowMs).toISOString().slice(0, 10);
    const eventRows = (attendanceEvents || [])
      .filter((event) => event && String(event?.status || '').toLowerCase() !== 'canceled')
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
          subjectId: event?.subject_id || null,
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
        const dayKey = String(preview?.dayDate || '').slice(0, 10);
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
          subjectId: preview?.subjectId || null,
          day_date: dayKey,
          minutes: normalizeMinutes(attendanceMeta?.minutes, 60),
          title: String(preview?.title || preview?.subjectName || 'Lesson').trim() || 'Lesson',
          statusLabel,
          statusTone,
          sortTs: Number.isFinite(tsMs) ? tsMs : 0,
        };
      });
    const recordOnlyRowsByKey = new Map();
    attendanceRecordsForUI.forEach((record, idx) => {
      const eventId = String(record?.eventId || '').trim();
      if (eventId) return;
      const dayKey = String(record?.dayDate || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return;
      const subjectId = String(record?.subjectId || '').trim();
      const title = String(record?.title || record?.subjectName || 'Lesson').trim() || 'Lesson';
      const rowKey = `${dayKey}|${subjectId}|${title.toLowerCase()}`;
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
          subjectId: subjectId || null,
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
  }, [attendanceRecordsForUI, attendanceEvents]);
  const attendanceListStateByEventId = useMemo(() => {
    const map = new Map();
    (attendanceRecordsListUI || []).forEach((record) => {
      const eventId = String(record?.event_id || '').trim();
      if (!eventId) return;
      map.set(eventId, {
        isAttended: String(record?.statusTone || '').toLowerCase() === 'attended',
        dayDate: String(record?.day_date || '').slice(0, 10),
        canToggle: !!record?.event_id && !!record?.day_date,
      });
    });
    return map;
  }, [attendanceRecordsListUI]);
  const attendanceEventById = useMemo(() => {
    const map = new Map();
    (attendanceEvents || []).forEach((event) => {
      const eid = String(event?.id || '').trim();
      if (!eid) return;
      map.set(eid, event);
    });
    return map;
  }, [attendanceEvents]);
  const attendanceLogIdByEventDayChild = useMemo(() => {
    const index = new Map();
    (subjectDetails || []).forEach(({ detail }) => {
      (detail?.attendanceRecords || []).forEach((record) => {
        const key = buildAttendanceOverrideKey(record?.event_id, record?.day_date, record?.child_id);
        if (!key || !record?.id) return;
        index.set(key, record.id);
      });
    });
    return index;
  }, [subjectDetails]);
  const resolveChildIdsForAttendanceEvent = useCallback((event) => {
    const ids = [];
    if (event?.child_id) ids.push(String(event.child_id));
    if (Array.isArray(event?.child_ids)) {
      event.child_ids.forEach((id) => {
        if (id != null && String(id).trim()) ids.push(String(id));
      });
    }
    let resolved = [...new Set(ids.filter(Boolean))];
    if (!resolved.length && primaryChildIdForActions) resolved = [String(primaryChildIdForActions)];
    if (resolvedActiveChildIds.length > 0) {
      resolved = resolved.filter((id) => resolvedActiveChildIds.includes(String(id)));
    }
    if (!resolved.length && primaryChildIdForActions) resolved = [String(primaryChildIdForActions)];
    return resolved;
  }, [primaryChildIdForActions, resolvedActiveChildIds]);
  const resolvedActiveSubjectIds = useMemo(() => {
    const allIds = (filteredSubjects || [])
      .map((subject) => String(subject?.id || '').trim())
      .filter(Boolean);
    if (!allIds.length) return [];
    if (Array.isArray(activeSubjectIds) && activeSubjectIds.length > 0) {
      const selectedSet = new Set(activeSubjectIds.map((id) => String(id)));
      const valid = allIds.filter((id) => selectedSet.has(id));
      return valid.length > 0 ? valid : allIds;
    }
    return allIds;
  }, [filteredSubjects, activeSubjectIds]);
  const allEventsAggregate = useMemo(() => {
    const activeSet = new Set(resolvedActiveSubjectIds.map(String));
    const events = [];
    const eventOutcomes = [];
    const materials = [];
    const eventAttachmentMaterials = [];
    const assignmentsByEventId = {};
    const materialIds = new Set();
    const eventOutcomeIds = new Set();
    const seenEventIds = new Set();
    const applyAcademicYearFilter = sectionsMode !== 'allEventsOnly';

    const pushEventIfEligible = (rawEvent, subject) => {
      const event = normalizeEventForAllEventsList(rawEvent, subject?.id);
      if (!event?.id) return;
      const dedupeKey = String(event.id);
      if (seenEventIds.has(dedupeKey)) return;
      if (event.is_backlog === true) return;
      if (event.deleted || event.deleted_at) return;
      if (String(event?.status || '').toLowerCase() === 'canceled') return;
      if (!eventMatchesChildIds(event, resolvedActiveChildIds)) return;
      const rawTs = event.start_ts || event.due_ts || null;
      let eventTs = rawTs ? new Date(rawTs).getTime() : NaN;
      if (!Number.isFinite(eventTs)) {
        const ymd = String(event?.date_local || '').slice(0, 10);
        if (ymd) eventTs = new Date(`${ymd}T12:00:00`).getTime();
      }
      if (applyAcademicYearFilter && Number.isFinite(eventTs)) {
        if (eventTs < academicYearStartDate.getTime() || eventTs > academicYearEndDate.getTime()) return;
      }
      seenEventIds.add(dedupeKey);
      events.push(event);
    };

    subjectDetails.forEach(({ subject, detail }) => {
      const subjectId = String(subject?.id || '').trim();
      if (!subjectId || !activeSet.has(subjectId)) return;
      (detail?.events || []).forEach((event) => pushEventIfEligible(event, subject));
      collectPlanEventsForSubject(planProgressContext, subjectId).forEach((event) => {
        pushEventIfEligible(event, subject);
      });
      (detail?.eventOutcomes || []).forEach((outcome) => {
        const outcomeId = String(outcome?.id || outcome?.event_id || '').trim();
        if (outcomeId && eventOutcomeIds.has(outcomeId)) return;
        if (outcomeId) eventOutcomeIds.add(outcomeId);
        eventOutcomes.push(outcome);
      });
      (detail?.materials || []).forEach((material) => {
        const materialId = String(material?.id || '').trim();
        if (!materialId || materialIds.has(materialId)) return;
        materialIds.add(materialId);
        materials.push(material);
      });
      (detail?.eventAttachmentMaterials || []).forEach((material) => {
        const materialId = String(material?.id || '').trim();
        if (!materialId || materialIds.has(materialId)) return;
        materialIds.add(materialId);
        eventAttachmentMaterials.push(material);
      });
      Object.entries(detail?.assignmentsByEventId || {}).forEach(([eventId, assignments]) => {
        if (!eventId) return;
        assignmentsByEventId[eventId] = assignments;
      });
    });

    return {
      events,
      eventOutcomes,
      materials,
      eventAttachmentMaterials,
      assignmentsByEventId,
    };
  }, [
    subjectDetails,
    resolvedActiveSubjectIds,
    resolvedActiveChildIds,
    academicYearStartDate,
    academicYearEndDate,
    sectionsMode,
    planProgressContext,
  ]);
  const handleOpenEventDetails = (eventId, initialEvent = null) => {
    if (!eventId) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openEventModal', {
        detail: { eventId, initialEvent: initialEvent || null },
      }));
      return;
    }
    if (initialEvent?.subject_id || initialEvent?.subjectId) {
      onOpenSubject?.(initialEvent.subject_id || initialEvent.subjectId);
    }
  };
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
    const detail = {
      eventType: 'Lesson',
      date: new Date(`${normKey}T12:00:00`),
    };
    if (resolvedActiveChildIds.length > 0) {
      detail.childIds = resolvedActiveChildIds.map(String);
      detail.childId = detail.childIds[0] || null;
    } else if (primaryChildIdForActions) {
      detail.childId = String(primaryChildIdForActions);
      detail.childIds = [String(primaryChildIdForActions)];
    }
    window.dispatchEvent(new CustomEvent('openTaskModal', { detail }));
  }, [primaryChildIdForActions, resolvedActiveChildIds]);
  const getEventMinutes = useCallback((event) => {
    const durationMinutes = Number(event?.duration_minutes);
    if (Number.isFinite(durationMinutes) && durationMinutes > 0) return Math.round(durationMinutes);
    const startMs = event?.start_ts ? new Date(event.start_ts).getTime() : NaN;
    const endMs = event?.end_ts ? new Date(event.end_ts).getTime() : NaN;
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      return Math.round((endMs - startMs) / 60000);
    }
    return 60;
  }, []);
  const handleToggleEventAttendanceForDate = useCallback(async (dateKey, eventId, eventFallback = null) => {
    const normKey = String(dateKey || '').slice(0, 10);
    const eid = String(eventId || '').trim();
    if (!familyId || !normKey || !eid) return;
    const event = attendanceEventById.get(eid) || eventFallback;
    if (!event?.id) return;
    const targetChildIds = resolveChildIdsForAttendanceEvent(event);
    if (!targetChildIds.length) return;
    const existingRows = (attendanceRecordsForUI || []).filter((row) => (
      String(row?.eventId || '') === eid
      && String(row?.dayDate || '').slice(0, 10) === normKey
      && (!row?.childId || targetChildIds.includes(String(row.childId)))
    ));
    const hasPresent = existingRows.some((row) => ['present', 'partial'].includes(String(row?.status || '').toLowerCase()));
    const todayYmd = new Date().toISOString().slice(0, 10);
    const isFutureDate = normKey > todayYmd;
    // Future unmark should return to Upcoming (no explicit attendance row), not Absent.
    const nextStatus = hasPresent ? (isFutureDate ? null : 'absent') : 'present';
    const minutes = getEventMinutes(event);
    const subjectMatch = subjectDetails.find(({ subject }) => String(subject?.id || '') === String(event?.subject_id || event?.subjectId || ''));
    if (targetChildIds.length > 0) {
      if (nextStatus == null) {
        const nextOverrides = {};
        targetChildIds.forEach((childId) => {
          const overrideKey = buildAttendanceOverrideKey(eid, normKey, childId);
          if (!overrideKey) return;
          nextOverrides[overrideKey] = {
            eventId: eid,
            dayDate: normKey,
            childId,
            status: ATTENDANCE_OVERRIDE_CLEAR,
            minutes: 0,
            subjectId: subjectMatch?.subject?.id || null,
            subjectName: subjectMatch?.subject?.name || 'Subject',
            title: event?.title || subjectMatch?.subject?.name || 'Lesson',
          };
        });
        if (Object.keys(nextOverrides).length > 0) {
          setOptimisticAttendanceByKey((prev) => ({ ...prev, ...nextOverrides }));
        }
      } else {
        const nextOverrides = {};
        targetChildIds.forEach((childId) => {
          const overrideKey = buildAttendanceOverrideKey(eid, normKey, childId);
          if (!overrideKey) return;
          nextOverrides[overrideKey] = {
            eventId: eid,
            dayDate: normKey,
            childId,
            status: nextStatus,
            minutes,
            subjectId: subjectMatch?.subject?.id || null,
            subjectName: subjectMatch?.subject?.name || 'Subject',
            title: event?.title || subjectMatch?.subject?.name || 'Lesson',
          };
        });
        if (Object.keys(nextOverrides).length > 0) {
          setOptimisticAttendanceByKey((prev) => ({ ...prev, ...nextOverrides }));
        }
      }
    }
    try {
      await Promise.all(targetChildIds.map(async (childId) => {
        const lookupKey = buildAttendanceOverrideKey(eid, normKey, childId);
        const existingLogId = lookupKey ? attendanceLogIdByEventDayChild.get(lookupKey) : null;
        if (nextStatus == null) {
          if (!existingLogId) return;
          await deleteAttendanceLog(existingLogId);
          return;
        }
        if (existingLogId) {
          await updateAttendanceLog(existingLogId, { status: nextStatus, minutes });
          return;
        }
        await createAttendanceLog({
          family_id: familyId,
          child_id: String(childId),
          event_id: event.id,
          day_date: normKey,
          status: nextStatus,
          minutes,
        });
      }));
      // Refresh in background so toggles stay snappy.
      if (event?.subject_id || event?.subjectId) {
        Promise.resolve(onRefreshSubjectDetail?.(event.subject_id || event.subjectId)).catch(() => {});
      } else if (typeof onRefreshSubjectDetail === 'function') {
        Promise.all(
          (subjectDetails || []).map(({ subject }) => (
            subject?.id ? onRefreshSubjectDetail(subject.id) : null
          )).filter(Boolean)
        ).catch(() => {});
      }
    } catch (err) {
      if (targetChildIds.length > 0) {
        setOptimisticAttendanceByKey((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          targetChildIds.forEach((childId) => {
            const overrideKey = buildAttendanceOverrideKey(eid, normKey, childId);
            if (overrideKey) delete next[overrideKey];
          });
          return next;
        });
      }
      console.warn('[ProgressTab] Failed toggling attendance:', err);
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
    }
  }, [familyId, attendanceEventById, attendanceRecordsForUI, getEventMinutes, onRefreshSubjectDetail, subjectDetails, resolveChildIdsForAttendanceEvent, attendanceLogIdByEventDayChild]);
  const resolveAllEventsAttendanceState = useCallback((event) => {
    const eventId = String(event?.id || '').trim();
    if (!eventId) {
      return { isAttended: false, canToggle: false, dayDate: '' };
    }
    const cached = attendanceListStateByEventId.get(eventId);
    if (cached) return cached;
    const tsRaw = event?.start_ts || event?.due_ts || event?.end_ts || null;
    const dayDate = tsRaw ? String(tsRaw).slice(0, 10) : '';
    return {
      isAttended: false,
      canToggle: !!dayDate,
      dayDate,
    };
  }, [attendanceListStateByEventId]);
  const handleAllEventsAttendanceToggle = useCallback((event) => {
    const state = resolveAllEventsAttendanceState(event);
    const eventId = String(event?.id || '').trim();
    if (!eventId || !state?.dayDate || state.canToggle === false) return;
    handleToggleEventAttendanceForDate(state.dayDate, eventId, event);
  }, [resolveAllEventsAttendanceState, handleToggleEventAttendanceForDate]);

  const refreshProgressEventsFromPlanner = useCallback(() => {
    setPlannerListRefreshEpoch((v) => v + 1);
    (subjectDetails || []).forEach(({ subject }) => {
      if (subject?.id) {
        Promise.resolve(onRefreshSubjectDetail?.(subject.id)).catch(() => {});
      }
    });
  }, [subjectDetails, onRefreshSubjectDetail]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onRefresh = () => refreshProgressEventsFromPlanner();
    window.addEventListener('refreshCalendar', onRefresh);
    window.addEventListener('eventAttendancePatched', onRefresh);
    return () => {
      window.removeEventListener('refreshCalendar', onRefresh);
      window.removeEventListener('eventAttendancePatched', onRefresh);
    };
  }, [refreshProgressEventsFromPlanner]);
  const canMarkAttendanceForDateKey = useCallback((dateKey) => {
    const normKey = String(dateKey || '').slice(0, 10);
    if (!normKey) return false;
    if ((attendanceEvents || []).some((event) => String(getEventStartYmd(event) || '').slice(0, 10) === normKey)) return true;
    return (attendanceRecordsForUI || []).some((record) => String(record?.dayDate || '').slice(0, 10) === normKey);
  }, [attendanceEvents, attendanceRecordsForUI]);
  const attendanceDayCounts = useMemo(() => {
    const byDay = new Map();
    const todayYmd = new Date().toISOString().slice(0, 10);
    const ensureDay = (dayKey) => {
      if (!byDay.has(dayKey)) byDay.set(dayKey, { hasPresent: false, hasAbsent: false });
      return byDay.get(dayKey);
    };
    attendanceRecordsForUI.forEach((record) => {
      const dayKey = String(record?.dayDate || '').slice(0, 10);
      if (!dayKey) return;
      const status = String(record?.status || '').toLowerCase();
      const bucket = ensureDay(dayKey);
      if (status === 'present' || status === 'partial') bucket.hasPresent = true;
      if (status === 'absent' && dayKey <= todayYmd) bucket.hasAbsent = true;
    });
    (attendanceEvents || []).forEach((event) => {
      if (String(event?.status || '').toLowerCase() === 'canceled') return;
      const dayKey = String(getEventStartYmd(event) || '').slice(0, 10);
      if (dayKey) ensureDay(dayKey);
    });
    let present = 0;
    let absent = 0;
    const upcomingDaySet = new Set();
    byDay.forEach((bucket, dayKey) => {
      if (bucket.hasPresent) present += 1;
      else if (bucket.hasAbsent || dayKey <= todayYmd) absent += 1;
      else upcomingDaySet.add(dayKey);
    });
    return { present, absent, upcoming: upcomingDaySet.size };
  }, [attendanceRecordsForUI, attendanceEvents]);

  const gradeRows = useMemo(() => {
    const byEvent = new Set();
    const rows = [];
    subjectDetails.forEach(({ subject, detail }) => {
      (detail?.eventOutcomes || []).forEach((outcome) => {
        if (!outcome?.grade) return;
        const event = (detail?.events || []).find((e) => String(e?.id) === String(outcome?.event_id));
        const eventMatchesChild = !event || eventMatchesChildIds(event, resolvedActiveChildIds);
        if (!eventMatchesChild) return;
        const when = event?.end_ts || event?.start_ts || outcome?.created_at;
        if (!when) return;
        rows.push({
          id: `outcome-${outcome.id}`,
          subjectId: subject.id,
          subjectName: subject?.name || 'Subject',
          name: event?.title || subject?.name || 'Assessment',
          date: when,
          grade: outcome.grade,
          eventId: event?.id || outcome?.event_id || null,
          event: event || null,
        });
        if (outcome?.event_id) byEvent.add(String(outcome.event_id));
      });

      (detail?.events || []).forEach((event) => {
        if (!event?.grade || byEvent.has(String(event.id))) return;
        if (!eventMatchesChildIds(event, resolvedActiveChildIds)) return;
        rows.push({
          id: `event-grade-${event.id}`,
          subjectId: subject.id,
          subjectName: subject?.name || 'Subject',
          name: event?.title || subject?.name || 'Assessment',
          date: event?.end_ts || event?.start_ts,
          grade: event.grade,
          eventId: event?.id || null,
          event: event || null,
        });
      });

      (detail?.grades || []).forEach((grade) => {
        if (!recordMatchesChildIds(grade, resolvedActiveChildIds)) return;
        const percentFromScore = (
          grade?.score != null && grade?.possible != null && Number(grade.possible) > 0
        ) ? Math.round((Number(grade.score) / Number(grade.possible)) * 100) : null;
        const percentRawScore = (
          grade?.score != null && Number(grade.score) >= 0 && Number(grade.score) <= 100
        ) ? Number(grade.score) : null;
        const numeric = percentFromScore ?? percentRawScore ?? gradeToPercent(grade?.grade);
        rows.push({
          id: `grade-${grade.id || `${subject.id}-${grade.created_at}`}`,
          subjectId: subject.id,
          subjectName: subject?.name || 'Subject',
          name: grade?.term_label || grade?.label || `Recorded ${subject?.name || 'grade'}`,
          date: grade?.created_at,
          grade: grade?.grade || (numeric != null ? `${Math.round(numeric)}%` : '—'),
          eventId: null,
          event: null,
        });
      });
    });
    rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return rows;
  }, [subjectDetails, resolvedActiveChildIds]);

  const learningGoalsBySubject = useMemo(() => {
    return subjectDetails.map(({ subject, detail }) => {
      let units = Array.isArray(detail?.units) ? detail.units : [];
      if (!units.length) {
        const byUnit = new Map();
        (detail?.events || []).forEach((event) => {
          if (!eventMatchesChildIds(event, resolvedActiveChildIds)) return;
          const unitTitle = String(
            event?.unit_name || event?.curriculum_unit_title || event?.unit || event?.unit_topic || 'General'
          ).trim();
          const lessonTitle = String(event?.lesson_name || event?.title || '').trim();
          if (!byUnit.has(unitTitle)) byUnit.set(unitTitle, new Set());
          if (lessonTitle) byUnit.get(unitTitle).add(lessonTitle);
        });
        units = Array.from(byUnit.entries()).map(([title, lessons]) => ({
          title,
          lessons: Array.from(lessons).map((lesson) => ({ title: lesson })),
        }));
      }
      return {
        subjectId: subject.id,
        subjectName: subject?.name || 'Subject',
        units,
      };
    });
  }, [subjectDetails, resolvedActiveChildIds]);
  const overviewStats = useMemo(() => {
    const scheduledDaySet = new Set((attendanceEvents || []).map((event) => getEventStartYmd(event)).filter(Boolean));
    const scheduledDays = scheduledDaySet.size;
    const completedDays = attendanceDayCounts.present;
    const markedDays = attendanceDayCounts.present + attendanceDayCounts.absent;
    const attendanceRate = markedDays > 0 ? Math.round((attendanceDayCounts.present / markedDays) * 100) : null;
    const completionRate = scheduledDays > 0 ? Math.round((completedDays / scheduledDays) * 100) : 0;
    const numericGrades = (gradeRows || []).map((row) => parseGradeNumeric(row?.grade)).filter((v) => v != null);
    const gradeAverage = numericGrades.length
      ? Math.round(numericGrades.reduce((sum, score) => sum + Number(score || 0), 0) / numericGrades.length)
      : null;
    const totalUnits = (learningGoalsBySubject || []).reduce((sum, entry) => sum + ((entry?.units || []).length || 0), 0);
    const totalLessons = (learningGoalsBySubject || []).reduce(
      (sum, entry) => sum + ((entry?.units || []).reduce((unitSum, unit) => (
        unitSum + ((unit?.lessons || []).length || 0)
      ), 0)),
      0
    );
    const targetDays = Math.max(180, scheduledDays);
    const yearDurationMs = Math.max(1, academicYearEndDate.getTime() - academicYearStartDate.getTime());
    const elapsedRatio = Math.max(0, Math.min(1, (today.getTime() - academicYearStartDate.getTime()) / yearDurationMs));
    const expectedCompletion = Math.round(elapsedRatio * 100);
    const paceDelta = completionRate - expectedCompletion;
    const paceLabel = paceDelta < -8 ? 'Behind' : paceDelta > 8 ? 'Ahead' : 'On track';
    return {
      scheduledDays,
      completedDays,
      markedDays,
      attendanceRate,
      completionRate,
      gradeAverage,
      totalUnits,
      totalLessons,
      targetDays,
      paceLabel,
      paceDelta,
    };
  }, [
    attendanceEvents,
    attendanceDayCounts,
    gradeRows,
    learningGoalsBySubject,
    academicYearStartDate,
    academicYearEndDate,
    today,
  ]);
  const childProgressRows = useMemo(() => {
    const learningTitles = [];
    (learningGoalsBySubject || []).forEach((entry) => {
      (entry?.units || []).forEach((unit) => {
        const title = String(unit?.title || '').trim();
        if (title) learningTitles.push(title);
      });
    });
    const topTitles = Array.from(new Set(learningTitles)).slice(0, 3);
    const moreCount = Math.max(0, learningTitles.length - topTitles.length);
    return [{
      id: String(selectedStudent?.id || 'student'),
      childName: selectedStudent?.name || 'Student',
      attendanceLabel: overviewStats.attendanceRate == null
        ? 'No attendance yet'
        : `${overviewStats.attendanceRate}% (${overviewStats.completedDays}/${Math.max(overviewStats.markedDays, 1)})`,
      gradeLabel: overviewStats.gradeAverage == null ? 'No grades yet' : `${overviewStats.gradeAverage}%`,
      learningLabel: topTitles.length
        ? `${topTitles.join(', ')}${moreCount > 0 ? ` +${moreCount} more` : ''}`
        : 'No units yet',
    }];
  }, [selectedStudent, learningGoalsBySubject, overviewStats]);
  const subjectProgressRows = useMemo(() => {
    const unitsBySubject = new Map((learningGoalsBySubject || []).map((entry) => [String(entry?.subjectId || ''), entry?.units || []]));
    const nowTs = Date.now();
    const encouragementName = String(selectedStudent?.name || 'your student').trim().split(/\s+/)[0] || 'your student';
    const selectedStudentName = String(selectedStudent?.name || 'Student').trim() || 'Student';
    return subjectDetails.map(({ subject, detail }) => {
      const sid = String(subject?.id || '');
      const detailReady = Boolean(detail);
      const plan = detail?.plan || {};
      const subjectTargetsRaw =
        plan?.subject_targets && typeof plan.subject_targets === 'object' && !Array.isArray(plan.subject_targets)
          ? plan.subject_targets
          : plan?.subject_targets_override && typeof plan.subject_targets_override === 'object' && !Array.isArray(plan.subject_targets_override)
            ? plan.subject_targets_override
            : null;
      const subjectTargetEntry =
        subjectTargetsRaw && typeof subjectTargetsRaw[sid] === 'object' ? subjectTargetsRaw[sid] : null;
      const yearSubjectTargetEntry =
        yearSubjectTargetsById && typeof yearSubjectTargetsById[sid] === 'object' ? yearSubjectTargetsById[sid] : null;
      const subjectEvents = (detail?.events || []).filter((event) => (
        eventMatchesChildIds(event, resolvedActiveChildIds)
        && String(event?.status || '').toLowerCase() !== 'canceled'
      ));
      const completedDaySet = new Set();
      const upcomingDaySet = new Set();
      const projectedDaySet = new Set();
      const todayYmd = new Date(nowTs).toISOString().slice(0, 10);
      subjectEvents.forEach((event) => {
        const rawTs = event?.start_ts || event?.start || event?.start_local || event?.due_ts || null;
        const eventTs = rawTs ? new Date(rawTs).getTime() : NaN;
        if (!Number.isFinite(eventTs)) return;
        if (eventTs < academicYearStartDate.getTime() || eventTs > academicYearEndDate.getTime()) return;
        const dayKey = new Date(eventTs).toISOString().slice(0, 10);
        if (!dayKey) return;
        const status = String(event?.status || '').trim().toLowerCase();
        const instructionalStatus = String(event?.instructional_status || '').trim().toUpperCase();
        const isAttended = event?.hasAttendancePresent === true
          || status === 'done'
          || status === 'completed'
          || instructionalStatus === 'MANUAL_COUNTS';
        if (isAttended || dayKey < todayYmd) {
          completedDaySet.add(dayKey);
          projectedDaySet.add(dayKey);
        } else {
          upcomingDaySet.add(dayKey);
          projectedDaySet.add(dayKey);
        }
      });
      const subjectPlannedDays = projectedDaySet.size;
      const completedProjectedDays = Math.max(0, completedDaySet.size);
      const upcomingProjectedDays = Math.max(
        0,
        [...upcomingDaySet].filter((dayKey) => !completedDaySet.has(dayKey)).length
      );
      const projectedDays = projectedDaySet.size;
      const weekdaySet = new Set(
        subjectEvents
          .map((event) => {
            const rawTs = event?.start_ts || event?.start || event?.start_local || event?.due_ts || null;
            if (!rawTs) return null;
            const dt = new Date(rawTs);
            return Number.isNaN(dt.getTime()) ? null : dt.getDay();
          })
          .filter((d) => Number.isInteger(d))
      );
      const classDaysPerWeek = Math.max(1, weekdaySet.size);
      const subjectAttendance = attendanceRecordsForUI.filter((row) => String(row?.subjectId) === sid);
      const byDay = new Map();
      subjectAttendance.forEach((row) => {
        const dayKey = String(row?.dayDate || '').slice(0, 10);
        if (!dayKey) return;
        if (!byDay.has(dayKey)) byDay.set(dayKey, { present: false, absent: false });
        const bucket = byDay.get(dayKey);
        const status = String(row?.status || '').toLowerCase();
        if (status === 'present' || status === 'partial') bucket.present = true;
        if (status === 'absent') bucket.absent = true;
      });
      let doneDays = 0;
      byDay.forEach((bucket) => {
        if (bucket.present) doneDays += 1;
      });
      const useOverallTargetMode = familyTargetScope === 'overall' && familyOverallTargetDays != null;
      const targetDays = useOverallTargetMode
        ? null
        : parsePositiveInt(
          yearSubjectTargetEntry?.target_days
          ?? yearSubjectTargetEntry?.targetDays
          ?? yearSubjectTargetEntry?.target_instructional_days
          ?? yearSubjectTargetEntry?.targetInstructionalDays
          ?? subjectTargetEntry?.target_days
          ?? subjectTargetEntry?.targetDays
          ?? subjectTargetEntry?.target_instructional_days
          ?? subjectTargetEntry?.targetInstructionalDays
          ?? detail?.settings?.default_target_days
          ?? detail?.settings?.defaultTargetDays
          ?? detail?.settings?.target_days
          ?? detail?.settings?.targetDays
          ?? detail?.settings?.target_instructional_days
          ?? detail?.settings?.targetInstructionalDays
          ?? detail?.plan?.target_days
          ?? detail?.plan?.targetDays
          ?? detail?.subject?.default_target_days
          ?? detail?.subject?.defaultTargetDays
          ?? detail?.subject?.target_days
          ?? detail?.subject?.targetDays
          ?? detail?.subject?.target_instructional_days
          ?? detail?.subject?.targetInstructionalDays
          ?? subject?.default_target_days
          ?? subject?.defaultTargetDays
          ?? subject?.target_days
          ?? subject?.targetDays
          ?? subject?.target_instructional_days
          ?? subject?.targetInstructionalDays
          ?? familyDefaultTargetDays
        );
      const shortfallDays = targetDays != null ? Math.max(0, targetDays - projectedDays) : 0;
      const paceLabel = targetDays == null
        ? (subjectPlannedDays > 0 ? 'On track' : 'Not planned')
        : (projectedDays < targetDays ? 'Behind' : (projectedDays > targetDays ? 'Ahead' : 'On track'));
      const gradesForSubject = gradeRows.map((row) => (
        String(row?.subjectId) === sid ? parseGradeNumeric(row?.grade) : null
      )).filter((v) => v != null);
      const avgPercent = gradesForSubject.length
        ? Math.round(gradesForSubject.reduce((sum, g) => sum + Number(g || 0), 0) / gradesForSubject.length)
        : null;
      const units = unitsBySubject.get(sid) || [];
      const latestUnit = (() => {
        const eventsByDate = [...subjectEvents].sort((a, b) => String(b?.start_ts || b?.end_ts || '').localeCompare(String(a?.start_ts || a?.end_ts || '')));
        const unitFromEvents = eventsByDate
          .map((event) => String(event?.unit_name || event?.curriculum_unit_title || event?.unit || event?.unit_topic || '').trim())
          .find(Boolean);
        if (unitFromEvents) return unitFromEvents;
        const firstUnit = units.find((u) => String(u?.title || '').trim());
        return firstUnit ? String(firstUnit.title).trim() : '—';
      })();
      const outcomesByEventId = new Map(
        (detail?.eventOutcomes || [])
          .filter((outcome) => outcome?.event_id)
          .map((outcome) => [String(outcome.event_id), outcome])
      );
      const ungradedPastEvents = subjectEvents.reduce((count, event) => {
        const rawTs = event?.end_ts || event?.start_ts || event?.due_ts || event?.start || null;
        const ts = rawTs ? new Date(rawTs).getTime() : NaN;
        if (!Number.isFinite(ts) || ts > nowTs) return count;
        const eventGrade = String(event?.grade || '').trim();
        const outcomeGrade = String(outcomesByEventId.get(String(event?.id || ''))?.grade || '').trim();
        if (eventGrade || outcomeGrade) return count;
        return count + 1;
      }, 0);
      const hasPlan = subjectPlannedDays > 0;
      const noEventsScheduled = detailReady && subjectPlannedDays === 0;
      const yearHasNotStarted = nowTs < academicYearStartDate.getTime();
      const hasMarkedAttendance = doneDays > 0;
      const hasMarkedGrade = avgPercent != null;
      const showNothingYetStatus = yearHasNotStarted || (!hasMarkedAttendance && !hasMarkedGrade);
      const statusNeeds = [];
      if (ungradedPastEvents > 0) statusNeeds.push('needs grading');
      if (paceLabel === 'Behind') statusNeeds.push('is behind pace');
      if (!useOverallTargetMode && shortfallDays > 0) statusNeeds.push("won't complete saved attendance target by end of term");
      if (avgPercent != null && avgPercent < 75) statusNeeds.push('has a low grade trend');
      const statusLabel = !detailReady
        ? 'Loading'
        : (showNothingYetStatus ? 'On track' : (noEventsScheduled || statusNeeds.length > 0 ? 'Needs attention' : 'On track'));
      const statusDetail = (() => {
        if (!detailReady) return 'Loading subject activity...';
        if (showNothingYetStatus) return `Nothing yet, stay tuned for updates once ${selectedStudentName} starts learning`;
        if (noEventsScheduled) return 'No events scheduled yet for this subject';
        if (statusNeeds.length > 0) return formatNeedsSentence(statusNeeds);
        if (paceLabel === 'Ahead') return `Give ${encouragementName} free time, ${encouragementName} is ahead of schedule`;
        return `Let ${encouragementName} know they're doing great`;
      })();
      return {
        id: sid,
        subject: subject?.name || 'Subject',
        plannedDays: projectedDays,
        classDaysPerWeek,
        missingDays: shortfallDays,
        shortfallDays,
        targetDays,
        attendedDays: doneDays,
        gradeAverageLetter: avgPercent == null ? '—' : percentToLetter(avgPercent),
        unitsCompleted: units.length,
        latestUnit,
        ungradedPastEvents,
        hasPlan,
        showNothingYetStatus,
        detailReady,
        statusLabel,
        statusDetail,
        paceLabel,
      };
    }).filter((row) => row.id);
  }, [subjectDetails, resolvedActiveChildIds, attendanceRecordsForUI, gradeRows, learningGoalsBySubject, selectedStudent?.name, academicYearStartDate, academicYearEndDate, familyDefaultTargetDays, familyTargetScope, familyOverallTargetDays, yearSubjectTargetsById]);
  const savedProfileGrade = useMemo(() => {
    const raw = selectedStudentRecord?.grade
      ?? selectedStudentRecord?.grade_level
      ?? selectedStudentRecord?.gradeLevel
      ?? selectedStudentRecord?.grade_label
      ?? null;
    const normalized = String(raw || '').trim();
    return normalized || null;
  }, [selectedStudentRecord]);
  const savedProfileGradeLabel = useMemo(
    () => formatProfileGradeLabel(savedProfileGrade),
    [savedProfileGrade]
  );
  const subjectsForYearLabel = useMemo(() => {
    const names = [...new Set(
      (subjectProgressRows || [])
        .map((row) => String(row?.subject || '').trim())
        .filter(Boolean)
    )];
    return names.length ? names.join(', ') : 'No subjects for this school year';
  }, [subjectProgressRows]);
  const gradeAndSubjectsLine = useMemo(
    () => `${savedProfileGradeLabel || 'No saved grade'} - ${subjectsForYearLabel}`,
    [savedProfileGradeLabel, subjectsForYearLabel]
  );
  const aggregateChildLabel = useMemo(() => {
    if (resolvedActiveChildIds.length === 0 || resolvedActiveChildIds.length >= allChildIds.length) {
      return null;
    }
    const names = resolvedActiveChildIds
      .map((id) => childNameById[id] || null)
      .filter(Boolean);
    if (names.length === 0) return null;
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return names.join(', ');
  }, [resolvedActiveChildIds, allChildIds.length, childNameById]);
  const progressDisplayName = aggregateChildLabel || selectedStudent?.name || 'Student';
  const showAggregateChildScope = resolvedActiveChildIds.length !== 1;
  const progressHeaderTitle = isChildView ? `${progressDisplayName} - Your Progress` : `${progressDisplayName}'s Progress`;
  const subjectsSectionTitle = isChildView ? 'Your Subjects' : `${progressDisplayName}'s Subjects`;
  const attendanceSectionTitle = isChildView
    ? 'Your Attendance - All Subjects'
    : (showAggregateChildScope
      ? 'Attendance - All Subjects'
      : `${progressDisplayName}'s Attendance - All Subjects`);
  const gradesSectionTitle = isChildView
    ? 'Your Grades - All Subjects'
    : (showAggregateChildScope
      ? 'Grades - All Subjects'
      : `${progressDisplayName}'s Grades - All Subjects`);
  const showFullProgressChrome = sectionsMode === 'full';
  const hasAggregateSubjectScope = (filteredSubjects || []).length > 0;
  const showAttendanceGradesSections = sectionsMode === 'attendanceGradesOnly'
    ? hasAggregateSubjectScope
    : sectionsMode === 'full' && subjectProgressRows.length > 0;
  /** Summary cards + expand panels (Subjects page). Standalone All Events table archived below. */
  const showAllEventsSection = sectionsMode === 'allEventsOnly' && hasAggregateSubjectScope;
  const useLearningFillLayout = embeddedInScrollView && sectionsMode === 'allEventsOnly' && Platform.OS === 'web';
  const { height: windowHeight } = useWindowDimensions();
  const attendanceListMaxHeight = useMemo(() => {
    if (!useLearningFillLayout) return 480;
    if (!Number.isFinite(windowHeight) || windowHeight <= 0) return 520;
    return Math.min(560, Math.max(320, windowHeight - 420));
  }, [useLearningFillLayout, windowHeight]);
  const detailLoadAttemptedRef = useRef(new Set());
  useEffect(() => {
    if (!showAllEventsSection || typeof onRefreshSubjectDetail !== 'function') return;
    resolvedActiveSubjectIds.forEach((subjectId) => {
      const sid = String(subjectId || '').trim();
      if (!sid || detailLoadAttemptedRef.current.has(sid)) return;
      const cached = subjectDetailCache?.[sid];
      const hasPlanEvents = collectPlanEventsForSubject(planProgressContext, sid).length > 0;
      if (cached && (Array.isArray(cached.events) && cached.events.length > 0 || hasPlanEvents)) return;
      detailLoadAttemptedRef.current.add(sid);
      onRefreshSubjectDetail(sid);
    });
  }, [
    showAllEventsSection,
    resolvedActiveSubjectIds,
    subjectDetailCache,
    planProgressContext,
    onRefreshSubjectDetail,
  ]);
  const allEventsProgressSummary = useMemo(() => {
    if (!showAllEventsSection || !planProgressContext?.rows?.length) return null;
    const metrics = aggregatePlanProgressMetrics(planProgressContext.rows, {
      yearTargetsDisplayRows: planProgressContext.yearTargetsDisplayRows || [],
      subjectIds: resolvedActiveSubjectIds,
    });
    const status = getPlanProgressStatusFromMetrics(metrics, { hasCadence: metrics.hasCadence });
    return {
      summaryLine: formatPlanProgressSummary(metrics),
      ...status,
    };
  }, [showAllEventsSection, planProgressContext, resolvedActiveSubjectIds]);
  const allEventsGapSection = useMemo(() => {
    if (!showAllEventsSection || typeof planProgressContext?.renderAllEventsGap !== 'function') return null;
    return planProgressContext.renderAllEventsGap(resolvedActiveSubjectIds);
  }, [showAllEventsSection, planProgressContext, resolvedActiveSubjectIds]);
  const submittedArtifactsCount = useMemo(() => {
    const activeSet = new Set(resolvedActiveSubjectIds.map(String));
    const seen = new Set();
    let count = 0;
    const consider = (row) => {
      if (!row) return;
      const id = String(row?.id || '').trim();
      const dedupeKey = id || `${row?.child_id}|${row?.title}|${row?.updated_at}`;
      if (seen.has(dedupeKey)) return;
      if (!recordMatchesChildIds(row, resolvedActiveChildIds)) return;
      const status = String(row?.status || '').trim().toLowerCase();
      if (status !== 'submitted' && status !== 'reviewed' && status !== 'accepted') return;
      seen.add(dedupeKey);
      count += 1;
    };
    subjectDetails.forEach(({ subject, detail }) => {
      const subjectId = String(subject?.id || '').trim();
      if (!subjectId || !activeSet.has(subjectId)) return;
      const assignments = Array.isArray(detail?.subjectAssignments) && detail.subjectAssignments.length
        ? detail.subjectAssignments
        : Object.values(detail?.assignmentsByEventId || {}).flat();
      assignments.forEach(consider);
    });
    return count;
  }, [subjectDetails, resolvedActiveSubjectIds, resolvedActiveChildIds]);
  const learningGoalsGapLabel = useMemo(() => {
    const deltaDays = allEventsProgressSummary?.deltaDays;
    if (deltaDays == null || Number(deltaDays) === 0) return null;
    const magnitude = Math.abs(Number(deltaDays));
    if (!Number.isFinite(magnitude) || magnitude === 0) return null;
    return Number(deltaDays) < 0 ? `+${magnitude} days` : `-${magnitude} days`;
  }, [allEventsProgressSummary]);
  const toggleSummaryPanel = useCallback((panel) => {
    setExpandedSummaryPanel((prev) => (prev === panel ? null : panel));
  }, []);
  useEffect(() => {
    if (expandedSummaryPanel) {
      const panelChanged = prevExpandedSummaryPanelRef.current !== expandedSummaryPanel;
      prevExpandedSummaryPanelRef.current = expandedSummaryPanel;
      setDisplayedSummaryPanel(expandedSummaryPanel);
      if (expandedSummaryPanel === 'learning_goals') {
        planProgressContext?.expandAllEventsAggregateGap?.();
      } else {
        planProgressContext?.collapseAllEventsAggregateGap?.();
      }
      if (expandedSummaryPanel === 'learning_log' && panelChanged) {
        setTimeout(() => setAttendanceScrollEpoch((epoch) => epoch + 1), 260);
      }
      if (suppressSummaryPanelOpenAnimationRef.current) {
        suppressSummaryPanelOpenAnimationRef.current = false;
        summaryPanelAnim.setValue(1);
        if (expandedSummaryPanel === 'learning_log') {
          setTimeout(() => setAttendanceScrollEpoch((epoch) => epoch + 1), 320);
        }
      } else if (panelChanged) {
        summaryPanelAnim.setValue(0);
        Animated.timing(summaryPanelAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }).start();
      }
      return;
    }
    prevExpandedSummaryPanelRef.current = null;
    planProgressContext?.collapseAllEventsAggregateGap?.();
    Animated.timing(summaryPanelAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished) setDisplayedSummaryPanel(null);
    });
  }, [expandedSummaryPanel, planProgressContext, summaryPanelAnim]);
  const learningHighlights = useMemo(() => {
    const now = Date.now();
    const futureUnits = new Set();
    let mostRecentUnit = '';
    let mostRecentTs = 0;
    (attendanceEvents || []).forEach((event) => {
      const unit = String(event?.unit_name || event?.curriculum_unit_title || event?.unit || event?.unit_topic || '').trim();
      if (!unit) return;
      const ts = new Date(event?.start_ts || event?.end_ts || event?.due_ts || '').getTime();
      if (Number.isFinite(ts) && ts > now) futureUnits.add(unit);
      if (Number.isFinite(ts) && ts >= mostRecentTs) {
        mostRecentTs = ts;
        mostRecentUnit = unit;
      }
    });
    return {
      activeUnits: futureUnits.size,
      mostRecentUnit: mostRecentUnit || '—',
    };
  }, [attendanceEvents]);
  const gradesBySubjectLine = useMemo(() => (
    subjectProgressRows
      .slice(0, 2)
      .map((row) => `${row.subject}: ${row.gradeAverageLetter}`)
      .join(' · ') || 'No subjects yet'
  ), [subjectProgressRows]);
  const attendancePlannerListEvents = allEventsAggregate.events;

  const handleMarkAllAttendedCompleted = useCallback(async (subjectIds = []) => {
    setPlannerListRefreshEpoch((epoch) => epoch + 1);
    setAttendanceScrollEpoch((epoch) => epoch + 1);
    setOptimisticAttendanceByKey({});
    const ids = Array.isArray(subjectIds) && subjectIds.length > 0
      ? subjectIds
      : (subjectDetails || []).map(({ subject }) => subject?.id).filter(Boolean);
    await Promise.all(ids.map((id) => onRefreshSubjectDetail?.(id)));
  }, [onRefreshSubjectDetail, subjectDetails]);

  const assignWorkFilterSummary = useMemo(() => {
    const childCount = resolvedActiveChildIds.length;
    const childPart = childCount === 0
      ? 'all children'
      : (childCount === 1
        ? ((children || []).find((row) => String(row?.id) === String(resolvedActiveChildIds[0]))?.first_name
          || (children || []).find((row) => String(row?.id) === String(resolvedActiveChildIds[0]))?.name
          || 'Student')
        : `${childCount} children`);
    const totalSubjects = (filteredSubjects || []).filter((s) => s?.id).length;
    const subjectCount = resolvedActiveSubjectIds.length;
    const subjectPart = subjectCount === 0 || subjectCount >= totalSubjects
      ? 'all subjects'
      : `${subjectCount} subject${subjectCount !== 1 ? 's' : ''}`;
    return `${childPart}, ${subjectPart}, ${selectedAcademicYearLabel}`;
  }, [
    resolvedActiveChildIds,
    resolvedActiveSubjectIds,
    filteredSubjects,
    selectedAcademicYearLabel,
    children,
  ]);

  const handleAssignWorkCompleted = useCallback(async () => {
    setPlannerListRefreshEpoch((epoch) => epoch + 1);
    const ids = (subjectDetails || []).map(({ subject }) => subject?.id).filter(Boolean);
    await Promise.all(ids.map((id) => onRefreshSubjectDetail?.(id)));
  }, [onRefreshSubjectDetail, subjectDetails]);

  const learningLogPanelInner = (
    <View style={[
      styles.attendancePlannerListWrap,
      useLearningFillLayout && styles.attendancePlannerListWrapLearning,
      { minHeight: attendanceListMaxHeight },
    ]}>
      <PlannerEventsListTable
        events={attendancePlannerListEvents}
        children={children}
        familyId={familyId}
        monthDate={new Date()}
        onEventPress={(event) => handleOpenEventDetails(event?.id, event)}
        onEventRightClick={handleEventContextMenu}
        onEventComplete={canManageAttendance ? handleAllEventsAttendanceToggle : undefined}
        resolveEventCompleted={(event) => resolveAllEventsAttendanceState(event)?.isAttended === true}
        listRefreshEpoch={plannerListRefreshEpoch}
        embedded
        fillViewport={false}
        maxListHeight={attendanceListMaxHeight}
        scrollToToday
        scrollToTodayEpoch={attendanceScrollEpoch}
        plannerShellVisible={false}
      />
    </View>
  );

  const attendancePanelInner = (
    <View style={styles.attendanceMonthPanelWrap}>
      <SubjectAttendanceSummaryKeyArchived />
      <SubjectAttendanceMonthPanelArchived
        attendanceRecordsForUI={attendanceRecordsForUI}
        attendanceEvents={attendanceEvents}
        onOpenEventDetails={handleOpenEventDetails}
        onToggleEventAttendance={canManageAttendance ? handleToggleEventAttendanceForDate : undefined}
        onAddEventForDate={handleOpenAddEventForDate}
      />
    </View>
  );

  const gradesPanelInner = gradeRows.length > 0 ? (
    <View style={styles.gradeList}>
      {gradeRows.map((row) => {
        const hasEvent = !!row?.eventId;
        return (
          <View
            key={row.id}
            {...(Platform.OS === 'web' && {
              'data-event-id': String(row?.event?.id || row?.eventId || ''),
              onMouseDown: (e) => {
                if (!hasEvent) return;
                const button = e?.button ?? e?.nativeEvent?.button;
                if (button !== 2) return;
                e.preventDefault?.();
                e.stopPropagation?.();
                handleEventContextMenu(row.event, e?.nativeEvent || e);
              },
              onContextMenu: (e) => {
                if (!hasEvent) return;
                e.preventDefault?.();
                e.stopPropagation?.();
                handleEventContextMenu(row.event, e?.nativeEvent || e);
              },
            })}
          >
            <TouchableOpacity
              style={styles.gradeItem}
              onPress={() => hasEvent && handleOpenEventDetails(row.eventId, row.event)}
              activeOpacity={0.7}
              {...(Platform.OS === 'web' && {
                cursor: hasEvent ? 'pointer' : 'default',
              })}
            >
              <View style={styles.gradeItemContent}>
                <Text style={styles.gradeItemName}>{row.name}</Text>
                <Text style={styles.gradeItemDate}>
                  {`${row.subjectName} · ${formatDate(row.date)}`}
                </Text>
              </View>
              <Text style={styles.gradeItemGrade}>{row.grade}</Text>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  ) : (
    <Text style={styles.emptyStateText}>No graded events yet</Text>
  );

  const renderGradesHeaderActions = () => {
    const canExport = typeof onOpenExportModal === 'function';
    if (isChildView && !canExport) return null;
    return (
      <View style={styles.sectionHeaderActions}>
        {!isChildView ? (
          <TouchableOpacity
            style={[styles.emptyStateButton, styles.attendanceHeaderEditButton]}
            onPress={() => openSubjectPicker('grades_add')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Add grades"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={16} color="#6B7280" />
            <Text style={styles.emptyStateButtonText}>Add grades</Text>
          </TouchableOpacity>
        ) : null}
        {canExport ? (
          <TouchableOpacity
            style={[styles.emptyStateButton, styles.attendanceHeaderEditButton]}
            onPress={() => onOpenExportModal('grades')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Export grades"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Download size={14} color="#6B7280" />
            <Text style={styles.emptyStateButtonText}>Export</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderLearningLogHeaderActions = () => {
    if (isChildView || !canManageAttendance) return null;
    return (
      <View style={styles.sectionHeaderActions}>
        <TouchableOpacity
          style={[styles.emptyStateButton, styles.attendanceHeaderEditButton]}
          onPress={() => setShowAssignWorkModal(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Assign work"
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <ClipboardList size={14} color="#6B7280" />
          <Text style={styles.emptyStateButtonText}>Assign work</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderAttendanceHeaderActions = () => {
    const canExport = typeof onOpenExportModal === 'function';
    if (!canManageAttendance && !canExport) return null;
    return (
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
        {canExport ? (
          <TouchableOpacity
            style={[styles.emptyStateButton, styles.attendanceHeaderEditButton]}
            onPress={() => onOpenExportModal('attendance')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Export attendance"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Download size={14} color="#6B7280" />
            <Text style={styles.emptyStateButtonText}>Export</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderSummaryPanelContent = (panelKey, options = {}) => {
    const fillLayout = options.fillLayout === true;
    const panelStyle = [
      styles.summaryExpandPanel,
      fillLayout && panelKey !== 'learning_log' && styles.summaryExpandPanelFill,
    ];
    if (panelKey === 'attendance') {
      return (
        <View style={panelStyle}>
          <View style={styles.summaryExpandPanelHeader}>
            <Text style={styles.summaryExpandPanelTitle}>Attendance</Text>
            {renderAttendanceHeaderActions()}
          </View>
          {attendancePanelInner}
        </View>
      );
    }
    if (panelKey === 'grades') {
      return (
        <View style={panelStyle}>
          <View style={styles.summaryExpandPanelHeader}>
            <Text style={styles.summaryExpandPanelTitle}>Grades</Text>
            {renderGradesHeaderActions()}
          </View>
          {gradesPanelInner}
        </View>
      );
    }
    if (panelKey === 'learning_log') {
      return (
        <View style={panelStyle}>
          <View style={styles.summaryExpandPanelHeader}>
            <Text style={styles.summaryExpandPanelTitle}>Learning Log</Text>
            {renderLearningLogHeaderActions()}
          </View>
          {learningLogPanelInner}
        </View>
      );
    }
    if (panelKey === 'learning_goals') {
      return (
        <View style={panelStyle}>
          <View style={styles.summaryExpandPanelHeader}>
            <View style={styles.summaryExpandPanelHeaderMain}>
              <Text style={styles.summaryExpandPanelTitle}>Planning goals</Text>
              {allEventsProgressSummary?.summaryLine ? (
                <Text style={styles.summaryExpandPanelSubtitle}>{allEventsProgressSummary.summaryLine}</Text>
              ) : null}
            </View>
            {allEventsGapSection?.headerActions || null}
          </View>
          {allEventsGapSection?.expandedRow || (
            <Text style={styles.emptyStateText}>
              Add year targets in Schedule to see gap suggestions here.
            </Text>
          )}
        </View>
      );
    }
    return null;
  };

  const renderSummaryExpandPanel = () => {
    if (!displayedSummaryPanel) return null;
    if (useLearningFillLayout) {
      if (!displayedSummaryPanel) return null;
      const panelContent = renderSummaryPanelContent(displayedSummaryPanel, { fillLayout: true });
      if (!panelContent) return null;
      return (
        <View style={styles.summaryExpandPanelOuterFill}>
          {panelContent}
        </View>
      );
    }
    const panelContent = renderSummaryPanelContent(displayedSummaryPanel);
    if (!panelContent) return null;
    const maxHeight = SUMMARY_PANEL_DISCLOSURE_MAX_HEIGHT[displayedSummaryPanel] || 720;
    const viewportMaxHeight = Platform.OS === 'web' && windowHeight > 0
      ? Math.max(maxHeight, windowHeight - 300)
      : maxHeight;
    const disclosureStyle = {
      maxHeight: summaryPanelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, viewportMaxHeight],
      }),
      opacity: summaryPanelAnim.interpolate({
        inputRange: [0, 0.15, 1],
        outputRange: [0, 0.35, 1],
      }),
    };
    return (
      <Animated.View style={[styles.summaryExpandPanelOuter, disclosureStyle]}>
        {panelContent}
      </Animated.View>
    );
  };

  const renderClickableSummaryBox = (panelKey, label, value, meta, options = {}) => {
    const isActive = expandedSummaryPanel === panelKey;
    return (
      <TouchableOpacity
        key={panelKey}
        style={[
          styles.overviewSummaryBox,
          styles.allEventsSummaryBox,
          isActive && styles.overviewSummaryBoxActive,
        ]}
        onPress={() => toggleSummaryPanel(panelKey)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ expanded: isActive }}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <Text style={[styles.overviewSummaryLabel, isActive && styles.overviewSummaryLabelActive]}>
          {label}
        </Text>
        <Text
          style={[
            styles.overviewSummaryValue,
            options.compactValue && styles.overviewSummaryValueCompact,
            isActive && styles.overviewSummaryValueActive,
          ]}
          numberOfLines={options.compactValue ? 2 : 1}
        >
          {value}
        </Text>
        {meta ? (
          <Text
            style={[
              styles.overviewSummaryMeta,
              options.metaAccent && styles.overviewSummaryMetaAccent,
              isActive && !options.metaAccent && styles.overviewSummaryMetaActive,
            ]}
            numberOfLines={1}
          >
            {meta}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const isWeb = Platform.OS === 'web';
  const canEditChildButton = typeof onEditChild === 'function' && !!selectedStudentRecord;
  const progressMainContent = (
        <>
        {showFullProgressChrome && !hideYearHeader ? (
          <View style={styles.headerRow}>
            <View style={styles.yearHeaderNavShell}>
              <TouchableOpacity style={styles.yearHeaderNavBtn} onPress={() => setSelectedAcademicYearStart((prev) => prev - 1)}>
                <ChevronLeft size={24} color="#9CA3AF" />
              </TouchableOpacity>
              <Text style={styles.yearHeaderTitle}>{selectedAcademicYearLabel}</Text>
              <TouchableOpacity style={styles.yearHeaderNavBtn} onPress={() => setSelectedAcademicYearStart((prev) => prev + 1)}>
                <ChevronRight size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {showFullProgressChrome && !isChildView ? (
          <View style={styles.progressHeader}>
            <View style={[styles.progressHeaderTop, !isWeb && styles.progressHeaderTopStacked]}>
              <View style={styles.progressHeaderTitleSection}>
                <View style={styles.progressHeaderIdentityRow}>
                  <Image
                    source={sourceForChild(selectedStudentRecord)}
                    style={styles.progressHeaderAvatar}
                    resizeMode="cover"
                  />
                  <View style={styles.progressHeaderTitleCopy}>
                    <Text style={styles.progressHeaderTitle}>{progressHeaderTitle}</Text>
                    <Text style={styles.progressHeaderSubtext}>{gradeAndSubjectsLine}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.headerActions}>
                {canEditChildButton ? (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => {
                      onEditChild(selectedStudentRecord);
                    }}
                    activeOpacity={0.75}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <Edit2 size={14} color="#6B7280" />
                    <Text style={styles.actionButtonText}>Edit child</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
        {showFullProgressChrome ? (
        <View style={[styles.section, styles.subjectsSection]}>
          <Text style={styles.sectionTitle}>{subjectsSectionTitle}</Text>
          {subjectProgressRows.length === 0 ? (
            <Text style={styles.emptyStateText}>
              {`No subjects found for ${selectedStudent?.name || 'this student'} in ${selectedAcademicYearLabel}. Add a subject for this school year to see progress details here.`}
            </Text>
          ) : (
            <View style={styles.subjectRowsList}>
              {subjectProgressRows.map((row) => (
                <TouchableOpacity
                  key={`subject-row-${row.id}`}
                  style={styles.subjectRowItem}
                  onPress={() => onOpenSubject?.(row.id)}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <Text style={styles.subjectRowTitle}>{row.subject}</Text>
                  <Text style={styles.subjectRowLine}>Attendance: {row.attendedDays} attended</Text>
                  <Text style={styles.subjectRowLine}>Grades: {row.gradeAverageLetter} average</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        ) : null}
        {showAttendanceGradesSections ? (
          <>
            <View style={[styles.section, embeddedInScrollView && styles.sectionEmbedded]}>
              <View style={styles.attendanceSectionHeader}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{attendanceSectionTitle}</Text>
                {renderAttendanceHeaderActions()}
              </View>
              <View style={styles.progressSectionBody}>
                {attendancePanelInner}
              </View>
            </View>
            <View style={[styles.section, embeddedInScrollView && styles.sectionEmbedded]}>
              <View style={[styles.gradesSectionHeader, styles.attendanceSectionHeader]}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{gradesSectionTitle}</Text>
                {renderGradesHeaderActions()}
              </View>
              <View style={styles.progressSectionBody}>
                {gradesPanelInner}
              </View>
            </View>
          </>
        ) : null}
        {showAllEventsSection ? (
          <View style={[
            styles.section,
            embeddedInScrollView && styles.sectionEmbedded,
            useLearningFillLayout && styles.sectionEmbeddedFill,
          ]}>
            <View style={[
              styles.allEventsSummaryWrap,
              useLearningFillLayout && styles.allEventsSummaryWrapFill,
            ]}>
              <View style={styles.overviewSummaryGrid}>
                {renderClickableSummaryBox(
                  'learning_log',
                  'Learning Log',
                  String(submittedArtifactsCount),
                  submittedArtifactsCount === 1 ? 'submitted artifact' : 'submitted artifacts'
                )}
                {renderClickableSummaryBox(
                  'learning_goals',
                  'Planning goals',
                  allEventsProgressSummary?.summaryLine || 'No targets yet',
                  learningGoalsGapLabel,
                  { compactValue: true, metaAccent: !!learningGoalsGapLabel }
                )}
                {renderClickableSummaryBox(
                  'attendance',
                  'Attendance',
                  overviewStats.attendanceRate == null ? 'No data' : `${overviewStats.attendanceRate}%`,
                  `${overviewStats.completedDays} attended · ${attendanceDayCounts.absent} unattended`
                )}
                {renderClickableSummaryBox(
                  'grades',
                  'Grades',
                  overviewStats.gradeAverage == null ? 'No grades' : `${overviewStats.gradeAverage}%`,
                  `${gradeRows.length} recorded grade${gradeRows.length === 1 ? '' : 's'}`
                )}
              </View>
              {renderSummaryExpandPanel()}
            </View>
          </View>
        ) : null}

        </>
  );

  return (
    <View style={[
      embeddedInScrollView ? styles.pageEmbedded : styles.page,
      useLearningFillLayout && styles.pageEmbeddedFill,
    ]}>
      {embeddedInScrollView ? (
        <View style={[
          styles.contentInnerEmbedded,
          useLearningFillLayout && styles.contentInnerEmbeddedFill,
        ]}>
          {progressMainContent}
        </View>
      ) : (
        <View style={styles.progressShell}>
          <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
            {progressMainContent}
          </ScrollView>
        </View>
      )}
      <MarkAllAttendedModal
        visible={showMarkAllAttendedModal}
        onClose={() => setShowMarkAllAttendedModal(false)}
        familyId={familyId}
        subjectDetails={subjectDetails}
        subjectOptions={subjectOptions}
        children={children}
        resolvedActiveChildIds={resolvedActiveChildIds}
        onCompleted={handleMarkAllAttendedCompleted}
      />
      <AssignWorkModal
        visible={showAssignWorkModal}
        onClose={() => setShowAssignWorkModal(false)}
        familyId={familyId}
        events={allEventsAggregate.events}
        filterSummary={assignWorkFilterSummary}
        onCompleted={handleAssignWorkCompleted}
      />
      <SubjectPastEventsGradesModal
        visible={!!gradesModalSubjectId}
        onClose={() => setGradesModalSubjectId(null)}
        familyId={familyId}
        subjectId={gradesModalSubjectId}
        events={subjectById.get(String(gradesModalSubjectId || ''))?.detail?.events || []}
        eventOutcomes={subjectById.get(String(gradesModalSubjectId || ''))?.detail?.eventOutcomes || []}
        getChildName={getChildName}
        onOpenEvent={() => {}}
        onCreatePlan={() => {}}
        onCompleted={async () => {
          const sid = gradesModalSubjectId;
          if (sid && sid !== EMPTY_SUBJECT_MODAL_ID) await onRefreshSubjectDetail?.(sid);
        }}
      />
      <Modal
        visible={!!subjectPickerAction}
        transparent
        animationType="none"
        onRequestClose={closeSubjectPicker}
      >
        <TouchableOpacity style={styles.subjectPickerBackdrop} activeOpacity={1} onPress={closeSubjectPicker}>
          <TouchableOpacity style={styles.subjectPickerCard} activeOpacity={1} onPress={() => {}}>
            <View style={styles.subjectPickerHeader}>
              <View style={styles.subjectPickerHeaderTextWrap}>
                <Text style={styles.subjectPickerTitle}>{subjectPickerCopy.title}</Text>
                <Text style={styles.subjectPickerSubtitle}>{subjectPickerCopy.subtitle}</Text>
              </View>
              <TouchableOpacity
                style={styles.subjectPickerClose}
                onPress={closeSubjectPicker}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <X size={20} color="#6b7280" />
              </TouchableOpacity>
            </View>
            {subjectOptions.length > 0 ? (
              <View style={styles.subjectPickerList}>
                {subjectOptions.map((option, index) => (
                  <TouchableOpacity
                    key={`subject-picker-${option.id}`}
                    style={[
                      styles.subjectPickerItem,
                      index === subjectOptions.length - 1 && styles.subjectPickerItemLast,
                    ]}
                    onPress={() => handleSubjectPickerSelect(option.id)}
                    activeOpacity={0.75}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <View style={styles.subjectPickerItemTextWrap}>
                      <Text style={styles.subjectPickerItemText}>{option.name}</Text>
                      {option.studentLabel ? (
                        <View style={styles.subjectPickerStudentsRow}>
                          <ChildAvatarCluster
                            childIds={option.childIds || []}
                            familyChildren={children}
                            size={28}
                            overlap={-8}
                          />
                          <Text style={styles.subjectPickerStudentsText}>{option.studentLabel}</Text>
                        </View>
                      ) : null}
                    </View>
                    <ChevronRight size={16} color="#6b7280" />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.subjectPickerEmptyWrap}>
                <Text style={styles.subjectPickerEmptyText}>No subjects available.</Text>
              </View>
            )}
            <View style={styles.subjectPickerActions}>
              <TouchableOpacity
                style={styles.subjectPickerCancelBtn}
                onPress={closeSubjectPicker}
                activeOpacity={0.85}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={styles.subjectPickerCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  pageEmbedded: {
    width: '100%',
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'relative',
    }),
  },
  pageEmbeddedFill: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      flexShrink: 1,
    }),
  },
  contentInnerEmbedded: {
    width: '100%',
    paddingTop: 0,
    paddingBottom: 0,
  },
  contentInnerEmbeddedFill: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  sectionEmbedded: {
    marginTop: 0,
    marginBottom: 28,
    paddingHorizontal: 0,
  },
  sectionEmbeddedFill: {
    flex: 1,
    minHeight: 0,
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  progressShell: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  content: { flex: 1 },
  contentInner: { paddingTop: 12, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  yearHeaderNavShell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  yearHeaderNavBtn: { width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' && { cursor: 'pointer' }) },
  yearHeaderTitle: { fontSize: 24, fontWeight: '700', color: '#111827', ...WEB_HEADING_FONT },
  staticRightRail: {
    width: 290,
    paddingTop: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  overviewMainColumns: { paddingHorizontal: 14, marginBottom: 28, alignItems: 'stretch' },
  overviewLeftColumn: { flex: 1, gap: 14 },
  overviewRightColumnMobile: { marginTop: 10 },
  overviewSummaryCard: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#FFFFFF', padding: 14 },
  overviewSummaryGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  overviewSummaryBox: {
    flex: 1,
    minWidth: 180,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 10,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'border-color 0.15s ease, background-color 0.15s ease',
    }),
  },
  overviewSummaryBoxActive: {
    borderColor: '#6BB3E8',
    backgroundColor: 'rgba(107, 179, 232, 0.12)',
  },
  overviewSummaryLabelActive: {
    color: '#6BB3E8',
  },
  overviewSummaryValueActive: {
    color: '#0F172A',
  },
  overviewSummaryMetaActive: {
    color: '#475569',
  },
  overviewSummaryLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', ...WEB_HEADING_FONT },
  overviewSummaryValue: { marginTop: 4, fontSize: 19, fontWeight: '700', color: '#0F172A', ...WEB_HEADING_FONT },
  overviewSummaryValueCompact: { fontSize: 14, lineHeight: 20 },
  overviewSummaryMeta: { marginTop: 2, fontSize: 12, color: '#64748B', ...WEB_BODY_FONT },
  overviewSummaryMetaAccent: { color: '#DC2626', fontWeight: '600' },
  summaryExpandPanelOuter: {
    width: '100%',
    overflow: 'hidden',
    marginTop: 10,
  },
  summaryExpandPanelOuterFill: {
    width: '100%',
    flex: 1,
    minHeight: 0,
    marginTop: 10,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  summaryExpandPanel: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 14,
    gap: 12,
  },
  summaryExpandPanelFill: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  summaryExpandPanelBody: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  summaryExpandPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  summaryExpandPanelHeaderMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  summaryExpandPanelTitle: { fontSize: 16, fontWeight: '700', color: '#1F2937', ...WEB_HEADING_FONT },
  summaryExpandPanelSubtitle: { fontSize: 12, color: '#64748B', ...WEB_BODY_FONT },
  learningLogList: { gap: 8 },
  learningLogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  learningLogItemMain: { flex: 1, minWidth: 0, gap: 2 },
  learningLogItemTitle: { fontSize: 14, fontWeight: '600', color: '#0F172A', ...WEB_HEADING_FONT },
  learningLogItemMeta: { fontSize: 12, color: '#64748B', ...WEB_BODY_FONT },
  learningLogItemStatus: { fontSize: 12, fontWeight: '600', color: '#4F46E5', ...WEB_HEADING_FONT },
  progressHeader: {
    marginHorizontal: 24,
    marginTop: 8,
    marginBottom: 18,
  },
  progressHeaderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  progressHeaderTopStacked: {
    flexDirection: 'column',
    gap: 10,
  },
  progressHeaderTitleSection: {
    flex: 1,
    minWidth: 220,
  },
  progressHeaderIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressHeaderAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E2E8F0',
    ...(Platform.OS === 'web' ? { objectFit: 'cover' } : {}),
  },
  progressHeaderTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  progressHeaderTitle: { fontSize: 32, fontWeight: '700', color: '#1F2937', marginBottom: 8, ...WEB_HEADING_FONT },
  progressHeaderSubtext: { fontSize: 14, color: '#6B7280', marginBottom: 4, ...WEB_BODY_FONT },
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
    ...(Platform.OS === 'web' && { cursor: 'pointer', transition: 'all 0.2s ease' }),
  },
  actionButtonText: { fontSize: 14, fontWeight: '500', color: '#374151', ...WEB_HEADING_FONT },
  subjectRowsList: { gap: 8 },
  coreCardsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', paddingHorizontal: 14, marginBottom: 12 },
  coreCard: {
    flex: 1,
    minWidth: 210,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  coreCardTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', color: '#64748B', ...WEB_HEADING_FONT },
  coreCardPrimary: { fontSize: 16, fontWeight: '700', color: '#0F172A', ...WEB_HEADING_FONT },
  coreCardMeta: { fontSize: 12, color: '#6B7280', ...WEB_BODY_FONT },
  coreCardAction: { marginTop: 4, alignSelf: 'flex-start', ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}) },
  coreCardActionText: { fontSize: 12, fontWeight: '700', color: '#4F46E5', ...WEB_HEADING_FONT },
  subjectRowsCard: {
    marginHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
  },
  progressSectionCard: {
    marginHorizontal: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
  },
  progressSectionBody: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  progressInsightsPanelWrap: {
    marginTop: 0,
  },
  attendancePlannerListWrap: {
    width: '100%',
    minWidth: 0,
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflowX: 'auto',
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  attendancePlannerListWrapLearning: {
    flexShrink: 0,
  },
  attendanceMonthPanelWrap: {
    width: '100%',
    minWidth: 0,
  },
  subjectRowItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 2,
  },
  subjectRowTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 2, ...WEB_HEADING_FONT },
  subjectRowLine: { fontSize: 12, color: '#4B5563', ...WEB_BODY_FONT },
  subjectRowStatus: { marginTop: 3, fontSize: 12, fontWeight: '700', color: '#166534', ...WEB_HEADING_FONT },
  subjectRowStatusAlert: { color: '#B45309' },
  overviewTableCard: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#FFFFFF', padding: 14, gap: 10 },
  overviewTableTitle: { fontSize: 17, fontWeight: '700', color: '#111827', ...WEB_HEADING_FONT },
  overviewTableWrap: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, overflow: 'hidden' },
  overviewTableHeaderRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingVertical: 9, paddingHorizontal: 10, gap: 8 },
  overviewTableHeaderCell: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: '#64748B', ...WEB_HEADING_FONT },
  overviewTableBodyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' },
  overviewTableBodyCell: { fontSize: 13, color: '#334155', ...WEB_BODY_FONT },
  overviewColChild: { flex: 1.2 },
  overviewColAttendance: { flex: 1.5 },
  overviewColGrades: { flex: 1.1 },
  overviewColLearning: { flex: 2.3 },
  overviewColSubject: { flex: 1.8 },
  overviewColPlanned: { flex: 1.2 },
  overviewColDone: { flex: 1.1 },
  overviewColPace: { flex: 1.1 },
  overviewColPerformance: { flex: 1.1 },
  needsAttentionCard: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, backgroundColor: '#FFFFFF', padding: 14, gap: 10 },
  needsAttentionCardStatic: { flex: 1, minHeight: 0 },
  needsAttentionTitle: { fontSize: 17, fontWeight: '700', color: '#111827', ...WEB_HEADING_FONT },
  needsAttentionScroll: { flex: 1, minHeight: 0 },
  needsAttentionScrollContent: { gap: 10, paddingBottom: 6 },
  needsAttentionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  needsAttentionDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#64748B', marginTop: 5 },
  needsAttentionDotPlan: { backgroundColor: '#7C3AED' },
  needsAttentionDotGap: { backgroundColor: '#DC2626' },
  needsAttentionDotUnits: { backgroundColor: '#0EA5E9' },
  needsAttentionDotGrades: { backgroundColor: '#10B981' },
  needsAttentionBody: { flex: 1 },
  needsAttentionRowTitle: { fontSize: 13, fontWeight: '700', color: '#1F2937', ...WEB_HEADING_FONT },
  needsAttentionRowText: { marginTop: 2, fontSize: 12, color: '#64748B', ...WEB_BODY_FONT },
  section: { marginBottom: 54, paddingHorizontal: 24 },
  subjectsSection: { marginTop: 30 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 16, ...WEB_HEADING_FONT },
  attendanceSectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
  allEventsSummaryWrap: { marginBottom: 14 },
  allEventsSummaryWrapFill: {
    flex: 1,
    minHeight: 0,
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  allEventsSummaryBox: { minWidth: 140 },
  allEventsSectionHeader: { marginBottom: 10 },
  allEventsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  allEventsTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
  },
  allEventsExportButton: {
    padding: 4,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  allEventsProgressMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  allEventsProgressMetric: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    ...WEB_BODY_FONT,
  },
  gradesSectionHeader: { marginBottom: 10 },
  gradesSectionTitleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  gradesHeaderAddButton: { marginLeft: 'auto' },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease',
    }),
  },
  attendanceHeaderEditButton: { minHeight: 34, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  sectionHeaderActions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyStateButtonText: { fontSize: 14, fontWeight: '500', color: '#374151', ...WEB_HEADING_FONT },
  attendanceSummaryWrap: { marginBottom: 8 },
  attendanceToolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  attendanceKeyShell: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 999, backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 6 },
  attendanceKeyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  attendanceKeyPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#F3F4F6' },
  attendanceKeyDot: { width: 8, height: 8, borderRadius: 999 },
  attendanceKeyDotAttended: { backgroundColor: '#6BB3E8' },
  attendanceKeyDotUnattended: { backgroundColor: '#F2A0A0' },
  attendanceKeyDotUpcoming: { backgroundColor: '#C7DDF6' },
  attendanceKeyDotNoEvents: { backgroundColor: '#E5E7EB' },
  attendanceKeyText: { fontSize: 12, color: '#6B7280', ...WEB_BODY_FONT },
  emptyStateText: { fontSize: 14, color: '#6B7280', lineHeight: 20, ...WEB_BODY_FONT },
  gradeList: { gap: 8 },
  gradeItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8 },
  gradeItemContent: { flex: 1 },
  gradeItemName: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 4, ...WEB_HEADING_FONT },
  gradeItemDate: { fontSize: 12, color: '#6B7280', ...WEB_BODY_FONT },
  gradeItemGrade: { fontSize: 16, fontWeight: '600', color: '#374151', ...WEB_HEADING_FONT },
  learningGoalsHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginLeft: 'auto',
    flexWrap: 'wrap',
  },
  learningSubjectBlock: { paddingVertical: 8 },
  learningSubjectTitle: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 4, ...WEB_HEADING_FONT },
  learningGoalsSavedUnitsLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
    ...WEB_HEADING_FONT,
  },
  learningGoalsSavedUnitsMeta: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 10,
    ...WEB_HEADING_FONT,
  },
  learningGoalsMethodHeaderDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 12,
  },
  learningGoalsUnitCard: {
    borderWidth: 1,
    borderColor: '#E6ECF3',
    borderRadius: 10,
    backgroundColor: '#FAFCFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  learningGoalsUnitTitle: {
    fontSize: 15,
    color: '#1F2937',
    fontWeight: '700',
    ...WEB_HEADING_FONT,
  },
  learningGoalsUnitMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 6,
    ...WEB_BODY_FONT,
  },
  learningGoalsLessonRow: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    ...WEB_BODY_FONT,
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
    ...WEB_HEADING_FONT,
  },
  learningGoalsActionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subjectPickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  subjectPickerCard: {
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
  subjectPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  subjectPickerHeaderTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  subjectPickerClose: {
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
  subjectPickerTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    ...WEB_HEADING_FONT,
  },
  subjectPickerSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#6b7280',
    ...WEB_BODY_FONT,
  },
  subjectPickerList: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  subjectPickerItem: {
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
  subjectPickerItemLast: {
    borderBottomWidth: 0,
  },
  subjectPickerItemTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  subjectPickerItemText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    ...WEB_HEADING_FONT,
  },
  subjectPickerStudentsRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  subjectPickerStudentsText: {
    flex: 1,
    minWidth: 0,
    fontWeight: '400',
    fontSize: 14,
    color: '#94A3B8',
    ...WEB_BODY_FONT,
  },
  subjectPickerEmptyWrap: {
    marginTop: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
  },
  subjectPickerEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 22,
    ...WEB_BODY_FONT,
  },
  subjectPickerActions: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  subjectPickerCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  subjectPickerCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    ...WEB_BODY_FONT,
  },
  emptyInlineText: { fontSize: 12, color: '#94A3B8', ...WEB_BODY_FONT },
});
