/**
 * Parent home dashboard — "What requires attention today?"
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import {
  AlertTriangle,
  Clock,
  HelpCircle,
  FileText,
  Wrench,
  Plus,
  MessageCircle,
  BookOpen,
} from 'lucide-react';
import { colors } from '../../theme/colors';
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

function DashboardCard({ title, headerRight, children, style }) {
  return (
    <View style={[styles.card, style]}>
      {(title || headerRight) && (
        <View style={styles.cardHeader}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}
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

function EmptyLine({ text }) {
  return <Text style={styles.emptyLine}>{text}</Text>;
}

function EventRow({ event, subjects, children, showDueTag }) {
  const time = formatTime(event.start_ts || event.start);
  const subject = getSubjectLabel(event, subjects);
  const title = event.title && event.title !== subject ? event.title : null;
  const childIds = getEventChildIdsForDisplay(event, children);
  const childLine =
    childIds.length > 0
      ? childIds.map((id) => {
          const c = children.find((ch) => String(ch.id) === String(id));
          return getChildLabel(c);
        }).join(', ')
      : null;

  return (
    <View style={styles.eventRow}>
      <Text style={styles.eventTime}>{time || '—'}</Text>
      <View style={styles.eventBody}>
        <View style={styles.eventTitleRow}>
          <BookOpen size={14} color="#6366f1" style={styles.eventIcon} />
          <Text style={styles.eventTitle} numberOfLines={1}>
            {subject}
            {title ? ` — ${title}` : ''}
          </Text>
          {showDueTag ? (
            <View style={styles.dueTodayTag}>
              <Text style={styles.dueTodayTagText}>Due Today</Text>
            </View>
          ) : null}
        </View>
        {childLine ? <Text style={styles.eventMeta}>{childLine}</Text> : null}
      </View>
    </View>
  );
}

export default function ParentHomeDashboard({
  userDisplayName = '',
  children = [],
  subjects = [],
  todayEvents = [],
  upcomingGroups = [],
  dueAssignments = [],
  pendingSubmissions = [],
  alerts = [],
  familySnapshot = [],
  onNavigate,
  onAddEvent,
  onOpenEvent,
}) {
  const greetingName = userDisplayName?.trim() || 'there';

  const handleFixGap = () => onNavigate?.('planner', 'plan-health');
  const handleSendMessage = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('openMessagesPane'));
    }
  };
  const handleViewPlanner = () => onNavigate?.('planner', 'calendar');
  const handleViewSubmissions = () => onNavigate?.('learning', 'submissions');

  const quickActions = [
    {
      id: 'fix_gap',
      label: 'Fix Gap',
      icon: Wrench,
      bg: '#ecfdf5',
      color: '#059669',
      onPress: handleFixGap,
    },
    {
      id: 'create_event',
      label: 'Create Event',
      icon: Plus,
      bg: '#eef2ff',
      color: '#4f46e5',
      onPress: onAddEvent,
    },
    {
      id: 'send_message',
      label: 'Send Message',
      icon: MessageCircle,
      bg: '#fff7ed',
      color: '#ea580c',
      onPress: handleSendMessage,
    },
  ];

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.greeting}>
          {getTimeBasedGreeting()}, {greetingName}! ☀️
        </Text>
        <Text style={styles.heroSubtext}>Here&apos;s what requires attention today.</Text>
      </View>

      <View style={styles.grid}>
        {/* Column 1 — Today */}
        <View style={styles.column}>
          <DashboardCard
            title="Today"
            headerRight={<HeaderLink label="View full day" onPress={handleViewPlanner} />}
          >
            {todayEvents.length === 0 ? (
              <EmptyLine text="No events scheduled for today." />
            ) : (
              <View style={styles.listGap}>
                {todayEvents.map((event) => (
                  <TouchableOpacity
                    key={String(event.id)}
                    onPress={() => onOpenEvent?.(event)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <EventRow
                      event={event}
                      subjects={subjects}
                      children={children}
                      showDueTag={
                        (event.event_type || event.type) === 'Assignment' ||
                        (event.event_type || event.type) === 'Project'
                      }
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {dueAssignments.length > 0 && (
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>Due assignments</Text>
                {dueAssignments.slice(0, 4).map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.compactRow}
                    onPress={handleViewSubmissions}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <FileText size={14} color="#6366f1" />
                    <Text style={styles.compactRowText} numberOfLines={1}>
                      {a.title || 'Assignment'}
                      {a.child?.first_name ? ` · ${a.child.first_name}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {pendingSubmissions.length > 0 && (
              <View style={styles.subSection}>
                <Text style={styles.subSectionTitle}>Due submissions</Text>
                {pendingSubmissions.slice(0, 4).map((a) => (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.compactRow}
                    onPress={handleViewSubmissions}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Clock size={14} color="#ea580c" />
                    <Text style={styles.compactRowText} numberOfLines={1}>
                      {a.child?.first_name ? `${a.child.first_name}: ` : ''}
                      {a.title || 'Submission'} — review
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={styles.addEventLink}
              onPress={onAddEvent}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={14} color="#6366f1" />
              <Text style={styles.addEventLinkText}>Add Event</Text>
            </TouchableOpacity>
          </DashboardCard>
        </View>

        {/* Column 2 — Alerts, Family, Quick Actions */}
        <View style={styles.column}>
          <DashboardCard
            title="Alerts"
            headerRight={
              alerts.length > 0 ? (
                <View style={styles.badgeRow}>
                  <View style={styles.alertBadge}>
                    <Text style={styles.alertBadgeText}>{alerts.length}</Text>
                  </View>
                  <HeaderLink label="View all" onPress={handleViewSubmissions} />
                </View>
              ) : (
                <HeaderLink label="View all" onPress={handleViewSubmissions} />
              )
            }
          >
            {alerts.length === 0 ? (
              <EmptyLine text="Nothing urgent — you're caught up." />
            ) : (
              <View style={styles.listGap}>
                {alerts.map((alert) => {
                  const Icon = alert.icon || AlertTriangle;
                  return (
                    <TouchableOpacity
                      key={alert.id}
                      style={styles.alertRow}
                      onPress={alert.onPress}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <View style={[styles.alertIconWrap, { backgroundColor: alert.iconBg || '#fef2f2' }]}>
                        <Icon size={16} color={alert.iconColor || '#dc2626'} />
                      </View>
                      <Text style={styles.alertText}>{alert.message}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </DashboardCard>

          <DashboardCard
            title="Family Snapshot"
            headerRight={<HeaderLink label="View all" onPress={() => onNavigate?.('family', 'members')} />}
          >
            {familySnapshot.length === 0 ? (
              <EmptyLine text="Add children to see progress at a glance." />
            ) : (
              <View style={styles.listGap}>
                {familySnapshot.map((row) => (
                  <View key={row.childId} style={styles.snapshotRow}>
                    <View style={styles.snapshotHeader}>
                      <Text style={styles.snapshotName}>{row.name}</Text>
                      <View
                        style={[
                          styles.statusChip,
                          row.tone === 'behind' && styles.statusChipBehind,
                          row.tone === 'ahead' && styles.statusChipAhead,
                          row.tone === 'on_track' && styles.statusChipOnTrack,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusChipText,
                            row.tone === 'behind' && styles.statusChipTextBehind,
                            row.tone === 'ahead' && styles.statusChipTextAhead,
                            row.tone === 'on_track' && styles.statusChipTextOnTrack,
                          ]}
                        >
                          {row.statusLabel}
                        </Text>
                      </View>
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
                ))}
              </View>
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
                    <Icon size={18} color={action.color} />
                    <Text style={[styles.quickActionLabel, { color: action.color }]}>{action.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </DashboardCard>
        </View>

        {/* Column 3 — Upcoming */}
        <View style={styles.column}>
          <DashboardCard
            title="Upcoming"
            headerRight={<HeaderLink label="View calendar" onPress={handleViewPlanner} />}
          >
            {upcomingGroups.length === 0 ? (
              <EmptyLine text="No upcoming events this week." />
            ) : (
              <View style={styles.listGap}>
                {upcomingGroups.map((group) => (
                  <View key={group.dateKey}>
                    <Text style={styles.upcomingDateLabel}>{group.label}</Text>
                    {group.events.map((event) => (
                      <TouchableOpacity
                        key={String(event.id)}
                        onPress={() => onOpenEvent?.(event)}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={styles.upcomingRow}>
                          <Text style={styles.upcomingTime}>
                            {formatTime(event.start_ts || event.start)}
                          </Text>
                          <Text style={styles.upcomingTitle} numberOfLines={1}>
                            {getSubjectLabel(event, subjects)}
                            {event.title && event.title !== getSubjectLabel(event, subjects)
                              ? ` — ${event.title}`
                              : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={styles.addEventLink}
              onPress={onAddEvent}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={14} color="#6366f1" />
              <Text style={styles.addEventLinkText}>Add Event</Text>
            </TouchableOpacity>
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
    gap: 16,
  },
  hero: {
    gap: 4,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  heroSubtext: {
    fontSize: 14,
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  grid: {
    gap: 16,
    ...(Platform.OS === 'web' && {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
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
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    padding: 16,
    gap: 12,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  headerLink: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6366f1',
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
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  alertBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  listGap: {
    gap: 10,
  },
  emptyLine: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 20,
  },
  eventRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  eventTime: {
    width: 72,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    paddingTop: 2,
  },
  eventBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  eventTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  eventIcon: {
    flexShrink: 0,
  },
  eventTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    minWidth: 0,
  },
  eventMeta: {
    fontSize: 12,
    color: '#94a3b8',
  },
  dueTodayTag: {
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dueTodayTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#dc2626',
    textTransform: 'uppercase',
  },
  subSection: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.15)',
    gap: 8,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactRowText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
  },
  addEventLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingTop: 8,
  },
  addEventLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366f1',
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  alertIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
  },
  snapshotRow: {
    gap: 6,
  },
  snapshotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  snapshotName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusChipOnTrack: {
    backgroundColor: '#ecfdf5',
  },
  statusChipBehind: {
    backgroundColor: '#fff7ed',
  },
  statusChipAhead: {
    backgroundColor: '#ecfdf5',
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusChipTextOnTrack: {
    color: '#059669',
  },
  statusChipTextBehind: {
    color: '#ea580c',
  },
  statusChipTextAhead: {
    color: '#059669',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#22c55e',
  },
  progressFillBehind: {
    backgroundColor: '#f97316',
  },
  progressFillAhead: {
    backgroundColor: '#22c55e',
  },
  progressCaption: {
    fontSize: 11,
    color: '#94a3b8',
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
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  quickActionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  upcomingDateLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
    marginTop: 4,
  },
  upcomingRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 4,
    alignItems: 'center',
  },
  upcomingTime: {
    width: 72,
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  upcomingTitle: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
    minWidth: 0,
  },
});
