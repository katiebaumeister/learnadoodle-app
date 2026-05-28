/**
 * EmbeddedNotificationCenter
 * 
 * Compact notification center for parent home right rail.
 * Shows condensed review inbox with tabs and limited items.
 */

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { isAbortLikeError } from '../../lib/apiClient';
import { getFamilyMembers } from '../../lib/apiClient';
import AssignmentReviewModal from '../assignments/AssignmentReviewModal';
import RespondToHelpRequestModal from './RespondToHelpRequestModal';
import { colors } from '../../theme/colors';
import {
  formatSchoolEventTypeLabel,
} from '../child/childHomeRailHelpers';

const RAIL_CACHE_TTL_MS = 3 * 60 * 1000;
const railCacheKey = (familyId) => `parent_home_rail_v2_${familyId}`;

function readRailCache(familyId) {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined' || !familyId) return null;
  try {
    const raw = sessionStorage.getItem(railCacheKey(familyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const {
      ts,
      assignments,
      upcomingEvents,
      children,
      hasLinkedChildAccount,
      hasPendingChildInvite,
      pendingInviteChildNames,
    } = parsed;
    if (typeof ts !== 'number' || Date.now() - ts > RAIL_CACHE_TTL_MS) return null;
    return {
      assignments: Array.isArray(assignments) ? assignments : [],
      upcomingEvents: Array.isArray(upcomingEvents) ? upcomingEvents : [],
      children: Array.isArray(children) ? children : [],
      hasLinkedChildAccount:
        typeof hasLinkedChildAccount === 'boolean' ? hasLinkedChildAccount : undefined,
      hasPendingChildInvite:
        typeof hasPendingChildInvite === 'boolean' ? hasPendingChildInvite : undefined,
      pendingInviteChildNames: Array.isArray(pendingInviteChildNames) ? pendingInviteChildNames : [],
    };
  } catch {
    return null;
  }
}

function writeRailCache(familyId, payload) {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined' || !familyId) return;
  try {
    sessionStorage.setItem(
      railCacheKey(familyId),
      JSON.stringify({ ts: Date.now(), ...payload })
    );
  } catch {
    /* ignore quota */
  }
}

/** Sync snapshot for first paint — avoids “Needs attention” flash before network settles. */
function readRailBootstrap(familyId) {
  const c = readRailCache(familyId);
  if (!c) {
    return {
      assignments: [],
      upcomingEvents: [],
      children: [],
      hasLinkedChildAccount: false,
      hasPendingChildInvite: false,
      pendingInviteChildNames: [],
      fromCache: false,
    };
  }
  return {
    assignments: c.assignments,
    upcomingEvents: c.upcomingEvents,
    children: c.children,
    hasLinkedChildAccount: typeof c.hasLinkedChildAccount === 'boolean' ? c.hasLinkedChildAccount : false,
    hasPendingChildInvite: typeof c.hasPendingChildInvite === 'boolean' ? c.hasPendingChildInvite : false,
    pendingInviteChildNames: Array.isArray(c.pendingInviteChildNames) ? c.pendingInviteChildNames : [],
    fromCache: true,
  };
}

function hasPositiveOnboardingSignal(snapshot) {
  return Boolean(snapshot?.hasLinkedChildAccount || snapshot?.hasPendingChildInvite);
}

const SECTIONS = [
  { id: 'help_requests', label: 'Discussions' },
  { id: 'submissions', label: 'Submissions' },
  { id: 'needs_revision', label: 'Coming up' },
];
const DISABLE_EMBEDDED_NOTIFICATION_CENTER = false;

const stringArrayEqual = (a, b) => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i] || '') !== String(b[i] || '')) return false;
  }
  return true;
};

