import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, Platform, Alert } from 'react-native';
import { eachDayMatrix, isSameMonth, isToday, formatDayNum } from './utils/date';
import EventChip from '../calendar/EventChip';
import { rescheduleEvent } from '../../lib/services/plannerClientWithOffline';
import { detectConflicts } from '../../lib/utils/conflictDetection';

// For web portal rendering
let ReactDOM;
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    ReactDOM = require('react-dom');
  } catch (e) {
    console.warn('ReactDOM not available for portal rendering');
  }
}

// Pastel colors for week row backgrounds (very faint tint - alternating for visual separation)
const WEEK_PASTEL_COLORS = [
  'rgba(245, 243, 255, 0.04)', // Week 1: faint lavender (slightly more visible)
  'rgba(250, 250, 250, 0.02)', // Week 2: very faint neutral (alternating pattern)
  'rgba(240, 253, 244, 0.04)', // Week 3: faint mint (slightly more visible)
  'rgba(250, 250, 250, 0.02)', // Week 4: very faint neutral (alternating pattern)
  'rgba(245, 243, 255, 0.04)', // Week 5: faint lavender (slightly more visible)
];

/** Local calendar YYYY-MM-DD — never use toISOString().split (UTC) for grid / cache keys */
function localCalendarYmd(d) {
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeEventTypeLower(ev) {
  const type = String(ev?.event_type || ev?.type || '').trim().toLowerCase();
  if (type) return type;
  const holidayType = String(ev?.holiday_type || ev?.holidayType || '').trim().toUpperCase();
  if (holidayType === 'CUSTOM_BREAK') return 'break';
  if (holidayType === 'CUSTOM_HOLIDAY' || holidayType === 'GLOBAL_HOLIDAY') return 'day off';
  return '';
}

function isBreakRangeEvent(ev) {
  const holidayType = String(ev?.holiday_type || ev?.holidayType || '').trim().toUpperCase();
  const type = normalizeEventTypeLower(ev);
  return type === 'break' || holidayType === 'CUSTOM_BREAK';
}

// Helper to filter out text nodes from children
const filterTextNodes = (children) => {
  return React.Children.toArray(children).filter(child => {
    if (typeof child === 'string' || typeof child === 'number') {
      console.warn('[MonthGrid] Filtered out text node:', child);
      return false;
    }
    return child != null;
  });
};

export default function MonthGrid({ date, events = [], selectedDate, onSelectDate, onEventPress, onEventRightClick, onEventComplete, blackoutDates = [], children = [], onSwitchToBoardView, onSwitchToBoardViewForDay, familyId = null, readOnly = false }) {
  // Validate date prop before using it
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    console.error('[MonthGrid] Invalid date prop:', date);
    // Return a fallback date (current month)
    const fallbackDate = new Date();
    fallbackDate.setDate(1); // First day of current month
    const matrix = eachDayMatrix(fallbackDate);
    return <View><Text>Invalid date</Text></View>; // Simple error display
  }
  
  const matrix = eachDayMatrix(date);
  const weekRowRefs = useRef({});
  const dayCellRefs = useRef({});
  const [draggedEventId, setDraggedEventId] = useState(null);
  const [dragOverDay, setDragOverDay] = useState(null);
  const [localDropOverride, setLocalDropOverride] = useState(null); // { eventId, updatedEvent } so event appears in new cell immediately
  const dragRef = useRef(null);
  const dragStateRef = useRef(new Map()); // Track drag state per event
  /** Day cell [data-day-date] where drag started — authoritative when event list has duplicate ids */
  const dragSourceDayIsoRef = useRef(null);
  
  // Apply week backgrounds via DOM manipulation for web
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      Object.keys(weekRowRefs.current).forEach((weekIndex) => {
        const element = weekRowRefs.current[weekIndex];
        if (element) {
          const weekColorIndex = parseInt(weekIndex) % WEEK_PASTEL_COLORS.length;
          const weekBackgroundColor = WEEK_PASTEL_COLORS[weekColorIndex];
          // Try multiple ways to access the DOM node
          let domNode = element._nativeNode || element;
          if (domNode && domNode.firstChild) {
            domNode = domNode.firstChild;
          }
          if (domNode && domNode.style) {
            domNode.style.backgroundColor = weekBackgroundColor;
            domNode.style.setProperty('background-color', weekBackgroundColor, 'important');
          }
        }
      });
      
      // Apply day-of-week backgrounds via DOM manipulation to override week backgrounds
      Object.keys(dayCellRefs.current).forEach((cellKey) => {
        const { element, isWeekend, isSel, isBlackout, dayOfWeek } = dayCellRefs.current[cellKey];
        if (element && !isSel && !isBlackout && dayOfWeek !== undefined) {
          let domNode = element._nativeNode || element;
          if (domNode && domNode.style) {
            // Day-of-week color palette (4% opacity - less opaque)
            const dayPastels = {
              0: 'rgba(255, 245, 245, 0.04)', // Sunday: Warmer peach tone
              1: 'rgba(240, 249, 255, 0.04)', // Monday: Sky blue
              2: 'rgba(245, 243, 255, 0.04)', // Tuesday: Lavender
              3: 'rgba(254, 252, 232, 0.04)', // Wednesday: Yellow
              4: 'rgba(240, 253, 244, 0.04)', // Thursday: Mint
              5: 'rgba(240, 249, 255, 0.04)', // Friday: Sky blue
              6: 'rgba(255, 245, 245, 0.04)', // Saturday: Warmer peach tone
            };
            const bgColor = dayPastels[dayOfWeek] || 'transparent';
            domNode.style.setProperty('background-color', bgColor, 'important');
          }
        }
      });
    }
  }, [matrix.length, selectedDate]);
  
  // Handle mouse-based drag start for events
  const handleMouseDragStart = useCallback((e, dragMeta, sourceDayIso) => {
    if (readOnly) return;
    if (typeof window === 'undefined' || Platform.OS !== 'web') return;
    const dragEventId = String(
      (dragMeta && typeof dragMeta === 'object' ? (dragMeta.eventId || dragMeta.id) : dragMeta) || ''
    ).trim();
    const originalEventId = String(
      (dragMeta && typeof dragMeta === 'object' ? (dragMeta.originalEventId || dragMeta._originalId) : '') || ''
    ).trim() || null;
    const dragDayIndex =
      dragMeta && typeof dragMeta === 'object' && Number.isFinite(Number(dragMeta.dayIndex))
        ? Number(dragMeta.dayIndex)
        : 0;
    const sourceEventId = originalEventId || dragEventId;
    if (!dragEventId) return;

    dragSourceDayIsoRef.current = null;
    if (sourceDayIso) {
      dragSourceDayIsoRef.current = String(sourceDayIso).trim().slice(0, 10);
    } else if (e?.currentTarget) {
      const node = e.currentTarget._nativeNode || e.currentTarget;
      if (node && typeof node.closest === 'function') {
        const cell = node.closest('[data-day-date]');
        const attr = cell && cell.getAttribute ? cell.getAttribute('data-day-date') : null;
        if (attr) dragSourceDayIsoRef.current = attr.trim().slice(0, 10);
      }
    }
    
    // Don't prevent default immediately - let the drag start naturally
    // Only prevent if we're actually dragging (not just clicking)
    const isDraggingRef = { current: false };
    const startX = e.clientX;
    const startY = e.clientY;
    const originalTarget = e.currentTarget;
    
    // Mark this event as potentially being dragged
    dragStateRef.current.set(dragEventId, { wasDragged: false });
    
    // Add mouse move handler immediately to detect drag
    const handleMouseMove = (moveEvent) => {
      // Check if mouse has moved enough to consider it a drag (not just a click)
      const deltaX = Math.abs(moveEvent.clientX - startX);
      const deltaY = Math.abs(moveEvent.clientY - startY);
      
      if (deltaX > 5 || deltaY > 5) {
        // This is a drag, not a click
        if (!isDraggingRef.current) {
          isDraggingRef.current = true;
          moveEvent.preventDefault();
          moveEvent.stopPropagation();
          setDraggedEventId(dragEventId);
          dragRef.current = originalTarget;
          
          // Force a visual update by directly manipulating the DOM element
          // Find the actual DOM node (React Native Web wraps it)
          let domNode = originalTarget;
          if (domNode._nativeNode) {
            domNode = domNode._nativeNode;
          }
          if (domNode && domNode.firstChild) {
            // Sometimes the View is wrapped, get the actual element
            const actualElement = domNode.firstChild || domNode;
            if (actualElement.style) {
              domNode = actualElement;
            }
          }
          
          if (domNode && domNode.style) {
            // Clone the element and append to body to avoid clipping by parent containers
            const clonedNode = domNode.cloneNode(true);
            clonedNode.id = `drag-ghost-${dragEventId}`;
            clonedNode.style.position = 'fixed';
            clonedNode.style.pointerEvents = 'none';
            clonedNode.style.opacity = '0.8';
            clonedNode.style.transform = 'scale(1.1) rotate(2deg)';
            clonedNode.style.zIndex = '99999';
            clonedNode.style.cursor = 'grabbing';
            clonedNode.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.2)';
            clonedNode.style.width = domNode.offsetWidth + 'px';
            clonedNode.style.height = domNode.offsetHeight + 'px';
            
            // Position it at the mouse cursor (center it on cursor)
            const rect = domNode.getBoundingClientRect();
            clonedNode.style.left = (moveEvent.clientX - rect.width / 2) + 'px';
            clonedNode.style.top = (moveEvent.clientY - rect.height / 2) + 'px';
            
            // Hide the original element
            domNode.style.opacity = '0.3';
            domNode.style.pointerEvents = 'none';
            
            // Append to body
            document.body.appendChild(clonedNode);
            
            // Store references
            originalTarget._dragDomNode = domNode;
            originalTarget._dragGhost = clonedNode;
          }
          
          // Mark that we dragged to prevent click
          const state = dragStateRef.current.get(dragEventId);
          if (state) {
            state.wasDragged = true;
          }
          
        }
      }
      
      // Only show visual feedback if we're actually dragging
      if (isDraggingRef.current) {
        // Update the dragged element's position to follow the cursor
        if (originalTarget && originalTarget._dragGhost) {
          const ghost = originalTarget._dragGhost;
          const rect = ghost.getBoundingClientRect();
          ghost.style.left = (moveEvent.clientX - rect.width / 2) + 'px';
          ghost.style.top = (moveEvent.clientY - rect.height / 2) + 'px';
        }
        
        // Find which day cell we're over for visual feedback
        const elementBelow = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY);
        if (elementBelow) {
          let dayCell = elementBelow.closest('[data-day-date]');
          if (!dayCell) {
            let parent = elementBelow.parentElement;
            let depth = 0;
            while (parent && parent !== document.body && depth < 10) {
              if (parent.getAttribute && parent.getAttribute('data-day-date')) {
                dayCell = parent;
                break;
              }
              parent = parent.parentElement;
              depth++;
            }
          }
          
          if (dayCell) {
            const targetDateIso = dayCell.getAttribute('data-day-date');
            setDragOverDay(targetDateIso);
          } else {
            setDragOverDay(null);
          }
        }
      }
    };
    
    // Store handlers to remove them later
    const mouseMoveHandler = handleMouseMove;
    
    const handleMouseUp = async (upEvent) => {
      document.removeEventListener('mousemove', mouseMoveHandler);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // If it was just a click (not a drag), trigger click manually
      if (!isDraggingRef.current) {
        dragSourceDayIsoRef.current = null;
        setDragOverDay(null);
        // Clear the drag flag immediately
        dragStateRef.current.delete(dragEventId);
        
        // Remove drag ghost and restore original element
        if (originalTarget) {
          if (originalTarget._dragGhost && originalTarget._dragGhost.parentNode) {
            originalTarget._dragGhost.parentNode.removeChild(originalTarget._dragGhost);
            delete originalTarget._dragGhost;
          }
          if (originalTarget._dragDomNode && originalTarget._dragDomNode.style) {
            originalTarget._dragDomNode.style.opacity = '';
            originalTarget._dragDomNode.style.pointerEvents = '';
          }
          delete originalTarget._dragDomNode;
        }
        
        // Click-open is handled by the chip's onClick handler.
        // Avoid double-opening event modals from both mouseup and click paths.
        return;
      }
      
      const dropStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
      console.log('[MonthGrid] [drag-timing] t+0ms MouseUp - was a drag, handling drop');
      
      // Remove drag ghost only; we'll restore original element only if drop is invalid (so valid drop doesn't flash event in old cell)
      const removeGhostOnly = () => {
        if (originalTarget && originalTarget._dragGhost && originalTarget._dragGhost.parentNode) {
          originalTarget._dragGhost.parentNode.removeChild(originalTarget._dragGhost);
          delete originalTarget._dragGhost;
        }
      };
      const restoreOriginalAndClear = () => {
        dragSourceDayIsoRef.current = null;
        if (originalTarget) {
          removeGhostOnly();
          if (originalTarget._dragDomNode && originalTarget._dragDomNode.style) {
            originalTarget._dragDomNode.style.opacity = '';
            originalTarget._dragDomNode.style.pointerEvents = '';
          }
          delete originalTarget._dragDomNode;
        }
        setDragOverDay(null);
        setDraggedEventId(null);
        dragRef.current = null;
        setTimeout(() => dragStateRef.current.delete(dragEventId), 50);
      };
      
      // This was a drag - handle the drop
      // Find which day cell we're over
      const elementBelow = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
      console.log('[MonthGrid] Element below cursor:', elementBelow);
      
      if (!elementBelow) {
        console.log('[MonthGrid] No element below cursor, canceling drag');
        restoreOriginalAndClear();
        return;
      }
      
      // Find the day cell (look for data-day-date or data-day-key attribute)
      let dayCell = null;
      let targetDateIso = null;
      
      // First try closest with data-day-date
      dayCell = elementBelow.closest('[data-day-date]');
      
      // If not found, walk up the DOM tree looking for data-day-date or data-day-key
      if (!dayCell) {
        let parent = elementBelow;
        let depth = 0;
        while (parent && parent !== document.body && depth < 15) {
          if (parent.getAttribute) {
            const dayDate = parent.getAttribute('data-day-date');
            const dayKey = parent.getAttribute('data-day-key');
            
            if (dayDate) {
              dayCell = parent;
              targetDateIso = dayDate;
              console.log('[MonthGrid] Found day cell at depth', depth, 'with date:', dayDate);
              break;
            } else if (dayKey) {
              // Found day key, look up the date from cellRefs
              const refData = dayCellRefs.current[dayKey];
              if (refData && refData.element) {
                // Get the date from the matrix
                const [weekIndex, dayIndex] = dayKey.split('-').map(Number);
                if (matrix[weekIndex] && matrix[weekIndex][dayIndex]) {
                  const day = matrix[weekIndex][dayIndex];
                  targetDateIso = localCalendarYmd(day);
                  dayCell = parent;
                  console.log('[MonthGrid] Found day cell by key at depth', depth, 'with date:', targetDateIso);
                  break;
                }
              }
            }
          }
          parent = parent.parentElement;
          depth++;
        }
      } else {
        targetDateIso = dayCell.getAttribute('data-day-date');
      }
      
      // If still not found, try to match by DOM element using cellRefs
      if (!dayCell && dayCellRefs.current) {
        for (const [key, refData] of Object.entries(dayCellRefs.current)) {
          if (refData && refData.element) {
            let refElement = refData.element;
            // Get the actual DOM node
            if (refElement._nativeNode) refElement = refElement._nativeNode;
            if (refElement.firstChild) {
              const firstChild = refElement.firstChild;
              if (firstChild === elementBelow || firstChild.contains(elementBelow) || elementBelow.contains(firstChild) || 
                  refElement === elementBelow || refElement.contains(elementBelow) || elementBelow.contains(refElement)) {
                // Found matching cell, get the date
                const [weekIndex, dayIndex] = key.split('-').map(Number);
                if (matrix[weekIndex] && matrix[weekIndex][dayIndex]) {
                  const day = matrix[weekIndex][dayIndex];
                  targetDateIso = localCalendarYmd(day);
                  dayCell = refElement;
                  console.log('[MonthGrid] Found day cell by DOM match with date:', targetDateIso);
                  break;
                }
              }
            }
          }
        }
      }
      
      console.log('[MonthGrid] Day cell found:', dayCell);
      console.log('[MonthGrid] Target date ISO:', targetDateIso);
      
      if (!dayCell || !targetDateIso) {
        console.log('[MonthGrid] [drag-timing] t+' + (typeof performance !== 'undefined' ? (performance.now() - dropStart).toFixed(0) : '?') + 'ms no day cell, abort');
        restoreOriginalAndClear();
        return;
      }
      
      console.log('[MonthGrid] [drag-timing] t+' + (typeof performance !== 'undefined' ? (performance.now() - dropStart).toFixed(0) : '?') + 'ms day cell found');
      // Find the event being dragged
      const event = events.find((ev) => String(ev.id) === String(sourceEventId))
        || events.find((ev) => String(ev.id) === String(dragEventId));
      console.log('[MonthGrid] Event found:', event);
      
      if (!event) {
        restoreOriginalAndClear();
        return;
      }

      // Source day: DOM cell where drag started (fixes duplicate id + wrong events.find order)
      const domSourceDay = dragSourceDayIsoRef.current;
      dragSourceDayIsoRef.current = null;
      const previousDateLocal =
        (domSourceDay && String(domSourceDay).trim().slice(0, 10)) ||
        (() => {
          if (event.date_local) return String(event.date_local).trim().slice(0, 10);
          const ts = event.start_ts || event.start;
          if (!ts) return null;
          const d = new Date(ts);
          if (isNaN(d.getTime())) return null;
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        })();
      
      {
          // Get original event times - prefer start_ts/end_ts as they are guaranteed ISO strings
          const startTs = event.start_ts || event.start;
          const endTs = event.end_ts || event.end;
          
          if (!startTs || !endTs) {
            console.error('[MonthGrid] Event missing start_ts or end_ts:', event);
            return;
          }
          
          // Parse original times as UTC ISO strings
          const originalStart = new Date(startTs);
          const originalEnd = new Date(endTs);
          
          if (isNaN(originalStart.getTime()) || isNaN(originalEnd.getTime())) {
            console.error('[MonthGrid] Invalid event timestamps:', { startTs, endTs });
            return;
          }
          
          const durationMs = originalEnd.getTime() - originalStart.getTime();
          
          // Extract LOCAL time components from original start (not UTC)
          // This preserves the displayed time, not the UTC time
          const originalHours = originalStart.getHours();
          const originalMinutes = originalStart.getMinutes();
          const originalSeconds = originalStart.getSeconds();
          const originalMilliseconds = originalStart.getMilliseconds();
          
          console.log('[MonthGrid] Time preservation:', {
            startTs,
            originalStartISO: originalStart.toISOString(),
            originalLocalHours: originalHours,
            originalLocalMinutes: originalMinutes,
            originalUTCHours: originalStart.getUTCHours(),
            originalUTCMinutes: originalStart.getUTCMinutes(),
            targetDateIso,
            timezoneOffset: originalStart.getTimezoneOffset()
          });
          
          // Parse destination date and create new date with preserved local time
          // Use Date constructor with explicit local time components (most reliable)
          const [year, month, day] = targetDateIso.split('-').map(Number);
          
          // Create date using local time constructor: new Date(year, month, day, hours, minutes, seconds, ms)
          // This explicitly creates a date in the local timezone
          let newStart = new Date(year, month - 1, day, originalHours, originalMinutes, originalSeconds, originalMilliseconds);
          if (isBreakRangeEvent(event) && dragDayIndex > 0) {
            // Keep dragged in-range day anchored on the drop target.
            newStart = new Date(newStart);
            newStart.setDate(newStart.getDate() - dragDayIndex);
          }
          
          if (isNaN(newStart.getTime())) {
            console.error('[MonthGrid] Invalid destination date:', targetDateIso);
            return;
          }
          
            // Mark drag-and-drop time FIRST to prevent immediate refreshes
            // This must happen before any event dispatches or API calls
            if (typeof window !== 'undefined') {
              if (window.__lastDragDropTime !== undefined) {
                window.__lastDragDropTime = Date.now();
                console.log('[MonthGrid] Marked drag-and-drop time to prevent immediate refresh');
              }
            }
            
          console.log('[MonthGrid] New time set:', {
            newStartISO: newStart.toISOString(),
            newStartLocalHours: newStart.getHours(),
            newStartLocalMinutes: newStart.getMinutes(),
            newStartUTCHours: newStart.getUTCHours(),
            newStartUTCMinutes: newStart.getUTCMinutes(),
            preservedLocalTime: `${originalHours}:${originalMinutes}`,
            targetDateIso
          });
            
            // Compute new end time: add original duration
            const newEnd = new Date(newStart.getTime() + durationMs);
            
            // Get familyId from event if not provided
            const eventFamilyId = familyId || event.family_id || event.familyId;
            
            // Optimistically update the event in the local events array
            // This makes the UI update immediately without waiting for the API call
            // CRITICAL: Set date_local to the new date so the event appears in the correct day
            const newDateLocal = localCalendarYmd(newStart) || targetDateIso;
          
          // Format local time strings for display (HH:MM format)
          // CRITICAL: Use getHours() and getMinutes() which return LOCAL time components
          // These are already in the user's local timezone because we created newStart using local time constructor
          const localStartHours = String(newStart.getHours()).padStart(2, '0');
          const localStartMinutes = String(newStart.getMinutes()).padStart(2, '0');
          const localEndHours = String(newEnd.getHours()).padStart(2, '0');
          const localEndMinutes = String(newEnd.getMinutes()).padStart(2, '0');
          const startLocalTime = `${localStartHours}:${localStartMinutes}`;
          const endLocalTime = `${localEndHours}:${localEndMinutes}`;
          
            const updatedEvent = {
              ...event,
            start_ts: newStart.toISOString(), // UTC ISO string for API
            end_ts: newEnd.toISOString(), // UTC ISO string for API
              start: newStart.toISOString(),
              end: newEnd.toISOString(),
            start_local: startLocalTime, // Local time string (HH:MM) for display - CRITICAL for EventChip
            end_local: endLocalTime, // Local time string (HH:MM) for display
              date_local: newDateLocal, // CRITICAL: Set date_local to new date
            // Ensure child_id is preserved (may be nested or have different name)
            child_id: event.child_id || event.childId || event.student_id,
            // Also set time property for backward compatibility
            time: startLocalTime,
          };
          
          const tPreGhost = typeof performance !== 'undefined' ? performance.now() : dropStart;
          // Snap ghost to target cell position instantly (fixed over cell rect) so chip appears there without waiting for React
          let dayCellEl = dayCell && (dayCell.getBoundingClientRect ? dayCell : (dayCell._nativeNode || dayCell));
          if (Platform.OS === 'web' && !dayCellEl && targetDateIso && typeof document !== 'undefined') {
            dayCellEl = document.querySelector('[data-day-date="' + targetDateIso + '"]');
          }
          if (Platform.OS === 'web' && originalTarget && originalTarget._dragGhost && dayCellEl) {
            const ghost = originalTarget._dragGhost;
            const rect = dayCellEl.getBoundingClientRect ? dayCellEl.getBoundingClientRect() : null;
            if (rect && rect.width > 0 && rect.height > 0) {
              // Keep ghost on body; position it fixed over the target cell (below day number ~40px)
              const topOffset = 40;
              ghost.style.position = 'fixed';
              ghost.style.left = rect.left + 'px';
              ghost.style.top = (rect.top + topOffset) + 'px';
              ghost.style.width = Math.max(rect.width - 16, 40) + 'px'; // padding
              ghost.style.height = ''; // auto
              ghost.style.transform = '';
              ghost.style.opacity = '1';
              ghost.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)';
              ghost.style.cursor = 'default';
              ghost.style.pointerEvents = 'none';
              const removeGhostAfterPaint = () => {
                if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
                delete originalTarget._dragGhost;
              };
              requestAnimationFrame(() => requestAnimationFrame(removeGhostAfterPaint));
            } else {
              removeGhostOnly();
            }
          } else {
            removeGhostOnly();
          }
          console.log('[MonthGrid] [drag-timing] t+' + (typeof performance !== 'undefined' ? (performance.now() - dropStart).toFixed(0) : '?') + 'ms ghost snap done');
          dragRef.current = null;
          const applyDrop = () => {
            setLocalDropOverride({ eventId: sourceEventId, updatedEvent });
            setDragOverDay(null);
            setDraggedEventId(null);
          };
          if (Platform.OS === 'web' && ReactDOM && typeof ReactDOM.flushSync === 'function') {
            try {
              ReactDOM.flushSync(applyDrop);
            } catch (_) {
              applyDrop();
            }
          } else {
            applyDrop();
          }
          console.log('[MonthGrid] [drag-timing] t+' + (typeof performance !== 'undefined' ? (performance.now() - dropStart).toFixed(0) : '?') + 'ms applyDrop (flushSync) done');
          setTimeout(() => dragStateRef.current.delete(dragEventId), 50);
          if (originalTarget) {
            if (originalTarget._dragDomNode && originalTarget._dragDomNode.style) {
              originalTarget._dragDomNode.style.opacity = '';
              originalTarget._dragDomNode.style.pointerEvents = '';
            }
            delete originalTarget._dragDomNode;
          }
          
          // Log only if there's a potential issue with time preservation
          if (newStart.getHours() !== originalHours || newStart.getMinutes() !== originalMinutes) {
            console.warn('[MonthGrid] Time mismatch detected:', {
              eventId: updatedEvent.id,
              originalHours,
              originalMinutes,
              newStartLocalHours: newStart.getHours(),
              newStartLocalMinutes: newStart.getMinutes(),
              start_local: updatedEvent.start_local,
            });
          }
            
            // Notify parent and start API so calendar state stays in sync; ghost already snapped to target cell for instant visual
            if (typeof window !== 'undefined') {
              const localConflictCount = detectConflicts(updatedEvent, events || []);
              console.log('[MonthGrid] [drag-timing] t+' + (typeof performance !== 'undefined' ? (performance.now() - dropStart).toFixed(0) : '?') + 'ms dispatching eventRescheduled');
              window.dispatchEvent(new CustomEvent('eventRescheduled', {
                detail: { eventId: sourceEventId, updatedEvent, dropStartTime: dropStart, previousDateLocal, localConflictCount }
              }));
              if (localConflictCount > 0) {
                console.log('[MonthGrid] Local conflict detected after drop - deferring to conflict banner flow');
              }
              rescheduleEvent(
              sourceEventId,
              newStart.toISOString(),
              newEnd.toISOString(),
              'drag_drop',
              'manual move',
              eventFamilyId
            ).then((result) => {
            console.log('[MonthGrid] [drag-timing] t+' + (typeof performance !== 'undefined' ? (performance.now() - dropStart).toFixed(0) : '?') + 'ms rescheduleEvent API result');
            console.log('[MonthGrid] Reschedule result:', { 
              hasError: !!(result && result.error), 
              error: result?.error,
              errorStatus: result?.error?.status,
              errorMessage: result?.error?.message,
              targetDateIso,
              originalDate: event.start_ts || event.start || event.start_local
            });
            
              if (result && result.error) {
              // Check if it's a conflict error specifically
              const errorMessage = result.error.message || '';
              const errorStatus = result.error.status;
              
              // Check if this is a drag to the same day (likely a conflict if 500 error)
              const originalDateStr = (event.start_ts || event.start || event.start_local || '').split('T')[0];
              const isSameDay = targetDateIso === originalDateStr;
              
              // Check if error message contains permission error (might mask overlap)
              const isPermissionError = errorMessage.toLowerCase().includes('permission') || 
                                       errorMessage.toLowerCase().includes('42501');
              
              const isConflict = result.error.isConflict || 
                                errorStatus === 409 ||
                                errorMessage.toLowerCase().includes('overlap') ||
                                errorMessage.toLowerCase().includes('conflict') ||
                                errorMessage.toLowerCase().includes('exclusion') ||
                                (errorStatus === 500 && (isSameDay || isPermissionError)); // Treat 500 on same day or permission error as potential conflict
              
              console.log('[MonthGrid] Error analysis:', {
                isConflict,
                errorStatus,
                errorMessage,
                hasIsConflictFlag: result.error.isConflict,
                isSameDay,
                targetDateIso,
                originalDateStr
              });
              
              if (isConflict) {
                console.log('[MonthGrid] Conflict detected - keeping optimistic update, conflict banner will appear');
                // Dispatch eventRescheduled to trigger conflict detection in WebContent
                // This will check for actual overlaps even if API failed
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('eventRescheduled', {
                    detail: { eventId: sourceEventId, updatedEvent, apiError: result.error, previousDateLocal }
                  }));
                }
                // DO NOT revert optimistic update or force refresh here for conflicts
              } else {
                // For non-conflict errors, still try to detect conflicts in case error is masking an overlap
                // This is especially important for permission errors that might hide actual conflicts
                if (errorStatus === 500 && isSameDay) {
                  console.log('[MonthGrid] 500 error on same day - checking for conflicts anyway');
                  // Dispatch eventRescheduled to trigger conflict detection
                  // Pass apiError so conflict detection can revert if no conflicts found
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('eventRescheduled', {
                      detail: { eventId: sourceEventId, updatedEvent, apiError: result.error, previousDateLocal }
                    }));
                  }
                  // Don't revert yet - let conflict detection decide
                } else {
                  // For 500 errors (likely backend/permission issues), keep optimistic update visible
                  // and let WebContent handle it (it will show error message but keep update visible)
                  if (errorStatus === 500) {
                    console.log('[MonthGrid] 500 error - keeping optimistic update visible, letting WebContent handle error');
                    // Dispatch eventRescheduled with apiError so WebContent can show error but keep update visible
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('eventRescheduled', {
                        detail: { eventId: sourceEventId, updatedEvent, apiError: result.error, previousDateLocal }
                      }));
                    }
                    // Don't revert - let WebContent handle it
                  } else if (errorStatus === 400) {
                    // For 400 errors, check if it's outside_availability or a conflict
                    // Let WebContent run conflict detection first before reverting
                    const errorMessage = result.error?.message || '';
                    if (errorMessage.includes('outside_availability')) {
                      console.log('[MonthGrid] Outside availability error - showing message and letting WebContent handle');
                      // Show user-friendly message
                      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof Alert !== 'undefined') {
                        Alert.alert(
                          'Cannot Move Event',
                          'The selected time is outside the available time blocks for this child on this date. Please choose a different time.',
                          [{ text: 'OK' }]
                        );
                      }
                    }
                    // Dispatch eventRescheduled to trigger conflict detection
                    // WebContent will decide whether to keep the optimistic update or revert
                    console.log('[MonthGrid] 400 error - dispatching eventRescheduled for conflict detection');
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('eventRescheduled', {
                        detail: { eventId: sourceEventId, updatedEvent, apiError: result.error, previousDateLocal }
                      }));
                    }
                    // Don't revert immediately - let conflict detection decide
                  } else {
                    // For other errors (not found, etc.), revert the optimistic update
                    console.error('[MonthGrid] Non-conflict error - reverting optimistic update:', result.error);
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('eventRescheduleError', {
                        detail: { eventId: sourceEventId, originalEvent: event, error: result.error }
                      }));
                      // Force a refresh to revert the optimistic update
                      window.dispatchEvent(new CustomEvent('refreshCalendar'));
                    }
                  }
                }
                }
              } else {
                // Sync completed successfully - trigger conflict detection
                // Even though the save succeeded, there might be conflicts that need to be shown
                console.log('[MonthGrid] Reschedule SUCCESS - event saved:', {
                  eventId: sourceEventId,
                  targetDate: targetDateIso,
                  hasData: !!result?.data,
                  data: result?.data
                });
                
                // Patch calendar state from API so WebContent can skip full refetch (reduces delay)
                if (typeof window !== 'undefined' && result?.data) {
                  window.dispatchEvent(new CustomEvent('eventRescheduled', {
                    detail: { eventId: sourceEventId, updatedEvent: result.data, fromApi: true, dropStartTime: dropStart }
                  }));
                }
                // Refresh only after API success so we never race the first drop with an early refetch
                if (typeof window !== 'undefined') {
                  const oldDate = new Date(event.start_ts || event.start || event.start_local);
                  const newDate = newStart;
                  const oldMonth = oldDate.getMonth();
                  const oldYear = oldDate.getFullYear();
                  const newMonth = newDate.getMonth();
                  const newYear = newDate.getFullYear();
                  window.dispatchEvent(new CustomEvent('refreshCalendar', {
                    detail: {
                      skipHomeRefresh: true,
                      targetMonth: newMonth,
                      targetYear: newYear,
                      eventId: sourceEventId,
                      dropStartTime: dropStart,
                    }
                  }));
                  if (oldMonth !== newMonth || oldYear !== newYear) {
                    setTimeout(() => {
                      window.dispatchEvent(new CustomEvent('refreshCalendar', {
                        detail: {
                          skipHomeRefresh: true,
                          targetMonth: oldMonth,
                          targetYear: oldYear,
                          eventId: sourceEventId,
                          dropStartTime: dropStart,
                        }
                      }));
                    }, 50);
                  }
                }
              }
            }).catch((err) => {
              console.error('[MonthGrid] Error rescheduling event:', err);
              // For 500 errors (likely backend/permission issues), keep optimistic update visible
              // and let WebContent handle it
              const errorStatus = err?.status || 500;
              if (errorStatus === 500) {
                console.log('[MonthGrid] 500 error in catch - keeping optimistic update visible, letting WebContent handle error');
                // Dispatch eventRescheduled with apiError so WebContent can show error but keep update visible
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('eventRescheduled', {
                    detail: { eventId: sourceEventId, updatedEvent, apiError: err, previousDateLocal }
                  }));
                }
              } else {
                // For other errors, revert the optimistic update
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('eventRescheduleError', {
                    detail: { eventId: sourceEventId, originalEvent: event, error: err }
                  }));
                  // Force a refresh to revert
                  window.dispatchEvent(new CustomEvent('refreshCalendar'));
                }
              }
            });
            }
      }
      
      // When drop was invalid (no day cell), clear drag state on next tick; when valid we already cleared above
      const clearDragState = () => {
        setDragOverDay(null);
        setDraggedEventId(null);
        dragRef.current = null;
        setTimeout(() => dragStateRef.current.delete(dragEventId), 50);
      };
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(clearDragState);
      } else {
        setTimeout(clearDragState, 0);
      }
    };
    
    // Add event listeners
    document.addEventListener('mousemove', mouseMoveHandler, { passive: false });
    document.addEventListener('mouseup', handleMouseUp, { once: false });
  }, [events, familyId, onEventPress, readOnly]);
  
  // Convert blackout dates to Set for fast lookup
  const blackoutDatesSet = new Set(blackoutDates.map(d => {
    if (typeof d === 'string') return d;
    return localCalendarYmd(d) || '';
  }));

  // Expand range events so each day renders a chip in month view.
  const expandedEvents = useMemo(() => {
    const expanded = [];
    const seenIds = new Set();
    
    for (const ev of events) {
      if (!ev || !ev.id) continue;
      if (seenIds.has(ev.id)) continue;
      seenIds.add(ev.id);
      
      // Expand Project and Break ranges.
      if ((ev.event_type === 'Project' || isBreakRangeEvent(ev)) && ev.start_ts && ev.end_ts) {
        const startDate = new Date(ev.start_ts);
        const endDate = new Date(ev.end_ts);
        
        if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
          // Calculate days difference - use date-only comparison to get accurate day count
          const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
          const daysDiff = Math.round((endDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24));
          
          // Keep bounded for safety on malformed data.
          if (daysDiff >= 0 && daysDiff <= 120) {
            // Create a copy for each day from start to end (inclusive)
            for (let i = 0; i <= daysDiff; i++) {
              const dayDate = new Date(startDateOnly);
              dayDate.setDate(startDateOnly.getDate() + i);
              
              // Create expanded event with date_local set to the specific day
              const year = dayDate.getFullYear();
              const month = String(dayDate.getMonth() + 1).padStart(2, '0');
              const day = String(dayDate.getDate()).padStart(2, '0');
              const dateLocal = `${year}-${month}-${day}`;
              
              const expandedEvent = {
                ...ev,
                id: `${ev.id}-day-${i}`, // Unique ID for each day instance
                _originalId: ev.id, // Keep reference to original
                _dayIndex: i,
                date_local: dateLocal, // Set date_local for the specific day
              };
              expanded.push(expandedEvent);
            }
            continue; // Skip adding the original event
          }
        }
      }
      
      // For non-range events, add as-is.
      expanded.push(ev);
    }
    
    return expanded;
  }, [events]);

  // Apply local drop override so the moved event appears in the new cell immediately (no wait for parent re-render)
  const effectiveExpandedEvents = useMemo(() => {
    if (!localDropOverride) return expandedEvents;
    const { eventId, updatedEvent } = localDropOverride;
    const filtered = expandedEvents.filter(
      (e) => e && e.id !== eventId && (!e._originalId || e._originalId !== eventId)
    );
    return [...filtered, updatedEvent];
  }, [expandedEvents, localDropOverride]);

  // Clear local override once parent has the event at the new position, or after 3s fallback
  useEffect(() => {
    if (!localDropOverride) return;
    const { eventId, updatedEvent } = localDropOverride;
    const targetDate = updatedEvent.date_local;
    const localDayKey = (ts) => {
      if (!ts) return null;
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return null;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    const hasFromParent = events.some(
      (e) =>
        e &&
        e.id === eventId &&
        (e.date_local === targetDate || localDayKey(e.start_ts || e.start) === targetDate)
    );
    if (hasFromParent) {
      setLocalDropOverride(null);
      return;
    }
    const t = setTimeout(() => setLocalDropOverride(null), 3000);
    return () => clearTimeout(t);
  }, [events, localDropOverride]);

  // Event bucketing by day with deduplication
  const byDay = new Map();
  const seenIds = new Set();
  
  // Deduplicate events by ID first (using expanded events, with local override applied)
  const uniqueEvents = effectiveExpandedEvents.filter(ev => {
    if (!ev || !ev.id) return false;
    if (seenIds.has(ev.id)) {
      console.warn('[MonthGrid] Duplicate event ID:', ev.id, ev.title);
      return false;
    }
    seenIds.add(ev.id);
    return true;
  });
  
  for (const ev of uniqueEvents) {
    // Use date_local if available (from SQL query, format: "YYYY-MM-DD")
    // This avoids timezone issues when grouping events by day
    let d;
    if (ev.date_local) {
      // Parse date_local as local date (YYYY-MM-DD format)
      const [year, month, day] = ev.date_local.split('-').map(Number);
      d = new Date(year, month - 1, day); // month is 0-indexed
    } else {
      // Fallback to timestamp fields
      const eventDateStr = ev.start || ev.start_ts || ev.start_at || ev.start_local;
      if (!eventDateStr) {
        console.warn('[MonthGrid] Event missing start date:', ev.id, ev.title);
        continue;
      }
      d = new Date(eventDateStr);
    }
    
    if (Number.isNaN(d.getTime())) {
      console.warn('[MonthGrid] Invalid date for event:', ev.id, ev.date_local || ev.start || ev.start_ts);
      continue;
    }
    const key = d.toDateString();
    
    // Removed verbose logging - only log warnings/errors
    // Debug logging for ELA events
    // if (ev.title && ev.title.toLowerCase().includes('ela')) {
    //   const today = new Date();
    //   const todayKey = today.toDateString();
    //   console.log('[MonthGrid] ELA event found:', {
    //     id: ev.id,
    //     title: ev.title,
    //     status: ev.status,
    //     date_local: ev.date_local,
    //     start_ts: ev.start_ts,
    //     parsedDate: d.toISOString(),
    //     dateKey: key,
    //     todayKey: todayKey,
    //     matchesToday: key === todayKey,
    //     child_id: ev.child_id || ev.childId || ev.student_id,
    //     subject: ev.subject_name || ev.subjectName || ev.subject,
    //     willBeAddedToDay: key
    //   });
    // }
    
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(ev);
    
  }

  const isPublicHolidayEvent = (ev) =>
    String(ev?.holiday_type || ev?.holidayType || '').toUpperCase() === 'GLOBAL_HOLIDAY';

  return (
    <View style={{ 
      flex: 1,
      backgroundColor: 'transparent',
      overflow: 'hidden', 
      borderRadius: 0, // No rounded corners
      // No outer border - only grid lines visible
      margin: 0,
      ...(Platform.OS === 'web' && {
        isolation: 'isolate',
      }),
    }}>
      {/* Day Headers */}
      <View style={{ flexDirection: 'row', backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, index) => {
          return (
            <View key={d} style={{ 
              flex: 1, 
              borderRightWidth: index < 6 ? 1 : 0,
              borderRightColor: '#F3F4F6', // Hairline grid
              paddingHorizontal: 16, 
              paddingVertical: 12,
              backgroundColor: 'transparent',
            }}>
              <Text style={{ 
                fontSize: 10, 
                fontWeight: '500',
                color: '#6B7280', 
                textAlign: 'center',
                textTransform: 'uppercase',
                ...(Platform.OS === 'web' && {
                  fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  letterSpacing: '0.1em', // More spacing
                }),
              }}>{d.toUpperCase()}</Text>
            </View>
          );
        })}
      </View>
      
      {/* Calendar Grid */}
      <View style={{ 
        flex: 1,
        backgroundColor: 'transparent',
        ...(Platform.OS === 'web' && {
          isolation: 'isolate',
        }),
      }}>
        {matrix.map((week, i) => {
          // Safety: Filter out any invalid weeks
          if (!week || !Array.isArray(week)) return null;
          // Rotate through pastel colors for each week
          const weekColorIndex = i % WEEK_PASTEL_COLORS.length;
          const weekBackgroundColor = WEEK_PASTEL_COLORS[weekColorIndex];
          const weekRowRef = (ref) => {
            if (ref) {
              weekRowRefs.current[i] = ref;
            }
          };
          
          return (
            <View 
              ref={weekRowRef}
              key={i} 
              style={{ 
                flex: 1,
                flexDirection: 'row',
                backgroundColor: weekBackgroundColor,
                position: 'relative',
                minHeight: 0,
                paddingBottom: i < matrix.length - 1 ? 4 : 0, // Extra vertical spacing between weeks
              }}
            >
              {week.map((day, j) => {
              // Validate day is a valid date before using date methods
              if (!day || !(day instanceof Date) || isNaN(day.getTime())) {
                console.error('[MonthGrid] Invalid day in matrix:', day);
                return null; // Skip invalid days
              }
              
              const inMonth = isSameMonth(day, date);
              const k = day.toDateString();
              // Use local date components to avoid timezone shifts
              const year = day.getFullYear();
              const month = String(day.getMonth() + 1).padStart(2, '0');
              const dayNum = String(day.getDate()).padStart(2, '0');
              const dayDateStr = `${year}-${month}-${dayNum}`;
              const isBlackout = blackoutDatesSet.has(dayDateStr);
              const dayEvents = isBlackout ? [] : (byDay.get(k) ?? []); // No events on blackout days
              
              // Removed verbose logging - only log warnings/errors
              // Debug: Log if this is today and we have events
              // if (isToday(day) && dayEvents.length > 0) {
              //   console.log('[MonthGrid] Today has events:', {
              //     dayKey: k,
              //     dayDateStr,
              //     eventCount: dayEvents.length,
              //     events: dayEvents.map(e => ({ id: e.id, title: e.title, date_local: e.date_local }))
              //   });
              // }
              const isSel = selectedDate && selectedDate instanceof Date && !isNaN(selectedDate.getTime()) && day.toDateString() === selectedDate.toDateString();
              const isFirstDayOfMonth = day.getDate() === 1;
              const dayOfWeek = day.getDay(); // 0 = Sunday, 6 = Saturday
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // Sunday (0) or Saturday (6)
              
              // Event density scaling logic
              const validEvents = dayEvents
                .filter((ev) => ev && typeof ev === 'object')
                .map((ev) => {
                  const fallbackTitle = ev.title || ev.subject_name || ev.subjectName || ev.event_type || ev.type || 'Lesson';
                  const normalizedTitle = String(fallbackTitle).trim();
                  return {
                    ...ev,
                    title: normalizedTitle && normalizedTitle !== 'undefined' && normalizedTitle !== 'null'
                      ? normalizedTitle
                      : 'Lesson',
                  };
                })
                .sort((a, b) => {
                  const aPublicHoliday = isPublicHolidayEvent(a);
                  const bPublicHoliday = isPublicHolidayEvent(b);
                  if (aPublicHoliday !== bPublicHoliday) return aPublicHoliday ? -1 : 1;
                  const aTime = String(a.start_local || a.time || a.start_ts || '');
                  const bTime = String(b.start_local || b.time || b.start_ts || '');
                  return aTime.localeCompare(bTime);
                });
              const eventCount = validEvents.length;
              
              // Show up to 2 events, then "+X more" if needed
              const maxEventsToShow = 2;
              const eventsToShow = validEvents.slice(0, maxEventsToShow);
              const remainingCount = eventCount > maxEventsToShow ? eventCount - maxEventsToShow : 0;
              
              const isTodayDay = isToday(day);
              
              // Day-of-week color coding (5-8% opacity)
              // Day of week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat (already declared above)
              let backgroundColor = 'transparent';
              let borderColor = 'transparent';
              let hoverBackgroundColor = 'transparent';
              
              // Day-of-week color palette (4% opacity - less opaque)
              const dayPastels = {
                0: 'rgba(255, 245, 245, 0.04)', // Sunday: Warmer peach tone
                1: 'rgba(240, 249, 255, 0.04)', // Monday: Sky blue
                2: 'rgba(245, 243, 255, 0.04)', // Tuesday: Lavender
                3: 'rgba(254, 252, 232, 0.04)', // Wednesday: Yellow
                4: 'rgba(240, 253, 244, 0.04)', // Thursday: Mint
                5: 'rgba(240, 249, 255, 0.04)', // Friday: Sky blue
                6: 'rgba(255, 245, 245, 0.04)', // Saturday: Warmer peach tone
              };
              
              // Hover state: slightly brighter version of day color (6% opacity)
              const dayHoverColors = {
                0: 'rgba(255, 245, 245, 0.06)', // Sunday hover
                1: 'rgba(240, 249, 255, 0.06)', // Monday hover
                2: 'rgba(245, 243, 255, 0.06)', // Tuesday hover
                3: 'rgba(254, 252, 232, 0.06)', // Wednesday hover
                4: 'rgba(240, 253, 244, 0.06)', // Thursday hover
                5: 'rgba(240, 249, 255, 0.06)', // Friday hover
                6: 'rgba(255, 245, 245, 0.06)', // Saturday hover
              };
              
              if (isTodayDay) {
                // Today: bold border around the cell
                backgroundColor = 'transparent';
                borderColor = '#111827'; // Bold dark border
                hoverBackgroundColor = 'rgba(15, 23, 42, 0.02)'; // Subtle hover
              } else if (isBlackout) {
                // Blackout: keep red background
                backgroundColor = '#fef2f2';
                hoverBackgroundColor = '#fef2f2';
              } else {
                // Apply day-of-week color coding
                backgroundColor = dayPastels[dayOfWeek] || 'transparent';
                hoverBackgroundColor = dayHoverColors[dayOfWeek] || backgroundColor;
              }
              
              const cellKey = `${i}-${j}`;
              const cellRef = (ref) => {
                if (ref && Platform.OS === 'web') {
                  dayCellRefs.current[cellKey] = {
                    element: ref,
                    isWeekend,
                    isSel,
                    isBlackout,
                    dayOfWeek,
                  };
                }
              };
              
              const dayDateIso = localCalendarYmd(day); // local YYYY-MM-DD (must match cache keys)
              const isDragOver = dragOverDay === dayDateIso;
              
              return (
                <TouchableOpacity
                  key={cellKey}
                  ref={cellRef}
                  onPress={() => {
                    // Only call onSelectDate if the day is in the current month
                    // This prevents jumping to a different month when clicking on days from adjacent months
                    if (inMonth) {
                      if (onSelectDate) onSelectDate(day);
                    }
                  }}
                  {...(Platform.OS === 'web' && {
                    'data-day-date': dayDateIso,
                    'data-day-key': cellKey,
                  })}
                  style={{ 
                    flex: 1, 
                    height: '100%',
                    borderRightWidth: j < 6 ? 1 : 0, // Hairline grid
                    borderRightColor: '#F3F4F6', // Subtle border
                    borderBottomWidth: i < matrix.length - 1 ? 1 : 0,
                    borderBottomColor: '#F3F4F6',
                    borderTopWidth: 0,
                    borderTopColor: 'transparent',
                    borderLeftWidth: 0,
                    borderLeftColor: 'transparent',
                    padding: 8,
                    paddingTop: 8,
                    paddingBottom: 8,
                    backgroundColor: isDragOver ? 'rgba(79, 70, 229, 0.1)' : backgroundColor,
                    borderWidth: isDragOver ? 2 : (isTodayDay ? 2 : 0),
                    borderColor: isDragOver ? '#4F46E5' : (isTodayDay ? borderColor : 'transparent'),
                    opacity: isBlackout ? 0.5 : 1,
                    overflow: 'hidden',
                    position: 'relative',
                    zIndex: isSel ? 2 : 1,
                    minHeight: 114, // Increased by 14% from 100
                    borderRadius: 0, // No rounded corners
                    ...(Platform.OS === 'web' && {
                      // Transition removed - CSS-only property not supported in React Native
                      cursor: 'pointer',
                    }),
                  }}
                  {...(Platform.OS === 'web' && {
                    onMouseEnter: (e) => {
                      if (!isToday(day) && !isSel && !isBlackout) {
                        // Hover: very subtle (1-2% opacity change)
                        e.currentTarget.style.backgroundColor = hoverBackgroundColor;
                      }
                    },
                    onMouseLeave: (e) => {
                      if (!isToday(day) && !isSel && !isBlackout) {
                        e.currentTarget.style.backgroundColor = backgroundColor;
                      }
                    },
                  })}
                >
                  <Text style={{ 
                    marginBottom: 4,
                    paddingTop: 2, // Soft top padding under date number
                    fontSize: 16, 
                    color: isTodayDay
                      ? '#FFFFFF'
                      : (!inMonth ? '#9CA3AF' : (isBlackout ? '#DC2626' : '#111827')),
                    fontWeight: '400',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                      letterSpacing: '-0.02em', // Tighter, more editorial
                    }),
                    ...(isTodayDay && {
                      backgroundColor: '#111827',
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      overflow: 'hidden',
                      alignSelf: 'flex-start',
                    }),
                  }}>
                    {formatDayNum(day)}
                  </Text>
                  
                  {/* Blackout indicator */}
                  {isBlackout && inMonth && (
                    <View style={{
                      backgroundColor: '#fee2e2',
                      borderRadius: 4,
                      paddingHorizontal: 4,
                      paddingVertical: 2,
                      marginBottom: 2,
                      alignSelf: 'flex-start'
                    }}>
                      <Text style={{
                        fontSize: 8,
                        color: '#dc2626',
                        fontWeight: '600'
                      }}>
                        OFF
                      </Text>
                    </View>
                  )}
                  
                  {/* Event Chips Container */}
                  <View style={{ 
                    flexDirection: 'column',
                    justifyContent: 'flex-start',
                    gap: 0,
                    minHeight: 0,
                    marginTop: 6, // Events start slightly lower in the cell
                  }}>
                    {/* Show events that fit */}
                    {(() => {
                      // Debug: Log if we have events to show but they're not rendering
                      if (eventsToShow.length > 0 && isToday(day)) {
                        // Removed verbose logging - only log warnings/errors
                        // console.log('[MonthGrid] Rendering events for today:', {
                        //   dayKey: k,
                        //   eventsToShowCount: eventsToShow.length,
                        //   events: eventsToShow.map(e => ({ id: e.id, title: e.title }))
                        // });
                      }
                      return eventsToShow
                        .filter(ev => ev && typeof ev === 'object' && ev !== null)
                        .map((ev, index) => {
                        const isDragging = draggedEventId === ev.id;
                        const isHoliday = (ev.event_type || ev.type || '').toLowerCase() === 'holiday';
                        const isPublicHoliday = isPublicHolidayEvent(ev);
                        const canDrag = !readOnly && ev.status !== 'done' && !isBlackout && !isHoliday;
                        
                        if (Platform.OS === 'web') {
                          // Web: always use web handlers so context menu works on done events too.
                          // Drag start itself still respects canDrag.
                          return (
                            <View
                              key={ev.id || `event-${index}`}
                              {...(Platform.OS === 'web' && {
                                onMouseDown: (e) => {
                                  // Only start drag on left mouse button
                                  if (e.button === 0 && canDrag) {
                                    handleMouseDragStart(
                                      e,
                                      {
                                        eventId: ev.id,
                                        originalEventId: ev._originalId || null,
                                        dayIndex: ev._dayIndex ?? 0,
                                      },
                                      dayDateIso
                                    );
                                  }
                                },
                                onClick: (e) => {
                                  if (isPublicHoliday) return;
                                  // Handle click directly - check if it was a drag first
                                  const dragState = dragStateRef.current.get(ev.id);
                                  if (!dragState || !dragState.wasDragged) {
                                    // This was a click, not a drag
                                    e.stopPropagation();
                                    if (onEventPress) {
                                      onEventPress(ev);
                                    }
                                  } else {
                                    // Was a drag, clear the state
                                    dragStateRef.current.delete(ev.id);
                                  }
                                },
                                onContextMenu: (e) => {
                                  if (onEventRightClick) {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const nativeEvent = e.nativeEvent || e;
                                    onEventRightClick(ev, nativeEvent);
                                  }
                                },
                                // Prevent text selection during potential drag
                                onSelectStart: (e) => {
                                  if (canDrag) {
                                    e.preventDefault();
                                  }
                                },
                              })}
                              style={{
                                position: 'relative',
                                opacity: isDragging ? 0.5 : 1,
                                transform: isDragging ? [{ scale: 1.05 }] : [{ scale: 1 }],
                                ...(Platform.OS === 'web' && {
                                  cursor: isPublicHoliday ? 'default' : (isDragging ? 'grabbing' : 'pointer'),
                                  zIndex: isDragging ? 1000 : 1,
                                  userSelect: 'none', // Prevent text selection during drag
                                  WebkitUserSelect: 'none',
                                  MozUserSelect: 'none',
                                  msUserSelect: 'none',
                                }),
                              }}
                            >
                              <EventChip 
                                ev={ev} 
                                compact={true}
                                fullWidth={true}
                                disableTouchable={true}
                                onPress={undefined}
                                onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                                onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                                showCheckmark={true}
                                children={children}
                                hideDoneStyling={true}
                                allDayEvents={eventsToShow}
                              />
                            </View>
                          );
                        }
                        
                        // Native: Regular View (no drag on native)
                        return (
                          <View 
                            key={ev.id || `event-${index}`} 
                            style={{ 
                              position: 'relative',
                            }}
                          >
                            <EventChip 
                              ev={ev} 
                              compact={true}
                              fullWidth={true}
                              onPress={onEventPress && !isPublicHoliday ? () => onEventPress(ev) : undefined}
                              onRightClick={onEventRightClick ? (event, nativeEvent) => onEventRightClick(ev, nativeEvent) : undefined}
                              onComplete={onEventComplete ? () => onEventComplete(ev) : undefined}
                              showCheckmark={true}
                              children={children}
                              hideDoneStyling={true}
                              allDayEvents={eventsToShow}
                            />
                          </View>
                        );
                      });
                    })()}
                    
                    {/* Show remaining count if there are more events */}
                    {remainingCount > 0 && (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          if (onSwitchToBoardViewForDay) {
                            onSwitchToBoardViewForDay(day);
                          } else if (onSwitchToBoardView) {
                            onSwitchToBoardView();
                          }
                        }}
                        style={{
                          backgroundColor: 'rgba(156, 163, 175, 0.2)',
                          borderRadius: 4,
                          paddingHorizontal: 4,
                          paddingVertical: 2,
                          marginTop: 0,
                          alignSelf: 'flex-start',
                          flexShrink: 0,
                          ...(Platform.OS === 'web' && {
                            cursor: 'pointer',
                          }),
                        }}
                        {...(Platform.OS === 'web' && {
                          onMouseEnter: (e) => {
                            if (e.currentTarget) {
                              e.currentTarget.style.backgroundColor = 'rgba(156, 163, 175, 0.3)';
                            }
                          },
                          onMouseLeave: (e) => {
                            if (e.currentTarget) {
                              e.currentTarget.style.backgroundColor = 'rgba(156, 163, 175, 0.2)';
                            }
                          },
                        })}
                      >
                        <Text style={{ 
                          fontSize: 9, 
                          color: '#9ca3af',
                          fontWeight: '500',
                          textAlign: 'left',
                          lineHeight: 12,
                        }}>
                          +{remainingCount} {remainingCount === 1 ? 'more' : 'more'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

