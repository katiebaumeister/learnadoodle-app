/**
 * Parent home dashboard — two-column layout with Today timeline, AI Insights, Alerts, Family, Quick Actions.
 */

import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import {
  AlertTriangle,
  Clock,
  HelpCircle,
  Wrench,
  Plus,
  MessageCircle,
  ClipboardList,
  FlaskConical,
  MessageSquare,
  Sparkles,
  ChevronRight,
  CalendarDays,
  TrendingUp,
  Star,
  Circle,
} from 'lucide-react';
import { getEventChildIdsForDisplay } from '../../lib/utils/eventChildIds';

function formatTime(timeString) {
  if (!timeString) return '';
  if (timeString.includes('T')) {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const [hours, minutes] = timeString.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minutes} ${ampm}`;
}

function getEventTimestamp(event) {
  const raw = event?.start_ts || event?.start;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getEventDateKey(event) {
  const d = getEventTimestamp(event);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatUpcomingDateLabel(dateKey) {
  const d = new Date(`${dateKey}T12:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  if (target.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getChildLabel(child) {
  return child?.first_name || child?.name || 'Child';
}

function getSubjectLabel(event, subjects) {
  if (event?.subject_name) return event.subject_name;
  const subject = (subjects || []).find((s) => String(s.id) === String(event?.subject_id));
  return subject?.name || event?.title || 'Event';
}

function statusToneFromDelta(deltaDays) {
  const delta = Number(deltaDays);
  if (!Number.isFinite(delta)) return 'on_track';
  if (delta < -1) return 'behind';
  if (delta > 1) return 'ahead';
  return 'on_track';
}

function statusLabel(tone, deltaDays, targetDays, plannedDays) {
  const delta = Math.abs(Math.round(Number(deltaDays) || 0));
  if (tone === 'behind') return `Behind by ${delta || 1} day${delta === 1 ? '' : 's'}`;
  if (tone === 'ahead') return `Ahead by ${delta || 1} day${delta === 1 ? '' : 's'}`;
  if (targetDays && plannedDays != null) return 'On Track';
  return 'On Track';
}

function getEventTheme(event, subjects) {
  const subject = getSubjectLabel(event, subjects).toLowerCase();
  const eventType = String(event?.event_type || event?.type || '').toLowerCase();
  if (subject.includes('science') || eventType.includes('science')) {
    return { dot: '#9333EA', iconBg: '#F3E8FF', iconColor: '#9333EA', Icon: FlaskConical };
  }
  if (subject.includes('writ') || eventType.includes('writ')) {
    return { dot: '#059669', iconBg: '#ECFDF5', iconColor: '#059669', Icon: MessageSquare };
  }
  if (
    subject.includes('soccer') ||
    subject.includes('sport') ||
    eventType.includes('activity') ||
    eventType.includes('sport')
  ) {
    return { dot: '#EA580C', iconBg: '#FFF7ED', iconColor: '#EA580C', Icon: Circle };
  }
  return { dot: '#2563EB', iconBg: '#EFF6FF', iconColor: '#2563EB', Icon: ClipboardList };
}

function DashboardCard({ title, titleIcon: TitleIcon, titleAccent, headerRight, children, style }) {
  return (
    <View style={[styles.card, style]}>
      {(title || headerRight) && (
        <View style={styles.cardHeader}>
          {title ? (
            <View style={styles.cardTitleRow}>
              {TitleIcon ? <TitleIcon size={16} color={titleAccent || '#6366F1'} /> : null}
              <Text style={[styles.cardTitle, titleAccent && { color: titleAccent }]}>{title}</Text>
            </View>
          ) : (
            <View />
          )}
          {headerRight || null}
        </View>
      )}
      {children}
    </View>
  );
}

function HeaderLink({ label, onPress }) {
  if (!onPress) return null;
  return (
    <TouchableOpacity onPress={onPress} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
      <Text style={styles.headerLink}>{label}</Text>
    </TouchableOpacity>
  );
}

function TodayTimelineItem({
  item,
  isLast,
  onPress,
  onSubmit,
}) {
  const theme = item.theme || {
    dot: '#2563EB',
    iconBg: '#EFF6FF',
    iconColor: '#2563EB',
    Icon: ClipboardList,
  };
  const Icon = theme.Icon;

  const content = (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, { backgroundColor: theme.dot }]} />
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineBody}>
        <Text style={styles.timelineTime}>{item.time || '—'}</Text>
        <View style={styles.timelineEvent}>
          <View style={[styles.timelineIconWrap, { backgroundColor: theme.iconBg }]}>
            <Icon size={16} color={theme.iconColor} />
          </View>
          <View style={styles.timelineTextBlock}>
            <Text style={styles.timelineTitle} numberOfLines={1}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text style={styles.timelineSubtitle} numberOfLines={2}>
                {item.subtitle}
              </Text>
            ) : null}
          </View>
          {item.showDueTag ? (
            <View style={styles.dueTodayTag}>
              <Text style={styles.dueTodayTagText}>Due today</Text>
            </View>
          ) : null}
          {item.showSubmit ? (
            <TouchableOpacity
              style={styles.submitBtn}
              onPress={onSubmit}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.submitBtnText}>Submit</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

export default function ParentHomeDashboard({
  children = [],
  subjects = [],
  todayEvents = [],
  dueAssignments = [],
  pendingSubmissions = [],
  alerts = [],
  aiInsights = [],
  familySnapshot = [],
  onNavigate,
  onAddEvent,
  onOpenEvent,
}) {
  const handleFixGap = () => {
    onNavigate?.('planner', 'calendar');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('plannerScrollToFixGap'));
      });
    }
  };
  const handlePlanWeek = () => onNavigate?.('planner', 'calendar');
  const handleSendMessage = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openMessagesPane'));
    }
  };
  const handleViewPlanner = () => onNavigate?.('planner', 'calendar');
  const handleViewSubmissions = () => onNavigate?.('learning', 'submissions');

  const todayTimelineItems = useMemo(() => {
    const items = [];

    todayEvents.forEach((event) => {
      const subject = getSubjectLabel(event, subjects);
      const title = event.title && event.title !== subject ? event.title : subject;
      const subtitle =
        event.title && event.title !== subject
          ? event.title
          : event.description || event.notes || null;
      const eventType = String(event?.event_type || event?.type || '').toLowerCase();
      items.push({
        id: `event-${event.id}`,
        sortKey: getEventTimestamp(event)?.getTime() || 0,
        time: formatTime(event.start_ts || event.start),
        title: subject,
        subtitle: subtitle && subtitle !== subject ? subtitle : null,
        theme: getEventTheme(event, subjects),
        showDueTag: eventType === 'assignment' || eventType === 'project',
        showSubmit: false,
        event,
      });
    });

    dueAssignments.slice(0, 4).forEach((assignment) => {
      items.push({
        id: `due-${assignment.id}`,
        sortKey: 12 * 60,
        time: 'Due today',
        title: assignment.title || 'Assignment',
        subtitle: assignment.child?.first_name
          ? `${assignment.child.first_name}${assignment.subject?.name ? ` · ${assignment.subject.name}` : ''}`
          : assignment.subject?.name || null,
        theme: { dot: '#9333EA', iconBg: '#F3E8FF', iconColor: '#9333EA', Icon: FlaskConical },
        showDueTag: true,
        showSubmit: false,
        assignment,
      });
    });

    pendingSubmissions.slice(0, 2).forEach((assignment) => {
      items.push({
        id: `submit-${assignment.id}`,
        sortKey: 13 * 60,
        time: formatTime(assignment.due_date ? `${assignment.due_date}T12:00:00` : null) || 'Review',
        title: assignment.title || 'Submission',
        subtitle: assignment.child?.first_name ? `${assignment.child.first_name} · awaiting review` : 'Awaiting review',
        theme: { dot: '#059669', iconBg: '#ECFDF5', iconColor: '#059669', Icon: MessageSquare },
        showDueTag: false,
        showSubmit: true,
        assignment,
      });
    });

    return items.sort((a, b) => a.sortKey - b.sortKey);
  }, [todayEvents, dueAssignments, pendingSubmissions, subjects]);

  const quickActions = [
    { id: 'fix_gap', label: 'Fix Gap', icon: Wrench, bg: '#ECFDF5', color: '#059669', onPress: handleFixGap },
    { id: 'plan_week', label: 'Plan Week', icon: CalendarDays, bg: '#EFF6FF', color: '#2563EB', onPress: handlePlanWeek },
    { id: 'create_event', label: 'Create Event', icon: Plus, bg: '#F3E8FF', color: '#9333EA', onPress: onAddEvent },
    { id: 'send_message', label: 'Send Message', icon: MessageCircle, bg: '#FFF7ED', color: '#EA580C', onPress: handleSendMessage },
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.greeting}>{getTimeBasedGreeting()}</Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.column}>
          <DashboardCard
            title="Today"
            headerRight={<HeaderLink label="View full day" onPress={handleViewPlanner} />}
          >
            {todayTimelineItems.length === 0 ? (
              <Text style={styles.emptyLine}>No events scheduled for today.</Text>
            ) : (
              todayTimelineItems.map((item, index) => (
                <TodayTimelineItem
                  key={item.id}
                  item={item}
                  isLast={index === todayTimelineItems.length - 1}
                  onPress={
                    item.event
                      ? () => onOpenEvent?.(item.event)
                      : item.assignment
                        ? handleViewSubmissions
                        : undefined
                  }
                  onSubmit={handleViewSubmissions}
                />
              ))
            )}
          </DashboardCard>

          <DashboardCard
            title="AI Insights"
            titleIcon={Sparkles}
            titleAccent="#6366F1"
            headerRight={<HeaderLink label="View all" onPress={handleViewPlanner} />}
          >
            {aiInsights.length === 0 ? (
              <Text style={styles.emptyLine}>Insights will appear as you plan and track learning.</Text>
            ) : (
              aiInsights.map((insight) => {
                const Icon = insight.icon || Sparkles;
                return (
                  <View key={insight.id} style={styles.insightRow}>
                    <View style={[styles.insightIconWrap, { backgroundColor: insight.iconBg || '#EEF2FF' }]}>
                      <Icon size={16} color={insight.iconColor || '#6366F1'} />
                    </View>
                    <Text style={styles.insightText}>{insight.text}</Text>
                  </View>
                );
              })
            )}
          </DashboardCard>
        </View>

        <View style={styles.column}>
          <DashboardCard
            title="Alerts"
            headerRight={
              <View style={styles.badgeRow}>
                {alerts.length > 0 ? (
                  <View style={styles.alertBadge}>
                    <Text style={styles.alertBadgeText}>{alerts.length}</Text>
                  </View>
                ) : null}
                <HeaderLink label="View all" onPress={handleViewSubmissions} />
              </View>
            }
          >
            {alerts.length === 0 ? (
              <Text style={styles.emptyLine}>Nothing urgent — you&apos;re caught up.</Text>
            ) : (
              alerts.map((alert) => {
                const Icon = alert.icon || AlertTriangle;
                return (
                  <TouchableOpacity
                    key={alert.id}
                    style={styles.alertRow}
                    onPress={alert.onPress}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={[styles.alertIconWrap, { backgroundColor: alert.iconBg || '#FEF2F2' }]}>
                      <Icon size={16} color={alert.iconColor || '#DC2626'} />
                    </View>
                    <View style={styles.alertCopy}>
                      <Text style={styles.alertTitle}>{alert.title || alert.message}</Text>
                      {alert.subtitle ? (
                        <Text style={styles.alertSubtitle}>{alert.subtitle}</Text>
                      ) : null}
                    </View>
                    <ChevronRight size={16} color="#94A3B8" />
                  </TouchableOpacity>
                );
              })
            )}
          </DashboardCard>

          <DashboardCard
            title="Family Snapshot"
            headerRight={<HeaderLink label="View all" onPress={() => onNavigate?.('family', 'overview')} />}
          >
            {familySnapshot.length === 0 ? (
              <Text style={styles.emptyLine}>Add children to see progress at a glance.</Text>
            ) : (
              familySnapshot.map((row) => (
                <View key={row.childId} style={styles.snapshotRow}>
                  <View style={styles.snapshotTop}>
                    <View style={styles.snapshotIdentity}>
                      <View
                        style={[
                          styles.snapshotAvatar,
                          { backgroundColor: row.avatarColor || '#94A3B8' },
                        ]}
                      >
                        <Text style={styles.snapshotAvatarText}>
                          {(row.name || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.snapshotName}>{row.name}</Text>
                        {row.gradeLabel ? (
                          <Text style={styles.snapshotGrade}>{row.gradeLabel}</Text>
                        ) : null}
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.snapshotStatus,
                        row.tone === 'behind' && styles.snapshotStatusBehind,
                        row.tone === 'ahead' && styles.snapshotStatusAhead,
                        row.tone === 'on_track' && styles.snapshotStatusOnTrack,
                      ]}
                    >
                      {row.statusLabel}
                    </Text>
                  </View>
                  {row.targetDays ? (
                    <>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            row.tone === 'behind' && styles.progressFillBehind,
                            row.tone === 'ahead' && styles.progressFillAhead,
                            { width: `${Math.min(100, row.progressPct || 0)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.progressCaption}>
                        {row.plannedDays}/{row.targetDays} days
                      </Text>
                    </>
                  ) : null}
                </View>
              ))
            )}
          </DashboardCard>

          <DashboardCard title="Quick Actions">
            <View style={styles.quickActionsGrid}>
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <TouchableOpacity
                    key={action.id}
                    style={[styles.quickActionBtn, { backgroundColor: action.bg }]}
                    onPress={action.onPress}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Icon size={20} color={action.color} />
                    <Text style={[styles.quickActionLabel, { color: action.color }]}>{action.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </DashboardCard>
        </View>
      </View>
    </ScrollView>
  );
}

export {
  getEventDateKey,
  getEventTimestamp,
  formatUpcomingDateLabel,
  statusToneFromDelta,
  statusLabel,
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    ...(Platform.OS === 'web' && { minHeight: 0 }),
  },
  scrollContent: {
    paddingBottom: 32,
    gap: 20,
  },
  hero: {
    gap: 4,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  grid: {
    gap: 16,
    ...(Platform.OS === 'web' && {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      alignItems: 'start',
    }),
  },
  column: {
    gap: 16,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
    }),
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    padding: 18,
    gap: 14,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 10px rgba(15, 23, 42, 0.06)',
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366F1',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  alertBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyLine: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  timelineRail: {
    width: 12,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 6,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    backgroundColor: 'rgba(148, 163, 184, 0.35)',
    marginTop: 4,
    minHeight: 48,
  },
  timelineBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  timelineTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  timelineEvent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timelineIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  timelineTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  timelineSubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  dueTodayTag: {
    backgroundColor: '#FEE2E2',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexShrink: 0,
  },
  dueTodayTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  submitBtn: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 0,
  },
  submitBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 4,
  },
  insightIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  insightText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  alertIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  alertSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  snapshotRow: {
    gap: 8,
    marginBottom: 4,
  },
  snapshotTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  snapshotIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  snapshotAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  snapshotName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  snapshotGrade: {
    fontSize: 12,
    color: '#64748B',
  },
  snapshotStatus: {
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 0,
  },
  snapshotStatusOnTrack: {
    color: '#059669',
  },
  snapshotStatusBehind: {
    color: '#EA580C',
  },
  snapshotStatusAhead: {
    color: '#059669',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#22C55E',
  },
  progressFillBehind: {
    backgroundColor: '#F97316',
  },
  progressFillAhead: {
    backgroundColor: '#22C55E',
  },
  progressCaption: {
    fontSize: 11,
    color: '#94A3B8',
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionBtn: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 120,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
