import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react';
import { startOfToday } from './utils/date';
import CompletionRing from '../calendar/CompletionRing';
import ChildAvatarCluster from '../ui/ChildAvatarCluster';
import { supabase } from '../../lib/supabase';
import {
  resolveEventDateValue,
  formatEventTypeLabel,
  formatTimeRangeLabel,
  formatChildNamesCommaLine,
  resolveChildIdsForEvent,
  getEventUnitLessonLabel,
  getEventMaterialIds,
  resolveMaterialDisplayLabel,
  formatEventGradeLabel,
  getPlannerEventTypeColors,
  isPlannerHolidayOrBreakType,
  mergeAssignmentsByEventId,
} from './plannerListTableUtils';
import {
  getAllEventsSubmissionLabel,
  primaryAssignmentForEvent,
} from '../../lib/workEventHelpers';

const DENSE_DATE_HEADER_HEIGHT = 32;
const DENSE_EVENT_ROW_HEIGHT = 64;
const DENSE_TABLE_MIN_WIDTH = 960;

function defaultIsDoneStatus(statusValue) {
  const normalized = String(statusValue || '').trim().toLowerCase();
  return normalized === 'done' || normalized === 'completed';
}

/**
 * Shared planner list table (Month/Week/List → List view).
 * Also embedded in Learning → Attendance summary panel.
 */
