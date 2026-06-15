/**
 * Child Home Screen
 *
 * Mirrors ParentHomeScreen layout: hero strip, bulletin board main column,
 * and right rail with today's schedule.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Calendar } from 'lucide-react';
import SchedulePanelNavGroup from '../home/SchedulePanelNavGroup';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import RoleHomeShell from '../home/RoleHomeShell';
import TodayScheduleCard from '../home/TodayScheduleCard';
import BulletinBoardSection from '../bulletin/BulletinBoardSection';
import { applyChildFilter } from '../../lib/queryFilters';
import { colors } from '../../theme/colors';

function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatGreetingDateInline(date) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function getDayOrdinalSuffix(day) {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatSchedulePanelTitle(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = date instanceof Date && !Number.isNaN(date.getTime())
    ? new Date(date)
    : new Date(today);
  target.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "Today's Schedule";
  if (diffDays === 1) return "Tomorrow's Schedule";
  if (diffDays === -1) return "Yesterday's Schedule";

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = target.getDate();
  return `${months[target.getMonth()]} ${day}${getDayOrdinalSuffix(day)} Schedule`;
}

export default function ChildHomeScreen({
  familyId: propFamilyId,
  onNavigate,
  overrideChildId = null,
  overrideFamilyId = null,
  overrideChildName = null,
  overrideChildren = null,
  showRightRail = true,
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
  const isSelfManagedStudent =
    session?.role_flags?.isChild === true
    && session?.student_self_signup === true
    && session?.child_linked_via_accepted_invite !== true;

  useEffect(() => {
    if (!safeFamilyId || !safeChildId) return;
    if (isParentViewingChild) {
      loadData();
    } else if (session && sessionLoading === false) {
      loadData();
    }
  }, [sessionLoading, safeFamilyId, safeChildId, isParentViewingChild, selectedDate]);

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
        start_ts: event.start_ts,
        end_ts: event.end_ts,
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

  const viewerFirstName = useMemo(() => {
    const raw =
      overrideChildName
      || child?.first_name
      || child?.name
      || session?.accessible_children?.[0]?.first_name
      || '';
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    return trimmed.split(/\s+/)[0];
  }, [overrideChildName, child?.first_name, child?.name, session?.accessible_children]);

  if (sessionReady && (!childId || (!child && !isParentViewingChild))) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load your account information.</Text>
      </View>
    );
  }

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

  const shiftSelectedDay = (deltaDays) => {
    setSelectedDate((prev) => {
      const base = prev instanceof Date && !Number.isNaN(prev.getTime()) ? prev : new Date();
      const next = new Date(base);
      next.setDate(next.getDate() + deltaDays);
      return next;
    });
  };

  const jumpToTodaySchedule = () => {
    setSelectedDate(new Date());
  };

  const schedulePanelTitle = useMemo(
    () => formatSchedulePanelTitle(selectedDate),
    [selectedDate]
  );

  const renderSchedulePanel = (panelStyle) => (
    <View style={[styles.scheduleSection, panelStyle]}>
      <View style={styles.schedulePanelHeader}>
        <View style={styles.scheduleHeaderLeading}>
          <SchedulePanelNavGroup
            onPrevDay={() => shiftSelectedDay(-1)}
            onNextDay={() => shiftSelectedDay(1)}
            styles={styles}
          />
          <TouchableOpacity
            style={styles.scheduleHeaderTitleWrap}
            onPress={jumpToTodaySchedule}
            activeOpacity={0.85}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Text style={styles.sectionLabel} numberOfLines={1}>
              {schedulePanelTitle}
            </Text>
          </TouchableOpacity>
        </View>
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
        hideSubjectDot={isSelfManagedStudent}
      />
    </View>
  );

  const heroContent = (
    <View style={styles.greetingContainer}>
      <View style={styles.greetingInner}>
        <View style={styles.greetingCopy}>
          <Text style={styles.greetingTitle}>
            {getTimeBasedGreeting()}
            {viewerFirstName ? `, ${viewerFirstName}` : ''}.
          </Text>
          <Text style={styles.greetingSubtitle}>Let's see where learning takes us today.</Text>
          <Text style={styles.greetingDateLine}>{formatGreetingDateInline(new Date())}</Text>
        </View>
        <TouchableOpacity
          style={styles.greetingActionButton}
          onPress={handleViewTodaysTodo}
          {...(Platform.OS === 'web' && { cursor: 'pointer' })}
        >
          <Calendar size={18} color="#334155" strokeWidth={2.25} />
          <Text style={styles.greetingActionButtonText}>View To-Dos</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const scheduleContent = (
    <View style={styles.mainSurface}>
      {renderSchedulePanel(styles.scheduleSection)}
    </View>
  );

  const bulletinRailContent = showRightRail ? (
    <View style={[styles.bulletinBoardSection, styles.railBulletinSection]}>
      <BulletinBoardSection
        familyId={safeFamilyId}
        children={children}
        subjects={subjects}
        feedTitle="Bulletin Board"
        onSubjectPress={(subjectId) => {
          if (subjectId) onNavigate?.(`subject-${subjectId}`);
        }}
      />
    </View>
  ) : null;

  return (
    <View style={styles.homeRoot}>
      <RoleHomeShell hero={heroContent} main={scheduleContent} rail={bulletinRailContent} />
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
  greetingContainer: {
    position: 'relative',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.12)',
    backgroundColor: colors.bgSubtle,
    minHeight: 110,
    paddingVertical: 22,
    paddingHorizontal: 24,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(135deg, #f4f2ff 0%, #eef6ff 48%, #f0fdf6 100%)',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
    }),
  },
  greetingInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    minHeight: 88,
  },
  greetingCopy: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
  },
  greetingTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.4,
    lineHeight: 34,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  greetingSubtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#334155',
    lineHeight: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  greetingDateLine: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    lineHeight: 20,
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  greetingActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 11,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.22)',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  greetingActionButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
    letterSpacing: -0.1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  mainSurface: {
    flex: 1,
    backgroundColor: 'transparent',
    gap: 12,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
    }),
  },
  bulletinBoardSection: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    marginTop: 2,
    paddingTop: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 0,
    paddingBottom: 0,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxHeight: '100%',
    }),
  },
  scheduleSection: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    marginTop: 2,
    paddingTop: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.12)',
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxHeight: '100%',
    }),
  },
  schedulePanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
    flexShrink: 0,
    gap: 12,
  },
  scheduleHeaderLeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scheduleHeaderTitleWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  scheduleNavGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  dayNavButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    flexShrink: 0,
  },
  dayNavButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 2,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      transition: 'all 0.2s ease',
    }),
  },
  scheduleTitleButton: {
    flexShrink: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
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
  railScheduleSection: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    marginTop: 0,
    width: '100%',
    ...(Platform.OS === 'web' && {
      height: '100%',
      maxHeight: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
    }),
  },
  railBulletinSection: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    marginTop: 0,
    width: '100%',
    ...(Platform.OS === 'web' && {
      height: '100%',
      maxHeight: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
    }),
  },
});
