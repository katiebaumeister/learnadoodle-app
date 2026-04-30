import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const WEB_HEADING_FONT = Platform.OS === 'web'
  ? { fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};
const WEB_BODY_FONT = Platform.OS === 'web'
  ? { fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
  : {};

function getChildLabel(child) {
  return (
    child?.first_name
    || child?.name
    || child?.full_name
    || child?.display_name
    || 'Student'
  );
}

function getEventUnitTitle(event) {
  const value = (
    event?.unit_name
    || event?.curriculum_unit_title
    || event?.unit
    || event?.unit_title
    || event?.unit_topic
    || ''
  );
  return String(value).trim();
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
  children = [],
  filteredSubjects = [],
  subjectDetailCache = {},
  selectedChildFilter = 'all',
  selectedYearFilter = 'all_years',
  hideYearHeader = false,
  onOpenSubject,
}) {
  const students = useMemo(
    () =>
      (Array.isArray(children) ? children : [])
        .filter((child) => child?.id)
        .map((child) => ({
          id: child.id,
          name: getChildLabel(child),
        })),
    [children]
  );
  const preferredStudentId = useMemo(() => {
    if (
      selectedChildFilter
      && selectedChildFilter !== 'all'
      && students.some((student) => String(student.id) === String(selectedChildFilter))
    ) {
      return selectedChildFilter;
    }
    return null;
  }, [students, selectedChildFilter]);
  const [selectedStudentId, setSelectedStudentId] = useState(preferredStudentId);
  useEffect(() => {
    setSelectedStudentId(preferredStudentId);
  }, [preferredStudentId]);
  const selectedStudentName = useMemo(() => {
    if (!selectedStudentId) return null;
    const match = students.find((student) => String(student.id) === String(selectedStudentId));
    return match?.name || null;
  }, [students, selectedStudentId]);
  const possessiveStudentLabel = useMemo(() => {
    const base = String(selectedStudentName || 'Child').trim();
    if (!base) return "Child's";
    return base.toLowerCase().endsWith('s') ? `${base}'` : `${base}'s`;
  }, [selectedStudentName]);

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
  const activeMonthDate = useMemo(
    () => {
      const month = today.getMonth();
      const monthNumber = month + 1;
      const yearForMonth = monthNumber >= 8 ? selectedAcademicYearStart : selectedAcademicYearStart + 1;
      return new Date(yearForMonth, month, 1);
    },
    [today, selectedAcademicYearStart]
  );
  const monthStart = useMemo(
    () => new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth(), 1),
    [activeMonthDate]
  );
  const monthEnd = useMemo(
    () => new Date(activeMonthDate.getFullYear(), activeMonthDate.getMonth() + 1, 0),
    [activeMonthDate]
  );
  const monthStartKey = useMemo(() => monthStart.toISOString().slice(0, 10), [monthStart]);
  const monthEndKey = useMemo(() => monthEnd.toISOString().slice(0, 10), [monthEnd]);
  const academicYearStartDate = useMemo(
    () => new Date(selectedAcademicYearStart, 7, 1),
    [selectedAcademicYearStart]
  );
  const academicYearEndDate = useMemo(
    () => new Date(selectedAcademicYearStart + 1, 6, 31, 23, 59, 59, 999),
    [selectedAcademicYearStart]
  );

  const subjectDetails = useMemo(
    () =>
      (filteredSubjects || [])
        .map((subject) => ({
          subject,
          detail: subjectDetailCache?.[subject?.id] || null,
        }))
        .filter((entry) => entry.subject?.id),
    [filteredSubjects, subjectDetailCache]
  );

  const attendanceByDay = useMemo(() => {
    const byDay = {};
    subjectDetails.forEach(({ detail }) => {
      (detail?.attendanceRecords || []).forEach((record) => {
        if (
          selectedStudentId
          && record?.child_id
          && String(record.child_id) !== String(selectedStudentId)
        ) {
          return;
        }
        const dayDate = String(record?.day_date || '').slice(0, 10);
        if (!dayDate || dayDate < monthStartKey || dayDate > monthEndKey) return;
        if (!byDay[dayDate]) byDay[dayDate] = [];
        byDay[dayDate].push(record?.status || '');
      });
    });
    return byDay;
  }, [subjectDetails, selectedStudentId, monthStartKey, monthEndKey]);

  const calendarDays = useMemo(() => {
    const daysInMonth = monthEnd.getDate();
    return Array.from({ length: daysInMonth }, (_, i) => {
      const day = i + 1;
      const dayDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const dayKey = dayDate.toISOString().slice(0, 10);
      const statuses = attendanceByDay[dayKey] || [];
      let status = 'noEvents';
      if (statuses.some((s) => s === 'absent')) status = 'unattended';
      else if (statuses.some((s) => s === 'present' || s === 'partial')) status = 'attended';
      return {
        id: dayKey,
        label: String(day),
        status,
      };
    });
  }, [monthStart, monthEnd, attendanceByDay]);

  const gradeRows = useMemo(() => {
    const rows = [];
    subjectDetails.forEach(({ subject, detail }) => {
      (detail?.grades || []).forEach((grade) => {
        if (
          selectedStudentId
          && grade?.child_id
          && String(grade.child_id) !== String(selectedStudentId)
        ) {
          return;
        }
        const percentFromScore = (
          grade?.score != null
          && grade?.possible != null
          && Number(grade.possible) > 0
        )
          ? Math.round((Number(grade.score) / Number(grade.possible)) * 100)
          : null;
        const percentRawScore = (
          grade?.score != null
          && Number(grade.score) >= 0
          && Number(grade.score) <= 100
        )
          ? Number(grade.score)
          : null;
        const score = percentFromScore ?? percentRawScore ?? gradeToPercent(grade?.grade);
        if (score == null) return;
        rows.push({
          id: `grade-${grade?.id || `${subject?.id || 'subject'}-${grade?.created_at || grade?.term_label || grade?.score || 'entry'}`}`,
          subject: subject?.name || 'Subject',
          assignment: grade?.term_label || grade?.label || `Recorded ${subject?.name || 'grade'}`,
          score,
          createdAt: grade?.created_at || null,
        });
      });
    });
    rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return rows.slice(0, 6);
  }, [subjectDetails, selectedStudentId]);

  const childProgressRows = useMemo(() => {
    const studentsInScope = selectedStudentId
      ? students.filter((student) => String(student.id) === String(selectedStudentId))
      : students;

    return studentsInScope.map((student) => {
      const attendanceByDayForChild = {};
      const unitTitles = new Set();
      const gradeScores = [];

      subjectDetails.forEach(({ detail }) => {
        const events = Array.isArray(detail?.events) ? detail.events : [];
        const eventById = events.reduce((acc, event) => {
          const id = String(event?.id || '').trim();
          if (id) acc[id] = event;
          return acc;
        }, {});

        (detail?.attendanceRecords || []).forEach((record) => {
          if (
            record?.child_id
            && String(record.child_id) !== String(student.id)
          ) {
            return;
          }
          const day = String(record?.day_date || '').slice(0, 10);
          if (!day) return;
          const dayDate = new Date(day);
          if (Number.isNaN(dayDate.getTime())) return;
          if (dayDate < academicYearStartDate || dayDate > academicYearEndDate) return;
          if (!attendanceByDayForChild[day]) attendanceByDayForChild[day] = [];
          attendanceByDayForChild[day].push(String(record?.status || '').toLowerCase());

          const isAchieved = ['present', 'partial', 'completed'].includes(
            String(record?.status || '').toLowerCase()
          );
          if (!isAchieved) return;
          const eventId = String(record?.event_id || '').trim();
          const unitTitle = eventId ? getEventUnitTitle(eventById[eventId]) : '';
          if (unitTitle) unitTitles.add(unitTitle);
        });

        events.forEach((event) => {
          if (
            event?.child_id
            && String(event.child_id) !== String(student.id)
          ) {
            return;
          }
          const start = event?.start_ts || event?.start || event?.start_local;
          if (!start) return;
          const dt = new Date(start);
          if (Number.isNaN(dt.getTime())) return;
          if (dt < academicYearStartDate || dt > academicYearEndDate) return;
          const status = String(event?.status || '').toLowerCase();
          if (!['completed', 'done', 'attended'].includes(status)) return;
          const unitTitle = getEventUnitTitle(event);
          if (unitTitle) unitTitles.add(unitTitle);
        });

        (detail?.grades || []).forEach((grade) => {
          if (
            grade?.child_id
            && String(grade.child_id) !== String(student.id)
          ) {
            return;
          }
          const percentFromScore = (
            grade?.score != null
            && grade?.possible != null
            && Number(grade.possible) > 0
          )
            ? Math.round((Number(grade.score) / Number(grade.possible)) * 100)
            : null;
          const percentRawScore = (
            grade?.score != null
            && Number(grade.score) >= 0
            && Number(grade.score) <= 100
          )
            ? Number(grade.score)
            : null;
          const score = percentFromScore ?? percentRawScore ?? gradeToPercent(grade?.grade);
          if (score != null) gradeScores.push(score);
        });
      });

      const attendanceTotals = Object.values(attendanceByDayForChild).reduce(
        (acc, statuses) => {
          if (statuses.some((status) => status === 'absent')) {
            acc.absent += 1;
            return acc;
          }
          if (statuses.some((status) => status === 'present' || status === 'partial' || status === 'completed')) {
            acc.present += 1;
          }
          return acc;
        },
        { present: 0, absent: 0 }
      );
      const attendanceMarked = attendanceTotals.present + attendanceTotals.absent;
      const attendanceRate = attendanceMarked > 0
        ? Math.round((attendanceTotals.present / attendanceMarked) * 100)
        : null;
      const gradeAverage = gradeScores.length
        ? Math.round(gradeScores.reduce((sum, score) => sum + score, 0) / gradeScores.length)
        : null;
      const achievedUnits = Array.from(unitTitles).slice(0, 3);
      const extraUnitCount = Math.max(0, unitTitles.size - achievedUnits.length);

      return {
        id: String(student.id),
        childName: student.name || 'Student',
        attendanceLabel: attendanceRate == null
          ? 'No attendance yet'
          : `${attendanceRate}% (${attendanceTotals.present}/${attendanceMarked})`,
        gradeLabel: gradeAverage == null ? 'No grades yet' : `${gradeAverage}%`,
        learningLabel: achievedUnits.length === 0
          ? 'No units achieved yet'
          : `${achievedUnits.join(', ')}${extraUnitCount > 0 ? ` +${extraUnitCount} more` : ''}`,
      };
    });
  }, [subjectDetails, students, selectedStudentId, academicYearStartDate, academicYearEndDate]);

  const stats = useMemo(() => {
    const attended = calendarDays.filter((d) => d.status === 'attended').length;
    const unattended = calendarDays.filter((d) => d.status === 'unattended').length;
    const totalMarked = attended + unattended;

    const attendanceRate = totalMarked
      ? Math.round((attended / totalMarked) * 100)
      : 0;

    const progressValues = subjectDetails
      .map(({ subject, detail }) => {
        const detailProgress = detail?.progressPercent;
        if (detailProgress != null && !Number.isNaN(detailProgress)) return detailProgress;
        const subjectProgress = subject?.progressPercent;
        if (subjectProgress != null && !Number.isNaN(subjectProgress)) return subjectProgress;
        return null;
      })
      .filter((value) => value != null);
    const completionRate = progressValues.length
      ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length)
      : 0;
    const gradeAverage = gradeRows.length
      ? Math.round(gradeRows.reduce((sum, row) => sum + row.score, 0) / gradeRows.length)
      : null;

    const yearDurationMs = Math.max(1, academicYearEndDate.getTime() - academicYearStartDate.getTime());
    const elapsedRatio = Math.max(0, Math.min(1, (today.getTime() - academicYearStartDate.getTime()) / yearDurationMs));
    const expectedCompletion = Math.round(elapsedRatio * 100);
    const paceDelta = completionRate - expectedCompletion;
    const paceLabel = paceDelta < -5 ? 'Behind' : paceDelta > 5 ? 'Ahead' : 'On track';

    const attendanceByAcademicDay = {};
    subjectDetails.forEach(({ detail }) => {
      (detail?.attendanceRecords || []).forEach((record) => {
        if (
          selectedStudentId
          && record?.child_id
          && String(record.child_id) !== String(selectedStudentId)
        ) {
          return;
        }
        const dayDate = String(record?.day_date || '').slice(0, 10);
        if (!dayDate) return;
        const dayValue = new Date(dayDate);
        if (Number.isNaN(dayValue.getTime())) return;
        if (dayValue < academicYearStartDate || dayValue > academicYearEndDate) return;
        if (!attendanceByAcademicDay[dayDate]) attendanceByAcademicDay[dayDate] = [];
        attendanceByAcademicDay[dayDate].push(record?.status || '');
      });
    });
    const academicTotals = Object.values(attendanceByAcademicDay).reduce(
      (acc, statuses) => {
        if (statuses.some((status) => status === 'absent')) {
          acc.absent += 1;
          return acc;
        }
        if (statuses.some((status) => status === 'present' || status === 'partial')) {
          acc.present += 1;
        }
        return acc;
      },
      { present: 0, absent: 0 }
    );
    const annualAttendanceMarked = academicTotals.present + academicTotals.absent;
    const annualAttendanceTarget = Math.max(180, annualAttendanceMarked);
    const annualCompletionTarget = Math.max(120, Math.round((filteredSubjects || []).length * 24));
    const completedLessonsCount = Math.round((completionRate / 100) * annualCompletionTarget);

    return {
      attendanceRate,
      completionRate,
      gradeAverage,
      attended,
      unattended,
      totalMarked,
      paceDelta,
      paceLabel,
      annualAttendancePresent: academicTotals.present,
      annualAttendanceMarked,
      annualAttendanceTarget,
      annualCompletionTarget,
      completedLessonsCount,
    };
  }, [
    calendarDays,
    subjectDetails,
    gradeRows,
    academicYearStartDate,
    academicYearEndDate,
    today,
    selectedStudentId,
    filteredSubjects,
  ]);

  const subjectProgressRows = useMemo(() => {
    const now = new Date();
    const yearDurationMs = Math.max(1, academicYearEndDate.getTime() - academicYearStartDate.getTime());
    const expectedProgress = Math.max(
      0,
      Math.min(100, Math.round(((now.getTime() - academicYearStartDate.getTime()) / yearDurationMs) * 100))
    );
    return subjectDetails
      .map(({ subject, detail }) => {
        const progressRaw = detail?.progressPercent ?? subject?.progressPercent ?? 0;
        const progress = Math.max(0, Math.min(100, Math.round(Number(progressRaw) || 0)));

        const attendanceByDayForSubject = {};
        (detail?.attendanceRecords || []).forEach((record) => {
          if (
            selectedStudentId
            && record?.child_id
            && String(record.child_id) !== String(selectedStudentId)
          ) {
            return;
          }
          const day = String(record?.day_date || '').slice(0, 10);
          if (!day) return;
          const dayDate = new Date(day);
          if (Number.isNaN(dayDate.getTime())) return;
          if (dayDate < academicYearStartDate || dayDate > academicYearEndDate) return;
          if (!attendanceByDayForSubject[day]) attendanceByDayForSubject[day] = [];
          attendanceByDayForSubject[day].push(record?.status || '');
        });
        const subjectAttendanceTotals = Object.values(attendanceByDayForSubject).reduce(
          (acc, statuses) => {
            if (statuses.some((status) => status === 'absent')) {
              acc.absent += 1;
              return acc;
            }
            if (statuses.some((status) => status === 'present' || status === 'partial')) {
              acc.present += 1;
            }
            return acc;
          },
          { present: 0, absent: 0 }
        );
        const attendanceMarked = subjectAttendanceTotals.present + subjectAttendanceTotals.absent;

        const grades = (detail?.grades || []).filter((grade) => {
          if (
            selectedStudentId
            && grade?.child_id
            && String(grade.child_id) !== String(selectedStudentId)
          ) {
            return false;
          }
          return true;
        });
        const gradeLetter = grades.map((grade) => String(grade?.grade || '').trim()).find(Boolean);
        const gradePercent = grades.length > 0
          ? Math.round(
            grades.reduce((sum, grade) => {
              const score = Number(grade?.score);
              const possible = Number(grade?.possible);
              if (Number.isFinite(score) && Number.isFinite(possible) && possible > 0) {
                return sum + ((score / possible) * 100);
              }
              if (Number.isFinite(score) && score >= 0 && score <= 100) return sum + score;
              const mapped = gradeToPercent(grade?.grade);
              return sum + (mapped ?? 0);
            }, 0) / Math.max(1, grades.length)
          )
          : null;

        const eventsInYear = (detail?.events || []).filter((event) => {
          if (
            selectedStudentId
            && event?.child_id
            && String(event.child_id) !== String(selectedStudentId)
          ) {
            return false;
          }
          const start = event?.start_ts || event?.start || event?.start_local;
          if (!start) return false;
          const dt = new Date(start);
          if (Number.isNaN(dt.getTime())) return false;
          return dt >= academicYearStartDate && dt <= academicYearEndDate;
        });
        const eventsAttachedToPlanCount = eventsInYear.filter(
          (event) => !!(event?.year_plan_id || event?.source_block_id)
        ).length;

        const paceDelta = progress - expectedProgress;
        const paceLabel = !eventsAttachedToPlanCount
          ? 'Not planned'
          : paceDelta < -8
            ? 'Behind'
            : paceDelta > 8
              ? 'Ahead'
              : 'On track';
        const isFreeform = eventsAttachedToPlanCount === 0 && eventsInYear.length === 0;
        const performanceLabel = gradePercent != null
          ? `${gradePercent}%`
          : gradeLetter || '—';

        return {
          id: String(subject?.id || ''),
          subject: subject?.name || 'Subject',
          plannedLabel: isFreeform ? 'Freeform' : `${eventsAttachedToPlanCount} lessons`,
          doneLabel: isFreeform ? '—' : `${subjectAttendanceTotals.present} done`,
          paceLabel: isFreeform ? 'Not counted' : paceLabel,
          performanceLabel: isFreeform ? '—' : performanceLabel,
          hasPlan: eventsAttachedToPlanCount > 0,
          paceDelta,
        };
      })
      .filter((row) => row.id);
  }, [subjectDetails, selectedStudentId, academicYearStartDate, academicYearEndDate]);

  const needsAttention = useMemo(() => {
    const list = [];
    const worstSubject = [...subjectProgressRows].sort((a, b) => a.paceDelta - b.paceDelta)[0];
    if (worstSubject && worstSubject.paceDelta < -8) {
      list.push({
        id: 'behind-subject',
        title: `${worstSubject.subject} is behind pace`,
        fixText: 'Fix: add 1 session this week',
        actionView: 'plan-year',
      });
    }

    const noPlanSubject = subjectProgressRows.find((row) => !row.hasPlan);
    if (noPlanSubject) {
      list.push({
        id: 'no-plan-subject',
        title: `${noPlanSubject.subject} has no plan`,
        fixText: 'Fix: create plan',
        actionView: 'plan-year',
      });
    }

    if (list.length === 0) {
      list.push({
        id: 'clear',
        title: 'No urgent actions',
        fixText: 'Everything looks steady this week',
        actionView: null,
      });
    }
    return list.slice(0, 2);
  }, [subjectProgressRows]);
  const familyProgress = useMemo(() => {
    const plannedDays = Number(stats.annualAttendanceMarked) || 0;
    const plannedTargetDays = Math.max(1, Number(stats.annualAttendanceTarget) || 180);
    const plannedPercent = Math.max(0, Math.min(100, Math.round((plannedDays / plannedTargetDays) * 100)));

    const completedDays = Number(stats.annualAttendancePresent) || 0;
    const completedScheduledDays = Math.max(0, plannedDays);
    const attendancePercent = completedScheduledDays > 0
      ? Math.max(0, Math.min(100, Math.round((completedDays / completedScheduledDays) * 100)))
      : 0;

    const remainingDays = Math.max(0, plannedTargetDays - completedDays);
    const nowTs = today.getTime();
    const endTs = academicYearEndDate.getTime();
    const remainingWeeks = Math.max(1 / 7, (endTs - nowTs) / (1000 * 60 * 60 * 24 * 7));
    const paceNeededPerWeek = remainingDays / remainingWeeks;

    return {
      plannedDays,
      plannedTargetDays,
      plannedPercent,
      completedDays,
      completedScheduledDays,
      attendancePercent,
      paceLabel: stats.paceLabel || 'On track',
      paceNeededPerWeek,
    };
  }, [stats, today, academicYearEndDate]);

  const openSubjectDetails = (subjectId) => {
    if (!subjectId) return;
    if (typeof onOpenSubject === 'function') {
      onOpenSubject(subjectId);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({}, '', `/subjects/${subjectId}`);
      window.dispatchEvent(new CustomEvent('refreshSubjects'));
    }
  };

  const openPlannerView = (view) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const safeView = String(view || 'plan-year');
    window.history.pushState({}, '', `/planner?view=${safeView}`);
    window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: safeView }));
  };

  return (
    <View style={styles.page}>
      <View style={styles.content}>
      {!hideYearHeader ? (
        <View style={styles.headerRow}>
          <View style={styles.yearHeaderNavShell}>
            <TouchableOpacity
              style={styles.yearHeaderNavBtn}
              onPress={() => setSelectedAcademicYearStart((prev) => prev - 1)}
              accessibilityRole="button"
              accessibilityLabel="Previous year"
            >
              <ChevronLeft size={24} color="#9CA3AF" />
            </TouchableOpacity>
            <Text style={styles.yearHeaderTitle}>{selectedAcademicYearLabel}</Text>
            <TouchableOpacity
              style={styles.yearHeaderNavBtn}
              onPress={() => setSelectedAcademicYearStart((prev) => prev + 1)}
              accessibilityRole="button"
              accessibilityLabel="Next year"
            >
              <ChevronRight size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.mainColumns}>
        <View style={styles.leftColumn}>
          <View style={styles.familyProgressCard}>
            <View style={styles.familyProgressHeaderRow}>
              <Text style={styles.familyProgressTitle}>{possessiveStudentLabel} Progress</Text>
            </View>
            <View style={styles.familyProgressColumns}>
              <View style={styles.familyProgressCol}>
                <Text style={styles.familyProgressColLabel}>Planned</Text>
                <Text style={styles.familyProgressColValue}>
                  {familyProgress.plannedDays} / {familyProgress.plannedTargetDays} class days
                </Text>
                <Text style={styles.familyProgressColMeta}>{familyProgress.plannedPercent}% of yearly target</Text>
              </View>
              <View style={styles.familyProgressCol}>
                <Text style={styles.familyProgressColLabel}>Completed</Text>
                <Text style={styles.familyProgressColValue}>
                  {familyProgress.completedDays} / {familyProgress.completedScheduledDays} scheduled days
                </Text>
                <Text style={styles.familyProgressColMeta}>{familyProgress.attendancePercent}% attendance</Text>
              </View>
              <View style={styles.familyProgressCol}>
                <Text style={styles.familyProgressColLabel}>Pace</Text>
                <Text style={styles.familyProgressColValue}>{familyProgress.paceLabel}</Text>
                <Text style={styles.familyProgressColMeta}>
                  Need {familyProgress.paceNeededPerWeek.toFixed(1)} class days/week to finish
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.subjectTableCard}>
            <Text style={styles.sectionTitle}>{possessiveStudentLabel} Progress</Text>
            {childProgressRows.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No child progress data yet.</Text>
              </View>
            ) : (
              <View style={styles.subjectTableWrap}>
                <View style={styles.subjectTableHeaderRow}>
                  <Text style={[styles.subjectTableHeaderCell, styles.colChild]}>Child</Text>
                  <Text style={[styles.subjectTableHeaderCell, styles.colAttendance]}>Attendance</Text>
                  <Text style={[styles.subjectTableHeaderCell, styles.colGrade]}>Grades</Text>
                  <Text style={[styles.subjectTableHeaderCell, styles.colLearning]}>Learning achieved (units)</Text>
                </View>
                {childProgressRows.map((row) => (
                  <View key={row.id} style={styles.subjectTableBodyRow}>
                    <View style={styles.colChild}>
                      <Text style={styles.subjectTableSubjectText}>{row.childName}</Text>
                    </View>
                    <Text style={[styles.subjectTableBodyCell, styles.colAttendance]}>{row.attendanceLabel}</Text>
                    <Text style={[styles.subjectTableBodyCell, styles.colGrade]}>{row.gradeLabel}</Text>
                    <Text style={[styles.subjectTableBodyCell, styles.colLearning]} numberOfLines={1}>
                      {row.learningLabel}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.subjectTableCard}>
            <Text style={styles.sectionTitle}>{possessiveStudentLabel} Subject Progress</Text>
            {subjectProgressRows.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No subjects available for this student yet.</Text>
              </View>
            ) : (
              <View style={styles.subjectTableWrap}>
                <View style={styles.subjectTableHeaderRow}>
                  <Text style={[styles.subjectTableHeaderCell, styles.colSubject]}>Subject</Text>
                  <Text style={[styles.subjectTableHeaderCell, styles.colPlanned]}>Planned</Text>
                  <Text style={[styles.subjectTableHeaderCell, styles.colDone]}>Done</Text>
                  <Text style={[styles.subjectTableHeaderCell, styles.colPace]}>Pace</Text>
                  <Text style={[styles.subjectTableHeaderCell, styles.colPerformance]}>Performance</Text>
                </View>
                {subjectProgressRows.map((row) => (
                  <View key={row.id} style={styles.subjectTableBodyRow}>
                    <TouchableOpacity
                      style={styles.colSubject}
                      onPress={() => openSubjectDetails(row.id)}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Text style={styles.subjectTableSubjectText}>{row.subject}</Text>
                    </TouchableOpacity>
                    <Text style={[styles.subjectTableBodyCell, styles.colPlanned]}>{row.plannedLabel}</Text>
                    <Text style={[styles.subjectTableBodyCell, styles.colDone]}>{row.doneLabel}</Text>
                    <Text style={[styles.subjectTableBodyCell, styles.colPace]}>{row.paceLabel}</Text>
                    <Text style={[styles.subjectTableBodyCell, styles.colPerformance]}>{row.performanceLabel}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

        </View>

        <View style={styles.rightColumn}>
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>{possessiveStudentLabel} Needs Attention</Text>
            </View>
            <View style={styles.flagList}>
              {needsAttention.map((flag) => (
                <View key={flag.id} style={styles.flagRow}>
                  <View style={styles.flagIcon} />
                  <View style={styles.flagBody}>
                    <Text style={styles.flagType}>⚠ {flag.title}</Text>
                    <Text style={styles.flagText}>{flag.fixText}</Text>
                  </View>
                  {flag.actionView ? (
                    <TouchableOpacity
                      style={styles.flagFixBtn}
                      onPress={() => openPlannerView(flag.actionView)}
                    >
                      <Text style={styles.flagFixBtnText}>Fix</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  content: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 24,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 14,
  },

  yearHeaderNavShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  yearHeaderNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },

  yearHeaderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
    ...WEB_HEADING_FONT,
  },

  studentTabs: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },

  studentChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },

  studentChipActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },

  studentChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
    ...WEB_HEADING_FONT,
  },

  studentChipTextActive: {
    color: '#1F2937',
    fontWeight: '600',
  },

  familyProgressCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },

  familyProgressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },

  familyProgressTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.2,
    ...WEB_HEADING_FONT,
  },

  familyProgressColumns: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    flexWrap: 'wrap',
  },

  familyProgressCol: {
    flex: 1,
    minWidth: 220,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },

  familyProgressColLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    ...WEB_HEADING_FONT,
  },

  familyProgressColValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 26,
    ...WEB_HEADING_FONT,
  },

  familyProgressColMeta: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 18,
    ...WEB_BODY_FONT,
  },

  mainColumns: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },

  leftColumn: {
    flex: 7,
    gap: 24,
  },

  rightColumn: {
    flex: 3,
    gap: 24,
  },

  card: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    padding: 16,
    shadowOpacity: 0,
  },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },

  sectionHeaderRowCompact: {
    marginBottom: 6,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#111827',
    ...WEB_HEADING_FONT,
  },

  sectionMeta: {
    marginTop: 2,
    fontSize: 13,
    color: '#6B7280',
    ...WEB_BODY_FONT,
  },

  sectionButton: {
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  sectionButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    ...WEB_HEADING_FONT,
  },

  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },

  dayCell: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dayAttended: {
    backgroundColor: '#CFFAFE',
  },

  dayUnattended: {
    backgroundColor: '#FEE2E2',
  },

  dayNoEvents: {
    backgroundColor: '#F3F4F6',
  },

  dayText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    ...WEB_BODY_FONT,
  },

  dayTextAttended: {
    color: '#0369A1',
  },

  dayTextUnattended: {
    color: '#B91C1C',
  },

  attendanceSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },

  legendText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#4B5563',
    ...WEB_BODY_FONT,
  },

  flagList: {
    gap: 7,
  },

  flagRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFDF7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  flagIcon: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#F59E0B',
    marginTop: 6,
  },

  flagBody: {
    flex: 1,
  },

  flagType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    ...WEB_HEADING_FONT,
  },

  flagText: {
    marginTop: 2,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
    ...WEB_BODY_FONT,
  },

  flagFixBtn: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: '#EEF2FF',
  },

  flagFixBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#4F46E5',
    ...WEB_HEADING_FONT,
  },

  subjectTableCard: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  subjectTableWrap: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
  },
  subjectTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  subjectTableHeaderCell: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#6B7280',
    letterSpacing: 0.3,
    ...WEB_HEADING_FONT,
  },
  subjectTableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  subjectTableSubjectText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    ...WEB_HEADING_FONT,
  },
  subjectTableBodyCell: {
    fontSize: 14,
    color: '#374151',
    ...WEB_BODY_FONT,
  },
  colSubject: {
    flex: 2.1,
  },
  colPlanned: {
    flex: 1.5,
  },
  colDone: {
    flex: 1.2,
  },
  colPace: {
    flex: 1.3,
  },
  colPerformance: {
    flex: 1.1,
  },
  colChild: {
    flex: 1.3,
  },
  colAttendance: {
    flex: 1.5,
  },
  colGrade: {
    flex: 1,
  },
  colLearning: {
    flex: 2.7,
  },

  emptyState: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    padding: 16,
  },

  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    ...WEB_BODY_FONT,
  },
});
