import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { TrendingUp, AlertTriangle, CalendarDays, Zap } from 'lucide-react';
import { familyCardStyle } from '../family/familyDesignTokens';

function SummaryCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  value,
  meta,
  actionLabel,
  onAction,
  actionTone = 'link',
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Icon size={18} color={iconColor} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardValue}>{value}</Text>
      {meta ? <Text style={styles.cardMeta}>{meta}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          style={actionTone === 'button' ? styles.actionButton : undefined}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Text style={actionTone === 'button' ? styles.actionButtonText : styles.actionLink}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function PlannerSummaryCards({
  planHealth,
  weekEventCount = null,
  weekAssignmentCount = null,
  conflictLabel = null,
  onViewDetails,
  onFixGap,
  onViewWeek,
  onResolveConflict,
}) {
  const progress = useMemo(() => {
    if (!planHealth?.plan_exists) return null;
    const planned = Number(planHealth.planned_days ?? planHealth.target_days ?? 0);
    const actual = Number(planHealth.actual_days ?? planHealth.completed_days ?? 0);
    if (planned <= 0) return null;
    const pct = Math.min(100, Math.round((actual / planned) * 100));
    return { pct, actual, planned };
  }, [planHealth]);

  const behindSubjects = useMemo(() => {
    const subjects = planHealth?.subjects_behind || planHealth?.behind_subjects || [];
    if (Array.isArray(subjects) && subjects.length > 0) {
      return subjects.slice(0, 2).map((s) => s.name || s.subject_name || s).join(', ');
    }
    const count = Number(planHealth?.subjects_behind_count ?? 0);
    if (count > 0) return `${count} subject${count === 1 ? '' : 's'}`;
    return null;
  }, [planHealth]);

  return (
    <View style={styles.row}>
      <SummaryCard
        icon={TrendingUp}
        iconColor="#059669"
        iconBg="rgba(5, 150, 105, 0.12)"
        title="School Year Progress"
        value={progress ? `${progress.pct}%` : '—'}
        meta={
          progress
            ? `${progress.actual} of ${progress.planned} days`
            : 'Set up your school year plan'
        }
        actionLabel="View Details"
        onAction={onViewDetails}
      />
      <SummaryCard
        icon={AlertTriangle}
        iconColor="#EA580C"
        iconBg="rgba(234, 88, 12, 0.12)"
        title="Behind"
        value={behindSubjects || 'On track'}
        meta={behindSubjects ? 'Needs attention' : 'All subjects current'}
        actionLabel="View Details"
        onAction={onFixGap}
      />
      <SummaryCard
        icon={CalendarDays}
        iconColor="#2563EB"
        iconBg="rgba(37, 99, 235, 0.12)"
        title="Upcoming This Week"
        value={
          weekEventCount != null
            ? `${weekEventCount} event${weekEventCount === 1 ? '' : 's'}`
            : '—'
        }
        meta={
          weekAssignmentCount != null
            ? `${weekAssignmentCount} assignment${weekAssignmentCount === 1 ? '' : 's'}`
            : 'This week'
        }
        actionLabel="View Week"
        onAction={onViewWeek}
      />
      <SummaryCard
        icon={Zap}
        iconColor="#7C3AED"
        iconBg="rgba(124, 58, 237, 0.12)"
        title="Conflicts"
        value={conflictLabel || 'None'}
        meta={conflictLabel ? 'Needs resolution' : 'Schedule looks clear'}
        actionLabel={conflictLabel ? 'Resolve' : undefined}
        onAction={conflictLabel ? onResolveConflict : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    minWidth: 180,
    flexGrow: 1,
    flexBasis: 180,
    ...familyCardStyle,
    gap: 4,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(15, 23, 42, 0.58)',
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardMeta: {
    fontSize: 12,
    color: 'rgba(15, 23, 42, 0.55)',
  },
  actionLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 4,
  },
  actionButton: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
});
