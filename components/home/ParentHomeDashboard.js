/**
 * Parent home dashboard — layout helpers and right-rail subject snapshot.
 */

import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, ScrollView } from 'react-native';
import {
  BookOpen,
  Clock,
  FileText,
  Plus,
  MoreVertical,
  Eye,
  Edit2,
} from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
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

function DashboardCard({ title, headerRight, children, style, fillRail = false }) {
  return (
    <View style={[styles.card, fillRail && styles.railCard, style]}>
      {(title || headerRight) && (
        <View style={[styles.cardHeader, fillRail && styles.railCardHeader]}>
          {title ? <Text style={[styles.cardTitle, fillRail && styles.railSectionTitle]}>{title}</Text> : <View />}
          {headerRight || null}
        </View>
      )}
      {fillRail ? (
        <ScrollView
          style={styles.railCardScroll}
          contentContainerStyle={styles.railCardScrollContent}
          showsVerticalScrollIndicator={Platform.OS === 'web'}
          nestedScrollEnabled
        >
          {children}
        </ScrollView>
      ) : (
        children
      )}
    </View>
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

function HeaderLink({ label, onPress }) {
  if (!onPress) return null;
  return (
    <TouchableOpacity onPress={onPress} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
      <Text style={styles.headerLink}>{label}</Text>
    </TouchableOpacity>
  );
}

function SubjectSnapshotRow({ row, familyChildren = [], onNavigate, onEditSubject, onAddEventForSubject }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef(null);

  const runMenuAction = (action) => {
    setMenuOpen(false);
    action?.();
  };

  return (
    <View style={styles.snapshotRow}>
      <View style={styles.snapshotTop}>
        <View style={styles.snapshotTextBlock}>
          <Text style={styles.snapshotName} numberOfLines={1}>
            {row.name}
          </Text>
          {row.childIds?.length > 0 ? (
            <View style={styles.snapshotChildRow}>
              <ChildAvatarCluster
                childIds={row.childIds}
                familyChildren={familyChildren}
                size={22}
                overlap={-6}
              />
              {row.childLabel ? (
                <Text style={styles.snapshotChildNames} numberOfLines={1}>
                  {row.childLabel}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        <View style={styles.snapshotMenuWrap}>
          <TouchableOpacity
            ref={menuBtnRef}
            style={[styles.snapshotMenuBtn, menuOpen && styles.snapshotMenuBtnActive]}
            onPress={(e) => {
              e?.stopPropagation?.();
              setMenuOpen((open) => !open);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${row.name} actions`}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <MoreVertical size={16} color="#94A3B8" />
          </TouchableOpacity>
          <Dropdown
            visible={menuOpen}
            triggerRef={menuBtnRef}
            onClose={() => setMenuOpen(false)}
            placement="bottom-end"
            width={220}
            variant="context"
          >
            <DropdownItem
              icon={Eye}
              label="View details"
              onPress={() => runMenuAction(() => onNavigate?.(`subject-${row.subjectId}`))}
            />
            <DropdownItem
              icon={Edit2}
              label="Edit subject"
              onPress={() => runMenuAction(() => onEditSubject?.(row))}
            />
            <DropdownItem
              icon={Plus}
              label="Add event"
              onPress={() => runMenuAction(() => onAddEventForSubject?.(row))}
            />
          </Dropdown>
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
  );
}

export function ParentHomeRightRail({
  subjectSnapshot = [],
  userRole = null,
  familyChildren = [],
  onNavigate,
  onEditSubject,
  onAddEventForSubject,
}) {
  const session = useSession();
  const resolvedRole = userRole ?? session?.effective_role ?? '';
  const isChildRole =
    resolvedRole === 'child' ||
    resolvedRole === 'student' ||
    session?.role_flags?.isChild === true;
  const subjectsTitle = isChildRole ? 'Your Subjects' : "Your Family's Subjects";

  return (
    <View style={styles.railStack}>
      <DashboardCard
        title={subjectsTitle}
        fillRail
        style={styles.railCardFull}
      >
        {subjectSnapshot.length === 0 ? (
          <Text style={styles.emptyLine}>Add subjects to see progress at a glance.</Text>
        ) : (
          subjectSnapshot.map((row) => (
            <SubjectSnapshotRow
              key={row.subjectId}
              row={row}
              familyChildren={familyChildren}
              onNavigate={onNavigate}
              onEditSubject={onEditSubject}
              onAddEventForSubject={onAddEventForSubject}
            />
          ))
        )}
      </DashboardCard>
    </View>
  );
}

export default function ParentHomeDashboard({
  children = [],
  subjects = [],
  todayEvents = [],
  dueAssignments = [],
  pendingSubmissions = [],
  onNavigate,
  onAddEvent,
  onOpenEvent,
}) {
  const handleViewPlanner = () => onNavigate?.('planner', 'calendar');
  const handleViewSubmissions = () => onNavigate?.('learning', 'submissions');

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
                      showDueTag={['assignment', 'project'].includes(
                        String(event.event_type || event.type || '').toLowerCase()
                      )}
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

        <ParentHomeRightRail />
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
  railStack: {
    gap: 0,
    width: '100%',
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      alignSelf: 'stretch',
      overflow: 'hidden',
    }),
  },
  railCard: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    gap: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      flexGrow: 0,
      flexShrink: 0,
      height: 'calc((100% - 16px) / 2)',
      maxHeight: 'calc((100% - 16px) / 2)',
      minHeight: 'calc((100% - 16px) / 2)',
    }),
  },
  railCardFull: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      height: '100%',
      maxHeight: '100%',
      minHeight: '100%',
      flexGrow: 1,
      flexShrink: 1,
    }),
  },
  railCardHeader: {
    flexShrink: 0,
    marginBottom: 14,
  },
  railCardScroll: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
    }),
  },
  railCardScrollContent: {
    flexGrow: 1,
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
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  railSectionTitle: {
    color: '#1e293b',
    letterSpacing: -0.2,
    textTransform: 'none',
  },
  headerLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366F1',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyLine: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 20,
  },
  listGap: {
    gap: 10,
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
    color: '#64748B',
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
    color: '#1E293B',
    minWidth: 0,
  },
  eventMeta: {
    fontSize: 12,
    color: '#94A3B8',
  },
  dueTodayTag: {
    backgroundColor: '#FEF2F2',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dueTodayTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
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
    color: '#64748B',
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
    color: '#6366F1',
  },
  snapshotRow: {
    gap: 8,
    marginBottom: 4,
  },
  snapshotTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  snapshotMenuWrap: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
  },
  snapshotMenuBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
  },
  snapshotMenuBtnActive: {
    backgroundColor: '#F1F5F9',
  },
  snapshotTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  snapshotChildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  snapshotChildNames: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  snapshotName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
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
});
