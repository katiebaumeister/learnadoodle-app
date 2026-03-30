/**
 * Child Home Screen
 *
 * Mirrors ParentHomeScreen layout: header strip, today's schedule (embedded card),
 * and right rail with assignments. Child cannot add events from this screen.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Calendar } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import RoleHomeShell from '../home/RoleHomeShell';
import TodayScheduleCard from '../home/TodayScheduleCard';
import ChildHomeRightRail from './ChildHomeRightRail';
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
  const [todayEvents, setTodayEvents] = useState([]);
  const [children, setChildren] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const isParentViewingChild = Boolean(overrideChildId);
  const childId = overrideChildId ?? session?.child_id ?? session?.accessible_children?.[0]?.id;
  const familyId = overrideFamilyId ?? propFamilyId ?? session?.family_id;
  const child = overrideChildren?.[0] ?? session?.accessible_children?.[0];

  const safeChildId = childId != null && String(childId).trim() ? String(childId).trim() : null;
  const safeFamilyId = familyId != null && String(familyId).trim() ? String(familyId).trim() : null;

  const sessionLoading = session?.loading;
  useEffect(() => {
    if (!safeFamilyId || !safeChildId) return;
    if (isParentViewingChild) {
      loadData();
    } else if (session && sessionLoading === false) {
      loadData();
    }
  }, [sessionLoading, safeFamilyId, safeChildId, isParentViewingChild]);

  const loadData = async () => {
    if (!safeFamilyId || !safeChildId) return;

    if (isParentViewingChild && overrideChildren?.length) {
      setChildren(overrideChildren);
    }

    try {
      const loaders = [
        loadTodayEvents(),
        isParentViewingChild && overrideChildren?.length ? Promise.resolve() : loadChildren(),
        loadSubjects(),
      ].filter(Boolean);
      await Promise.all(loaders);
    } catch (error) {
      console.error('[ChildHomeScreen] Error loading data:', error);
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
          event_type
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
        subject: null,
        event_type: event.event_type,
      }));

      setTodayEvents(formattedEvents);
    } catch (error) {
      console.error('[ChildHomeScreen] Error loading events:', error);
      setTodayEvents([]);
    }
  };

  const loadChildren = async () => {
    if (isParentViewingChild && overrideChildren?.length) {
      setChildren(overrideChildren);
      return;
    }
    if (!safeFamilyId || !session) return;
    if (session.role_flags?.isChild && !session.child_id) {
      setChildren(session.accessible_children || []);
      return;
    }

    try {
      let query = supabase
        .from('children')
        .select('id, first_name, avatar')
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
        .eq('family_id', safeFamilyId);

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

  const sessionReady = isParentViewingChild || (session && !session.loading);
  if (sessionReady && (!childId || (!child && !isParentViewingChild))) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load your account information.</Text>
      </View>
    );
  }

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    }
    return 'Good evening';
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

  const blockCount = todayEvents.length;
  const scheduleSummaryLine =
    blockCount === 0
      ? isViewingToday
        ? 'No events today'
        : 'Nothing scheduled this day'
      : blockCount === 1
        ? '1 thing planned'
        : `${blockCount} things planned`;

  const handleViewTodaysTodo = () => {
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

      <View style={styles.scheduleSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Today's schedule</Text>
        </View>
        <TodayScheduleCard
          events={todayEvents}
          children={children}
          subjects={subjects}
          onOpenPlanner={() => onNavigate?.('planner')}
          onTabChange={onNavigate}
          onAddBlock={undefined}
          suggestedRhythms={[]}
          onAddSuggestedRhythm={() => {}}
          noCard
          showEmptyAddButton={false}
        />
      </View>
    </View>
  );

  const railContent = (
    <View style={styles.railContent}>
      {safeFamilyId ? (
        <ChildHomeRightRail familyId={safeFamilyId} childId={safeChildId} />
      ) : (
        <View style={{ minHeight: 120 }} />
      )}
    </View>
  );

  return (
    <View style={styles.homeRoot}>
      <RoleHomeShell main={mainContent} rail={railContent} />
    </View>
  );
}

const styles = StyleSheet.create({
  homeRoot: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    ...(Platform.OS === 'web' && {
      alignSelf: 'stretch',
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
  mainSurface: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    paddingVertical: 16,
    paddingHorizontal: 16,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      height: '100%',
      minHeight: 0,
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
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(135deg, #f4f2ff 0%, #eef6ff 48%, #f0fdf6 100%)',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)',
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
    gap: 6,
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
    marginTop: 4,
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
    marginTop: 12,
    marginBottom: 12,
  },
  scheduleSection: {
    flex: 1,
    marginTop: 2,
    paddingTop: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 6,
    marginBottom: 10,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    letterSpacing: -0.2,
    textTransform: 'none',
    marginTop: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  railContent: {
    flex: 1,
    flexDirection: 'column',
    minHeight: 0,
    width: '100%',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      height: '100%',
      flex: 1,
    }),
    ...(Platform.OS !== 'web' && {
      gap: 20,
    }),
  },
});
