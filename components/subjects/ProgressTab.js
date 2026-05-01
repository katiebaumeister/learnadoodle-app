import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BarChart3, Calendar, CheckCircle, ChevronLeft, ChevronRight, Edit2, List, Plus, XCircle } from 'lucide-react';
import {
  SubjectAttendanceMonthDrilldown,
  SubjectAttendanceYearHeatmap,
} from './SubjectSectionDrilldownPanels';
import SubjectPastEventsAttendanceModal from './SubjectPastEventsAttendanceModal';
import SubjectPastEventsGradesModal from './SubjectPastEventsGradesModal';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import { getSubjectProgressCache } from '../../lib/subjectProgressPlanCache';
import { supabase } from '../../lib/supabase';

const WEB_HEADING_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const ATTENDANCE_LIST_LIMIT = 5;

function getChildLabel(child) {
  return child?.first_name || child?.name || child?.full_name || child?.display_name || 'Student';
}

function getEventStartYmd(event) {
  const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
  return raw ? String(raw).slice(0, 10) : null;
}

function formatDate(dateValue) {
  if (!dateValue) return '—';
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

export default function ProgressTab({
  familyId = null,
  children = [],
  filteredSubjects = [],
  subjectDetailCache = {},
  selectedChildFilter = 'all',
  selectedYearFilter = 'all_years',
  hideYearHeader = false,
  onOpenSubject,
  onRefreshSubjectDetail,
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
  const [selectedAcademicYearStart, setSelectedAcademicYearStart] = useState(presentAcademicYearStart);
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
  const subjectOptions = useMemo(
    () => subjectDetails.map(({ subject }) => ({ id: subject.id, name: subject?.name || 'Subject' })),
    [subjectDetails]
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
  const [attendanceModalSubjectId, setAttendanceModalSubjectId] = useState(null);
  const [gradesModalSubjectId, setGradesModalSubjectId] = useState(null);
  const [familyDefaultTargetDays, setFamilyDefaultTargetDays] = useState(null);
  const hasSubjectOptions = subjectOptions.length > 0;
  useEffect(() => {
    let cancelled = false;
    if (!familyId) {
      setFamilyDefaultTargetDays(null);
      return () => { cancelled = true; };
    }
    supabase
      .from('family_planner_settings')
      .select('target_scope, default_constraint_mode, default_target_days')
      .eq('family_id', familyId)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const scope = String(data?.target_scope || 'overall').trim().toLowerCase();
        const mode = String(data?.default_constraint_mode || '').trim().toLowerCase();
        const defaultDays = parsePositiveInt(data?.default_target_days);
        const canUseOverallDays = scope === 'overall' && (mode === 'days' || (!mode && defaultDays != null));
        setFamilyDefaultTargetDays(canUseOverallDays ? defaultDays : null);
      })
      .catch(() => {
        if (!cancelled) setFamilyDefaultTargetDays(null);
      });
    return () => { cancelled = true; };
  }, [familyId]);
  const subjectPickerPrompt = useMemo(() => {
    const byAction = {
      attendance_edit: 'Select a subject to edit attendance',
      grades_add: 'Select a subject to add grades',
      learning_goals_add: 'Select a subject to add units',
      learning_goals_edit: 'Select a subject to edit units',
    };
    return byAction[String(subjectPickerAction || '').trim().toLowerCase()] || 'Select a subject';
  }, [subjectPickerAction]);
  const openSubjectPicker = (action) => {
    if (!hasSubjectOptions) return;
    setSubjectPickerAction(action);
  };
  const closeSubjectPicker = () => setSubjectPickerAction(null);
  const openLearningGoalsPlanner = (subjectId, preferredMethod = 'manual') => {
    const scoped = subjectById.get(String(subjectId));
    const subject = scoped?.subject || null;
    if (!subject?.id) return;
    const childIds = Array.isArray(subject?.assignedChildren) && subject.assignedChildren.length > 0
      ? subject.assignedChildren
      : (selectedStudentId ? [selectedStudentId] : []);
    const method = ['manual', 'paste_plain', 'upload', 'generate'].includes(preferredMethod)
      ? preferredMethod
      : 'manual';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handleRefresh = () => onRefreshSubjectDetail?.(subject.id);
      window.addEventListener('refreshSubjects', handleRefresh, { once: true });
      window.dispatchEvent(
        new CustomEvent('openPlanYearModal', {
          detail: {
            // Use subject_detail context so PlanYear opens directly to the units editor modal.
            from: 'subject_detail',
            subjectId: subject.id,
            subjectName: subject.name || null,
            childIds,
            openAsModal: true,
            skipPlanSummary: true,
            openDirectlyToScope: true,
            initialUnitStructureMethod: method,
          },
        })
      );
      return;
    }
    onOpenSubject?.(subject.id);
  };
  const openSubjectPlanBuilder = (subjectId, opts = {}) => {
    const scoped = subjectById.get(String(subjectId));
    const subject = scoped?.subject || null;
    if (!subject?.id) return;
    const childIds = Array.isArray(subject?.assignedChildren) && subject.assignedChildren.length > 0
      ? subject.assignedChildren
      : (selectedStudentId ? [selectedStudentId] : []);
    const yearPlanId = (() => {
      if (opts.forceNewBuild) return null;
      const fromCache = familyId
        ? (getSubjectProgressCache(familyId, subject.id)?.academicYearId || null)
        : null;
      if (fromCache) return fromCache;
      const fromEvents = (scoped?.detail?.events || [])
        .map((event) => event?.year_plan_id || event?.yearPlanId || null)
        .find(Boolean);
      return fromEvents || null;
    })();
    const openAddPlanFlow = opts.forceNewBuild === true || opts.preferAddPlan === true;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('openPlanYearModal', {
          detail: {
            from: opts.attendanceFocus ? 'subject_detail_attendance' : 'subject_detail',
            subjectId: subject.id,
            subjectName: subject.name || null,
            schoolYear: subject.school_year || null,
            schoolTerm: subject.school_term || null,
            childIds,
            academicYearId: yearPlanId,
            openAsModal: true,
            // No-plan needs-attention should open the new Add Plan modal flow directly.
            openToEditList: openAddPlanFlow ? false : !yearPlanId,
            skipPlanSummary: true,
            openDirectlyToScope: true,
          },
        })
      );
      return;
    }
    onOpenSubject?.(subject.id);
  };
  const handleNeedsAttentionPress = (item) => {
    const sid = String(item?.subjectId || '').trim();
    if (!sid) return;
    const action = String(item?.actionType || '').trim().toLowerCase();
    if (action === 'plan_no_plan') {
      openSubjectPlanBuilder(sid, { attendanceFocus: false, forceNewBuild: true, preferAddPlan: true });
      return;
    }
    if (action === 'plan_attendance_gap') {
      setAttendanceModalSubjectId(sid);
      onRefreshSubjectDetail?.(sid);
      return;
    }
    if (action === 'add_units') {
      openLearningGoalsPlanner(sid, 'manual');
      return;
    }
    if (action === 'add_grades') {
      setGradesModalSubjectId(sid);
      onRefreshSubjectDetail?.(sid);
    }
  };
  const handleSubjectPickerSelect = (subjectId) => {
    const action = subjectPickerAction;
    setSubjectPickerAction(null);
    if (!subjectId || !action) return;
    if (action === 'attendance_edit') {
      setAttendanceModalSubjectId(subjectId);
      // Refresh in background so modal opens immediately.
      onRefreshSubjectDetail?.(subjectId);
      return;
    }
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

  const [attendanceViewMode, setAttendanceViewMode] = useState('list');
  const [showAttendanceExpanded, setShowAttendanceExpanded] = useState(false);

  const attendanceRecordsForUI = useMemo(() => {
    const rows = [];
    const byEvent = new Set();
    subjectDetails.forEach(({ subject, detail }) => {
      (detail?.attendanceRecords || []).forEach((record) => {
        if (
          selectedStudentId
          && record?.child_id
          && String(record.child_id) !== String(selectedStudentId)
        ) return;
        const dayDate = String(record?.day_date || '').slice(0, 10);
        if (!dayDate) return;
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
          status: String(record?.status || '').toLowerCase(),
          minutes: Number(record?.minutes || 0),
          eventId: record?.event_id || null,
        });
      });
      (detail?.events || []).forEach((event) => {
        const matchesChild = selectedStudentId
          ? (
            (event?.child_id && String(event.child_id) === String(selectedStudentId))
            || (Array.isArray(event?.child_ids) && event.child_ids.some((id) => String(id) === String(selectedStudentId)))
          )
          : true;
        if (!matchesChild) return;
        if (String(event?.status || '').toLowerCase() !== 'done') return;
        if (!event?.id || byEvent.has(String(event.id))) return;
        const dayDate = getEventStartYmd(event);
        if (!dayDate) return;
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
        });
      });
    });
    rows.sort((a, b) => String(b.dayDate).localeCompare(String(a.dayDate)));
    return rows;
  }, [subjectDetails, selectedStudentId, academicYearStartDate, academicYearEndDate]);

  const attendanceEvents = useMemo(() => {
    const rows = [];
    subjectDetails.forEach(({ subject, detail }) => {
      (detail?.events || []).forEach((event) => {
        const matchesChild = selectedStudentId
          ? (
            (event?.child_id && String(event.child_id) === String(selectedStudentId))
            || (Array.isArray(event?.child_ids) && event.child_ids.some((id) => String(id) === String(selectedStudentId)))
          )
          : true;
        if (!matchesChild) return;
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
  }, [subjectDetails, selectedStudentId, academicYearStartDate, academicYearEndDate]);
  const attendanceRecordsListUI = useMemo(() => {
    const attendanceByEventId = new Map();
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
    });
    return (attendanceEvents || [])
      .filter((event) => event && String(event?.status || '').toLowerCase() !== 'canceled')
      .map((event) => {
        const eventId = String(event?.id || '').trim();
        const tsRaw = event?.start_ts || event?.due_ts || event?.end_ts || null;
        const tsMs = tsRaw ? new Date(tsRaw).getTime() : NaN;
        const dayKey = tsRaw && Number.isFinite(tsMs) ? String(tsRaw).slice(0, 10) : '';
        const isUpcoming = Number.isFinite(tsMs) && tsMs > Date.now();
        const attendanceMeta = attendanceByEventId.get(eventId);
        let statusLabel = 'Unattended';
        let statusTone = 'unattended';
        if (attendanceMeta?.hasAttended) {
          statusLabel = 'Attended';
          statusTone = 'attended';
        } else if (attendanceMeta?.hasUnattended) {
          statusLabel = 'Unattended';
          statusTone = 'unattended';
        } else if (isUpcoming) {
          statusLabel = 'Upcoming';
          statusTone = 'upcoming';
        }
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
      })
      .sort((a, b) => Number(a.sortTs || 0) - Number(b.sortTs || 0));
  }, [attendanceRecordsForUI, attendanceEvents]);
  const attendanceEventById = useMemo(() => {
    const map = new Map();
    (attendanceEvents || []).forEach((event) => {
      const eid = String(event?.id || '').trim();
      if (!eid) return;
      map.set(eid, event);
    });
    return map;
  }, [attendanceEvents]);
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

  const attendanceDayCounts = useMemo(() => {
    const byDay = new Map();
    attendanceRecordsForUI.forEach((record) => {
      const dayKey = String(record?.dayDate || '').slice(0, 10);
      if (!dayKey) return;
      const status = String(record?.status || '').toLowerCase();
      if (!byDay.has(dayKey)) byDay.set(dayKey, { hasPresent: false, hasAbsent: false });
      const bucket = byDay.get(dayKey);
      if (status === 'present' || status === 'partial') bucket.hasPresent = true;
      if (status === 'absent') bucket.hasAbsent = true;
    });
    let present = 0;
    let absent = 0;
    byDay.forEach((bucket) => {
      if (bucket.hasPresent) present += 1;
      else if (bucket.hasAbsent) absent += 1;
    });
    return { present, absent };
  }, [attendanceRecordsForUI]);

  const attendanceGapAmount = useMemo(() => {
    const attendedDaySet = new Set(
      attendanceRecordsForUI
        .filter((record) => ['present', 'partial'].includes(String(record?.status || '').toLowerCase()))
        .map((record) => String(record?.dayDate || '').slice(0, 10))
        .filter(Boolean)
    );
    const scheduledDaySet = new Set((attendanceEvents || []).map((event) => getEventStartYmd(event)).filter(Boolean));
    return Math.max(0, scheduledDaySet.size - attendedDaySet.size);
  }, [attendanceRecordsForUI, attendanceEvents]);

  useEffect(() => {
    setShowAttendanceExpanded(false);
  }, [attendanceViewMode, selectedStudentId]);

  const gradeRows = useMemo(() => {
    const byEvent = new Set();
    const rows = [];
    subjectDetails.forEach(({ subject, detail }) => {
      (detail?.eventOutcomes || []).forEach((outcome) => {
        if (!outcome?.grade) return;
        const event = (detail?.events || []).find((e) => String(e?.id) === String(outcome?.event_id));
        const eventMatchesChild = selectedStudentId
          ? (
            (event?.child_id && String(event.child_id) === String(selectedStudentId))
            || (Array.isArray(event?.child_ids) && event.child_ids.some((id) => String(id) === String(selectedStudentId)))
            || !event
          )
          : true;
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
        });
        if (outcome?.event_id) byEvent.add(String(outcome.event_id));
      });

      (detail?.events || []).forEach((event) => {
        if (!event?.grade || byEvent.has(String(event.id))) return;
        const matchesChild = selectedStudentId
          ? (
            (event?.child_id && String(event.child_id) === String(selectedStudentId))
            || (Array.isArray(event?.child_ids) && event.child_ids.some((id) => String(id) === String(selectedStudentId)))
          )
          : true;
        if (!matchesChild) return;
        rows.push({
          id: `event-grade-${event.id}`,
          subjectId: subject.id,
          subjectName: subject?.name || 'Subject',
          name: event?.title || subject?.name || 'Assessment',
          date: event?.end_ts || event?.start_ts,
          grade: event.grade,
        });
      });

      (detail?.grades || []).forEach((grade) => {
        if (
          selectedStudentId
          && grade?.child_id
          && String(grade.child_id) !== String(selectedStudentId)
        ) return;
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
        });
      });
    });
    rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    return rows;
  }, [subjectDetails, selectedStudentId]);

  const learningGoalsBySubject = useMemo(() => {
    return subjectDetails.map(({ subject, detail }) => {
      let units = Array.isArray(detail?.units) ? detail.units : [];
      if (!units.length) {
        const byUnit = new Map();
        (detail?.events || []).forEach((event) => {
          const matchesChild = selectedStudentId
            ? (
              (event?.child_id && String(event.child_id) === String(selectedStudentId))
              || (Array.isArray(event?.child_ids) && event.child_ids.some((id) => String(id) === String(selectedStudentId)))
            )
            : true;
          if (!matchesChild) return;
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
  }, [subjectDetails, selectedStudentId]);
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
    return subjectDetails.map(({ subject, detail }) => {
      const sid = String(subject?.id || '');
      const subjectEvents = (detail?.events || []).filter((event) => {
        const matchesChild = selectedStudentId
          ? (
            (event?.child_id && String(event.child_id) === String(selectedStudentId))
            || (Array.isArray(event?.child_ids) && event.child_ids.some((id) => String(id) === String(selectedStudentId)))
          )
          : true;
        return matchesChild && String(event?.status || '').toLowerCase() !== 'canceled';
      });
      const subjectEventDaySet = new Set();
      const pastDaySet = new Set();
      const upcomingDaySet = new Set();
      subjectEvents.forEach((event) => {
        const rawTs = event?.start_ts || event?.start || event?.start_local || event?.due_ts || null;
        const eventTs = rawTs ? new Date(rawTs).getTime() : NaN;
        if (!Number.isFinite(eventTs)) return;
        if (eventTs < academicYearStartDate.getTime() || eventTs > academicYearEndDate.getTime()) return;
        const dayKey = new Date(eventTs).toISOString().slice(0, 10);
        if (!dayKey) return;
        subjectEventDaySet.add(dayKey);
        if (eventTs < nowTs) pastDaySet.add(dayKey);
        else upcomingDaySet.add(dayKey);
      });
      const subjectPlannedDays = subjectEventDaySet.size;
      const completedProjectedDays = Math.max(0, pastDaySet.size);
      const upcomingProjectedDays = Math.max(0, upcomingDaySet.size);
      const projectedDays = completedProjectedDays + upcomingProjectedDays;
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
      const targetDays = parsePositiveInt(
        detail?.settings?.default_target_days
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
      const statusNeeds = [];
      if (!hasPlan) statusNeeds.push('needs a plan');
      if (ungradedPastEvents > 0) statusNeeds.push('needs grading');
      if (paceLabel === 'Behind') statusNeeds.push('is behind pace');
      if (shortfallDays > 0) statusNeeds.push("won't complete saved target by end of term with current plan");
      if (units.length === 0) statusNeeds.push('needs units');
      if (avgPercent != null && avgPercent < 75) statusNeeds.push('has a low grade trend');
      const statusLabel = statusNeeds.length > 0 ? 'Needs attention' : 'On track';
      const statusDetail = (() => {
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
        statusLabel,
        statusDetail,
        paceLabel,
      };
    }).filter((row) => row.id);
  }, [subjectDetails, selectedStudentId, attendanceRecordsForUI, gradeRows, learningGoalsBySubject, selectedStudent?.name, academicYearStartDate, academicYearEndDate, familyDefaultTargetDays]);
  const needsAttention = useMemo(() => {
    const candidates = [];
    subjectProgressRows.forEach((row) => {
      if (!row.hasPlan) {
        candidates.push({
          id: `no-plan-${row.id}`,
          subjectId: row.id,
          actionType: 'plan_no_plan',
          priority: 100,
          title: `${row.subject} has no plan`,
          fixText: 'Add plan cadence.',
        });
      }
      if (row.missingDays > 0) {
        const weeksNeeded = Math.max(1, Math.ceil(row.missingDays / Math.max(1, row.classDaysPerWeek)));
        candidates.push({
          id: `gap-${row.id}`,
          subjectId: row.id,
          actionType: 'plan_attendance_gap',
          priority: 90,
          title: `${row.subject} attendance gap: ${row.missingDays} day${row.missingDays === 1 ? '' : 's'}`,
          fixText: `Add ${row.missingDays} class day${row.missingDays === 1 ? '' : 's'} or extend term about ${weeksNeeded} week${weeksNeeded === 1 ? '' : 's'}.`,
        });
      }
      if (row.unitsCompleted === 0) {
        candidates.push({
          id: `no-units-${row.id}`,
          subjectId: row.id,
          actionType: 'add_units',
          priority: 70,
          title: `${row.subject} has no units`,
          fixText: 'Add at least 1 unit with lessons.',
        });
      }
      if (row.ungradedPastEvents > 0) {
        candidates.push({
          id: `ungraded-${row.id}`,
          subjectId: row.id,
          actionType: 'add_grades',
          priority: 60,
          title: `${row.subject} has ${row.ungradedPastEvents} ungraded event${row.ungradedPastEvents === 1 ? '' : 's'}`,
          fixText: 'Add grades for past events that are missing scores.',
        });
      }
    });
    if (!candidates.length) {
      return [{
        id: 'clear',
        title: 'No urgent actions',
        fixText: 'Everything is looking steady.',
      }];
    }
    return candidates
      .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
  }, [subjectProgressRows]);
  const topGradeLetter = useMemo(
    () => (overviewStats.gradeAverage == null ? '—' : percentToLetter(overviewStats.gradeAverage)),
    [overviewStats.gradeAverage]
  );
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
  const currentConcern = useMemo(() => {
    const first = needsAttention[0];
    if (!first) return 'None';
    if (String(first.id || '').toLowerCase() === 'clear') return 'None';
    return first.title;
  }, [needsAttention]);
  const gradesBySubjectLine = useMemo(() => (
    subjectProgressRows
      .slice(0, 2)
      .map((row) => `${row.subject}: ${row.gradeAverageLetter}`)
      .join(' · ') || 'No subjects yet'
  ), [subjectProgressRows]);
  const attendanceSummaryChips = (
    <View style={styles.attendanceSummaryWrap}>
      <View style={styles.attendanceToolbarRow}>
        <View style={styles.attendanceViewsShell}>
          <View style={styles.attendanceViewsContainer}>
            <Text style={styles.attendanceViewsLabel}>Views</Text>
            <View style={styles.attendanceViewsChipsGroup}>
              <TouchableOpacity
                style={[styles.attendanceViewChip, attendanceViewMode === 'list' && styles.attendanceViewChipActive]}
                onPress={() => setAttendanceViewMode('list')}
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
        <View style={styles.attendanceCountShell}>
          <View style={styles.attendanceCountContainer}>
            <Text style={styles.attendanceCountLabel}>Count</Text>
            <View style={styles.attendanceChips}>
              <View style={styles.attendanceChip}>
                <CheckCircle size={14} color="#10B981" />
                <Text style={styles.attendanceChipText}>{attendanceDayCounts.present} Attended</Text>
              </View>
              <View style={styles.attendanceChip}>
                <XCircle size={14} color="#EF4444" />
                <Text style={styles.attendanceChipText}>{attendanceDayCounts.absent} Unattended</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.attendanceGapShell}>
          <View style={styles.attendanceGapContainer}>
            <Text style={styles.attendanceGapLabel}>Gap</Text>
            <View style={styles.attendanceGapChipButton}>
              <Text style={styles.attendanceGapChipText}>{`-${attendanceGapAmount} days`}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const isWeb = Platform.OS === 'web';
  const getNeedsAttentionToneStyle = (item) => {
    const action = String(item?.actionType || '').trim().toLowerCase();
    if (action === 'plan_no_plan') return styles.needsAttentionDotPlan;
    if (action === 'plan_attendance_gap') return styles.needsAttentionDotGap;
    if (action === 'add_units') return styles.needsAttentionDotUnits;
    if (action === 'add_grades') return styles.needsAttentionDotGrades;
    return null;
  };
  const hasLearningUnits = overviewStats.totalUnits > 0;
  const needsAttentionPanel = (
    <View style={[styles.needsAttentionCard, isWeb && styles.needsAttentionCardStatic]}>
      <Text style={styles.needsAttentionTitle}>Needs attention</Text>
      <ScrollView
        style={[isWeb && styles.needsAttentionScroll]}
        contentContainerStyle={[styles.needsAttentionScrollContent]}
        showsVerticalScrollIndicator={isWeb}
      >
        {needsAttention.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.needsAttentionRow}
            onPress={() => handleNeedsAttentionPress(item)}
            activeOpacity={0.75}
            {...(Platform.OS === 'web' ? { cursor: item?.actionType ? 'pointer' : 'default' } : {})}
          >
            <View style={[styles.needsAttentionDot, getNeedsAttentionToneStyle(item)]} />
            <View style={styles.needsAttentionBody}>
              <Text style={styles.needsAttentionRowTitle}>{item.title}</Text>
              <Text style={styles.needsAttentionRowText}>{item.fixText}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.page}>
      <View style={styles.progressShell}>
        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} showsVerticalScrollIndicator={false}>
        {!hideYearHeader ? (
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

        {!isWeb ? (
          <View style={styles.overviewRightColumnMobile}>
            {needsAttentionPanel}
          </View>
        ) : null}
        <View style={styles.childProgressCard}>
          <View style={[styles.childProgressInnerRow, !isWeb && styles.childProgressInnerRowStacked]}>
            <View style={styles.childProgressMetrics}>
              <View style={styles.childProgressTitleRow}>
                <Image
                  source={sourceForChild(selectedStudentRecord)}
                  style={styles.childProgressAvatar}
                  resizeMode="cover"
                />
                <Text style={styles.childProgressTitle}>{`${selectedStudent?.name || 'Student'}'s Progress`}</Text>
              </View>
              <Text style={styles.childProgressLine}>
                Attendance consistency: {overviewStats.attendanceRate == null ? 'No data' : `${overviewStats.attendanceRate}%`}
              </Text>
              <Text style={styles.childProgressLine}>Grade average: {topGradeLetter}</Text>
              <Text style={styles.childProgressLine}>Learning completed: {overviewStats.totalUnits} units</Text>
            </View>
            <View style={[styles.progressActionsStack, !isWeb && styles.progressActionsStackStacked]}>
              <Text style={[styles.progressActionsTitle, !isWeb && styles.progressActionsTitleStacked]}>Actions</Text>
              <TouchableOpacity
                onPress={() => openSubjectPicker('attendance_edit')}
                activeOpacity={0.75}
                {...(Platform.OS === 'web' ? { cursor: hasSubjectOptions ? 'pointer' : 'default' } : {})}
              >
                <Text style={[styles.progressActionLine, !isWeb && styles.progressActionLineStacked]}>Add/Edit attendance</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openSubjectPicker('grades_add')}
                activeOpacity={0.75}
                {...(Platform.OS === 'web' ? { cursor: hasSubjectOptions ? 'pointer' : 'default' } : {})}
              >
                <Text style={[styles.progressActionLine, !isWeb && styles.progressActionLineStacked]}>Add/Edit grades</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => openSubjectPicker(hasLearningUnits ? 'learning_goals_edit' : 'learning_goals_add')}
                activeOpacity={0.75}
                {...(Platform.OS === 'web' ? { cursor: hasSubjectOptions ? 'pointer' : 'default' } : {})}
              >
                <Text style={[styles.progressActionLine, !isWeb && styles.progressActionLineStacked]}>Add/Edit units</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={styles.subjectRowsCard}>
          {subjectProgressRows.length === 0 ? (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                {`No subjects found for ${selectedStudent?.name || 'this student'} in ${selectedAcademicYearLabel}. Add a subject for this school year to see progress details here.`}
              </Text>
            </View>
          ) : (
            subjectProgressRows.map((row) => (
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
                <Text style={styles.subjectRowLine}>Units achieved: {row.unitsCompleted} completed</Text>
                <Text style={styles.subjectRowLine}>Latest unit: {row.latestUnit}</Text>
                <Text style={[styles.subjectRowStatus, row.statusLabel === 'Needs attention' && styles.subjectRowStatusAlert]}>
                  Status: {row.statusDetail}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>


        </ScrollView>
        {isWeb ? (
          <View style={styles.staticRightRail}>
            {needsAttentionPanel}
          </View>
        ) : null}
      </View>
      <SubjectPastEventsAttendanceModal
        visible={!!attendanceModalSubjectId}
        onClose={() => setAttendanceModalSubjectId(null)}
        familyId={familyId}
        subjectId={attendanceModalSubjectId}
        events={subjectById.get(String(attendanceModalSubjectId || ''))?.detail?.events || []}
        getChildName={getChildName}
        onOpenEvent={() => {}}
        onCreatePlan={() => {}}
        onCompleted={async () => {
          const sid = attendanceModalSubjectId;
          if (sid) await onRefreshSubjectDetail?.(sid);
        }}
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
          if (sid) await onRefreshSubjectDetail?.(sid);
        }}
      />
      <Modal
        visible={!!subjectPickerAction}
        transparent
        animationType="fade"
        onRequestClose={closeSubjectPicker}
      >
        <Pressable style={styles.subjectPickerBackdrop} onPress={closeSubjectPicker}>
          <Pressable style={styles.subjectPickerCard} onPress={() => {}}>
            <Text style={styles.subjectPickerTitle}>Select subject</Text>
            <Text style={styles.subjectPickerSubtitle}>{subjectPickerPrompt}</Text>
            <View style={styles.subjectPickerList}>
              {subjectOptions.map((option) => (
                <TouchableOpacity
                  key={`subject-picker-${option.id}`}
                  style={styles.subjectPickerRow}
                  onPress={() => handleSubjectPickerSelect(option.id)}
                  activeOpacity={0.75}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <Text style={styles.subjectPickerRowText}>{option.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={styles.subjectPickerCancelBtn}
              onPress={closeSubjectPicker}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Text style={styles.subjectPickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
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
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  overviewSummaryLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', ...WEB_HEADING_FONT },
  overviewSummaryValue: { marginTop: 4, fontSize: 19, fontWeight: '700', color: '#0F172A', ...WEB_HEADING_FONT },
  overviewSummaryMeta: { marginTop: 2, fontSize: 12, color: '#64748B', ...WEB_BODY_FONT },
  childProgressCard: {
    marginHorizontal: 14,
    marginTop: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderTopWidth: 1,
    borderColor: '#E5E7EB',
    borderTopColor: '#D8E1EC',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  childProgressInnerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  childProgressInnerRowStacked: {
    flexDirection: 'column',
    gap: 10,
  },
  childProgressMetrics: {
    flex: 1,
    minWidth: 220,
    gap: 3,
  },
  childProgressTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  childProgressAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E2E8F0',
    ...(Platform.OS === 'web' ? { objectFit: 'cover' } : {}),
  },
  childProgressTitle: { fontSize: 16, fontWeight: '700', color: '#111827', ...WEB_HEADING_FONT },
  childProgressLine: { fontSize: 13, color: '#4B5563', lineHeight: 18, ...WEB_BODY_FONT },
  progressActionsStack: {
    width: 205,
    alignItems: 'flex-end',
    gap: 6,
    paddingTop: 2,
  },
  progressActionsStackStacked: {
    width: '100%',
    alignItems: 'flex-start',
  },
  progressActionsTitle: { fontSize: 12, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.4, ...WEB_HEADING_FONT },
  progressActionsTitleStacked: { textAlign: 'left' },
  progressActionLine: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: '#334155', textAlign: 'right', ...WEB_HEADING_FONT },
  progressActionLineStacked: { textAlign: 'left' },
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
  subjectRowItem: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
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
  section: { marginBottom: 40, paddingHorizontal: 14, gap: 10 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 16, ...WEB_HEADING_FONT },
  attendanceSectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 },
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
  attendanceHeaderEditButton: { minHeight: 34, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, marginLeft: 'auto' },
  emptyStateButtonText: { fontSize: 14, fontWeight: '500', color: '#374151', ...WEB_HEADING_FONT },
  attendanceSummaryWrap: { marginBottom: 8 },
  attendanceToolbarRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 10 },
  attendanceViewsContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  attendanceViewsShell: { borderWidth: 1, borderColor: '#DDE6F1', borderRadius: 999, backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 6 },
  attendanceViewsLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: '#94A3B8', ...WEB_HEADING_FONT },
  attendanceViewsChipsGroup: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  attendanceViewChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#F9FAFB',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  attendanceViewChipInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  attendanceViewChipActive: { borderColor: '#6BB3E8', backgroundColor: 'rgba(107, 179, 232, 0.12)' },
  attendanceViewChipText: { fontSize: 13, fontWeight: '500', color: '#374151', ...WEB_HEADING_FONT },
  attendanceViewChipTextActive: { color: '#6BB3E8' },
  attendanceCountShell: { borderWidth: 1, borderColor: '#DDE6F1', borderRadius: 999, backgroundColor: '#F8FAFC', paddingHorizontal: 10, paddingVertical: 6 },
  attendanceCountContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  attendanceCountLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: '#94A3B8', ...WEB_HEADING_FONT },
  attendanceChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  attendanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
  },
  attendanceChipText: { fontSize: 13, fontWeight: '500', color: '#374151', ...WEB_HEADING_FONT },
  attendanceGapShell: { borderWidth: 1, borderColor: '#F3D4D4', borderRadius: 999, backgroundColor: '#FFF7F7', paddingHorizontal: 10, paddingVertical: 6 },
  attendanceGapContainer: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  attendanceGapLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: '#B45353', ...WEB_HEADING_FONT },
  attendanceGapChipButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(239, 68, 68, 0.12)' },
  attendanceGapChipText: { fontSize: 13, fontWeight: '700', color: '#B91C1C', ...WEB_BODY_FONT },
  emptyStateBox: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 24, borderWidth: 1, borderColor: '#E5E7EB' },
  emptyStateText: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 20, ...WEB_BODY_FONT },
  attendanceList: { gap: 8 },
  attendanceItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8 },
  attendanceItemDate: { fontSize: 12, color: '#6B7280', width: 80, ...WEB_BODY_FONT },
  attendanceItemTitle: { flex: 1, fontSize: 14, fontWeight: '500', color: '#374151', ...WEB_HEADING_FONT },
  attendanceItemStatus: { fontSize: 12, color: '#6B7280', textTransform: 'capitalize', ...WEB_BODY_FONT },
  attendanceItemStatusAttended: { color: '#2f7fb8', fontWeight: '600' },
  attendanceItemStatusUnattended: { color: '#e68f88', fontWeight: '600' },
  attendanceItemStatusUpcoming: { color: '#86b5e6', fontWeight: '600' },
  attendanceShowMoreBtn: { marginTop: 12, paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'flex-start', borderRadius: 8, backgroundColor: '#F3F4F6', ...(Platform.OS === 'web' && { cursor: 'pointer' }) },
  attendanceShowMoreText: { fontSize: 14, fontWeight: '500', color: '#4F46E5', ...WEB_HEADING_FONT },
  attendanceItemMinutes: { fontSize: 12, color: '#6B7280', width: 50, textAlign: 'right', ...WEB_BODY_FONT },
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  subjectPickerCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 14,
  },
  subjectPickerTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#111827',
    ...WEB_HEADING_FONT,
  },
  subjectPickerSubtitle: {
    marginTop: 4,
    marginBottom: 14,
    fontSize: 13,
    color: '#6B7280',
    ...WEB_BODY_FONT,
  },
  subjectPickerList: {
    gap: 8,
  },
  subjectPickerRow: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  subjectPickerRowText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    ...WEB_HEADING_FONT,
  },
  subjectPickerCancelBtn: {
    marginTop: 14,
    alignSelf: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  subjectPickerCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    ...WEB_HEADING_FONT,
  },
  emptyInlineText: { fontSize: 12, color: '#94A3B8', ...WEB_BODY_FONT },
});
