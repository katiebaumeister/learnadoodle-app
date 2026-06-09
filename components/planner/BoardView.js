import React, { useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, Platform, Alert, StyleSheet } from 'react-native';
import { startOfWeek, addDays, format } from './utils/date';
import EventChip from '../calendar/EventChip';
import { rescheduleEvent } from '../../lib/services/plannerClientWithOffline';

const getEventStartMs = (event) => {
  const startTime = event.start || event.start_ts || event.start_local;
  if (!startTime) return Number.MAX_SAFE_INTEGER;
  const ms = new Date(startTime).getTime();
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
};

const localYmd = (d) => {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function BoardView({ weekAnchor, events = [], onEventPress, onEventRightClick, onEventComplete, children = [], familyId = null }) {
  const isPublicHolidayEvent = (ev) =>
    String(ev?.holiday_type || ev?.holidayType || '').toUpperCase() === 'GLOBAL_HOLIDAY';
  const lastMoveLogRef = useRef(0);
  const dayColumnRefs = useRef({});
  const suppressClickUntilRef = useRef(0);
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [localOverrides, setLocalOverrides] = useState({});
  const weekStart = startOfWeek(weekAnchor); // Sunday start
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const effectiveEvents = useMemo(() => {
    if (!events?.length) return [];
    return events.map((ev) => localOverrides[ev.id] ? { ...ev, ...localOverrides[ev.id] } : ev);
  }, [events, localOverrides]);
  const dayIsoList = useMemo(() => days.map((d) => localYmd(d)).filter(Boolean), [days]);

  // Expand Project events to show on all days they span (if within a week)
  const expandedEvents = useMemo(() => {
    const expanded = [];
    const seenIds = new Set();
    
    for (const e of effectiveEvents) {
      // Check if this is a Project event with start and end dates
      if (e.event_type === 'Project' && e.start_ts && e.end_ts) {
        const startDate = new Date(e.start_ts);
        const endDate = new Date(e.end_ts);
        
        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
          // Calculate days difference
          const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          
          // If project spans within a week (7 days or less), expand it
          if (daysDiff <= 7) {
            // Create a copy for each day from start to end
            for (let i = 0; i <= daysDiff; i++) {
              const dayDate = new Date(startDate);
              dayDate.setDate(startDate.getDate() + i);
              
              // Only include days that are in the current week view
              const dayKey = dayDate.toDateString();
              if (days.some(d => d.toDateString() === dayKey)) {
                const expandedEvent = {
                  ...e,
                  id: `${e.id}-day-${i}`, // Unique ID for each day instance
                  _originalId: e.id, // Keep reference to original
                  _dayIndex: i,
                };
                expanded.push(expandedEvent);
              }
            }
            continue; // Skip adding the original event
          }
        }
      }
      
      // For non-Project events or Projects outside the week range, add as-is
      if (!seenIds.has(e.id)) {
        expanded.push(e);
        seenIds.add(e.id);
      }
    }
    
    return expanded;
  }, [effectiveEvents, days]);

  // Bucket events by day, sorted chronologically within each day.
  const byDay = useMemo(() => {
    const map = new Map();

    for (const d of days) {
      map.set(d.toDateString(), []);
    }

    for (const e of expandedEvents) {
      let eventDate;
      if (e._dayIndex !== undefined && e._originalId) {
        const originalStart = new Date(e.start_ts);
        eventDate = new Date(originalStart);
        eventDate.setDate(originalStart.getDate() + e._dayIndex);
      } else {
        const startTime = e.start || e.start_ts || e.start_local;
        if (!startTime) continue;
        eventDate = new Date(startTime);
      }

      if (Number.isNaN(eventDate.getTime())) continue;

      const dayKey = eventDate.toDateString();
      if (map.has(dayKey)) {
        map.get(dayKey).push(e);
      }
    }

    for (const dayEvents of map.values()) {
      dayEvents.sort((a, b) => getEventStartMs(a) - getEventStartMs(b));
    }

    return map;
  }, [expandedEvents, days]);

  const debugDrag = useCallback((phase, payload = {}) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const safePayload = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => {
        const t = typeof value;
        return value == null || t === 'string' || t === 'number' || t === 'boolean';
      })
    );
    console.log('[BoardView][DND]', phase, safePayload);
    window.__boardDndDebug = {
      at: new Date().toISOString(),
      phase,
      payload: safePayload,
    };
  }, []);

  const getDomNode = useCallback((refNode) => {
    if (!refNode) return null;
    if (refNode instanceof Element) return refNode;
    if (typeof refNode.getBoundingClientRect === 'function') return refNode;
    if (refNode._nativeNode instanceof Element) return refNode._nativeNode;
    return null;
  }, []);

  const resolveTargetDateFromPoint = useCallback((x, y) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return null;

    // 1) Deterministic mapping from visible day columns in DOM.
    const domColumns = Array.from(document.querySelectorAll('[data-day-date]'))
      .map((el) => {
        const dateIso = el.getAttribute('data-day-date');
        if (!dateIso || typeof el.getBoundingClientRect !== 'function') return null;
        const rect = el.getBoundingClientRect();
        if (!rect || Number.isNaN(rect.left) || Number.isNaN(rect.right) || rect.width <= 0) return null;
        return {
          dateIso,
          rect,
          center: (rect.left + rect.right) / 2,
        };
      })
      .filter(Boolean);

    if (domColumns.length > 0) {
      // Primary: if pointer X is inside one or more columns, choose nearest center.
      const xHits = domColumns.filter((c) => x >= c.rect.left && x <= c.rect.right);
      const candidates = xHits.length > 0 ? xHits : domColumns;
      candidates.sort((a, b) => Math.abs(x - a.center) - Math.abs(x - b.center));
      return candidates[0].dateIso;
    }

    // 2) Fallback to explicit geometry from cached refs.
    const refRects = [];
    for (const [dateIso, refNode] of Object.entries(dayColumnRefs.current || {})) {
      const dom = getDomNode(refNode);
      if (!dom || typeof dom.getBoundingClientRect !== 'function') continue;
      const rect = dom.getBoundingClientRect();
      if (!rect || Number.isNaN(rect.left) || Number.isNaN(rect.right) || rect.width <= 0) continue;
      refRects.push({ dateIso, rect, center: (rect.left + rect.right) / 2 });
    }
    if (refRects.length > 0) {
      const xHits = refRects.filter((c) => x >= c.rect.left && x <= c.rect.right);
      const candidates = xHits.length > 0 ? xHits : refRects;
      candidates.sort((a, b) => Math.abs(x - a.center) - Math.abs(x - b.center));
      return candidates[0].dateIso;
    }

    // 3) Last-resort hit-testing.
    const topEl = document.elementFromPoint(x, y);
    const direct = topEl?.closest?.('[data-day-date]')?.getAttribute?.('data-day-date');
    if (direct) return direct;

    if (typeof document.elementsFromPoint === 'function') {
      const all = document.elementsFromPoint(x, y);
      for (const el of all) {
        const viaClosest = el?.closest?.('[data-day-date]')?.getAttribute?.('data-day-date');
        if (viaClosest) return viaClosest;
      }
    }
    return null;
  }, [getDomNode]);

  const getApproxColumnWidth = useCallback(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const domColumn = document.querySelector('[data-day-date]');
      const rect = domColumn?.getBoundingClientRect?.();
      if (rect?.width > 0) return rect.width;
    }
    const firstRef = dayColumnRefs.current?.[dayIsoList[0]];
    const dom = getDomNode(firstRef);
    const rect = dom?.getBoundingClientRect?.();
    if (rect?.width > 0) return rect.width;
    return 160;
  }, [dayIsoList, getDomNode]);

  const handleMouseDragStart = useCallback((e, event) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!event?.id) return;
    const mouseButton = typeof e.button === 'number' ? e.button : e.nativeEvent?.button;
    if (typeof mouseButton === 'number' && mouseButton !== 0) {
      debugDrag('mouse_down_ignored_button', { button: mouseButton, eventId: event.id });
      return;
    }

    const eventId = event._originalId || event.id;
    const startX = e.clientX;
    const startY = e.clientY;
    const originalTarget = e.currentTarget;
    const dragState = { active: false };
    const selectionLockState = {
      bodyUserSelect: null,
      bodyWebkitUserSelect: null,
      htmlUserSelect: null,
      htmlWebkitUserSelect: null,
    };
    debugDrag('mouse_down', {
      eventId,
      startX: Math.round(startX),
      startY: Math.round(startY),
    });

    const handleMouseMove = (moveEvent) => {
      const deltaX = Math.abs(moveEvent.clientX - startX);
      const deltaY = Math.abs(moveEvent.clientY - startY);
      if (deltaX <= 3 && deltaY <= 3) return;

      if (!dragState.active) {
        dragState.active = true;
        suppressClickUntilRef.current = Date.now() + 600;
        setDraggedEventId(eventId);
        moveEvent.preventDefault();
        moveEvent.stopPropagation();
        // Prevent native text selection while dragging across columns.
        const bodyStyle = document.body?.style;
        const htmlStyle = document.documentElement?.style;
        if (bodyStyle) {
          selectionLockState.bodyUserSelect = bodyStyle.userSelect;
          selectionLockState.bodyWebkitUserSelect = bodyStyle.WebkitUserSelect;
          bodyStyle.userSelect = 'none';
          bodyStyle.WebkitUserSelect = 'none';
        }
        if (htmlStyle) {
          selectionLockState.htmlUserSelect = htmlStyle.userSelect;
          selectionLockState.htmlWebkitUserSelect = htmlStyle.WebkitUserSelect;
          htmlStyle.userSelect = 'none';
          htmlStyle.WebkitUserSelect = 'none';
        }
        debugDrag('drag_detected', {
          eventId,
          deltaX: Math.round(deltaX),
          deltaY: Math.round(deltaY),
        });

        let domNode = originalTarget;
        if (domNode?._nativeNode) domNode = domNode._nativeNode;
        if (domNode?.firstChild?.style) domNode = domNode.firstChild;
        if (domNode?.style) {
          domNode.style.opacity = '0.4';
          const ghost = domNode.cloneNode(true);
          ghost.id = `board-drag-ghost-${eventId}`;
          ghost.style.position = 'fixed';
          ghost.style.pointerEvents = 'none';
          ghost.style.opacity = '0.92';
          ghost.style.zIndex = '99999';
          ghost.style.transform = 'scale(1.04)';
          ghost.style.boxShadow = '0 8px 16px rgba(0,0,0,0.16)';
          ghost.style.width = `${domNode.offsetWidth}px`;
          ghost.style.height = `${domNode.offsetHeight}px`;
          const rect = domNode.getBoundingClientRect();
          ghost.style.left = `${moveEvent.clientX - rect.width / 2}px`;
          ghost.style.top = `${moveEvent.clientY - rect.height / 2}px`;
          document.body.appendChild(ghost);
          originalTarget._dragGhost = ghost;
          originalTarget._dragDomNode = domNode;
        }
      }

      if (dragState.active && originalTarget?._dragGhost) {
        const ghost = originalTarget._dragGhost;
        const rect = ghost.getBoundingClientRect();
        ghost.style.left = `${moveEvent.clientX - rect.width / 2}px`;
        ghost.style.top = `${moveEvent.clientY - rect.height / 2}px`;
        const now = Date.now();
        if (now - lastMoveLogRef.current > 250) {
          lastMoveLogRef.current = now;
          const hovered = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
          const hoverDate = resolveTargetDateFromPoint(moveEvent.clientX, moveEvent.clientY);
          debugDrag('drag_move', {
            eventId,
            x: Math.round(moveEvent.clientX),
            y: Math.round(moveEvent.clientY),
            hoverDate,
          });
        }
      }
    };

    const cleanup = () => {
      if (originalTarget?._dragGhost?.parentNode) {
        originalTarget._dragGhost.parentNode.removeChild(originalTarget._dragGhost);
      }
      if (originalTarget?._dragDomNode?.style) {
        originalTarget._dragDomNode.style.opacity = '';
      }
      delete originalTarget._dragGhost;
      delete originalTarget._dragDomNode;
      const bodyStyle = document.body?.style;
      const htmlStyle = document.documentElement?.style;
      if (bodyStyle) {
        bodyStyle.userSelect = selectionLockState.bodyUserSelect ?? '';
        bodyStyle.WebkitUserSelect = selectionLockState.bodyWebkitUserSelect ?? '';
      }
      if (htmlStyle) {
        htmlStyle.userSelect = selectionLockState.htmlUserSelect ?? '';
        htmlStyle.WebkitUserSelect = selectionLockState.htmlWebkitUserSelect ?? '';
      }
      setDraggedEventId(null);
      debugDrag('drag_cleanup', { eventId, wasDragging: dragState.active });
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    const handleMouseUp = async (upEvent) => {
      if (!dragState.active) {
        cleanup();
        return;
      }

      const elementBelow = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      let targetDateIso = resolveTargetDateFromPoint(upEvent.clientX, upEvent.clientY);
      if (!targetDateIso) {
        debugDrag('drop_failed_no_target_day', {
          eventId,
          x: Math.round(upEvent.clientX),
          y: Math.round(upEvent.clientY),
          elementTag: elementBelow?.tagName || null,
        });
        cleanup();
        return;
      }
      debugDrag('drop_target_found', { eventId, targetDateIso });

      const source = events.find((ev) => String(ev.id) === String(eventId));
      if (!source) {
        debugDrag('drop_failed_source_not_found', { eventId });
        cleanup();
        return;
      }

      const sourceStartRaw = source.start_ts || source.start || source.start_local;
      const sourceEndRaw = source.end_ts || source.end || null;
      const sourceStart = new Date(sourceStartRaw);
      if (Number.isNaN(sourceStart.getTime())) {
        cleanup();
        return;
      }
      const sourceDayIso = localYmd(sourceStart);
      if (sourceDayIso === targetDateIso) {
        const deltaX = upEvent.clientX - startX;
        // Fallback: if user clearly dragged horizontally, infer adjacent day by delta.
        if (Math.abs(deltaX) >= 60 && dayIsoList.length > 0) {
          const sourceIdx = dayIsoList.indexOf(sourceDayIso);
          if (sourceIdx >= 0) {
            const approxColumns = Math.round(deltaX / getApproxColumnWidth());
            const nextIdx = Math.max(0, Math.min(dayIsoList.length - 1, sourceIdx + approxColumns));
            const inferred = dayIsoList[nextIdx];
            if (inferred && inferred !== sourceDayIso) {
              targetDateIso = inferred;
              debugDrag('drop_target_inferred_from_delta', {
                eventId,
                sourceDayIso,
                inferredTargetDateIso: inferred,
                deltaX: Math.round(deltaX),
                approxColumns,
              });
            }
          }
        }
      }
      if (sourceDayIso === targetDateIso) {
        debugDrag('drop_same_day_noop', { eventId, sourceDayIso, targetDateIso });
        cleanup();
        return;
      }

      const durationMs = sourceEndRaw
        ? Math.max(5 * 60000, new Date(sourceEndRaw).getTime() - sourceStart.getTime())
        : Math.max(5 * 60000, Number(source.minutes || 60) * 60000);
      const [year, month, day] = targetDateIso.split('-').map(Number);
      const newStart = new Date(year, month - 1, day, sourceStart.getHours(), sourceStart.getMinutes(), sourceStart.getSeconds(), 0);
      const newEnd = new Date(newStart.getTime() + durationMs);

      setLocalOverrides((prev) => ({
        ...prev,
        [eventId]: {
          ...source,
          start_ts: newStart.toISOString(),
          end_ts: newEnd.toISOString(),
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          date_local: targetDateIso,
          start_local: `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`,
          end_local: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
        },
      }));
      debugDrag('optimistic_applied', {
        eventId,
        sourceDayIso,
        targetDateIso,
        newStart: newStart.toISOString(),
      });
      if (typeof window !== 'undefined') {
        const mergeIds = (...lists) =>
          [...new Set(lists.flat().map((v) => String(v || '').trim()).filter(Boolean))];
        const sourceChildIds = mergeIds(
          Array.isArray(source?.child_ids) ? source.child_ids : [],
          Array.isArray(source?.assignees) ? source.assignees : [],
          Array.isArray(source?.data?.child_ids) ? source.data.child_ids : [],
          Array.isArray(source?.data?.assignees) ? source.data.assignees : [],
          source?.child_id,
          source?.childId,
          source?.student_id,
          source?.data?.child_id,
          source?.data?.childId,
          source?.data?.student_id,
        );
        const primaryChildId =
          source?.child_id ||
          source?.childId ||
          source?.student_id ||
          source?.data?.child_id ||
          source?.data?.childId ||
          source?.data?.student_id ||
          sourceChildIds[0] ||
          null;
        const optimisticEvent = {
          ...source,
          ...((source && typeof source.data === 'object') ? source.data : {}),
          start_ts: newStart.toISOString(),
          end_ts: newEnd.toISOString(),
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          date_local: targetDateIso,
          family_id: source?.family_id || source?.familyId || source?.data?.family_id || source?.data?.familyId || familyId || null,
          child_id: primaryChildId,
          child_ids: sourceChildIds,
          assignees: sourceChildIds,
          data: {
            ...((source && typeof source.data === 'object') ? source.data : {}),
            start_ts: newStart.toISOString(),
            end_ts: newEnd.toISOString(),
            date_local: targetDateIso,
            family_id: source?.family_id || source?.familyId || source?.data?.family_id || source?.data?.familyId || familyId || null,
            child_id: primaryChildId,
            child_ids: sourceChildIds,
            assignees: sourceChildIds,
          },
        };
        window.dispatchEvent(new CustomEvent('eventRescheduled', {
          detail: {
            eventId,
            updatedEvent: optimisticEvent,
            previousDateLocal: sourceDayIso,
          },
        }));
      }

      cleanup();

      const { error } = await rescheduleEvent(
        eventId,
        newStart.toISOString(),
        newEnd.toISOString(),
        'drag_drop',
        'board day move',
        familyId || source.family_id || null
      );
      if (error) {
        const mergeIds = (...lists) =>
          [...new Set(lists.flat().map((v) => String(v || '').trim()).filter(Boolean))];
        const sourceChildIds = mergeIds(
          Array.isArray(source?.child_ids) ? source.child_ids : [],
          Array.isArray(source?.assignees) ? source.assignees : [],
          Array.isArray(source?.data?.child_ids) ? source.data.child_ids : [],
          Array.isArray(source?.data?.assignees) ? source.data.assignees : [],
          source?.child_id,
          source?.childId,
          source?.student_id,
          source?.data?.child_id,
          source?.data?.childId,
          source?.data?.student_id,
        );
        const primaryChildId =
          source?.child_id ||
          source?.childId ||
          source?.student_id ||
          source?.data?.child_id ||
          source?.data?.childId ||
          source?.data?.student_id ||
          sourceChildIds[0] ||
          null;
        const errorMessage = String(error?.message || '');
        const errorStatus = Number(error?.status || 0);
        const lower = errorMessage.toLowerCase();
        const isConflictLike =
          error?.isConflict === true ||
          errorStatus === 409 ||
          errorStatus === 500 ||
          lower.includes('overlap') ||
          lower.includes('conflict') ||
          lower.includes('exclusion') ||
          lower.includes('database_error');
        debugDrag('api_reschedule_error', {
          eventId,
          targetDateIso,
          error: errorMessage || 'unknown_error',
          errorStatus,
          isConflictLike,
        });
        const optimisticEvent = {
          ...source,
          ...((source && typeof source.data === 'object') ? source.data : {}),
          start_ts: newStart.toISOString(),
          end_ts: newEnd.toISOString(),
          start: newStart.toISOString(),
          end: newEnd.toISOString(),
          date_local: targetDateIso,
          family_id: source?.family_id || source?.familyId || source?.data?.family_id || source?.data?.familyId || familyId || null,
          child_id: primaryChildId,
          child_ids: sourceChildIds,
          assignees: sourceChildIds,
          start_local: `${String(newStart.getHours()).padStart(2, '0')}:${String(newStart.getMinutes()).padStart(2, '0')}`,
          end_local: `${String(newEnd.getHours()).padStart(2, '0')}:${String(newEnd.getMinutes()).padStart(2, '0')}`,
          data: {
            ...((source && typeof source.data === 'object') ? source.data : {}),
            start_ts: newStart.toISOString(),
            end_ts: newEnd.toISOString(),
            date_local: targetDateIso,
            family_id: source?.family_id || source?.familyId || source?.data?.family_id || source?.data?.familyId || familyId || null,
            child_id: primaryChildId,
            child_ids: sourceChildIds,
            assignees: sourceChildIds,
          },
        };
        if (isConflictLike && typeof window !== 'undefined') {
          // Match month-view behavior: keep optimistic placement for conflict-like failures
          // so conflict resolution banner can decide next action.
          window.dispatchEvent(new CustomEvent('eventRescheduled', {
            detail: {
              eventId,
              updatedEvent: optimisticEvent,
              apiError: error,
              previousDateLocal: sourceDayIso,
            },
          }));
          window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { skipHomeRefresh: true } }));
          return;
        }
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
        if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(`Failed to move event: ${errorMessage || 'Unknown error'}`);
        } else {
          Alert.alert('Error', `Failed to move event: ${errorMessage || 'Unknown error'}`);
        }
      } else if (typeof window !== 'undefined') {
        const mergeIds = (...lists) =>
          [...new Set(lists.flat().map((v) => String(v || '').trim()).filter(Boolean))];
        const sourceChildIds = mergeIds(
          Array.isArray(source?.child_ids) ? source.child_ids : [],
          Array.isArray(source?.assignees) ? source.assignees : [],
          Array.isArray(source?.data?.child_ids) ? source.data.child_ids : [],
          Array.isArray(source?.data?.assignees) ? source.data.assignees : [],
          source?.child_id,
          source?.childId,
          source?.student_id,
          source?.data?.child_id,
          source?.data?.childId,
          source?.data?.student_id,
        );
        const primaryChildId =
          source?.child_id ||
          source?.childId ||
          source?.student_id ||
          source?.data?.child_id ||
          source?.data?.childId ||
          source?.data?.student_id ||
          sourceChildIds[0] ||
          null;
        debugDrag('api_reschedule_success', { eventId, targetDateIso });
        window.dispatchEvent(new CustomEvent('eventRescheduled', {
          detail: {
            eventId,
            updatedEvent: {
              ...source,
              ...((source && typeof source.data === 'object') ? source.data : {}),
              start_ts: newStart.toISOString(),
              end_ts: newEnd.toISOString(),
              start: newStart.toISOString(),
              end: newEnd.toISOString(),
              date_local: targetDateIso,
              family_id: source?.family_id || source?.familyId || source?.data?.family_id || source?.data?.familyId || familyId || null,
              child_id: primaryChildId,
              child_ids: sourceChildIds,
              assignees: sourceChildIds,
              data: {
                ...((source && typeof source.data === 'object') ? source.data : {}),
                start_ts: newStart.toISOString(),
                end_ts: newEnd.toISOString(),
                date_local: targetDateIso,
                family_id: source?.family_id || source?.familyId || source?.data?.family_id || source?.data?.familyId || familyId || null,
                child_id: primaryChildId,
                child_ids: sourceChildIds,
                assignees: sourceChildIds,
              },
            },
            fromApi: true,
          },
        }));
        window.dispatchEvent(new CustomEvent('refreshPlannerWeek'));
        window.dispatchEvent(new CustomEvent('refreshCalendar'));
      }
    };

    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp);
  }, [events, familyId, debugDrag, resolveTargetDateFromPoint, dayIsoList, getApproxColumnWidth]);

  return (
    <View style={{
      flex: 1,
      margin: 8,
      minHeight: 0,
      alignSelf: 'stretch',
      ...(Platform.OS === 'web' && {
        width: 'calc(100% - 16px)',
        maxWidth: 'calc(100% - 16px)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }),
    }}>
      <View style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: 'transparent',
        overflow: 'visible',
        borderRadius: 0,
        borderWidth: 0,
        borderColor: 'transparent',
        ...(Platform.OS === 'web' && {
          width: '100%',
          maxWidth: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }),
      }}>
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        gap: 8,
        padding: 8,
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        minHeight: 0,
        alignSelf: 'stretch',
        backgroundColor: 'transparent',
        ...(Platform.OS === 'web' && {
          overflowX: 'hidden',
          height: '100%',
        }),
      }}
    >
      {days.map(d => {
        const key = d.toDateString();
        const dayIso = localYmd(d);
        const dayEvents = byDay.get(key) ?? [];
        
        return (
          <View
            key={key}
            {...(Platform.OS === 'web' && dayIso && { 'data-day-date': dayIso })}
            ref={(node) => {
              if (!dayIso) return;
              if (node) {
                dayColumnRefs.current[dayIso] = node;
              } else {
                delete dayColumnRefs.current[dayIso];
              }
            }}
            style={{
              flex: 1,
              minWidth: 0,
              alignSelf: 'stretch',
              backgroundColor: 'transparent',
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#e5e7eb',
              padding: 10,
              ...(Platform.OS === 'web' && {
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '100%',
              }),
            }}
          >
            {/* Column header */}
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '700', marginBottom: 2 }} numberOfLines={1}>
                {format(d, 'EEE').toUpperCase()}
              </Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f141a' }} numberOfLines={1}>
                {format(d, 'MMM d')}
              </Text>
            </View>

            <View style={styles.dayEventsList}>
              {dayEvents.map(ev => {
                const canonicalId = ev._originalId || ev.id;
                const isHoliday = (ev.event_type || ev.type || '').toLowerCase() === 'holiday';
                const canDrag = !isHoliday && ev.status !== 'done' && !ev._originalId;
                const isDragging = draggedEventId && String(draggedEventId) === String(canonicalId);
                return (
                  <View
                    key={ev.id}
                    {...(Platform.OS === 'web' && {
                      onMouseDown: (mouseEvent) => {
                        if (!canDrag) return;
                        handleMouseDragStart(mouseEvent, ev);
                      },
                    })}
                    style={{
                      ...(Platform.OS === 'web' && {
                        cursor: canDrag ? 'grab' : (isPublicHolidayEvent(ev) ? 'default' : 'pointer'),
                        opacity: isDragging ? 0.65 : 1,
                        userSelect: 'none',
                        WebkitUserSelect: 'none',
                      }),
                    }}
                  >
                    <EventChip
                      ev={ev}
                      compact={true}
                      fullWidth={true}
                      hideTime={false}
                      onPress={onEventPress ? () => {
                        if (Date.now() < suppressClickUntilRef.current) return;
                        if (isPublicHolidayEvent(ev)) return;
                        onEventPress(ev);
                      } : undefined}
                      onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                      onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                      showCheckmark={true}
                      children={children}
                      titleFontSize={13}
                      timeFontSize={11}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dayEventsList: {
    flex: 1,
    gap: 4,
    minHeight: 0,
  },
});
