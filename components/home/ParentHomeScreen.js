/**
 * ParentHomeScreen
 * 
 * Full parent dashboard with:
 * - Today Forecast hero
 * - Main column: QuickAdd, Schedule, Backlog
 * - Right rail: Notification Center, Rewards, Subscription
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { Plus, Calendar } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
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

export default function ParentHomeScreen({
  familyId: propFamilyId,
  onNavigate,
  onAddEvent,
  onAddGrade,
  onAddMaterial,
  onAddSubject,
  onAddChild,
}) {
  const session = useSession();
  const [loading, setLoading] = useState(false); // Start as false - check cache first
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
        setLoading(false);
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
      setLoading(false);
      setError(null);
      // Load data in background silently
      loadData(true);
      // Load notification count in background
      loadNotificationCount();
    } else if (session && session.error) {
      // If session has error, set loading to false to show error state
      setLoading(false);
      setError(new Error('Session error: ' + session.error));
      setHomeData({
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });
    } else if (session && !session.loading && !familyId) {
      // Session loaded but no familyId - show error
      setLoading(false);
      setError(new Error('No family ID available'));
      setHomeData({
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });
    }
  }, [session, familyId, selectedDate]);

  const loadData = async (silent = false) => {
    if (!familyId) return;

    if (!silent) {
      setLoading(true);
    }
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
        console.error('[ParentHomeScreen] RPC error:', error);
        if (!silent) {
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
          console.error('[ParentHomeScreen] Error loading notification count:', e);
        }
        return;
      }
      
      const homeDataResult = data || {
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      };
      
      setError(null);
      setHomeData(homeDataResult);
      
      // Save to cache
      saveHomeDataToCache(familyId, dateStr, homeDataResult);

      // Load notification count
      await loadNotificationCount();
    } catch (error) {
      console.error('[ParentHomeScreen] Error loading data:', error);
      if (!silent) {
        setError(error);
      }
      // Set empty data to prevent infinite loading
      setHomeData({
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

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
      console.error('[ParentHomeScreen] Error loading notification count:', error);
      setNotificationCount(0);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  // If no homeData after loading, show error or empty state
  if (!homeData) {
    return (
      <View style={styles.loadingContainer}>
        {error ? (
          <>
            <Text style={styles.errorText}>Unable to load home data</Text>
            <Text style={styles.errorSubtext}>
              {error.message || 'Please try refreshing the page'}
            </Text>
          </>
        ) : (
          <Text style={styles.loadingText}>No data available</Text>
        )}
      </View>
    );
  }

  // Compute weather forecast with contextual signals
  const filteredLearning = homeData.learning || [];
  const blockCount = filteredLearning.length;
  const backlogCount = (homeData.tasks || []).filter(t => !t.start_ts || t.status === 'backlog').length;
  const overdueCount = (homeData.tasks || []).filter(t => t.due_time === 'Overdue').length;
  const children = homeData.children || [];

  // Calculate which students have activity today
  const studentsWithActivity = children.map(child => {
    const childEvents = filteredLearning.filter(event => {
      const eventChildIds = event.child_ids || (event.child_id ? [event.child_id] : []);
      return eventChildIds.includes(child.id) || event.child_id === child.id;
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

  const dueTodayOrTomorrow = (homeData.learning || []).filter(event => {
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
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.greetingText}>{getTimeBasedGreeting()}, Doodle Family!</Text>
          <Text style={styles.dateText}>{formatDate(selectedDate)}</Text>
        </View>
        <TouchableOpacity
          style={styles.viewTodosButton}
          onPress={handleViewTodaysTodo}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Calendar size={16} color="#6B7280" />
          <Text style={styles.viewTodosButtonText}>View To-Dos</Text>
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Today's Schedule Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Today's schedule</Text>
          <TouchableOpacity
            style={styles.addButton}
            onPress={onAddEvent}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={16} color="#6B7280" />
            <Text style={styles.addButtonText}>Add event</Text>
          </TouchableOpacity>
        </View>
        <TodayScheduleCard
          events={filteredLearning}
          children={homeData.children || []}
          subjects={homeData.subjects || []}
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
      />
    </View>
  );

  // Calculate most active subject for digest
  const subjectCounts = {};
  (homeData.learning || []).forEach(event => {
    if (event.subject_id) {
      const subject = (homeData.subjects || []).find(s => s.id === event.subject_id);
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
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 24,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      minHeight: 0,
    }),
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'column',
    gap: 4,
  },
  headerLeft: {
    flexDirection: 'column',
    gap: 4,
  },
  greetingText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  viewTodosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
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
    backgroundColor: '#E5E7EB',
    marginBottom: 16,
  },
  section: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'none',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
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
