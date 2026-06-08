import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
} from 'react-native';
import {
  ArrowLeft,
  MessageCircle,
  Plus,
  BookOpen,
  Upload,
  HelpCircle,
  MessageSquare,
  FileText,
} from 'lucide-react';
import LearningSubjectScheduleTab from './LearningSubjectScheduleTab';
import {
  formatGradeLabel,
  formatRelativeScheduleDate,
  getSubjectStatusDisplay,
} from '../../lib/subjectDisplayUtils';
import { formatDueShort } from '../tutor/tutorHelpUtils';

const TABS = [
  { key: 'activity', label: 'Activity' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'work', label: 'Work' },
  { key: 'resources', label: 'Resources' },
];

function getActivityGroupLabel(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfTarget - startOfToday) / (24 * 60 * 60 * 1000));
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff >= 2 && dayDiff <= 7) return 'Last Week';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildActivityItems({ events = [], assignments = [] }) {
  const items = [];

  (events || []).forEach((event) => {
    if (event?.status !== 'done') return;
    items.push({
      id: `event-${event.id}`,
      title: `${event.title || 'Lesson'} Completed`,
      timestamp: event.end_ts || event.start_ts || event.updated_at,
      icon: BookOpen,
      iconColor: '#059669',
    });
  });

  (assignments || []).forEach((assignment) => {
    const status = String(assignment?.status || '').toLowerCase();
    if (status === 'submitted' || assignment?.submitted_at) {
      items.push({
        id: `assignment-${assignment.id}`,
        title: `${assignment.title || 'Worksheet'} Submitted`,
        timestamp: assignment.submitted_at || assignment.updated_at || assignment.created_at,
        icon: Upload,
        iconColor: '#2563EB',
      });
    }
    if (assignment?.review_feedback && String(assignment.review_feedback).trim()) {
      items.push({
        id: `feedback-${assignment.id}`,
        title: 'Parent Left Feedback',
        subtitle: String(assignment.review_feedback).trim(),
        timestamp: assignment.updated_at || assignment.submitted_at || assignment.created_at,
        icon: MessageSquare,
        iconColor: '#7C3AED',
      });
    }
    if (assignment?.need_help) {
      items.push({
        id: `help-${assignment.id}`,
        title: 'Student Asked Question',
        subtitle: assignment?.help_message_log?.[assignment.help_message_log.length - 1]?.message
          || assignment?.help_message_log?.[assignment.help_message_log.length - 1]?.body
          || 'Help requested on an assignment',
        timestamp: assignment.updated_at || assignment.created_at,
        icon: HelpCircle,
        iconColor: '#EA580C',
      });
    }
  });

  return items
    .filter((item) => item.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function SummaryCard({ label, value, meta }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryCardLabel}>{label}</Text>
      <Text style={styles.summaryCardValue}>{value}</Text>
      {meta ? <Text style={styles.summaryCardMeta}>{meta}</Text> : null}
    </View>
  );
}

