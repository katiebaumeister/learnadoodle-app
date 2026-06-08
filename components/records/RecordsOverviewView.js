import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  TrendingUp,
  BookOpen,
  Award,
  CheckCircle2,
  Clock,
  CalendarDays,
  Download,
  ChevronRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { familyCardStyle, familyStyles, FAMILY_CARD_GAP } from '../family/familyDesignTokens';
import { formatSchoolYearLabel } from '../family/familySectionRouting';
import { formatActivityDayLabel, formatActivityTime } from './recordsSectionRouting';

const SUBJECT_BAR_COLORS = ['#2563EB', '#059669', '#7C3AED', '#EA580C', '#0891B2', '#DB2777'];

function StatCard({ icon: Icon, iconColor, iconBg, value, meta, label, actionLabel, onAction }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      {meta ? <Text style={styles.statMeta}>{meta}</Text> : null}
      <Text style={styles.statLabel}>{label}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
          <Text style={styles.statAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function SectionCard({ title, actionLabel, onAction, children, style }) {
  return (
    <View style={[styles.sectionCard, style]}>
      <View style={styles.sectionCardHeader}>
        <Text style={styles.sectionCardTitle}>{title}</Text>
        {actionLabel && onAction ? (
          <TouchableOpacity onPress={onAction} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
            <Text style={styles.sectionCardAction}>{actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function StatusBadge({ label, tone = 'green' }) {
  const colors = {
    green: { bg: 'rgba(5, 150, 105, 0.12)', text: '#059669' },
    blue: { bg: 'rgba(37, 99, 235, 0.12)', text: '#2563EB' },
    orange: { bg: 'rgba(234, 88, 12, 0.12)', text: '#EA580C' },
  };
  const c = colors[tone] || colors.green;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{label}</Text>
    </View>
  );
}

function subjectProgressPercent(subject) {
  const pct = subject?.progressPercent ?? subject?.progress_percent;
  if (pct != null && Number.isFinite(Number(pct))) return Math.round(Number(pct));
  const completed = Number(subject?.progressCompleted ?? subject?.progress_completed ?? 0);
  const total = Number(subject?.progressTotal ?? subject?.progress_total ?? 0);
  if (total > 0) return Math.round((completed / total) * 100);
  return 0;
}

export default function RecordsOverviewView({
  familyId,
  subjects = [],
  academicYears = [],
  onNavigateSection,
  onTabChange,
}) {
  const [completedCount, setCompletedCount] = useState(null);
  const [hoursLogged, setHoursLogged] = useState(null);
  const [daysLogged, setDaysLogged] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [pendingReviews, setPendingReviews] = useState(null);

  const currentYear = useMemo(() => {
    if (!Array.isArray(academicYears) || academicYears.length === 0) return null;
    const today = new Date().toISOString().slice(0, 10);
    const inRange = academicYears.find((year) => {
      const start = year?.start_date ? String(year.start_date).slice(0, 10) : '';
      const end = year?.end_date ? String(year.end_date).slice(0, 10) : '';
      return start && end && today >= start && today <= end;
    });
    return inRange || academicYears[0];
  }, [academicYears]);

  const yearStart = currentYear?.start_date
    ? String(currentYear.start_date).slice(0, 10)
    : `${new Date().getFullYear()}-01-01`;
  const yearEnd = currentYear?.end_date
    ? String(currentYear.end_date).slice(0, 10)
    : `${new Date().getFullYear()}-12-31`;

  const activeSubjects = useMemo(() => {
    const list = Array.isArray(subjects) ? subjects : [];
    const seen = new Set();
    return list.filter((s) => {
      const id = String(s?.id || '');
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [subjects]);

  const overallProgress = useMemo(() => {
    if (activeSubjects.length === 0) return null;
    const sum = activeSubjects.reduce((acc, s) => acc + subjectProgressPercent(s), 0);
    return Math.round(sum / activeSubjects.length);
  }, [activeSubjects]);

  const progressBySubject = useMemo(
    () =>
      [...activeSubjects]
        .sort((a, b) => subjectProgressPercent(b) - subjectProgressPercent(a))
        .slice(0, 6),
    [activeSubjects]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!familyId) return;
      try {
        const since = new Date();
        since.setDate(since.getDate() - 14);
        const sinceIso = since.toISOString();

        const [eventsRes, attendanceRes, assignmentsRes, yearCompletedRes] = await Promise.all([
          supabase
            .from('events')
            .select('id, title, subject_id, status, updated_at, start_ts')
            .eq('family_id', familyId)
            .is('deleted_at', null)
            .gte('updated_at', sinceIso)
            .in('status', ['done', 'completed', 'complete'])
            .order('updated_at', { ascending: false })
            .limit(8),
          supabase
            .from('attendance_records')
            .select('day_date, minutes, status')
            .eq('family_id', familyId)
            .gte('day_date', yearStart)
            .lte('day_date', yearEnd),
          supabase
            .from('assignments')
            .select('id', { count: 'exact', head: true })
            .eq('family_id', familyId)
            .eq('status', 'submitted'),
          supabase
            .from('events')
            .select('id', { count: 'exact', head: true })
            .eq('family_id', familyId)
            .is('deleted_at', null)
            .gte('start_ts', `${yearStart}T00:00:00`)
            .lte('start_ts', `${yearEnd}T23:59:59`)
            .in('status', ['done', 'completed', 'complete']),
        ]);

        if (cancelled) return;

        const attendanceRows = attendanceRes.data || [];
        const uniqueDays = new Set(
          attendanceRows
            .map((r) => String(r.day_date || '').slice(0, 10))
            .filter(Boolean)
        );
        setDaysLogged(uniqueDays.size);
        const totalMinutes = attendanceRows.reduce((sum, r) => sum + (Number(r.minutes) || 0), 0);
        setHoursLogged(totalMinutes > 0 ? Math.round(totalMinutes / 60) : 0);

        const completedEvents = yearCompletedRes.count ?? (eventsRes.data || []).length;
        setCompletedCount(completedEvents);
        setPendingReviews(assignmentsRes.count ?? 0);

        const subjectNameById = new Map(
          activeSubjects.map((s) => [String(s.id), s.name || 'Subject'])
        );
        setRecentActivity(
          (eventsRes.data || []).slice(0, 5).map((ev) => ({
            id: ev.id,
            title: ev.title || 'Lesson completed',
            subject: subjectNameById.get(String(ev.subject_id)) || 'Learning',
            subtitle: ev.title || 'Lesson completed',
            status: 'Completed',
            tone: 'green',
            time: ev.updated_at || ev.start_ts,
          }))
        );
      } catch (_) {
        if (!cancelled) {
          setCompletedCount(null);
          setHoursLogged(null);
          setDaysLogged(null);
          setRecentActivity([]);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [familyId, yearStart, yearEnd, activeSubjects]);

  const yearLabel = currentYear ? formatSchoolYearLabel(currentYear) : 'This school year';

  const groupedActivity = useMemo(() => {
    const groups = [];
    const indexByDay = new Map();
    recentActivity.forEach((item) => {
      const dayKey = item.time ? String(item.time).slice(0, 10) : 'unknown';
      const dayLabel = formatActivityDayLabel(item.time);
      if (!indexByDay.has(dayKey)) {
        indexByDay.set(dayKey, groups.length);
        groups.push({ dayKey, dayLabel, items: [] });
      }
      groups[indexByDay.get(dayKey)].items.push(item);
    });
    return groups;
  }, [recentActivity]);

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <StatCard
          icon={TrendingUp}
          iconColor="#059669"
          iconBg="rgba(5, 150, 105, 0.12)"
          value={overallProgress != null ? `${overallProgress}%` : '—'}
          meta={overallProgress != null && overallProgress >= 70 ? 'On track' : 'In progress'}
          label="Overall Progress"
        />
        <StatCard
          icon={BookOpen}
          iconColor="#7C3AED"
          iconBg="rgba(124, 58, 237, 0.12)"
          value={String(activeSubjects.length)}
          meta="Active this year"
          label={activeSubjects.length === 1 ? 'Subject' : 'Subjects'}
          actionLabel="View all subjects"
          onAction={() => onTabChange?.('subjects', 'subjects')}
        />
        <StatCard
          icon={Award}
          iconColor="#EA580C"
          iconBg="rgba(234, 88, 12, 0.12)"
          value="—"
          meta="Badges earned"
          label="Achievements"
          actionLabel="View achievements"
          onAction={() => onNavigateSection?.('achievements')}
        />
        <StatCard
          icon={CheckCircle2}
          iconColor="#2563EB"
          iconBg="rgba(37, 99, 235, 0.12)"
          value={completedCount != null ? String(completedCount) : '—'}
          meta="Lessons & activities"
          label="Completed"
          actionLabel="View details"
          onAction={() => onNavigateSection?.('documents')}
        />
      </View>

      <View style={styles.twoColRow}>
        <SectionCard
          title="Recent Activity"
          actionLabel="View all activity"
          onAction={() => onNavigateSection?.('documents')}
        >
          {groupedActivity.length === 0 ? (
            <Text style={familyStyles.emptyText}>No recent activity yet.</Text>
          ) : (
            groupedActivity.map((group) => (
              <View key={group.dayKey}>
                <Text style={styles.activityDayLabel}>{group.dayLabel}</Text>
                {group.items.map((item, index) => (
                  <View key={item.id}>
                    {index > 0 ? <View style={familyStyles.rowDivider} /> : null}
                    <View style={styles.activityRow}>
                      <View style={styles.activityIcon}>
                        <BookOpen size={14} color="#2563EB" />
                      </View>
                      <View style={styles.activityText}>
                        <Text style={styles.activityTitle}>
                          {item.subject} — {item.subtitle}
                        </Text>
                        <Text style={styles.activityMeta}>{item.subject}</Text>
                      </View>
                      <View style={styles.activityRight}>
                        <StatusBadge label={item.status} tone={item.tone} />
                        <Text style={styles.activityTime}>
                          {item.time ? formatActivityTime(item.time) : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}
        </SectionCard>

        <SectionCard
          title={`Year Overview (${yearLabel})`}
          actionLabel="View year summary"
          onAction={() => onNavigateSection?.('progress-reports')}
        >
          <View style={styles.yearStatsGrid}>
            <View style={styles.yearStat}>
              <CheckCircle2 size={16} color="#059669" />
              <Text style={styles.yearStatValue}>{completedCount ?? '—'}</Text>
              <Text style={styles.yearStatLabel}>Lessons Completed</Text>
            </View>
            <View style={styles.yearStat}>
              <Clock size={16} color="#2563EB" />
              <Text style={styles.yearStatValue}>{hoursLogged ?? '—'}</Text>
              <Text style={styles.yearStatLabel}>Hours Logged</Text>
            </View>
            <View style={styles.yearStat}>
              <Award size={16} color="#EA580C" />
              <Text style={styles.yearStatValue}>—</Text>
              <Text style={styles.yearStatLabel}>Achievements Earned</Text>
            </View>
            <View style={styles.yearStat}>
              <CalendarDays size={16} color="#7C3AED" />
              <Text style={styles.yearStatValue}>{daysLogged ?? '—'}</Text>
              <Text style={styles.yearStatLabel}>Days of Learning</Text>
            </View>
          </View>
        </SectionCard>
      </View>

      <View style={styles.twoColRow}>
        <SectionCard
          title="Progress by Subject"
          actionLabel="View full report"
          onAction={() => onNavigateSection?.('progress-reports')}
        >
          {progressBySubject.length === 0 ? (
            <Text style={familyStyles.emptyText}>Add subjects to see progress.</Text>
          ) : (
            progressBySubject.map((subject, index) => {
              const pct = subjectProgressPercent(subject);
              const barColor = SUBJECT_BAR_COLORS[index % SUBJECT_BAR_COLORS.length];
              return (
                <View key={subject.id}>
                  {index > 0 ? <View style={familyStyles.rowDivider} /> : null}
                  <View style={styles.subjectRow}>
                    <Text style={styles.subjectName}>{subject.name}</Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%`, backgroundColor: barColor }]} />
                    </View>
                    <Text style={styles.subjectPct}>{pct}%</Text>
                  </View>
                </View>
              );
            })
          )}
        </SectionCard>

        <SectionCard title="Record Downloads" actionLabel="View all" onAction={() => onNavigateSection?.('documents')}>
          <View style={styles.downloadRow}>
            <View style={styles.downloadIcon}>
              <Download size={16} color="#64748B" />
            </View>
            <View style={styles.downloadText}>
              <Text style={styles.downloadTitle}>Progress Report — {yearLabel}</Text>
              <Text style={styles.downloadMeta}>PDF · Updated recently</Text>
            </View>
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => onNavigateSection?.('documents')}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.downloadBtnText}>Download</Text>
            </TouchableOpacity>
          </View>
          {pendingReviews != null && pendingReviews > 0 ? (
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => onTabChange?.('subjects', 'subjects')}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.linkRowText}>{pendingReviews} submissions awaiting review</Text>
              <ChevronRight size={14} color="#2563EB" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => onNavigateSection?.('documents')}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.linkRowText}>View all documents</Text>
            <ChevronRight size={14} color="#2563EB" />
          </TouchableOpacity>
        </SectionCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...familyStyles.pageContent,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    minWidth: 170,
    flexGrow: 1,
    flexBasis: 170,
    ...familyCardStyle,
    gap: 4,
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
  },
  statMeta: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.55)',
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(15, 23, 42, 0.58)',
  },
  statAction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 4,
  },
  twoColRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FAMILY_CARD_GAP,
  },
  sectionCard: {
    flex: 1,
    minWidth: 320,
    ...familyCardStyle,
    gap: 14,
  },
  sectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  sectionCardAction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  activityDayLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(15, 23, 42, 0.45)',
    marginTop: 8,
    marginBottom: 4,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 10,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  activityMeta: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.55)',
  },
  activityRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  activityTime: {
    fontSize: 11,
    color: 'rgba(15, 23, 42, 0.45)',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  yearStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  yearStat: {
    minWidth: 120,
    flex: 1,
    gap: 4,
  },
  yearStatValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  yearStatLabel: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.55)',
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  subjectName: {
    width: 100,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  progressTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  subjectPct: {
    width: 36,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'right',
  },
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  downloadIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadText: {
    flex: 1,
    gap: 2,
  },
  downloadTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  downloadMeta: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.55)',
  },
  downloadBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  downloadBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  linkRowText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
});
