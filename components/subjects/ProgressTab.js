import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { BarChart3, Calendar, Check, ChevronLeft, ChevronRight, Edit2, List, Plus } from 'lucide-react';
import {
  SubjectAttendanceMonthDrilldown,
  SubjectAttendanceYearHeatmap,
} from './SubjectSectionDrilldownPanels';
import SubjectPastEventsAttendanceModal from './SubjectPastEventsAttendanceModal';
import SubjectPastEventsGradesModal from './SubjectPastEventsGradesModal';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import { supabase } from '../../lib/supabase';
import { createAttendanceLog, deleteAttendanceLog, updateAttendanceLog } from '../../lib/services/recordsClient';

const WEB_HEADING_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const ATTENDANCE_LIST_LIMIT = 5;
const EMPTY_SUBJECT_MODAL_ID = '__empty_subject__';
const PROGRESS_ATTENDANCE_VIEW_STORAGE_PREFIX = 'ld_progress_attendance_view_v1::';
const ATTENDANCE_OVERRIDE_CLEAR = '__clear__';

function normalizeAttendanceViewMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'month' || raw === 'year') return raw;
  return 'list';
}

function buildProgressAttendanceViewStorageKey({ familyId, childId, academicYearStart } = {}) {
  const familyKey = String(familyId || '').trim();
  const childKey = String(childId || '').trim();
  const yearKey = Number.isFinite(Number(academicYearStart)) ? String(Number(academicYearStart)) : '';
  if (!familyKey || !childKey || !yearKey) return '';
  return `${PROGRESS_ATTENDANCE_VIEW_STORAGE_PREFIX}${familyKey}|${childKey}|${yearKey}`;
}

function readProgressAttendanceView(storageKey) {
  if (!storageKey || Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage?.getItem(storageKey);
    if (!raw) return null;
    return normalizeAttendanceViewMode(raw);
  } catch (_) {
    return null;
  }
}

function writeProgressAttendanceView(storageKey, mode) {
  if (!storageKey || Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.sessionStorage?.setItem(storageKey, normalizeAttendanceViewMode(mode));
  } catch (_) {
    // ignore storage write failures
  }
}

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