export default function PlannerEventsListTable({
  events = [],
  children = [],
  familyId = null,
  monthDate = null,
  onEventPress,
  onEventRightClick,
  onEventComplete,
  /** When set, completion ring uses this instead of event status (e.g. attendance attended). */
  resolveEventCompleted = null,
  plannerShellVisible = true,
  listRefreshEpoch = 0,
  embedded = false,
  /** When true with embedded, list grows to fill parent flex column (Learning attendance). */
  fillViewport = false,
  maxListHeight = 520,
  /** When true, list opens scrolled to today's date header (planner list + embedded attendance). */
  scrollToToday = false,
  /** Bump to re-anchor after panel disclosure animation (e.g. Learning attendance expand). */
  scrollToTodayEpoch = 0,
  /** Opens create-event flow (planner list empty state). */
  onAddEvent = null,
  emptyTitle: emptyTitleProp = null,
  emptySubtitle: emptySubtitleProp = null,
}) {
  const isDoneStatus = useCallback((statusValue) => defaultIsDoneStatus(statusValue), []);
  const [materialById, setMaterialById] = useState(() => new Map());
  const [assignmentsByEventId, setAssignmentsByEventId] = useState({});

  const sectionBaseDate = useMemo(() => {
    const candidate = monthDate ? new Date(monthDate) : new Date();
    if (Number.isNaN(candidate.getTime())) return startOfToday();
    candidate.setHours(0, 0, 0, 0);
    return candidate;
  }, [monthDate, listRefreshEpoch]);

  const actualTodayDate = useMemo(() => startOfToday(), []);
  const sectionAllHardStart = useMemo(
    () => new Date(sectionBaseDate.getFullYear() - 5, 0, 1, 0, 0, 0, 0),
    [sectionBaseDate]
  );
  const sectionAllHardEnd = useMemo(
    () => new Date(sectionBaseDate.getFullYear() + 5, 11, 31, 23, 59, 59, 999),
    [sectionBaseDate]
  );
  const [allPastMonths, setAllPastMonths] = useState(1);
  const [allFutureMonths, setAllFutureMonths] = useState(2);
  const sectionAllStart = useMemo(() => {
    if (allPastMonths <= 0) {
      const d = new Date(actualTodayDate);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    return new Date(sectionBaseDate.getFullYear(), sectionBaseDate.getMonth() - allPastMonths, 1, 0, 0, 0, 0);
  }, [actualTodayDate, sectionBaseDate, allPastMonths]);
  const sectionAllEnd = useMemo(
    () => new Date(sectionBaseDate.getFullYear(), sectionBaseDate.getMonth() + allFutureMonths + 1, 0, 23, 59, 59, 999),
    [sectionBaseDate, allFutureMonths]
  );

  const filteredEvents = useMemo(() => {
    const startMs = sectionAllStart.getTime();
    const endMs = sectionAllEnd.getTime();
    return (events || []).filter((event) => {
      if (!event) return false;
      if (String(event?.status || '').toLowerCase() === 'canceled') return false;
      const dateValue = resolveEventDateValue(event);
      if (!dateValue) return false;
      const ts = new Date(dateValue).getTime();
      if (!Number.isFinite(ts)) return true;
      return ts >= startMs && ts <= endMs;
    });
  }, [events, sectionAllStart, sectionAllEnd, listRefreshEpoch]);

  useEffect(() => {
    const ids = new Set();
    filteredEvents.forEach((event) => {
      getEventMaterialIds(event).forEach((id) => ids.add(id));
    });
    if (!ids.size) {
      setMaterialById(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('materials')
          .select('id, title, provider_name, storage_path')
          .in('id', [...ids])
          .is('deleted_at', null);
        if (cancelled) return;
        if (error) {
          setMaterialById(new Map());
          return;
        }
        const map = new Map();
        (data || []).forEach((row) => {
          const id = String(row?.id || '').trim();
          if (id) map.set(id, row);
        });
        setMaterialById(map);
      } catch {
        if (!cancelled) setMaterialById(new Map());
      }
    })();
    return () => { cancelled = true; };
  }, [filteredEvents]);

  useEffect(() => {
    if (!familyId) {
      setAssignmentsByEventId({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('assignments')
          .select('id, child_id, linked_event_ids, status, review_status, submitted_at, progress_percent, grade_display, grade_value, due_date')
          .eq('family_id', familyId)
          .order('updated_at', { ascending: false })
          .limit(500);
        if (cancelled) return;
        if (error) {
          setAssignmentsByEventId({});
          return;
        }
        setAssignmentsByEventId(mergeAssignmentsByEventId(data || []));
      } catch {
        if (!cancelled) setAssignmentsByEventId({});
      }
    })();
    return () => { cancelled = true; };
  }, [familyId, filteredEvents, listRefreshEpoch]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !familyId) return;
    const refresh = () => {
      supabase
        .from('assignments')
        .select('id, child_id, linked_event_ids, status, review_status, submitted_at, progress_percent, grade_display, grade_value, due_date')
        .eq('family_id', familyId)
        .order('updated_at', { ascending: false })
        .limit(500)
        .then(({ data, error }) => {
          if (error) return;
          setAssignmentsByEventId(mergeAssignmentsByEventId(data || []));
        });
    };
    window.addEventListener('childAssignmentsNeedRefresh', refresh);
    window.addEventListener('parentAssignmentsNeedRefresh', refresh);
    return () => {
      window.removeEventListener('childAssignmentsNeedRefresh', refresh);
      window.removeEventListener('parentAssignmentsNeedRefresh', refresh);
    };
  }, [familyId]);

  const todayYmd = useMemo(() => {
    const y = actualTodayDate.getFullYear();
    const m = String(actualTodayDate.getMonth() + 1).padStart(2, '0');
    const d = String(actualTodayDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [actualTodayDate]);

  const groupedDenseRows = useMemo(() => {
    const sorted = [...filteredEvents].sort((a, b) => {
      const aDate = new Date(resolveEventDateValue(a) || 0).getTime();
      const bDate = new Date(resolveEventDateValue(b) || 0).getTime();
      return aDate - bDate;
    });
    const groups = [];
    let currentKey = null;
    sorted.forEach((event) => {
      const dateValue = resolveEventDateValue(event);
      if (!dateValue) return;
      const ymd = String(event?.date_local || '').slice(0, 10) || String(dateValue).slice(0, 10);
      if (!ymd) return;
      if (currentKey !== ymd) {
        currentKey = ymd;
        groups.push({ type: 'header', key: `hdr-${ymd}`, dateKey: ymd });
      }
      groups.push({ type: 'event', key: `ev-${String(event?.id || Math.random())}`, dateKey: ymd, event });
    });
    const hasTodayHeader = groups.some((row) => row?.type === 'header' && row?.dateKey === todayYmd);
    if (!hasTodayHeader) {
      let inserted = false;
      for (let i = 0; i < groups.length; i += 1) {
        const row = groups[i];
        if (row?.type !== 'header') continue;
        const rowDate = String(row?.dateKey || '');
        if (rowDate > todayYmd) {
          groups.splice(i, 0, { type: 'header', key: `hdr-${todayYmd}`, dateKey: todayYmd });
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        groups.push({ type: 'header', key: `hdr-${todayYmd}`, dateKey: todayYmd });
      }
    }
    return groups;
  }, [filteredEvents, todayYmd, listRefreshEpoch]);

  const denseListRef = useRef(null);
  const allowExpandOnScrollRef = useRef(false);
  const [listVisibilityEpoch, setListVisibilityEpoch] = useState(0);
  const allWindowExpandAtRef = useRef({ past: 0, future: 0 });
  const denseTodayIndex = useMemo(
    () => groupedDenseRows.findIndex((row) => row?.type === 'header' && row?.dateKey === todayYmd),
    [groupedDenseRows, todayYmd]
  );
  const denseStickyHeaderIndices = useMemo(() => {
    const out = [];
    groupedDenseRows.forEach((row, idx) => {
      if (row?.type === 'header') out.push(idx);
    });
    return out;
  }, [groupedDenseRows]);
  const denseItemLayouts = useMemo(() => {
    const offsets = [];
    let cursor = 0;
    groupedDenseRows.forEach((row) => {
      offsets.push(cursor);
      cursor += row?.type === 'header' ? DENSE_DATE_HEADER_HEIGHT : DENSE_EVENT_ROW_HEIGHT;
    });
    return offsets;
  }, [groupedDenseRows]);

  const formatDenseDateHeader = useCallback((dateYmd) => {
    const d = new Date(`${dateYmd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return dateYmd;
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    const day = d.getDate();
    const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
    return `${month} ${day} • ${weekday}`;
  }, []);

  const shouldAnchorToToday = plannerShellVisible || scrollToToday;
  const stickyHeaderIndices = embedded ? [] : denseStickyHeaderIndices;

  const recenterDenseList = useCallback(() => {
    if (denseTodayIndex < 0) return;
    const target = Math.max(0, denseTodayIndex);
    denseListRef.current?.scrollToIndex?.({ index: target, animated: false, viewPosition: 0 });
    allowExpandOnScrollRef.current = true;
  }, [denseTodayIndex]);

  const prevPlannerShellVisibleRef = useRef(plannerShellVisible);
  useLayoutEffect(() => {
    const wasVisible = prevPlannerShellVisibleRef.current;
    prevPlannerShellVisibleRef.current = plannerShellVisible;
    if (!plannerShellVisible || wasVisible) return;
    allowExpandOnScrollRef.current = false;
    setListVisibilityEpoch((value) => value + 1);
  }, [plannerShellVisible]);

  useLayoutEffect(() => {
    if (!shouldAnchorToToday || denseTodayIndex < 0) return;
    allowExpandOnScrollRef.current = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        recenterDenseList();
      });
    });
    const retryMs = embedded ? [120, 320, 520] : [120];
    const timers = retryMs.map((ms) => setTimeout(() => recenterDenseList(), ms));
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
      timers.forEach(clearTimeout);
    };
  }, [
    shouldAnchorToToday,
    denseTodayIndex,
    groupedDenseRows.length,
    listRefreshEpoch,
    scrollToTodayEpoch,
    listVisibilityEpoch,
    recenterDenseList,
    embedded,
  ]);

  const maybeExpandAllPast = useCallback(() => {
    const now = Date.now();
    if (now - (allWindowExpandAtRef.current.past || 0) < 700) return;
    allWindowExpandAtRef.current.past = now;
    setAllPastMonths((prev) => {
      if (prev >= 60) return prev;
      const candidate = prev + 2;
      const nextStart = new Date(sectionBaseDate.getFullYear(), sectionBaseDate.getMonth() - candidate, 1, 0, 0, 0, 0);
      return nextStart < sectionAllHardStart ? prev : candidate;
    });
  }, [sectionBaseDate, sectionAllHardStart]);

  const maybeExpandAllFuture = useCallback(() => {
    const now = Date.now();
    if (now - (allWindowExpandAtRef.current.future || 0) < 700) return;
    allWindowExpandAtRef.current.future = now;
    setAllFutureMonths((prev) => {
      if (prev >= 60) return prev;
      const candidate = prev + 2;
      const nextEnd = new Date(sectionBaseDate.getFullYear(), sectionBaseDate.getMonth() + candidate + 1, 0, 23, 59, 59, 999);
      return nextEnd > sectionAllHardEnd ? prev : candidate;
    });
  }, [sectionBaseDate, sectionAllHardEnd]);

  const resolveIsDone = useCallback((event) => {
    if (typeof resolveEventCompleted === 'function') {
      return !!resolveEventCompleted(event);
    }
    return isDoneStatus(event?.status);
  }, [resolveEventCompleted, isDoneStatus]);

  const renderDenseEventRow = useCallback((event) => {
    const eventId = String(event?.id || '');
    const isDone = resolveIsDone(event);
    const typeLabel = formatEventTypeLabel(event);
    const timeLabel = formatTimeRangeLabel(event);
    const eventChildIds = resolveChildIdsForEvent(event);
    const childLabel = eventChildIds.length > 0
      ? formatChildNamesCommaLine(eventChildIds, children)
      : '';
    const { chipBg, chipText } = getPlannerEventTypeColors(event);
    const unitLessonLabel = getEventUnitLessonLabel(event);
    const gradeLabel = formatEventGradeLabel(event);
    const materialIds = getEventMaterialIds(event);
    const assignment = primaryAssignmentForEvent(assignmentsByEventId, eventId, eventChildIds);
    const submissionLabel = getAllEventsSubmissionLabel(event, assignment);
    const hideAttendanceControl = isPlannerHolidayOrBreakType(event);

    const handleRowContextMenu = (nativeEvent) => {
      if (Platform.OS !== 'web' || typeof window === 'undefined' || !onEventRightClick) return;
      nativeEvent?.preventDefault?.();
      nativeEvent?.stopPropagation?.();
      onEventRightClick(event, nativeEvent);
    };

    return (
      <View
        key={eventId || Math.random()}
        style={[styles.denseRow, isDone && styles.denseRowDone]}
        {...(Platform.OS === 'web' && {
          'data-event-id': eventId,
          onMouseDown: (e) => {
            const button = e?.button ?? e?.nativeEvent?.button;
            if (button !== 2) return;
            handleRowContextMenu(e?.nativeEvent || e);
          },
          onContextMenu: (e) => {
            handleRowContextMenu(e?.nativeEvent || e);
          },
        })}
      >
        <View style={styles.denseColLeading}>
          {!hideAttendanceControl ? (
            <View
              style={styles.denseStatusCell}
              {...(Platform.OS === 'web' && onEventComplete && {
                onClick: (e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onEventComplete(event);
                },
                onMouseDown: (e) => e.stopPropagation(),
              })}
            >
              <CompletionRing
                isDone={isDone}
                size={14}
                pendingBorderColor="rgba(107, 114, 128, 0.5)"
                onPress={() => onEventComplete && onEventComplete(event)}
              />
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.denseColDetails, styles.denseDetailsCell]}
          onPress={() => onEventPress?.(event)}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' && { cursor: onEventPress ? 'pointer' : 'default' })}
        >
          <Text style={[styles.denseEventTitle, isDone && styles.denseMutedText]} numberOfLines={1}>
            {String(event?.title || 'Untitled')}
          </Text>
          <View style={styles.denseSublineRow}>
            {timeLabel ? (
              <Text style={[styles.denseSublineMeta, isDone && styles.denseMutedText]} numberOfLines={1}>
                {timeLabel}
              </Text>
            ) : null}
            <View style={[styles.denseTypeChip, { backgroundColor: chipBg }]}>
              <Text style={[styles.denseTypeChipText, { color: chipText }]} numberOfLines={1}>
                {typeLabel}
              </Text>
            </View>
            {eventChildIds.length > 0 ? (
              <View style={styles.denseChildLabel}>
                <ChildAvatarCluster
                  childIds={eventChildIds}
                  familyChildren={children}
                  size={20}
                  overlap={-9}
                  hideBackground
                />
                {childLabel ? (
                  <Text style={[styles.denseSublineMeta, isDone && styles.denseMutedText]} numberOfLines={1}>
                    {childLabel}
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        </TouchableOpacity>

        <View style={styles.denseColUnits}>
          {unitLessonLabel ? (
            <Text style={[styles.denseCellText, isDone && styles.denseMutedText]} numberOfLines={1} ellipsizeMode="tail">
              {unitLessonLabel}
            </Text>
          ) : (
            <Text style={styles.denseEmptyCellText}>—</Text>
          )}
        </View>

        <View style={styles.denseColSubmission}>
          {submissionLabel ? (
            <Text style={[styles.denseCellText, styles.denseSubmissionText, isDone && styles.denseMutedText]} numberOfLines={1} ellipsizeMode="tail">
              {submissionLabel}
            </Text>
          ) : (
            <Text style={styles.denseEmptyCellText}>—</Text>
          )}
        </View>

        <View style={styles.denseColGrade}>
          {gradeLabel ? (
            <Text style={[styles.denseCellText, styles.denseGradeText, isDone && styles.denseMutedText]} numberOfLines={1}>
              {gradeLabel}
            </Text>
          ) : (
            <Text style={styles.denseEmptyCellText}>—</Text>
          )}
        </View>

        <View style={styles.denseColAttachments}>
          {materialIds.length === 0 ? (
            <Text style={styles.denseEmptyCellText}>—</Text>
          ) : (
            <View style={styles.denseAttachmentLinksWrap}>
              {materialIds.map((materialId) => {
                const material = materialById.get(materialId);
                const label = resolveMaterialDisplayLabel(material, materialId, event);
                return (
                  <TouchableOpacity
                    key={materialId}
                    onPress={() => onEventPress?.(event)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' && { cursor: 'pointer', title: label })}
                  >
                    <Text style={styles.denseAttachmentLinkText} numberOfLines={1} ellipsizeMode="tail">
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </View>
    );
  }, [
    assignmentsByEventId,
    children,
    materialById,
    onEventComplete,
    onEventPress,
    onEventRightClick,
    resolveIsDone,
  ]);

  const renderDenseListItem = useCallback(({ item }) => {
    if (item?.type === 'header') {
      const isTodayHeader = item?.dateKey === todayYmd;
      return (
        <View style={[styles.denseDateHeader, embedded && styles.denseDateHeaderEmbedded]}>
          <View style={styles.denseDateHeaderRow}>
            {isTodayHeader ? (
              <Text style={styles.denseTodayMarker} accessibilityLabel="Today">
                →
              </Text>
            ) : null}
            <Text
              style={[
                styles.denseDateHeaderText,
                isTodayHeader && styles.denseDateHeaderTextToday,
              ]}
            >
              {formatDenseDateHeader(item.dateKey)}
            </Text>
          </View>
        </View>
      );
    }
    return renderDenseEventRow(item?.event);
  }, [embedded, formatDenseDateHeader, renderDenseEventRow, todayYmd]);

  if (!filteredEvents.length && !groupedDenseRows.some((r) => r?.type === 'header')) {
    const hasAnyEvents = (events || []).length > 0;
    const emptyTitle = emptyTitleProp
      || (hasAnyEvents ? 'No events in this range' : 'No events yet');
    const emptySubtitle = emptySubtitleProp
      || (hasAnyEvents
        ? 'Try another month or adjust your filters.'
        : 'Create events to build your schedule.');
    const showAddButton = !embedded && !hasAnyEvents && typeof onAddEvent === 'function';

    return (
      <View style={[styles.emptyContainer, embedded && styles.emptyContainerEmbedded]}>
        <Text style={styles.emptyTitle}>{emptyTitle}</Text>
        <Text style={styles.emptySubtitle}>{emptySubtitle}</Text>
        {showAddButton ? (
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={onAddEvent}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Add event"
          >
            <Plus size={16} color="#5AAEF2" />
            <Text style={styles.emptyButtonText}>Add</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  const useEmbeddedMaxHeight = embedded && !fillViewport && Number.isFinite(maxListHeight);
  const embeddedListMaxHeight = useEmbeddedMaxHeight ? maxListHeight - 40 : undefined;

  return (
    <View style={[
      styles.denseListWrap,
      embedded && fillViewport && styles.denseListWrapFill,
      useEmbeddedMaxHeight && { maxHeight: maxListHeight },
    ]}>
      <View style={styles.denseTableHeaderRow}>
        <View style={styles.denseColLeading} />
        <Text style={[styles.denseTableHeaderCell, styles.denseColDetails]}>Event Details</Text>
        <Text style={[styles.denseTableHeaderCell, styles.denseColUnits]}>Units</Text>
        <Text style={[styles.denseTableHeaderCell, styles.denseColSubmission]}>Submission</Text>
        <Text style={[styles.denseTableHeaderCell, styles.denseColGrade]}>Grade</Text>
        <Text style={[styles.denseTableHeaderCell, styles.denseColAttachments]}>Attachments</Text>
      </View>
      <FlatList
        key={`planner-list-${listRefreshEpoch}-${listVisibilityEpoch}-${scrollToTodayEpoch}`}
        ref={denseListRef}
        style={[
          styles.tasksList,
          embedded && fillViewport && styles.tasksListFill,
          embedded && useEmbeddedMaxHeight && {
            maxHeight: embeddedListMaxHeight,
            ...(Platform.OS === 'web' && { overflowY: 'auto' }),
          },
          embedded && fillViewport && Platform.OS === 'web' && { overflowY: 'auto', flex: 1 },
        ]}
        contentContainerStyle={styles.denseListContent}
        data={groupedDenseRows}
        keyExtractor={(item) => String(item?.key || '')}
        renderItem={renderDenseListItem}
        {...(stickyHeaderIndices.length > 0 ? { stickyHeaderIndices } : {})}
        {...(shouldAnchorToToday && denseTodayIndex >= 0
          ? { initialScrollIndex: denseTodayIndex }
          : {})}
        getItemLayout={(_, index) => {
          const row = groupedDenseRows[index];
          const length = row?.type === 'header' ? DENSE_DATE_HEADER_HEIGHT : DENSE_EVENT_ROW_HEIGHT;
          const offset = denseItemLayouts[index] ?? 0;
          return { length, offset, index };
        }}
        onEndReachedThreshold={0.65}
        onEndReached={maybeExpandAllFuture}
        onScroll={(e) => {
          if (!allowExpandOnScrollRef.current) return;
          const y = e?.nativeEvent?.contentOffset?.y ?? 0;
          if (y <= 120) maybeExpandAllPast();
        }}
        scrollEventThrottle={16}
        nestedScrollEnabled
        onScrollToIndexFailed={() => {
          setTimeout(() => recenterDenseList(), 120);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  denseListWrap: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
    ...(Platform.OS === 'web' && {
      overflowX: 'auto',
    }),
  },
  denseListWrapFill: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  denseListContent: {
    minWidth: DENSE_TABLE_MIN_WIDTH,
  },
  denseTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minWidth: DENSE_TABLE_MIN_WIDTH,
    flexShrink: 0,
    zIndex: 10,
    ...(Platform.OS === 'web' && {
      position: 'sticky',
      top: 0,
    }),
  },
  denseTableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  tasksList: {
    flex: 1,
    minHeight: 0,
  },
  tasksListFill: {
    flex: 1,
    minHeight: 0,
  },
  denseDateHeader: {
    height: DENSE_DATE_HEADER_HEIGHT,
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      zIndex: 2,
    }),
  },
  denseDateHeaderEmbedded: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  denseDateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  denseTodayMarker: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5AAEF2',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  denseDateHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  denseDateHeaderTextToday: {
    color: '#0F4C81',
  },
  denseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: DENSE_EVENT_ROW_HEIGHT,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    minWidth: DENSE_TABLE_MIN_WIDTH,
  },
  denseRowDone: {
    opacity: 0.72,
  },
  denseColLeading: {
    width: 40,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  denseStatusCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  denseColDetails: {
    flex: 1.8,
    minWidth: 0,
  },
  denseDetailsCell: {
    alignItems: 'flex-start',
    gap: 4,
  },
  denseColUnits: {
    flex: 1.2,
    minWidth: 0,
    justifyContent: 'center',
  },
  denseColSubmission: {
    flex: 0.9,
    minWidth: 0,
    justifyContent: 'center',
  },
  denseColGrade: {
    flex: 0.8,
    minWidth: 0,
    justifyContent: 'center',
  },
  denseColAttachments: {
    flex: 1.1,
    minWidth: 0,
    justifyContent: 'center',
    paddingRight: 0,
  },
  denseEventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  denseSublineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  denseChildLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  denseTypeChip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  denseTypeChipText: {
    fontSize: 11,
    fontWeight: '600',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  denseSublineMeta: {
    fontSize: 12,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  denseCellText: {
    fontSize: 13,
    color: '#111827',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  denseGradeText: {
    fontWeight: '600',
  },
  denseSubmissionText: {
    fontWeight: '500',
    color: '#475569',
  },
  denseEmptyCellText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  denseMutedText: {
    opacity: 0.65,
  },
  denseAttachmentLinksWrap: {
    gap: 4,
  },
  denseAttachmentLinkText: {
    fontSize: 13,
    color: '#5AAEF2',
    textDecorationLine: 'underline',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
    minHeight: 280,
  },
  emptyContainerEmbedded: {
    paddingVertical: 40,
    minHeight: 200,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 420,
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    minHeight: 42,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#9ED3FF',
    backgroundColor: '#F8FCFF',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5AAEF2',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
