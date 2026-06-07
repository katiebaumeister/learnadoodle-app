import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { supabase } from '../../lib/supabase';
import PlannerEventsListTable from '../planner/PlannerEventsListTable';

function eventMatchesChildIds(entity, childIds) {
  if (!Array.isArray(childIds) || childIds.length === 0) return true;
  const idSet = new Set(childIds.map((id) => String(id)));
  const childId = entity?.child_id || entity?.childId || null;
  if (childId && idSet.has(String(childId))) return true;
  const childIdsArr = entity?.child_ids || entity?.childIds || [];
  if (Array.isArray(childIdsArr) && childIdsArr.some((id) => idSet.has(String(id)))) return true;
  if (!childId && (!childIdsArr || childIdsArr.length === 0)) return true;
  return false;
}

function normalizePlannerEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const start_ts = raw.start_ts || raw.startTs || raw.start || raw.start_local || raw.due_ts || null;
  const id = String(raw.id || '').trim();
  if (!id) return null;
  return {
    ...raw,
    id,
    start_ts,
    start: raw.start || start_ts,
    child_id: raw.child_id || raw.childId || null,
    child_ids: raw.child_ids || raw.childIds || null,
    event_type: raw.event_type || raw.type || null,
    title: raw.title || raw.lesson_name || null,
  };
}

export default function LearningLogListScreen({
  familyId,
  children = [],
  userRole = 'parent',
  accessibleChildren = [],
  viewingAsChildId = null,
}) {
  const safeChildren = Array.isArray(children) ? children : [];
  const isChildView = userRole === 'child' || userRole === 'student';
  const scopedChildIds = useMemo(() => {
    if (viewingAsChildId) return [String(viewingAsChildId)];
    if (isChildView && accessibleChildren?.length) {
      return accessibleChildren
        .map((child) => (typeof child === 'string' ? child : child?.id))
        .filter(Boolean)
        .map(String);
    }
    return [];
  }, [viewingAsChildId, isChildView, accessibleChildren]);

  const [events, setEvents] = useState([]);
  const [listRefreshEpoch, setListRefreshEpoch] = useState(0);

  const loadEvents = useCallback(async () => {
    if (!familyId) {
      setEvents([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .is('canceled_at', null)
        .neq('status', 'canceled')
        .order('start_ts', { ascending: true, nullsFirst: false })
        .limit(2500);

      if (error) throw error;

      const rows = (data || [])
        .filter((row) => row?.is_backlog !== true)
        .filter((row) => eventMatchesChildIds(row, scopedChildIds))
        .map(normalizePlannerEvent)
        .filter(Boolean);

      setEvents(rows);
      setListRefreshEpoch((epoch) => epoch + 1);
    } catch (err) {
      console.error('[LearningLogListScreen] load error:', err);
      setEvents([]);
    }
  }, [familyId, scopedChildIds]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refresh = () => loadEvents();
    window.addEventListener('refreshCalendar', refresh);
    window.addEventListener('refreshPlanner', refresh);
    window.addEventListener('eventUpdated', refresh);
    window.addEventListener('eventDeleted', refresh);
    window.addEventListener('assignmentsUpdated', refresh);
    window.addEventListener('refreshSubjects', refresh);
    return () => {
      window.removeEventListener('refreshCalendar', refresh);
      window.removeEventListener('refreshPlanner', refresh);
      window.removeEventListener('eventUpdated', refresh);
      window.removeEventListener('eventDeleted', refresh);
      window.removeEventListener('assignmentsUpdated', refresh);
      window.removeEventListener('refreshSubjects', refresh);
    };
  }, [loadEvents]);

  const openEvent = useCallback((event) => {
    const eventId = event?.id;
    if (!eventId || Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.dispatchEvent(
      new CustomEvent('openEventModal', {
        detail: { eventId, initialEvent: event || null },
      })
    );
  }, []);

  const openEventContextMenu = useCallback((event, nativeEvent) => {
    if (!event?.id || Platform.OS !== 'web' || typeof window === 'undefined') return;
    nativeEvent?.preventDefault?.();
    nativeEvent?.stopPropagation?.();
    let x =
      nativeEvent?.clientX ??
      nativeEvent?.pageX ??
      nativeEvent?.x ??
      nativeEvent?.nativeEvent?.clientX ??
      nativeEvent?.nativeEvent?.pageX ??
      nativeEvent?.nativeEvent?.x;
    let y =
      nativeEvent?.clientY ??
      nativeEvent?.pageY ??
      nativeEvent?.y ??
      nativeEvent?.nativeEvent?.clientY ??
      nativeEvent?.nativeEvent?.pageY ??
      nativeEvent?.nativeEvent?.y;
    if ((x == null || y == null) && nativeEvent?.target?.getBoundingClientRect) {
      const rect = nativeEvent.target.getBoundingClientRect();
      x = rect.left + rect.width / 2;
      y = rect.top + rect.height / 2;
    }
    window.dispatchEvent(
      new CustomEvent('plannerEventContextMenu', {
        detail: { event, position: { x: x ?? 0, y: y ?? 0 } },
      })
    );
  }, []);

  return (
    <View style={styles.container}>
      <PlannerEventsListTable
        events={events}
        children={safeChildren}
        familyId={familyId}
        monthDate={new Date()}
        onEventPress={openEvent}
        onEventRightClick={openEventContextMenu}
        listRefreshEpoch={listRefreshEpoch}
        plannerShellVisible={false}
        embedded
        fillViewport
        scrollToToday
        emptyTitle="No events yet"
        emptySubtitle="Scheduled lessons and activities will appear here."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      height: '100%',
      overflow: 'hidden',
    }),
  },
});