function getEventStartYmd(event) {
  const raw = event?.start_ts || event?.start || event?.start_local || event?.due_ts;
  return raw ? String(raw).slice(0, 10) : null;
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
  onOpenSubject,
  onRefreshSubjectDetail,
  onEditChild = null,
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
    if (!familyId || !selectedAcademicYearLabel) {
      setYearSubjectTargetsById({});
      return () => { cancelled = true; };
    }
    supabase
      .from('academic_years')
      .select('subject_targets, subject_targets_override')
      .eq('family_id', familyId)
      .eq('school_year_label', selectedAcademicYearLabel)
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
  }, [familyId, selectedAcademicYearLabel]);
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
    if (!hasSubjectOptions) {
      if (action === 'attendance_edit') {
        setAttendanceModalSubjectId(EMPTY_SUBJECT_MODAL_ID);
        return;
      }
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

  const attendanceViewStorageKey = useMemo(
    () => buildProgressAttendanceViewStorageKey({
      familyId,
      childId: selectedStudentId,
      academicYearStart: selectedAcademicYearStart,
    }),
    [familyId, selectedStudentId, selectedAcademicYearStart]
  );
  const [attendanceViewMode, setAttendanceViewMode] = useState(() => (
    readProgressAttendanceView(
      buildProgressAttendanceViewStorageKey({
        familyId,
        childId: preferredStudentId,
        academicYearStart: selectedAcademicYearStart,
      })
    ) || 'list'
  ));
  const [showAttendanceExpanded, setShowAttendanceExpanded] = useState(false);
  const [optimisticAttendanceByKey, setOptimisticAttendanceByKey] = useState({});
  useEffect(() => {
    const persisted = readProgressAttendanceView(attendanceViewStorageKey) || 'list';
    setAttendanceViewMode((prev) => (prev === persisted ? prev : persisted));
  }, [attendanceViewStorageKey]);
  useEffect(() => {
    writeProgressAttendanceView(attendanceViewStorageKey, attendanceViewMode);
  }, [attendanceViewStorageKey, attendanceViewMode]);
  useEffect(() => {
    setOptimisticAttendanceByKey({});
  }, [familyId, selectedStudentId, selectedAcademicYearStart]);
  useEffect(() => {
    setShowAttendanceExpanded(false);
  }, [attendanceViewMode, selectedStudentId]);

  const attendanceRecordsForUI = useMemo(() => {
    const rows = [];
    const byEvent = new Set();
    const nowMs = Date.now();
    const todayYmd = new Date().toISOString().slice(0, 10);
    subjectDetails.forEach(({ subject, detail }) => {
      (detail?.attendanceRecords || []).forEach((record) => {
        if (
          selectedStudentId
          && record?.child_id
          && String(record.child_id) !== String(selectedStudentId)
        ) return;
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
          childId: selectedStudentId || null,
        });
      });
    });
    const overrides = optimisticAttendanceByKey || {};
    Object.values(overrides).forEach((entry) => {
      const key = buildAttendanceOverrideKey(entry?.eventId, entry?.dayDate, entry?.childId);
      if (!key) return;
      const idx = rows.findIndex((row) => (
        buildAttendanceOverrideKey(row?.eventId, row?.dayDate, row?.childId || selectedStudentId) === key
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
          childId: entry?.childId || selectedStudentId || null,
        });
      }
    });
    rows.sort((a, b) => String(b.dayDate).localeCompare(String(a.dayDate)));
    return rows;
  }, [subjectDetails, selectedStudentId, academicYearStartDate, academicYearEndDate, optimisticAttendanceByKey]);

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
          subjectName: String(event?.subjectName || '').trim() || null,
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
          subjectName: String(preview?.subjectName || 'Subject').trim() || 'Subject',
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
          subjectName: String(record?.subjectName || 'Subject').trim() || 'Subject',
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
    if (!ids.length && selectedStudentId) ids.push(String(selectedStudentId));
    return [...new Set(ids.filter(Boolean))];
  }, [selectedStudentId]);
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
  const handleOpenAddEventForDate = useCallback((dateKey) => {
    const normKey = String(dateKey || '').slice(0, 10);
    if (!normKey || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const detail = {
      eventType: 'Lesson',
      date: new Date(`${normKey}T12:00:00`),
    };
    if (selectedStudentId) {
      detail.childId = String(selectedStudentId);
      detail.childIds = [String(selectedStudentId)];
    }
    window.dispatchEvent(new CustomEvent('openTaskModal', { detail }));
  }, [selectedStudentId]);
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
  const handleToggleEventAttendanceForDate = useCallback(async (dateKey, eventId) => {
    const normKey = String(dateKey || '').slice(0, 10);
    const eid = String(eventId || '').trim();
    if (!familyId || !selectedStudentId || !normKey || !eid) return;
    const event = attendanceEventById.get(eid);
    if (!event?.id) return;
    const existingRows = (attendanceRecordsForUI || []).filter((row) => (
      String(row?.eventId || '') === eid
      && String(row?.dayDate || '').slice(0, 10) === normKey
      && (!row?.childId || String(row.childId) === String(selectedStudentId))
    ));
    const hasPresent = existingRows.some((row) => ['present', 'partial'].includes(String(row?.status || '').toLowerCase()));
    const todayYmd = new Date().toISOString().slice(0, 10);
    const isFutureDate = normKey > todayYmd;
    // Future unmark should return to Upcoming (no explicit attendance row), not Absent.
    const nextStatus = hasPresent ? (isFutureDate ? null : 'absent') : 'present';
    const minutes = getEventMinutes(event);
    const targetChildIds = resolveChildIdsForAttendanceEvent(event);
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
  }, [familyId, selectedStudentId, attendanceEventById, attendanceRecordsForUI, getEventMinutes, onRefreshSubjectDetail, subjectDetails, resolveChildIdsForAttendanceEvent, attendanceLogIdByEventDayChild]);
  const canMarkAttendanceForDateKey = useCallback((dateKey) => {
    const normKey = String(dateKey || '').slice(0, 10);
    if (!normKey) return false;
    if ((attendanceEvents || []).some((event) => String(getEventStartYmd(event) || '').slice(0, 10) === normKey)) return true;
    return (attendanceRecordsForUI || []).some((record) => String(record?.dayDate || '').slice(0, 10) === normKey);
  }, [attendanceEvents, attendanceRecordsForUI]);
  const pendingYearDayToggleKeysRef = useRef(new Set());
  const handleYearHeatmapDayPress = useCallback(async (dateKey) => {
    const normKey = String(dateKey || '').slice(0, 10);
    if (!normKey) return;
    if (pendingYearDayToggleKeysRef.current.has(normKey)) return;
    if (!canMarkAttendanceForDateKey(normKey)) {
      return;
    }
    const dayEvents = (attendanceEvents || []).filter((event) => (
      String(getEventStartYmd(event) || '').slice(0, 10) === normKey
      && String(event?.status || '').toLowerCase() !== 'canceled'
      && event?.id
    ));
    if (!dayEvents.length) {
      return;
    }
    const dayRows = (attendanceRecordsForUI || []).filter((row) => String(row?.dayDate || '').slice(0, 10) === normKey);
    const hasPresent = dayRows.some((row) => ['present', 'partial'].includes(String(row?.status || '').toLowerCase()));
    const targetStateLabel = hasPresent ? 'unattended' : 'attended';
    const eventIdsToToggle = dayEvents
      .filter((event) => {
        const rowsForEvent = dayRows.filter((row) => String(row?.eventId || '') === String(event?.id || ''));
        const eventHasPresent = rowsForEvent.some((row) => ['present', 'partial'].includes(String(row?.status || '').toLowerCase()));
        return hasPresent ? eventHasPresent : !eventHasPresent;
      })
      .map((event) => String(event.id));
    if (!eventIdsToToggle.length) {
      return;
    }
    pendingYearDayToggleKeysRef.current.add(normKey);
    try {
      for (const eventId of eventIdsToToggle) {
        // Sequential updates avoid race conditions against refresh callbacks.
        // eslint-disable-next-line no-await-in-loop
        await handleToggleEventAttendanceForDate(normKey, eventId);
      }
    } finally {
      pendingYearDayToggleKeysRef.current.delete(normKey);
    }
  }, [canMarkAttendanceForDateKey, attendanceEvents, attendanceRecordsForUI, handleToggleEventAttendanceForDate]);
  const attendanceDayCounts = useMemo(() => {
    const byDay = new Map();
    const todayYmd = new Date().toISOString().slice(0, 10);
    attendanceRecordsForUI.forEach((record) => {
      const dayKey = String(record?.dayDate || '').slice(0, 10);
      if (!dayKey) return;
      const status = String(record?.status || '').toLowerCase();
      if (!byDay.has(dayKey)) byDay.set(dayKey, { hasPresent: false, hasAbsent: false });
      const bucket = byDay.get(dayKey);
      if (status === 'present' || status === 'partial') bucket.hasPresent = true;
      if (status === 'absent' && dayKey <= todayYmd) bucket.hasAbsent = true;
    });
    let present = 0;
    let absent = 0;
    byDay.forEach((bucket) => {
      if (bucket.hasPresent) present += 1;
      else if (bucket.hasAbsent) absent += 1;
    });
    const upcomingDaySet = new Set();
    (attendanceEvents || []).forEach((event) => {
      if (String(event?.status || '').toLowerCase() === 'canceled') return;
      const dayKey = String(getEventStartYmd(event) || '').slice(0, 10);
      if (!dayKey || dayKey <= todayYmd) return;
      const bucket = byDay.get(dayKey);
      if (bucket?.hasPresent || bucket?.hasAbsent) return;
      upcomingDaySet.add(dayKey);
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
          eventId: event?.id || outcome?.event_id || null,
          event: event || null,
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
          eventId: event?.id || null,
          event: event || null,
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
          eventId: null,
          event: null,
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
      const subjectEvents = (detail?.events || []).filter((event) => {
        const matchesChild = selectedStudentId
          ? (
            (event?.child_id && String(event.child_id) === String(selectedStudentId))
            || (Array.isArray(event?.child_ids) && event.child_ids.some((id) => String(id) === String(selectedStudentId)))
          )
          : true;
        return matchesChild && String(event?.status || '').toLowerCase() !== 'canceled';
      });
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
  }, [subjectDetails, selectedStudentId, attendanceRecordsForUI, gradeRows, learningGoalsBySubject, selectedStudent?.name, academicYearStartDate, academicYearEndDate, familyDefaultTargetDays, familyTargetScope, familyOverallTargetDays, yearSubjectTargetsById]);
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
            </View>
          </View>
      </View>
    </View>
  );
  const attendanceInsightsPanel = attendanceViewMode === 'year' || attendanceViewMode === 'month' ? (
    <View style={styles.progressInsightsPanelWrap}>
      {attendanceViewMode === 'year' ? (
        <SubjectAttendanceYearHeatmap
          attendanceRecords={attendanceRecordsForUI.map((record) => ({
            ...record,
            day_date: record?.dayDate,
            event_id: record?.eventId,
          }))}
          subjectEvents={attendanceEvents}
          isDayMarkable={canMarkAttendanceForDateKey}
          onDayPress={handleYearHeatmapDayPress}
          hideLegend
        />
      ) : attendanceViewMode === 'month' ? (
        <SubjectAttendanceMonthDrilldown
          attendanceRecords={attendanceRecordsForUI.map((record) => ({
            ...record,
            day_date: record?.dayDate,
            event_id: record?.eventId,
          }))}
          subjectEvents={attendanceEvents}
          onOpenEventDetails={handleOpenEventDetails}
          onToggleEventAttendance={handleToggleEventAttendanceForDate}
          onAddEventForDate={handleOpenAddEventForDate}
          hideLegend
        />
      ) : null}
    </View>
  ) : null;

  const isWeb = Platform.OS === 'web';
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
                  <Text style={styles.progressHeaderTitle}>{`${selectedStudent?.name || 'Student'}'s Progress`}</Text>
                  <Text style={styles.progressHeaderSubtext}>{gradeAndSubjectsLine}</Text>
                </View>
              </View>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => {
                  if (typeof onEditChild === 'function' && selectedStudentRecord) {
                    onEditChild(selectedStudentRecord);
                  }
                }}
                activeOpacity={0.75}
                {...(Platform.OS === 'web' ? { cursor: (typeof onEditChild === 'function' && selectedStudentRecord) ? 'pointer' : 'default' } : {})}
              >
                <Edit2 size={14} color="#6B7280" />
                <Text style={styles.actionButtonText}>Edit child</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <View style={[styles.section, styles.subjectsSection]}>
          <Text style={styles.sectionTitle}>Subjects</Text>
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
        {subjectProgressRows.length > 0 ? (
          <>
            <View style={styles.section}>
              <View style={styles.attendanceSectionHeader}>
                <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Attendance</Text>
                <View style={styles.sectionHeaderActions}>
                  <TouchableOpacity
                    style={[styles.emptyStateButton, styles.attendanceHeaderEditButton]}
                    onPress={() => openSubjectPicker('attendance_edit')}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Edit2 size={14} color="#6B7280" />
                    <Text style={styles.emptyStateButtonText}>Bulk edit attendance</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.progressSectionBody}>
                {attendanceSummaryChips}
                {attendanceViewMode === 'list' ? (
                  attendanceRecordsListUI.length > 0 ? (
                    <>
                      <View style={styles.attendanceList}>
                        {(showAttendanceExpanded ? attendanceRecordsListUI : attendanceRecordsListUI.slice(0, ATTENDANCE_LIST_LIMIT)).map((record) => {
                          const statusLabel = String(record?.statusLabel || '');
                          const statusTone = String(record?.statusTone || '').toLowerCase();
                          const isAttended = statusTone === 'attended';
                          const canToggleAttendance = !!record?.event_id && !!record?.day_date;
                          const event = String(record?.event_id || '').trim()
                            ? attendanceEventById.get(String(record?.event_id || '').trim()) || null
                            : null;
                          return (
                            <TouchableOpacity
                              key={record.id}
                              style={styles.attendanceItem}
                              onPress={() => event && handleOpenEventDetails(event.id, event)}
                              activeOpacity={0.7}
                              {...(Platform.OS === 'web' && { cursor: event ? 'pointer' : 'default' })}
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
                              <View style={styles.progressAttendanceTitleWrap}>
                                <Text style={styles.attendanceItemTitle}>{record?.title || 'Lesson'}</Text>
                                <Text style={styles.progressAttendanceSubjectText}>{record?.subjectName || 'Subject'}</Text>
                              </View>
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
                    <Text style={styles.emptyStateText}>
                      Attendance appears once you add an event attached to this child.
                    </Text>
                  )
                ) : (
                  attendanceInsightsPanel
                )}
              </View>
            </View>
            <View style={styles.section}>
              <View style={styles.gradesSectionHeader}>
                <View style={styles.gradesSectionTitleRow}>
                  <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Grades</Text>
                  <TouchableOpacity
                    style={[styles.emptyStateButton, styles.gradesHeaderAddButton]}
                    onPress={() => openSubjectPicker('grades_add')}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Plus size={16} color="#6B7280" />
                    <Text style={styles.emptyStateButtonText}>Bulk add grades</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.progressSectionBody}>
                {gradeRows.length > 0 ? (
                  <View style={styles.gradeList}>
                    {gradeRows.map((row) => {
                      const hasEvent = !!row?.eventId;
                      return (
                        <TouchableOpacity
                          key={row.id}
                          style={styles.gradeItem}
                          onPress={() => hasEvent && handleOpenEventDetails(row.eventId, row.event)}
                          activeOpacity={0.7}
                          {...(Platform.OS === 'web' && { cursor: hasEvent ? 'pointer' : 'default' })}
                        >
                          <View style={styles.gradeItemContent}>
                            <Text style={styles.gradeItemName}>{row.name}</Text>
                            <Text style={styles.gradeItemDate}>
                              {`${row.subjectName} · ${formatDate(row.date)}`}
                            </Text>
                          </View>
                          <Text style={styles.gradeItemGrade}>{row.grade}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.emptyStateText}>
                    Grades appear once events for this child are graded.
                  </Text>
                )}
              </View>
            </View>
          </>
        ) : null}


        </ScrollView>
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
          if (sid && sid !== EMPTY_SUBJECT_MODAL_ID) await onRefreshSubjectDetail?.(sid);
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
          if (sid && sid !== EMPTY_SUBJECT_MODAL_ID) await onRefreshSubjectDetail?.(sid);
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
  progressAttendanceTitleWrap: {
    flex: 1,
    gap: 2,
  },
  progressAttendanceSubjectText: {
    fontSize: 12,
    color: '#6B7280',
    ...WEB_BODY_FONT,
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
  attendanceList: { gap: 8 },
  attendanceItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 8 },
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
  attendanceItemDate: { fontSize: 12, color: '#6B7280', width: 80, ...WEB_BODY_FONT },
  attendanceItemTitle: { flex: 1, fontSize: 14, fontWeight: '500', color: '#374151', ...WEB_HEADING_FONT },
  attendanceItemStatusWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 94 },
  attendanceItemStatusDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: '#CBD5E1' },
  attendanceItemStatusDotAttended: { backgroundColor: '#6BB3E8' },
  attendanceItemStatusDotUnattended: { backgroundColor: '#F2A0A0' },
  attendanceItemStatusDotUpcoming: { backgroundColor: '#C7DDF6' },
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
