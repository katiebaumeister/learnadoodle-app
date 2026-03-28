/**
 * Child home right rail — matches parent rail chrome, copy & behavior tuned for learners.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Platform,
  TextInput,
} from 'react-native';
import { FileText, Calendar } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { getAssignments } from '../../lib/services/assignmentsClient';
import AskParentHelpModal from './AskParentHelpModal';
import StudentHelpHistoryModal from './StudentHelpHistoryModal';
import {
  categorizeAssignmentsForChildHelp,
  filterPlannerEventsForHelp,
  formatAssignmentDueLine,
  formatAssignmentStatus,
  formatSchoolEventTypeLabel,
  isSchoolWorkEventType,
  linkedEventIdsFromAssignments,
  assignmentNeedsUrgentSubmissionsAttention,
  primaryAttentionStatusLabel,
  secondaryAttentionContextLine,
  primaryCompletedStatusLabel,
  partitionComingUpEvents,
  collectParentAssignedLinkedEventIds,
  filterEventsForComingUpRail,
} from './childHomeRailHelpers';
import { colors } from '../../theme/colors';
import { useToast } from '../Toast';

const TABS = [
  { id: 'submissions', label: 'Submissions' },
  { id: 'help', label: 'Help' },
  { id: 'coming_up', label: 'Coming up' },
];

const LIMIT = 8;

export default function ChildHomeRightRail({ familyId, childId }) {
  const toast = useToast();
  const session = useSession();
  const [selectedSection, setSelectedSection] = useState('submissions');
  const [assignments, setAssignments] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [helpSearch, setHelpSearch] = useState('');
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [helpModalAssignment, setHelpModalAssignment] = useState(null);
  const [helpModalEvent, setHelpModalEvent] = useState(null);
  const [plannerEventsForRail, setPlannerEventsForRail] = useState([]);
  const [helpHistoryVisible, setHelpHistoryVisible] = useState(false);
  const [helpHistoryAssignment, setHelpHistoryAssignment] = useState(null);

  const loadData = async () => {
    if (!familyId || !childId) return;
    try {
      await Promise.all([loadAssignments(), loadUpcomingEvents(), loadPlannerEventsForHelp()]);
    } catch (e) {
      console.error('[ChildHomeRightRail]', e);
    } finally {
      setDataReady(true);
    }
  };

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    if (session && !session.loading && familyId && childId) {
      loadData();
    }
  }, [session, familyId, childId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => loadDataRef.current();
    window.addEventListener('childAssignmentsNeedRefresh', handler);
    window.addEventListener('refreshCalendar', handler);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', handler);
      window.removeEventListener('refreshCalendar', handler);
    };
  }, []);

  const loadAssignments = async () => {
    const { data, error } = await getAssignments(childId);
    if (error) {
      setAssignments([]);
      return;
    }
    setAssignments(data || []);
  };

  const loadUpcomingEvents = async () => {
    try {
      const now = new Date();
      const horizon = new Date(now);
      horizon.setDate(horizon.getDate() + 30);
      horizon.setHours(23, 59, 59, 999);

      const { data: assignRows, error: assignErr } = await supabase
        .from('assignments')
        .select('linked_event_ids, assigned_by')
        .eq('family_id', familyId)
        .eq('child_id', childId)
        .not('assigned_by', 'is', null);
      if (assignErr && assignErr.code !== '42P01' && assignErr.code !== 'PGRST200') {
        console.error('[ChildHomeRightRail] linked assignments:', assignErr);
      }
      const parentAssignedEventIds = collectParentAssignedLinkedEventIds(assignRows || []);

      let q = supabase
        .from('events')
        .select(`
          id,
          title,
          start_ts,
          end_ts,
          child_id,
          subject_id,
          status,
          event_type,
          child:child_id (id, first_name, avatar)
        `)
        .eq('family_id', familyId)
        .eq('child_id', childId)
        .gte('start_ts', now.toISOString())
        .lte('start_ts', horizon.toISOString())
        .in('status', ['scheduled', 'in_progress'])
        .is('deleted_at', null)
        .order('start_ts', { ascending: true })
        .limit(40);

      const { data, error } = await q;
      if (error) {
        setUpcomingEvents([]);
        return;
      }

      const raw = data || [];
      const filtered = filterEventsForComingUpRail(raw, parentAssignedEventIds);

      const subjectIds = [...new Set(filtered.map((e) => e.subject_id).filter(Boolean))];
      let subjectsMap = {};
      if (subjectIds.length > 0) {
        const { data: subjectsData } = await supabase.from('subject').select('id, name').in('id', subjectIds);
        if (subjectsData) {
          subjectsMap = subjectsData.reduce((acc, sub) => {
            acc[sub.id] = sub;
            return acc;
          }, {});
        }
      }

      setUpcomingEvents(
        filtered.map((event) => ({
          ...event,
          subject: event.subject_id ? subjectsMap[event.subject_id] : null,
        }))
      );
    } catch (e) {
      setUpcomingEvents([]);
    }
  };

  /** Planner schoolwork in a window around “today” for Help (lessons w/o assignment rows, etc.). */
  const loadPlannerEventsForHelp = async () => {
    try {
      const from = new Date();
      from.setDate(from.getDate() - 14);
      from.setHours(0, 0, 0, 0);
      const to = new Date();
      to.setDate(to.getDate() + 42);
      to.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('events')
        .select(
          `
          id,
          title,
          start_ts,
          end_ts,
          child_id,
          subject_id,
          status,
          event_type,
          child:child_id (id, first_name, avatar)
        `
        )
        .eq('family_id', familyId)
        .eq('child_id', childId)
        .gte('start_ts', from.toISOString())
        .lte('start_ts', to.toISOString())
        .in('status', ['scheduled', 'in_progress', 'done'])
        .is('deleted_at', null)
        .order('start_ts', { ascending: false })
        .limit(80);

      if (error) {
        setPlannerEventsForRail([]);
        return;
      }

      const raw = data || [];
      const schoolOnly = raw.filter((e) => isSchoolWorkEventType(e.event_type));

      const subjectIds = [...new Set(schoolOnly.map((e) => e.subject_id).filter(Boolean))];
      let subjectsMap = {};
      if (subjectIds.length > 0) {
        const { data: subjectsData } = await supabase.from('subject').select('id, name').in('id', subjectIds);
        if (subjectsData) {
          subjectsMap = subjectsData.reduce((acc, sub) => {
            acc[sub.id] = sub;
            return acc;
          }, {});
        }
      }

      setPlannerEventsForRail(
        schoolOnly.map((event) => ({
          ...event,
          subject: event.subject_id ? subjectsMap[event.subject_id] : null,
        }))
      );
    } catch (e) {
      setPlannerEventsForRail([]);
    }
  };

  const submissionsUrgent = useMemo(() => {
    return (assignments || [])
      .filter((a) => assignmentNeedsUrgentSubmissionsAttention(a))
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
      )
      .slice(0, LIMIT);
  }, [assignments]);

  const submissionsUrgentBadgeCount = submissionsUrgent.length;

  const submissionsCompleted = useMemo(() => {
    return (assignments || [])
      .filter((a) => {
        const s = (a.status || '').toLowerCase();
        if (assignmentNeedsUrgentSubmissionsAttention(a)) return false;
        return ['submitted', 'accepted', 'reviewed'].includes(s);
      })
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
      )
      .slice(0, LIMIT);
  }, [assignments]);

  const comingUpBuckets = useMemo(() => partitionComingUpEvents(upcomingEvents), [upcomingEvents]);

  const helpBuckets = useMemo(
    () => categorizeAssignmentsForChildHelp(assignments, { search: helpSearch }),
    [assignments, helpSearch]
  );

  const linkedEventIds = useMemo(() => linkedEventIdsFromAssignments(assignments), [assignments]);

  const plannerEventsHelpList = useMemo(
    () => filterPlannerEventsForHelp(plannerEventsForRail, linkedEventIds, { search: helpSearch }),
    [plannerEventsForRail, linkedEventIds, helpSearch]
  );

  const subjectName = (a) => a?.subject?.name || a?.related_subject?.name || null;

  const openHelpForAssignment = (a) => {
    setHelpModalEvent(null);
    setHelpModalAssignment(a);
    setHelpModalOpen(true);
  };

  const openHelpForPlannerEvent = (ev) => {
    setHelpModalAssignment(null);
    setHelpModalEvent({
      id: ev.id,
      title: ev.title,
      start_ts: ev.start_ts,
      end_ts: ev.end_ts,
    });
    setHelpModalOpen(true);
  };

  const formatEventDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const eventDate = new Date(date);
    eventDate.setHours(0, 0, 0, 0);
    if (eventDate.getTime() === today.getTime()) return 'Today';
    if (eventDate.getTime() === tomorrow.getTime()) return 'Tomorrow';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatEventTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const renderUnifiedHelpRow = ({
    rowKey,
    title,
    metaLine,
    sourceTag,
    onCta,
    onAskAnother,
    onAskedPress,
    ctaLabel = 'Ask for help',
    ctaDisabled = false,
    ctaDone = false,
  }) => (
    <View key={rowKey} style={styles.helpRow}>
      <View style={styles.helpRowMain}>
        <Text style={styles.helpRowTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.helpRowMeta}>{metaLine}</Text>
        {sourceTag ? <Text style={styles.helpRowSource}>{sourceTag}</Text> : null}
      </View>
      {ctaDone ? (
        <View style={styles.helpAskedColumn}>
          {onAskedPress ? (
            <TouchableOpacity
              onPress={onAskedPress}
              accessibilityRole="button"
              accessibilityLabel="View what you sent"
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <View style={styles.askedPill}>
                <Text style={styles.askedPillText}>Asked</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.askedPill}>
              <Text style={styles.askedPillText}>Asked</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={onAskAnother}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.askAnotherLink}>Ask another question</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.helpCta, ctaDisabled && styles.helpCtaDone]}
          onPress={onCta}
          disabled={ctaDisabled}
          {...(Platform.OS === 'web' && { cursor: ctaDisabled ? 'default' : 'pointer' })}
        >
          <Text style={styles.helpCtaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const renderPlannerEventHelpRow = (ev) => {
    const et = formatSchoolEventTypeLabel(ev.event_type);
    const sn = ev.subject?.name;
    const metaLine = [et, formatEventDate(ev.start_ts), formatEventTime(ev.start_ts), sn].filter(Boolean).join(' · ');
    return renderUnifiedHelpRow({
      rowKey: `ev-${ev.id}`,
      title: ev.title || 'Schoolwork',
      metaLine,
      sourceTag: 'Planner',
      onCta: () => openHelpForPlannerEvent(ev),
    });
  };

  const renderAssignmentHelpRow = (a, ctaLabel = 'Ask for help') => {
    const sn = subjectName(a);
    const metaLine = [formatAssignmentDueLine(a), formatAssignmentStatus(a), sn].filter(Boolean).join(' · ');
    return renderUnifiedHelpRow({
      rowKey: a.id,
      title: a.title || 'Schoolwork',
      metaLine,
      sourceTag: 'Assignment',
      onCta: () => openHelpForAssignment(a),
      onAskAnother: () => openHelpForAssignment(a),
      onAskedPress: () => {
        setHelpHistoryAssignment(a);
        setHelpHistoryVisible(true);
      },
      ctaLabel,
      ctaDisabled: false,
      ctaDone: !!a.need_help,
    });
  };

  const renderBody = () => {
    if (!dataReady) {
      return (
        <View style={styles.bodyFill}>
          <Text style={styles.mutedSmall}>Loading…</Text>
        </View>
      );
    }

    if (selectedSection === 'submissions') {
      const hasUrgent = submissionsUrgent.length > 0;
      const hasCompleted = submissionsCompleted.length > 0;
      if (!hasUrgent && !hasCompleted) {
        return (
          <View style={[styles.bodyFill, styles.emptyCenter]}>
            <View style={styles.emptyBlock}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyHint}>
                When your parent sends you assignments or you submit work, it will show up here.
              </Text>
            </View>
          </View>
        );
      }
      return (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {hasUrgent ? (
            <View style={styles.submissionsSection}>
              <Text style={styles.helpSectionLabel}>Needs your attention</Text>
              {submissionsUrgent.map((a) => {
                const primary = primaryAttentionStatusLabel(a);
                const isRevision = (a.review_status || '').toLowerCase() === 'needs_revision';
                const secondary = secondaryAttentionContextLine(a, subjectName(a) || '');
                return (
                  <View key={a.id} style={styles.item}>
                    <View style={styles.itemLeft}>
                      <View style={[styles.itemIcon, { backgroundColor: colors.orangeSoft }]}>
                        <FileText size={14} color={colors.orangeBold} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.itemTitle} numberOfLines={2}>
                          {a.title || 'Schoolwork'}
                        </Text>
                        <View
                          style={[
                            styles.primaryStatusPill,
                            isRevision ? styles.primaryStatusPillRevision : styles.primaryStatusPillAction,
                          ]}
                        >
                          <Text
                            style={[
                              styles.primaryStatusPillText,
                              isRevision ? styles.primaryStatusPillTextRevision : null,
                            ]}
                          >
                            {primary}
                          </Text>
                        </View>
                        {secondary ? <Text style={styles.metaSecondaryLine}>{secondary}</Text> : null}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
          {hasCompleted ? (
            <View style={[styles.submissionsSection, hasUrgent && { marginTop: 4 }]}>
              <Text style={styles.helpSectionLabel}>Submitted</Text>
              {submissionsCompleted.map((a) => {
                const doneLabel = primaryCompletedStatusLabel(a);
                return (
                  <View key={a.id} style={styles.item}>
                    <View style={styles.itemLeft}>
                      <View style={[styles.itemIcon, { backgroundColor: colors.blueBold + '15' }]}>
                        <FileText size={14} color={colors.blueBold} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.itemTitle} numberOfLines={2}>
                          {a.title || 'Submitted work'}
                        </Text>
                        <View style={[styles.primaryStatusPill, styles.primaryStatusPillNeutral]}>
                          <Text style={styles.primaryStatusPillTextNeutral}>{doneLabel}</Text>
                        </View>
                        <Text style={styles.metaSecondaryLine}>
                          {a.updated_at
                            ? new Date(a.updated_at).toLocaleDateString()
                            : 'Recently'}
                          {subjectName(a) ? ` · ${subjectName(a)}` : ''}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      );
    }

    if (selectedSection === 'help') {
      const { upcomingWork, gradedQuestions, recent } = helpBuckets;
      const hasAny =
        upcomingWork.length +
          gradedQuestions.length +
          recent.length +
          plannerEventsHelpList.length >
        0;

      return (
        <View style={styles.helpColumn}>
          <TextInput
            style={styles.search}
            placeholder="Search schoolwork"
            placeholderTextColor={colors.muted}
            value={helpSearch}
            onChangeText={setHelpSearch}
          />
          {!hasAny ? (
            <View style={[styles.bodyFill, styles.emptyCenter]}>
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>No schoolwork to ask about yet</Text>
                <Text style={styles.emptyHint}>
                  Lessons, projects, exams, and assignments from your planner show up here so you can ask
                  for help.
                </Text>
              </View>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {plannerEventsHelpList.length > 0 ? (
                <View style={styles.helpSection}>
                  <Text style={styles.helpSectionLabel}>Schoolwork</Text>
                  {plannerEventsHelpList.map((ev) => renderPlannerEventHelpRow(ev))}
                </View>
              ) : null}
              {upcomingWork.length > 0 ? (
                <View style={styles.helpSection}>
                  {upcomingWork.map((a) => renderAssignmentHelpRow(a))}
                </View>
              ) : null}
              {gradedQuestions.length > 0 ? (
                <View style={styles.helpSection}>
                  <Text style={styles.helpSectionLabel}>Questions about graded work</Text>
                  {gradedQuestions.map((a) => renderAssignmentHelpRow(a, 'Send question'))}
                </View>
              ) : null}
              {recent.length > 0 ? (
                <View style={styles.helpSection}>
                  <Text style={styles.helpSectionLabel}>Recent assignments</Text>
                  {recent.map((a) => renderAssignmentHelpRow(a))}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      );
    }

    /* coming up */
    if (upcomingEvents.length === 0) {
      return (
        <View style={[styles.bodyFill, styles.emptyCenter]}>
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>Nothing coming up yet</Text>
            <Text style={styles.emptyHint}>
              Lessons, projects, exams, and other schoolwork on your schedule will appear here.
            </Text>
          </View>
        </View>
      );
    }

    const comingOrder = [
      { key: 'today', label: 'Today' },
      { key: 'this_week', label: 'This week' },
      { key: 'later', label: 'Later' },
    ];
    let comingUpNearIndex = 0;

    return (
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        {comingOrder.map(({ key, label }) => {
          const list = comingUpBuckets[key] || [];
          if (!list.length) return null;
          return (
            <View key={key} style={styles.comingUpSection}>
              <Text style={styles.comingUpSectionLabel}>{label}</Text>
              {list.map((event) => {
                const isNear = comingUpNearIndex < 3;
                comingUpNearIndex += 1;
                const sn = event.subject?.name;
                const metaLine = [
                  formatSchoolEventTypeLabel(event.event_type),
                  formatEventDate(event.start_ts),
                  formatEventTime(event.start_ts),
                  sn,
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <TouchableOpacity
                    key={event.id}
                    style={[styles.item, isNear ? styles.comingUpRowNear : styles.comingUpRowFar]}
                    {...(Platform.OS === 'web' && { cursor: 'default' })}
                  >
                    <View style={styles.itemLeft}>
                      <View style={[styles.itemIcon, { backgroundColor: colors.blueBold + '15' }]}>
                        <Calendar size={14} color={colors.blueBold} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={[styles.itemTitle, isNear ? styles.comingUpTitleNear : styles.comingUpTitleFar]}
                          numberOfLines={2}
                        >
                          {event.title}
                        </Text>
                        <Text style={[styles.itemDate, isNear ? null : styles.comingUpMetaFar]}>{metaLine}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  return (
    <>
      <View style={styles.outer}>
        <View style={styles.container}>
          <View style={styles.tabs}>
            {TABS.map((tab) => {
              const active = selectedSection === tab.id;
              const badgeCount =
                tab.id === 'submissions' ? submissionsUrgentBadgeCount : 0;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => setSelectedSection(tab.id)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.tabInner}>
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
                    {badgeCount > 0 ? (
                      <View style={styles.tabBadge}>
                        <Text style={styles.tabBadgeText}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
                      </View>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.bodyScrollWrap}>{renderBody()}</View>
        </View>
      </View>

      <AskParentHelpModal
        visible={helpModalOpen}
        onClose={() => {
          setHelpModalOpen(false);
          setHelpModalAssignment(null);
          setHelpModalEvent(null);
        }}
        onSent={() => {
          toast.push('Sent to your parent', 'success');
          loadData();
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('childAssignmentsNeedRefresh'));
          }
        }}
        familyId={familyId}
        childId={childId}
        assignment={helpModalAssignment}
        eventContext={helpModalEvent}
      />

      <StudentHelpHistoryModal
        visible={helpHistoryVisible}
        onClose={() => {
          setHelpHistoryVisible(false);
          setHelpHistoryAssignment(null);
        }}
        assignment={helpHistoryAssignment}
        contextTitle={helpHistoryAssignment?.title || undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    flexDirection: 'column',
    alignSelf: 'stretch',
    minHeight: 0,
    width: '100%',
    ...(Platform.OS === 'web' && {
      height: '100%',
    }),
  },
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      height: '100%',
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    }),
  },
  bodyScrollWrap: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
    }),
  },
  bodyFill: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  emptyCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  helpColumn: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
    width: '100%',
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    flexWrap: 'nowrap',
  },
  tabBadge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(249, 115, 22, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabActive: {
    borderColor: 'rgba(139, 92, 246, 0.5)',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabTextActive: {
    color: 'rgba(99, 102, 241, 1)',
    fontWeight: '600',
  },
  search: {
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 10,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    flex: 1,
    flexGrow: 1,
    ...(Platform.OS === 'web' && {
      minHeight: 0,
    }),
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  itemIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemDate: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyBlock: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyHint: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mutedSmall: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    padding: 8,
  },
  submissionsSection: {
    marginBottom: 4,
  },
  primaryStatusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
    marginBottom: 2,
  },
  primaryStatusPillAction: {
    backgroundColor: 'rgba(79, 70, 229, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(79, 70, 229, 0.28)',
  },
  primaryStatusPillRevision: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(249, 115, 22, 0.35)',
  },
  primaryStatusPillNeutral: {
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
  },
  primaryStatusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(79, 70, 229, 1)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryStatusPillTextRevision: {
    color: colors.orangeBold,
  },
  primaryStatusPillTextNeutral: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  metaSecondaryLine: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  comingUpSection: {
    marginBottom: 10,
  },
  comingUpSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  comingUpRowNear: {},
  comingUpRowFar: {
    opacity: 0.88,
  },
  comingUpTitleNear: {
    fontWeight: '600',
  },
  comingUpTitleFar: {
    fontWeight: '500',
  },
  comingUpMetaFar: {
    opacity: 0.9,
  },
  helpSection: {
    marginBottom: 14,
  },
  helpSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.9)',
  },
  helpRowMain: {
    flex: 1,
    minWidth: 0,
  },
  helpRowTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  helpRowMeta: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  helpRowSource: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 3,
    letterSpacing: 0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  helpCta: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(79, 70, 229, 1)',
    flexShrink: 0,
  },
  helpCtaDone: {
    backgroundColor: 'rgba(148, 163, 184, 0.35)',
  },
  helpCtaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  helpCtaTextDone: {
    color: '#334155',
  },
  helpAskedColumn: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
    maxWidth: 120,
  },
  askedPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#EBF5FF',
    borderWidth: 1,
    borderColor: '#89B5E4',
  },
  askedPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#89B5E4',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  askAnotherLink: {
    fontSize: 11,
    fontWeight: '600',
    color: '#89B5E4',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
