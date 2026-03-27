/**
 * EmbeddedNotificationCenter
 * 
 * Compact notification center for parent home right rail.
 * Shows condensed review inbox with tabs and limited items.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { FileText, HelpCircle, Calendar, ChevronRight } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';
import RespondToHelpRequestModal from './RespondToHelpRequestModal';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { colors } from '../../theme/colors';


const SECTIONS = [
  { id: 'submissions', label: 'Submissions' },
  { id: 'help_requests', label: 'Help' },
  { id: 'needs_revision', label: 'Coming up' },
];

export default function EmbeddedNotificationCenter({
  familyId,
  limit = 5,
  onViewAll,
  onInviteChild,
  onGoToPlanner,
  /** When true (e.g. child home), never show Invite / “assign events” onboarding — always the inbox tabs + list/empty states. */
  hideOnboardingCards = false,
  /** When set, scope assignments and upcoming events to this child (viewer is that learner). */
  viewerChildId = null,
}) {
  const session = useSession();
  const [loading, setLoading] = useState(false); // Start as false - no loading state
  const [assignments, setAssignments] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [children, setChildren] = useState([]);
  /** Child profile rows (can exist before any login invite is accepted). */
  const [hasLinkedChildAccount, setHasLinkedChildAccount] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [selectedSection, setSelectedSection] = useState('submissions');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  /** null | 'submission' (review submitted work) | 'help' (respond to help request) */
  const [openModal, setOpenModal] = useState(null);

  useEffect(() => {
    if (session && !session.loading && familyId) {
      // Load data in background without showing loading state
      loadData();
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onParentRefresh = () => {
        if (familyId) loadData();
      };
      window.addEventListener('parentAssignmentsNeedRefresh', onParentRefresh);
      return () => window.removeEventListener('parentAssignmentsNeedRefresh', onParentRefresh);
    }
  }, [session, familyId, hideOnboardingCards, viewerChildId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event) => {
      const section = event?.detail?.section;
      if (section === 'help_requests' || section === 'submissions' || section === 'needs_revision') {
        setSelectedSection(section);
      }
    };
    window.addEventListener('embeddedNotificationParentFocus', handler);
    return () => window.removeEventListener('embeddedNotificationParentFocus', handler);
  }, []);

  const loadData = async () => {
    if (!familyId) return;

    // Don't set loading state - load silently in background
    let childRows = [];
    try {
      await Promise.all([
        loadAssignments(),
        loadUpcomingEvents(),
        (async () => {
          childRows = await loadChildren();
        })(),
      ]);
      if (!hideOnboardingCards) {
        await loadLinkedChildAccounts(childRows);
      }
    } catch (error) {
      console.error('[EmbeddedNotificationCenter] Error loading data:', error);
    } finally {
      setDataReady(true);
    }
  };

  const loadAssignments = async () => {
    try {
      // Check if assignments table exists
      let submittedQ = supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (id, first_name, avatar),
          subject:related_subject (id, name)
        `)
        .eq('family_id', familyId)
        .in('status', ['submitted'])
        .or('review_status.is.null,review_status.eq.needs_revision')
        .order('updated_at', { ascending: false });
      if (viewerChildId) {
        submittedQ = submittedQ.eq('child_id', viewerChildId);
      }
      const { data, error } = await submittedQ;

      if (error) {
        // If table doesn't exist, return empty array
        if (error.code === '42P01' || error.code === 'PGRST200' || error.message?.includes('does not exist')) {
          setAssignments([]);
          return;
        }
        throw error;
      }

      let helpQ = supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (id, first_name, avatar),
          subject:related_subject (id, name)
        `)
        .eq('family_id', familyId)
        .eq('need_help', true)
        .order('updated_at', { ascending: false });
      if (viewerChildId) {
        helpQ = helpQ.eq('child_id', viewerChildId);
      }
      const { data: helpData, error: helpError } = await helpQ;

      if (helpError && helpError.code !== '42P01' && helpError.code !== 'PGRST200') {
        console.error('[EmbeddedNotificationCenter] Error loading help requests:', helpError);
      }

      const allAssignments = [...(data || []), ...(helpData || [])];
      const uniqueAssignments = Array.from(
        new Map(allAssignments.map(a => [a.id, a])).values()
      );

      setAssignments(uniqueAssignments);
    } catch (error) {
      console.error('[EmbeddedNotificationCenter] Error loading assignments:', error);
      setAssignments([]);
    }
  };

  const loadUpcomingEvents = async () => {
    try {
      const now = new Date();
      const sevenDaysLater = new Date(now);
      sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      sevenDaysLater.setHours(23, 59, 59, 999);

      let eventsQ = supabase
        .from('events')
        .select(`
          id,
          title,
          description,
          start_ts,
          end_ts,
          child_id,
          subject_id,
          status,
          child:child_id (id, first_name, avatar)
        `)
        .eq('family_id', familyId)
        .gte('start_ts', now.toISOString())
        .lte('start_ts', sevenDaysLater.toISOString())
        .in('status', ['scheduled', 'in_progress'])
        .is('deleted_at', null)
        .order('start_ts', { ascending: true })
        .limit(50);
      if (viewerChildId) {
        eventsQ = eventsQ.eq('child_id', viewerChildId);
      }
      const { data, error } = await eventsQ;

      if (error) {
        console.error('[EmbeddedNotificationCenter] Error loading upcoming events:', error);
        setUpcomingEvents([]);
        return;
      }

      // Fetch subject names separately if needed
      const subjectIds = [...new Set((data || []).map(e => e.subject_id).filter(Boolean))];
      let subjectsMap = {};
      if (subjectIds.length > 0) {
        const { data: subjectsData } = await supabase
          .from('subject')
          .select('id, name')
          .in('id', subjectIds);
        
        if (subjectsData) {
          subjectsMap = subjectsData.reduce((acc, sub) => {
            acc[sub.id] = sub;
            return acc;
          }, {});
        }
      }

      // Attach subject data to events
      const eventsWithSubjects = (data || []).map(event => ({
        ...event,
        subject: event.subject_id ? subjectsMap[event.subject_id] : null,
      }));

      setUpcomingEvents(eventsWithSubjects);
    } catch (error) {
      console.error('[EmbeddedNotificationCenter] Error loading upcoming events:', error);
      setUpcomingEvents([]);
    }
  };

  /** @returns {Promise<Array>} rows for local count + setState */
  const loadChildren = async () => {
    try {
      const { data, error } = await supabase
        .from('children')
        .select('id, first_name, avatar')
        .eq('family_id', familyId)
        .order('first_name');

      if (error) throw error;
      const rows = data || [];
      setChildren(rows);
      return rows;
    } catch (error) {
      console.error('[EmbeddedNotificationCenter] Error loading children:', error);
      setChildren([]);
      return [];
    }
  };

  /**
   * True only if a real child profile (this family’s `children` row) has a linked login:
   * family_members.member_role = child, user_id set, and child_id matches that profile.
   * Avoids treating query errors or orphan membership rows as “linked”.
   */
  const loadLinkedChildAccounts = async (childRows) => {
    const validChildIds = new Set(
      (childRows || [])
        .map((c) => (c.id != null ? String(c.id) : null))
        .filter(Boolean)
    );
    if (validChildIds.size === 0) {
      setHasLinkedChildAccount(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('family_members')
        .select('child_id, user_id')
        .eq('family_id', familyId)
        .in('member_role', ['child', 'student'])
        .not('user_id', 'is', null);

      if (error) throw error;
      const linked = (data || []).some(
        (row) =>
          row.child_id != null &&
          row.user_id != null &&
          validChildIds.has(String(row.child_id))
      );
      setHasLinkedChildAccount(linked);
    } catch (error) {
      console.error('[EmbeddedNotificationCenter] Error loading family_members:', error);
      // Do not fall back to “has child profiles” — that shows the wrong card when RLS fails
      // or data is ambiguous; prefer invite until membership can be read reliably.
      setHasLinkedChildAccount(false);
    }
  };

  const filterItems = () => {
    switch (selectedSection) {
      case 'submissions':
        return assignments.filter(a => 
          a.status === 'submitted' && 
          a.review_status !== 'needs_revision' &&
          !a.need_help
        ).slice(0, limit);
      case 'help_requests':
        return assignments.filter(a => a.need_help === true).slice(0, limit);
      case 'needs_revision':
        return upcomingEvents.slice(0, limit);
      default:
        return [];
    }
  };

  const filteredItems = filterItems();

  /** Inbox-only: calendar “Coming up” does not dismiss the planner CTA. */
  const hasInboxActivity =
    assignments.some(
      (a) =>
        a.status === 'submitted' &&
        a.review_status !== 'needs_revision' &&
        !a.need_help
    ) || assignments.some((a) => a.need_help === true);

  const primaryCardMode = hideOnboardingCards
    ? 'none'
    : dataReady && !hasLinkedChildAccount
      ? 'invite'
      : dataReady && hasLinkedChildAccount && !hasInboxActivity
        ? 'assign'
        : 'none';
  /** Tabs + list only after load and only when not showing an onboarding card. */
  const showInboxTabs = dataReady && primaryCardMode === 'none';

  const sectionLabel =
    primaryCardMode === 'invite'
      ? 'Get started'
      : primaryCardMode === 'assign'
        ? 'Next step'
        : 'Needs attention';

  const getSectionCount = (sectionId) => {
    switch (sectionId) {
      case 'submissions':
        return assignments.filter(a => 
          a.status === 'submitted' && 
          a.review_status !== 'needs_revision' &&
          !a.need_help
        ).length;
      case 'help_requests':
        return assignments.filter(a => a.need_help === true).length;
      case 'needs_revision':
        return upcomingEvents.length;
      default:
        return 0;
    }
  };

  const formatEventDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const eventDate = new Date(date);
    eventDate.setHours(0, 0, 0, 0);

    if (eventDate.getTime() === today.getTime()) {
      return 'Today';
    } else if (eventDate.getTime() === tomorrow.getTime()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const formatEventTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const getChildName = (childId) => {
    const child = children.find(c => c.id === childId) || 
                 assignments.find(a => a.child_id === childId)?.child;
    return child?.first_name || 'Unknown';
  };

  const getChildColor = (childId) => {
    const child = children.find(c => c.id === childId) || 
                 assignments.find(a => a.child_id === childId)?.child;
    if (!child) return colors.muted;
    return getChildColorFromAvatar(child.avatar);
  };

  const handleReview = (assignment) => {
    const raw = assignment?.linked_event_ids;
    let linkedEventId = null;
    if (Array.isArray(raw) && raw.length > 0) linkedEventId = String(raw[0]);
    else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) linkedEventId = String(parsed[0]);
      } catch (_) {
        /* ignore */
      }
    }
    // Help: open respond modal here so parent home does not stack event details + help.
    if (assignment.need_help) {
      setSelectedAssignment(assignment);
      setOpenModal('help');
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined' && linkedEventId) {
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: {
            eventId: linkedEventId,
            initialEvent: null,
            parentEventFocus: 'submission',
          },
        })
      );
      return;
    }
    setSelectedAssignment(assignment);
    setOpenModal('submission');
  };

  const closeModals = () => {
    setOpenModal(null);
    setSelectedAssignment(null);
  };

  const handleReviewComplete = () => {
    closeModals();
    loadData();
  };

  return (
    <>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text
            style={
              primaryCardMode === 'none' ? styles.titleInbox : styles.titleOnboarding
            }
          >
            {sectionLabel}
          </Text>
        </View>

        {primaryCardMode === 'invite' ? (
          <View style={styles.primaryCard}>
            <Text style={styles.primaryCardTitle}>Invite a child</Text>
            <Text style={styles.primaryCardSubtitle}>
              Push schedule and assignments directly to children.
            </Text>
            <TouchableOpacity
              style={styles.primaryCta}
              onPress={() => onInviteChild?.()}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.primaryCtaText}>Invite Child</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {primaryCardMode === 'assign' ? (
          <View style={styles.primaryCard}>
            <Text style={styles.primaryCardTitle}>Start assigning events</Text>
            <Text style={styles.primaryCardSubtitle}>
              Assign lessons or activities to children to see updates here.
            </Text>
            <TouchableOpacity
              style={styles.primaryCta}
              onPress={() => onGoToPlanner?.()}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text style={styles.primaryCtaText}>Go to Planner</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {showInboxTabs ? (
          <>
            <View style={styles.tabs}>
              {SECTIONS.map(section => {
                const isActive = selectedSection === section.id;
                const count = getSectionCount(section.id);

                const webProps = Platform.OS === 'web' ? {
                  cursor: 'pointer',
                } : {};

                return (
                  <TouchableOpacity
                    key={section.id}
                    style={[styles.tab, isActive && styles.tabActive]}
                    onPress={() => {
                      setSelectedSection(section.id);
                    }}
                    {...webProps}
                  >
                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                      {section.label}
                    </Text>
                    {count > 0 && (
                      <View style={[styles.countBadge, isActive && styles.countBadgeActive]}>
                        <Text style={styles.countText}>{count > 99 ? '99+' : count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {filteredItems.length === 0 ? (
              <View style={styles.emptyState}>
                {selectedSection === 'submissions' ? (
                  <View style={styles.emptyCaughtUp}>
                    <Text style={styles.emptyCaughtUpTitle}>No submissions yet</Text>
                    <Text style={styles.emptyCaughtUpHint}>
                      Assignments will appear here once children start submitting work.
                    </Text>
                  </View>
                ) : null}
                {selectedSection === 'help_requests' ? (
                  <View style={styles.emptyCaughtUp}>
                    <Text style={styles.emptyCaughtUpTitle}>No help requests</Text>
                    <Text style={styles.emptyCaughtUpHint}>
                      When a child asks for help on their work, it will show here.
                    </Text>
                  </View>
                ) : null}
                {selectedSection === 'needs_revision' ? (
                  <View style={styles.emptyCaughtUp}>
                    <Text style={styles.emptyCaughtUpTitle}>Nothing scheduled</Text>
                    <Text style={styles.emptyCaughtUpHint}>
                      Assign events to children to populate this.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {filteredItems.map((item) => {
                  if (selectedSection === 'needs_revision') {
                    const event = item;
                    const childName = getChildName(event.child_id);
                    const childColor = getChildColor(event.child_id);
                    const subjectName = event.subject?.name || null;
                    const eventDate = formatEventDate(event.start_ts);
                    const eventTime = formatEventTime(event.start_ts);

                    return (
                      <TouchableOpacity
                        key={event.id}
                        style={styles.item}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={styles.itemLeft}>
                          <View style={[styles.itemIconContainer, { backgroundColor: colors.blueBold + '15' }]}>
                            <Calendar size={14} color={colors.blueBold} />
                          </View>
                          <View style={styles.itemContent}>
                            <View style={styles.itemHeader}>
                              <View style={[styles.childDot, { backgroundColor: childColor }]} />
                              <Text style={styles.childName} numberOfLines={1}>{childName}</Text>
                              {subjectName && (
                                <Text style={styles.subjectName} numberOfLines={1}>· {subjectName}</Text>
                              )}
                            </View>
                            <Text style={styles.itemTitle} numberOfLines={2}>{event.title}</Text>
                            <View style={styles.itemFooter}>
                              <Text style={styles.itemDate}>
                                {eventDate} · {eventTime}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <ChevronRight size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    );
                  } else {
                    const assignment = item;
                    const childName = getChildName(assignment.child_id);
                    const childColor = getChildColor(assignment.child_id);
                    const subjectName = assignment.subject?.name || null;

                    let IconComponent = FileText;
                    let iconColor = colors.blueBold;
                    if (assignment.need_help) {
                      IconComponent = HelpCircle;
                      iconColor = colors.orangeBold;
                    }

                    return (
                      <TouchableOpacity
                        key={assignment.id}
                        style={styles.item}
                        onPress={() => handleReview(assignment)}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={styles.itemLeft}>
                          <View style={[styles.itemIconContainer, { backgroundColor: iconColor + '15' }]}>
                            <IconComponent size={14} color={iconColor} />
                          </View>
                          <View style={styles.itemContent}>
                            <View style={styles.itemHeader}>
                              <View style={[styles.childDot, { backgroundColor: childColor }]} />
                              <Text style={styles.childName} numberOfLines={1}>{childName}</Text>
                              {subjectName && (
                                <Text style={styles.subjectName} numberOfLines={1}>· {subjectName}</Text>
                              )}
                            </View>
                            <Text style={styles.itemTitle} numberOfLines={2}>{assignment.title}</Text>
                            <View style={styles.itemFooter}>
                              <Text style={styles.itemDate}>
                                {assignment.updated_at
                                  ? new Date(assignment.updated_at).toLocaleDateString()
                                  : 'Recently'}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <ChevronRight size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    );
                  }
                })}
              </ScrollView>
            )}
          </>
        ) : null}
      </View>

      {selectedAssignment && openModal === 'submission' && (
        <AssignmentReviewModal
          visible
          onClose={closeModals}
          assignment={selectedAssignment}
          onReviewed={handleReviewComplete}
          submissionReview
        />
      )}
      {selectedAssignment && openModal === 'help' && (
        <RespondToHelpRequestModal
          visible
          assignment={selectedAssignment}
          onClose={closeModals}
          onResponded={handleReviewComplete}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      transition: 'all 0.2s ease',
      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 10,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  /** Rail subheading: inbox mode — quiet label, does not compete with card titles */
  titleInbox: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.02,
    color: '#64748b',
    textTransform: 'none',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  /** Get started / Next step — sentence case, low tracking, secondary to card title */
  titleOnboarding: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.02,
    color: '#94a3b8',
    textTransform: 'none',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryCard: {
    marginBottom: 14,
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(238, 242, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.18)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(99, 102, 241, 0.08)',
    }),
  },
  /** Card title tier (600) — below page hero, clearly above description */
  primaryCardTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
    letterSpacing: -0.25,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryCardSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#64748b',
    lineHeight: 19,
    marginBottom: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  primaryCta: {
    alignSelf: 'flex-start',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(79, 70, 229, 1)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 2px 6px rgba(79, 70, 229, 0.35)',
    }),
  },
  primaryCtaText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewAllText: {
    fontSize: 13,
    color: colors.blueBold,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      cursor: 'pointer',
    }),
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.15s ease-in-out',
      '&:hover': {
        backgroundColor: 'rgba(248, 250, 252, 0.9)',
        borderColor: 'rgba(148, 163, 184, 0.5)',
      },
    }),
  },
  /* Match planner view chips (WebLayout): lavender fill + violet ring, indigo label */
  tabActive: {
    borderColor: 'rgba(139, 92, 246, 0.5)',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(99, 102, 241, 0.12)',
    }),
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabTextActive: {
    color: 'rgba(99, 102, 241, 1)',
    fontWeight: '600',
  },
  countBadge: {
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: 'rgba(99, 102, 241, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countBadgeActive: {
    backgroundColor: 'rgba(79, 70, 229, 1)',
  },
  countText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.white,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyState: {
    paddingTop: 4,
    paddingBottom: 8,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  emptyCompact: {
    paddingTop: 2,
    alignItems: 'center',
    width: '100%',
  },
  emptyTextMuted: {
    fontSize: 12,
    fontWeight: '400',
    color: '#94a3b8',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyCaughtUp: {
    alignItems: 'center',
    paddingTop: 2,
    gap: 4,
    width: '100%',
  },
  emptyCaughtUpTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyCaughtUpHint: {
    fontSize: 11,
    fontWeight: '400',
    color: '#94a3b8',
    textAlign: 'center',
    paddingHorizontal: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  list: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: 0,
    }),
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...(Platform.OS === 'web' && {
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        backgroundColor: colors.bgSubtle,
      },
    }),
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    flex: 1,
  },
  itemIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemContent: {
    flex: 1,
    minWidth: 0,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  childDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  childName: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectName: {
    fontSize: 12,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDate: {
    fontSize: 11,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
