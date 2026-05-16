/**
 * ParentHomeScreen
 * 
 * Full parent dashboard with:
 * - Today Forecast hero
 * - Main column: QuickAdd, Schedule, Backlog
 * - Right rail: Notification Center, Rewards, Subscription
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Plus, Calendar } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { isAbortLikeError } from '../../lib/apiClient';
import RoleHomeShell from './RoleHomeShell';
import HomeHeroCard from './HomeHeroCard';
import TodayScheduleCard from './TodayScheduleCard';
import BacklogCard from './BacklogCard';
import AssignmentsNeedingAttentionCard from './AssignmentsNeedingAttentionCard';
import EmptyStateCard from './EmptyStateCard';
import EmbeddedNotificationCenter from '../parent/EmbeddedNotificationCenter';
import ParentDigestModal from './ParentDigestModal';
import NextRecommendedActionRow from './NextRecommendedActionRow';
import { colors } from '../../theme/colors';
import { getEventChildIdsForDisplay } from '../../lib/utils/eventChildIds';

async function hydrateLearningAssignees(learning = [], familyId) {
  const items = Array.isArray(learning) ? learning : [];
  const eventIds = items
    .map((event) => event?.id)
    .filter((id) => id != null && id !== '');
  if (!familyId || eventIds.length === 0) return items;

  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, child_id, child_ids')
      .eq('family_id', familyId)
      .in('id', eventIds);

    if (error || !Array.isArray(data) || data.length === 0) {
      return items;
    }

    const assigneesByEventId = new Map(
      data.map((row) => [String(row.id), row])
    );

    return items.map((event) => {
      const assigneeRow = assigneesByEventId.get(String(event?.id));
      if (!assigneeRow) return event;

      const rowChildIds = Array.isArray(assigneeRow.child_ids)
        ? assigneeRow.child_ids.filter((id) => id != null && id !== '')
        : [];
      const fallbackChildId =
        assigneeRow.child_id != null && assigneeRow.child_id !== ''
          ? [assigneeRow.child_id]
          : [];
      const mergedChildIds =
        rowChildIds.length > 0
          ? rowChildIds
          : Array.isArray(event?.child_ids) && event.child_ids.length > 0
            ? event.child_ids
            : fallbackChildId;

      return {
        ...event,
        child_id: assigneeRow.child_id ?? event?.child_id ?? null,
        child_ids: mergedChildIds,
      };
    });
  } catch {
    return items;
  }
}

export default function ParentHomeScreen({
  familyId: propFamilyId,
  onNavigate,
  onAddEvent,
  onAddGrade,
  onAddMaterial,
  onAddSubject,
  onAddChild,
  hideRailOnboardingCards = false,
}) {
  const session = useSession();
  const [homeData, setHomeData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notificationCount, setNotificationCount] = useState(0);
  const [error, setError] = useState(null);
  const [showParentDigest, setShowParentDigest] = useState(false);

  // Get familyId from session if not provided as prop
  const familyId = propFamilyId || session?.family_id;

  // Cache helpers (matching WebContent pattern)
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const getHomeDataCacheKey = (familyId, date) => {
    return `home_data_${familyId}_${date}`;
  };

  const loadHomeDataFromCache = (familyId, date) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    try {
      const cacheKey = getHomeDataCacheKey(familyId, date);
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      
      if (age < CACHE_TTL_MS) {
        return data;
      } else {
        localStorage.removeItem(cacheKey);
        return null;
      }
    } catch (err) {
      console.error('[ParentHomeScreen] Error reading cache:', err);
      return null;
    }
  };

  const saveHomeDataToCache = (familyId, date, data) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const cacheKey = getHomeDataCacheKey(familyId, date);
      localStorage.setItem(cacheKey, JSON.stringify({
        data: data,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error('[ParentHomeScreen] Error saving cache:', err);
    }
  };

  useEffect(() => {
    // Wait for session to be ready and familyId to be available
    if (session && !session.loading && familyId && !session.error) {
      // Check cache first - if available, use it immediately without loading state
      const validDate = selectedDate instanceof Date && !isNaN(selectedDate.getTime())
        ? selectedDate
        : new Date();
      validDate.setHours(0, 0, 0, 0);
      const dateStr = validDate.toISOString().split('T')[0];
      
      const cachedData = loadHomeDataFromCache(familyId, dateStr);
      if (cachedData) {
        // Use cached data immediately - no loading state
        setHomeData(cachedData);
        setError(null);
        // Load notification count in background
        loadNotificationCount();
        // Refresh data in background without showing loading
        loadData(true); // Pass true to indicate silent refresh
        return;
      }
      
      // No cache - set empty data immediately (no loading state) and load in background
      setHomeData({
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });
      setError(null);
      // Load data in background silently
      loadData(true);
      // Load notification count in background
      loadNotificationCount();
    } else if (session && session.error) {
      setError(new Error('Session error: ' + session.error));
      setHomeData({
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });
    } else if (session && !session.loading && !familyId) {
      setError(new Error('No family ID available'));
      setHomeData({
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });
    }
    // Primitives only — avoid re-running when SessionContext value identity flickers.
  }, [session?.loading, session?.error, familyId, selectedDate]);

  const loadData = async (silent = false) => {
    if (!familyId) return;

    try {
      const validDate = selectedDate instanceof Date && !isNaN(selectedDate.getTime())
        ? selectedDate
        : new Date();
      validDate.setHours(0, 0, 0, 0);
      const dateStr = validDate.toISOString().split('T')[0];

      // Load home data - match the signature used in WebContent
      const { data, error } = await supabase.rpc('get_home_data', {
        _family_id: familyId,
        _date: dateStr,
        _horizon_days: 14,
      });

      if (error) {
        if (!isAbortLikeError(error)) {
          console.error('[ParentHomeScreen] RPC error:', error);
        }
        if (!silent && !isAbortLikeError(error)) {
          setError(error);
        }
        // Set empty data structure to prevent infinite loading
        const emptyData = {
          learning: [],
          tasks: [],
          children: [],
          subjects: [],
        };
        setHomeData(emptyData);
        // Still try to load notification count even if RPC fails
        try {
          await loadNotificationCount();
        } catch (e) {
          if (!isAbortLikeError(e)) {
            console.error('[ParentHomeScreen] Error loading notification count:', e);
          }
        }
        return;
      }
      
      const homeDataResult = data || {
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      };
      const learningWithAssignees = await hydrateLearningAssignees(
        homeDataResult.learning,
        familyId
      );
      const normalizedHomeData = {
        ...homeDataResult,
        learning: learningWithAssignees,
      };
      
      setError(null);
      setHomeData(normalizedHomeData);
      
      // Save to cache
      saveHomeDataToCache(familyId, dateStr, normalizedHomeData);

      // Load notification count
      await loadNotificationCount();
    } catch (error) {
      if (!isAbortLikeError(error)) {
        console.error('[ParentHomeScreen] Error loading data:', error);
      }
      if (!silent && !isAbortLikeError(error)) {
        setError(error);
      }
      // Set empty data to prevent infinite loading
      setHomeData({
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });
    }
  };

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId) return;
    const onRefreshCalendar = (e) => {
      if (e?.detail?.skipHomeRefresh) return;
      loadDataRef.current(true);
    };
    const onAttendancePatched = (e) => {
      const rawEventId = e?.detail?.eventId;
      if (!rawEventId) return;
      const eventId = String(rawEventId);
      const rawStatus = String(e?.detail?.status || '').trim().toLowerCase();
      const nextStatus = rawStatus === 'completed' ? 'done' : (rawStatus || 'scheduled');
      setHomeData((prev) => {
        if (!prev || !Array.isArray(prev.learning) || prev.learning.length === 0) return prev;
        let changed = false;
        const nextLearning = prev.learning.map((event) => {
          if (!event?.id || String(event.id) !== eventId) return event;
          changed = true;
          return { ...event, status: nextStatus };
        });
        return changed ? { ...prev, learning: nextLearning } : prev;
      });
    };
    window.addEventListener('refreshCalendar', onRefreshCalendar);
    window.addEventListener('eventAttendancePatched', onAttendancePatched);
    return () => {
      window.removeEventListener('refreshCalendar', onRefreshCalendar);
      window.removeEventListener('eventAttendancePatched', onAttendancePatched);
    };
  }, [familyId]);

  /** Must stay above any early return (Rules of Hooks). */
  const handleInviteChildFromRail = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const n = Array.isArray(homeData?.children) ? homeData.children.length : 0;
    if (n === 0) {
      window.dispatchEvent(new CustomEvent('openAddChildModal'));
      return;
    }
    window.dispatchEvent(new CustomEvent('openInviteChildModal'));
  }, [homeData?.children]);

  const loadNotificationCount = async () => {
    try {
      // Get actual count of assignments needing attention
      const { count, error } = await supabase
        .from('assignments')
        .select('*', { count: 'exact', head: true })
        .eq('family_id', familyId)
        .or('status.eq.submitted,need_help.eq.true,review_status.eq.needs_revision');

      if (error) {
        // If table doesn't exist, set count to 0
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          setNotificationCount(0);
          return;
        }
        throw error;
      }
      setNotificationCount(count || 0);
    } catch (error) {
      if (!isAbortLikeError(error)) {
        console.error('[ParentHomeScreen] Error loading notification count:', error);
      }
      setNotificationCount(0);
    }
  };

  if (error && !homeData) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Unable to load home data</Text>
        <Text style={styles.errorSubtext}>
          {error.message || 'Please try refreshing the page'}
        </Text>
      </View>
    );
  }

  const effectiveHomeData = homeData || {
    learning: [],
    tasks: [],
    children: [],
    subjects: [],
  };

  // Compute weather forecast with contextual signals
  const filteredLearning = effectiveHomeData.learning || [];
  const blockCount = filteredLearning.length;
  const backlogCount = (effectiveHomeData.tasks || []).filter(t => !t.start_ts || t.status === 'backlog').length;
  const overdueCount = (effectiveHomeData.tasks || []).filter(t => t.due_time === 'Overdue').length;
  const children = effectiveHomeData.children || [];

  // Calculate which students have activity today
  const studentsWithActivity = children.map(child => {
    const childEvents = filteredLearning.filter((event) => {
      const eventChildIds = getEventChildIdsForDisplay(event, children);
      return eventChildIds.some((id) => String(id) === String(child.id));
    });
    return {
      ...child,
      activityCount: childEvents.length,
    };
  }).filter(student => student.activityCount > 0);

  // Calculate "ready" items (items ready to start - not overdue, not backlog)
  const readyCount = blockCount; // Items scheduled for today are "ready"

  // Calculate items due today or tomorrow (Assignment or Project)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  const dueTodayOrTomorrow = (effectiveHomeData.learning || []).filter(event => {
    if (!event.start_ts && !event.start) return false;
    const eventType = event.event_type || event.type || '';
    if (eventType !== 'Assignment' && eventType !== 'Project') return false;
    
    const eventDate = new Date(event.start_ts || event.start);
    eventDate.setHours(0, 0, 0, 0);
    
    return (eventDate.getTime() === today.getTime() || eventDate.getTime() === tomorrow.getTime());
  }).length;

  
  // Get first child name for contextual message
  const firstChildName = children.length > 0 
    ? (children[0].first_name || children[0].name || 'your child')
    : null;

  // Determine poodle pose based on urgency
  // calm → no urgency (light, no overdue)
  // attentive → items ready (moderate, or ready items exist)
  // alert → overdue exists
  let poodlePose = 'calm';
  if (overdueCount > 0) {
    poodlePose = 'alert';
  } else if (blockCount > 0 || backlogCount > 0) {
    poodlePose = 'attentive';
  }

  // Determine weather status for poodle image
  let weatherStatus = 'light';
  if (overdueCount > 0) {
    weatherStatus = 'catch-up'; // Use heavy image for alert
  } else if (blockCount >= 6) {
    weatherStatus = 'heavy';
  } else if (blockCount >= 4) {
    weatherStatus = 'moderate';
  }


  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  };

  const formatDate = (date) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${dayName}, ${month} ${day}, ${year}`;
  };

  const isViewingToday = (() => {
    const d = new Date(selectedDate);
    if (Number.isNaN(d.getTime())) return true;
    d.setHours(0, 0, 0, 0);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return d.getTime() === t.getTime();
  })();

  const scheduleSummaryLine =
    blockCount === 0
      ? isViewingToday
        ? 'No events today'
        : 'Nothing scheduled this day'
      : blockCount === 1
        ? '1 thing planned'
        : `${blockCount} things planned`;

  const handleViewTodaysTodo = () => {
    // Navigate to planner → To-do lists → Today (client-side, no reload)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const todayStr = new Date().toISOString().split('T')[0];
      const url = new URL(window.location.href);
      url.pathname = '/planner';
      url.searchParams.set('view', 'tasks');
      url.searchParams.set('section', 'today');
      url.searchParams.set('date', todayStr);
      window.history.pushState({}, '', url.toString());
      window.dispatchEvent(new CustomEvent('plannerViewChange', { detail: 'tasks' }));
      window.dispatchEvent(new CustomEvent('plannerTasksViewChange', { detail: { section: 'today' } }));
      if (onNavigate) onNavigate('planner');
    } else if (onNavigate) {
      onNavigate('planner');
    }
  };

  const mainContent = (
    <View style={styles.mainSurface}>
      {/* Dashboard header anchor */}
      <View style={styles.headerCard}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.greetingText}>{getTimeBasedGreeting()}</Text>
            <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
            <Text style={styles.scheduleSummaryText}>{scheduleSummaryLine}</Text>
          </View>
          <TouchableOpacity
            style={styles.viewTodosButton}
            onPress={handleViewTodaysTodo}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Calendar size={16} color="#5B6B7A" />
            <Text style={styles.viewTodosButtonText}>View To-Dos</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />

      {/* Today's schedule — primary “Add event” lives in card empty state; header CTA when there are events */}
      <View style={styles.scheduleSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Today's schedule</Text>
          {blockCount > 0 ? (
            <TouchableOpacity
              style={styles.addButton}
              onPress={onAddEvent}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Plus size={16} color="#64748b" />
              <Text style={styles.addButtonText}>Add event</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <TodayScheduleCard
          events={filteredLearning}
          children={effectiveHomeData.children || []}
          subjects={effectiveHomeData.subjects || []}
          onOpenPlanner={() => onNavigate?.('planner')}
          onTabChange={onNavigate}
          onAddBlock={onAddEvent}
          suggestedRhythms={[]}
          onAddSuggestedRhythm={() => {}}
          noCard={true}
        />
      </View>
    </View>
  );

  const railContent = (
    <View style={styles.railContent}>
      <EmbeddedNotificationCenter
        familyId={familyId}
        limit={5}
        onViewAll={() => onNavigate?.('review-inbox')}
        onInviteChild={handleInviteChildFromRail}
        onGoToPlanner={() => onNavigate?.('planner')}
        hideOnboardingCards={hideRailOnboardingCards}
      />
    </View>
  );

  // Calculate most active subject for digest
  const subjectCounts = {};
  (effectiveHomeData.learning || []).forEach(event => {
    if (event.subject_id) {
      const subject = (effectiveHomeData.subjects || []).find(s => s.id === event.subject_id);
      if (subject) {
        subjectCounts[subject.name] = (subjectCounts[subject.name] || 0) + 1;
      }
    }
  });
  const mostActiveSubject = Object.keys(subjectCounts).length > 0
    ? Object.entries(subjectCounts).sort((a, b) => b[1] - a[1])[0][0]
    : null;

  return (
    <>
      <RoleHomeShell
        main={mainContent}
        rail={railContent}
      />
      <ParentDigestModal
        visible={showParentDigest}
        onClose={() => setShowParentDigest(false)}
        todayBlocks={blockCount}
        backlogCount={backlogCount}
        overdueCount={overdueCount}
        mostActiveSubject={mostActiveSubject}
        suggestedAction={null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
  },
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mainSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      minHeight: 0,
      paddingVertical: 10,
      paddingHorizontal: 12,
      /* Single white column comes from RoleHomeShell.leftSection — avoid double card chrome */
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderRadius: 0,
      boxShadow: 'none',
    }),
  },
  headerCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.12)',
    backgroundColor: colors.bgSubtle,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(135deg, #f4f2ff 0%, #eef6ff 48%, #f0fdf6 100%)',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 14,
  },
  headerLeft: {
    flexDirection: 'column',
    gap: 8,
    flex: 1,
    minWidth: 200,
    ...(Platform.OS === 'web' && {
      minWidth: 220,
    }),
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.3,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scheduleSummaryText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '400',
    marginTop: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewTodosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }),
  },
  viewTodosButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    marginTop: 10,
    marginBottom: 10,
  },
  scheduleSection: {
    flex: 1,
    marginTop: 2,
    /** Match headerCard top inset so “Add event” aligns with “View To-Dos” from the card edge */
    paddingTop: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 0,
    marginBottom: 8,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    paddingRight: 10,
  },
  /** Section title — slightly heavier than body, below page hero */
  sectionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: -0.2,
    textTransform: 'none',
    marginTop: 0,
    flexShrink: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mainContent: {
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      flex: 1,
      minHeight: 0,
    }),
    ...(Platform.OS !== 'web' && {
      gap: 20,
    }),
  },
  railContent: {
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      alignSelf: 'stretch',
    }),
    ...(Platform.OS !== 'web' && {
      gap: 20,
    }),
  },
});
