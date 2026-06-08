/**
 * ParentHomeScreen — "What requires attention today?"
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { AlertTriangle, Clock, HelpCircle, TrendingUp, CalendarDays, Star } from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { isAbortLikeError } from '../../lib/apiClient';
import { getPlanHealth } from '../../lib/services/academicYearClient';
import RoleHomeShell from './RoleHomeShell';
import ParentHomeDashboard, {
  getEventDateKey,
  formatUpcomingDateLabel,
  statusToneFromDelta,
  statusLabel,
} from './ParentHomeDashboard';
import { colors } from '../../theme/colors';
import { cleanPlannerEventId } from '../../lib/utils/recurringEventUtils';

function applyAttendanceSnapshotToLearning(learning = [], attendanceRows = []) {
  const events = Array.isArray(learning) ? learning : [];
  const rows = Array.isArray(attendanceRows) ? attendanceRows : [];
  if (events.length === 0 || rows.length === 0) return events;

  const byEventId = new Map();
  rows.forEach((row) => {
    const eventId = cleanPlannerEventId(String(row?.event_id || '').trim());
    if (!eventId) return;
    const status = String(row?.status || '').trim().toLowerCase();
    if (!byEventId.has(eventId)) byEventId.set(eventId, new Set());
    byEventId.get(eventId).add(status);
  });

  return events.map((event) => {
    const eventId = cleanPlannerEventId(String(event?.id || '').trim());
    if (!eventId || !byEventId.has(eventId)) return event;
    const statuses = byEventId.get(eventId);
    if (statuses.has('present')) return { ...event, status: 'done' };
    if (statuses.has('absent')) return { ...event, status: 'scheduled' };
    return event;
  });
}

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

    const assigneesByEventId = new Map(data.map((row) => [String(row.id), row]));

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
  onOpenEvent = null,
  onAddEvent,
  onInitialDataReady = null,
}) {
  const session = useSession();
  const [homeData, setHomeData] = useState(null);
  const [dashboardExtras, setDashboardExtras] = useState({
    dueAssignments: [],
    pendingSubmissions: [],
    missingSubmissions: [],
    helpRequests: [],
    planHealth: null,
  });
  const [error, setError] = useState(null);
  const initialDataReadyFiredRef = useRef(false);
  const onInitialDataReadyRef = useRef(onInitialDataReady);
  onInitialDataReadyRef.current = onInitialDataReady;

  const markInitialDataReady = useCallback(() => {
    if (initialDataReadyFiredRef.current) return;
    initialDataReadyFiredRef.current = true;
    onInitialDataReadyRef.current?.();
  }, []);

  const familyId = propFamilyId || session?.family_id;

  const CACHE_TTL_MS = 5 * 60 * 1000;
  const getHomeDataCacheKey = (fid, date) => `home_data_${fid}_${date}`;

  const loadHomeDataFromCache = (fid, date) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    try {
      const cached = localStorage.getItem(getHomeDataCacheKey(fid, date));
      if (!cached) return null;
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL_MS) return data;
      localStorage.removeItem(getHomeDataCacheKey(fid, date));
      return null;
    } catch {
      return null;
    }
  };

  const saveHomeDataToCache = (fid, date, data) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      localStorage.setItem(
        getHomeDataCacheKey(fid, date),
        JSON.stringify({ data, timestamp: Date.now() })
      );
    } catch {
      /* ignore */
    }
  };

  const loadDashboardExtras = useCallback(async (fid) => {
    if (!fid) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const assignmentSelect = `
      *,
      child:child_id (id, first_name, avatar),
      subject:related_subject (id, name)
    `;

    try {
      const [
        dueTodayRes,
        dueTomorrowRes,
        submittedRes,
        missingRes,
        helpRes,
        planHealthRes,
      ] = await Promise.all([
        supabase
          .from('assignments')
          .select(assignmentSelect)
          .eq('family_id', fid)
          .eq('due_date', todayStr)
          .in('status', ['not_started', 'in_progress'])
          .order('due_date', { ascending: true })
          .limit(8),
        supabase
          .from('assignments')
          .select(assignmentSelect)
          .eq('family_id', fid)
          .eq('due_date', tomorrowStr)
          .in('status', ['not_started', 'in_progress'])
          .order('due_date', { ascending: true })
          .limit(8),
        supabase
          .from('assignments')
          .select(assignmentSelect)
          .eq('family_id', fid)
          .eq('status', 'submitted')
          .or('review_status.is.null,review_status.eq.needs_revision')
          .order('updated_at', { ascending: false })
          .limit(8),
        supabase
          .from('assignments')
          .select(assignmentSelect)
          .eq('family_id', fid)
          .lt('due_date', todayStr)
          .in('status', ['not_started', 'in_progress'])
          .order('due_date', { ascending: true })
          .limit(8),
        supabase
          .from('assignments')
          .select(assignmentSelect)
          .eq('family_id', fid)
          .eq('need_help', true)
          .order('updated_at', { ascending: false })
          .limit(8),
        getPlanHealth(fid),
      ]);

      const isMissingTable = (err) =>
        err && (err.code === '42P01' || err.code === 'PGRST200');

      const dueAssignments = [
        ...(dueTodayRes.data || []),
        ...(dueTomorrowRes.data || []),
      ].filter(Boolean);

      setDashboardExtras({
        dueAssignments,
        pendingSubmissions: isMissingTable(submittedRes.error) ? [] : submittedRes.data || [],
        missingSubmissions: isMissingTable(missingRes.error) ? [] : missingRes.data || [],
        helpRequests: isMissingTable(helpRes.error) ? [] : helpRes.data || [],
        planHealth: planHealthRes?.data || null,
      });
    } catch (err) {
      if (!isAbortLikeError(err)) {
        console.error('[ParentHomeScreen] Error loading dashboard extras:', err);
      }
    }
  }, []);

  const loadData = useCallback(
    async (silent = false, options = {}) => {
      const shouldMarkInitialReady = options?.markInitialReady === true;
      if (!familyId) return;

      try {
        const validDate = new Date();
        validDate.setHours(0, 0, 0, 0);
        const dateStr = validDate.toISOString().split('T')[0];

        const { data, error: rpcError } = await supabase.rpc('get_home_data', {
          _family_id: familyId,
          _date: dateStr,
          _horizon_days: 14,
        });

        if (rpcError) {
          if (!isAbortLikeError(rpcError) && !silent) {
            console.error('[ParentHomeScreen] RPC error:', rpcError);
            setError(rpcError);
          }
          setHomeData({ learning: [], tasks: [], children: [], subjects: [] });
          if (shouldMarkInitialReady) markInitialDataReady();
          loadDashboardExtras(familyId);
          return;
        }

        const homeDataResult = data || { learning: [], tasks: [], children: [], subjects: [] };
        const learningRows = Array.isArray(homeDataResult.learning) ? homeDataResult.learning : [];
        const learningEventIds = Array.from(
          new Set(
            learningRows.flatMap((event) => {
              const rawId = String(event?.id || '').trim();
              const cleanedId = cleanPlannerEventId(rawId);
              return [rawId, cleanedId].filter(Boolean);
            })
          )
        );

        let attendanceRows = [];
        if (learningEventIds.length > 0) {
          const { data: attendanceData, error: attendanceError } = await supabase
            .from('attendance_records')
            .select('event_id, status, day_date')
            .eq('family_id', familyId)
            .in('event_id', learningEventIds);
          if (!attendanceError && Array.isArray(attendanceData)) {
            attendanceRows = attendanceData;
          }
        }

        const learningWithAttendance = applyAttendanceSnapshotToLearning(learningRows, attendanceRows);
        const learningWithAssignees = await hydrateLearningAssignees(learningWithAttendance, familyId);
        const normalizedHomeData = { ...homeDataResult, learning: learningWithAssignees };

        setError(null);
        setHomeData(normalizedHomeData);
        if (shouldMarkInitialReady) markInitialDataReady();
        saveHomeDataToCache(familyId, dateStr, normalizedHomeData);
        loadDashboardExtras(familyId);
      } catch (err) {
        if (!isAbortLikeError(err)) {
          console.error('[ParentHomeScreen] Error loading data:', err);
          if (!silent) setError(err);
        }
        setHomeData({ learning: [], tasks: [], children: [], subjects: [] });
        if (shouldMarkInitialReady) markInitialDataReady();
      }
    },
    [familyId, loadDashboardExtras, markInitialDataReady]
  );

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

  useEffect(() => {
    if (session && !session.loading && familyId && !session.error) {
      const validDate = new Date();
      validDate.setHours(0, 0, 0, 0);
      const dateStr = validDate.toISOString().split('T')[0];
      const cachedData = loadHomeDataFromCache(familyId, dateStr);

      if (cachedData) {
        setHomeData(cachedData);
        markInitialDataReady();
        setError(null);
        loadDashboardExtras(familyId);
        loadData(true);
        return;
      }

      setError(null);
      loadData(true, { markInitialReady: true });
    } else if (session && session.error) {
      setError(new Error('Session error: ' + session.error));
      setHomeData({ learning: [], tasks: [], children: [], subjects: [] });
      markInitialDataReady();
    } else if (session && !session.loading && !familyId) {
      setError(new Error('No family ID available'));
      setHomeData({ learning: [], tasks: [], children: [], subjects: [] });
      markInitialDataReady();
    }
  }, [session?.loading, session?.error, familyId, markInitialDataReady, loadData, loadDashboardExtras]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId) return;
    const normalizeEventId = (value) => cleanPlannerEventId(String(value || '').replace(/^event-/, ''));
    const idsMatch = (left, right) => {
      const l = normalizeEventId(left);
      const r = normalizeEventId(right);
      return !!l && !!r && l === r;
    };
    const rowMatchesDeletedId = (row, deletedId) => {
      if (!deletedId || !row) return false;
      return (
        idsMatch(row?.id, deletedId) ||
        idsMatch(row?.event_id, deletedId) ||
        idsMatch(row?.data?.id, deletedId) ||
        idsMatch(row?.data?.event_id, deletedId)
      );
    };
    const onRefreshCalendar = (e) => {
      if (e?.detail?.skipHomeRefresh) return;
      loadDataRef.current(true);
      loadDashboardExtras(familyId);
    };
    const onAttendancePatched = (e) => {
      const rawEventId = e?.detail?.eventId;
      if (!rawEventId) return;
      const eventId = String(rawEventId).trim();
      const cleanedEventId = cleanPlannerEventId(eventId);
      const rawStatus = String(e?.detail?.status || '').trim().toLowerCase();
      const nextStatus =
        rawStatus === 'completed' || rawStatus === 'present' || rawStatus === 'done'
          ? 'done'
          : 'scheduled';
      setHomeData((prev) => {
        if (!prev || !Array.isArray(prev.learning) || prev.learning.length === 0) return prev;
        let changed = false;
        const nextLearning = prev.learning.map((event) => {
          const rawId = String(event?.id || '').trim();
          if (!rawId) return event;
          const cleanedRawId = cleanPlannerEventId(rawId);
          const isMatch =
            rawId === eventId ||
            rawId === cleanedEventId ||
            cleanedRawId === eventId ||
            cleanedRawId === cleanedEventId;
          if (!isMatch) return event;
          changed = true;
          return { ...event, status: nextStatus };
        });
        return changed ? { ...prev, learning: nextLearning } : prev;
      });
    };
    const onEventDeleted = (e) => {
      const deletedId = e?.detail?.eventId || e?.detail?.id;
      const deletedAcademicYearId = e?.detail?.academicYearId || e?.detail?.academic_year_id;
      const deletedSeriesMasterId = e?.detail?.seriesMasterEventId || e?.detail?.series_master_event_id;
      const deletedSeriesLinkIds = Array.isArray(e?.detail?.seriesLinkIds) ? e.detail.seriesLinkIds : [];
      const cleanSeriesMasterId = deletedSeriesMasterId ? normalizeEventId(deletedSeriesMasterId) : null;
      const cleanSeriesLinkIds = Array.from(
        new Set(
          deletedSeriesLinkIds
            .map((value) => normalizeEventId(value))
            .filter(Boolean)
            .concat(cleanSeriesMasterId ? [cleanSeriesMasterId] : [])
        )
      );
      if (!deletedId && !deletedAcademicYearId && cleanSeriesLinkIds.length === 0) return;

      setHomeData((prev) => {
        if (!prev || !Array.isArray(prev.learning) || prev.learning.length === 0) return prev;
        const nextLearning = prev.learning.filter((row) => {
          if (!row) return false;
          if (deletedId && rowMatchesDeletedId(row, deletedId)) return false;
          if (cleanSeriesLinkIds.length > 0) {
            const rowId = normalizeEventId(row?.id);
            const rowParentId = normalizeEventId(row?.parent_event_id);
            const rowRecurrenceId = normalizeEventId(row?.recurrence_id);
            if (
              cleanSeriesLinkIds.includes(rowId) ||
              cleanSeriesLinkIds.includes(rowParentId) ||
              cleanSeriesLinkIds.includes(rowRecurrenceId)
            ) return false;
          }
          if (deletedAcademicYearId && String(row?.academic_year_id || '') === String(deletedAcademicYearId)) {
            return false;
          }
          return true;
        });
        return nextLearning.length === prev.learning.length ? prev : { ...prev, learning: nextLearning };
      });
    };
    window.addEventListener('refreshCalendar', onRefreshCalendar);
    window.addEventListener('eventAttendancePatched', onAttendancePatched);
    window.addEventListener('eventDeleted', onEventDeleted);
    return () => {
      window.removeEventListener('refreshCalendar', onRefreshCalendar);
      window.removeEventListener('eventAttendancePatched', onAttendancePatched);
      window.removeEventListener('eventDeleted', onEventDeleted);
    };
  }, [familyId, loadDashboardExtras]);

  const effectiveHomeData = homeData || {
    learning: [],
    tasks: [],
    children: [],
    subjects: [],
  };

  const todayKey = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString().split('T')[0];
  }, []);

  const { todayEvents, upcomingGroups } = useMemo(() => {
    const learning = effectiveHomeData.learning || [];
    const todayList = [];
    const upcomingMap = new Map();

    learning.forEach((event) => {
      const dateKey = getEventDateKey(event);
      if (!dateKey) return;
      if (dateKey === todayKey) {
        todayList.push(event);
        return;
      }
      if (dateKey > todayKey) {
        if (!upcomingMap.has(dateKey)) upcomingMap.set(dateKey, []);
        upcomingMap.get(dateKey).push(event);
      }
    });

    todayList.sort((a, b) => {
      const ta = new Date(a.start_ts || a.start || 0).getTime();
      const tb = new Date(b.start_ts || b.start || 0).getTime();
      return ta - tb;
    });

    const groups = Array.from(upcomingMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 5)
      .map(([dateKey, events]) => ({
        dateKey,
        label: formatUpcomingDateLabel(dateKey),
        events: events.sort((a, b) => {
          const ta = new Date(a.start_ts || a.start || 0).getTime();
          const tb = new Date(b.start_ts || b.start || 0).getTime();
          return ta - tb;
        }),
      }));

    return { todayEvents: todayList, upcomingGroups: groups };
  }, [effectiveHomeData.learning, todayKey]);

  const familySnapshot = useMemo(() => {
    const children = effectiveHomeData.children || [];
    const planHealth = dashboardExtras.planHealth;
    const perChild = planHealth?.per_child || {};
    const targetDays = planHealth?.target_days;

    return children.map((child) => {
      const childStats = perChild[String(child.id)] || {};
      const plannedDays = childStats.planned_days;
      const deltaDays = childStats.delta_days;
      const tone = statusToneFromDelta(deltaDays);
      const progressPct =
        targetDays && plannedDays != null
          ? Math.round((plannedDays / targetDays) * 100)
          : null;

      return {
        childId: child.id,
        name: child.first_name || child.name || 'Child',
        gradeLabel:
          child.grade != null && child.grade !== ''
            ? `${child.grade}${String(child.grade).toLowerCase().includes('grade') ? '' : ' Grade'}`
            : null,
        avatarColor: child.avatar_color || child.avatarColor || null,
        tone,
        statusLabel: statusLabel(tone, deltaDays, targetDays, plannedDays),
        plannedDays,
        targetDays,
        progressPct,
      };
    });
  }, [effectiveHomeData.children, dashboardExtras.planHealth]);

  const navigateToPlannerFixGap = useCallback(() => {
    onNavigate?.('planner', 'calendar');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('plannerScrollToFixGap'));
      });
    }
  }, [onNavigate]);

  const alerts = useMemo(() => {
    const items = [];
    const subjects = effectiveHomeData.subjects || [];
    const planHealth = dashboardExtras.planHealth;
    const perChildSubject = planHealth?.per_child_subject || {};

    Object.entries(perChildSubject).forEach(([childId, subjectMap]) => {
      const child = (effectiveHomeData.children || []).find((c) => String(c.id) === String(childId));
      const childName = child?.first_name || child?.name || 'A child';
      Object.entries(subjectMap || {}).forEach(([subjectId, stats]) => {
        const delta = Number(stats?.subject_delta_days);
        if (!Number.isFinite(delta) || delta >= -1) return;
        const subject = subjects.find((s) => String(s.id) === String(subjectId));
        const subjectName = subject?.name || 'A subject';
        const days = Math.abs(Math.round(delta));
        items.push({
          id: `behind-${childId}-${subjectId}`,
          title: `${subjectName} is ${days} day${days === 1 ? '' : 's'} behind`,
          subtitle: 'We recommend running Fix Gap',
          icon: AlertTriangle,
          iconBg: '#FEF2F2',
          iconColor: '#DC2626',
          onPress: navigateToPlannerFixGap,
        });
      });
    });

    if (items.length === 0 && planHealth?.plan_exists) {
      (effectiveHomeData.children || []).forEach((child) => {
        const childStats = planHealth?.per_child?.[String(child.id)];
        const delta = Number(childStats?.delta_days);
        if (!Number.isFinite(delta) || delta >= -1) return;
        const days = Math.abs(Math.round(delta));
        const childName = child.first_name || child.name || 'A child';
        items.push({
          id: `behind-child-${child.id}`,
          title: `${childName} is ${days} day${days === 1 ? '' : 's'} behind`,
          subtitle: 'We recommend running Fix Gap',
          icon: AlertTriangle,
          iconBg: '#FEF2F2',
          iconColor: '#DC2626',
          onPress: navigateToPlannerFixGap,
        });
      });
    }

    const pendingCount = dashboardExtras.pendingSubmissions?.length || 0;
    if (pendingCount > 0) {
      items.push({
        id: 'pending-submissions',
        title: `${pendingCount} submission${pendingCount === 1 ? '' : 's'} waiting for review`,
        subtitle: 'Open submissions to review work',
        icon: Clock,
        iconBg: '#FFF7ED',
        iconColor: '#EA580C',
        onPress: () => onNavigate?.('learning', 'submissions'),
      });
    }

    const missingCount = dashboardExtras.missingSubmissions?.length || 0;
    if (missingCount > 0) {
      items.push({
        id: 'missing-submissions',
        title: `${missingCount} assignment${missingCount === 1 ? '' : 's'} past due`,
        subtitle: 'Without submission',
        icon: Clock,
        iconBg: '#FFF7ED',
        iconColor: '#EA580C',
        onPress: () => onNavigate?.('learning', 'assignments'),
      });
    }

    (dashboardExtras.helpRequests || []).slice(0, 3).forEach((assignment) => {
      items.push({
        id: `help-${assignment.id}`,
        title: `${assignment.child?.first_name || 'A child'} requested help`,
        subtitle: assignment.title || 'Assignment help',
        icon: HelpCircle,
        iconBg: '#EEF2FF',
        iconColor: '#6366F1',
        onPress: () => onNavigate?.('learning', 'assignments'),
      });
    });

    return items.slice(0, 6);
  }, [
    dashboardExtras,
    effectiveHomeData.children,
    effectiveHomeData.subjects,
    navigateToPlannerFixGap,
    onNavigate,
  ]);

  const aiInsights = useMemo(() => {
    const insights = [];
    const childrenList = effectiveHomeData.children || [];
    const planHealth = dashboardExtras.planHealth;
    const subjects = effectiveHomeData.subjects || [];

    childrenList.forEach((child) => {
      const childName = child.first_name || child.name || 'Your child';
      const stats = planHealth?.per_child?.[String(child.id)];
      const delta = Number(stats?.delta_days);
      if (Number.isFinite(delta) && delta > 1) {
        insights.push({
          id: `ahead-${child.id}`,
          icon: TrendingUp,
          iconBg: '#ECFDF5',
          iconColor: '#059669',
          text: `Great job! ${childName} is ahead of schedule by about ${Math.round(delta)} day${Math.round(delta) === 1 ? '' : 's'}.`,
        });
      }
    });

    childrenList.forEach((child) => {
      const childName = child.first_name || child.name || 'Your child';
      const stats = planHealth?.per_child?.[String(child.id)];
      const delta = Number(stats?.delta_days);
      if (Number.isFinite(delta) && delta < -1) {
        insights.push({
          id: `behind-insight-${child.id}`,
          icon: CalendarDays,
          iconBg: '#FFF7ED',
          iconColor: '#EA580C',
          text: `${childName} is ${Math.abs(Math.round(delta))} day${Math.abs(Math.round(delta)) === 1 ? '' : 's'} behind schedule. Consider rescheduling with Fix Gap.`,
        });
      }
    });

    (dashboardExtras.helpRequests || []).slice(0, 1).forEach((assignment) => {
      insights.push({
        id: `help-insight-${assignment.id}`,
        icon: Star,
        iconBg: '#F3E8FF',
        iconColor: '#9333EA',
        text: `${assignment.child?.first_name || 'Your child'} asked for help on ${assignment.title || 'an assignment'}.`,
      });
    });

    return insights.slice(0, 3);
  }, [dashboardExtras, effectiveHomeData.children]);

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

  return (
    <RoleHomeShell
      main={
        <ParentHomeDashboard
          children={effectiveHomeData.children || []}
          subjects={effectiveHomeData.subjects || []}
          todayEvents={todayEvents}
          dueAssignments={dashboardExtras.dueAssignments}
          pendingSubmissions={dashboardExtras.pendingSubmissions}
          alerts={alerts}
          aiInsights={aiInsights}
          familySnapshot={familySnapshot}
          onNavigate={onNavigate}
          onAddEvent={onAddEvent}
          onOpenEvent={onOpenEvent}
        />
      }
      rail={null}
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
  errorText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
