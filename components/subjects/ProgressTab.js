import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';

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
    return students[0]?.id || null;
  }, [students, selectedChildFilter]);
  const [selectedStudentId, setSelectedStudentId] = useState(preferredStudentId);
  const [selectedMode, setSelectedMode] = useState('month');
  useEffect(() => {
    if (!students.length) {
      setSelectedStudentId(null);
      return;
    }
    setSelectedStudentId((prev) => {
      if (prev && students.some((student) => String(student.id) === String(prev))) {
        return prev;
      }
      return preferredStudentId;
    });
  }, [students, preferredStudentId]);

  const today = useMemo(() => new Date(), []);
  const activeMonthDate = useMemo(
    () =>
      selectedMode === 'year'
        ? new Date(today.getFullYear(), today.getMonth(), 1)
        : new Date(today.getFullYear(), today.getMonth(), 1),
    [selectedMode, today]
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
      : 0;

    return {
      attendanceRate,
      completionRate,
      gradeAverage,
      attended,
      unattended,
      totalMarked,
    };
  }, [calendarDays, subjectDetails, gradeRows]);

  const flags = useMemo(() => {
    const list = [];
    if (stats.unattended > 0) {
      list.push({
        id: 'missed-days',
        type: 'Missed days',
        text: `${stats.unattended} unattended learning day${stats.unattended === 1 ? '' : 's'} this month.`,
      });
    }
    if (stats.completionRate < 75) {
      list.push({
        id: 'gap',
        type: 'Gap',
        text: 'Completion pace is below target. Consider rebalancing this week.',
      });
    }
    if (busiestWeekday) {
      list.push({
        id: 'overload',
        type: 'Overload',
        text: `${busiestWeekday} has the highest scheduled load this month.`,
      });
    }
    if (list.length === 0) {
      list.push({
        id: 'clear',
        type: 'No major flags',
        text: 'Attendance and completion look steady for this period.',
      });
    }
    return list.slice(0, 3);
  }, [stats.unattended, stats.completionRate, busiestWeekday]);

  return (
    <View style={styles.page}>
      <View style={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.eyebrow}>PROGRESS</Text>
          <Text style={styles.pageTitle}>Attendance, grades & analytics</Text>
          <Text style={styles.pageSubtitle}>
            Track what happened, how students are doing, and where attention is needed.
          </Text>
        </View>

        <View style={styles.studentTabs}>
          {students.map((student) => {
            const active = selectedStudentId === student.id;
            return (
              <TouchableOpacity
                key={student.id}
                onPress={() => setSelectedStudentId(student.id)}
                style={[styles.studentChip, active && styles.studentChipActive]}
              >
                <Text style={[styles.studentChipText, active && styles.studentChipTextActive]}>
                  {student.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.summaryGrid}>
        <MetricCard
          label="Attendance"
          value={`${stats.attendanceRate}%`}
          subtext={`${stats.attended} attended · ${stats.unattended} missed`}
        />
        <MetricCard
          label="Completion"
          value={`${stats.completionRate}%`}
          subtext="Lessons completed against plan"
        />
        <MetricCard
          label="Grade Avg"
          value={`${stats.gradeAverage}%`}
          subtext="Across graded work"
        />
      </View>

      <View style={styles.twoColumnGrid}>
        <View style={[styles.card, styles.largeCard]}>
          <SectionHeader
            title="Attendance"
            subtitle="Mark learning days and review attendance by month."
            actionLabel="Mark range"
          />

          <View style={styles.modeTabs}>
            {['month', 'year'].map((mode) => {
              const active = selectedMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setSelectedMode(mode)}
                  style={[styles.modeChip, active && styles.modeChipActive]}
                >
                  <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>
                    {mode === 'month' ? 'Month' : 'Year'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.calendarHeader}>
          <Text style={styles.calendarTitle}>{formatMonthYear(activeMonthDate)}</Text>
            <Text style={styles.calendarHint}>Tap a day to mark or edit attendance.</Text>
          </View>

          <View style={styles.dayGrid}>
            {calendarDays.map((day) => (
              <TouchableOpacity
                key={day.id}
                style={[
                  styles.dayCell,
                  day.status === 'attended' && styles.dayAttended,
                  day.status === 'unattended' && styles.dayUnattended,
                  day.status === 'noEvents' && styles.dayNoEvents,
                ]}
              >
                <Text
                  style={[
                    styles.dayText,
                    day.status === 'attended' && styles.dayTextAttended,
                    day.status === 'unattended' && styles.dayTextUnattended,
                  ]}
                >
                  {day.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.legendRow}>
            <LegendDot color="#BFE3FF" label="Attended" />
            <LegendDot color="#FFC7C7" label="Unattended" />
            <LegendDot color="#F2F5FA" label="No events" />
          </View>
        </View>

        <View style={styles.card}>
          <SectionHeader
            title="Grades"
            subtitle="Recent graded work and averages."
            actionLabel="Add grade"
          />

          <View style={styles.gradeList}>
            {gradeRows.map((grade) => (
              <View key={grade.id} style={styles.gradeRow}>
                <View style={styles.gradeInfo}>
                  <Text style={styles.gradeSubject}>{grade.subject}</Text>
                  <Text style={styles.gradeAssignment}>{grade.assignment}</Text>
                </View>
                <View style={styles.gradePill}>
                  <Text style={styles.gradeScore}>{grade.score}%</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.twoColumnGrid}>
        <View style={styles.card}>
          <SectionHeader
            title="Trends"
            subtitle="Weekly and monthly progress patterns."
          />

          <View style={styles.trendList}>
            <TrendBar label="Attendance" value={stats.attendanceRate} />
            <TrendBar label="Lesson completion" value={stats.completionRate} />
            <TrendBar label="Grade average" value={stats.gradeAverage} />
          </View>
        </View>

        <View style={styles.card}>
          <SectionHeader
            title="Flags"
            subtitle="Missed days, gaps, and overload warnings."
          />

          <View style={styles.flagList}>
            {flags.map((flag) => (
              <View key={flag.id} style={styles.flagRow}>
                <View style={styles.flagIcon} />
                <View>
                  <Text style={styles.flagType}>{flag.type}</Text>
                  <Text style={styles.flagText}>{flag.text}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>
      </View>
    </View>
  );
}

function MetricCard({ label, value, subtext }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricSubtext}>{subtext}</Text>
    </View>
  );
}

function SectionHeader({ title, subtitle, actionLabel }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>

      {actionLabel ? (
        <TouchableOpacity style={styles.sectionButton}>
          <Text style={styles.sectionButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function TrendBar({ label, value }) {
  return (
    <View style={styles.trendRow}>
      <View style={styles.trendTopRow}>
        <Text style={styles.trendLabel}>{label}</Text>
        <Text style={styles.trendValue}>{value}%</Text>
      </View>
      <View style={styles.trendTrack}>
        <View style={[styles.trendFill, { width: `${Math.min(value, 100)}%` }]} />
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
    gap: 12,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 18,
  },

  eyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
    color: '#8B6CFF',
    marginBottom: 6,
  },

  pageTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#1F2937',
  },

  pageSubtitle: {
    marginTop: 6,
    fontSize: 14,
    color: '#7B8798',
    maxWidth: 620,
    lineHeight: 20,
  },

  studentTabs: {
    flexDirection: 'row',
    backgroundColor: '#F7F8FC',
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E8EDF5',
  },

  studentChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
  },

  studentChipActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#8EA4C8',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },

  studentChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#8A95A8',
  },

  studentChipTextActive: {
    color: '#1F2937',
  },

  summaryGrid: {
    flexDirection: 'row',
    gap: 14,
  },

  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EDF5',
    borderRadius: 24,
    padding: 18,
    minHeight: 104,
    shadowColor: '#8EA4C8',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },

  metricLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#8A95A8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  metricValue: {
    marginTop: 8,
    fontSize: 30,
    fontWeight: '900',
    color: '#1F2937',
  },

  metricSubtext: {
    marginTop: 4,
    fontSize: 13,
    color: '#7B8798',
  },

  twoColumnGrid: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'stretch',
  },

  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E8EDF5',
    padding: 16,
    shadowColor: '#8EA4C8',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },

  largeCard: {
    flex: 1.45,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1F2937',
  },

  sectionSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: '#7B8798',
    lineHeight: 18,
  },

  sectionButton: {
    borderRadius: 999,
    backgroundColor: '#F7F8FC',
    borderWidth: 1,
    borderColor: '#E3E8F1',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  sectionButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#566276',
  },

  modeTabs: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: '#F7F8FC',
    borderRadius: 999,
    padding: 4,
    marginBottom: 10,
  },

  modeChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
  },

  modeChipActive: {
    backgroundColor: '#EDE7FF',
  },

  modeChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#8A95A8',
  },

  modeChipTextActive: {
    color: '#7B61FF',
  },

  calendarHeader: {
    marginBottom: 8,
  },

  calendarTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1F2937',
  },

  calendarHint: {
    marginTop: 3,
    fontSize: 12,
    color: '#8A95A8',
  },

  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  dayCell: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  dayAttended: {
    backgroundColor: '#BFE3FF',
  },

  dayUnattended: {
    backgroundColor: '#FFC7C7',
  },

  dayNoEvents: {
    backgroundColor: '#F2F5FA',
  },

  dayText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#6B7280',
  },

  dayTextAttended: {
    color: '#256B9A',
  },

  dayTextUnattended: {
    color: '#9B3A3A',
  },

  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 10,
  },

  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },

  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
  },

  legendText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8A95A8',
  },

  gradeList: {
    gap: 8,
  },

  gradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFD',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#EEF2F7',
  },

  gradeInfo: {
    flex: 1,
    paddingRight: 10,
  },

  gradeSubject: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1F2937',
  },

  gradeAssignment: {
    marginTop: 3,
    fontSize: 12,
    color: '#7B8798',
  },

  gradePill: {
    backgroundColor: '#EAF8EF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  gradeScore: {
    fontSize: 13,
    fontWeight: '900',
    color: '#2F8A55',
  },

  trendList: {
    gap: 12,
  },

  trendRow: {
    gap: 8,
  },

  trendTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  trendLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#566276',
  },

  trendValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1F2937',
  },

  trendTrack: {
    height: 9,
    borderRadius: 999,
    backgroundColor: '#F0F3F8',
    overflow: 'hidden',
  },

  trendFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#B9A7FF',
  },

  flagList: {
    gap: 8,
  },

  flagRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FFF9F2',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F8E7CF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },

  flagIcon: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#F5B86B',
    marginTop: 4,
  },

  flagType: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1F2937',
  },

  flagText: {
    marginTop: 3,
    fontSize: 12,
    color: '#7B8798',
    lineHeight: 17,
  },
});
