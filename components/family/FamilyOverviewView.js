import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import {
  Users,
  BookOpen,
  CalendarDays,
  Clock,
  ChevronRight,
  Plus,
  CheckCircle2,
  Calendar,
  SlidersHorizontal,
  ClipboardList,
  MessageSquare,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatSchoolYearLabel, getChildDisplayName } from './familySectionRouting';
import { familyCardStyle, familyStyles, FAMILY_CARD_GAP } from './familyDesignTokens';

import { getPlanningModeLabel } from '../../lib/planningMode';

function StatCard({ icon: Icon, iconColor, iconBg, value, meta, label }) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconColor} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      {meta ? <Text style={styles.statMeta}>{meta}</Text> : null}
      <Text style={styles.statLabel}>{label}</Text>
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

function formatYearDates(yearRow) {
  if (!yearRow) return '';
  const start = yearRow.start_date ? new Date(`${String(yearRow.start_date).slice(0, 10)}T12:00:00`) : null;
  const end = yearRow.end_date ? new Date(`${String(yearRow.end_date).slice(0, 10)}T12:00:00`) : null;
  const fmt = (date) =>
    date?.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) || '';
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return fmt(start) || fmt(end) || '';
}

export default function FamilyOverviewView({
  familyId,
  family = null,
  children = [],
  subjects = [],
  academicYears = [],
  preloadedPlannerSettings = null,
  onSelectChild,
  onAddChild,
  onNavigateSection,
  onTabChange,
}) {
  const [daysCompleted, setDaysCompleted] = useState(null);
  const [daysTarget, setDaysTarget] = useState(null);
  const [hoursLogged, setHoursLogged] = useState(null);
  const [pendingReviews, setPendingReviews] = useState(null);

  const childCount = children.length;
  const subjectCount = useMemo(() => {
    const ids = new Set();
    (subjects || []).forEach((subject) => {
      if (subject?.id) ids.add(String(subject.id));
    });
    return ids.size;
  }, [subjects]);

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

  const plannerSettings = preloadedPlannerSettings?.settings || preloadedPlannerSettings || {};
  const goalLabel = getPlanningModeLabel(family?.default_planning_mode);
  const planningStyle =
    plannerSettings.default_constraint_mode === 'hours'
      ? `Hours (${plannerSettings.default_target_hours || '—'} per week)`
      : `Days (${plannerSettings.default_target_days || '5'} per week)`;

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      if (!familyId) return;
      try {
        const yearStart = currentYear?.start_date
          ? String(currentYear.start_date).slice(0, 10)
          : `${new Date().getFullYear()}-01-01`;
        const yearEnd = currentYear?.end_date
          ? String(currentYear.end_date).slice(0, 10)
          : `${new Date().getFullYear()}-12-31`;
        const childIds = children.map((c) => c.id).filter(Boolean);

        const queries = [
          childIds.length > 0
            ? supabase
                .from('attendance_records')
                .select('day_date, status, minutes')
                .eq('family_id', familyId)
                .in('child_id', childIds)
                .gte('day_date', yearStart)
                .lte('day_date', yearEnd)
            : Promise.resolve({ data: [] }),
          supabase
            .from('family_planner_settings')
            .select('default_target_days')
            .eq('family_id', familyId)
            .maybeSingle(),
          supabase
            .from('assignments')
            .select('id', { count: 'exact', head: true })
            .eq('family_id', familyId)
            .eq('status', 'submitted'),
        ];

        const [attendanceRes, settingsRes, reviewsRes] = await Promise.all(queries);
        if (cancelled) return;

        const attendanceRows = attendanceRes.data || [];
        const uniqueDates = new Set(
          attendanceRows
            .filter((row) => ['present', 'partial', 'completed'].includes(String(row.status || '')))
            .map((row) => String(row.day_date || '').slice(0, 10))
            .filter(Boolean)
        );
        setDaysCompleted(uniqueDates.size);
        const target = Number(settingsRes.data?.default_target_days);
        setDaysTarget(Number.isFinite(target) && target > 0 ? target : 180);

        const totalMinutes = attendanceRows.reduce(
          (sum, row) => sum + (Number(row.minutes) || 0),
          0
        );
        setHoursLogged(totalMinutes > 0 ? Math.round(totalMinutes / 60) : 0);
        setPendingReviews(reviewsRes.count ?? 0);
      } catch (_) {
        if (!cancelled) {
          setDaysCompleted(null);
          setDaysTarget(null);
          setHoursLogged(null);
          setPendingReviews(null);
        }
      }
    };
    loadStats();
    return () => {
      cancelled = true;
    };
  }, [familyId, currentYear, children]);

  const yearLabel = currentYear ? formatSchoolYearLabel(currentYear) : 'This school year';
  const daysDisplay =
    daysCompleted != null && daysTarget != null ? `${daysCompleted} / ${daysTarget}` : '—';

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <StatCard
          icon={Users}
          iconColor="#7C3AED"
          iconBg="rgba(124, 58, 237, 0.12)"
          value={String(childCount)}
          meta={childCount > 0 ? 'All active' : undefined}
          label={childCount === 1 ? 'Child' : 'Children'}
        />
        <StatCard
          icon={BookOpen}
          iconColor="#059669"
          iconBg="rgba(5, 150, 105, 0.12)"
          value={String(subjectCount)}
          meta="Across all children"
          label={subjectCount === 1 ? 'Subject' : 'Subjects'}
        />
        <StatCard
          icon={CalendarDays}
          iconColor="#2563EB"
          iconBg="rgba(37, 99, 235, 0.12)"
          value={daysDisplay}
          meta={`For ${yearLabel}`}
          label="School Days"
        />
        <StatCard
          icon={Clock}
          iconColor="#EA580C"
          iconBg="rgba(234, 88, 12, 0.12)"
          value={hoursLogged != null ? String(hoursLogged) : '—'}
          meta="This school year"
          label="Hours Logged"
        />
      </View>

      <View style={styles.twoColRow}>
        <SectionCard title="Children" actionLabel="View all" onAction={() => onNavigateSection?.('members')}>
          {children.length === 0 ? (
            <Text style={styles.emptyText}>No children yet.</Text>
          ) : (
            children.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={styles.childRow}
                onPress={() => onSelectChild?.(child.id)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <View style={[styles.childAvatar, { backgroundColor: child.avatar_color || '#94A3B8' }]}>
                  <Text style={styles.childAvatarText}>
                    {getChildDisplayName(child).charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.childRowMeta}>
                  <Text style={styles.childRowName}>{getChildDisplayName(child)}</Text>
                  <Text style={styles.childRowDetail}>
                    {[
                      child.grade != null && child.grade !== '' ? `${child.grade} Grade` : null,
                      child.age != null ? `Age ${child.age}` : null,
                    ].filter(Boolean).join(' · ') || 'Learner'}
                  </Text>
                </View>
                <ChevronRight size={16} color="rgba(15, 23, 42, 0.35)" />
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity
            style={styles.addChildBtn}
            onPress={onAddChild}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={16} color="#2563EB" />
            <Text style={styles.addChildBtnText}>Add Child</Text>
          </TouchableOpacity>
        </SectionCard>

        <SectionCard title="Family Overview">
          <View style={styles.insightList}>
            <View style={styles.insightRow}>
              <CheckCircle2 size={16} color="#059669" />
              <Text style={styles.insightText}>Great job! Your family is on track this year.</Text>
            </View>
            <View style={styles.insightRow}>
              <CheckCircle2 size={16} color="#059669" />
              <Text style={styles.insightText}>
                All children are making good progress. You&apos;re completing lessons consistently.
              </Text>
            </View>
            <View style={styles.insightRow}>
              <CheckCircle2 size={16} color="#059669" />
              <Text style={styles.insightText}>
                Great balance across all subjects. Keep up the amazing work!
              </Text>
            </View>
          </View>
        </SectionCard>
      </View>

      <View style={styles.threeColRow}>
        <SectionCard
          title="Academic Year"
          actionLabel="View all"
          onAction={() => onNavigateSection?.('academic-years')}
        >
          {currentYear ? (
            <>
              <View style={styles.yearSummary}>
                <Calendar size={18} color="#2563EB" />
                <View style={styles.yearSummaryText}>
                  <Text style={styles.yearSummaryTitle}>{yearLabel}</Text>
                  <Text style={styles.yearSummaryDates}>{formatYearDates(currentYear)}</Text>
                  {daysCompleted != null && daysTarget != null ? (
                    <Text style={styles.yearSummaryProgress}>
                      {daysCompleted} of {daysTarget} days completed
                    </Text>
                  ) : null}
                </View>
              </View>
              <TouchableOpacity
                style={styles.cardButton}
                onPress={() => onNavigateSection?.('academic-years')}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.cardButtonText}>Manage Academic Years</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.emptyText}>Set up your first academic year.</Text>
          )}
        </SectionCard>

        <SectionCard
          title="Learning Preferences"
          actionLabel="Manage"
          onAction={() => onNavigateSection?.('learning-preferences')}
        >
          <View style={styles.prefList}>
            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>Homeschool Approach</Text>
              <Text style={styles.prefValue}>{goalLabel}</Text>
            </View>
            <View style={styles.prefRow}>
              <Text style={styles.prefLabel}>Planning Style</Text>
              <Text style={styles.prefValue}>{planningStyle}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => onNavigateSection?.('learning-preferences')}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <SlidersHorizontal size={14} color="#2563EB" />
            <Text style={styles.linkButtonText}>View All Preferences</Text>
          </TouchableOpacity>
        </SectionCard>

        <SectionCard title="At a Glance">
          <View style={styles.glanceList}>
            <TouchableOpacity
              style={styles.glanceRow}
              onPress={() => onTabChange?.('planner', 'calendar')}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <ClipboardList size={16} color="#64748B" />
              <Text style={styles.glanceText}>View Planner</Text>
              <ChevronRight size={14} color="rgba(15, 23, 42, 0.35)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.glanceRow}
              onPress={() => onTabChange?.('subjects', 'subjects')}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <BookOpen size={16} color="#64748B" />
              <Text style={styles.glanceText}>
                {pendingReviews != null && pendingReviews > 0
                  ? `${pendingReviews} Submissions Awaiting Review`
                  : 'View Work'}
              </Text>
              <ChevronRight size={14} color="rgba(15, 23, 42, 0.35)" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.glanceRow}
              onPress={() => {
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openMessagesPane'));
                }
              }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <MessageSquare size={16} color="#64748B" />
              <Text style={styles.glanceText}>View Messages</Text>
              <ChevronRight size={14} color="rgba(15, 23, 42, 0.35)" />
            </TouchableOpacity>
          </View>
        </SectionCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...familyStyles.pageContent,
    paddingTop: 0,
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
  twoColRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FAMILY_CARD_GAP,
  },
  threeColRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FAMILY_CARD_GAP,
  },
  sectionCard: {
    flex: 1,
    minWidth: 280,
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
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.15)',
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  childAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  childRowMeta: {
    flex: 1,
    gap: 2,
  },
  childRowName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  childRowDetail: {
    fontSize: 13,
    color: 'rgba(15, 23, 42, 0.55)',
  },
  addChildBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.25)',
    backgroundColor: 'rgba(37, 99, 235, 0.04)',
    marginTop: 4,
  },
  addChildBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563EB',
  },
  insightList: {
    gap: 12,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  insightText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(15, 23, 42, 0.72)',
  },
  yearSummary: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  yearSummaryText: {
    flex: 1,
    gap: 4,
  },
  yearSummaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  yearSummaryDates: {
    fontSize: 13,
    color: 'rgba(15, 23, 42, 0.55)',
  },
  yearSummaryProgress: {
    fontSize: 13,
    color: 'rgba(15, 23, 42, 0.62)',
    marginTop: 2,
  },
  cardButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  cardButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  prefList: {
    gap: 10,
  },
  prefRow: {
    gap: 2,
  },
  prefLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  prefValue: {
    fontSize: 14,
    color: '#0F172A',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  glanceList: {
    gap: 8,
  },
  glanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  glanceText: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(15, 23, 42, 0.55)',
  },
});
