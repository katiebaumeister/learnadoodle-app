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
} from 'react-native';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { getAssignments } from '../../lib/services/assignmentsClient';
import AskParentHelpModal from './AskParentHelpModal';
import {
  formatSchoolEventTypeLabel,
  isSchoolWorkEventType,
  assignmentNeedsUrgentSubmissionsAttention,
} from './childHomeRailHelpers';
import { colors } from '../../theme/colors';
import { useToast } from '../Toast';

const TABS = [
  { id: 'help', label: 'Discussions' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'coming_up', label: 'Coming up' },
];

const LIMIT = 8;

export default function ChildHomeRightRail({ familyId, childId }) {
  const toast = useToast();
  const session = useSession();
  const [selectedSection, setSelectedSection] = useState('help');
  const [assignments, setAssignments] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [helpModalAssignment, setHelpModalAssignment] = useState(null);
  const [helpModalEvent, setHelpModalEvent] = useState(null);
  const [linkedEventsById, setLinkedEventsById] = useState({});

  const loadData = async () => {
    if (!familyId || !childId) return;
    try {
      await Promise.all([loadAssignments(), loadUpcomingEvents()]);
    } catch (e) {
      console.error('[ChildHomeRightRail]', e);
    } finally {
      setDataReady(true);
    }
  };

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  const sessionLoading = session?.loading;
  useEffect(() => {
    if (sessionLoading !== false || !familyId || !childId || !session) return;
    loadData();
  }, [sessionLoading, familyId, childId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = () => loadDataRef.current();
    window.addEventListener('childAssignmentsNeedRefresh', handler);
    window.addEventListener('refreshCalendar', handler);
    window.addEventListener('refreshRightRail', handler);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', handler);
      window.removeEventListener('refreshCalendar', handler);
      window.removeEventListener('refreshRightRail', handler);
    };
  }, []);

  const loadAssignments = async () => {
    const { data, error } = await getAssignments(childId);
    if (error) {
      setAssignments([]);
      return;
    }
    const baseRows = Array.isArray(data) ? data : [];
    if (baseRows.length === 0) {
      setAssignments([]);
      return;
    }
    try {
      const ids = baseRows.map((row) => row?.id).filter(Boolean);
      if (ids.length === 0) {
        setAssignments(baseRows);
        return;
      }
      const { data: reviewRows, error: reviewErr } = await supabase
        .from('assignments')
        .select('id, review_status, review_feedback, reviewed_at')
        .in('id', ids);
      if (reviewErr || !Array.isArray(reviewRows)) {
        setAssignments(baseRows);
        return;
      }
      const reviewById = new Map(reviewRows.map((row) => [String(row.id), row]));
      const merged = baseRows.map((row) => {
        const review = reviewById.get(String(row?.id || '')) || null;
        if (!review) return row;
        return {
          ...row,
          review_status: review.review_status ?? row.review_status ?? null,
          review_feedback: review.review_feedback ?? row.review_feedback ?? null,
          reviewed_at: review.reviewed_at ?? row.reviewed_at ?? null,
        };
      });
      setAssignments(merged);
    } catch (_) {
      setAssignments(baseRows);
    }
  };

  const loadUpcomingEvents = async () => {
    try {
      const now = new Date();
      const horizon = new Date(now);
      horizon.setDate(horizon.getDate() + 30);
      horizon.setHours(23, 59, 59, 999);

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
      const filtered = raw.filter((event) => isSchoolWorkEventType(event?.event_type));

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

  const parseHelpLogEntries = (assignment) => {
    const raw = assignment?.help_message_log;
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  };

  const hasCorrespondence = (assignment) => {
    const status = String(assignment?.status || '').trim().toLowerCase();
    const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
    if (assignment?.need_help) return true;
    if (['submitted', 'accepted', 'reviewed'].includes(status)) return true;
    if (['needs_revision', 'reviewed', 'approved'].includes(reviewStatus)) return true;
    return parseHelpLogEntries(assignment).length > 0;
  };

  const correspondenceAssignments = useMemo(() => {
    return (assignments || [])
      .filter((a) => hasCorrespondence(a))
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime()
      );
  }, [assignments]);

  useEffect(() => {
    const loadLinkedEvents = async () => {
      const ids = [...new Set(
        (assignments || [])
          .map((a) => linkedEventIdForAssignment(a))
          .filter(Boolean)
      )];
      if (ids.length === 0) {
        setLinkedEventsById({});
        return;
      }
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, event_type, start_ts')
          .in('id', ids);
        if (error || !Array.isArray(data)) {
          setLinkedEventsById({});
          return;
        }
        const next = {};
        data.forEach((row) => {
          if (row?.id) next[String(row.id)] = row;
        });
        setLinkedEventsById(next);
      } catch (_) {
        setLinkedEventsById({});
      }
    };
    loadLinkedEvents();
  }, [assignments]);

  const submissionsUrgent = useMemo(() => {
    return correspondenceAssignments
      .filter((a) => assignmentNeedsUrgentSubmissionsAttention(a))
      .slice(0, LIMIT);
  }, [correspondenceAssignments]);

  const submissionsUrgentBadgeCount = submissionsUrgent.length;

  const submissionsCompleted = useMemo(() => {
    return correspondenceAssignments
      .filter((a) => {
        const s = (a.status || '').toLowerCase();
        if (assignmentNeedsUrgentSubmissionsAttention(a)) return false;
        return ['submitted', 'accepted', 'reviewed'].includes(s);
      })
      .slice(0, LIMIT);
  }, [correspondenceAssignments]);

  const openHelpForAssignment = (a) => {
    setHelpModalEvent(null);
    setHelpModalAssignment(a);
    setHelpModalOpen(true);
  };

  const linkedEventIdForAssignment = (assignment) => {
    const raw = assignment?.linked_event_ids;
    if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0]);
      } catch (_) {
        return null;
      }
    }
    return null;
  };

  const openSubmitForAssignment = (assignment) => {
    const linkedEventId = linkedEventIdForAssignment(assignment);
    if (!linkedEventId || Platform.OS !== 'web' || typeof window === 'undefined') {
      toast.push('This assignment is not linked to an event yet.', 'info');
      return;
    }
    window.dispatchEvent(
      new CustomEvent('openEventModal', {
        detail: {
          eventId: linkedEventId,
          initialEvent: null,
          childEventFocus: 'submission',
          assignment,
        },
      })
    );
  };

  const formatSubmittedOnLabel = (assignment) => {
    const ts = assignment?.submitted_at || assignment?.updated_at || assignment?.created_at || null;
    if (!ts) return 'Submitted';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'Submitted';
    return `Submitted on ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  };

  const isPastSavedDateForSubmission = (assignment) => {
    const linkedEvent = linkedEventsById[String(linkedEventIdForAssignment(assignment) || '')] || null;
    const savedDateRaw = linkedEvent?.start_ts || assignment?.due_date || null;
    if (!savedDateRaw) return false;
    const savedDate = new Date(savedDateRaw);
    if (Number.isNaN(savedDate.getTime())) return false;
    return Date.now() > savedDate.getTime();
  };

  const openSubmittedAction = (assignment) => {
    const linkedEventId = linkedEventIdForAssignment(assignment);
    if (!linkedEventId || Platform.OS !== 'web' || typeof window === 'undefined') {
      toast.push('This assignment is not linked to an event yet.', 'info');
      return;
    }
    window.dispatchEvent(
      new CustomEvent('openEventModal', {
        detail: {
          eventId: linkedEventId,
          initialEvent: null,
          childEventFocus: 'submission',
          assignment,
          submissionViewOnly: isSubmissionReviewed(assignment) || isPastSavedDateForSubmission(assignment),
        },
      })
    );
  };

  const isSubmissionReviewed = (assignment) => {
    const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
    if (reviewStatus && reviewStatus !== 'pending') return true;
    if (assignment?.reviewed_at) return true;
    return String(assignment?.review_feedback || '').trim().length > 0;
  };

  const submissionActionLabel = (assignment) => (
    isSubmissionReviewed(assignment)
      ? 'Feedback received'
      : formatSubmittedOnLabel(assignment)
  );

  const formatEventDate = (dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatEventTime = (dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    // Untimed/all-day planner rows are commonly stored at midnight.
    if (date.getHours() === 0 && date.getMinutes() === 0) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const assignmentEventMetaLine = (assignment) => {
    const linkedEventId = linkedEventIdForAssignment(assignment);
    const linkedEvent = linkedEventId ? linkedEventsById[String(linkedEventId)] : null;
    const eventType = formatSchoolEventTypeLabel(linkedEvent?.event_type || 'Lesson');
    const ts = linkedEvent?.start_ts || assignment?.due_date || assignment?.updated_at || assignment?.created_at;
    const datePart = formatEventDate(ts);
    const timePart = formatEventTime(ts);
    return [eventType, datePart, timePart].filter(Boolean).join(' · ');
  };

  const renderUnifiedHelpRow = ({
    rowKey,
    title,
    metaLine,
    sourceTag,
    onCta,
    ctaLabel = 'Ask for help',
    ctaDisabled = false,
    ctaDone = false,
  }) => (
    <View key={rowKey} style={styles.helpRow}>
      <View style={styles.helpRowMain}>
        <Text style={styles.helpRowTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={styles.helpRowMeta} numberOfLines={1} ellipsizeMode="tail">
          {metaLine}
        </Text>
        {sourceTag ? <Text style={styles.helpRowSource}>{sourceTag}</Text> : null}
      </View>
      <TouchableOpacity
        style={[styles.helpCta, (ctaDisabled || ctaDone) && styles.helpCtaDone]}
        onPress={onCta}
        disabled={ctaDisabled}
        {...(Platform.OS === 'web' && { cursor: ctaDisabled ? 'default' : 'pointer' })}
      >
        <Text style={[styles.helpCtaText, ctaDone && styles.helpCtaTextDone]}>{ctaLabel}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAssignmentHelpRow = (a, ctaLabel = 'Ask for help') => {
    const metaLine = assignmentEventMetaLine(a);
    return renderUnifiedHelpRow({
      rowKey: a.id,
      title: a.title || 'Schoolwork',
      metaLine,
      onCta: () => openHelpForAssignment(a),
      ctaLabel: a?.need_help ? 'Asked for help' : ctaLabel,
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
                This stays empty until a submission or help correspondence starts.
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
                return renderUnifiedHelpRow({
                  rowKey: `needs-attention-${a.id}`,
                  title: a.title || 'Schoolwork',
                  metaLine: assignmentEventMetaLine(a),
                  onCta: () => openSubmitForAssignment(a),
                  ctaLabel: 'Submit',
                });
              })}
            </View>
          ) : null}
          {hasCompleted ? (
            <View style={[styles.submissionsSection, hasUrgent && { marginTop: 4 }]}>
              <Text style={styles.helpSectionLabel}>Submitted</Text>
              {submissionsCompleted.map((a) => {
                return (
                  <View key={a.id} style={styles.helpRow}>
                    <View style={styles.helpRowMain}>
                      <Text style={styles.helpRowTitle} numberOfLines={2}>
                        {a.title || 'Schoolwork'}
                      </Text>
                      <Text style={styles.helpRowMeta} numberOfLines={1} ellipsizeMode="tail">
                        {assignmentEventMetaLine(a)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.helpCta}
                      onPress={() => openSubmittedAction(a)}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text style={[styles.helpCtaText, styles.submittedActionTextItalic]}>
                        {submissionActionLabel(a)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      );
    }

    if (selectedSection === 'help') {
      const helpRows = correspondenceAssignments.slice(0, LIMIT);
      const hasAny = helpRows.length > 0;

      return (
        <View style={styles.helpColumn}>
          {!hasAny ? (
            <View style={[styles.bodyFill, styles.emptyCenter]}>
              <View style={styles.emptyBlock}>
                <Text style={styles.emptyTitle}>No correspondence yet</Text>
                <Text style={styles.emptyHint}>
                  Start a message from an assignment and your conversation history will show here.
                </Text>
              </View>
            </View>
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              <View style={styles.helpSection}>
                {helpRows.map((a) => renderAssignmentHelpRow(a))}
              </View>
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

    return (
      <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
        <View style={styles.comingUpSection}>
          <Text style={styles.helpSectionLabel}>Schoolwork</Text>
          {upcomingEvents.map((event) => {
            const metaLine = [
              formatSchoolEventTypeLabel(event.event_type),
              formatEventDate(event.start_ts),
              formatEventTime(event.start_ts),
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <View key={event.id} style={styles.helpRow}>
                <View style={styles.helpRowMain}>
                  <Text style={styles.helpRowTitle} numberOfLines={2}>
                    {event.title}
                  </Text>
                  <Text style={styles.helpRowMeta} numberOfLines={1} ellipsizeMode="tail">
                    {metaLine}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
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
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.tab, active && styles.tabActive]}
                  onPress={() => setSelectedSection(tab.id)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <View style={styles.tabInner}>
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
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
  tabActive: {
    borderColor: 'rgba(139, 92, 246, 0.5)',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabTextActive: {
    color: 'rgba(99, 102, 241, 1)',
    fontWeight: '700',
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
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexShrink: 0,
  },
  helpCtaDone: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  helpCtaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  submittedActionTextItalic: {
    fontStyle: 'italic',
  },
  helpCtaTextDone: {
    color: '#94A3B8',
  },
});
