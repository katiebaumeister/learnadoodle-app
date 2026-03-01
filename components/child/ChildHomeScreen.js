/**
 * Child Home Screen
 * 
 * Simplified, motivating home experience for children using RoleHomeShell:
 * - Today's schedule (only their events)
 * - Assignments due soon / needing review
 * - Quick action buttons (Submit, Ask for Help)
 * 
 * When overrideChildId/overrideFamilyId/overrideChildName/overrideChildren are provided
 * (e.g. parent viewing a specific child), uses those and filters data to that child only.
 * Same UI structure as parent home: main column + right rail.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, TouchableOpacity } from 'react-native';
import { HelpCircle } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { getAssignments } from '../../lib/services/assignmentsClient';
import RoleHomeShell from '../home/RoleHomeShell';
import HomeHeroCard from '../home/HomeHeroCard';
import TodayScheduleCard from '../home/TodayScheduleCard';
import AssignmentsCard from './overview/AssignmentsCard';
import AskForHelpModal from './AskForHelpModal';
import EmptyStateCard from '../home/EmptyStateCard';
import { applyChildFilter } from '../../lib/queryFilters';
import { colors } from '../../theme/colors';

export default function ChildHomeScreen({
  familyId: propFamilyId,
  onNavigate,
  overrideChildId = null,
  overrideFamilyId = null,
  overrideChildName = null,
  overrideChildren = null,
}) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [todayEvents, setTodayEvents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [children, setChildren] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [assignmentCount, setAssignmentCount] = useState(0);

  const isParentViewingChild = Boolean(overrideChildId);
  const childId = overrideChildId ?? session?.child_id ?? session?.accessible_children?.[0]?.id;
  const familyId = overrideFamilyId ?? propFamilyId ?? session?.family_id;
  const child = overrideChildren?.[0] ?? session?.accessible_children?.[0];
  const childName = overrideChildName ?? child?.name ?? child?.first_name ?? 'Student';

  // Ensure we have valid string IDs for API calls (avoid 400 from null/undefined/number)
  const safeChildId = childId != null && String(childId).trim() ? String(childId).trim() : null;
  const safeFamilyId = familyId != null && String(familyId).trim() ? String(familyId).trim() : null;

  useEffect(() => {
    if (!safeFamilyId || !safeChildId) return;
    if (isParentViewingChild) {
      loadData();
    } else if (session && !session.loading) {
      loadData();
    }
  }, [session, safeFamilyId, safeChildId, isParentViewingChild]);

  const loadData = async () => {
    if (!safeFamilyId || !safeChildId) return;

    if (isParentViewingChild && overrideChildren?.length) {
      setChildren(overrideChildren);
    }

    setLoading(true);
    try {
      const loaders = [
        loadTodayEvents(),
        loadAssignments(),
        isParentViewingChild && overrideChildren?.length ? Promise.resolve() : loadChildren(),
        loadSubjects(),
      ].filter(Boolean);
      await Promise.all(loaders);
    } catch (error) {
      console.error('[ChildHomeScreen] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTodayEvents = async () => {
    if (!safeFamilyId || !safeChildId) return;
    if (!isParentViewingChild && !session) return;

    try {
      const today = new Date(selectedDate);
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let query = supabase
        .from('events')
        .select(`
          id,
          title,
          description,
          start_ts,
          end_ts,
          status,
          child_id,
          subject_id,
          event_type,
          subject:subject_id (id, name)
        `)
        .eq('family_id', safeFamilyId)
        .gte('start_ts', today.toISOString())
        .lt('start_ts', tomorrow.toISOString())
        .neq('status', 'canceled')
        .is('deleted_at', null)
        .order('start_ts', { ascending: true });

      if (isParentViewingChild) {
        query = query.eq('child_id', safeChildId);
      } else {
        query = applyChildFilter(query, session, 'child_id');
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ChildHomeScreen] Error loading events:', error);
        setTodayEvents([]);
        return;
      }

      const formattedEvents = (data || []).map(event => ({
        id: event.id,
        title: event.title,
        description: event.description,
        start: event.start_ts,
        end: event.end_ts,
        status: event.status,
        child_id: event.child_id,
        subject_id: event.subject_id,
        subject: event.subject?.name || null,
        event_type: event.event_type,
      }));

      setTodayEvents(formattedEvents);
    } catch (error) {
      console.error('[ChildHomeScreen] Error loading events:', error);
      setTodayEvents([]);
    }
  };

  const loadAssignments = async () => {
    if (!safeChildId) return;

    try {
      const { data, error } = await getAssignments(safeChildId);
      if (error) {
        console.error('[ChildHomeScreen] Error loading assignments:', error);
        setAssignments([]);
        return;
      }
      setAssignments(data || []);
      
      // Count assignments needing attention
      const needsAttention = (data || []).filter(a => 
        a.status === 'in_progress' || 
        a.status === 'not_started' ||
        a.review_status === 'needs_revision'
      ).length;
      setAssignmentCount(needsAttention);
    } catch (error) {
      console.error('[ChildHomeScreen] Error loading assignments:', error);
      setAssignments([]);
    }
  };

  const loadChildren = async () => {
    if (isParentViewingChild && overrideChildren?.length) {
      setChildren(overrideChildren);
      return;
    }
    if (!safeFamilyId || !session) return;
    // Avoid query with undefined child_id for child users (causes 400)
    if (session.role_flags?.isChild && !session.child_id) {
      setChildren(session.accessible_children || []);
      return;
    }

    try {
      let query = supabase
        .from('children')
        .select('id, first_name, name, avatar')
        .eq('family_id', safeFamilyId);

      query = applyChildFilter(query, session, 'id');

      const { data, error } = await query;

      if (error) {
        console.error('[ChildHomeScreen] Error loading children:', error);
        setChildren([]);
        return;
      }

      setChildren(data || []);
    } catch (error) {
      console.error('[ChildHomeScreen] Error loading children:', error);
      setChildren([]);
    }
  };

  const loadSubjects = async () => {
    if (!safeFamilyId) return;

    try {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', safeFamilyId)
        .is('deleted_at', null);

      if (error) {
        console.error('[ChildHomeScreen] Error loading subjects:', error);
        setSubjects([]);
        return;
      }

      setSubjects(data || []);
    } catch (error) {
      console.error('[ChildHomeScreen] Error loading subjects:', error);
      setSubjects([]);
    }
  };

  const waitingForSession = !isParentViewingChild && session?.loading;
  if (waitingForSession || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!childId || (!child && !isParentViewingChild)) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load your account information.</Text>
      </View>
    );
  }

  const displayName = childName || (child && (child.name || child.first_name)) || 'Student';

  const heroProps = {
    date: selectedDate,
    title: "Today's plan",
    subtitle: `Hi ${displayName}! Here's what's happening today.`,
    chips: [
      { label: 'events', value: todayEvents.length, onClick: () => {} },
      { label: 'assignments', value: assignments.length, onClick: () => onNavigate?.('assignments') },
    ],
  };

  const mainContent = (
    <View style={styles.mainContent}>
      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.helpButton}
          onPress={() => setShowHelpModal(true)}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <HelpCircle size={18} color={colors.white} />
          <Text style={styles.helpButtonText}>Ask for Help</Text>
        </TouchableOpacity>
      </View>

      {/* Today's Schedule */}
      {todayEvents.length === 0 ? (
        <EmptyStateCard
          title="Nothing planned today"
          subtitle="Ask your parent to add activities, or check back later."
          actionLabel="Ask for Help"
          onAction={() => setShowHelpModal(true)}
        />
      ) : (
        <TodayScheduleCard
          events={todayEvents}
          children={children}
          subjects={subjects}
          onOpenPlanner={onNavigate ? () => onNavigate('calendar') : null}
          onAddBlock={null}
          suggestedRhythms={[]}
          onAddSuggestedRhythm={null}
        />
      )}

      {/* Assignments */}
      <AssignmentsCard
        childId={childId}
        familyId={familyId}
        onNavigate={onNavigate ? () => onNavigate('assignments') : null}
      />
    </View>
  );

  const railContent = (
    <View style={styles.railContent}>
      {/* My Focus placeholder */}
      <View style={styles.focusCard}>
        <Text style={styles.focusTitle}>My focus</Text>
        <Text style={styles.focusText}>Keep up the great work!</Text>
      </View>

      {/* Rewards placeholder */}
      <View style={styles.rewardsCard}>
        <Text style={styles.rewardsTitle}>Rewards</Text>
        <Text style={styles.rewardsText}>Nice work today!</Text>
      </View>
    </View>
  );

  return (
    <>
      <RoleHomeShell
        heroProps={heroProps}
        main={mainContent}
        rail={railContent}
      />

      <AskForHelpModal
        visible={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        childId={childId}
        familyId={familyId}
        onHelpRequested={() => {
          setShowHelpModal(false);
          loadAssignments();
        }}
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgSubtle,
    padding: 32,
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mainContent: {
    gap: 20,
  },
  quickActions: {
    marginBottom: 0,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignSelf: 'flex-start',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
      transition: 'all 0.2s ease-in-out',
      '&:hover': {
        opacity: 0.9,
      },
    }),
  },
  helpButtonText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  railContent: {
    gap: 20,
  },
  focusCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
    }),
  },
  focusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  focusText: {
    fontSize: 13,
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
  rewardsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
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
});
