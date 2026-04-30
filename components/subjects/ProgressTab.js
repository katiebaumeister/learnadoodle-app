import React, { useEffect, useMemo, useState } from 'react';
import {
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
  const hasSubjectOptions = subjectOptions.length > 0;
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

  return (
    <View style={styles.page}>
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

        <View style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Attendance</Text>
            <TouchableOpacity
              style={[styles.emptyStateButton, styles.attendanceHeaderEditButton]}
              onPress={() => openSubjectPicker('attendance_edit')}
              activeOpacity={0.7}
              {...(Platform.OS === 'web' && { cursor: hasSubjectOptions ? 'pointer' : 'default' })}
            >
              <Edit2 size={14} color="#6B7280" />
              <Text style={styles.emptyStateButtonText}>Edit attendance</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.emptyStateBox}>
            {attendanceSummaryChips}
            {attendanceViewMode === 'list' ? (
              attendanceRecordsListUI.length > 0 ? (
                <View style={styles.attendanceList}>
                  {(showAttendanceExpanded ? attendanceRecordsListUI : attendanceRecordsListUI.slice(0, ATTENDANCE_LIST_LIMIT)).map((row) => (
                    <TouchableOpacity
                      key={row.id}
                      style={styles.attendanceItem}
                      onPress={() => row?.subjectId && onOpenSubject?.(row.subjectId)}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' ? { cursor: row?.subjectId ? 'pointer' : 'default' } : {})}
                    >
                      <Text style={styles.attendanceItemDate}>{formatDate(row.day_date)}</Text>
                      <Text style={styles.attendanceItemTitle}>{row?.title || 'Lesson'}</Text>
                      <Text style={[
                        styles.attendanceItemStatus,
                        row?.statusTone === 'attended' && styles.attendanceItemStatusAttended,
                        row?.statusTone === 'unattended' && styles.attendanceItemStatusUnattended,
                        row?.statusTone === 'upcoming' && styles.attendanceItemStatusUpcoming,
                      ]}>
                        {row?.statusLabel || 'Pending'}
                      </Text>
                      <Text style={styles.attendanceItemMinutes}>{row?.minutes || 0} min</Text>
                    </TouchableOpacity>
                  ))}
                  {attendanceRecordsListUI.length > ATTENDANCE_LIST_LIMIT ? (
                    <TouchableOpacity
                      style={styles.attendanceShowMoreBtn}
                      onPress={() => setShowAttendanceExpanded((prev) => !prev)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.attendanceShowMoreText}>
                        {showAttendanceExpanded
                          ? 'Show less'
                          : `Show more (${attendanceRecordsListUI.length - ATTENDANCE_LIST_LIMIT} more)`}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : <Text style={styles.emptyStateText}>No attendance records yet for {selectedStudent?.name || 'this child'}.</Text>
            ) : attendanceViewMode === 'month' ? (
              <SubjectAttendanceMonthDrilldown attendanceRecords={attendanceRecordsForUI} subjectEvents={attendanceEvents} />
            ) : (
              <SubjectAttendanceYearHeatmap attendanceRecords={attendanceRecordsForUI} subjectEvents={attendanceEvents} />
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
                {...(Platform.OS === 'web' && { cursor: hasSubjectOptions ? 'pointer' : 'default' })}
              >
                <Plus size={16} color="#6B7280" />
                <Text style={styles.emptyStateButtonText}>Add grades</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.emptyStateBox}>
            {gradeRows.length > 0 ? (
              <View style={styles.gradeList}>
                {gradeRows.map((row) => (
                  <TouchableOpacity
                    key={row.id}
                    style={styles.gradeItem}
                    onPress={() => onOpenSubject?.(row.subjectId)}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <View style={styles.gradeItemContent}>
                      <Text style={styles.gradeItemName}>{row.subjectName}</Text>
                      <Text style={styles.gradeItemDate}>{formatDate(row.date)}</Text>
                    </View>
                    <Text style={styles.gradeItemGrade}>{row.grade || '—'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : <Text style={styles.emptyStateText}>No grades yet for {selectedStudent?.name || 'this child'}.</Text>}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.attendanceSectionHeader}>
            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Learning Goals</Text>
            <View style={styles.learningGoalsHeaderActions}>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => openSubjectPicker('learning_goals_add')}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' && { cursor: hasSubjectOptions ? 'pointer' : 'default' })}
              >
                <View style={styles.learningGoalsActionInner}>
                  <Plus size={14} color="#6B7280" />
                  <Text style={styles.emptyStateButtonText}>Add new units</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.learningGoalsEditCurrentButton}
                onPress={() => openSubjectPicker('learning_goals_edit')}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' && { cursor: hasSubjectOptions ? 'pointer' : 'default' })}
              >
                <View style={styles.learningGoalsActionInner}>
                  <Edit2 size={14} color="#5E6C84" />
                  <Text style={styles.learningGoalsEditCurrentText}>Edit current units</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.emptyStateBox}>
            {learningGoalsBySubject.some((entry) => (entry.units || []).length > 0) ? (
              learningGoalsBySubject.map((entry) => (
                <View key={entry.subjectId} style={styles.learningSubjectBlock}>
                  <TouchableOpacity
                    onPress={() => onOpenSubject?.(entry.subjectId)}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <Text style={styles.learningSubjectTitle}>{entry.subjectName}</Text>
                  </TouchableOpacity>
                  <Text style={styles.learningGoalsSavedUnitsLabel}>Saved units</Text>
                  <Text style={styles.learningGoalsSavedUnitsMeta}>
                    {(entry.units || []).length} {(entry.units || []).length === 1 ? 'unit' : 'units'}
                    {' · '}
                    {(entry.units || []).reduce((sum, unit) => sum + (Array.isArray(unit?.lessons) ? unit.lessons.length : 0), 0)}
                    {' lessons built'}
                  </Text>
                  <View style={styles.learningGoalsMethodHeaderDivider} />
                  {(entry.units || []).length > 0 ? (
                    entry.units.map((unit, idx) => (
                      <View key={`${entry.subjectId}-${unit?.title || 'unit'}-${idx}`} style={styles.learningGoalsUnitCard}>
                        <Text style={styles.learningGoalsUnitTitle}>{unit?.title || `Unit ${idx + 1}`}</Text>
                        <Text style={styles.learningGoalsUnitMeta}>
                          {(unit?.lessons || []).length} {(unit?.lessons || []).length === 1 ? 'lesson' : 'lessons'}
                        </Text>
                        {(unit?.lessons || []).length > 0 ? (
                          (unit.lessons || []).slice(0, 6).map((lesson, lessonIndex) => (
                            <Text key={`${entry.subjectId}-lesson-${lessonIndex}`} style={styles.learningGoalsLessonRow}>
                              • {lesson?.title || lesson?.name || `Lesson ${lessonIndex + 1}`}
                            </Text>
                          ))
                        ) : (
                          <Text style={styles.learningGoalsLessonRow}>• No lessons yet</Text>
                        )}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyInlineText}>No units yet.</Text>
                  )}
                </View>
              ))
            ) : <Text style={styles.emptyStateText}>No learning goals yet for {selectedStudent?.name || 'this child'}.</Text>}
          </View>
        </View>
      </ScrollView>
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
  content: { flex: 1 },
  contentInner: { paddingTop: 12, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  yearHeaderNavShell: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  yearHeaderNavBtn: { width: 34, height: 34, borderRadius: 999, alignItems: 'center', justifyContent: 'center', ...(Platform.OS === 'web' && { cursor: 'pointer' }) },
  yearHeaderTitle: { fontSize: 24, fontWeight: '700', color: '#111827', ...WEB_HEADING_FONT },
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
  attendanceList: { gap: 0 },
  attendanceItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
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