export default function EmbeddedNotificationCenter({
  familyId,
  childInviteSummariesFromApi = null,
  limit = 5,
  onViewAll,
  onInviteChild,
  onGoToPlanner,
  /** When true (e.g. child home), never show Invite / “assign events” onboarding — always the inbox tabs + list/empty states. */
  hideOnboardingCards = false,
  /** When set, scope assignments and upcoming events to this child (viewer is that learner). */
  viewerChildId = null,
}) {
  if (DISABLE_EMBEDDED_NOTIFICATION_CENTER) return null;
  const initialBootstrap = readRailBootstrap(familyId);
  const session = useSession();
  const loadCycleRef = useRef(0);
  const [loading, setLoading] = useState(false); // Start as false - no loading state
  const [assignments, setAssignments] = useState(() => initialBootstrap.assignments);
  const [upcomingEvents, setUpcomingEvents] = useState(() => initialBootstrap.upcomingEvents);
  const [children, setChildren] = useState(() => initialBootstrap.children);
  /** Child profile rows (can exist before any login invite is accepted). */
  const [hasLinkedChildAccount, setHasLinkedChildAccount] = useState(
    () => initialBootstrap.hasLinkedChildAccount
  );
  const [hasPendingChildInvite, setHasPendingChildInvite] = useState(
    () => initialBootstrap.hasPendingChildInvite
  );
  const [pendingInviteChildNames, setPendingInviteChildNames] = useState(
    () => initialBootstrap.pendingInviteChildNames
  );
  /** True when sessionStorage had a fresh rail snapshot (enables rail UI before network). */
  const [railBootstrapped, setRailBootstrapped] = useState(() => initialBootstrap.fromCache);
  /** Prevent onboarding card flicker before invite/link status is known for this family. */
  const [onboardingStatusReady, setOnboardingStatusReady] = useState(
    () => hideOnboardingCards || (initialBootstrap.fromCache && hasPositiveOnboardingSignal(initialBootstrap))
  );
  const [dataReady, setDataReady] = useState(() => initialBootstrap.fromCache);
  const [selectedSection, setSelectedSection] = useState('help_requests');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  /** null | 'submission' (review submitted work) | 'help' (respond to help request) */
  const [openModal, setOpenModal] = useState(null);
  const [activeLoadCycle, setActiveLoadCycle] = useState(0);
  const [linkedEventsById, setLinkedEventsById] = useState({});
  const loadInFlightRef = useRef(false);
  const isParentViewer = session?.role_flags?.isParent === true && session?.role_flags?.isChild !== true;

  /** Re-read cache when family changes (same mount). */
  useLayoutEffect(() => {
    if (!familyId) {
      setAssignments([]);
      setUpcomingEvents([]);
      setChildren([]);
      setRailBootstrapped(false);
      setDataReady(false);
      setHasPendingChildInvite(false);
      setPendingInviteChildNames([]);
      setOnboardingStatusReady(hideOnboardingCards);
      return;
    }
    const b = readRailBootstrap(familyId);
    if (b.fromCache) {
      setAssignments(b.assignments);
      setUpcomingEvents(b.upcomingEvents);
      setChildren(b.children);
      setHasLinkedChildAccount(b.hasLinkedChildAccount);
      setHasPendingChildInvite(b.hasPendingChildInvite);
      setPendingInviteChildNames(b.pendingInviteChildNames);
      setRailBootstrapped(true);
      setDataReady(true);
      // Only trust positive cached onboarding status; negative cache can be stale.
      setOnboardingStatusReady(hideOnboardingCards || hasPositiveOnboardingSignal(b));
    } else {
      setRailBootstrapped(false);
      setDataReady(false);
      setOnboardingStatusReady(hideOnboardingCards);
    }
  }, [familyId, hideOnboardingCards]);

  useEffect(() => {
    if (dataReady && familyId) {
      writeRailCache(familyId, {
        assignments,
        upcomingEvents,
        children,
        hasLinkedChildAccount,
        hasPendingChildInvite,
        pendingInviteChildNames,
      });
    }
  }, [dataReady, familyId, assignments, upcomingEvents, children, hasLinkedChildAccount, hasPendingChildInvite, pendingInviteChildNames]);

  const pendingInviteLabel = useMemo(() => {
    const names = Array.isArray(pendingInviteChildNames)
      ? pendingInviteChildNames.map((n) => String(n || '').trim()).filter(Boolean)
      : [];
    if (names.length === 0) return 'a child';
    return names.join(', ');
  }, [pendingInviteChildNames]);

  // Primitives only — full `session` from context was a new object whenever SessionProvider re-rendered (before useMemo).
  const sessionLoading = session?.loading;
  const sessionFamilyId = session?.family_id;
  const shouldRunLiveRail = useMemo(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return true;
    const path = (window.location?.pathname || '/').replace(/\/$/, '') || '/';
    return path === '/' || path === '/home';
  }, [sessionFamilyId]);
  const summaryKnown =
    childInviteSummariesFromApi != null && typeof childInviteSummariesFromApi === 'object';
  const logRail = (...args) => {
    if (typeof console !== 'undefined') {
      console.debug('[EmbeddedNotificationCenter]', ...args);
    }
  };

  useEffect(() => {
    if (!shouldRunLiveRail) return;
    if (session && !session.loading && familyId) {
      // Load data in background without showing loading state
      loadData();
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onParentRefresh = () => {
        if (familyId) loadData();
      };
      window.addEventListener('parentAssignmentsNeedRefresh', onParentRefresh);
      window.addEventListener('refreshCalendar', onParentRefresh);
      window.addEventListener('refreshRightRail', onParentRefresh);
      return () => {
        window.removeEventListener('parentAssignmentsNeedRefresh', onParentRefresh);
        window.removeEventListener('refreshCalendar', onParentRefresh);
        window.removeEventListener('refreshRightRail', onParentRefresh);
      };
    }
  }, [sessionLoading, sessionFamilyId, familyId, hideOnboardingCards, viewerChildId, shouldRunLiveRail]);

  useEffect(() => {
    if (hideOnboardingCards) return;
    if (!summaryKnown) return;
    const entries = Object.entries(childInviteSummariesFromApi || {});
    const pendingIds = entries
      .filter(([, summary]) => {
        const status = String(summary?.invite_status || '').trim().toLowerCase();
        return status === 'pending';
      })
      .map(([childId]) => String(childId));
    const connectedFromSummary = entries.some(([, summary]) => {
      const status = String(summary?.invite_status || '').trim().toLowerCase();
      return status === 'pending' || status === 'accepted';
    });

    const childNameById = new Map(
      (children || [])
        .filter((c) => c?.id != null)
        .map((c) => [String(c.id), String(c.first_name || '').trim() || 'Child'])
    );
    const pendingNames = [...new Set(pendingIds)]
      .map((childId) => childNameById.get(String(childId)))
      .filter(Boolean);

    // Promote-only from parent summaries: never downgrade on transient empty/stale payloads.
    if (pendingIds.length > 0) {
      setHasPendingChildInvite((prev) => (prev ? prev : true));
      setPendingInviteChildNames((prev) => (stringArrayEqual(prev, pendingNames) ? prev : pendingNames));
    }
    if (connectedFromSummary) {
      setHasLinkedChildAccount((prev) => (prev ? prev : true));
    }
  }, [hideOnboardingCards, summaryKnown, childInviteSummariesFromApi, children]);

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
    if (!shouldRunLiveRail) return;
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;

    const cycleId = loadCycleRef.current + 1;
    loadCycleRef.current = cycleId;
    setActiveLoadCycle(cycleId);
    if (!hideOnboardingCards && !railBootstrapped) {
      setOnboardingStatusReady(false);
    }
    logRail('load cycle start', { cycleId, familyId, summaryKnown });

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
      } else {
        setOnboardingStatusReady(true);
      }
    } catch (error) {
      if (!isAbortLikeError(error)) {
        console.error('[EmbeddedNotificationCenter] Error loading data:', error);
      }
    } finally {
      logRail('load cycle complete', {
        cycleId,
        hasLinkedChildAccount,
        hasPendingChildInvite,
        onboardingStatusReady,
      });
      setDataReady(true);
      loadInFlightRef.current = false;
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
        if (!isAbortLikeError(helpError)) {
          console.error('[EmbeddedNotificationCenter] Error loading help requests:', helpError);
        }
      }

      let sentQ = supabase
        .from('assignments')
        .select(`
          *,
          child:child_id (id, first_name, avatar),
          subject:related_subject (id, name)
        `)
        .eq('family_id', familyId)
        .not('assigned_by', 'is', null)
        .order('updated_at', { ascending: false });
      if (viewerChildId) {
        sentQ = sentQ.eq('child_id', viewerChildId);
      }
      const { data: sentData, error: sentError } = await sentQ;
      if (sentError && sentError.code !== '42P01' && sentError.code !== 'PGRST200') {
        if (!isAbortLikeError(sentError)) {
          console.error('[EmbeddedNotificationCenter] Error loading sent assignments:', sentError);
        }
      }

      const allAssignments = [...(data || []), ...(helpData || []), ...(sentData || [])];
      const uniqueAssignments = Array.from(
        new Map(allAssignments.map(a => [a.id, a])).values()
      );

      setAssignments(uniqueAssignments);
    } catch (error) {
      if (!isAbortLikeError(error)) {
        console.error('[EmbeddedNotificationCenter] Error loading assignments:', error);
      }
      setAssignments([]);
    }
  };

  const loadUpcomingEvents = async () => {
    try {
      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const horizon = new Date(now);
      horizon.setDate(horizon.getDate() + 30);
      horizon.setHours(23, 59, 59, 999);

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
          event_type,
          child:child_id (id, first_name, avatar)
        `)
        .eq('family_id', familyId)
        // Include all of "today" so all-day / no-time events (often 00:00) still appear in Coming up.
        .gte('start_ts', dayStart.toISOString())
        .lte('start_ts', horizon.toISOString())
        .in('status', ['scheduled', 'in_progress'])
        .is('deleted_at', null)
        .order('start_ts', { ascending: true });
      if (viewerChildId && !isParentViewer) {
        eventsQ = eventsQ.eq('child_id', viewerChildId);
      }
      const { data, error } = await eventsQ;

      if (error) {
        if (!isAbortLikeError(error)) {
          console.error('[EmbeddedNotificationCenter] Error loading upcoming events:', error);
        }
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

      const eventsWithSubjects = (data || []).map(event => ({
        ...event,
        subject: event.subject_id ? subjectsMap[event.subject_id] : null,
      }));
      setUpcomingEvents(eventsWithSubjects);
    } catch (error) {
      if (!isAbortLikeError(error)) {
        console.error('[EmbeddedNotificationCenter] Error loading upcoming events:', error);
      }
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
      if (!isAbortLikeError(error)) {
        console.error('[EmbeddedNotificationCenter] Error loading children:', error);
      }
      setChildren([]);
      return [];
    }
  };

  /**
   * True when a real child profile has either:
   * - a linked login (user_id set), or
   * - an active invite (pending/accepted).
   * child_id must match this family's actual children rows.
   */
  const loadLinkedChildAccounts = async (childRows) => {
    const childNameById = new Map(
      (childRows || [])
        .filter((c) => c?.id != null)
        .map((c) => [String(c.id), String(c.first_name || '').trim() || 'Child'])
    );
    const validChildIds = new Set(
      (childRows || [])
        .map((c) => (c.id != null ? String(c.id) : null))
        .filter(Boolean)
    );
    const summaryKnown =
      childInviteSummariesFromApi != null && typeof childInviteSummariesFromApi === 'object';
    const summaryEntries = summaryKnown ? Object.entries(childInviteSummariesFromApi) : [];
    const pendingInviteIdsFromSummary = summaryEntries
      .filter(([childId, summary]) => {
        if (!validChildIds.has(String(childId))) return false;
        const status = String(summary?.invite_status || '').trim().toLowerCase();
        return status === 'pending';
      })
      .map(([childId]) => String(childId));
    const hasPendingInviteFromSummary = pendingInviteIdsFromSummary.length > 0;
    const hasConnectedInviteFromSummary = summaryEntries.some(([childId, summary]) => {
      if (!validChildIds.has(String(childId))) return false;
      const status = String(summary?.invite_status || '').trim().toLowerCase();
      return status === 'pending' || status === 'accepted';
    });
    if (validChildIds.size === 0) {
      setHasLinkedChildAccount(false);
      setHasPendingChildInvite(false);
      setPendingInviteChildNames([]);
      setOnboardingStatusReady(true);
      return;
    }
    try {
      const { data: familyData, error } = await getFamilyMembers();
      if (error) throw error;
      const rows = Array.isArray(familyData?.members)
        ? familyData.members.filter((m) => ['child', 'student'].includes(String(m?.member_role || m?.role || '').toLowerCase()))
        : [];
      const linked = rows.some((row) => {
        if (row.child_id == null || !validChildIds.has(String(row.child_id))) return false;
        return row.user_id != null;
      });
      let pendingNames = [...new Set(pendingInviteIdsFromSummary)]
        .map((childId) => childNameById.get(String(childId)))
        .filter(Boolean);
      const nextHasPending = hasPendingInviteFromSummary;
      const nextHasLinked = linked || hasConnectedInviteFromSummary;

      let resolvedHasPending = nextHasPending;
      let resolvedHasLinked = nextHasLinked;
      if (!resolvedHasPending && !resolvedHasLinked) {
        if (familyData?.child_invite_summaries && typeof familyData.child_invite_summaries === 'object') {
          const serverEntries = Object.entries(familyData.child_invite_summaries);
          const pendingIdsFromServer = serverEntries
            .filter(([childId, summary]) => {
              if (!validChildIds.has(String(childId))) return false;
              const status = String(summary?.invite_status || '').trim().toLowerCase();
              return status === 'pending';
            })
            .map(([childId]) => String(childId));
          const connectedFromServer = serverEntries.some(([childId, summary]) => {
            if (!validChildIds.has(String(childId))) return false;
            const status = String(summary?.invite_status || '').trim().toLowerCase();
            return status === 'pending' || status === 'accepted';
          });
          if (pendingIdsFromServer.length > 0) {
            pendingNames = pendingIdsFromServer
              .map((childId) => childNameById.get(String(childId)))
              .filter(Boolean);
            resolvedHasPending = true;
          }
          if (connectedFromServer) {
            resolvedHasLinked = true;
          }
        }
      }

      setHasPendingChildInvite(resolvedHasPending);
      setHasLinkedChildAccount(resolvedHasLinked);
      setPendingInviteChildNames(pendingNames);
      setOnboardingStatusReady(true);
    } catch (error) {
      if (!isAbortLikeError(error)) {
        console.error('[EmbeddedNotificationCenter] Error loading family_members:', error);
      }
      try {
        const { data: familyData, error: familyErr } = await getFamilyMembers();
        if (!familyErr && familyData?.child_invite_summaries && typeof familyData.child_invite_summaries === 'object') {
          const serverEntries = Object.entries(familyData.child_invite_summaries);
          const pendingIdsFromServer = serverEntries
            .filter(([childId, summary]) => {
              if (!validChildIds.has(String(childId))) return false;
              const status = String(summary?.invite_status || '').trim().toLowerCase();
              return status === 'pending';
            })
            .map(([childId]) => String(childId));
          const connectedFromServer = serverEntries.some(([childId, summary]) => {
            if (!validChildIds.has(String(childId))) return false;
            const status = String(summary?.invite_status || '').trim().toLowerCase();
            return status === 'pending' || status === 'accepted';
          });
          const pendingNames = [...new Set(pendingIdsFromServer)]
            .map((childId) => childNameById.get(String(childId)))
            .filter(Boolean);
          setHasPendingChildInvite(pendingIdsFromServer.length > 0 || hasPendingInviteFromSummary);
          setHasLinkedChildAccount(connectedFromServer || hasConnectedInviteFromSummary);
          setPendingInviteChildNames(pendingNames);
          setOnboardingStatusReady(true);
          return;
        }
      } catch (_) {
        // ignore and use summary fallback below
      }
      const pendingNames = [...new Set(pendingInviteIdsFromSummary)]
        .map((childId) => childNameById.get(String(childId)))
        .filter(Boolean);
      setHasPendingChildInvite(hasPendingInviteFromSummary);
      setHasLinkedChildAccount(hasConnectedInviteFromSummary);
      setPendingInviteChildNames(pendingNames);
      setOnboardingStatusReady(true);
    }
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

  const isAssignmentLinkedEventActive = (assignment) => {
    const linkedEventId = linkedEventIdForAssignment(assignment);
    if (!linkedEventId) return true;
    const linkedEvent = linkedEventsById[String(linkedEventId)];
    if (!linkedEvent) return false;
    const status = String(linkedEvent?.status || '').trim().toLowerCase();
    if (status === 'canceled' || status === 'cancelled' || status === 'deleted') return false;
    return !linkedEvent?.deleted_at;
  };

  const filterItems = () => {
    const parseHelpLog = (assignment) => {
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

    const latestActionForAssignment = (assignment) => {
      const log = parseHelpLog(assignment);
      let latestSentTs = 0;
      let latestChildTs = 0;
      for (const entry of log) {
        const senderRole = String(entry?.sender_role || '').trim().toLowerCase();
        const reason = String(entry?.reason || '').trim().toLowerCase();
        const tsRaw = entry?.created_at || entry?.timestamp || null;
        const ts = new Date(tsRaw || 0).getTime();
        if (!Number.isFinite(ts) || ts <= 0) continue;
        if (senderRole === 'parent' && reason === 'sent_assignment') {
          if (ts > latestSentTs) latestSentTs = ts;
        }
        if (senderRole === 'child' || senderRole === 'student') {
          if (ts > latestChildTs) latestChildTs = ts;
        }
      }
      if (assignment?.need_help === true && latestChildTs <= 0) {
        const fallbackChildTs = new Date(assignment?.updated_at || assignment?.created_at || 0).getTime();
        if (Number.isFinite(fallbackChildTs) && fallbackChildTs > 0) latestChildTs = fallbackChildTs;
      }
      if (latestChildTs > 0 && latestChildTs >= latestSentTs) {
        return { type: 'needs_response', ts: latestChildTs };
      }
      if (latestSentTs > 0) {
        return { type: 'sent', ts: latestSentTs };
      }
      const fallbackTs = new Date(assignment?.updated_at || assignment?.created_at || 0).getTime();
      return { type: 'send', ts: Number.isFinite(fallbackTs) ? fallbackTs : 0 };
    };

    const dedupeByEvent = (rows) => {
      const grouped = new Map();
      (rows || []).forEach((assignment) => {
        const key = linkedEventIdForAssignment(assignment) || `assignment:${assignment?.id || Math.random()}`;
        const action = latestActionForAssignment(assignment);
        const prev = grouped.get(key);
        if (!prev || action.ts >= prev.action.ts) {
          grouped.set(key, { assignment, action });
        }
      });
      return [...grouped.values()]
        .map(({ assignment, action }) => ({
          ...assignment,
          need_help: action.type === 'needs_response' || assignment?.need_help === true,
          __actionType: action.type,
          __actionTs: action.ts,
        }))
        .sort((a, b) => Number(b.__actionTs || 0) - Number(a.__actionTs || 0));
    };

    const hasParentSentCorrespondence = (assignment) => {
      const raw = assignment?.help_message_log;
      let log = [];
      if (Array.isArray(raw)) {
        log = raw;
      } else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) log = parsed;
        } catch (_) {
          log = [];
        }
      }
      return (log || []).some((entry) => {
        const senderRole = String(entry?.sender_role || '').trim().toLowerCase();
        const reason = String(entry?.reason || '').trim().toLowerCase();
        return senderRole === 'parent' && reason === 'sent_assignment';
      });
    };

    const isSubmissionInboxRow = (assignment) => {
      const status = String(assignment?.status || '').trim().toLowerCase();
      const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
      if (assignment?.reviewed_at) return true;
      if (status === 'submitted' || status === 'reviewed' || status === 'accepted') return true;
      if (reviewStatus === 'reviewed' || reviewStatus === 'approved') return true;
      return false;
    };

    switch (selectedSection) {
      case 'submissions':
        return dedupeByEvent(
          assignments
            .filter((a) => isSubmissionInboxRow(a) && !a.need_help)
            .filter((a) => isAssignmentLinkedEventActive(a))
        ).slice(0, limit);
      case 'help_requests':
        return dedupeByEvent(
          assignments
            .filter((a) => a.need_help === true || a.assigned_by != null || hasParentSentCorrespondence(a))
            .filter((a) => isAssignmentLinkedEventActive(a))
        ).slice(0, limit);
      case 'needs_revision':
        // "Coming up" should show the full upcoming stream; list scroll handles long sets.
        return upcomingEvents;
      default:
        return [];
    }
  };

  const filteredItems = filterItems();

  useEffect(() => {
    const loadLinkedEvents = async () => {
      const ids = [...new Set(
        (assignments || [])
          .map((assignment) => {
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
          })
          .filter(Boolean)
      )];
      if (ids.length === 0) {
        setLinkedEventsById((prev) => (Object.keys(prev || {}).length === 0 ? prev : {}));
        return;
      }
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, event_type, start_ts, status, deleted_at')
          .in('id', ids);
        if (error || !Array.isArray(data)) {
          setLinkedEventsById((prev) => (Object.keys(prev || {}).length === 0 ? prev : {}));
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

  /** Inbox-only: calendar “Coming up” does not dismiss the planner CTA. */
  const hasInboxActivity =
    assignments.some(
      (a) =>
        (
          String(a.status || '').trim().toLowerCase() === 'submitted' ||
          String(a.status || '').trim().toLowerCase() === 'reviewed' ||
          String(a.status || '').trim().toLowerCase() === 'accepted' ||
          String(a.review_status || '').trim().toLowerCase() === 'reviewed' ||
          String(a.review_status || '').trim().toLowerCase() === 'approved' ||
          !!a.reviewed_at
        ) &&
        a.review_status !== 'needs_revision' &&
        !a.need_help &&
        isAssignmentLinkedEventActive(a)
    ) || assignments.some((a) => {
      if (!isAssignmentLinkedEventActive(a)) return false;
      if (a.need_help === true) return true;
      const raw = a?.help_message_log;
      let log = [];
      if (Array.isArray(raw)) {
        log = raw;
      } else if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) log = parsed;
        } catch (_) {
          log = [];
        }
      }
      return (log || []).some((entry) => (
        String(entry?.sender_role || '').trim().toLowerCase() === 'parent' &&
        String(entry?.reason || '').trim().toLowerCase() === 'sent_assignment'
      ));
    });

  /** Ready once fresh content + onboarding status are both resolved (no cache-to-live mode flips). */
  const railReady = dataReady && (hideOnboardingCards || onboardingStatusReady);

  // Once at least one child is linked/accepted, keep the right rail in inbox-tabs mode
  // (show Submissions/Help/Coming up chips even when the lists are empty).
  const primaryCardCandidateMode = hideOnboardingCards
    ? 'none'
    : !hasLinkedChildAccount
      ? 'invite'
      : 'none';
  const primaryCardMode = railReady ? primaryCardCandidateMode : 'none';
  /** Inbox chrome when we’re past loading placeholder and not showing invite/assign primary card. */
  const showInboxTabs = hideOnboardingCards || (railReady && primaryCardMode === 'none');

  /** First visit / no cache: show stable skeleton instead of wrong “Needs attention” + empty tabs. */
  const showRailLoadingPlaceholder = !railReady && !hideOnboardingCards;

  const sectionLabel =
    primaryCardMode === 'invite'
      ? 'Get started'
      : primaryCardMode === 'assign'
        ? 'Next step'
        : 'Needs attention';

  const formatEventDate = (dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatEventTime = (dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    // Planner rows with no explicit time are commonly stored at midnight.
    if (date.getHours() === 0 && date.getMinutes() === 0) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const assignmentEventMetaLine = (assignment) => {
    const raw = assignment?.linked_event_ids;
    let linkedEventId = null;
    if (Array.isArray(raw) && raw.length > 0) linkedEventId = String(raw[0]);
    else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) linkedEventId = String(parsed[0]);
      } catch (_) {
        linkedEventId = null;
      }
    }
    const linkedEvent = linkedEventId ? linkedEventsById[String(linkedEventId)] : null;
    const eventType = formatSchoolEventTypeLabel(linkedEvent?.event_type || 'Lesson');
    const ts = linkedEvent?.start_ts || assignment?.updated_at || assignment?.created_at;
    return [eventType, formatEventDate(ts), formatEventTime(ts)].filter(Boolean).join(' · ');
  };

  const sentOnLabel = (assignment) => {
    if (assignment?.__actionType === 'sent' && Number.isFinite(assignment?.__actionTs) && assignment.__actionTs > 0) {
      const sentDate = formatEventDate(new Date(assignment.__actionTs).toISOString());
      return sentDate ? `Sent on ${sentDate}` : 'Sent';
    }
    const raw = assignment?.help_message_log;
    let log = [];
    if (Array.isArray(raw)) {
      log = raw;
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) log = parsed;
      } catch (_) {
        log = [];
      }
    }
    const sentEntries = (log || [])
      .map((entry) => {
        const senderRole = String(entry?.sender_role || '').trim().toLowerCase();
        const reason = String(entry?.reason || '').trim().toLowerCase();
        const tsRaw = entry?.created_at || entry?.timestamp || null;
        const ts = new Date(tsRaw || 0).getTime();
        if (senderRole !== 'parent' || reason !== 'sent_assignment' || !Number.isFinite(ts) || ts <= 0) return null;
        return { ts, tsRaw };
      })
      .filter(Boolean)
      .sort((a, b) => b.ts - a.ts);
    const sentTs = sentEntries[0]?.tsRaw || assignment?.updated_at || assignment?.created_at;
    const sentDate = sentTs ? formatEventDate(sentTs) : '';
    return sentDate ? `Sent on ${sentDate}` : 'Sent';
  };

  const helpActionLabel = (assignment) => {
    const actionType = assignment?.__actionType || (assignment?.need_help ? 'needs_response' : null);
    if (actionType === 'needs_response') return 'Needs response';
    if (actionType === 'sent') return sentOnLabel(assignment);
    return 'Send to student';
  };

  const isSubmissionReviewed = (assignment) => {
    const reviewStatus = String(assignment?.review_status || '').trim().toLowerCase();
    if (reviewStatus === 'approved' || reviewStatus === 'reviewed') return true;
    return !!assignment?.reviewed_at;
  };

  const submissionActionLabel = (assignment) => (
    isSubmissionReviewed(assignment) ? 'Reviewed' : 'Review'
  );

  const handleReview = (assignment) => {
    // Help: open respond modal here so parent home does not stack event details + help.
    if (assignment.need_help) {
      setSelectedAssignment(assignment);
      setOpenModal('help');
      return;
    }
    // Open review directly from rail (no EventDetails modal in background).
    setSelectedAssignment(assignment);
    setOpenModal('submission');
  };

  const handleHelpAction = (assignment) => {
    if (assignment?.need_help) {
      setSelectedAssignment(assignment);
      setOpenModal('help');
      return;
    }
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
    if (Platform.OS === 'web' && typeof window !== 'undefined' && linkedEventId) {
      window.dispatchEvent(
        new CustomEvent('openEventModal', {
          detail: {
            eventId: linkedEventId,
            initialEvent: null,
            parentEventFocus: 'send',
            sendOnlyMode: true,
          },
        })
      );
      return;
    }
    handleReview(assignment);
  };

  const openPlannerContextMenu = async (nativeEvent, eventId, fallbackEvent = null) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    nativeEvent?.preventDefault?.();
    nativeEvent?.stopPropagation?.();
    const x = nativeEvent?.clientX ?? 0;
    const y = nativeEvent?.clientY ?? 0;
    if (!eventId) return;

    let eventPayload = fallbackEvent;
    try {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .maybeSingle();
      if (data) eventPayload = data;
    } catch (_) {
      /* best effort */
    }
    if (!eventPayload) return;
    window.dispatchEvent(new CustomEvent('plannerEventContextMenu', {
      detail: { event: eventPayload, position: { x, y } },
    }));
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
              showRailLoadingPlaceholder
                ? styles.titleOnboarding
                : primaryCardMode === 'none'
                  ? styles.titleInbox
                  : styles.titleOnboarding
            }
          >
            {showRailLoadingPlaceholder ? 'Next step' : sectionLabel}
          </Text>
        </View>

        {showRailLoadingPlaceholder ? (
          <View style={styles.railSkeletonWrap} accessibilityLabel="Loading">
            <View style={styles.railSkeletonCard}>
              <View style={styles.skeletonBarWide} />
              <View style={styles.skeletonBarMed} />
              <View style={styles.skeletonCta} />
            </View>
          </View>
        ) : (
          <>
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
            <Text style={styles.primaryCardTitle}>
              {hasPendingChildInvite ? `Invite sent to ${pendingInviteLabel}` : 'Start assigning events'}
            </Text>
            <Text style={styles.primaryCardSubtitle}>
              {hasPendingChildInvite
                ? 'Use "Send to student" when creating events to assign work, start conversations, and track progress directly here.'
                : 'Assign lessons or activities to children to see updates here.'}
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
                    <Text style={styles.emptyCaughtUpTitle}>Nothing coming up</Text>
                    <Text style={styles.emptyCaughtUpHint}>
                      Any class event or assignment you sent to a student will appear here.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
                {filteredItems.map((item) => {
                  if (selectedSection === 'needs_revision') {
                    const event = item;
                    const eventDate = formatEventDate(event.start_ts);
                    const eventTime = formatEventTime(event.start_ts);

                    return (
                      <TouchableOpacity
                        key={event.id}
                        style={styles.item}
                        onPress={() => {
                          if (Platform.OS === 'web' && typeof window !== 'undefined' && event?.id) {
                            window.dispatchEvent(
                              new CustomEvent('openEventModal', {
                                detail: {
                                  eventId: String(event.id),
                                  initialEvent: event,
                                  schedulingMode: true,
                                  editScope: 'single',
                                },
                              })
                            );
                          }
                        }}
                        {...(Platform.OS === 'web' && {
                          onMouseDown: (e) => {
                            const button = e?.button ?? e?.nativeEvent?.button;
                            if (button !== 2) return;
                            e.preventDefault?.();
                            e.stopPropagation?.();
                            openPlannerContextMenu(e, String(event.id), event);
                          },
                          onContextMenu: (e) => openPlannerContextMenu(e, String(event.id), event),
                        })}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={styles.itemLeft}>
                          <View style={styles.itemContent}>
                            <Text style={styles.itemTitle} numberOfLines={2}>{event.title}</Text>
                            <View style={styles.itemFooter}>
                              <Text style={styles.itemDate}>
                                {[formatSchoolEventTypeLabel(event.event_type), eventDate, eventTime].filter(Boolean).join(' · ')}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  } else {
                    const assignment = item;

                    return (
                      <TouchableOpacity
                        key={assignment.id}
                        style={styles.item}
                        onPress={() => (
                          selectedSection === 'help_requests'
                            ? handleHelpAction(assignment)
                            : handleReview(assignment)
                        )}
                        {...(Platform.OS === 'web' && {
                          onContextMenu: (e) => {
                            const linkedEventId = linkedEventIdForAssignment(assignment);
                            if (!linkedEventId) return;
                            openPlannerContextMenu(e, linkedEventId, null);
                          },
                        })}
                        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                      >
                        <View style={styles.itemLeft}>
                          <View style={styles.itemContent}>
                            <Text style={styles.itemTitle} numberOfLines={2}>{assignment.title}</Text>
                            <View style={styles.itemFooter}>
                              <Text style={styles.itemDate}>
                                {assignmentEventMetaLine(assignment)}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={styles.rowActionButton}
                          onPress={() => (
                            selectedSection === 'help_requests'
                              ? handleHelpAction(assignment)
                              : handleReview(assignment)
                          )}
                          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                        >
                          <Text
                            style={[
                              styles.rowActionButtonText,
                              selectedSection === 'help_requests' && !assignment.need_help && styles.rowActionButtonTextItalic,
                              selectedSection === 'submissions' && isSubmissionReviewed(assignment) && styles.rowActionButtonTextItalic,
                            ]}
                          >
                            {selectedSection === 'help_requests'
                              ? helpActionLabel(assignment)
                              : submissionActionLabel(assignment)}
                          </Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  }
                })}
              </ScrollView>
            )}
          </>
        ) : null}
          </>
        )}
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
    borderColor: 'rgba(148, 163, 184, 0.18)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      paddingVertical: 12,
      paddingHorizontal: 12,
      transition: 'all 0.2s ease',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
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
  /** Rail subheading: inbox mode — quiet but legible section label */
  titleInbox: {
    fontSize: 12,
    fontWeight: '600',
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
  railSkeletonWrap: {
    width: '100%',
    marginBottom: 8,
  },
  railSkeletonCard: {
    paddingVertical: 18,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(238, 242, 255, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.12)',
    gap: 10,
  },
  skeletonBarWide: {
    height: 14,
    borderRadius: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.28)',
    width: '88%',
  },
  skeletonBarMed: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    width: '100%',
  },
  skeletonCta: {
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(99, 102, 241, 0.22)',
    width: '100%',
    marginTop: 4,
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
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(248, 250, 252, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    position: 'relative',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.15s ease-in-out',
      '&:hover': {
        backgroundColor: 'rgba(241, 245, 249, 0.95)',
        borderColor: 'rgba(148, 163, 184, 0.22)',
      },
    }),
  },
  /** Active tab: readable but slightly desaturated vs primary actions */
  tabActive: {
    borderColor: 'rgba(139, 92, 246, 0.5)',
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(71, 81, 115, 0.1)',
    }),
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tabTextActive: {
    color: 'rgba(99, 102, 241, 1)',
    fontWeight: '700',
  },
  emptyState: {
    flex: 1,
    minHeight: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
  rowActionButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    flexShrink: 0,
  },
  rowActionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  rowActionButtonTextItalic: {
    fontStyle: 'italic',
  },
});
