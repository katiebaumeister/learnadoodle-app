import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';

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

function formatMonthYear(dateObj) {
  return dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function ProgressTab({
  children = [],
  filteredSubjects = [],
  subjectDetailCache = {},
  selectedChildFilter = 'all',
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

  const today = useMemo(() => new Date(), []);
  const presentAcademicYearStart = useMemo(
    () => ((today.getMonth() + 1 >= 8) ? today.getFullYear() : today.getFullYear() - 1),
    [today]
  );
  const [selectedAcademicYearStart, setSelectedAcademicYearStart] = useState(presentAcademicYearStart);
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

  const busiestWeekday = useMemo(() => {
    const labels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const counts = {};
    subjectDetails.forEach(({ detail }) => {
      (detail?.events || []).forEach((event) => {
        const start = event?.start_ts || event?.start || event?.start_local;
        if (!start) return;
        if (
          selectedStudentId
          && event?.child_id
          && String(event.child_id) !== String(selectedStudentId)
        ) {
          return;
        }
        const date = new Date(start);
        if (Number.isNaN(date.getTime())) return;
        if (date < monthStart || date > monthEnd) return;
        const idx = date.getDay();
        counts[idx] = (counts[idx] || 0) + 1;
      });
    });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!best) return null;
    return labels[Number(best[0])] || null;
  }, [subjectDetails, selectedStudentId, monthStart, monthEnd]);

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
        let attendedMarkedCount = 0;
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
          if (record?.status === 'present' || record?.status === 'partial') {
            attendedMarkedCount += 1;
          }
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
        const totalEventsCount = eventsInYear.length;
        const eventsAttachedToPlanCount = eventsInYear.filter(
          (event) => !!(event?.year_plan_id || event?.source_block_id)
        ).length;

        const paceDelta = progress - expectedProgress;

        return {
          id: String(subject?.id || ''),
          subject: subject?.name || 'Subject',
          progress,
          childIds: Array.isArray(subject?.assignedChildren)
            ? subject.assignedChildren.filter(Boolean)
            : [],
          childNames: Array.isArray(subject?.assignedChildren)
            ? subject.assignedChildren
              .map((childId) => children.find((child) => String(child?.id) === String(childId)))
              .filter(Boolean)
              .map((child) => child?.first_name || child?.name || 'Child')
              .join(', ')
            : '',
          planEventsLine: eventsAttachedToPlanCount > 0
            ? `${eventsAttachedToPlanCount} event${eventsAttachedToPlanCount === 1 ? '' : 's'} attached to plan`
            : 'No plan created',
          totalEventsLine: `${totalEventsCount} event${totalEventsCount === 1 ? '' : 's'} total attached to this subject`,
          attendedEventsLine: `${attendedMarkedCount} marked as attended`,
          paceDelta,
        };
      })
      .filter((row) => row.id);
  }, [subjectDetails, selectedStudentId, academicYearStartDate, academicYearEndDate, children]);

  const flags = useMemo(() => {
    const list = [];
    const worstSubject = [...subjectProgressRows].sort((a, b) => a.paceDelta - b.paceDelta)[0];
    if (worstSubject && worstSubject.paceDelta < -8) {
      list.push({
        id: 'behind-subject',
        type: `Behind in ${worstSubject.subject}`,
        text: 'Suggestion: Add 1 session this week.',
        actionView: 'plan-year',
      });
    }
    if (busiestWeekday) {
      list.push({
        id: 'overload',
        type: `${busiestWeekday} overload`,
        text: 'Suggestion: Move 1 lesson to a lighter day.',
        actionView: 'month',
      });
    }
    if (stats.unattended > 0) {
      list.push({
        id: 'attendance-gap',
        type: `${stats.unattended} missed day${stats.unattended === 1 ? '' : 's'}`,
        text: 'Suggestion: Mark attendance and close missing days.',
        actionView: 'attendance',
      });
    }
    if (list.length === 0) {
      list.push({
        id: 'clear',
        type: 'No major flags',
        text: 'Everything looks steady this month.',
        actionView: null,
      });
    }
    return list.slice(0, 3);
  }, [stats.unattended, busiestWeekday, subjectProgressRows]);

  const trends = useMemo(() => ([
    { id: 'attendance', label: 'Attendance', value: stats.attendanceRate, display: `${stats.attendanceRate}%` },
    { id: 'completion', label: 'Completion', value: stats.completionRate, display: `${stats.completionRate}%` },
    {
      id: 'grades',
      label: 'Grades',
      value: stats.gradeAverage == null ? 0 : stats.gradeAverage,
      display: stats.gradeAverage == null ? '—' : `${stats.gradeAverage}%`,
    },
  ]), [stats.attendanceRate, stats.completionRate, stats.gradeAverage]);

  const monthlyNoEventsCount = useMemo(
    () => calendarDays.filter((day) => day.status === 'noEvents').length,
    [calendarDays]
  );

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

      <View style={styles.mainColumns}>
        <View style={styles.leftColumn}>
          <View style={[styles.sectionHeaderRow, styles.sectionHeaderRowCompact]}>
            <Text style={styles.sectionTitle}>Progress by Subject</Text>
          </View>
          <View style={styles.subjectCardsList}>
            {subjectProgressRows.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No subjects available for this student yet.</Text>
              </View>
            ) : (
              subjectProgressRows.map((row) => (
                <SubjectProgressCard
                  key={row.id}
                  subject={row.subject}
                  childIds={row.childIds}
                  childNames={row.childNames}
                  familyChildren={children}
                  planEventsLine={row.planEventsLine}
                  totalEventsLine={row.totalEventsLine}
                  attendedEventsLine={row.attendedEventsLine}
                  onViewDetails={() => openSubjectDetails(row.id)}
                />
              ))
            )}
          </View>

        </View>

        <View style={styles.rightColumn}>
          <View style={styles.card}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Flags</Text>
            </View>
            <View style={styles.flagList}>
              {flags.map((flag) => (
                <View key={flag.id} style={styles.flagRow}>
                  <View style={styles.flagIcon} />
                  <View style={styles.flagBody}>
                    <Text style={styles.flagType}>⚠ {flag.type}</Text>
                    <Text style={styles.flagText}>{flag.text}</Text>
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

          <View style={styles.trendsBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Trends</Text>
            </View>
            <View style={styles.trendList}>
              {trends.map((trend) => (
                <MiniTrendRow
                  key={trend.id}
                  label={trend.label}
                  value={trend.value}
                  display={trend.display}
                />
              ))}
            </View>
          </View>
        </View>
      </View>
      </View>
    </View>
  );
}

function MetricCard({ label, value, subtext, isLast = false }) {
  return (
    <View style={[styles.metricBlock, isLast && styles.metricBlockLast]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricSubtext}>{subtext}</Text>
    </View>
  );
}

function SubjectProgressCard({
  subject,
  childIds = [],
  childNames = '',
  familyChildren = [],
  planEventsLine,
  totalEventsLine,
  attendedEventsLine,
  onViewDetails,
}) {
  return (
    <View style={styles.subjectCard}>
      <Text style={styles.subjectCardTitle}>{subject}</Text>
      {childIds.length > 0 ? (
        <View style={styles.subjectCardChildrenRow}>
          <ChildAvatarCluster
            childIds={childIds}
            familyChildren={familyChildren}
            size={20}
            overlap={-6}
          />
          <Text style={styles.subjectCardChildrenText} numberOfLines={1}>
            {childNames}
          </Text>
        </View>
      ) : null}
      <View style={styles.subjectStatsRow}>
        <Text style={styles.subjectStat}>{planEventsLine}</Text>
        <Text style={styles.subjectStat}>{totalEventsLine}</Text>
        <Text style={styles.subjectStat}>{attendedEventsLine}</Text>
      </View>
      <TouchableOpacity style={styles.viewDetailsButton} onPress={onViewDetails}>
        <Text style={styles.viewDetailsButtonText}>View details</Text>
      </TouchableOpacity>
    </View>
  );
}

function MiniTrendRow({ label, value, display }) {
  const normalized = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const filled = Math.round(normalized / 20);
  const blocks = Array.from({ length: 5 }, (_, idx) => (idx < filled ? '▓' : '░')).join('');
  return (
    <View style={styles.trendRow}>
      <View style={styles.trendTopRow}>
        <Text style={styles.trendLabel}>{label}</Text>
        <Text style={styles.trendValue}>{display}</Text>
      </View>
      <Text style={styles.trendBlocks}>{blocks}</Text>
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
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    ...WEB_HEADING_FONT,
  },

  studentChipTextActive: {
    color: '#1F2937',
    fontWeight: '600',
  },

  metricsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },

  metricBlock: {
    flex: 1,
    minHeight: 88,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'center',
  },

  metricBlockLast: {
    borderRightWidth: 1,
  },

  metricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    ...WEB_HEADING_FONT,
  },

  metricValue: {
    marginTop: 4,
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 34,
    ...WEB_HEADING_FONT,
  },

  metricSubtext: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
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
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    ...WEB_HEADING_FONT,
  },

  sectionMeta: {
    marginTop: 2,
    fontSize: 12,
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
    fontSize: 12,
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
    fontSize: 10,
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
    fontSize: 12,
    fontWeight: '400',
    color: '#4B5563',
    ...WEB_BODY_FONT,
  },

  trendList: {
    gap: 10,
  },

  trendRow: {
    gap: 3,
  },

  trendTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  trendLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    ...WEB_HEADING_FONT,
  },

  trendValue: {
    fontSize: 12,
    fontWeight: '500',
    color: '#111827',
    ...WEB_BODY_FONT,
  },

  trendBlocks: {
    fontSize: 12,
    color: '#6366F1',
    letterSpacing: 0.8,
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
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    ...WEB_HEADING_FONT,
  },

  flagText: {
    marginTop: 2,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
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
    fontSize: 12,
    fontWeight: '500',
    color: '#4F46E5',
    ...WEB_HEADING_FONT,
  },

  attendanceBlock: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 16,
  },

  trendsBlock: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
    paddingTop: 14,
  },

  subjectCardsList: {
    gap: 12,
  },

  subjectCard: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },

  subjectCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    ...WEB_HEADING_FONT,
  },

  subjectCardChildrenRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  subjectCardChildrenText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    ...WEB_BODY_FONT,
  },

  subjectProgressTrack: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#EEF2FF',
    overflow: 'hidden',
  },

  subjectProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#8B5CF6',
  },

  subjectProgressMeta: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    ...WEB_BODY_FONT,
  },

  subjectNextLine: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
    ...WEB_BODY_FONT,
  },

  subjectStatsRow: {
    marginTop: 10,
    gap: 4,
  },

  subjectStat: {
    fontSize: 12,
    color: '#374151',
    ...WEB_BODY_FONT,
  },

  viewDetailsButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },

  viewDetailsButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4F46E5',
    ...WEB_HEADING_FONT,
  },

  emptyState: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    borderRadius: 12,
    padding: 16,
  },

  emptyStateText: {
    fontSize: 13,
    color: '#6B7280',
    ...WEB_BODY_FONT,
  },
});
