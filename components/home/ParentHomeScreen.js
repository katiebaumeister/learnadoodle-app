/**
 * ParentHomeScreen
 * 
 * Full parent dashboard with:
 * - Today Forecast hero
 * - Main column: Today's schedule
 * - Right rail: Bulletin Board
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity } from 'react-native';
import { Plus } from 'lucide-react';
import SchedulePanelNavGroup from './SchedulePanelNavGroup';
import { useSession } from '../../contexts/SessionContext';
import { supabase } from '../../lib/supabase';
import { isAbortLikeError } from '../../lib/apiClient';
import RoleHomeShell from './RoleHomeShell';
import TodayScheduleCard from './TodayScheduleCard';
import ParentDigestModal from './ParentDigestModal';
import BulletinBoardSection from '../bulletin/BulletinBoardSection';
import SetupGuideCard from '../setup/SetupGuideCard';
import SetupGuideBulletinNudge from '../setup/SetupGuideBulletinNudge';
import { getSetupGuideBulletinNudge } from '../../lib/setupGuide';
import { colors } from '../../theme/colors';
import { getEventChildIdsForDisplay } from '../../lib/utils/eventChildIds';
import { cleanPlannerEventId } from '../../lib/utils/recurringEventUtils';

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

function normalizeSubjectList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((s) => s?.id != null)
    .map((s) => ({ id: s.id, name: s.name || 'Subject' }));
}

function pickSubjectListSource(overview, subjects) {
  if (Array.isArray(overview) && overview.length > 0) return overview;
  if (Array.isArray(subjects) && subjects.length > 0) return subjects;
  return [];
}

async function hydrateLearningAssignees(learning = [], familyId) {
  const items = Array.isArray(learning) ? learning : [];
  const eventIds = Array.from(
    new Set(
      items.flatMap((event) => {
        const raw = String(event?.id || '').trim();
        const clean = cleanPlannerEventId(raw);
        return [raw, clean].filter(Boolean);
      }),
    ),
  );
  if (!familyId || eventIds.length === 0) return items;

  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, child_id, child_ids, subject_id, generated_by, source_block_id, academic_year_id, curriculum_lesson_id, event_type, title')
      .eq('family_id', familyId)
      .in('id', eventIds);

    if (error || !Array.isArray(data) || data.length === 0) {
      return items;
    }

    const assigneesByEventId = new Map(
      data.map((row) => [String(row.id), row])
    );

    return items.map((event) => {
      const rawId = String(event?.id || '').trim();
      const cleanId = cleanPlannerEventId(rawId);
      const assigneeRow = assigneesByEventId.get(cleanId) || assigneesByEventId.get(rawId);
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
        id: assigneeRow.id || cleanId || rawId,
        child_id: assigneeRow.child_id ?? event?.child_id ?? null,
        child_ids: mergedChildIds,
        subject_id: assigneeRow.subject_id ?? event?.subject_id ?? null,
        generated_by: assigneeRow.generated_by ?? event?.generated_by ?? null,
        source_block_id: assigneeRow.source_block_id ?? event?.source_block_id ?? null,
        academic_year_id: assigneeRow.academic_year_id ?? event?.academic_year_id ?? null,
        curriculum_lesson_id: assigneeRow.curriculum_lesson_id ?? event?.curriculum_lesson_id ?? null,
        event_type: assigneeRow.event_type ?? event?.event_type ?? null,
        title: assigneeRow.title ?? event?.title ?? null,
      };
    });
  } catch {
    return items;
  }
}

export default function ParentHomeScreen({
  familyId: propFamilyId,
  family = null,
  profile = null,
  onNavigate,
  onOpenEvent = null,
  onAddEvent,
  onAddGrade,
  onAddMaterial,
  onAddSubject,
  onAddChild,
  onInitialDataReady = null,
  hideRailOnboardingCards = false,
  preloadedSubjectsOverview = null,
  preloadedSubjects = null,
  preloadedAcademicYears = null,
  familyMembers = null,
}) {
  const session = useSession();
  const [homeData, setHomeData] = useState(null);
  const [dashboardExtras, setDashboardExtras] = useState({
    dueAssignments: [],
    pendingSubmissions: [],
    missingSubmissions: [],
    helpRequests: [],
  });
  const [stableSubjects, setStableSubjects] = useState(() =>
    normalizeSubjectList(pickSubjectListSource(preloadedSubjectsOverview, preloadedSubjects))
  );
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notificationCount, setNotificationCount] = useState(0);
  const [error, setError] = useState(null);
  const [showParentDigest, setShowParentDigest] = useState(false);
  const [setupGuideVisible, setSetupGuideVisible] = useState(false);
  const initialDataReadyFiredRef = useRef(false);
  const onInitialDataReadyRef = useRef(onInitialDataReady);
  onInitialDataReadyRef.current = onInitialDataReady;

  const markInitialDataReady = useCallback(() => {
    if (initialDataReadyFiredRef.current) return;
    initialDataReadyFiredRef.current = true;
    onInitialDataReadyRef.current?.();
  }, []);

  // Get familyId from session if not provided as prop
  const familyId = propFamilyId || session?.family_id;

  const viewerFirstName = useMemo(() => {
    const raw = profile?.first_name || profile?.name || '';
    const trimmed = String(raw).trim();
    if (!trimmed) return null;
    return trimmed.split(/\s+/)[0];
  }, [profile?.first_name, profile?.name]);

  const planningMode = family?.default_planning_mode || 'HOMESCHOOL_COMPLIANCE';
  const userId = profile?.id || session?.user_id || null;

  const setupGuideAppData = useMemo(() => {
    const data = homeData || { learning: [], subjects: [], children: [] };
    const subjectList = data.subjects?.length ? data.subjects : stableSubjects;
    const learningEvents = data.learning || [];
    const academicYears = Array.isArray(preloadedAcademicYears) ? preloadedAcademicYears : [];
    const hasConfiguredYear = academicYears.some(
      (y) => y?.start_date && y?.end_date,
    );
    const memberCount = Array.isArray(familyMembers)
      ? familyMembers.length
      : (Array.isArray(family?.members) ? family.members.length : 1);
    const assignmentCount = (dashboardExtras.dueAssignments?.length || 0)
      + (dashboardExtras.pendingSubmissions?.length || 0)
      + (dashboardExtras.missingSubmissions?.length || 0);

    return {
      mode: planningMode,
      subjectCount: subjectList?.length || 0,
      eventCount: learningEvents.length,
      // TODO: detect recurring events from planner event series when available on home payload.
      hasRecurringEvents: false,
      hasAcademicYearConfigured: hasConfiguredYear,
      // TODO: detect units/lessons from subject curriculum cache when wired to home.
      hasUnitsOrLessons: assignmentCount > 0,
      assignmentCount,
      familyMemberCount: memberCount,
      hasCalendarIntegration: false,
      visitedPlanner: false,
    };
  }, [
    homeData,
    stableSubjects,
    preloadedAcademicYears,
    familyMembers,
    family?.members,
    dashboardExtras,
    planningMode,
  ]);

  const setupBulletinNudge = useMemo(
    () => getSetupGuideBulletinNudge(planningMode, setupGuideAppData, { setupGuideVisible }),
    [planningMode, setupGuideAppData, setupGuideVisible],
  );

  const handleSetupGuideNavigate = useCallback((tab, subtab = null) => {
    onNavigate?.(tab, subtab);
  }, [onNavigate]);

  const handleSetupGuideAction = useCallback((action) => {
    if (action === 'add_subject') {
      onAddSubject?.();
      return;
    }
    if (action === 'create_activity' || action === 'create_event') {
      onAddEvent?.();
    }
  }, [onAddSubject, onAddEvent]);

  useEffect(() => {
    const incoming = pickSubjectListSource(preloadedSubjectsOverview, preloadedSubjects);
    if (incoming.length === 0) return;
    setStableSubjects((prev) => {
      const prevIds = prev.map((s) => String(s.id)).sort().join(',');
      const nextIds = incoming.map((s) => String(s.id)).sort().join(',');
      if (prev.length > 0 && prevIds === nextIds) return prev;
      return normalizeSubjectList(incoming);
    });
  }, [preloadedSubjectsOverview, preloadedSubjects]);

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
      ]);

      const isMissingTable = (err) =>
        err && (err.code === '42P01' || err.code === 'PGRST200');

      const dueAssignments = [
        ...(dueTodayRes.data || []),
        ...(dueTomorrowRes.data || []),
      ].filter(Boolean);

      setDashboardExtras((prev) => ({
        ...prev,
        dueAssignments,
        pendingSubmissions: isMissingTable(submittedRes.error) ? [] : submittedRes.data || [],
        missingSubmissions: isMissingTable(missingRes.error) ? [] : missingRes.data || [],
        helpRequests: isMissingTable(helpRes.error) ? [] : helpRes.data || [],
      }));
    } catch (err) {
      if (!isAbortLikeError(err)) {
        console.error('[ParentHomeScreen] Error loading dashboard extras:', err);
      }
    }
  }, []);

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
        markInitialDataReady();
        setError(null);
        loadDashboardExtras(familyId);
        // Load notification count in background
        loadNotificationCount();
        // Refresh data in background without showing loading
        loadData(true); // Pass true to indicate silent refresh
        return;
      }
      
      // No cache - keep startup loader visible until first real payload resolves.
      setError(null);
      // Load data in background silently
      loadData(true, { markInitialReady: true });
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
      markInitialDataReady();
    } else if (session && !session.loading && !familyId) {
      setError(new Error('No family ID available'));
      setHomeData({
        learning: [],
        tasks: [],
        children: [],
        subjects: [],
      });
      markInitialDataReady();
    }
    // Primitives only — avoid re-running when SessionContext value identity flickers.
  }, [session?.loading, session?.error, familyId, selectedDate, markInitialDataReady]);

  const loadData = async (silent = false, options = {}) => {
    const shouldMarkInitialReady = options?.markInitialReady === true;
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
        if (shouldMarkInitialReady) {
          markInitialDataReady();
        }
        loadDashboardExtras(familyId);
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
      const learningWithAssignees = await hydrateLearningAssignees(
        learningWithAttendance,
        familyId
      );
      const normalizedHomeData = {
        ...homeDataResult,
        learning: learningWithAssignees,
      };
      
      setError(null);
      setHomeData(normalizedHomeData);
      if (shouldMarkInitialReady) {
        markInitialDataReady();
      }
      
      // Save to cache
      saveHomeDataToCache(familyId, dateStr, normalizedHomeData);
      loadDashboardExtras(familyId);

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
      if (shouldMarkInitialReady) {
        markInitialDataReady();
      }
    }
  };

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;

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
          if (deletedAcademicYearId && String(row?.academic_year_id || '') === String(deletedAcademicYearId)) return false;
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

  const effectiveHomeData = homeData || {
    learning: [],
    tasks: [],
    children: [],
    subjects: [],
  };
  const children = effectiveHomeData.children || [];

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

  // Compute weather forecast with contextual signals
  const filteredLearning = effectiveHomeData.learning || [];
  const blockCount = filteredLearning.length;
  const backlogCount = (effectiveHomeData.tasks || []).filter(t => !t.start_ts || t.status === 'backlog').length;
  const overdueCount = (effectiveHomeData.tasks || []).filter(t => t.due_time === 'Overdue').length;

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
        {onAddEvent ? (
          <TouchableOpacity
            style={styles.panelActionBtn}
            onPress={onAddEvent}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <Plus size={18} color="#334155" strokeWidth={2.25} />
            <Text style={styles.panelActionBtnText}>Add event</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <TodayScheduleCard
        events={filteredLearning}
        children={effectiveHomeData.children || []}
        subjects={effectiveHomeData.subjects || []}
        onOpenPlanner={() => onNavigate?.('planner')}
        onOpenEvent={onOpenEvent}
        onTabChange={onNavigate}
        onAddBlock={onAddEvent}
        suggestedRhythms={[]}
        onAddSuggestedRhythm={() => {}}
        noCard={true}
      />
    </View>
  );

  const heroContent = (
    <View style={styles.greetingContainer}>
      <View style={styles.greetingInner}>
        <View style={styles.greetingCopy}>
          <View style={styles.greetingTitleRow}>
            <Text style={styles.greetingTitle}>
              {getTimeBasedGreeting()}
              {viewerFirstName ? `, ${viewerFirstName}` : ''}
            </Text>
            <Text style={styles.greetingDateLine}>{formatGreetingDateInline(new Date())}</Text>
          </View>
          <Text style={styles.greetingSubtitle}>Let's see where learning takes us today</Text>
        </View>
      </View>
    </View>
  );

  const handleBulletinSubjectPress = useCallback((subjectId) => {
    if (!subjectId) return;
    onNavigate?.(`subject-${subjectId}`);
  }, [onNavigate]);

  const scheduleContent = (
    <View style={styles.mainSurface}>
      {renderSchedulePanel(styles.scheduleSection)}
    </View>
  );

  const bulletinRailContent = (
    <View style={[styles.bulletinBoardSection, styles.railBulletinSection]}>
      {family?.onboarding_completed !== false ? (
        <SetupGuideCard
          mode={planningMode}
          userId={userId}
          familyId={familyId}
          onNavigate={handleSetupGuideNavigate}
          onAction={handleSetupGuideAction}
          appData={setupGuideAppData}
          onVisibilityChange={setSetupGuideVisible}
        />
      ) : null}
      {!setupGuideVisible ? (
        <SetupGuideBulletinNudge
          nudge={setupBulletinNudge}
          onNavigate={handleSetupGuideNavigate}
          onAction={handleSetupGuideAction}
        />
      ) : null}
      <BulletinBoardSection
        familyId={familyId}
        children={children}
        subjects={effectiveHomeData.subjects?.length ? effectiveHomeData.subjects : stableSubjects}
        profile={profile}
        feedTitle="Bulletin Board"
        onSubjectPress={handleBulletinSubjectPress}
      />
    </View>
  );
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
        hero={heroContent}
        main={scheduleContent}
        rail={bulletinRailContent}
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
  greetingContainer: {
    position: 'relative',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.12)',
    backgroundColor: colors.bgSubtle,
    minHeight: 96,
    paddingVertical: 18,
    paddingHorizontal: 24,
    overflow: 'hidden',
    ...(Platform.OS === 'web' && {
      backgroundImage: 'linear-gradient(135deg, #f4f2ff 0%, #eef6ff 48%, #f0fdf6 100%)',
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
    }),
  },
  greetingInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  greetingCopy: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
    minWidth: 0,
  },
  greetingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    width: '100%',
  },
  greetingTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 32,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.4,
    lineHeight: 38,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  greetingSubtitle: {
    fontSize: 16,
    fontWeight: '400',
    color: '#475569',
    lineHeight: 22,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  greetingDateLine: {
    flexShrink: 0,
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
    lineHeight: 22,
    textAlign: 'right',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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
    paddingTop: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 0,
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
  scheduleSection: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    marginTop: 2,
    paddingTop: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 12,
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
    paddingHorizontal: 4,
    paddingTop: 10,
    paddingBottom: 12,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.16)',
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
  panelActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  panelActionBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(15,23,42,0.85)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
  /** Section title — matches Bulletin Board feedTitle */
  sectionLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: -0.2,
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
});
