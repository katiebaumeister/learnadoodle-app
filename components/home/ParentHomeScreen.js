/**
 * ParentHomeScreen
 * 
 * Full parent dashboard with:
 * - Today Forecast hero
 * - Main column: QuickAdd, Schedule, Backlog
 * - Right rail: Notification Center, Rewards, Subscription
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, ScrollView, Image } from 'react-native';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import RoleHomeShell from './RoleHomeShell';
import HomeHeroCard from './HomeHeroCard';
import QuickAddRow from './QuickAddRow';
import TodayScheduleCard from './TodayScheduleCard';
import BacklogCard from './BacklogCard';
import AssignmentsNeedingAttentionCard from './AssignmentsNeedingAttentionCard';
import EmptyStateCard from './EmptyStateCard';
import EmbeddedNotificationCenter from '../parent/EmbeddedNotificationCenter';
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
  const [loading, setLoading] = useState(true);
  const [homeData, setHomeData] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notificationCount, setNotificationCount] = useState(0);
  const [error, setError] = useState(null);

  // Get familyId from session if not provided as prop
  const familyId = propFamilyId || session?.family_id;

  useEffect(() => {
    // Wait for session to be ready and familyId to be available
    if (session && !session.loading && familyId && !session.error) {
      loadData();
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

  const loadData = async () => {
    if (!familyId) return;

    setLoading(true);
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
        setError(error);
        // Set empty data structure to prevent infinite loading
        setHomeData({
          learning: [],
          tasks: [],
          children: [],
          subjects: [],
        });
        // Still try to load notification count even if RPC fails
        try {
          await loadNotificationCount();
        } catch (e) {
          console.error('[ParentHomeScreen] Error loading notification count:', e);
        }
        return;
      }
      
      setError(null);
      setHomeData(data || {
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });

      // Load notification count
      await loadNotificationCount();
    } catch (error) {
      console.error('[ParentHomeScreen] Error loading data:', error);
      setError(error);
      // Set empty data to prevent infinite loading
      setHomeData({
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });
    } finally {
      setLoading(false);
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
  
  // Get first child name for contextual message
  const firstChildName = children.length > 0 
    ? (children[0].first_name || children[0].name || 'your child')
    : null;

  let weatherStatus = 'light';
  let weatherMessage = "Open day — good opportunity for gentle review or exploration.";

  // Enhanced contextual logic
  if (blockCount === 0 && backlogCount > 0) {
    weatherStatus = 'light';
    weatherMessage = backlogCount === 1
      ? `Only one item waiting — a great day to explore or review.`
      : `${backlogCount} items waiting — good time to catch up.`;
  } else if (blockCount === 0 && backlogCount === 0) {
    weatherStatus = 'light';
    weatherMessage = "Open day — good opportunity for gentle review or exploration.";
  } else if (blockCount >= 1 && blockCount <= 3) {
    weatherStatus = 'light';
    if (firstChildName && blockCount === 1) {
      weatherMessage = `${firstChildName} has one activity planned.`;
    } else if (firstChildName) {
      weatherMessage = `${firstChildName} has ${blockCount} activities planned.`;
    } else {
      weatherMessage = "Light day — good opportunity for gentle review or exploration.";
    }
  } else if (blockCount >= 4 && blockCount <= 5) {
    weatherStatus = 'moderate';
    weatherMessage = "Steady day — balanced schedule ahead.";
  } else if (blockCount >= 6 || overdueCount > 0) {
    weatherStatus = overdueCount > 0 ? 'catch-up' : 'heavy';
    weatherMessage = overdueCount > 0
      ? "Time to catch up — focus on overdue items first."
      : "Heavy day — pace yourself and take breaks.";
  }

  const weatherLabels = {
    light: "Today is light.",
    moderate: "Today is steady.",
    heavy: "Today is heavy.",
    'catch-up': "Time to catch up.",
  };

  const heroProps = {
    date: selectedDate,
    title: weatherLabels[weatherStatus] || "Today is light.",
    subtitle: weatherMessage,
    chips: [
      { label: 'blocks', value: blockCount, onClick: () => {} },
      { label: 'backlog', value: backlogCount, onClick: () => onNavigate?.('planner') },
      { label: 'overdue', value: overdueCount, onClick: () => onNavigate?.('planner') },
    ],
    statusBadges: {
      notifications: notificationCount,
      rewards: 0, // TODO: Implement streak/rewards
      premium: false, // TODO: Check subscription status
    },
    onNotificationPress: () => onNavigate?.('review-inbox'),
  };

  const mainContent = (
    <View style={styles.mainContent}>
      <QuickAddRow
        onAddEvent={onAddEvent}
        onAddGrade={onAddGrade}
        onAddMaterial={onAddMaterial}
        onAddSubject={onAddSubject}
        onAddChild={onAddChild}
      />

      <TodayScheduleCard
        events={filteredLearning}
        children={homeData.children || []}
        subjects={homeData.subjects || []}
        onOpenPlanner={() => onNavigate?.('planner')}
        onAddBlock={onAddEvent}
        suggestedRhythms={[]}
        onAddSuggestedRhythm={() => {}}
      />

      <AssignmentsNeedingAttentionCard
        familyId={familyId}
        limit={3}
      />

      <BacklogCard
        backlogItems={(homeData.tasks || []).slice(0, 3)}
        backlogCount={backlogCount}
        children={homeData.children || []}
        onViewBacklog={() => onNavigate?.('planner')}
      />
    </View>
  );

  const railContent = (
    <View style={styles.railContent}>
      <EmbeddedNotificationCenter
        familyId={familyId}
        limit={5}
        onViewAll={() => onNavigate?.('review-inbox')}
      />

      {/* Rewards card with poodle */}
      <View style={styles.rewardsCard}>
        <View style={styles.rewardsHeader}>
          <Image
            source={require('../../assets/poodle-icon.png')}
            style={styles.rewardsPoodle}
            resizeMode="contain"
          />
          <Text style={styles.rewardsTitle}>Rewards</Text>
        </View>
        <Text style={styles.rewardsText}>Keep up the great work!</Text>
      </View>

      {/* Subscription card placeholder - only show if not premium */}
      {!heroProps.statusBadges.premium && (
        <View style={styles.subscriptionCard}>
          <Text style={styles.subscriptionTitle}>Try Premium</Text>
          <Text style={styles.subscriptionText}>
            Unlock deeper weekly digest, auto-reschedule, and multi-year planning.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <RoleHomeShell
      heroProps={heroProps}
      main={mainContent}
      rail={railContent}
    />
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
  rewardsCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  rewardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  rewardsPoodle: {
    width: 24,
    height: 24,
    opacity: 0.7,
  },
  rewardsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  rewardsText: {
    fontSize: 13,
    color: colors.textSecondary,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subscriptionCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  subscriptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subscriptionText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mainContent: {
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      width: '100%',
    }),
    ...(Platform.OS !== 'web' && {
      gap: 20,
    }),
  },
  railContent: {
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      width: '100%',
    }),
    ...(Platform.OS !== 'web' && {
      gap: 20,
    }),
  },
});