export default function LearningSubjectDetailView({
  subject,
  children = [],
  familyId = null,
  onBack,
  progressPercent = 0,
  progressCompleted = 0,
  progressTotal = 0,
  nextItem = null,
  status = 'on_track',
  subjectEvents = [],
  subjectAssignments = [],
  materials = [],
  assignmentsNeedingHelp = [],
  onCreateEvent,
  onMessage,
  onEventPress,
  onEventRightClick,
  onEventComplete,
  onAssignmentPress,
  onMaterialPress,
  onAddMaterial,
  canManageMaterials = false,
}) {
  const [activeTab, setActiveTab] = useState('activity');
  const statusDisplay = getSubjectStatusDisplay(status, progressPercent, progressCompleted);
  const assignedChildIds = subject?.child_id
    ? String(subject.child_id).split(';').map((id) => id.trim()).filter(Boolean)
    : [];
  const primaryChild = children.find((c) => assignedChildIds.includes(String(c.id)))
    || children.find((c) => subjectEvents.some((ev) => String(ev.child_id) === String(c.id)));
  const studentName = primaryChild?.name || primaryChild?.first_name || 'Student';
  const gradeLabel = formatGradeLabel(primaryChild);
  const studentLine = [studentName, gradeLabel].filter(Boolean).join(' • ');
  const percent = progressPercent ?? (progressTotal > 0 ? Math.round((progressCompleted / progressTotal) * 100) : 0);
  const progressLine = progressTotal > 0
    ? `${progressCompleted} / ${progressTotal} Lessons`
    : `${percent}% complete`;

  const pendingSubmissions = subjectAssignments.filter((row) => {
    const statusValue = String(row?.status || '').toLowerCase();
    return statusValue === 'submitted'
      && (row?.review_status == null || row.review_status === 'needs_revision');
  }).length;

  const upcomingCount = subjectEvents.filter((ev) => {
    if (ev?.status === 'done' || ev?.status === 'canceled') return false;
    const anchor = ev?.start_ts || ev?.due_ts;
    return anchor && new Date(anchor) > new Date();
  }).length;

  const unreadMessages = (assignmentsNeedingHelp || []).length;

  const activityItems = useMemo(
    () => buildActivityItems({ events: subjectEvents, assignments: subjectAssignments }),
    [subjectEvents, subjectAssignments]
  );

  const groupedActivity = useMemo(() => {
    const groups = [];
    const map = new Map();
    activityItems.forEach((item) => {
      const label = getActivityGroupLabel(item.timestamp);
      if (!map.has(label)) {
        const group = { label, items: [] };
        map.set(label, group);
        groups.push(group);
      }
      map.get(label).items.push(item);
    });
    return groups;
  }, [activityItems]);

  const todoAssignments = useMemo(
    () => subjectAssignments
      .filter((row) => {
        const statusValue = String(row?.status || '').toLowerCase();
        return statusValue === 'not_started' || statusValue === 'in_progress';
      })
      .sort((a, b) => String(a.due_date || a.start_work_by || '').localeCompare(String(b.due_date || b.start_work_by || ''))),
    [subjectAssignments]
  );

  const submittedAssignments = useMemo(
    () => subjectAssignments
      .filter((row) => String(row?.status || '').toLowerCase() === 'submitted')
      .sort((a, b) => String(b.submitted_at || b.updated_at || '').localeCompare(String(a.submitted_at || a.updated_at || ''))),
    [subjectAssignments]
  );

  const nextLine = nextItem
    ? `Next: ${nextItem.title || 'Upcoming lesson'} · ${formatRelativeScheduleDate(
      nextItem.startTs || nextItem.dueDate || nextItem.start_ts || nextItem.due_ts
    )}`
    : null;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backLink} onPress={onBack} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
          <ArrowLeft size={15} color="#64748B" />
          <Text style={styles.backLinkText}>Learning</Text>
        </TouchableOpacity>

        <View style={styles.compactHeader}>
          <View style={styles.compactHeaderTop}>
            <View style={styles.compactHeaderText}>
              <Text style={styles.subjectTitle}>{subject?.name || 'Subject'}</Text>
              {studentLine ? <Text style={styles.subjectMeta}>{studentLine}</Text> : null}
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.headerActionBtn} onPress={onCreateEvent} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                <Plus size={14} color="#0F172A" />
                <Text style={styles.headerActionText}>Create Event</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerActionBtn} onPress={onMessage} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                <MessageCircle size={14} color="#0F172A" />
                <Text style={styles.headerActionText}>Message</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.compactHeaderMeta}>
            <View style={[styles.statusPill, { backgroundColor: statusDisplay.bg }]}>
              <Text style={[styles.statusPillText, { color: statusDisplay.color }]}>
                {statusDisplay.label}
              </Text>
            </View>
            <Text style={styles.metaDot}>·</Text>
            <Text style={styles.metaText}>{progressLine}</Text>
            {nextLine ? (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.metaText} numberOfLines={1}>{nextLine}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.summaryRow}>
          <SummaryCard
            label="Progress"
            value={progressTotal > 0 ? `${progressCompleted} / ${progressTotal} Lessons` : `${percent}%`}
            meta={statusDisplay.label}
          />
          <SummaryCard
            label="Upcoming"
            value={`${upcomingCount} Event${upcomingCount === 1 ? '' : 's'}`}
            meta={nextLine ? nextLine.replace('Next: ', '') : 'Nothing scheduled'}
          />
          <SummaryCard
            label="Submissions"
            value={pendingSubmissions === 1 ? '1 Waiting' : `${pendingSubmissions} Waiting`}
            meta={pendingSubmissions === 1 ? 'Awaiting review' : pendingSubmissions > 0 ? 'Need review' : 'All caught up'}
          />
          <SummaryCard
            label="Messages"
            value={unreadMessages === 1 ? '1 Unread' : `${unreadMessages} Unread`}
            meta={unreadMessages > 0 ? 'Needs response' : 'No unread'}
          />
        </View>

        <View style={styles.tabBar}>
          {TABS.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabBtn, activeTab === tab.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(tab.key)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={[styles.tabBtnText, activeTab === tab.key && styles.tabBtnTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'activity' ? (
          <View style={styles.panel}>
            {groupedActivity.length === 0 ? (
              <Text style={styles.emptyText}>Activity will appear here as lessons are completed and work is submitted.</Text>
            ) : (
              groupedActivity.map((group) => (
                <View key={group.label} style={styles.activityGroup}>
                  <Text style={styles.activityGroupLabel}>{group.label}</Text>
                  <View style={styles.activityDivider} />
                  {group.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <View key={item.id} style={styles.activityRow}>
                        <View style={[styles.activityIconWrap, { backgroundColor: `${item.iconColor}14` }]}>
                          <ItemIcon size={15} color={item.iconColor} />
                        </View>
                        <View style={styles.activityTextWrap}>
                          <Text style={styles.activityTitle}>{item.title}</Text>
                          {item.subtitle ? (
                            <Text style={styles.activitySubtitle} numberOfLines={2}>{item.subtitle}</Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </View>
        ) : null}

        {activeTab === 'schedule' ? (
          <View style={styles.panel}>
            <LearningSubjectScheduleTab
              events={subjectEvents}
              children={children}
              familyId={familyId}
              onEventPress={onEventPress}
              onEventRightClick={onEventRightClick}
              onEventComplete={onEventComplete}
            />
          </View>
        ) : null}

        {activeTab === 'work' ? (
          <View style={styles.panel}>
            <Text style={styles.workSectionTitle}>To Do</Text>
            {todoAssignments.length === 0 ? (
              <Text style={styles.emptySectionText}>Nothing due right now.</Text>
            ) : (
              todoAssignments.map((assignment) => (
                <TouchableOpacity
                  key={assignment.id}
                  style={styles.workRow}
                  onPress={() => onAssignmentPress?.(assignment)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.workRowBody}>
                    <Text style={styles.workRowTitle}>{assignment.title || 'Assignment'}</Text>
                    <Text style={styles.workRowMeta}>
                      {formatDueShort(assignment.due_date || assignment.start_work_by) || 'No due date'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            <Text style={[styles.workSectionTitle, styles.workSectionTitleSpaced]}>Submitted</Text>
            {submittedAssignments.length === 0 ? (
              <Text style={styles.emptySectionText}>No submitted work yet.</Text>
            ) : (
              submittedAssignments.map((assignment) => {
                const awaitingReview = assignment.review_status == null
                  || assignment.review_status === 'needs_revision';
                return (
                  <TouchableOpacity
                    key={assignment.id}
                    style={styles.workRow}
                    onPress={() => onAssignmentPress?.(assignment)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <View style={styles.workRowBody}>
                      <Text style={styles.workRowTitle}>{assignment.title || 'Assignment'}</Text>
                      <Text style={styles.workRowMeta}>
                        Submitted{awaitingReview ? ' · Awaiting review' : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : null}

        {activeTab === 'resources' ? (
          <View style={styles.panel}>
            {canManageMaterials ? (
              <TouchableOpacity style={styles.addResourceBtn} onPress={onAddMaterial} {...(Platform.OS === 'web' && { cursor: 'pointer' })}>
                <Plus size={15} color="#2563EB" />
                <Text style={styles.addResourceBtnText}>Add resource</Text>
              </TouchableOpacity>
            ) : null}
            {materials.length === 0 ? (
              <Text style={styles.emptyText}>No resources linked to this subject yet.</Text>
            ) : (
              materials.map((material) => (
                <TouchableOpacity
                  key={material.id}
                  style={styles.workRow}
                  onPress={() => onMaterialPress?.(material)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.workRowBody}>
                    <Text style={styles.workRowTitle}>{material.title || material.provider_name || 'Resource'}</Text>
                    <Text style={styles.workRowMeta}>Resource</Text>
                  </View>
                  <FileText size={16} color="#94A3B8" />
                </TouchableOpacity>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 28,
    paddingTop: 16,
    paddingBottom: 40,
    gap: 18,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  compactHeader: {
    gap: 10,
    paddingBottom: 4,
  },
  compactHeaderTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap',
  },
  compactHeaderText: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
  subjectTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
  },
  subjectMeta: {
    fontSize: 14,
    color: '#64748B',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  compactHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  metaDot: {
    fontSize: 13,
    color: '#CBD5E1',
  },
  metaText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
    flexShrink: 1,
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8EDF3',
    backgroundColor: '#FAFBFC',
    gap: 4,
  },
  summaryCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  summaryCardValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  summaryCardMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  tabBar: {
    flexDirection: 'row',
    gap: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E8EDF3',
  },
  tabBtn: {
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  tabBtnActive: {
    borderBottomColor: '#2563EB',
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#2563EB',
  },
  panel: {
    gap: 12,
    paddingTop: 4,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
  },
  activityGroup: {
    gap: 10,
    marginBottom: 18,
  },
  activityGroupLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  activityDivider: {
    height: 1,
    backgroundColor: '#EEF2F7',
  },
  activityRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  activityIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTextWrap: {
    flex: 1,
    gap: 2,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  activitySubtitle: {
    fontSize: 13,
    color: '#64748B',
  },
  workSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  workSectionTitleSpaced: {
    marginTop: 18,
  },
  emptySectionText: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 4,
  },
  workRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  workRowBody: {
    flex: 1,
    gap: 2,
  },
  workRowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  workRowMeta: {
    fontSize: 13,
    color: '#64748B',
  },
  addResourceBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
  },
  addResourceBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
  },
});
